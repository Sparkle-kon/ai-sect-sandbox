import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ServiceRetirementPanel } from '../src/components/ServiceRetirementPanel';
import { ServiceStipendPanel } from '../src/components/ServiceStipendPanel';
import { maintainSectPolitics } from '../src/engine/sectPoliticsEngine';
import { advanceSectStipends, resolveSectStipendAction } from '../src/engine/sectStipendEngine';
import type { WorldState } from '../src/types/world';
import {
  acceptedSectStipend, offeredSectStipend, retiredClinicGuard, stipendDecision, stipendPerson, stipendSect, stipendTurn,
} from './fixtures/sectStipendFixture';

const html = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<ServiceStipendPanel world={world} cultivator={stipendPerson(world, actorId)} />);
const profile = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<ServiceRetirementPanel world={world} cultivator={stipendPerson(world, actorId)} />);

describe('retirement stipend exact scope, handoff and non-debt payment proof', () => {
  it('adds an existing profile fold only for private entitled roles and only shows earned-service dates', () => {
    const none = retiredClinicGuard();
    expect(profile(none.world, none.recipientId)).not.toContain('退居俸养');
    const f = offeredSectStipend();
    expect(profile(f.world, f.recipientId)).toMatch(/<details class="[^"]+"><summary class="[^"]+">告老退居与自愿复出/);
    expect(profile(f.world, f.recipientId)).toMatch(/<details class="[^"]+"><summary class="[^"]+">退居俸养/);
    expect(profile(f.world, f.leaderId)).toContain('本人可查的兑付记录');
    expect(profile(f.world, f.leaderId)).not.toContain('告老退居与自愿复出');
    for (const viewer of [f.outsiderId, f.patientId, f.successorId]) expect(html(f.world, viewer)).toBe('');
    const offered = html(f.world, f.recipientId);
    expect(offered).toContain('有实际值守诊治凭据');
    expect(offered).toContain('尚未形成兑付约定，也未付款');
    expect(offered).not.toContain('各期实际兑付');
    expect(offered).not.toContain('<button');
    for (const secret of [f.stipendId, f.caseId, f.shiftId, f.retirementId, f.patientId,
      f.leaderId, stipendPerson(f.world, f.patientId).name, stipendPerson(f.world, f.leaderId).name]) {
      expect(offered).not.toContain(secret);
    }
  });

  it('distinguishes each paid 12 and unpaid 0 from the finite promise, and adds no new posthumous receipt', () => {
    const f = acceptedSectStipend();
    const { world } = f;
    const starting = html(world, f.recipientId);
    expect(starting).toContain('每约最多 3 期，每期约定 12 灵石；未付不滚成欠款');
    expect(starting).not.toContain('轮应付 12 灵石');
    world.tick++;
    advanceSectStipends(world);
    const sect = stipendSect(world, f.sectId);
    sect.spiritStones = 91;
    world.tick++;
    advanceSectStipends(world);
    const paidAndUnpaid = html(world, f.recipientId);
    expect(paidAndUnpaid.match(/轮应付 12 灵石/g)).toHaveLength(2);
    expect(paidAndUnpaid).toContain('已实付 12 灵石');
    expect(paidAndUnpaid).toContain('未付 0 灵石：宗库可动用款额不足');
    expect(paidAndUnpaid).not.toContain('91');
    const recipient = stipendPerson(world, f.recipientId);
    recipient.alive = false;
    recipient.hp = 0;
    const afterDeath = stipendTurn(world);
    const closed = html(afterDeath, f.recipientId);
    expect(closed).toContain('本约已终止');
    expect(closed).toContain('受俸人已故，不再新列应付或转付遗产');
    expect(closed.match(/轮应付 12 灵石/g)).toHaveLength(2);
  });

  it('does not mistake real election for a completed adoption or make up a missed payment', () => {
    const f = acceptedSectStipend();
    const { world } = f;
    const old = stipendPerson(world, f.leaderId);
    old.alive = false;
    old.hp = 0;
    world.tick++;
    maintainSectPolitics(world);
    const succession = stipendSect(world, f.sectId).succession!;
    advanceSectStipends(world);
    const stillOld = html(world, f.recipientId);
    expect(stillOld).toContain('换任不自动交接此约');
    expect(stillOld).not.toContain('正式承接本约');
    expect(stillOld).toContain('未付 0 灵石：没有已承接本约并在场的兑付方');

    world.tick++;
    const successor = stipendPerson(world, succession.leaderId);
    successor.locationId = f.siteId;
    expect(resolveSectStipendAction(world, successor, stipendDecision('adopt', f.stipendId))).not.toBeNull();
    advanceSectStipends(world);
    const after = html(world, f.recipientId);
    expect(after).toContain(`第 ${succession.tick} 轮换任 · 继任者于第 ${world.tick} 轮正式承接本约`);
    expect(after).toContain('已实付 12 灵石');
    expect(after).toContain('未付 0 灵石');
    expect(after).not.toContain(successor.name);
  });
});

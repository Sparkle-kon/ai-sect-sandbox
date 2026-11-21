import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SparringPanel } from '../src/components/SparringPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { SparringAgreement } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(49);
  world.tick = 15;
  const [proposer, partner, outsider] = world.cultivators;
  const site = world.locations.find(({ id }) => id === proposer.locationId)!;
  partner.locationId = outsider.locationId = site.id;
  partner.name = '实际同意对练的人';
  const agreement: SparringAgreement = {
    id: 'hidden-agreement-id', proposerId: proposer.id, partnerId: partner.id, siteId: site.id,
    offeredTick: 14, offerExpiresTick: 17, roundsPlanned: 2, status: 'offered', rounds: [],
  };
  world.sparring = { agreements: [agreement], nextId: 2 };
  const html = (actor = proposer) => renderToStaticMarkup(<SparringPanel world={world} cultivator={actor} />);
  return { world, proposer, partner, outsider, agreement, html };
}

describe('private consent and actual sparring receipts', () => {
  it('shows proposed limits, refusal and accepted readiness separately, never exposing outsiders or IDs', () => {
    const { world, proposer, partner, outsider, agreement, html } = fixture();
    const offer = html();
    expect(offer).toMatch(/<details class="[^"]+"><summary class="[^"]+">同契切磋与及时认输/);
    expect(offer).toContain('待应邀方同意 · 约定最多 2 轮 · 实际练习 0 轮');
    expect(offer).toContain('每轮每人耗 3 点灵气，实增功法熟练度至多 1 点');
    expect(offer).toContain('不产生战利品、恶行处罚或大比积分');
    expect(offer).not.toMatch(/hidden-agreement-id|<button|双方同意 Tick/);
    expect(html(partner)).toContain('本人受邀');
    expect(html(outsider)).toBe('');
    expect(renderToStaticMarkup(<SparringPanel world={world} />)).toBe('');
    agreement.status = 'declined';
    agreement.closedTick = 15;
    agreement.closedById = partner.id;
    expect(html()).toContain('应邀方已拒绝');
    expect(html()).not.toContain('双方同意 Tick');
    agreement.status = 'active';
    delete agreement.closedTick;
    delete agreement.closedById;
    agreement.acceptedTick = 15;
    agreement.deadlineTick = 20;
    world.tick = 16;
    agreement.readiness = { tick: 16, actorIds: [proposer.id] };
    expect(html()).toContain('本回合已登记就绪：本人（未等同实际练习）');
    expect(html()).toContain('实际练习 0 轮');
    expect(html()).not.toContain('实耗');
  });

  it('uses the actual recorded fatigue and capped gain; timely yield does not claim a second round', () => {
    const { world, proposer, partner, agreement, html } = fixture();
    Object.assign(agreement, { status: 'yielded', acceptedTick: 15, deadlineTick: 20,
      closedTick: 17, closedById: partner.id, readiness: { tick: 16, actorIds: [proposer.id, partner.id] } });
    agreement.rounds.push({ tick: 16, members: [{ actorId: proposer.id, qiSpent: 3, masteryGained: 0 },
      { actorId: partner.id, qiSpent: 3, masteryGained: 1 }] });
    world.tick = 17;
    const receipt = html();
    expect(receipt).toContain('及时认输，切磋停止 · 约定最多 2 轮 · 实际练习 1 轮');
    expect(receipt).toContain('本人实耗 3 点灵气 · 功法熟练度实增 0 点');
    expect(receipt).toContain('对练伙伴实耗 3 点灵气 · 功法熟练度实增 1 点');
    expect(receipt).toContain('停止 Tick #17 · 由对练伙伴发起');
    expect(receipt).not.toContain('本回合已登记就绪');
    world.tick = 16;
    expect(html()).not.toContain('及时认输，切磋停止');
    expect(html()).not.toContain('停止 Tick #17');
  });
});

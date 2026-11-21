import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { OathContractsPanel } from '../src/components/OathContractsPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator, OathArbitrationCase, OathContract } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 20;
  const [requester, provider, nominee, independent, recused, second, sameSect] = world.cultivators;
  const [site] = world.locations;
  for (const actor of [requester, provider, nominee, independent, recused, second, sameSect]) actor.locationId = site.id;
  sameSect.sectId = requester.sectId;
  independent.sectId = '';
  nominee.sectId = '';
  independent.name = '未公开见证者姓名';
  recused.name = '未公开回避人姓名';
  nominee.name = '未公开裁断者姓名';
  const original: OathContract = {
    id: 'unrendered-base-id', requesterId: requester.id, providerId: provider.id, locationId: site.id, term: 'foundation_pill',
    quantity: 1, payment: 75, collateral: 50, escrow: { payment: 75, collateral: 50 },
    offeredTick: 7, offerExpiresTick: 10, deadlineTick: 16, appealUntilTick: 21, status: 'breached',
    evidence: [{ kind: 'tender', tick: 15, actorId: provider.id, quantity: 1, requesterPresent: false, locationId: site.id }],
  };
  world.oaths.contracts = [original];
  const arbitration: OathArbitrationCase = {
    id: 'unrendered-case-id', oathId: original.id, siteId: site.id, requesterId: requester.id, providerId: provider.id,
    tenderTick: 15, openedTick: 16, joinUntilTick: 19, joinedTick: 17, expiresTick: 23, status: 'hearing',
    appointments: [
      { side: 'requester', appointeeId: recused.id, nominatedTick: 17, endedTick: 18, recusal: 'personal_tie' },
      { side: 'requester', appointeeId: nominee.id, nominatedTick: 18, acceptedTick: 19, vote: 'refund', votedTick: 20 },
      { side: 'provider', appointeeId: second.id, nominatedTick: 18, acceptedTick: 19 },
    ],
    filing: { observerId: independent.id, tick: 20 },
  };
  world.oathArbitrations = { cases: [arbitration], observations: [{ oathId: original.id, tenderTick: 15, siteId: site.id, observerIds: [independent.id] }] };
  const render = (actor?: Cultivator) => renderToStaticMarkup(<OathContractsPanel world={world} cultivator={actor} />);
  return { world, requester, provider, nominee, independent, sameSect, original, arbitration, render };
}

describe('private conflict-of-interest arbitration presentation', () => {
  it('shows one closed role-scoped docket with dated evidence and original escrow, not early restitution', () => {
    const { requester, nominee, independent, sameSect, render } = fixture();
    const html = render(requester);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">回避裁断与多方担保/);
    expect(html).toContain('裁断进行中 · 本人为需方');
    expect(html).toContain('双方已同意裁断 · Tick #17');
    expect(html).toContain('原契书当前实际托管：需方价金 75 灵石 · 供方押金 50 灵石');
    expect(html).toContain('独立见证已提交到场事实 · Tick #20；不是裁断票');
    expect(html).toContain('回避：个人关系冲突');
    expect(html).toContain('实投返还 Tick #20');
    expect(html).not.toContain('唯一结案记录');
    expect(html).not.toMatch(/未公开见证者姓名|未公开回避人姓名|未公开裁断者姓名|unrendered-.+-id|<button/);
    expect(render(nominee)).toContain('本人为受提名裁断者');
    expect(render(nominee)).not.toContain('原契书当前实际托管');
    expect(render(independent)).toContain('本人为独立见证人');
    expect(render(independent)).not.toMatch(/个人关系冲突|原契书当前实际托管/);
    expect(render(sameSect)).not.toContain('回避裁断与多方担保');
    expect(render()).not.toContain('回避裁断与多方担保');
    expect(renderToStaticMarkup(<App />)).not.toContain('回避裁断与多方担保');
  });

  it('separates an unanswered request and one actual closed disposition; never implies another asset transfer', () => {
    const { world, requester, original, arbitration, render } = fixture();
    arbitration.status = 'offered';
    delete arbitration.joinedTick;
    delete arbitration.expiresTick;
    arbitration.appointments = [];
    delete arbitration.filing;
    const pending = render(requester);
    expect(pending).toContain('待双方同意');
    expect(pending).not.toContain('双方已同意裁断');
    expect(pending).not.toContain('原契书已结算');
    world.tick = 23;
    arbitration.status = 'closed';
    arbitration.closedTick = 23;
    arbitration.disposition = 'external_settlement';
    original.status = 'excused';
    original.settledTick = 23;
    original.escrow = { payment: 0, collateral: 0 };
    const closed = render(requester);
    expect(closed.match(/唯一结案记录/g)).toHaveLength(1);
    expect(closed).toContain('唯一结案记录 · Tick #23：原契书已另行结算；本案未重复拨付。');
    arbitration.disposition = 'refund';
    expect(render(requester)).toContain('价金与押金各返原出资方，原契书已结算');
  });
});

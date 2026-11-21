import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OathContractsPanel } from '../src/components/OathContractsPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const [requester, provider, other, unrelated] = world.sects;
  const actor = world.cultivators.find(({ sectId }) => sectId === requester.id)!;
  const supplier = world.cultivators.find(({ sectId }) => sectId === provider.id)!;
  const another = world.cultivators.find(({ sectId }) => sectId === other.id)!;
  const outsider = world.cultivators.find(({ sectId }) => sectId === unrelated.id)!;
  const [where] = world.locations;
  const pending = {
    id: 'oath-a', requesterId: actor.id, providerId: supplier.id, locationId: where.id,
    term: 'foundation_pill', quantity: 2, payment: 75, collateral: 50, offeredTick: 3,
    offerExpiresTick: 6, deadlineTick: 11, appealUntilTick: 13, status: 'breached',
    escrow: { payment: 75, collateral: 50 },
    evidence: [{ tick: 10, actorId: actor.id, kind: 'tender', locationId: where.id, quantity: 2, requesterPresent: false }],
  } satisfies WorldState['oaths']['contracts'][number];
  world.oaths = { nextId: 4, contracts: [
    pending,
    { ...pending, id: 'oath-b', term: 'jade_herb', offeredTick: 2, status: 'excused', settledTick: 13,
      escrow: { payment: 0, collateral: 0 },
      appeal: { tick: 12, appellantId: actor.id, status: 'upheld', reason: '供方有到场证据。' },
      outcome: '价金与押金各返原方。' },
    { ...pending, id: 'oath-c', requesterId: another.id, providerId: outsider.id, status: 'fulfilled',
      settledTick: 8, escrow: { payment: 0, collateral: 0 }, outcome: '他宗交易收据' },
  ] };
  const markup = () => renderToStaticMarkup(<OathContractsPanel world={world} cultivator={actor} />);
  return { world, requester, provider, supplier, where, actor, markup };
}

describe('oath contracts presentation', () => {
  it('shows only selected sect contracts and separates live escrow from promised amounts', () => {
    const { requester, provider, supplier, actor, where, markup } = fixture();
    const html = markup();
    expect(html).toContain(`${requester.name} · 进行中 1 · 契书共 2`);
    expect(html).toContain('筑基丹 2 枚 · 本宗求购 · 违约');
    expect(html).toContain(`需方 ${actor.name}（${requester.name}） · 供方 ${supplier.name}（${provider.name}） · 交付地点：${where.name}`);
    expect(html).toContain('约定 75 · 当前托管 75');
    expect(html).toContain('约定 50 · 当前托管 50');
    expect(html).toContain('仍在托管：125 灵石');
    expect(html).toContain('约定 75 · 当前托管 0');
    expect(html).toContain('价金与押金各返原方');
    expect(html).not.toContain('他宗交易收据');
    expect(html).not.toContain('<button');
  });

  it('exposes deadline, an attempted delivery, and the actual appeal outcome without inferring acceptance', () => {
    const { actor, markup } = fixture();
    const html = markup();
    expect(html).toContain('履约截止');
    expect(html).toContain('申诉截止');
    expect(html).toContain('Tick #13');
    expect(html).toContain('曾到场尝试交付');
    expect(html).toContain('需方不在场');
    expect(html).not.toContain('已交付');
    expect(html).toContain('未记录申诉决定');
    expect(html).toContain(`Tick #12 · ${actor.name}`);
    expect(html).toContain('申诉成立：供方有到场证据。');
  });

  it('labels no selection or affiliation and can inspect the provider perspective', () => {
    const { world, actor, supplier, markup } = fixture();
    const untouched = renderToStaticMarkup(<OathContractsPanel world={world} cultivator={undefined} />);
    expect(untouched).toContain('选中修士后查看');
    actor.sectId = '';
    expect(markup()).toContain('无所属宗门');
    const supplierView = renderToStaticMarkup(<OathContractsPanel world={world} cultivator={supplier} />);
    expect(supplierView).toContain('本宗供应 · 违约');
    expect(supplierView).not.toContain('本宗求购');
  });
});

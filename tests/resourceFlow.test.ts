import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  createResourceFlowState, flowActor, flowOath, flowOrder, flowRelocation, flowSect, flowShipment, flowSite,
  openResourceFlowMonth, projectResourceFlowMonth, recordResourceFlow, resourceFlowAccountDelta, resourceFlowNet,
  RESOURCE_FLOW_DETAIL_LIMIT, RESOURCE_FLOW_MONTH_LIMIT,
} from '../src/engine/resourceFlowEngine';
import type { ResourceFlowDraft, ResourceFlowGood } from '../src/types/world';

const observer = { kind: 'observer' } as const;
const metadata = { mechanism: 'market', refId: 'shipment-fixture', reason: 'shipment_fixture',
  good: 'stone', visibility: observer } as const;
const worldFixture = () => {
  const world = createInitialWorld();
  world.resourceFlow = createResourceFlowState();
  return world;
};

describe('resource movement journal', () => {
  it('represents each transfer once and net changes with independent source and sink kinds without modifying inventory', () => {
    const world = worldFixture();
    const actor = flowActor(world.cultivators[0].id);
    const order = flowOrder('order-test');
    const shipment = flowShipment('caravan-test');
    const sect = flowSect(world.sects[0].id);
    const state = structuredClone(world);
    const draft: ResourceFlowDraft[] = [
      { ...metadata, kind: 'production', to: sect, amount: 100 },
      { ...metadata, kind: 'transfer', from: sect, to: actor, amount: 20 },
      { ...metadata, kind: 'transfer', from: actor, to: order, amount: 10 },
      { ...metadata, kind: 'transfer', from: order, to: shipment, amount: 6 },
      { ...metadata, kind: 'transfer', from: order, to: actor, amount: 4 },
      { ...metadata, kind: 'transfer', from: shipment, to: actor, amount: 6 },
      { ...metadata, kind: 'consumption', from: sect, amount: 5 },
      { ...metadata, kind: 'loss', from: actor, amount: 1 },
      { ...metadata, kind: 'production', good: 'jade_leaf', to: flowSite('site-test'), amount: 1.25 },
    ];
    draft.forEach(row => recordResourceFlow(world, row));
    const view = projectResourceFlowMonth(world, world.tick, observer)!;
    expect(view).toMatchObject({ closed: false, omittedEntries: 0, partial: false });
    expect(view.rows.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const stones = view.totals.find(({ good }) => good === 'stone')!;
    expect(stones).toEqual({ good: 'stone', transfer: 46, production: 100, consumption: 5, loss: 1 });
    expect(resourceFlowNet(stones)).toBe(94);
    const signedDelta = view.rows.filter(({ good }) => good === 'stone');
    const changes = [sect, actor, order, shipment].map(account =>
      signedDelta.reduce((sum, row) => sum + resourceFlowAccountDelta(row, account), 0));
    expect(changes).toEqual([75, 19, 0, 0]);
    expect(changes.reduce((a, b) => a + b)).toBe(resourceFlowNet(stones));
    expect(view.totals.find(({ good }) => good === 'jade_leaf')?.production).toBe(1.25);
    expect({ ...world, resourceFlow: state.resourceFlow }).toEqual(state);
  });

  it('keeps distinct contract pockets and migration custody, and skips zero, malformed and same-account postings', () => {
    const world = worldFixture();
    const from = flowOath('oath-test', 'payment');
    const to = flowOath('oath-test', 'collateral');
    for (const amount of [0, -1, NaN, Infinity]) recordResourceFlow(world, { ...metadata, kind: 'transfer', from, to, amount });
    recordResourceFlow(world, { ...metadata, kind: 'transfer', from, to: from, amount: 12 });
    recordResourceFlow(world, { ...metadata, kind: 'transfer', from, to, amount: 12, reason: 'arbitrary prose' });
    recordResourceFlow(world, { ...metadata, kind: 'transfer', from, to, amount: 12, visibility: { kind: 'known_sites', siteIds: [] } });
    recordResourceFlow(world, { ...metadata, kind: 'transfer', from, to, amount: 12, visibility: { kind: 'participants', actorIds: ['dup', 'dup'] } });
    expect(world.resourceFlow).toEqual(createResourceFlowState());
    recordResourceFlow(world, { ...metadata, kind: 'transfer', from, to, amount: 12 });
    recordResourceFlow(world, { ...metadata, kind: 'transfer', from: flowRelocation('plan'), to: flowSect('sect'), amount: 2 });
    const rows = projectResourceFlowMonth(world, world.tick, observer)!.rows;
    expect(rows).toHaveLength(2);
    expect(resourceFlowAccountDelta(rows[0], from)).toBe(-12);
    expect(resourceFlowAccountDelta(rows[0], to)).toBe(12);
    expect(rows[1]).toMatchObject({ from: { kind: 'relocation', id: 'plan' }, to: { kind: 'sect', id: 'sect' } });
  });

  it('preserves every monthly total at 526 movements with bounded details and explicit omission', () => {
    const world = worldFixture();
    const target = flowSite('site-test');
    const count = 526;
    for (let i = 0; i < count; i++) {
      const good: ResourceFlowGood = i % 2 ? 'earth_root' : 'stone';
      recordResourceFlow(world, { ...metadata, kind: 'production', good, amount: 2, to: target });
    }
    const view = projectResourceFlowMonth(world, world.tick, observer)!;
    expect(view.rows).toHaveLength(RESOURCE_FLOW_DETAIL_LIMIT);
    expect(view.rows[0].id).toBe(count - RESOURCE_FLOW_DETAIL_LIMIT + 1);
    expect(view.rows.at(-1)?.id).toBe(count);
    expect(view.totals.map(({ production }) => production)).toEqual([count, count]);
    expect(view.omittedEntries).toBe(count - RESOURCE_FLOW_DETAIL_LIMIT);
    expect(view.partial).toBe(true);
    expect(world.resourceFlow.nextId).toBe(count + 1);
  });

  it('opens empty months once, closes older months, and prunes by calendar tick without synthesizing missing months', () => {
    const world = worldFixture();
    const start = world.tick;
    expect(projectResourceFlowMonth(world, start, observer)).toBeUndefined();
    const m = openResourceFlowMonth(world);
    expect(openResourceFlowMonth(world)).toBe(m);
    expect(projectResourceFlowMonth(world, start, observer)).toMatchObject({ rows: [], totals: [], closed: false });
    for (let i = 1; i <= RESOURCE_FLOW_MONTH_LIMIT; i++) {
      world.tick = start + i;
      openResourceFlowMonth(world);
    }
    expect(world.resourceFlow.months).toHaveLength(RESOURCE_FLOW_MONTH_LIMIT);
    expect(projectResourceFlowMonth(world, start, observer)).toBeUndefined();
    expect(projectResourceFlowMonth(world, start + 1, observer)).toMatchObject({ closed: true });
    const away = world.tick += RESOURCE_FLOW_MONTH_LIMIT + 2;
    openResourceFlowMonth(world);
    expect(world.resourceFlow.months.map(({ tick }) => tick)).toEqual([away]);
    expect(projectResourceFlowMonth(world, away - 1, observer)).toBeUndefined();
  });

  it('suppresses observer-only, other-participant and unknown multi-site rows and all hidden summary counts for actor scope', () => {
    const world = worldFixture();
    const from = flowActor('one'), to = flowOrder('order-privacy');
    const base = { ...metadata, kind: 'transfer', from, to, amount: 2 } as const;
    recordResourceFlow(world, base);
    recordResourceFlow(world, { ...base, good: 'jade_leaf', visibility: { kind: 'participants', actorIds: ['other'] } });
    recordResourceFlow(world, { ...base, good: 'earth_root', visibility: { kind: 'participants', actorIds: ['one'] } });
    recordResourceFlow(world, { ...base, good: 'star_bloom', visibility: { kind: 'known_sites', siteIds: ['visible', 'unknown'] } });
    recordResourceFlow(world, { ...base, good: 'shadow_moss', visibility: { kind: 'known_sites', siteIds: ['visible'] } });
    const scoped = projectResourceFlowMonth(world, world.tick, { kind: 'actor', actorId: 'one', visibleSiteIds: new Set(['visible']) })!;
    expect(scoped.rows.map(({ good }) => good)).toEqual(['earth_root', 'shadow_moss']);
    expect(scoped.rows.map(({ id }) => id)).toEqual([1, 2]); // No ordinals from omitted transactions.
    expect(scoped.totals.map(({ good }) => good)).toEqual(['earth_root', 'shadow_moss']);
    expect(scoped.rows).not.toContainEqual(expect.objectContaining({ good: 'star_bloom' }));
    expect(scoped).toMatchObject({ partial: true, closed: false });
    expect(scoped).not.toHaveProperty('omittedEntries');
    expect(scoped).not.toHaveProperty('totalEntries');
    expect(projectResourceFlowMonth(world, world.tick, observer)!.rows).toHaveLength(5);
  });

  it('copies caller identities and yields deterministic sibling histories without cross-branch mutation', () => {
    const world = worldFixture();
    const from = flowActor('actor-copy'), to = flowOrder('order-copy');
    const actorIds = ['party-before'];
    const draft: ResourceFlowDraft = {
      ...metadata, kind: 'transfer', from, to, amount: 3, visibility: { kind: 'participants', actorIds },
    };
    recordResourceFlow(world, draft);
    const a = structuredClone(world), b = structuredClone(world);
    from.id = 'mutated-from';
    actorIds[0] = 'mutated-party';
    expect(world.resourceFlow.months[0].entries[0]).toMatchObject({
      from: { kind: 'actor', id: 'actor-copy' }, visibility: { kind: 'participants', actorIds: ['party-before'] },
    });
    for (const branch of [a, b]) {
      branch.tick++;
      recordResourceFlow(branch, { ...metadata, kind: 'production', to: flowSite('site-branch'), amount: 6 });
    }
    expect(a.resourceFlow).toEqual(b.resourceFlow);
    expect(a.resourceFlow.nextId).toBe(3);
    expect(world.resourceFlow.nextId).toBe(2);
    expect(world.resourceFlow.months).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceCausalChronicle, buildCausalChronicleChain, CAUSAL_CHRONICLE_MAX_NODES,
  causalChronicleEventId, recordCausalChronicleNode, visibleCausalChronicle } from '../src/engine/chronicleCausalityEngine';
import type { CausalChronicleNodeInput } from '../src/engine/chronicleCausalityEngine';
import { createTimeline, forkTimeline, readTimelineHead, selectTimelineBranch } from '../src/engine/timelineEngine';
import type { WorldEvent, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(71);
  const [viewer] = world.cultivators;
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  const hidden = world.locations.find(({ id }) => id === 'loc-blood')!;
  viewer.locationId = site.id;
  const fact = (id: string, locationId = site.id): WorldEvent => ({ id, tick: world.tick, year: world.year, month: world.month,
    title: '同名真实记录', description: '同名正文不能用作关联凭证', category: 'diplomacy', actorIds: [viewer.id], locationId });
  const emit = (id: string, input: CausalChronicleNodeInput, locationId?: string) => {
    const row = fact(id, locationId);
    recordCausalChronicleNode(world, row, input);
    world.events.unshift(row);
    return row;
  };
  return { world, viewer, site, hidden, fact, emit };
}

describe('typed public reverse chronicle', () => {
  it('links same-titled real events only by role, identity and canonical capture order', () => {
    const { world, viewer, emit } = fixture();
    const bid = emit('evt-bid-a', { kind: 'market_buy_order', entityId: 'order-1' });
    const ask = emit('evt-ask-b', { kind: 'market_sell_order', entityId: 'order-2' });
    const other = emit('evt-bid-uncited', { kind: 'market_buy_order', entityId: 'order-3' });
    const depart = emit('evt-depart-z', { kind: 'market_shipment', entityId: 'caravan-5',
      predecessors: [{ relation: 'matched_sell_order', eventId: bid.id }, { relation: 'matched_buy_order', eventId: bid.id },
        { relation: 'matched_buy_order', eventId: other.id }, { relation: 'matched_sell_order', eventId: ask.id }] });
    const alternate = emit('evt-depart-lookalike', { kind: 'market_shipment', entityId: 'caravan-6' });
    const premature = emit('evt-premature', { kind: 'market_settlement', entityId: 'caravan-5', outcome: 'delivered',
      predecessors: [{ relation: 'settled_shipment', eventId: depart.id }] });
    expect(world.chronicleCausality.nodes.find(({ eventId }) => eventId === premature.id)?.predecessors).toEqual([]);
    world.tick++;
    const delivery = emit('evt-settle-e', { kind: 'market_settlement', entityId: 'caravan-5', outcome: 'delivered',
      predecessors: [{ relation: 'settled_shipment', eventId: alternate.id }, { relation: 'settled_shipment', eventId: depart.id }] });
    const chain = buildCausalChronicleChain(world, delivery.id, viewer.id)!;
    expect(chain.entry).toEqual({ eventId: delivery.id, tick: world.tick, kind: 'market_settlement', outcome: 'delivered' });
    expect(chain.previous.map(({ relation, node }) => [relation, node.entry.eventId])).toEqual([['settled_shipment', depart.id]]);
    expect(chain.previous[0].node.previous.map(({ relation, node }) => [relation, node.entry.eventId]))
      .toEqual([['matched_buy_order', bid.id], ['matched_sell_order', ask.id]]);
    expect(JSON.stringify(chain)).not.toContain('caravan-5');
    expect(JSON.stringify(chain)).not.toContain('同名');
  });

  it('omits unproved, private, duplicate and fogged links without substituting names or recent records', () => {
    const { world, viewer, hidden, fact, emit } = fixture();
    const missing = 'evt-missing';
    const privateEvent = { ...fact('evt-private'), witnessScope: 'participants' as const };
    recordCausalChronicleNode(world, privateEvent, { kind: 'siege_launched', entityId: 'secret-army' });
    expect(world.chronicleCausality.nodes).toHaveLength(0);
    const publicSiege = emit('evt-siege-real', { kind: 'siege_launched', entityId: 'siege-a' }, hidden.id);
    const soonPrivate = emit('evt-siege-followed', { kind: 'siege_launched', entityId: 'siege-b' });
    world.tick++;
    const terminal = emit('evt-sign-real', { kind: 'truce_signed', entityId: 'truce-a', outcome: 'truce_with_withdrawal',
      predecessors: [missing, privateEvent.id, publicSiege.id, soonPrivate.id].map((eventId) => ({ relation: 'withdrew_siege', eventId })) });
    expect(world.chronicleCausality.nodes.at(-1)?.predecessors).toHaveLength(2);
    const lookup = () => buildCausalChronicleChain(world, terminal.id, viewer.id);
    expect(lookup()?.previous.map(({ node }) => node.entry.eventId)).toEqual([soonPrivate.id]);
    world.events.unshift({ ...soonPrivate, witnessScope: 'participants' });
    expect(lookup()).toEqual({ entry: { eventId: terminal.id, tick: world.tick, kind: 'truce_signed', outcome: 'truce_with_withdrawal' }, previous: [] });
    const future = { ...terminal, tick: world.tick + 1 };
    world.events.unshift(future);
    expect(lookup()).toBeUndefined();
    expect(causalChronicleEventId(world, 'truce_signed', 'truce-a')).toBeUndefined();
    expect(visibleCausalChronicle(world, viewer.id)).toEqual([]);
  });

  it('retains an actual tracked predecessor through late feed eviction and bounded proof rotation in a 526-person fixture', () => {
    const { world, viewer, emit, fact } = fixture();
    for (let n = world.cultivators.length; n < 526; n++) {
      const actor = structuredClone(viewer);
      world.cultivators.push({ ...actor, id: `causal-roster-${n}`, artifacts: [], memories: [], rumors: [] });
    }
    const bid = emit('evt-active-bid', { kind: 'market_buy_order', entityId: 'order-1' });
    const ask = emit('evt-active-ask', { kind: 'market_sell_order', entityId: 'order-2' });
    const depart = emit('evt-active-caravan', { kind: 'market_shipment', entityId: 'caravan-3',
      predecessors: [{ eventId: bid.id, relation: 'matched_buy_order' }, { eventId: ask.id, relation: 'matched_sell_order' }] });
    world.markets.shipments.push({ id: 'caravan-3', sequence: 3, buyerId: viewer.id, sellerId: world.cultivators[1].id,
      originId: viewer.locationId, destinationId: world.cultivators[1].locationId, buyOrderId: 'order-1', sellOrderId: 'order-2',
      status: 'in_transit', good: 'jade_leaf', quantity: 1, unitPrice: 1, departedTick: world.tick, arrivalTick: world.tick + 4 });
    for (let n = 0; n < CAUSAL_CHRONICLE_MAX_NODES + 30; n++) {
      emit(`evt-nontarget-${n}`, { kind: 'market_buy_order', entityId: `other-trade-${n}` });
    }
    world.events = world.cultivators.flatMap((actor, n) => [{ ...fact(`evt-noise-${n}`), actorIds: [actor.id] }]).slice(0, 120);
    advanceCausalChronicle(world);
    expect(world.cultivators).toHaveLength(526);
    expect(world.events.some(({ id }) => id === depart.id)).toBe(false);
    expect(world.chronicleCausality.nodes).toHaveLength(CAUSAL_CHRONICLE_MAX_NODES);
    world.tick++;
    const end = emit('evt-terminal-after-raw-eviction', { kind: 'market_settlement', entityId: 'caravan-3', outcome: 'route_loss',
      predecessors: [{ eventId: depart.id, relation: 'settled_shipment' }] });
    const graph = buildCausalChronicleChain(world, end.id, viewer.id);
    expect(graph?.previous[0].node.previous.map(({ node }) => node.entry.eventId)).toEqual([bid.id, ask.id]);
    expect(graph?.entry.outcome).toBe('route_loss');
  });

  it('preserves original branch evidence while omitting new or missing predecessors on a fork', () => {
    const { world, viewer, emit } = fixture();
    const vacancy = emit('evt-seat-empty', { kind: 'sect_vacancy', entityId: viewer.sectId });
    const original = createTimeline(world);
    const fork = forkTimeline(original, world.tick, { type: 'SPAWN_TREASURE', targetLocationId: viewer.locationId });
    const divergent = readTimelineHead(fork)!;
    const event: WorldEvent = { ...vacancy, id: 'evt-only-fork-election' };
    recordCausalChronicleNode(divergent, event, { kind: 'sect_election', entityId: viewer.sectId, outcome: 'elected',
      predecessors: [{ relation: 'filled_vacancy', eventId: vacancy.id }] });
    expect(buildCausalChronicleChain(divergent, event.id, viewer.id)?.previous[0].node.entry.eventId).toBe(vacancy.id);
    const unchanged: WorldState = readTimelineHead(selectTimelineBranch(fork, 'main'))!;
    expect(buildCausalChronicleChain(unchanged, event.id, viewer.id)).toBeUndefined();
    expect(original.branches[0].snapshots[0].world.chronicleCausality.nodes).toHaveLength(1);
  });
});

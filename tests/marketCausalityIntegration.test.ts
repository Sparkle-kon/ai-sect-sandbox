import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceMarkets, marketClosureReason, resolveMarketAction } from '../src/engine/marketEngine';
import type { Cultivator, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(9);
  const west = world.locations.find(({ type }) => type === 'market')!;
  const east = { ...west, id: 'causality-east', name: '东坊', x: 820, y: 490, herbs: { ...west.herbs } };
  world.locations.push(east);
  const [buyer, seller, unrelated] = world.cultivators;
  for (const party of [buyer, seller, unrelated]) {
    party.locationId = west.id;
    party.spiritStones = 1000;
    party.pills.foundation = 0;
  }
  seller.pills.foundation = 2;
  unrelated.pills.foundation = 2;
  const publish = (event: WorldEvent) => { world.events.unshift(event); return event; };
  const place = (actor: Cultivator, side: 'buy' | 'sell', price: number) => {
    const fact = resolveMarketAction(world, actor, { innerMonologue: '挂单', chosenAction: side === 'buy' ? 'PLACE_MARKET_BUY' : 'PLACE_MARKET_SELL',
      marketGood: 'foundation', marketQuantity: 2, marketLimitPrice: price });
    if (!fact) throw Error('fixture order must be accepted');
    return publish(fact);
  };
  const advance = () => advanceMarkets(world).map(publish);
  const node = (event: WorldEvent) => world.chronicleCausality.nodes.find(({ eventId }) => eventId === event.id);
  return { world, west, east, buyer, seller, unrelated, place, advance, node };
}

describe('market causality from actual escrow and receipts', () => {
  it('links exactly the winning buy and sell IDs, not an older unfilled order with the same public title', () => {
    const { world, buyer, seller, unrelated, place, advance, node } = fixture();
    const unrelatedSell = place(unrelated, 'sell', 200);
    const sell = place(seller, 'sell', 20);
    const buy = place(buyer, 'buy', 30);
    const [filled] = advance();
    expect(unrelatedSell.title).toBe(sell.title);
    expect(node(sell)?.kind).toBe('market_sell_order');
    expect(node(buy)?.kind).toBe('market_buy_order');
    expect(node(filled)).toMatchObject({ kind: 'market_settlement', outcome: 'local_fill',
      entityId: world.markets.receipts[0].id, predecessors: [
        { relation: 'matched_buy_order', eventId: buy.id },
        { relation: 'matched_sell_order', eventId: sell.id },
      ] });
    expect(buyer.pills.foundation).toBe(2);
    expect(seller.spiritStones).toBe(1040);
    expect(advance()).toEqual([]);
    expect(world.chronicleCausality.nodes.filter(({ kind }) => kind === 'market_settlement')).toHaveLength(1);
  });

  it('keeps a genuine settlement but does not invent an edge to an unregistered legacy order in the public feed', () => {
    const { world, buyer, seller, place, advance, node } = fixture();
    const unregistered = place(seller, 'sell', 20);
    world.chronicleCausality.nodes = [];
    const current = place(buyer, 'buy', 30);
    const [settled] = advance();
    expect(world.events.some(({ id }) => id === unregistered.id)).toBe(true);
    expect(node(settled)).toMatchObject({ outcome: 'local_fill',
      predecessors: [{ eventId: current.id, relation: 'matched_buy_order' }] });
    expect(buyer.pills.foundation).toBe(2);
  });

  it.each(['delivered', 'endpoint_missing'] as const)('links a genuine cross-market %s to the same held shipment without repeating payout', (outcome) => {
    const { world, west, east, buyer, seller, place, advance, node } = fixture();
    seller.locationId = east.id;
    const buy = place(buyer, 'buy', 30);
    const sell = place(seller, 'sell', 20);
    const [departed] = advance();
    const [shipment] = world.markets.shipments;
    expect(node(departed)).toMatchObject({ kind: 'market_shipment', entityId: shipment.id, predecessors: [
      { relation: 'matched_buy_order', eventId: buy.id },
      { relation: 'matched_sell_order', eventId: sell.id },
    ] });
    expect(advance()).toEqual([]);
    expect(buyer.pills.foundation).toBe(0);
    expect(seller.spiritStones).toBe(1000);
    if (outcome === 'endpoint_missing') world.locations = world.locations.filter(({ id }) => id !== east.id);
    world.tick = shipment.arrivalTick;
    if (outcome === 'delivered' && marketClosureReason(world, west.id)) world.tick++;
    const [settled] = advance();
    expect(node(settled)).toMatchObject({ kind: 'market_settlement', entityId: shipment.id, outcome,
      predecessors: [{ eventId: departed.id, relation: 'settled_shipment' }] });
    expect(buyer.pills.foundation).toBe(outcome === 'delivered' ? 2 : 0);
    expect(seller.spiritStones).toBe(outcome === 'delivered' ? 1060 : 1000);
    expect(buyer.spiritStones).toBe(outcome === 'delivered' ? 940 : 1000);
    expect(advance()).toEqual([]);
    expect(world.chronicleCausality.nodes.filter(({ kind }) => kind === 'market_settlement')).toHaveLength(1);
  });
});

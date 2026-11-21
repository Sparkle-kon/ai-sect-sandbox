import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceMarkets, availableMarketActions, createMarketState, marketClosureReason, marketOrdersInPriority, resolveMarketAction } from '../src/engine/marketEngine';
import { flowActor, flowOrder, flowShipment } from '../src/engine/resourceFlowEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, LocationNode } from '../src/types/world';

function fixture(seed = 9) {
  const world = createInitialWorld(seed);
  world.markets = createMarketState();
  const west = world.locations.find(({ type }) => type === 'market')!;
  const east: LocationNode = { ...west, id: 'test-east', name: '东坊', x: 820, y: 490, herbs: { ...west.herbs } };
  world.locations = [...world.locations.filter((place) => place.type !== 'market'), west, east];
  const [buyer, seller, rival, alternate] = world.cultivators;
  for (const party of [buyer, seller, rival, alternate]) {
    party.locationId = west.id;
    party.spiritStones = 1000;
    party.pills.foundation = 0;
  }
  const place = (actor: Cultivator, side: 'buy' | 'sell', quantity: number, price: number) =>
    resolveMarketAction(world, actor, { innerMonologue: '测试挂单', chosenAction: side === 'buy' ? 'PLACE_MARKET_BUY' : 'PLACE_MARKET_SELL',
      marketGood: 'foundation', marketQuantity: quantity, marketLimitPrice: price });
  const cancel = (actor: Cultivator, id: string) => resolveMarketAction(world, actor,
    { innerMonologue: '测试撤单', chosenAction: 'CANCEL_MARKET_ORDER', targetMarketOrderId: id });
  const total = () => ({
    stones: [buyer, seller, rival, alternate].reduce((a, actor) => a + actor.spiritStones, 0) +
      world.markets.orders.reduce((a, order) => a + order.escrowStones, 0) +
      world.markets.shipments.reduce((a, c) => a + (c.status === 'in_transit' ? c.quantity * c.unitPrice : 0), 0),
    goods: [buyer, seller, rival, alternate].reduce((a, actor) => a + actor.pills.foundation, 0) +
      world.markets.orders.reduce((a, order) => a + order.escrowGoods, 0) +
      world.markets.shipments.reduce((a, c) => a + (c.status === 'in_transit' || c.status === 'lost' ? c.quantity : 0), 0),
  });
  return { world, buyer, seller, rival, alternate, west, east, place, cancel, total };
}

const flows = (world: ReturnType<typeof createInitialWorld>) => world.resourceFlow.months.flatMap(({ entries }) => entries);

describe('regional order books and bonded convoys', () => {
  it('matches by price then insertion sequence, uses older limit, and returns only residual escrow once', () => {
    const { world, buyer, seller, rival, alternate, place, cancel, total } = fixture();
    seller.pills.foundation = 2; rival.pills.foundation = 2; alternate.pills.foundation = 2;
    expect(place(seller, 'sell', 2, 20)).not.toBeNull();
    expect(place(rival, 'sell', 2, 10)).not.toBeNull();
    expect(place(alternate, 'sell', 2, 10)).not.toBeNull();
    expect(place(buyer, 'buy', 3, 22)).not.toBeNull();
    expect(marketOrdersInPriority(world.markets.orders, 'sell').map(({ actorId }) => actorId)).toEqual([rival.id, alternate.id, seller.id]);
    expect(buyer.spiritStones).toBe(934);
    expect(advanceMarkets(world)).toHaveLength(2);
    expect(world.markets.receipts.map(({ sellerId, quantity, unitPrice }) => ({ sellerId, quantity, unitPrice }))).toEqual([
      { sellerId: rival.id, quantity: 2, unitPrice: 10 }, { sellerId: alternate.id, quantity: 1, unitPrice: 10 },
    ]);
    expect(buyer.spiritStones).toBe(970);
    expect(buyer.pills.foundation).toBe(3);
    const residual = world.markets.orders.find(({ actorId }) => actorId === alternate.id)!;
    expect(residual).toMatchObject({ status: 'open', remaining: 1, escrowGoods: 1 });
    expect(cancel(buyer, residual.id)).toBeNull();
    expect(cancel(alternate, residual.id)).not.toBeNull();
    expect(cancel(alternate, residual.id)).toBeNull();
    expect(alternate.pills.foundation).toBe(1);
    expect(advanceMarkets(world)).toEqual([]);
    expect(total()).toEqual({ stones: 4000, goods: 6 });
    const entries = flows(world);
    expect(entries.map(({ reason, amount }) => [reason, amount])).toEqual([
      ['order_deposit', 2], ['order_deposit', 2], ['order_deposit', 2], ['order_deposit', 66],
      ['price_improvement', 24], ['local_fill', 20], ['local_fill', 2],
      ['price_improvement', 12], ['local_fill', 10], ['local_fill', 1],
      ['order_release', 1],
    ]);
    expect(entries[3]).toMatchObject({ good: 'stone', from: flowActor(buyer.id), to: flowOrder('order-4'),
      visibility: { kind: 'participants', actorIds: [buyer.id] } });
    expect(entries[4].visibility).toEqual({ kind: 'participants', actorIds: [buyer.id] });
    expect(entries[5]).toMatchObject({ good: 'stone', from: flowOrder('order-4'), to: flowActor(rival.id) });
    expect(entries[10]).toMatchObject({ good: 'foundation', refId: residual.id, from: flowOrder(residual.id),
      to: flowActor(alternate.id), visibility: { kind: 'participants', actorIds: [alternate.id] } });
  });

  it('rejects unfunded, illegal, or closed placement, prevents self-trade, expires and releases escrow', () => {
    const { world, buyer, seller, west, place } = fixture();
    expect(place(seller, 'sell', 1, 20)).toBeNull();
    expect(place(buyer, 'buy', 13, 1)).toBeNull();
    expect(place(buyer, 'buy', 4, 400)).toBeNull();
    expect(place(buyer, 'buy', 1, 2.5)).toBeNull();
    seller.pills.foundation = 1;
    seller.locationId = world.sects[0].headquartersId;
    expect(place(seller, 'sell', 1, 20)).toBeNull();
    seller.locationId = west.id;
    const offset = Math.floor((west.x + west.y) / 90) % 7;
    world.tick = 13 - offset;
    expect(marketClosureReason(world, west.id)).toBeTruthy();
    expect(availableMarketActions(seller, world)).toEqual([]);
    expect(place(seller, 'buy', 1, 20)).toBeNull();
    world.tick += 1;
    expect(place(seller, 'buy', 1, 20)).not.toBeNull();
    expect(place(seller, 'sell', 1, 20)).not.toBeNull();
    expect(advanceMarkets(world)).toEqual([]);
    expect(world.markets.orders.every((order) => order.status === 'open')).toBe(true);
    world.tick = world.markets.orders[0].expiresTick;
    expect(advanceMarkets(world)).toHaveLength(2);
    expect(advanceMarkets(world)).toEqual([]);
    expect(seller.pills.foundation).toBe(1);
    expect(seller.spiritStones).toBe(1000);
    expect(flows(world).filter(({ reason }) => reason === 'order_release').map(({ good, amount }) => [good, amount])).toEqual([
      ['stone', 20], ['foundation', 1],
    ]);
  });

  it('delays delivery and seller payout during a genuine journey and waits through closure', () => {
    const { world, buyer, seller, west, east, place, total } = fixture();
    seller.locationId = east.id;
    seller.pills.foundation = 2;
    place(buyer, 'buy', 2, 30);
    place(seller, 'sell', 2, 20);
    expect(advanceMarkets(world)[0]?.title).toBe('跨坊商队启程');
    const caravan = world.markets.shipments[0];
    expect(caravan).toMatchObject({ unitPrice: 30, quantity: 2, originId: east.id, destinationId: west.id });
    expect(caravan.arrivalTick).toBeGreaterThan(caravan.departedTick + 1);
    expect(buyer.pills.foundation).toBe(0);
    expect(seller.spiritStones).toBe(1000);
    expect(total()).toEqual({ stones: 4000, goods: 2 });
    const tile = terrainTileAt(world, west.x, west.y)!;
    world.mapHazards.push({ id: 'closure', kind: 'cursed_miasma', tileId: tile.id,
      createdTick: caravan.arrivalTick, expiresTick: caravan.arrivalTick + 1, intensity: 1 });
    world.tick = caravan.arrivalTick;
    expect(advanceMarkets(world)).toEqual([]);
    expect(caravan.status).toBe('in_transit');
    world.tick += 1;
    expect(advanceMarkets(world)[0]?.title).toBe('商队到货结算');
    expect(caravan.status).toBe('delivered');
    expect(buyer.pills.foundation).toBe(2);
    expect(seller.spiritStones).toBe(1060);
    expect(advanceMarkets(world)).toEqual([]);
    expect(total()).toEqual({ stones: 4000, goods: 2 });
    expect(flows(world).filter(({ refId }) => refId === caravan.id)).toMatchObject([
      { reason: 'shipment_departure', good: 'stone', amount: 60, from: flowOrder(caravan.buyOrderId), to: flowShipment(caravan.id) },
      { reason: 'shipment_departure', good: 'foundation', amount: 2, from: flowOrder(caravan.sellOrderId), to: flowShipment(caravan.id) },
      { reason: 'shipment_delivery', good: 'stone', amount: 60, from: flowShipment(caravan.id), to: flowActor(seller.id) },
      { reason: 'shipment_delivery', good: 'foundation', amount: 2, from: flowShipment(caravan.id), to: flowActor(buyer.id) },
    ]);
  });

  it('records seeded lost cargo only on a threatened segment and refunds payment exactly once', () => {
    let failures = 0;
    let arrivals = 0;
    for (let seed = 0; seed < 25; seed++) {
      const { world, buyer, seller, west, east, place, total } = fixture(seed);
      seller.locationId = east.id;
      seller.pills.foundation = 3;
      place(buyer, 'buy', 3, 30);
      place(seller, 'sell', 3, 20);
      advanceMarkets(world);
      const caravan = world.markets.shipments[0];
      world.tick += 1;
      const progress = .5 / (caravan.arrivalTick - caravan.departedTick);
      const tile = terrainTileAt(world, east.x + (west.x - east.x) * progress, east.y)!;
      world.mapHazards.push({ id: 'road-tide', kind: 'beast_tide', tileId: tile.id, createdTick: world.tick, expiresTick: world.tick + 1, intensity: 4 });
      advanceMarkets(world);
      if (caravan.status === 'lost') {
        ++failures;
        expect(world.markets.receipts[0]).toMatchObject({ shipmentId: caravan.id, status: 'lost', quantity: 3 });
        expect(buyer.spiritStones).toBe(1000);
        expect(seller.pills.foundation).toBe(0);
        expect(advanceMarkets(world)).toEqual([]);
        const terminal = flows(world).filter(({ reason }) => reason === 'shipment_loss' || reason === 'shipment_refund');
        const participantIds = [buyer.id, seller.id].sort();
        expect(terminal).toMatchObject([
          { kind: 'transfer', good: 'stone', amount: 90, from: flowShipment(caravan.id), to: flowActor(buyer.id) },
          { kind: 'loss', good: 'foundation', amount: 3, from: flowShipment(caravan.id) },
        ]);
        expect(terminal.every(({ visibility }) => visibility.kind === 'participants' &&
          [...visibility.actorIds].sort().join(',') === participantIds.join(','))).toBe(true);
        expect('to' in terminal[1]).toBe(false);
      } else {
        world.tick = caravan.arrivalTick + 1;
        advanceMarkets(world);
        expect(caravan.status).toBe('delivered');
        ++arrivals;
      }
      expect(total()).toEqual({ stones: 4000, goods: 3 });
    }
    expect(failures).toBeGreaterThan(0);
    expect(arrivals).toBeGreaterThan(0);
  });

  it('returns intact funds and cargo after long closure without paying the seller', () => {
    const { world, buyer, seller, west, east, place, total } = fixture();
    seller.locationId = east.id;
    seller.pills.foundation = 2;
    place(buyer, 'buy', 2, 30);
    place(seller, 'sell', 2, 20);
    advanceMarkets(world);
    const caravan = world.markets.shipments[0];
    world.mapHazards.push({ id: 'closure', kind: 'cursed_miasma', tileId: terrainTileAt(world, west.x, west.y)!.id,
      createdTick: caravan.arrivalTick, expiresTick: caravan.arrivalTick + 5, intensity: 1 });
    for (world.tick = caravan.arrivalTick; world.tick < caravan.arrivalTick + 3; world.tick++) {
      expect(advanceMarkets(world)).toEqual([]);
    }
    expect(advanceMarkets(world)[0]?.title).toBe('商队退运退款');
    expect(buyer.spiritStones).toBe(1000);
    expect(seller.pills.foundation).toBe(2);
    expect(world.markets.receipts[0].status).toBe('returned');
    expect(advanceMarkets(world)).toEqual([]);
    expect(total()).toEqual({ stones: 4000, goods: 2 });
    expect(flows(world).filter(({ reason }) => reason === 'shipment_return')).toMatchObject([
      { kind: 'transfer', good: 'stone', amount: 60, from: flowShipment(caravan.id), to: flowActor(buyer.id) },
      { kind: 'transfer', good: 'foundation', amount: 2, from: flowShipment(caravan.id), to: flowActor(seller.id) },
    ]);
    expect(flows(world).some(({ kind }) => kind === 'loss')).toBe(false);
  });
});

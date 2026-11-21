import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { flowActor, flowSalvage, flowShipment } from '../src/engine/resourceFlowEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { MapHazard, MarketGood, WorldState } from '../src/types/world';

function departing(good: 'jade_leaf' | 'earth_root' | 'foundation' = 'earth_root', units = 3) {
  const world = createInitialWorld(2);
  world.tick = 2;
  const [buyer, seller] = world.cultivators;
  const origin = world.locations.find(({ id }) => id === 'loc-market-east')!;
  const destination = world.locations.find(({ id }) => id === 'loc-market')!;
  buyer.locationId = destination.id;
  seller.locationId = origin.id;
  buyer.spiritStones = seller.spiritStones = 1000;
  buyer.herbs.earth_root = buyer.herbs.jade_leaf = buyer.pills.foundation = 0;
  seller.herbs.earth_root = seller.herbs.jade_leaf = seller.pills.foundation = units;
  const order = (side: 'buy' | 'sell', price: number, availableGood: MarketGood) =>
    resolveMarketAction(world, side === 'buy' ? buyer : seller, { chosenAction: side === 'buy' ? 'PLACE_MARKET_BUY' : 'PLACE_MARKET_SELL',
      marketGood: availableGood, marketQuantity: units, marketLimitPrice: price, innerMonologue: '' });
  expect(order('buy', 30, good)).not.toBeNull();
  expect(order('sell', 20, good)).not.toBeNull();
  expect(advanceMarkets(world).map(({ title }) => title)).toEqual(['跨坊商队启程']);
  const [shipment] = world.markets.shipments;
  expect(shipment.quantity).toBe(units);
  expect(shipment.unitPrice).toBe(30);
  expect(shipment.status).toBe('in_transit');
  expect(shipment.arrivalTick).toBeGreaterThan(world.tick + 1);
  world.tick++;
  const landedFunds = structuredClone(world.random);
  const originTile = terrainTileAt(world, origin.x, origin.y)!.id;
  const hazard = (id: string, kind: MapHazard['kind'], intensity: number, tileId = originTile): MapHazard =>
    ({ id, kind, intensity, tileId, createdTick: world.tick, expiresTick: world.tick + 1 });
  const settle = () => {
    const events = advanceMarkets(world);
    const marketLoss = events.find(({ title }) => title === '商队货损退款');
    expect(marketLoss?.id).toBe(`evt-${world.tick}-market-${shipment.id}`);
    expect(shipment.status).toBe('lost');
    expect(world.markets.receipts[0]).toMatchObject({ shipmentId: shipment.id, status: 'lost', quantity: units });
    expect(buyer.spiritStones).toBe(1000);
    expect(seller.spiritStones).toBe(1000);
    expect(world.random).toEqual(landedFunds);
    expect(advanceMarkets(world)).toEqual([]);
    expect(world.markets.receipts).toHaveLength(1);
    return marketLoss!;
  };
  return { world, buyer, seller, origin, destination, shipment, hazard, settle, units, good, originTile };
}

const movements = (world: WorldState) => world.resourceFlow.months.flatMap(({ entries }) => entries)
  .filter(({ reason }) => ['shipment_refund', 'shipment_salvage', 'shipment_loss'].includes(reason));

describe('caravan loss conserves custody without undoing cash settlement', () => {
  it('seals one actually surviving herb at the crossed wreck, writes only the destroyed remainder and refunds the original buyer once', () => {
    const { world, buyer, seller, origin, destination, shipment, hazard, settle, units, good, originTile } = departing();
    const remoteTile = terrainTileAt(world, destination.x, destination.y)!.id;
    world.mapHazards.push(hazard('remote-major', 'beast_tide', 4, remoteTile), hazard('crossed-moderate', 'beast_tide', 2));
    const report = settle();
    const id = `salvage-${shipment.id}`;
    expect(world.caravanRestitution.lots).toMatchObject([{
      id, shipmentId: shipment.id, sourceLossEventId: report.id, tileId: originTile, siteId: origin.id,
      hazardId: 'crossed-moderate', hazardIntensity: 2, openedTick: world.tick,
      good, originalQuantity: units, destroyedQuantity: units - 1, units: 1, sellerId: seller.id, buyerId: buyer.id, status: 'buried',
    }]);
    expect(report.description).toContain('未交付');
    expect(world.caravanRestitution.lots).toHaveLength(1);
    expect(buyer.herbs.earth_root).toBe(0);
    expect(seller.herbs.earth_root).toBe(0);
    expect(movements(world)).toMatchObject([
      { kind: 'transfer', good: 'stone', amount: units * 30, from: flowShipment(shipment.id), to: flowActor(buyer.id) },
      { kind: 'transfer', good, amount: 1, from: flowShipment(shipment.id), to: flowSalvage(id) },
      { kind: 'loss', good, amount: units - 1, from: flowShipment(shipment.id) },
    ]);
    expect(world.resourceFlow.months.flatMap(({ entries }) => entries).some(({ kind }) => kind === 'production')).toBe(false);
  });

  it.each(['stronger', 'stable-equal-first', 'stable-equal-last', 'fragile', 'singleton', 'site-less'] as const)(
    'does not invent a physical survivor when evidence is %s', (scenario) => {
      const { world, origin, destination, shipment, hazard, settle, units, good } =
        departing(scenario === 'fragile' ? 'foundation' : 'jade_leaf', scenario === 'singleton' ? 1 : 3);
      let hit = hazard('z-moderate', 'beast_tide', 2);
      if (scenario === 'site-less') {
        const fraction = .9 / (shipment.arrivalTick - shipment.departedTick);
        const empty = terrainTileAt(world, origin.x + (destination.x - origin.x) * fraction,
          origin.y + (destination.y - origin.y) * fraction)!.id;
        expect(world.locations.some(({ x, y }) => terrainTileAt(world, x, y)!.id === empty)).toBe(false);
        hit = hazard('z-moderate', 'beast_tide', 2, empty);
      }
      const destructive = hazard('a-destructive', 'cursed_miasma', scenario === 'stronger' ? 3 : 2);
      world.mapHazards.push(...(scenario === 'stronger' || scenario === 'stable-equal-last' ? [hit, destructive] :
        scenario === 'stable-equal-first' ? [destructive, hit] : [hit]));
      settle();
      expect(world.caravanRestitution.lots).toEqual([]);
      expect(movements(world).map(({ kind, reason, amount, good: resource }) => [kind, reason, amount, resource])).toEqual([
        ['transfer', 'shipment_refund', units * 30, 'stone'],
        ['loss', 'shipment_loss', units, good],
      ]);
    },
  );
});

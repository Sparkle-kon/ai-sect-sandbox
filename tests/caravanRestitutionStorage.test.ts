import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveCaravanRestitutionAction } from '../src/engine/caravanRestitutionEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { LocationNode } from '../src/types/world';

function lossFixture() {
  for (let seed = 0; seed <= 20; seed++) {
    const world = createInitialWorld(seed);
    const [buyer, owner, finder] = world.cultivators;
    const a = world.locations.find(({ id }) => id === 'loc-market')!;
    const b: LocationNode = { ...structuredClone(a), id: 'river-market', x: 820, name: '渡口坊市' };
    world.locations.push(b);
    buyer.locationId = a.id;
    owner.locationId = b.id;
    buyer.spiritStones = 1000;
    owner.herbs.jade_leaf = 3;
    expect(resolveMarketAction(world, owner, { chosenAction: 'PLACE_MARKET_SELL', marketGood: 'jade_leaf',
      marketQuantity: 3, marketLimitPrice: 25, innerMonologue: '' })).not.toBeNull();
    expect(resolveMarketAction(world, buyer, { chosenAction: 'PLACE_MARKET_BUY', marketGood: 'jade_leaf',
      marketQuantity: 3, marketLimitPrice: 25, innerMonologue: '' })).not.toBeNull();
    world.events.unshift(...advanceMarkets(world));
    const cargo = world.markets.shipments[0];
    const progress = .5 / (cargo.arrivalTick - cargo.departedTick);
    const site: LocationNode = { ...structuredClone(a), id: 'river-halt', type: 'spirit_vein', name: '在地落脚点',
      x: b.x + (a.x - b.x) * progress, y: a.y };
    world.locations.push(site);
    finder.locationId = site.id;
    const tile = terrainTileAt(world, site.x, site.y)!;
    world.tick++;
    world.mapHazards.push({ id: 'actual-risk-fixture', kind: 'beast_tide', tileId: tile.id,
      createdTick: world.tick, expiresTick: world.tick + 1, intensity: 2 });
    world.events.unshift(...advanceMarkets(world));
    const lot = world.caravanRestitution.lots[0];
    if (lot) return { world, buyer, owner, finder, lot, site, cargo };
  }
  throw Error('Expected one seeded actual cargo loss');
}

describe('exact portable survivor custody', () => {
  it('preserves the actual seal, rejects incorrect source and writes one return without a new sale', () => {
    const { world, buyer, owner, finder, lot, cargo, site } = lossFixture();
    const initial = decodeWorldSave(encodeWorldSave(world));
    expect(initial.caravanRestitution.lots[0]).toMatchObject({ status: 'buried', units: 1, originalQuantity: 3, destroyedQuantity: 2 });
    const falseLoss = structuredClone(initial);
    falseLoss.caravanRestitution.lots[0].destroyedQuantity = 3;
    expect(() => encodeWorldSave(falseLoss)).toThrow('caravanRestitution.lots.source');
    const unsupported = structuredClone(initial);
    unsupported.caravanRestitution.lots[0].sourceLossEventId = 'evt-not-the-actual-original-loss';
    expect(() => encodeWorldSave(unsupported)).toThrow('caravanRestitution.lots.source');
    world.tick++;
    world.mapHazards = [];
    expect(resolveCaravanRestitutionAction(world, finder, {
      chosenAction: 'CARAVAN_RESTITUTION', restitutionMove: 'discover', targetRestitutionId: lot.id, innerMonologue: '',
    })).not.toBeNull();
    const monies = [buyer.spiritStones, owner.spiritStones, finder.spiritStones];
    const receiptsBefore = structuredClone(world.markets.receipts);
    world.tick++;
    owner.locationId = site.id;
    expect(resolveCaravanRestitutionAction(world, owner, {
      chosenAction: 'CARAVAN_RESTITUTION', restitutionMove: 'return', targetRestitutionId: lot.id, innerMonologue: '',
    })).not.toBeNull();
    expect(owner.herbs.jade_leaf).toBe(1);
    expect([buyer.spiritStones, owner.spiritStones, finder.spiritStones]).toEqual(monies);
    expect(cargo.status).toBe('lost');
    expect(world.markets.receipts).toEqual(receiptsBefore);
    expect(decodeWorldSave(encodeWorldSave(world)).caravanRestitution).toEqual(world.caravanRestitution);
    const duplicate = structuredClone(world);
    duplicate.caravanRestitution.lots.push({ ...lot });
    expect(() => encodeWorldSave(duplicate)).toThrow('caravanRestitution.lots.source');
  });
});

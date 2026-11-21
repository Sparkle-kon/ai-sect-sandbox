import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { lootStorageRing } from '../src/engine/artifactEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceEstates } from '../src/engine/estateEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

describe('estate ownership across gameplay systems', () => {
  it('does not copy an artifact or money that the existing verified loot rule already transferred', () => {
    const world = createInitialWorld();
    const [winner, deceased] = world.cultivators;
    deceased.alive = false;
    deceased.hp = 0;
    const artifact = deceased.artifacts[0].id;
    const amount = winner.spiritStones + deceased.spiritStones;
    expect(lootStorageRing(winner, deceased).artifacts).toBeGreaterThan(0);
    advanceEstates(world);
    const estate = world.estates.entries.find(({ deceasedId }) => deceasedId === deceased.id)!;
    expect(estate.holdings.artifacts).toEqual([]);
    expect(estate.holdings.stones).toBe(0);
    expect(winner.spiritStones).toBe(amount);
    expect(winner.artifacts.filter(({ id }) => id === artifact)).toHaveLength(1);
    expect(deceased.artifacts).toEqual([]);
  });

  it('conserves coins and later sales proceeds across the real freight, corpse and estate ledgers', () => {
    let world = createInitialWorld();
    world.tick = 6; world.month = 6;
    const [seller, buyer] = world.cultivators;
    seller.locationId = 'loc-market-east';
    buyer.locationId = 'loc-market';
    seller.herbs.jade_leaf = 3;
    buyer.herbs.jade_leaf = 0;
    const cash = world.cultivators.reduce((sum, person) => sum + person.spiritStones, 0);
    const herbs = world.cultivators.reduce((sum, person) => sum + person.herbs.jade_leaf, 0);
    expect(resolveMarketAction(world, seller, { chosenAction: 'PLACE_MARKET_SELL', innerMonologue: '', marketGood: 'jade_leaf',
      marketQuantity: 2, marketLimitPrice: 9 })).not.toBeNull();
    expect(resolveMarketAction(world, buyer, { chosenAction: 'PLACE_MARKET_BUY', innerMonologue: '', marketGood: 'jade_leaf',
      marketQuantity: 2, marketLimitPrice: 9 })).not.toBeNull();
    advanceMarkets(world);
    expect(world.markets.shipments[0].status).toBe('in_transit');
    seller.alive = false; seller.hp = 0;
    advanceEstates(world);
    world = decodeWorldSave(encodeWorldSave(world));
    for (let i = 0; i < 12; i++) { world.tick++; advanceMarkets(world); advanceEstates(world); }
    expect(world.markets.shipments[0].status).toBe('delivered');
    const [corpse, settledBuyer] = world.cultivators;
    const estate = world.estates.entries.find(({ deceasedId }) => deceasedId === seller.id)!;
    expect(corpse.spiritStones).toBe(0);
    expect(settledBuyer.herbs.jade_leaf).toBeGreaterThanOrEqual(2);
    expect(world.cultivators.reduce((sum, person) => sum + person.spiritStones, 0) + estate.holdings.stones).toBe(cash);
    expect(world.cultivators.reduce((sum, person) => sum + person.herbs.jade_leaf, 0) + estate.holdings.herbs.jade_leaf).toBe(herbs);
  });

  it('lets a validated model nominate an eligible heir and a Utility actor claim via the same rules', async () => {
    const world = createInitialWorld();
    const [owner, heir] = world.cultivators;
    heir.locationId = owner.locationId;
    heir.qiProgress = 20;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      chosenAction: 'NAME_HEIR', targetCultivatorId: heir.id, innerMonologue: '留给可查师承',
    }) } }] }))));
    const nomination = await queryCultivatorLLMDecision(owner, world, config);
    expect(nomination.chosenAction).toBe('NAME_HEIR');
    expect(applyCultivatorBrainDecision(world, owner, nomination)).not.toBeNull();
    expect(owner.namedHeirId).toBe(heir.id);
    owner.alive = false; owner.hp = 0;
    advanceEstates(world);
    const claim = computeHeuristicDecision(heir, world, () => .99);
    expect(claim.chosenAction).toBe('CLAIM_ESTATE');
    expect(applyCultivatorBrainDecision(world, heir, claim)).not.toBeNull();
  });
});

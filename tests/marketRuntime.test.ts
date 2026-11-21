import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceMarkets, availableMarketActions, createMarketState } from '../src/engine/marketEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { LLMConfig } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-not-secret', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

describe('market and caravan integration', () => {
  it('matches an offline seller and validated model bidder across real markets, persisting cash and freight', async () => {
    let world = createInitialWorld(5);
    world.tick = 6;
    world.month = 6;
    const [seller, receiver] = world.cultivators;
    seller.locationId = 'loc-market-east';
    receiver.locationId = 'loc-market';
    seller.herbs.jade_leaf = 5;
    receiver.herbs.jade_leaf = 0;
    seller.qiProgress = receiver.qiProgress = 21;
    const totalStones = seller.spiritStones + receiver.spiritStones;
    const offer = computeHeuristicDecision(seller, world, () => .99);
    expect(offer.chosenAction).toBe('PLACE_MARKET_SELL');
    expect(applyCultivatorBrainDecision(world, seller, offer, () => .99)).not.toBeNull();
    const option = availableMarketActions(receiver, world).find((item) => item.action === 'PLACE_MARKET_BUY' && item.marketGood === 'jade_leaf')!;
    expect(option).toBeDefined();
    const mock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      ...option, chosenAction: option.action, innerMonologue: '买一叶送往本地坊市',
    }) } }] })));
    vi.stubGlobal('fetch', mock);
    const bid = await queryCultivatorLLMDecision(receiver, world, config);
    expect(bid.chosenAction).toBe('PLACE_MARKET_BUY');
    expect(applyCultivatorBrainDecision(world, receiver, bid, () => .99)).not.toBeNull();
    advanceMarkets(world);
    const shipment = world.markets.shipments[0];
    expect(shipment.status).toBe('in_transit');
    expect(shipment.destinationId).toBe('loc-market');
    expect(receiver.herbs.jade_leaf).toBe(0);
    world = decodeWorldSave(encodeWorldSave(world));
    for (let i = 0; i < 8; i++) { world.tick++; advanceMarkets(world); }
    const [settledSeller, settledReceiver] = world.cultivators;
    expect(world.markets.shipments[0].status).toBe('delivered');
    expect(world.markets.receipts).toHaveLength(1);
    expect(settledReceiver.herbs.jade_leaf).toBe(1);
    expect(settledSeller.herbs.jade_leaf).toBe(4);
    expect(settledSeller.spiritStones + settledReceiver.spiritStones).toBe(totalStones);
  });

  it('preserves existing map sites while migrating an older save to an empty trading ledger', () => {
    const { markets: _markets, settlements: _settlements, worldgen: _worldgen, ...earlier } = createInitialWorld();
    earlier.locations = earlier.locations.filter(({ id }) => id !== 'loc-market-east');
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: earlier }));
    expect(restored.markets).toEqual(createMarketState());
    expect(restored.worldgen).toBeUndefined();
    expect(restored.locations).toEqual(earlier.locations);
  });
});

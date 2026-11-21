import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableCaravanRestitutionActions } from '../src/engine/caravanRestitutionEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload, LocationNode } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-caravan-restoration' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function markets(seed: number) {
  const world = createInitialWorld(seed);
  const [buyer, seller, finder, outsider] = world.cultivators;
  const west = world.locations.find(({ type }) => type === 'market')!;
  const east: LocationNode = { ...structuredClone(west), id: 'fixture-east-market', name: '东边坊市', x: 820, y: west.y };
  world.locations.push(east);
  buyer.locationId = west.id;
  seller.locationId = east.id;
  buyer.spiritStones = 1_000;
  seller.spiritStones = 1_000;
  seller.herbs.jade_leaf = 3;
  finder.qiProgress = 20;
  finder.personality = '刚正';
  finder.hp = finder.maxHp;
  const order = (actor: Cultivator, chosenAction: 'PLACE_MARKET_BUY' | 'PLACE_MARKET_SELL') =>
    resolveMarketAction(world, actor, { chosenAction, marketGood: 'jade_leaf', marketQuantity: 3, marketLimitPrice: 25, innerMonologue: '' });
  expect(order(seller, 'PLACE_MARKET_SELL')).not.toBeNull();
  expect(order(buyer, 'PLACE_MARKET_BUY')).not.toBeNull();
  expect(advanceMarkets(world)[0]?.title).toBe('跨坊商队启程');
  const shipment = world.markets.shipments[0];
  const progress = .5 / (shipment.arrivalTick - shipment.departedTick);
  const point = { x: east.x + (west.x - east.x) * progress, y: east.y };
  const hit = terrainTileAt(world, point.x, point.y)!;
  const venue: LocationNode = { ...structuredClone(west), ...point, id: 'fixture-road-halt', type: 'spirit_vein', name: '山路落脚点' };
  world.locations.push(venue);
  finder.locationId = venue.id;
  outsider.locationId = 'loc-tianji';
  world.tick++;
  world.mapHazards.push({ id: 'fixture-beast-tide', kind: 'beast_tide', tileId: hit.id, createdTick: world.tick,
    expiresTick: world.tick + 1, intensity: 2 });
  const outcome = advanceMarkets(world);
  return { world, shipment, outcome, venue, buyer, seller, finder, outsider };
}

function fixture() {
  for (let seed = 0; seed <= 20; seed++) {
    const state = markets(seed);
    const lot = state.world.caravanRestitution.lots[0];
    if (!lot) continue;
    expect(state.shipment.status).toBe('lost');
    expect(state.outcome.some(({ id }) => id === lot.sourceLossEventId)).toBe(true);
    expect(lot).toMatchObject({ status: 'buried', good: 'jade_leaf', units: 1, sellerId: state.seller.id, siteId: state.venue.id });
    const apply = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(state.world, actor, decision, () => .99);
    return { ...state, lot, apply };
  }
  throw new Error('No true market loss left a salvage lot in the seeded fixture');
}

describe('actual caravan restitution in both brains', () => {
  it('offers exactly one recoverable local lot, never fabricated quantity, ownership, locations or refund', async () => {
    const { world, finder, outsider, lot, seller, venue, apply, buyer } = fixture();
    const discover = { chosenAction: 'CARAVAN_RESTITUTION', restitutionMove: 'discover', targetRestitutionId: lot.id,
      innerMonologue: '只查证本地遗货。' } as const;
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond(discover));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(finder, world, config, world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const extra of [{ targetRestitutionId: 'invented' }, { quantity: 3 }, { sellerId: seller.id },
      { targetLocationId: venue.id }, { refund: 1000 }]) {
      mock.mockImplementation(async () => respond({ ...discover, ...extra }));
      await expect(requestCultivatorLLMDecision(finder, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(discover));
    const action = await requestCultivatorLLMDecision(finder, world, config, world.tick + 1);
    expect(action).toMatchObject(discover);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('商队遗货只采用本人此地实际可执行');
    world.tick++;
    expect(availableCaravanRestitutionActions(outsider, world)).toEqual([]);
    const before = [buyer.spiritStones, seller.spiritStones, finder.herbs.jade_leaf];
    expect(apply(finder, action!)).not.toBeNull();
    expect(lot).toMatchObject({ status: 'sealed', finderId: finder.id });
    expect(apply(finder, action!)).toBeNull();
    expect([buyer.spiritStones, seller.spiritStones, finder.herbs.jade_leaf]).toEqual(before);
  });

  it('lets Utility discover real stock and accepts only a co-present handoff returning one unit, not trade cash', async () => {
    const { world, finder, seller, outsider, venue, lot, apply, buyer } = fixture();
    const early = computeHeuristicDecision(finder, world, () => .99);
    expect(early.chosenAction).not.toBe('CARAVAN_RESTITUTION');
    world.tick++;
    const discover = computeHeuristicDecision(finder, world, () => .99);
    expect(discover).toMatchObject({ chosenAction: 'CARAVAN_RESTITUTION', restitutionMove: 'discover', targetRestitutionId: lot.id });
    expect(apply(finder, discover)).not.toBeNull();
    const cash = [buyer.spiritStones, seller.spiritStones, finder.spiritStones];
    const goods = [buyer.herbs.jade_leaf, seller.herbs.jade_leaf, finder.herbs.jade_leaf];
    const returnGoods = { chosenAction: 'CARAVAN_RESTITUTION', restitutionMove: 'return', targetRestitutionId: lot.id, innerMonologue: '凭证归还。' } as const;
    const mock = vi.fn(async () => respond(returnGoods));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(finder, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(computeHeuristicDecision(finder, world, () => .99).chosenAction).not.toBe('CARAVAN_RESTITUTION');
    seller.locationId = venue.id;
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    const legal = await requestCultivatorLLMDecision(finder, world, config, world.tick + 1);
    expect(legal).toMatchObject(returnGoods);
    world.tick++;
    expect(computeHeuristicDecision(finder, world, () => .99)).toMatchObject({ chosenAction: 'CARAVAN_RESTITUTION', restitutionMove: 'return', targetRestitutionId: lot.id });
    expect(apply(finder, legal!)).not.toBeNull();
    expect(apply(finder, legal!)).toBeNull();
    expect(lot).toMatchObject({ status: 'returned', returnedById: finder.id });
    expect([buyer.spiritStones, seller.spiritStones, finder.spiritStones]).toEqual(cash);
    expect([buyer.herbs.jade_leaf, seller.herbs.jade_leaf, finder.herbs.jade_leaf]).toEqual([goods[0], goods[1] + 1, goods[2]]);
  });
});

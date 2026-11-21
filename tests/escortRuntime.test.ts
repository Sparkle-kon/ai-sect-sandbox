import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeEscortForActor, ESCORT_FEE, ESCORT_RATIONS } from '../src/engine/escortEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceMarkets, availableMarketActions } from '../src/engine/marketEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const idle = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '静候' }]));
afterEach(() => vi.unstubAllGlobals());

function marketFixture() {
  const world = createInitialWorld(5);
  world.tick = 6; world.month = 6;
  const [seller, buyer, , guide] = world.cultivators;
  seller.locationId = guide.locationId = 'loc-market-east';
  buyer.locationId = 'loc-market';
  seller.herbs.jade_leaf = 5; buyer.herbs.jade_leaf = 0;
  guide.herbs.earth_root = ESCORT_RATIONS + 2;
  guide.personality = '逍遥';
  for (const actor of [seller, buyer, guide]) {
    actor.hp = actor.maxHp;
    actor.qiProgress = 20;
  }
  const ask = availableMarketActions(seller, world).find((option) =>
    option.action === 'PLACE_MARKET_SELL' && option.marketGood === 'jade_leaf')!;
  const bid = availableMarketActions(buyer, world).find((option) =>
    option.action === 'PLACE_MARKET_BUY' && option.marketGood === 'jade_leaf')!;
  expect(applyCultivatorBrainDecision(world, seller, { ...ask, chosenAction: ask.action, innerMonologue: '实货挂单' }, () => .99)).not.toBeNull();
  expect(applyCultivatorBrainDecision(world, buyer, { ...bid, chosenAction: bid.action, innerMonologue: '固定价入货' }, () => .99)).not.toBeNull();
  advanceMarkets(world);
  const shipment = world.markets.shipments[0];
  expect(shipment?.status).toBe('in_transit');
  world.tick++;
  return { world, seller, buyer, guide, shipment };
}

describe('escorts through both brains and actual market custody', () => {
  it('uses private fee and personal rations, preserves live cargo and pays the escort only on actual market delivery', async () => {
    const { world, seller, buyer, guide, shipment } = marketFixture();
    const feeBefore = seller.spiritStones;
    const guideBefore = guide.spiritStones;
    const guideGoods = guide.herbs.jade_leaf;
    const rationsBefore = guide.herbs.earth_root;
    const buyerCash = buyer.spiritStones;
    const choice = computeHeuristicDecision(seller, world, () => .99);
    expect(choice).toMatchObject({ chosenAction: 'ESCORT', escortMove: 'offer', targetShipmentId: shipment.id });
    const client = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] })));
    vi.stubGlobal('fetch', client);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(seller, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, seller, model, () => .99)).not.toBeNull();
    expect(seller.spiritStones).toBe(feeBefore - ESCORT_FEE);
    expect(buyer.spiritStones).toBe(buyerCash);
    advanceMarkets(world);
    expect(world.escorts.contracts[0].holdAppliedTick).toBe(world.tick);
    expect(shipment.status).toBe('in_transit');
    world.tick++;
    const current = computeHeuristicDecision(guide, world, () => .99);
    expect(current).toMatchObject({ chosenAction: 'ESCORT', escortMove: 'accept', targetEscortId: world.escorts.contracts[0].id });
    expect(applyCultivatorBrainDecision(world, guide, current, () => .99)).not.toBeNull();
    const contract = activeEscortForActor(world, guide)!;
    expect(contract.status).toBe('active');
    expect(guide.herbs.earth_root).toBe(rationsBefore - ESCORT_RATIONS);
    expect(guide.herbs.jade_leaf).toBe(guideGoods);
    expect(buyer.herbs.jade_leaf).toBe(0);
    const restored = decodeWorldSave(encodeWorldSave(world));
    const road = advanceWorldTick(restored, idle(restored), () => .99);
    expect(road.cultivators.find(({ id }) => id === guide.id)?.currentAction).toBe('ESCORT');
    await queryCultivatorLLMDecision(guide, world, config);
    expect(client).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 12 && shipment.status === 'in_transit'; i++) {
      world.tick++;
      advanceMarkets(world);
    }
    expect(shipment.status).toBe('delivered');
    expect(contract).toMatchObject({ status: 'delivered', feePaid: ESCORT_FEE, feeEscrow: 0, rationsSpent: 1, rationsReturned: ESCORT_RATIONS - 1 });
    expect(guide.spiritStones).toBe(guideBefore + ESCORT_FEE);
    expect(guide.herbs.earth_root).toBe(rationsBefore - 1);
    expect(buyer.herbs.jade_leaf).toBe(shipment.quantity);
    expect(seller.spiritStones).toBe(feeBefore - ESCORT_FEE + shipment.quantity * shipment.unitPrice);
    expect(buyer.spiritStones).toBe(buyerCash);
    expect(decodeWorldSave(encodeWorldSave(world)).escorts).toEqual(world.escorts);
  });

  it('refunds an unsigned offer once and resumes the unchanged market route with only the recorded one-turn hold', () => {
    const { world, seller, buyer, shipment } = marketFixture();
    const balance = seller.spiritStones;
    const offer = { chosenAction: 'ESCORT', escortMove: 'offer', targetShipmentId: shipment.id, innerMonologue: '委托' } satisfies LLMDecisionPayload;
    expect(applyCultivatorBrainDecision(world, seller, offer, () => .99)).not.toBeNull();
    for (let i = world.tick; i <= shipment.arrivalTick; i++) {
      world.tick = i;
      advanceMarkets(world);
    }
    expect(shipment.status).toBe('in_transit');
    expect(world.escorts.contracts[0]).toMatchObject({ status: 'expired', feeRefunded: ESCORT_FEE, feeEscrow: 0 });
    expect(seller.spiritStones).toBe(balance);
    expect(buyer.herbs.jade_leaf).toBe(0);
    world.tick++;
    advanceMarkets(world);
    expect(shipment.status).toBe('delivered');
    expect(buyer.herbs.jade_leaf).toBe(shipment.quantity);
    expect(seller.spiritStones).toBe(balance + shipment.quantity * shipment.unitPrice);
  });
});

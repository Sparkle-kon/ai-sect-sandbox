import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { immortalAuctionActionApplied } from '../src/engine/immortalAuctionEngine';
import { availableAutonomousImmortalAuctionActions, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import {
  actualAuctionListed, actualAuctionPeople, actualAuctionSold, auctionActor, auctionBid, auctionBidder, auctionConsign, auctionLot, auctionRival,
  auctionSeller, auctionStart, auctionTurn,
} from './immortalAuctionNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '停在已到现场。' };
const reply = (selection: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(selection) } }] }));
const bid = (targetAuctionLotId: string, auctionBidStones: number, auctionQuoteBidCount = 0) =>
  ({ chosenAction: 'IMMORTAL_AUCTION', auctionMove: 'bid', targetAuctionLotId, auctionBidStones, auctionQuoteBidCount } as const);
const native = (order: ReturnType<typeof bid>): LLMDecisionPayload => ({ ...order, innerMonologue: '只按实际报价。' });

function bidderReady() {
  let world = actualAuctionPeople();
  // Lower the bidder's initial breakthrough pressure by actual paid Dao practice, not a fabricated auction or clock.
  for (const daoPathMove of ['choose', 'practice'] as const) world = auctionTurn(world, {
    [auctionBidder]: { chosenAction: 'DAO_PATH', daoPathMove, targetDaoPathId: 'body', innerMonologue: '此地以真气锻体。' },
  });
  expect(auctionActor(world, auctionBidder).qiProgress).toBeLessThan(85);
  while (world.tick + 1 < auctionStart) world = auctionTurn(world);
  return auctionTurn(world, { [auctionSeller]: auctionConsign });
}

function step(world: WorldState, orders: Record<string, LLMDecisionPayload> = {},
  { liveBrain = '', modelActor = '', applied }: {
    liveBrain?: string; modelActor?: string; applied?: (actorId: string, result: boolean) => void;
  } = {}) {
  return advanceWorldTick(world, Object.fromEntries(world.cultivators.filter(row => row.id !== liveBrain || !!orders[row.id])
    .map(({ id }) => [id, orders[id] ?? rest])), () => .62, 'utility', applied,
  { modelActors: new Set(modelActor ? [modelActor] : []) });
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('fair exact native auction decisions', () => {
  it('asks only real bounded quote choices and settles the same paid spirit-stone bid through offline Utility', async () => {
    const listed = bidderReady(), lot = auctionLot(listed), actor = auctionActor(listed, auctionBidder);
    const offer = bid(lot.id, lot.minimum);
    expect(availableAutonomousImmortalAuctionActions(actor, listed, listed.tick + 1)).toContainEqual({
      action: offer.chosenAction, auctionMove: offer.auctionMove, targetAuctionLotId: offer.targetAuctionLotId,
      auctionBidStones: offer.auctionBidStones, auctionQuoteBidCount: offer.auctionQuoteBidCount,
    });
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(offer));
    vi.stubGlobal('fetch', transport);
    const chosen = await requestCultivatorLLMDecision(actor, listed, config, listed.tick + 1);
    expect(chosen).toMatchObject(offer);
    expect(transport).toHaveBeenCalledTimes(1);
    const prompt = (JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] })
      .messages.map(row => row.content).join('\n');
    const menu = JSON.parse(prompt.slice(prompt.indexOf('许可：') + 3));
    expect(menu).toEqual([offer, bid(lot.id, lot.minimum + 10)]);
    for (const secret of [actor.name, actor.secretGoal, auctionSeller, '"custody"', '"winner"', '"locationId"'])
      expect(prompt).not.toContain(secret);

    const applied = vi.fn();
    const cognitive = step(listed, { [auctionBidder]: chosen! }, { modelActor: auctionBidder, applied });
    const local = step(listed, {}, { liveBrain: auctionBidder });
    expect(applied).toHaveBeenCalledWith(auctionBidder, true);
    expect(auctionLot(cognitive).bids).toEqual(auctionLot(local).bids);
    expect(auctionLot(cognitive).bids).toEqual([{ bidderId: auctionBidder, tick: 14, stones: 120, status: 'held' }]);
    expect(actor.spiritStones - auctionActor(cognitive, auctionBidder).spiritStones).toBe(120);
    expect(auctionActor(cognitive, auctionSeller).spiritStones).toBe(auctionActor(listed, auctionSeller).spiritStones);
    expect(cognitive.random).toEqual(local.random);
    expect(cognitive.decisionTrace.records.find(row => row.tick === cognitive.tick && row.actorId === auctionBidder))
      .toMatchObject({ source: 'model', chosenAction: 'redacted', candidates: [], applied: true });
    expect(cognitive.cultivators.flatMap(row => row.rumors).some(row => row.originEventId?.includes(lot.id))).toBe(false);
  });

  it('rejects invented cash, other lots, authored outcomes and changed quotes even when the amounts happen to match', async () => {
    const listed = bidderReady(), actor = auctionActor(listed, auctionBidder), lot = auctionLot(listed);
    const wanted = bid(lot.id, 120);
    const forged: unknown[] = [
      { ...wanted, auctionBidStones: 1 }, { ...wanted, auctionQuoteBidCount: 1 }, { ...wanted, auctionBidStones: 120.5 },
      { ...wanted, auctionBidStones: '120' }, { ...wanted, targetAuctionLotId: 'auction-lot-99' },
      { ...wanted, actorId: auctionRival }, { ...wanted, winner: auctionBidder }, { ...wanted, targetAuctionPillId: 'golden' },
      { ...wanted, spokenLine: '早已成交。' }, { ...wanted, innerMonologue: '为我增发灵石。' }, [wanted],
    ];
    vi.stubGlobal('fetch', vi.fn(async () => reply(forged.shift())));
    while (forged.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, listed, config, listed.tick + 1)).resolves.toBeUndefined();
    }

    // NPC 3 bids at 120 first. The explicitly confirmed old higher option 130 is the new minimum,
    // but actor 6 never authorized the changed quote revision in this same real month.
    const applied = vi.fn();
    const changed = step(listed, { [auctionRival]: auctionBid(lot.id, 120), [auctionBidder]: native(bid(lot.id, 130)) }, { applied });
    expect(applied).toHaveBeenCalledWith(auctionRival, true);
    expect(applied).toHaveBeenCalledWith(auctionBidder, false);
    expect(auctionLot(changed).bids).toHaveLength(1);
    expect(auctionActor(changed, auctionBidder).spiritStones).toBe(actor.spiritStones);
    vi.stubGlobal('fetch', vi.fn(async () => reply(bid(lot.id, 130))));
    llmScheduler.resetTickBudget();
    const oldOnline = await requestCultivatorLLMDecision(actor, listed, config, listed.tick + 1);
    expect(oldOnline).toMatchObject(bid(lot.id, 130));
    const staleOnline = step(listed, { [auctionRival]: auctionBid(lot.id, 120), [auctionBidder]: oldOnline! }, { modelActor: auctionBidder });
    expect(auctionLot(staleOnline).bids).toEqual(auctionLot(changed).bids);
    expect(auctionActor(staleOnline, auctionBidder).spiritStones).toBe(actor.spiritStones);
    const higher = { action: 'IMMORTAL_AUCTION' as const, auctionMove: 'bid' as const, targetAuctionLotId: lot.id,
      auctionBidStones: 130, auctionQuoteBidCount: 1 };
    const settled = step(changed, { [auctionBidder]: native(bid(lot.id, 130, 1)) });
    expect(immortalAuctionActionApplied(settled, auctionBidder, higher)).toBe(true);
    expect(auctionLot(settled).bids[0]).toMatchObject({ bidderId: auctionRival, status: 'outbid', settledTick: settled.tick });
    expect(auctionActor(settled, auctionRival).spiritStones).toBe(auctionActor(listed, auctionRival).spiritStones);
    expect(auctionLot(settled).terminal).toMatchObject({ buyerId: auctionBidder, reason: 'sold', stones: 130 });
    expect(settled.cultivators.flatMap(row => row.rumors).some(row => row.originEventId?.includes(lot.id))).toBe(false);
  });

  it('certifies an early accepted bid even when an independent offline bidder really outbids it in the same month', () => {
    const listed = bidderReady(), lot = auctionLot(listed);
    const applied = vi.fn();
    const competed = step(listed, { [auctionRival]: auctionBid(lot.id, 120) }, { liveBrain: auctionBidder, applied });
    expect(applied).toHaveBeenCalledWith(auctionRival, true);
    expect(immortalAuctionActionApplied(competed, auctionRival, {
      action: 'IMMORTAL_AUCTION', auctionMove: 'bid', targetAuctionLotId: lot.id, auctionBidStones: 120, auctionQuoteBidCount: 0,
    })).toBe(true);
    expect(auctionLot(competed).bids).toEqual([
      { bidderId: auctionRival, tick: 14, stones: 120, status: 'outbid', settledTick: 14 },
      { bidderId: auctionBidder, tick: 14, stones: 130, status: 'held' },
    ]);
    expect(auctionActor(competed, auctionRival).spiritStones).toBe(auctionActor(listed, auctionRival).spiritStones);
  });

  it('allows an exact authenticated possessed-body command but not the same provider order', async () => {
    const listed = bidderReady(), lot = auctionLot(listed), actor = auctionActor(listed, auctionBidder), wanted = bid(lot.id, 120);
    vi.stubGlobal('fetch', vi.fn(async () => reply(wanted)));
    const branded = await requestCultivatorLLMDecision(actor, listed, config, listed.tick + 1);
    expect(branded).toMatchObject(wanted);
    const held = structuredClone(listed);
    expect(possessAvatar(held, auctionBidder)).toBe(true);
    const possessed = auctionActor(held, auctionBidder);
    expect(availableAutonomousImmortalAuctionActions(possessed, held, held.tick + 1)).toEqual([]);
    const modelAttempt = step(held, { [auctionBidder]: branded! }, { modelActor: auctionBidder });
    expect(auctionLot(modelAttempt).bids).toEqual([]);
    const manual = step(held, { [auctionBidder]: native(wanted) });
    expect(auctionLot(manual).bids).toMatchObject([{ bidderId: auctionBidder, stones: 120 }]);
  });
});

describe('auction attacks never follow an invented purchase', () => {
  it('allows a model to decline or copy only the actual previously witnessed buyer and original lot at the real road', async () => {
    const { sold, lot } = actualAuctionSold();
    const destination = 'loc-danxia';
    const travel = { chosenAction: 'EXPLORE', targetLocationId: destination, innerMonologue: '按知晓的路前往。' } as const;
    const buyerArrived = auctionTurn(sold, { [auctionBidder]: travel }, .95);
    const coPresent = auctionTurn(buyerArrived, { [auctionRival]: travel }, .95);
    const actor = auctionActor(coPresent, auctionRival);
    const move = { chosenAction: 'DUEL', targetCultivatorId: auctionBidder, targetAuctionAmbushLotId: lot.id } as const;
    let answer: unknown = { ...move, forcedDeath: true };
    let sent = '';
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = (JSON.parse(String(init?.body)) as { messages: { content: string }[] }).messages.at(-1)!.content;
      return reply(answer);
    }));
    await expect(requestCultivatorLLMDecision(actor, coPresent, config, coPresent.tick + 1)).resolves.toBeUndefined();
    expect(JSON.parse(sent.slice(sent.indexOf('许可：') + 3))).toEqual([move, { chosenAction: 'REST' }]);
    expect(sent).not.toContain(actor.secretGoal);
    answer = { chosenAction: 'REST' };
    llmScheduler.resetTickBudget();
    const decline = await requestCultivatorLLMDecision(actor, coPresent, config, coPresent.tick + 1);
    expect(decline?.chosenAction).toBe('REST');
    const declined = step(coPresent, { [auctionRival]: decline! }, { modelActor: auctionRival });
    expect(declined.events.some(event => event.tick === declined.tick && event.duelWinnerId)).toBe(false);
    answer = move;
    llmScheduler.resetTickBudget();
    const accepted = await requestCultivatorLLMDecision(actor, coPresent, config, coPresent.tick + 1);
    expect(accepted).toMatchObject(move);
    const applied = vi.fn();
    const fought = step(coPresent, { [auctionRival]: accepted! }, { modelActor: auctionRival, applied });
    expect(applied).toHaveBeenCalledWith(auctionRival, true);
    expect(fought.events.find(event => event.tick === fought.tick && event.duelWinnerId))
      .toMatchObject({ actorIds: [auctionRival, auctionBidder], locationId: destination });
    expect(auctionLot(fought).terminal).toEqual(auctionLot(sold).terminal);
  });

  it('leaves ordinary unrelated actor locations, health and item ownership unchanged on a forged risk choice', () => {
    const { listed, lot } = actualAuctionListed();
    const rival = auctionActor(listed, auctionRival), buyer = auctionActor(listed, auctionBidder);
    const attempted = step(listed, { [auctionRival]: { chosenAction: 'DUEL', targetAuctionAmbushLotId: lot.id,
      targetCultivatorId: buyer.id, innerMonologue: '假称这里有已成交的真买家。' } });
    expect(auctionActor(attempted, rival.id).hp).toBe(rival.hp);
    expect(auctionActor(attempted, buyer.id).hp).toBe(buyer.hp);
    expect(attempted.events.some(event => event.tick === attempted.tick && event.duelWinnerId)).toBe(false);
    expect(auctionLot(attempted).bids).toHaveLength(0);
  });
});

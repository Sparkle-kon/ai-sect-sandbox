import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { createDecisionReplayTape, replayOneTurn } from '../src/engine/decisionTraceEngine';
import { availableGrandSiegeHeroActions, chooseGrandSiegeHeroDecision, queueGrandSiegeHero } from '../src/engine/grandSiegeTheatreEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { GrandSiegeHeroMove } from '../src/types/grandSiege';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, commander, disciple, patriarch, siegeActor, siegeSect, siegeTurn } from './grandSiegeNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const reply = (choice: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }));
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '暂守原地。' };
const option = (id: string, grandSiegeHeroMove: GrandSiegeHeroMove) =>
  ({ chosenAction: 'GRAND_SIEGE_HERO' as const, targetGrandSiegeId: id, grandSiegeHeroMove });

function crisis() {
  const native = actualGrandSiege();
  const world = siegeTurn(native.arrived);
  const siege = actualSiege(world), owner = siegeActor(world, patriarch);
  const moves = availableGrandSiegeHeroActions(owner, world);
  expect(siege).toMatchObject({ status: 'sieging', theatre: { arrivedTick: native.arrived.tick } });
  expect(siege.theatre?.rounds).toHaveLength(1);
  expect(siege.theatre?.rounds[0].clash).toBeDefined();
  expect(siegeSect(world).arrayHp).toBeGreaterThan(0);
  expect(moves).toEqual([
    { action: 'GRAND_SIEGE_HERO', targetGrandSiegeId: siege.id, grandSiegeHeroMove: 'leader-last-stand' },
    { action: 'GRAND_SIEGE_HERO', targetGrandSiegeId: siege.id, grandSiegeHeroMove: 'hold' },
  ]);
  return { world, siege, owner, native, moves };
}

function settle(world: WorldState, action?: LLMDecisionPayload, trace?: Parameters<typeof advanceWorldTick>[5],
  recordDecisionEffect?: Parameters<typeof advanceWorldTick>[4]) {
  const choices = Object.fromEntries(world.cultivators.map(({ id }) => [id, id === patriarch && action ? action : rest]));
  return advanceWorldTick(world, choices, () => .5, 'utility', recordDecisionEffect, trace);
}
const receipt = (world: WorldState) => actualSiege(world).theatre?.rounds.at(-1);

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native end-of-month siege hero decisions through strict Cognitive and Utility', () => {
  it('exposes only the actual arrived local defenders’ legal menu and attaches the chosen payment to a genuine model receipt', async () => {
    const { world, owner, siege, moves, native } = crisis();
    const permitted = option(siege.id, 'leader-last-stand');
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn(), untouched = structuredClone(world);
    for (const phase of [native.launched, native.assembled, native.arrived]) {
      expect(availableGrandSiegeHeroActions(siegeActor(phase, patriarch), phase)).toEqual([]);
    }
    expect(availableGrandSiegeHeroActions(siegeActor(world, commander), world)).toEqual([]);
    expect(availableGrandSiegeHeroActions(siegeActor(world, disciple), world)).toEqual([]);
    expect(modelDecisionCandidates(world)).toContain(owner);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick, { onStart })).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 2, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    const selected = await requestCultivatorLLMDecision(owner, world, config, world.tick + 1, { onStart });
    expect(selected).toMatchObject(permitted);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    const prompt = input.messages.map(row => row.content).join(' ');
    for (const move of moves) expect(prompt).toContain(JSON.stringify(option(siege.id, move.grandSiegeHeroMove)));
    for (const unauthorized of [owner.name, siegeActor(world, commander).name, siege.destinationId,
      'innerMonologue', 'actorId', 'wallBefore', 'wallAfter', 'paidQi', 'paidHp', 'heroCost', 'attackerDamage']) expect(prompt).not.toContain(unauthorized);
    expect(world).toEqual(untouched);

    const applied = vi.fn();
    const resolved = settle(world, selected, { modelActors: new Set([owner.id]) }, applied);
    expect(receipt(resolved)?.hero).toMatchObject({ actorId: owner.id, rank: '掌门', move: 'leader-last-stand',
      origin: 'model', paidQi: 18, paidHp: 12, wallSaved: 22 });
    expect(applied).toHaveBeenCalledWith(owner.id, true);
    expect(resolved.decisionTrace.records.find(row => row.tick === resolved.tick && row.actorId === owner.id))
      .toMatchObject({ source: 'model', applied: true, chosenAction: 'redacted', candidates: [] });
  });

  it('rejects nominations, unsupported ranks, fabricated cost and prose, while Utility chooses the same exact scope', async () => {
    const { world, owner, siege } = crisis();
    const permitted = option(siege.id, 'leader-last-stand');
    const bad = [
      { ...permitted, chosenAction: 'REST' }, { ...permitted, targetGrandSiegeId: `${siege.id}-different` },
      { ...permitted, grandSiegeHeroMove: 'elder-rescue' }, { ...permitted, actorId: disciple },
      { ...permitted, targetCultivatorId: disciple }, { ...permitted, wallSaved: 999 },
      { ...permitted, paidHp: 0 }, { ...permitted, innerMonologue: '附上没有发生的舍命台词。' }, [permitted], null,
    ];
    const transport = vi.fn(async () => reply(bad.shift()));
    vi.stubGlobal('fetch', transport);
    while (bad.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    const chosen = chooseGrandSiegeHeroDecision(world, owner);
    expect(chosen).toMatchObject(permitted);
    expect(computeHeuristicDecision(owner, world)).toEqual(chosen);
    expect(receipt(settle(world))?.hero).toMatchObject({ ...{ move: chosen?.grandSiegeHeroMove },
      actorId: owner.id, origin: 'utility' });

    const stale = vi.fn(async () => {
      owner.locationId = world.locations.find(site => site.id !== siege.destinationId)!.id;
      return reply(permitted);
    });
    vi.stubGlobal('fetch', stale);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it('reserves the actual attached actor and queued payment for the player with no model call', async () => {
    const { world, owner, siege } = crisis();
    expect(possessAvatar(world, owner.id)).toBe(true);
    const permitted = option(siege.id, 'leader-last-stand');
    const transport = vi.fn(async () => reply(permitted));
    vi.stubGlobal('fetch', transport);
    const onStart = vi.fn();
    expect(modelDecisionCandidates(world)).not.toContain(owner);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(chooseGrandSiegeHeroDecision(world, owner)).toBeUndefined();
    const held = settle(world, { ...permitted, innerMonologue: '未获玩家许可。' }, { modelActors: new Set([owner.id]) });
    expect(receipt(held)?.hero).toBeUndefined();
    const queued = queueGrandSiegeHero(world, owner.id, siege.id, 'leader-last-stand');
    expect(queued).not.toBe(world);
    const queuedOwner = siegeActor(queued, owner.id);
    expect(modelDecisionCandidates(queued)).not.toContain(queuedOwner);
    await expect(requestCultivatorLLMDecision(queuedOwner, queued, config, queued.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    const paid = settle(queued);
    expect(receipt(paid)?.hero).toMatchObject({ actorId: owner.id, move: 'leader-last-stand', origin: 'player' });
  });

  it('preserves an honored model hold as replay mechanics without creating a public choice or saved payment', () => {
    const { world, owner, siege } = crisis();
    const tape = createDecisionReplayTape(world, 'utility');
    const held = option(siege.id, 'hold');
    const callback = vi.fn();
    const resolved = settle(world, { ...held, innerMonologue: '禁止把模型自述放入回放。' }, { tape, modelActors: new Set([owner.id]) }, callback);
    expect(receipt(resolved)?.hero).toBeUndefined();
    expect(callback).toHaveBeenCalledWith(owner.id, true);
    const trace = resolved.decisionTrace.records.find(row => row.tick === resolved.tick &&
      row.actorId !== owner.id && row.applied && row.chosenCandidateId === 'REST' && row.candidates.some(pick => pick.id === 'CULTIVATE'))!;
    expect(trace).toBeDefined();
    const replay = vi.fn<Parameters<typeof replayOneTurn>[4]>((copy, decisions, mode, onActor, replayDraws,
      replayHeartModelActors, replayForbiddenModelActors, replayGrandSiegeModelActors) => {
      expect(decisions[owner.id]).toEqual({ ...held, innerMonologue: '' });
      expect(replayGrandSiegeModelActors).toEqual(new Set([owner.id]));
      const result = advanceWorldTick(copy, decisions, () => .5, mode, undefined, {
        onActor, replayDraws, replayHeartModelActors, replayForbiddenModelActors, replayGrandSiegeModelActors,
      });
      expect(receipt(result)?.hero).toBeUndefined();
      return result;
    });
    expect(replayOneTurn(tape, resolved, trace.id, 'CULTIVATE', replay)).toMatchObject({ ok: true });
    expect(replay).toHaveBeenCalledTimes(2);
  });
});

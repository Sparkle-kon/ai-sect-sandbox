import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeAvatar, possessAvatar } from '../src/engine/avatarEngine';
import { IMMORTAL_ASCENSION_ADDRESS, ascensionEventId } from '../src/engine/ascensionTerms';
import { availableAutonomousAscensionActions, requestCultivatorLLMDecision, utilityAscensionDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualAscensionOpen, actualAscentThreshold, ascentActor, ascentActorId, ascentMonth, ascentOrder, ascentSite,
  ascentStart, ascentTrial, command } from './ascensionNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://ascension-offline.invalid/v1', apiKey: 'mock', model: 'mock' };
const rest = command('REST');
const reply = (answer: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
const start = { chosenAction: 'ASCENSION', ascensionMove: 'start' } as const;
const guard = (targetAscensionTrialId: string) => ({ chosenAction: 'ASCENSION', ascensionMove: 'guard', targetAscensionTrialId } as const);

function step(world: WorldState, { supplied, model = false, applied }: {
  supplied?: LLMDecisionPayload; model?: boolean; applied?: (id: string, value: boolean) => void;
} = {}) {
  const orders = Object.fromEntries(world.cultivators.filter(row => row.id !== ascentActorId || supplied)
    .map(row => [row.id, row.id === ascentActorId ? supplied ?? rest : rest]));
  return advanceWorldTick(world, orders, () => .2, model ? 'deferred' : 'utility', applied, {
    modelActors: new Set(model ? [ascentActorId] : []),
  });
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('actual native ascension authority in Cognitive and offline Utility', () => {
  it('applies the same exact opening and three individually paid calendar waves without prediction or realm invention', async () => {
    let online = actualAscentThreshold(), offline = structuredClone(online);
    const actor = ascentActor(online);
    expect(modelDecisionCandidates(online)).toContain(actor);
    let chosen: unknown = start;
    const requests: string[] = [];
    const provider = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(init?.body));
      return reply(chosen);
    });
    vi.stubGlobal('fetch', provider);
    for (let turn = 0; turn <= 3; turn++) {
      const current = ascentActor(online);
      chosen = turn ? guard(ascentTrial(online).id) : start;
      expect(modelDecisionCandidates(online)).toContain(current);
      const permitted = availableAutonomousAscensionActions(current, online, online.tick + 1);
      expect(permitted.map(row => row.ascensionMove)).toEqual(turn ? ['guard', 'advance', 'retreat'] : ['start']);
      llmScheduler.resetTickBudget();
      const order = await requestCultivatorLLMDecision(current, online, config, online.tick + 1);
      expect(order).toMatchObject(chosen as object);
      const committed = vi.fn();
      online = step(online, { supplied: order, model: true, applied: committed });
      offline = step(offline);
      expect(committed).toHaveBeenCalledWith(ascentActorId, true);
      expect(online.decisionTrace.records.find(row => row.tick === online.tick && row.actorId === ascentActorId))
        .toMatchObject({ source: 'model', chosenAction: 'redacted', applied: true, candidates: [] });
      expect(online.ascension).toEqual(offline.ascension);
      expect(online.random).toEqual(offline.random);
      expect(ascentActor(online).realm).toBe('渡劫');
      expect(ascentActor(online).realmStage).toBe(9);
      expect(ascentTrial(online).waves).toHaveLength(turn);
      const raw = requests.at(-1)!;
      const prompt = (JSON.parse(raw) as { messages: { content: string }[] }).messages[1].content;
      const menu = JSON.parse(prompt.split('许可：')[1]);
      expect(menu).toContainEqual(chosen);
      if (turn) expect(menu).not.toContainEqual({ chosenAction: 'REST' });
      for (const denied of [actor.name, actor.secretGoal, ascentSite, '"wave"', '"damage"', '"qiPaid"', '"hp"', '"reward"'])
        expect(raw).not.toContain(denied);
    }

    const end = ascentActor(online);
    expect(end).toMatchObject({ alive: true, positionPlane: 'immortal', locationId: IMMORTAL_ASCENSION_ADDRESS, qiProgress: 61 });
    expect(ascentTrial(online).terminal).toMatchObject({ status: 'succeeded', eventId: ascensionEventId(end.id, online.tick, 'succeeded') });
    expect(modelDecisionCandidates(online)).not.toContain(end);
    await expect(requestCultivatorLLMDecision(end, online, config, online.tick + 1)).resolves.toBeUndefined();
    expect(provider).toHaveBeenCalledTimes(4);
    expect(ascentActor(step(online))).toEqual(end);
  });

  it('rejects forged waves, actor substitution, and staleness; pending guided body cannot travel or give a model its monthly choice', async () => {
    const { initial, opening, trial } = actualAscensionOpen(), actor = ascentActor(opening), expected = guard(trial.id);
    const invalid: unknown[] = [
      { ...expected, wave: 3 }, { ...expected, targetCultivatorId: 'npc-3' }, { ...expected, damage: 0 },
      { ...expected, outcome: 'succeeded' }, { ...expected, innerMonologue: '强填已经成仙。' },
      { ...expected, targetLocationId: 'loc-market' }, { ...expected, targetAscensionTrialId: trial.id + '-fake' },
      { ...start, targetAscensionTrialId: trial.id }, { chosenAction: 'REST' }, [expected], null,
    ];
    vi.stubGlobal('fetch', vi.fn(async () => reply(invalid.shift())));
    while (invalid.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor, opening, config, opening.tick + 1)).resolves.toBeUndefined();
    }
    const oldOffer = vi.fn(async () => { actor.locationId = 'loc-market'; return reply(expected); });
    vi.stubGlobal('fetch', oldOffer);
    llmScheduler.resetTickBudget();
    await expect(requestCultivatorLLMDecision(actor, opening, config, opening.tick + 1)).resolves.toBeUndefined();
    actor.locationId = ascentSite;

    vi.stubGlobal('fetch', vi.fn(async () => reply(expected)));
    llmScheduler.resetTickBudget();
    const priorModel = await requestCultivatorLLMDecision(actor, opening, config, opening.tick + 1);
    expect(priorModel).toMatchObject(expected);
    const held = structuredClone(opening);
    expect(possessAvatar(held, ascentActorId)).toBe(true);
    expect(activeAvatar(held)).toBe(ascentActor(held));
    expect(utilityAscensionDecision(ascentActor(held), held)).toBeUndefined();
    const noOrder = vi.fn(async () => reply(expected));
    vi.stubGlobal('fetch', noOrder);
    llmScheduler.resetTickBudget();
    await expect(requestCultivatorLLMDecision(ascentActor(held), held, config, held.tick + 1)).resolves.toBeUndefined();
    expect(noOrder).not.toHaveBeenCalled();
    for (const wrong of [command('EXPLORE', { targetLocationId: 'loc-market' }), command('CULTIVATE'),
      command('BREAKTHROUGH'), command('FACE_TRIBULATION'), priorModel!]) {
      const accepted = vi.fn();
      const waited = step(held, { supplied: wrong, model: wrong === priorModel, applied: accepted });
      expect(accepted).toHaveBeenCalledWith(ascentActorId, false);
      expect(ascentTrial(waited).waves).toEqual([]);
      expect(ascentActor(waited)).toMatchObject({ locationId: ascentSite, qiProgress: 85, hp: ascentActor(initial).hp });
    }
    const guideActed = step(held, { supplied: ascentOrder('guard', trial.id) });
    expect(ascentTrial(guideActed).waves).toHaveLength(1);
    expect(applyCultivatorBrainDecision(guideActed, ascentActor(guideActed), ascentOrder('guard', trial.id))).toBeNull();
    expect(ascentTrial(guideActed).waves).toHaveLength(1);
    const fromOther = ascentActor(guideActed, 'elder-taixu-1');
    const beforeHp = ascentActor(guideActed).hp;
    expect(applyCultivatorBrainDecision(guideActed, fromOther, command('DUEL', { targetCultivatorId: ascentActorId }))).toBeNull();
    expect(ascentActor(guideActed).hp).toBe(beforeHp);
  });

  it('records a genuine annual mortality interruption privately, without a fake wave or successful ending', () => {
    let world = actualAscentThreshold();
    const original = ascentActor(world);
    original.lifespan = original.age + 1; // An otherwise qualified existing body with one natural annual age remaining.
    while (world.month < 11) world = ascentMonth(world);
    world = ascentMonth(world, ascentStart);
    expect(world.month).toBe(12);
    expect(ascentTrial(world).waves).toEqual([]);
    const ended = ascentMonth(world, ascentOrder('guard', ascentTrial(world).id));
    expect(ended.month).toBe(1);
    expect(ascentActor(ended)).toMatchObject({ alive: false, hp: 0, locationId: ascentSite });
    const terminal = ascentTrial(ended).terminal;
    expect(terminal).toMatchObject({ status: 'failed', reason: 'interrupted' });
    expect(ascentTrial(ended).waves).toEqual([]);
    expect(ended.events.find(row => row.id === terminal?.eventId)).toMatchObject({ witnessScope: 'participants', category: 'heavenly' });
    expect(ended.events.some(row => row.id === `evt-${ended.tick}-${ascentActorId}-oldage`)).toBe(true);
    expect(ended.cultivators.flatMap(row => row.rumors).some(row => row.originEventId === terminal?.eventId)).toBe(false);
    expect(ended.chronicleArchive.anchors.some(row => row.id === terminal?.eventId)).toBe(false);
  });
});

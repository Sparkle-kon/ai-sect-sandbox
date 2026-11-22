import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFairModelTurnState } from '../src/engine/fairModelTurnEngine';
import { availableDungeonModelOptions, computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { modelDecisionCandidates, runModelDecisionTurn } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import {
  actualNativeDungeonGate, dungeonActor, dungeonCompanion, dungeonExplorer, dungeonMove, dungeonOccasion,
  dungeonOccasionIn, dungeonOutsider, enterNativeDungeon,
} from './expeditionDungeonNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '按实守候。' };
const wrap = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
const command = (dungeonMove: LLMDecisionPayload['dungeonMove'], targetDungeonRoomId: LLMDecisionPayload['targetDungeonRoomId'] = 'garden') => ({
  chosenAction: 'EXPEDITION_DUNGEON', targetOccasionId: dungeonOccasion, targetDungeonRoomId, dungeonMove,
} as const);
function next(world: WorldState, own: Readonly<Record<string, LLMDecisionPayload>> = {},
  brainIds: readonly string[] = [dungeonExplorer], modelIds: readonly string[] = [], effect?: (id: string, applied: boolean) => void) {
  const options = Object.fromEntries(world.cultivators.flatMap(({ id }) => Object.hasOwn(own, id) ? [[id, own[id]]] :
    brainIds.includes(id) ? [] : [[id, rest]]));
  return advanceWorldTick(world, options, () => .99, 'utility', effect, { modelActors: new Set(modelIds) });
}
beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('strict Cognitive and Utility share only actual scoped dungeon moves', () => {
  it('never opens an old expedition autonomously and sends an exact, private menu for an already opted-in person', async () => {
    const { entered: old, world } = enterNativeDungeon();
    const live = dungeonActor(world);
    const gather = command('gather');
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => wrap(gather));
    vi.stubGlobal('fetch', transport);
    expect(availableDungeonModelOptions(dungeonActor(old), old, old.tick + 1)).toEqual([]);
    expect(modelDecisionCandidates(old)).not.toContain(dungeonActor(old));
    expect(computeHeuristicDecision(dungeonActor(old), old).chosenAction).not.toBe('EXPEDITION_DUNGEON');
    const impostor = { ...command('enter'), innerMonologue: '非本人指令。' };
    const automaticOld = next(old, { [dungeonExplorer]: impostor }, [], [dungeonExplorer]);
    expect(dungeonOccasionIn(automaticOld).dungeon).toBeUndefined();
    await expect(requestCultivatorLLMDecision(dungeonActor(old), old, config, old.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(live, world, config, world.tick)).resolves.toBeUndefined();
    expect(availableDungeonModelOptions(dungeonActor(world, dungeonOutsider), world, world.tick + 1)).toEqual([]);
    expect(transport).not.toHaveBeenCalled();

    const eligible = modelDecisionCandidates(world).filter(row => row.id === live.id);
    expect(eligible).toEqual([live]);
    const batch = await runModelDecisionTurn({ state: createFairModelTurnState(), admission: { slots: 1 }, eligible,
      signal: new AbortController().signal,
      request: (actor, signal, onStart) => requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { signal, onStart }),
    });
    const proposal = batch.orders.get(live.id);
    expect(batch.startedActorIds).toEqual([live.id]);
    expect(proposal).toMatchObject(gather);
    expect(transport).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    const prompt = payload.messages.map(row => row.content).join('\n');
    expect(prompt).toContain(JSON.stringify(gather));
    for (const secret of [live.name, live.secretGoal, 'claim', 'strike', '"actorId"', '"bossHp"', '"locationId"']) {
      expect(prompt).not.toContain(secret);
    }

    const effect = vi.fn();
    const smart = next(world, { [live.id]: proposal! }, [], [live.id], effect);
    const utility = next(world);
    expect(effect).toHaveBeenCalledWith(live.id, true);
    expect(dungeonOccasionIn(smart).dungeon).toEqual(dungeonOccasionIn(utility).dungeon);
    expect(dungeonOccasionIn(smart).dungeon?.steps.at(-1)).toMatchObject({ move: 'gather', tick: smart.tick, jadeLeaf: 1 });
    expect(dungeonActor(smart).herbs).toEqual(dungeonActor(utility).herbs);
    expect(dungeonActor(smart).locationId).toBe(dungeonOccasionIn(world).locationId);
    expect(smart.random).toEqual(utility.random);
    expect(smart.decisionTrace.records.find(row => row.actorId === live.id && row.tick === smart.tick))
      .toMatchObject({ source: 'model', chosenAction: 'redacted', candidates: [], applied: true });
    expect(JSON.stringify(smart.decisionTrace)).not.toContain('targetDungeonRoomId');
  });

  it('rejects free-form prose/effects, another room or actor, and a model alternate after the actual gate changes', async () => {
    const { world } = enterNativeDungeon(), live = dungeonActor(world);
    const good = command('gather');
    const bad = [
      { ...good, innerMonologue: '无中生有的私心。' }, { ...good, hp: 999 }, { ...good, targetLocationId: 'loc-taixu' },
      { ...good, targetOccasionId: 'occasion-8-expedition' }, { ...good, actorId: dungeonOutsider },
      command('claim'), command('gather', 'sanctum'), { ...good, chosenAction: 'REST' }, [good], null,
    ];
    const transport = vi.fn(async () => wrap(bad.shift()));
    vi.stubGlobal('fetch', transport);
    while (bad.length) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(live, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    llmScheduler.resetTickBudget();
    const race = vi.fn(async () => {
      live.locationId = 'loc-market'; // No longer at the same sanctioned gate on provider completion.
      return wrap(good);
    });
    vi.stubGlobal('fetch', race);
    await expect(requestCultivatorLLMDecision(live, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(race).toHaveBeenCalledTimes(1);

    const outsider = dungeonActor(world, dungeonOutsider), oldOutsider = structuredClone(outsider);
    expect(applyCultivatorBrainDecision(world, outsider, { ...good, innerMonologue: '假借后门。' }, () => .03)).toBeNull();
    expect(outsider).toEqual(oldOutsider);
  });

  it('may join an already opted-in party only while the current garden decision is still legal', async () => {
    const { entered } = actualNativeDungeonGate(true);
    const garden = dungeonMove(entered, 'enter', 'garden', dungeonCompanion);
    const peer = dungeonActor(garden);
    const ask = command('enter');
    expect(availableDungeonModelOptions(peer, garden, garden.tick + 1)).toMatchObject([
      { action: 'EXPEDITION_DUNGEON', targetOccasionId: dungeonOccasion, targetDungeonRoomId: 'garden', dungeonMove: 'enter' },
    ]);
    const transport = vi.fn(async () => wrap(ask));
    vi.stubGlobal('fetch', transport);
    const admitted = await requestCultivatorLLMDecision(peer, garden, config, garden.tick + 1);
    expect(admitted).toMatchObject(ask);
    const accepted = next(garden, { [peer.id]: admitted! }, [], [peer.id]); // Leader deliberately waits.
    expect(dungeonOccasionIn(accepted).dungeon?.members.map(row => row.actorId)).toEqual([dungeonCompanion, dungeonExplorer]);
    const effect = vi.fn();
    const retreat = { ...command('retreat'), innerMonologue: '循已知出口返还。' };
    const later = next(garden, { [dungeonCompanion]: retreat, [peer.id]: admitted! }, [], [peer.id], effect);
    expect(effect).toHaveBeenCalledWith(peer.id, false);
    expect(dungeonOccasionIn(later).dungeon).toMatchObject({ room: 'garden', outcome: 'retreated', members: [{ actorId: dungeonCompanion }],
      steps: [{ move: 'enter' }, { move: 'retreat' }] });
  });
});

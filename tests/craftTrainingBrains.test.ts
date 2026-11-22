import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactPanel } from '../src/components/ArtifactPanel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { craftActor, craftFirst, craftKeeper, craftMonth, craftProject, craftSecond,
  prepareNativeCraftTraining } from './craftTrainingNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'craft-fixture' };
const response = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
const offer: LLMDecisionPayload = { chosenAction: 'CRAFT_TRAINING', craftTrainingMove: 'offer',
  targetCultivatorId: craftFirst, targetCraftTraineeId: craftSecond, innerMonologue: '两人分别按真炉位合练。' };
const action = (world: WorldState, craftTrainingMove: 'join' | 'blank' | 'finish'): LLMDecisionPayload => ({
  chosenAction: 'CRAFT_TRAINING', craftTrainingMove, targetCraftTrainingId: craftProject(world)!.id,
  innerMonologue: '本人只做这一道。',
});
afterEach(() => vi.unstubAllGlobals());

describe('two true named work stages in Utility and strict cognitive JSON', () => {
  it('copies only the original two workers, enforces independent consent, and never lets one author the other stage', async () => {
    const before = prepareNativeCraftTraining();
    const keeper = craftActor(before, craftKeeper);
    const provider = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(offer));
    vi.stubGlobal('fetch', provider);
    await expect(requestCultivatorLLMDecision(craftActor(before, craftFirst), before, config, before.tick + 1)).resolves.toBeUndefined();
    for (const extra of [
      { targetCraftTraineeId: craftFirst }, { targetCraftTraineeId: craftKeeper },
      { targetCraftTrainingId: 'other-output' }, { artifactId: 'ghost' }, { qualityScore: 100 },
      { stonesUsed: 0 }, { skill: 100 }, { spokenLine: '代两人同意' },
    ]) {
      provider.mockImplementation(async () => response({ ...offer, ...extra }));
      await expect(requestCultivatorLLMDecision(keeper, before, config, before.tick + 1)).resolves.toBeUndefined();
    }
    provider.mockImplementation(async () => response(offer));
    const planned = await requestCultivatorLLMDecision(keeper, before, config, before.tick + 1);
    expect(planned).toEqual(offer);
    const opened = craftMonth(before, { [craftKeeper]: planned! });
    expect(craftActor(opened, craftKeeper).spiritStones).toBe(keeper.spiritStones);

    const join = action(opened, 'join');
    provider.mockImplementation(async () => response(join));
    await expect(requestCultivatorLLMDecision(craftActor(opened, craftKeeper), opened, config, opened.tick + 1)).resolves.toBeUndefined();
    const yes = await requestCultivatorLLMDecision(craftActor(opened, craftFirst), opened, config, opened.tick + 1);
    expect(yes).toEqual(join);
    const first = craftMonth(opened, { [craftFirst]: yes! });
    expect(craftActor(first, craftKeeper).spiritStones).toBe(keeper.spiritStones);

    const secondTurn = craftMonth(first);
    const apprentice = craftActor(secondTurn, craftSecond);
    apprentice.personality = '苟道';
    const consent = computeHeuristicDecision(apprentice, secondTurn, () => .99);
    expect(consent).toMatchObject({ chosenAction: 'CRAFT_TRAINING', craftTrainingMove: 'join', targetCraftTrainingId: craftProject(first)!.id });
    expect(applyCultivatorBrainDecision(secondTurn, apprentice, consent, () => .99)).not.toBeNull();
    expect(craftActor(secondTurn, craftKeeper).spiritStones).toBe(keeper.spiritStones - 55);

    const blank = action(secondTurn, 'blank');
    provider.mockImplementation(async () => response(blank));
    await expect(requestCultivatorLLMDecision(craftActor(secondTurn, craftSecond), secondTurn, config, secondTurn.tick + 1))
      .resolves.toBeUndefined();
    const firstWork = await requestCultivatorLLMDecision(craftActor(secondTurn, craftFirst), secondTurn, config, secondTurn.tick + 1);
    expect(firstWork).toEqual(blank);
    const onBench = craftMonth(secondTurn, { [craftFirst]: firstWork! });

    const finish = action(onBench, 'finish');
    provider.mockImplementation(async () => response(finish));
    await expect(requestCultivatorLLMDecision(craftActor(onBench, craftFirst), onBench, config, onBench.tick + 1)).resolves.toBeUndefined();
    const finalWork = await requestCultivatorLLMDecision(craftActor(onBench, craftSecond), onBench, config, onBench.tick + 1);
    expect(finalWork).toEqual(finish);
    const done = craftMonth(onBench, { [craftSecond]: finalWork! });
    expect(craftProject(done)?.status).toBe('completed');
    expect(craftActor(done, craftKeeper).artifacts.filter((item) => item.craftTrainingOrigin?.projectId === craftProject(done)!.id))
      .toHaveLength(1);
    const markup = renderToStaticMarkup(createElement(ArtifactPanel, {
      cultivator: craftActor(done, craftKeeper), cultivators: done.cultivators, world: done,
    }));
    expect(markup).toContain(`合练原器：${craftActor(done, craftFirst).name}制坯，${craftActor(done, craftSecond).name}成器。`);
    expect(markup).not.toContain(craftProject(done)!.id);
  });

  it('does not let a cognitive model or ordinary Utility speak on behalf of a currently possessed keeper', async () => {
    const before = prepareNativeCraftTraining();
    const keeper = craftActor(before, craftKeeper);
    expect(possessAvatar(before, craftKeeper)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => response(offer)));
    await expect(requestCultivatorLLMDecision(keeper, before, config, before.tick + 1)).resolves.toBeUndefined();
    expect(computeHeuristicDecision(keeper, before, () => .99).chosenAction).not.toBe('CRAFT_TRAINING');
    expect(applyCultivatorBrainDecision(before, keeper, offer, () => .99)).toBeNull();
    expect(before.craftTraining).toBeUndefined();
  });
});

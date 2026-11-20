import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };
const breakthrough: LLMDecisionPayload = { chosenAction: 'BREAKTHROUGH', innerMonologue: '证道' };

function poised() {
  const world = createInitialWorld();
  const actor = world.cultivators[0];
  actor.realm = '筑基';
  actor.realmStage = 9;
  actor.qiProgress = 100;
  world.cultivators = [actor];
  return { world, actor };
}

describe('world-tick tribulation routing', () => {
  it('intercepts a major breakthrough and enforces the trial even if the next decision attempts to travel', () => {
    let { world, actor } = poised();
    actor.qiProgress = 50;
    expect(applyCultivatorBrainDecision(world, actor, breakthrough, () => 0)).toBeNull();
    expect(actor.realm).toBe('筑基');
    actor.qiProgress = 100;
    const firstDecision = computeHeuristicDecision(actor, world, () => 0.2);
    expect(firstDecision.chosenAction).toBe('BREAKTHROUGH');
    world = advanceWorldTick(world, { [actor.id]: firstDecision }, () => 0.2);
    actor = world.cultivators[0];
    expect(actor.tribulation).toMatchObject({ targetRealm: '金丹', stage: 'lightning', nextWave: 1 });
    expect(actor.realm).toBe('筑基');
    expect(computeHeuristicDecision(actor, world, () => 0.2).chosenAction).toBe('FACE_TRIBULATION');
    const originalLocation = actor.locationId;
    world = advanceWorldTick(world, {
      [actor.id]: { chosenAction: 'EXPLORE', innerMonologue: '赴会', targetLocationId: 'loc-market' },
    }, () => 0.2);
    expect(world.cultivators[0].locationId).toBe(originalLocation);
    expect(world.cultivators[0].currentAction).toBe('FACE_TRIBULATION');
    expect(world.cultivators[0].tribulation?.nextWave).toBe(2);
  });

  it('accepts a valid JSON response stance and rejects unrelated or invented maneuvers', async () => {
    const fixture = poised();
    const world = advanceWorldTick(fixture.world, { [fixture.actor.id]: breakthrough }, () => 0.2);
    const actor = world.cultivators[0];
    let proposed = { chosenAction: 'EXPLORE', innerMonologue: '转身而去', tribulationStance: 'flight' };
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(proposed) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await queryCultivatorLLMDecision(actor, world, config)).chosenAction).toBe('FACE_TRIBULATION');
    proposed = { chosenAction: 'FACE_TRIBULATION', innerMonologue: '凝神观劫', tribulationStance: 'defy' };
    expect(await queryCultivatorLLMDecision(actor, world, config)).toMatchObject({
      chosenAction: 'FACE_TRIBULATION', tribulationStance: 'defy',
    });
    expect(fetchMock.mock.calls[0][1].body).toEqual(expect.stringContaining('自身天劫'));
  });
});

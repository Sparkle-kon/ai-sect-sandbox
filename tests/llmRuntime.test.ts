import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableCouncilPlans } from '../src/engine/councilEngine';
import { collectCouncilBallots } from '../src/engine/councilModel';
import { queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'example-for-test', model: 'fixture-model' };
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 25, completion_tokens: 5 } }));
afterEach(() => vi.unstubAllGlobals());

describe('live-mode instrumentation with mocked providers', () => {
  it('distinguishes blank-key, provider failure, unknown chosenAction and a validated effective action', async () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    const source = vi.fn();
    const fetched = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetched);
    await queryCultivatorLLMDecision(actor, world, { ...config, apiKey: ' ' }, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(fetched).not.toHaveBeenCalled();
    const baseline = llmScheduler.getSnapshot();
    await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(llmScheduler.getSnapshot().outcomes.http_error).toBe(baseline.outcomes.http_error + 1);
    fetched.mockImplementation(async () => response('{"chosenAction":"not an action","innerMonologue":"不采纳"}'));
    await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(llmScheduler.getSnapshot().outcomes.invalid_json).toBe(baseline.outcomes.invalid_json + 1);

    fetched.mockImplementation(async () => response('{"chosenAction":"REST","innerMonologue":"暂且养伤"}'));
    const decision = await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(decision.chosenAction).toBe('REST');
    actor.hp -= 100;
    const observed = vi.fn();
    const next = advanceWorldTick(world, { [actor.id]: decision }, () => 0.9, 'deferred', observed);
    expect(observed).toHaveBeenCalledWith(actor.id, true);
    expect(next.cultivators.find(({ id }) => id === actor.id)?.hp).toBeGreaterThan(actor.hp);
    expect(llmScheduler.getSnapshot().usage.inputTokens - baseline.usage.inputTokens).toBe(50);
  });

  it('applies the same per-tick request cap to NPC decisions and council', async () => {
    const world = createInitialWorld();
    const plan = availableCouncilPlans(world, 'sect-danxia')[0];
    const baseline = llmScheduler.getSnapshot();
    llmScheduler.configure({ maxCallsPerTick: 2, concurrency: 1 });
    llmScheduler.resetTickBudget();
    llmScheduler.beginTick(world.tick);
    const fetchMock = vi.fn(async () => response('{"chosenAction":"REST","opening":"请核对丹册。","vote":"support","reason":"按实调拨"}'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await queryCultivatorLLMDecision(world.cultivators[0], world, config);
      const ballots = await collectCouncilBallots(world, plan, config);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(ballots).toEqual([]);
      const snapshot = llmScheduler.getSnapshot();
      expect(snapshot.byKind.decision - baseline.byKind.decision).toBe(1);
      expect(snapshot.byKind.council - baseline.byKind.council).toBe(1);
      expect(snapshot.outcomes.budget - baseline.outcomes.budget).toBeGreaterThan(0);
    } finally {
      llmScheduler.configure(baseline.settings);
      llmScheduler.resetTickBudget();
    }
  });
});

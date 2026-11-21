import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { llmDecisionEndpoint, queryCultivatorLLMDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import type { LLMConfig } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/team/v1///', apiKey: 'placeholder', model: 'test' };
const result = (a = 'REST') => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ chosenAction: a,
  innerMonologue: '测试输出。' }) } }] }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('provider-only action lane with caller-controlled fallback', () => {
  it('validates the exact provider, reports only actual starts and leaves simulation RNG untouched', async () => {
    const world = createInitialWorld(63);
    const actor = world.cultivators[0];
    const before = world.random.state;
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => result());
    const onStart = vi.fn();
    vi.stubGlobal('fetch', transport);
    const endpoint = llmDecisionEndpoint(config);
    expect(endpoint).toBe('https://provider.invalid/team/v1/chat/completions');
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick, { onStart })).resolves.toMatchObject({ chosenAction: 'REST' });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: 'POST' }));
    transport.mockImplementation(async () => result('INVENT_AN_ACTION'));
    await expect(requestCultivatorLLMDecision(actor, world, config, world.tick)).resolves.toBeUndefined();
    const source = vi.fn();
    const fallback = await queryCultivatorLLMDecision(actor, world, config, source);
    expect(fallback.chosenAction).not.toBe('INVENT_AN_ACTION');
    expect(source).toHaveBeenCalledWith('utility');
    expect(world.random.state).toBe(before);
  });

  it('does not start offline, pre-aborted or aborted queued jobs; ignores a transport success after abort', async () => {
    const world = createInitialWorld(14);
    const [first, second] = world.cultivators;
    const saved = llmScheduler.getSnapshot().settings;
    llmScheduler.configure({ concurrency: 1 });
    llmScheduler.resetTickBudget();
    try {
      let finish: (value: Response) => void = () => { throw new Error('no mocked transport'); };
      const fetched = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => { finish = resolve; }));
      vi.stubGlobal('fetch', fetched);
      const active = new AbortController();
      const queued = new AbortController();
      const prior = new AbortController();
      prior.abort();
      const start = vi.fn();
      await expect(requestCultivatorLLMDecision(first, world, config, world.tick, { signal: prior.signal, onStart: start })).resolves.toBeUndefined();
      await expect(requestCultivatorLLMDecision(first, world, { ...config, enabled: false }, world.tick, { onStart: start })).resolves.toBeUndefined();
      expect(fetched).not.toHaveBeenCalled();
      const activeResult = requestCultivatorLLMDecision(first, world, config, world.tick, { signal: active.signal, onStart: start });
      const queuedResult = requestCultivatorLLMDecision(second, world, config, world.tick, { signal: queued.signal, onStart: start });
      expect(fetched).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      queued.abort();
      await expect(queuedResult).resolves.toBeUndefined();
      active.abort();
      expect(fetched.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      finish(result()); // A fake network that completes despite cancellation cannot produce an accepted decision.
      await expect(activeResult).resolves.toBeUndefined();
      expect(start).toHaveBeenCalledTimes(1);
      expect(fetched).toHaveBeenCalledTimes(1);
    } finally {
      llmScheduler.configure(saved);
      llmScheduler.resetTickBudget();
    }
  });

  it('keeps the original 8-second deadline and detaches the caller AbortSignal listener', async () => {
    vi.useFakeTimers();
    const world = createInitialWorld(86);
    const actor = world.cultivators[0];
    const owner = new AbortController();
    const remove = vi.spyOn(owner.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    const pending = requestCultivatorLLMDecision(actor, world, config, world.tick, { signal: owner.signal });
    await vi.advanceTimersByTimeAsync(7999);
    expect(remove).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(owner.signal.aborted).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});

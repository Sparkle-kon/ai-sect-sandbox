import { describe, expect, it, vi } from 'vitest';
import { LLMScheduler, normalizeLLMUsage } from '../src/engine/llmScheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const response = (value: unknown, ok = true) => ({ ok, json: async () => value } as Response);
const options = { tick: 1, model: 'fixture' };
const init = { headers: { Authorization: 'Bearer fixture-secret' } };
const URL = 'https://example.invalid/fixture';

describe('shared LLM request queue, budgets and runtime telemetry', () => {
  it('uses a shared FIFO concurrency limit across purposes and enforces waiting bounds', async () => {
    const slots = Array.from({ length: 3 }, () => deferred<Response>());
    const fetch = vi.fn(() => slots[fetch.mock.calls.length - 1].promise);
    const scheduler = new LLMScheduler({ fetch, now: () => 0 });
    scheduler.configure({ concurrency: 1, maxQueue: 2 });
    const a = scheduler.requestJson('decision', URL, init, options);
    const b = scheduler.requestJson('council', URL, init, options);
    const c = scheduler.requestJson('chronicle', URL, init, options);
    expect(await scheduler.requestJson('dialogue', URL, init, options)).toEqual({ status: 'queue_full' });
    expect(scheduler.getSnapshot()).toMatchObject({ active: 1, queued: 2, callsStarted: 1 });
    slots[0].resolve(response('first')); expect(await a).toEqual({ status: 'ok', data: 'first' });
    expect(scheduler.getSnapshot().byKind).toMatchObject({ decision: 1, council: 1, chronicle: 0 });
    slots[1].resolve(response('second')); expect(await b).toEqual({ status: 'ok', data: 'second' });
    slots[2].resolve(response('third')); expect(await c).toEqual({ status: 'ok', data: 'third' });
    expect(scheduler.getSnapshot()).toMatchObject({ active: 0, queued: 0, callsStarted: 3, callsSettled: 3 });
    expect(JSON.stringify(scheduler.getSnapshot())).not.toMatch(/fixture-secret|example.invalid/);
  });

  it('keeps tick reservations and session totals across manual batches; explicit world reset renews only tick ledger', async () => {
    const fetch = vi.fn(async () => response({}));
    const scheduler = new LLMScheduler({ fetch });
    scheduler.configure({ maxCallsPerTick: 1, maxCallsPerSession: 3 });
    scheduler.beginTick(1);
    expect((await scheduler.requestJson('decision', URL, {}, options)).status).toBe('ok');
    scheduler.beginTick(1);
    expect(await scheduler.requestJson('council', URL, {}, options)).toEqual({ status: 'budget' });
    scheduler.beginTick(4);
    expect((await scheduler.requestJson('decision', URL, {}, { ...options, tick: 4 })).status).toBe('ok');
    expect(await scheduler.requestJson('chronicle', URL, {}, options)).toEqual({ status: 'budget' });
    scheduler.resetTickBudget();
    expect((await scheduler.requestJson('decision', URL, {}, options)).status).toBe('ok');
    expect(await scheduler.requestJson('reflection', URL, {}, { ...options, tick: 2 })).toEqual({ status: 'budget' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('normalizes provider usage before semantic validation, associates only known prices, and ages the RPM clock', async () => {
    let now = 0;
    const fetch = vi.fn(async () => {
      now += 25;
      return response({ usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 }, malformed: true });
    });
    const scheduler = new LLMScheduler({ fetch, now: () => now });
    scheduler.configure({ prices: { fixture: { inputPerMillion: .5, outputPerMillion: 2 } } });
    expect(await scheduler.requestJson('decision', URL, {}, { ...options, decode: () => undefined })).toEqual({ status: 'invalid_json' });
    const snap = scheduler.getSnapshot();
    expect(snap.usage).toEqual({ inputTokens: 1000, outputTokens: 100, totalTokens: 1100, knownCalls: 1, unknownCalls: 0 });
    expect(snap.pricing.knownCostUsd).toBeCloseTo(.0007);
    expect(snap).toMatchObject({ callsPerMinute: 1, averageLatencyMs: 25, pricing: { pricedCalls: 1, unpricedCalls: 0 } });
    expect(normalizeLLMUsage({usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 }})).toEqual({
      inputTokens: 2, outputTokens: 3, totalTokens: 5,
    });
    now = 60_001; scheduler.refresh(); expect(scheduler.getSnapshot().callsPerMinute).toBe(0);
    expect((await scheduler.requestJson('decision', URL, {}, { ...options, model: 'unpriced' })).status).toBe('ok');
    expect(scheduler.getSnapshot().pricing.unpricedCalls).toBe(1);
  });

  it('distinguishes HTTP, invalid JSON, broken network, and wait abort without making an extra request', async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError(); } })
      .mockRejectedValueOnce(new Error('network denied'));
    const scheduler = new LLMScheduler({ fetch });
    scheduler.configure({ concurrency: 1 });
    const running = scheduler.requestJson('council', URL, {}, options);
    const abort = new AbortController();
    const queued = scheduler.requestJson('reflection', URL, { signal: abort.signal }, options);
    abort.abort();
    expect(await queued).toEqual({ status: 'aborted' });
    pending.resolve(response({ usage: { input_tokens: 2, output_tokens: 1 } }, false));
    expect(await running).toEqual({ status: 'http_error' });
    expect(await scheduler.requestJson('decision', URL, {}, options)).toEqual({ status: 'invalid_json' });
    expect(await scheduler.requestJson('decision', URL, {}, options)).toEqual({ status: 'network_error' });
    expect(scheduler.getSnapshot()).toMatchObject({ active: 0, queued: 0, callsStarted: 3, callsSettled: 3,
      usage: { totalTokens: 3, knownCalls: 1, unknownCalls: 2 }, outcomes: { http_error: 1, invalid_json: 1, network_error: 1, aborted: 1 } });
  });

  it('publishes stable snapshots and separates model acceptance, applied ballots, fallback and stale results', () => {
    const scheduler = new LLMScheduler();
    const listener = vi.fn();
    const cleanup = scheduler.subscribe(listener);
    expect(scheduler.getSnapshot()).toBe(scheduler.getSnapshot());
    scheduler.markDecision('validated', 3);
    scheduler.markDecision('applied', 1);
    scheduler.markDecision('stale', 2);
    scheduler.markDecision('local_fallback', 1);
    scheduler.markDecision('simulation_rejected', 1);
    expect(scheduler.getSnapshot().decisions).toEqual({ validated: 3, applied: 1, local_fallback: 1, stale: 2, simulation_rejected: 1 });
    expect(listener).toHaveBeenCalledTimes(5);
    cleanup();
    scheduler.markDecision('stale');
    expect(listener).toHaveBeenCalledTimes(5);
  });
});

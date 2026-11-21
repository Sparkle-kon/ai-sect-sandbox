import { describe, expect, it, vi } from 'vitest';
import { LLMScheduler } from '../src/engine/llmScheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const endpoint = 'https://rate-limited.invalid/completions';
const other = 'https://other.invalid/completions';
const options = { tick: 1, model: 'fixture' };
const success = () => Response.json({ result: 1 });
const rateLimited = (after?: string) => new Response(null, { status: 429, headers: after === undefined ? {} : { 'Retry-After': after } });

describe('shared decision admission and endpoint cooldown', () => {
  it('reflects unreserved tick/session budgets and real shared queue capacity across kinds', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(success());
    const scheduler = new LLMScheduler({ fetch });
    scheduler.configure({ concurrency: 1, maxQueue: 1, maxCallsPerTick: 3, maxCallsPerSession: 3 });
    expect(scheduler.decisionAdmission(1, endpoint)).toEqual({ slots: 2, reason: 'queue' });
    const firstCall = scheduler.requestJson('council', endpoint, {}, options);
    expect(scheduler.decisionAdmission(1, endpoint)).toEqual({ slots: 1, reason: 'queue' });
    const secondCall = scheduler.requestJson('reflection', other, {}, options);
    expect(scheduler.decisionAdmission(1, endpoint)).toEqual({ slots: 0, reason: 'queue' });
    expect(fetch).toHaveBeenCalledTimes(1);
    first.resolve(success()); await firstCall;
    expect(scheduler.decisionAdmission(1, endpoint)).toEqual({ slots: 1, reason: 'budget' });
    second.resolve(success()); await secondCall;
    expect(await scheduler.requestJson('decision', endpoint, {}, options)).toMatchObject({ status: 'ok' });
    expect(scheduler.decisionAdmission(2, endpoint)).toEqual({ slots: 0, reason: 'budget' });
  });

  it('calls the start hook once per fetch, isolates observer errors, and keeps an ignored-abort fetch occupying its slot', async () => {
    const first = deferred<Response>();
    const sequence: string[] = [];
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementationOnce(() => { sequence.push('first fetch'); return first.promise; })
      .mockImplementationOnce(async () => { sequence.push('second fetch'); return success(); });
    const scheduler = new LLMScheduler({ fetch });
    scheduler.configure({ concurrency: 1, maxQueue: 2 });
    const running = scheduler.requestJson('decision', endpoint, { signal: controller.signal }, { ...options, onStart: () => {
      sequence.push('first hook');
      throw Error('observer');
    } });
    const second = scheduler.requestJson('decision', other, {}, { ...options, onStart: () => sequence.push('second hook') });
    const queuedAbort = new AbortController();
    const never = vi.fn();
    const third = scheduler.requestJson('chronicle', endpoint, { signal: queuedAbort.signal }, { ...options, onStart: never });
    controller.abort();
    queuedAbort.abort();
    expect(await third).toEqual({ status: 'aborted' });
    expect(never).not.toHaveBeenCalled();
    expect(sequence).toEqual(['first hook', 'first fetch']);
    expect(scheduler.getSnapshot()).toMatchObject({ active: 1, queued: 1 });
    first.resolve(success());
    expect(await running).toEqual({ status: 'aborted' });
    expect(await second).toMatchObject({ status: 'ok' });
    expect(sequence).toEqual(['first hook', 'first fetch', 'second hook', 'second fetch']);
  });

  it('drops queued work for the exact provider on 429, leaves other endpoints FIFO, and starts nothing when time advances', async () => {
    let now = 100_000;
    const first = deferred<Response>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockImplementation(async () => success());
    const scheduler = new LLMScheduler({ fetch, now: () => now });
    scheduler.configure({ concurrency: 1, maxQueue: 4 });
    const sending = scheduler.requestJson('decision', endpoint, { headers: { Authorization: 'fixture-secret' } }, options);
    const never = vi.fn();
    const dropped = scheduler.requestJson('council', new URL(endpoint), {}, { ...options, onStart: never });
    const unaffected = scheduler.requestJson('dialogue', other, {}, options);
    first.resolve(rateLimited('8'));
    expect(await sending).toEqual({ status: 'backoff' });
    expect(await dropped).toEqual({ status: 'backoff' });
    expect(await unaffected).toMatchObject({ status: 'ok' });
    expect(never).not.toHaveBeenCalled();
    expect(scheduler.decisionAdmission(2, endpoint)).toEqual({ slots: 0, reason: 'backoff' });
    expect(await scheduler.requestJson('avatar', endpoint, {}, options)).toEqual({ status: 'backoff' });
    expect(scheduler.getSnapshot().outcomes.backoff).toBe(3);
    expect(JSON.stringify(scheduler.getSnapshot())).not.toMatch(/fixture-secret|rate-limited\.invalid|Retry-After|108000/);
    now += 8000;
    expect(scheduler.decisionAdmission(2, endpoint).slots).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await scheduler.requestJson('decision', endpoint, {}, { ...options, tick: 2 })).toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    [undefined, 5000], ['bogus', 5000], ['0', 1000], ['1500000', 60_000],
    [new Date(130_000).toUTCString(), 30_000], [new Date(90_000).toUTCString(), 1000],
  ] as const)('bounds Retry-After %s to a deterministic quiet interval of %i ms', async (header, delay) => {
    let now = 100_000;
    const fetch = vi.fn(async () => rateLimited(header));
    const scheduler = new LLMScheduler({ fetch, now: () => now });
    expect(await scheduler.requestJson('decision', endpoint, {}, options)).toEqual({ status: 'backoff' });
    now += delay - 1;
    expect(scheduler.decisionAdmission(1, endpoint)).toEqual({ slots: 0, reason: 'backoff' });
    now++;
    expect(scheduler.decisionAdmission(1, endpoint).slots).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

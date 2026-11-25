export type LLMCallKind = 'decision' | 'reflection' | 'dialogue' | 'council' | 'chronicle' | 'avatar' | 'sect_chat' | 'sect_chat_intent' | 'sect_report';
export type LLMRequestStatus = 'ok' | 'budget' | 'queue_full' | 'backoff' | 'http_error' | 'invalid_json' | 'network_error' | 'aborted';
export interface LLMDecisionAdmission { slots: number; reason?: 'budget' | 'queue' | 'backoff' }
export type LLMDecisionMetric = 'validated' | 'applied' | 'local_fallback' | 'stale' | 'simulation_rejected';
export type LLMRequestResult<T> = { status: 'ok'; data: T } | { status: Exclude<LLMRequestStatus, 'ok'> };
export interface LLMModelPrice { inputPerMillion: number; outputPerMillion: number }
export interface LLMSchedulerSettings {
  concurrency: number;
  maxCallsPerTick: number;
  maxCallsPerSession: number;
  maxQueue: number;
  prices: Record<string, LLMModelPrice>;
}
export interface LLMSchedulerSnapshot {
  settings: LLMSchedulerSettings;
  active: number;
  queued: number;
  callsStarted: number;
  callsSettled: number;
  callsPerMinute: number;
  averageLatencyMs: number | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; knownCalls: number; unknownCalls: number };
  pricing: { knownCostUsd: number; pricedCalls: number; unpricedCalls: number };
  outcomes: Record<LLMRequestStatus, number>;
  decisions: Record<LLMDecisionMetric, number>;
  byKind: Record<LLMCallKind, number>;
}
interface LLMRequestOptions<T> { tick: number; model: string; decode?: (json: unknown) => T | undefined; onStart?: () => void }
interface SchedulerDependencies {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}
interface Pending {
  endpoint: string;
  signal: AbortSignal | null | undefined;
  start: () => void;
  cleanup: () => void;
  abort: () => void;
  reject: (status: 'aborted' | 'backoff') => void;
}

export const DEFAULT_LLM_SCHEDULER_SETTINGS: LLMSchedulerSettings = {
  concurrency: 3, maxCallsPerTick: 36, maxCallsPerSession: 250, maxQueue: 80, prices: {},
};
const TICK_LEDGER_LIMIT = 32;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_HISTORY = 5000;
const DEFAULT_BACKOFF_MS = 5000;
const inputEndpoint = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
function retryBackoff(header: string | null | undefined, now: number): number {
  const value = header?.trim();
  if (!value) return DEFAULT_BACKOFF_MS;
  const ms = /^[0-9]+$/.test(value) ? Number(value) * 1000 :
    /[A-Za-z]/.test(value) ? Date.parse(value) - now : NaN;
  return Number.isNaN(ms) ? DEFAULT_BACKOFF_MS : Math.max(1000, Math.min(60_000, ms));
}
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const token = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

export function normalizeLLMUsage(json: unknown): { inputTokens?: number; outputTokens?: number; totalTokens?: number } {
  const payload = object(json);
  const usage = object(payload?.usage) ?? object(payload?.usageMetadata);
  if (!usage) return {};
  const inputTokens = token(usage.prompt_tokens) ?? token(usage.input_tokens) ?? token(usage.promptTokenCount);
  const outputTokens = token(usage.completion_tokens) ?? token(usage.output_tokens) ?? token(usage.candidatesTokenCount);
  const totalTokens = token(usage.total_tokens) ?? token(usage.totalTokenCount) ??
    (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined);
  return { inputTokens, outputTokens, totalTokens };
}

const limit = (value: number | undefined, min: number, max: number, previous: number) =>
  value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : previous;
const validRate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000;

export class LLMScheduler {
  private settings: LLMSchedulerSettings = { ...DEFAULT_LLM_SCHEDULER_SETTINGS, prices: {} };
  private readonly fetcher: NonNullable<SchedulerDependencies['fetch']>;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly queue: Pending[] = [];
  private readonly budgets = new Map<number, number>();
  private readonly cooldowns = new Map<string, number>();
  private readonly starts: number[] = [];
  private readonly usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, knownCalls: 0, unknownCalls: 0 };
  private readonly pricing = { knownCostUsd: 0, pricedCalls: 0, unpricedCalls: 0 };
  private readonly outcomes: Record<LLMRequestStatus, number> = {
    ok: 0, budget: 0, queue_full: 0, backoff: 0, http_error: 0, invalid_json: 0, network_error: 0, aborted: 0,
  };
  private readonly decisions: Record<LLMDecisionMetric, number> = { validated: 0, applied: 0, local_fallback: 0, stale: 0, simulation_rejected: 0 };
  private readonly byKind: Record<LLMCallKind, number> = { decision: 0, reflection: 0, dialogue: 0, council: 0, chronicle: 0, avatar: 0, sect_chat: 0, sect_chat_intent: 0, sect_report: 0 };
  private active = 0;
  private admitted = 0;
  private draining = false;
  private callsStarted = 0;
  private callsSettled = 0;
  private latencySum = 0;
  private highestTick = -1;
  private snapshot!: LLMSchedulerSnapshot;

  constructor(dependencies: SchedulerDependencies = {}) {
    this.fetcher = dependencies.fetch ?? ((input, init) => fetch(input, init));
    this.now = dependencies.now ?? (() => Date.now());
    this.publish();
  }

  /** Applies to future admissions; existing in-flight requests are never interrupted by settings changes. */
  configure(patch: Partial<LLMSchedulerSettings>): void {
    const prices = patch.prices === undefined ? this.settings.prices : Object.fromEntries(Object.entries(patch.prices).slice(0, 128)
      .filter(([name, price]) => name.length > 0 && name.length <= 120 && price && validRate(price.inputPerMillion) && validRate(price.outputPerMillion))
      .map(([name, price]) => [name, { ...price }]));
    this.settings = {
      concurrency: limit(patch.concurrency, 1, 8, this.settings.concurrency),
      maxCallsPerTick: limit(patch.maxCallsPerTick, 1, 100, this.settings.maxCallsPerTick),
      maxCallsPerSession: limit(patch.maxCallsPerSession, 1, 5000, this.settings.maxCallsPerSession),
      maxQueue: limit(patch.maxQueue, 1, 200, this.settings.maxQueue),
      prices,
    };
    this.drain();
    this.publish();
  }

  beginTick(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) return;
    this.highestTick = Math.max(this.highestTick, tick);
    for (const old of this.budgets.keys()) if (old <= this.highestTick - TICK_LEDGER_LIMIT) this.budgets.delete(old);
  }

  /** A world reset starts a new tick ledger, but does not restore the app session budget. */
  resetTickBudget(): void {
    this.budgets.clear();
    this.highestTick = -1;
  }

  getSnapshot = (): LLMSchedulerSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  refresh = (): void => {
    this.pruneRate();
    if (this.snapshot.callsPerMinute !== this.starts.length) this.publish();
  };

  markDecision(outcome: LLMDecisionMetric, units = 1): void {
    if (!Object.hasOwn(this.decisions, outcome) || !Number.isSafeInteger(units) || units <= 0) return;
    this.decisions[outcome] += units;
    this.publish();
  }

  private remainingBudget(tick: number): number {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick <= this.highestTick - TICK_LEDGER_LIMIT) return 0;
    return Math.max(0, Math.min(this.settings.maxCallsPerSession - this.admitted,
      this.settings.maxCallsPerTick - (this.budgets.get(tick) ?? 0)));
  }

  private availableQueueSlots(): number {
    return Math.max(0, Math.max(0, this.settings.concurrency - this.active) + this.settings.maxQueue - this.queue.length);
  }

  /** Advisory admission without reservations or provider activity. Actual requests still recheck. */
  decisionAdmission(tick: number, endpoint: string): LLMDecisionAdmission {
    if (this.coolingDown(endpoint)) return { slots: 0, reason: 'backoff' };
    const budget = this.remainingBudget(tick);
    const capacity = this.availableQueueSlots();
    return { slots: Math.min(budget, capacity), reason: budget <= capacity ? 'budget' : 'queue' };
  }

  requestJson<T = unknown>(kind: LLMCallKind, input: RequestInfo | URL, init: RequestInit,
    options: LLMRequestOptions<T>): Promise<LLMRequestResult<T>> {
    const early = (status: 'budget' | 'queue_full' | 'aborted' | 'backoff') => {
      this.outcomes[status]++;
      this.publish();
      return Promise.resolve<LLMRequestResult<T>>({ status });
    };
    const signal = init.signal === undefined && typeof input !== 'string' && 'signal' in input ? input.signal : init.signal;
    if (signal?.aborted) return early('aborted');
    const ownedInit = signal === init.signal ? init : { ...init, signal };
    const endpoint = inputEndpoint(input);
    const tick = options.tick;
    const admission = this.decisionAdmission(tick, endpoint);
    if (!admission.slots) return early(admission.reason === 'backoff' ? 'backoff' : admission.reason === 'queue' ? 'queue_full' : 'budget');
    this.beginTick(tick);
    this.budgets.set(tick, (this.budgets.get(tick) ?? 0) + 1);
    this.admitted++;
    return new Promise<LLMRequestResult<T>>((resolve) => {
      const pending: Pending = {
        endpoint,
        signal,
        start: () => {
          this.active++;
          this.callsStarted++;
          this.byKind[kind]++;
          const startedAt = this.now();
          const price = Object.hasOwn(this.settings.prices, options.model) ? this.settings.prices[options.model] : undefined;
          this.starts.push(startedAt);
          void this.execute(endpoint, input, ownedInit, options).then(({ result, json }) => {
            this.callsSettled++;
            this.active--;
            this.latencySum += Math.max(0, this.now() - startedAt);
            const usage = normalizeLLMUsage(json);
            this.usage.inputTokens += usage.inputTokens ?? 0;
            this.usage.outputTokens += usage.outputTokens ?? 0;
            this.usage.totalTokens += usage.totalTokens ?? 0;
            if (usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined) this.usage.knownCalls++;
            else this.usage.unknownCalls++;
            if (price && usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
              this.pricing.pricedCalls++;
              this.pricing.knownCostUsd += (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000;
            } else this.pricing.unpricedCalls++;
            this.outcomes[result.status]++;
            this.drain();
            this.publish();
            resolve(result);
          });
          this.publish();
        },
        cleanup: () => signal?.removeEventListener('abort', pending.abort),
        abort: () => {
          const i = this.queue.indexOf(pending);
          if (i < 0) return;
          this.queue.splice(i, 1);
          pending.reject('aborted');
          this.publish();
        },
        reject: (status) => {
          pending.cleanup();
          this.outcomes[status]++;
          resolve({ status });
        },
      };
      this.queue.push(pending);
      signal?.addEventListener('abort', pending.abort, { once: true });
      this.drain();
      this.publish();
    });
  }

  private async execute<T>(endpoint: string, input: RequestInfo | URL, init: RequestInit, options: LLMRequestOptions<T>): Promise<{
    result: LLMRequestResult<T>; json?: unknown;
  }> {
    let response: Response;
    try {
      try { options.onStart?.(); } catch { /* Observers do not govern provider requests. */ }
      response = await this.fetcher(input, init);
    } catch (error) {
      return { result: { status: init.signal?.aborted || (error instanceof Error && error.name === 'AbortError') ? 'aborted' : 'network_error' } };
    }
    if (response.status === 429) {
      this.startCooldown(endpoint, response.headers?.get('Retry-After'));
      try { void response.body?.cancel().catch(() => undefined); } catch { /* An error body is optional. */ }
      return { result: { status: init.signal?.aborted ? 'aborted' : 'backoff' } };
    }
    if (init.signal?.aborted) return { result: { status: 'aborted' } };
    if (!response.ok) {
      let json: unknown;
      try { json = await response.json(); } catch { /* An error response need not contain JSON. */ }
      return { result: { status: init.signal?.aborted ? 'aborted' : 'http_error' }, json };
    }
    let json: unknown;
    try {
      json = await response.json();
      if (init.signal?.aborted) return { result: { status: 'aborted' }, json };
      const data = options.decode ? options.decode(json) : json as T;
      return { result: data === undefined ? { status: 'invalid_json' } : { status: 'ok', data }, json };
    } catch (error) {
      return { result: { status: init.signal?.aborted || (error instanceof Error && error.name === 'AbortError') ? 'aborted' : 'invalid_json' }, json };
    }
  }

  private coolingDown(endpoint: string): boolean {
    const now = this.now();
    for (const [key, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(key);
    return this.cooldowns.has(endpoint);
  }

  private startCooldown(endpoint: string, header: string | null | undefined): void {
    const now = this.now();
    const until = now + retryBackoff(header, now);
    this.cooldowns.set(endpoint, Math.max(until, this.cooldowns.get(endpoint) ?? 0));
    // Reject waiting work immediately rather than allowing it to skip the cooldown later.
    // Requests already at the provider still hold their concurrency slot until settled.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const pending = this.queue[i];
      if (pending.endpoint !== endpoint) continue;
      this.queue.splice(i, 1);
      pending.reject(pending.signal?.aborted ? 'aborted' : 'backoff');
    }
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.active < this.settings.concurrency && this.queue.length) {
        const head = this.queue.shift()!;
        if (head.signal?.aborted) head.reject('aborted');
        else if (this.coolingDown(head.endpoint)) head.reject('backoff');
        else {
          head.cleanup();
          head.start();
        }
      }
    } finally { this.draining = false; }
  }
  private pruneRate(): void {
    const cut = this.now() - RATE_WINDOW_MS;
    while (this.starts.length && (this.starts[0] <= cut || this.starts.length > MAX_RATE_HISTORY)) this.starts.shift();
  }
  private publish(): void {
    this.pruneRate();
    this.snapshot = {
      settings: { ...this.settings, prices: structuredClone(this.settings.prices) }, active: this.active, queued: this.queue.length,
      callsStarted: this.callsStarted, callsSettled: this.callsSettled, callsPerMinute: this.starts.length,
      averageLatencyMs: this.callsSettled ? this.latencySum / this.callsSettled : null, usage: { ...this.usage },
      pricing: { ...this.pricing }, outcomes: { ...this.outcomes }, decisions: { ...this.decisions }, byKind: { ...this.byKind },
    };
    for (const listener of this.listeners) {
      try { listener(); } catch { /* UI observer errors cannot block the queue. */ }
    }
  }
}

export const llmScheduler = new LLMScheduler();

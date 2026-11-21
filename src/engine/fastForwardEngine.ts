import type { WorldState } from '../types/world';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { advanceWorldTick } from './worldEngine';
import { sameGeneratedWorld } from './worldIdentity';

export const FAST_FORWARD_MAX_TICKS = 120;
export const FAST_FORWARD_CHUNK_TICKS = 2;
export const FAST_FORWARD_CHUNK_MS = 16;

export interface FastForwardProgress {
  startTick: number;
  currentTick: number;
  requestedTicks: number;
  completedTicks: number;
  living: number;
  totalActors: number;
  processingMs: number;
  maxTickMs: number;
  maxChunkMs: number;
}
export interface FastForwardCheckpoint {
  startTick: number;
  requestedTicks: number;
  completedTicks: number;
  baseRandomState: number;
  baseInterventionSequence: number;
  world: WorldState;
}
export type FastForwardWorkerRequest =
  | { type: 'start'; runId: string; base: WorldState; requestedTicks: number }
  | { type: 'pause' | 'resume' | 'stage' | 'cancel'; runId: string };
export type FastForwardWorkerResponse =
  | { type: 'progress' | 'paused'; runId: string; progress: FastForwardProgress }
  | { type: 'staged'; runId: string; progress: FastForwardProgress; checkpoint: FastForwardCheckpoint }
  | { type: 'error'; runId: string; message: string }
  | { type: 'cancelled'; runId: string };

export class FastForwardError extends Error {
  constructor(readonly code: 'invalid_count' | 'execution', text: string) {
    super(text);
    this.name = 'FastForwardError';
  }
}
export interface FastForwardRunner {
  readProgress(): FastForwardProgress;
  advanceChunk(): FastForwardProgress;
  checkpoint(): FastForwardCheckpoint | undefined;
}

export const validFastForwardCount = (requestedTicks: number): boolean =>
  Number.isSafeInteger(requestedTicks) && requestedTicks >= 1 && requestedTicks <= FAST_FORWARD_MAX_TICKS;

/** No branch, App callback, provider configuration, or caller-owned RNG ever enters this runner. */
export function createFastForwardRunner(base: WorldState, requestedTicks: number,
  { now = () => performance.now() }: { now?: () => number } = {}): FastForwardRunner {
  if (!validFastForwardCount(requestedTicks) || !Number.isSafeInteger(base.tick + requestedTicks)) {
    throw new FastForwardError('invalid_count', `快进轮数须为 1 至 ${FAST_FORWARD_MAX_TICKS} 的整数。`);
  }
  let world = cloneWorldWithColdHistory(base);
  const startTick = base.tick;
  const baseRandomState = base.random.state;
  const baseInterventionSequence = base.interventionSequence;
  let processingMs = 0, maxTickMs = 0, maxChunkMs = 0;
  const readProgress = (): FastForwardProgress => ({
    startTick, currentTick: world.tick, requestedTicks, completedTicks: world.tick - startTick,
    living: world.cultivators.reduce((count, actor) => count + Number(actor.alive && actor.hp > 0), 0),
    totalActors: world.cultivators.length, processingMs, maxTickMs, maxChunkMs,
  });
  return {
    readProgress,
    advanceChunk() {
      if (world.tick - startTick >= requestedTicks) return readProgress();
      const chunkStart = now();
      for (let turns = 0; turns < FAST_FORWARD_CHUNK_TICKS && world.tick - startTick < requestedTicks; turns++) {
        const tickStart = now();
        let next: WorldState;
        try { next = advanceWorldTick(world, undefined, undefined, 'utility'); }
        catch { throw new FastForwardError('execution', '规则脑未完成本轮，当前时间线未改变。'); }
        if (next.tick !== world.tick + 1 || next.cultivators.length < world.cultivators.length ||
            next.interventionSequence !== baseInterventionSequence || !sameGeneratedWorld(world, next)) {
          throw new FastForwardError('execution', '演算结果未能通过连续轮次校验，当前时间线未改变。');
        }
        world = next;
        const tickEnd = now();
        maxTickMs = Math.max(maxTickMs, tickEnd - tickStart);
        if (tickEnd - chunkStart >= FAST_FORWARD_CHUNK_MS) break;
      }
      const elapsed = Math.max(0, now() - chunkStart);
      processingMs += elapsed;
      maxChunkMs = Math.max(maxChunkMs, elapsed);
      return readProgress();
    },
    checkpoint() {
      const completedTicks = world.tick - startTick;
      return completedTicks > 0 ? { startTick, requestedTicks, completedTicks, baseRandomState,
        baseInterventionSequence, world: cloneWorldWithColdHistory(world) } : undefined;
    },
  };
}

/** Small injectable Worker state machine: only completed chunks become observable, never a live mutation. */
export function createFastForwardWorkerController(options: {
  post: (response: FastForwardWorkerResponse) => void;
  schedule: (callback: () => void) => unknown;
  cancelSchedule: (handle: unknown) => void;
  now?: () => number;
}): (request: FastForwardWorkerRequest) => void {
  const { post, schedule, cancelSchedule } = options;
  let job: { runId: string; runner: FastForwardRunner; paused: boolean; scheduled: boolean; ticket: number; handle?: unknown } | undefined;
  const stop = () => {
    if (job?.scheduled) cancelSchedule(job.handle);
    job = undefined;
  };
  const fail = (runId: string, error: unknown) => {
    stop();
    post({ type: 'error', runId, message: error instanceof FastForwardError ? error.message : '快进无法继续，原分支未改动。' });
  };
  function stage(current: NonNullable<typeof job>) {
    const checkpoint = current.runner.checkpoint();
    if (!checkpoint) return;
    const progress = current.runner.readProgress();
    stop();
    post({ type: 'staged', runId: current.runId, progress, checkpoint });
  }
  function queue() {
    const current = job;
    if (!current || current.paused || current.scheduled) return;
    current.scheduled = true;
    const ticket = ++current.ticket;
    current.handle = schedule(() => {
      if (job !== current || current.paused || current.ticket !== ticket) return;
      current.scheduled = false;
      try {
        const progress = current.runner.advanceChunk();
        if (progress.completedTicks === progress.requestedTicks) { stage(current); return; }
        post({ type: 'progress', runId: current.runId, progress });
        queue();
      } catch (error) { fail(current.runId, error); }
    });
  }
  return (request) => {
    if (!request || typeof request.runId !== 'string' || !request.runId || request.runId.length > 96) return;
    if (request.type === 'start') {
      if (job) return;
      try {
        const runner = createFastForwardRunner(request.base, request.requestedTicks, { now: options.now });
        job = { runId: request.runId, runner, paused: false, scheduled: false, ticket: 0 };
        post({ type: 'progress', runId: request.runId, progress: runner.readProgress() });
        queue();
      } catch (error) { fail(request.runId, error); }
      return;
    }
    const current = job;
    if (!current || current.runId !== request.runId) return;
    if (request.type === 'cancel') { stop(); post({ type: 'cancelled', runId: request.runId }); return; }
    if (request.type === 'pause' && !current.paused) {
      current.paused = true;
      if (current.scheduled) { cancelSchedule(current.handle); current.scheduled = false; current.ticket += 1; }
      post({ type: 'paused', runId: current.runId, progress: current.runner.readProgress() });
    } else if (request.type === 'resume' && current.paused) {
      current.paused = false;
      post({ type: 'progress', runId: current.runId, progress: current.runner.readProgress() });
      queue();
    } else if (request.type === 'stage' && current.paused) {
      try { stage(current); }
      catch (error) { fail(current.runId, error); }
    }
  };
}

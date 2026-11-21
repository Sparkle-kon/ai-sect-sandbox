import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createFastForwardRunner, createFastForwardWorkerController, FAST_FORWARD_MAX_TICKS } from '../src/engine/fastForwardEngine';
import type { FastForwardCheckpoint, FastForwardWorkerResponse } from '../src/engine/fastForwardEngine';
import { encodeWorldSave } from '../src/engine/storageEngine';
import { createTimeline, forkTimelineCheckpoint, readTimelineHead, readTimelineSnapshot, selectTimelineBranch } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';

function ordinary(base: WorldState, count: number): WorldState {
  let result = base;
  for (let i = 0; i < count; i++) result = advanceWorldTick(result, undefined, undefined, 'utility');
  return result;
}

describe('pause-safe deterministic isolated fast forward', () => {
  it('matches the exact ordinary seeded Utility path, including trace and world UI state', () => {
    const base = createInitialWorld(2918);
    const old = encodeWorldSave(base);
    const count = 14;
    let clock = 0;
    const runner = createFastForwardRunner(base, count, { now: () => clock += 10 });
    expect(runner.checkpoint()).toBeUndefined();
    expect(runner.readProgress()).toMatchObject({ currentTick: base.tick, completedTicks: 0 });
    expect(runner.advanceChunk()).toMatchObject({ currentTick: base.tick + 1, completedTicks: 1 });
    const early = runner.checkpoint()!;
    while (runner.readProgress().completedTicks < count) runner.advanceChunk();
    const final = runner.checkpoint()!;
    expect(final.world).toEqual(ordinary(base, count));
    expect(encodeWorldSave(final.world)).toEqual(encodeWorldSave(ordinary(base, count)));
    expect(final.world.decisionTrace.records.length).toBeGreaterThan(0);
    expect(new Set(final.world.cultivators.map(({ id }) => id)).size).toBe(final.world.cultivators.length);
    expect(early.world.tick).toBe(2);
    expect(encodeWorldSave(base)).toEqual(old);
    expect(runner.advanceChunk().completedTicks).toBe(count);
    for (const invalid of [0, 1.5, -1, FAST_FORWARD_MAX_TICKS + 1]) expect(() => createFastForwardRunner(base, invalid)).toThrow();
  });

  it('pauses at a complete chunk, rejects stale jobs, resumes deterministically and stages an exact partial checkpoint', () => {
    const base = createInitialWorld(811);
    const events: FastForwardWorkerResponse[] = [];
    const scheduled = new Map<number, () => void>();
    let count = 0;
    const receive = createFastForwardWorkerController({
      post: (event) => events.push(event), now: () => 0,
      schedule: (callback) => { scheduled.set(++count, callback); return count; },
      cancelSchedule: (handle) => { scheduled.delete(handle as number); },
    });
    const turn = () => {
      const [id, callback] = [...scheduled][0];
      scheduled.delete(id);
      callback();
    };
    receive({ type: 'start', runId: 'verified', base, requestedTicks: 8 });
    receive({ type: 'pause', runId: 'other' });
    turn();
    expect(events.at(-1)).toMatchObject({ type: 'progress', progress: { completedTicks: 2 } });
    const staleTimer = [...scheduled.values()][0];
    receive({ type: 'pause', runId: 'verified' });
    expect(events.at(-1)).toMatchObject({ type: 'paused', progress: { completedTicks: 2 } });
    expect(scheduled.size).toBe(0);
    receive({ type: 'resume', runId: 'verified' });
    staleTimer();
    expect(events.at(-1)).toMatchObject({ type: 'progress', progress: { completedTicks: 2 } });
    turn();
    receive({ type: 'pause', runId: 'verified' });
    receive({ type: 'stage', runId: 'verified' });
    const staged = events.at(-1);
    expect(staged).toMatchObject({ type: 'staged', checkpoint: { completedTicks: 4 }, progress: { currentTick: 5 } });
    if (staged?.type !== 'staged') throw new Error('Missing verified checkpoint');
    expect(staged.checkpoint.world).toEqual(ordinary(base, 4));
    receive({ type: 'cancel', runId: 'verified' });
    expect(events.at(-1)).toBe(staged);

    receive({ type: 'start', runId: 'cancel-me', base, requestedTicks: 9 });
    const stale = [...scheduled.values()][0];
    receive({ type: 'cancel', runId: 'cancel-me' });
    stale();
    expect(events.at(-1)).toEqual({ type: 'cancelled', runId: 'cancel-me' });
    expect(scheduled.size).toBe(0);
  });

  it('requires a matching replay checkpoint and writes only a new isolated branch, never fabricated history or removals', () => {
    const base = createInitialWorld(520);
    const original = createTimeline(base);
    const run = createFastForwardRunner(base, 5, { now: () => 0 });
    run.advanceChunk(); run.advanceChunk(); run.advanceChunk();
    const final = run.checkpoint()!;
    const forked = forkTimelineCheckpoint(original, 'main', base.tick, final, '平行验证');
    expect(forked.activeBranchId).not.toBe('main');
    expect(forked.branches[0]).toBe(original.branches[0]);
    expect(readTimelineHead(forked)).toEqual(final.world);
    expect(readTimelineSnapshot(forked, 2)).toBeUndefined();
    expect(readTimelineSnapshot(forked, base.tick)).toEqual(base);
    expect(final.world.interventionSequence).toBe(base.interventionSequence);
    expect(readTimelineHead(selectTimelineBranch(forked, 'main'))).toEqual(base);
    const malformed: FastForwardCheckpoint[] = [
      { ...final, baseRandomState: final.baseRandomState ^ 1 },
      { ...final, completedTicks: final.completedTicks - 1 },
      { ...final, world: { ...final.world, cultivators: final.world.cultivators.slice(1) } },
      { ...final, world: { ...final.world, interventionSequence: final.world.interventionSequence + 1 } },
    ];
    for (const checkpoint of malformed) {
      expect(() => forkTimelineCheckpoint(original, 'main', base.tick, checkpoint)).toThrow(expect.objectContaining({ code: 'invalid_checkpoint' }));
    }
    expect(() => forkTimelineCheckpoint(forked, 'main', base.tick, final)).toThrow(expect.objectContaining({ code: 'invalid_checkpoint' }));
  });
});

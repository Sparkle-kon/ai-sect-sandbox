import { describe, expect, it, vi } from 'vitest';
import { classifyFastForwardRunReport } from '../src/controllers/fastForwardRunReport';
import { createInitialWorld } from '../src/data/initialWorld';
import type { FastForwardCheckpoint, FastForwardProgress, FastForwardWorkerResponse } from '../src/engine/fastForwardEngine';

const run = { id: 'current', base: { tick: 10, year: 10, month: 12 }, requestedTicks: 5, progress: { completedTicks: 2 } };
const progress: FastForwardProgress = {
  startTick: 10, currentTick: 13, requestedTicks: 5, completedTicks: 3,
  living: 500, totalActors: 526, processingMs: 20, maxChunkMs: 7, maxTickMs: 5,
};
const world = createInitialWorld();
const checkpoint: FastForwardCheckpoint = {
  startTick: 10, requestedTicks: 5, completedTicks: 3, baseRandomState: world.random.state,
  baseInterventionSequence: world.interventionSequence, world: { ...world, tick: 13, year: 11, month: 3 },
};
const staged = (candidate: FastForwardCheckpoint = checkpoint): FastForwardWorkerResponse =>
  ({ type: 'staged', runId: run.id, progress, checkpoint: candidate });
const classify = (report: FastForwardWorkerResponse) => classifyFastForwardRunReport(run, report, true, () => true);

describe('main-thread short Worker report classification', () => {
  it('ignores old run IDs and detached Worker callbacks without consulting the source', () => {
    const sourceIsCurrent = vi.fn(() => false);
    expect(classifyFastForwardRunReport(run, { ...staged(), runId: 'prior' }, true, sourceIsCurrent)).toBe('ignored');
    expect(classifyFastForwardRunReport(run, staged(), false, sourceIsCurrent)).toBe('ignored');
    expect(sourceIsCurrent).not.toHaveBeenCalled();
  });

  it('stops a stale source before accepting staged data or processing cancel/error', () => {
    const reports: FastForwardWorkerResponse[] = [
      staged(), { type: 'cancelled', runId: run.id }, { type: 'error', runId: run.id, message: 'worker error' },
    ];
    reports.forEach(report => {
      expect(classifyFastForwardRunReport(run, report, true, () => false)).toBe('stale_source');
      expect(classify(report)).toBe('accepted');
    });
  });

  it('rejects non-integral, backward, out-of-budget or mismatched progress', () => {
    const cases: Partial<FastForwardProgress>[] = [
      { completedTicks: 2.5, currentTick: 12.5 },
      { completedTicks: 1, currentTick: 11 },
      { completedTicks: 6, currentTick: 16 },
      { requestedTicks: 4 },
      { startTick: 9 },
      { currentTick: 14 },
    ];
    cases.forEach(patch => expect(classify({ type: 'progress', runId: run.id, progress: { ...progress, ...patch } }))
      .toBe('invalid_progress'));
    expect(classify({ type: 'paused', runId: run.id, progress: { ...progress, completedTicks: 2, currentTick: 12 } }))
      .toBe('accepted');
  });

  it('rejects inconsistent checkpoint counts and reached calendar dates', () => {
    const cases: FastForwardCheckpoint[] = [
      { ...checkpoint, requestedTicks: 4 },
      { ...checkpoint, completedTicks: 2 },
      { ...checkpoint, world: { ...checkpoint.world, year: 10 } },
      { ...checkpoint, world: { ...checkpoint.world, month: 4 } },
    ];
    cases.forEach(candidate => expect(classify(staged(candidate))).toBe('invalid_progress'));
    expect(classify(staged())).toBe('accepted');
  });
});

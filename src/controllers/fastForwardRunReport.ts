import { addFastForwardCalendarMonths } from '../engine/fastForwardCalendar';
import type { FastForwardProgress, FastForwardWorkerResponse } from '../engine/fastForwardEngine';
import type { WorldState } from '../types/world';

interface FastForwardRunReportSource {
  readonly id: string;
  readonly base: Pick<WorldState, 'tick' | 'year' | 'month'>;
  readonly requestedTicks: FastForwardProgress['requestedTicks'];
  readonly progress?: Pick<FastForwardProgress, 'completedTicks'>;
}

type FastForwardRunReportDisposition = 'ignored' | 'stale_source' | 'invalid_progress' | 'accepted';

/** Validate the message without mutating the active run or publishing a checkpoint. */
export function classifyFastForwardRunReport(
  run: FastForwardRunReportSource,
  report: FastForwardWorkerResponse,
  isActive: boolean,
  sourceIsCurrent: () => boolean,
): FastForwardRunReportDisposition {
  if (!isActive || report.runId !== run.id) return 'ignored';
  if (!sourceIsCurrent()) return 'stale_source';
  if (report.type === 'error' || report.type === 'cancelled') return 'accepted';
  const progress = report.progress;
  const reached = addFastForwardCalendarMonths(run.base, progress.completedTicks);
  if (
    !reached ||
    progress.startTick !== run.base.tick ||
    progress.requestedTicks !== run.requestedTicks ||
    progress.completedTicks > run.requestedTicks ||
    progress.currentTick !== run.base.tick + progress.completedTicks ||
    (run.progress && progress.completedTicks < run.progress.completedTicks) ||
    (report.type === 'staged' && (
      report.checkpoint.completedTicks !== progress.completedTicks ||
      report.checkpoint.requestedTicks !== run.requestedTicks ||
      report.checkpoint.world.year !== reached.year ||
      report.checkpoint.world.month !== reached.month
    ))
  ) return 'invalid_progress';
  return 'accepted';
}

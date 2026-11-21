import { visibleCausalChronicle } from './chronicleCausalityEngine';
import type { CausalChronicleView } from './chronicleCausalityEngine';
import { publicChronicleSceneEvents } from './chronicleLead';
import type { TimelineBranch, TimelineSnapshot, WorldTimeline } from './timelineEngine';
import { sameGeneratedWorld } from './worldIdentity';
import type { WorldState } from '../types/world';

export type BranchComparisonMetricId = 'roster' | 'living' | 'fallen' | 'publicFactsThisTick';
export interface BranchComparisonMetric {
  id: BranchComparisonMetricId;
  left: number;
  right: number;
  delta: number;
}
export interface BranchComparisonCoverage {
  retainedTicks: number[];
  firstTick: number | null;
  lastTick: number | null;
  gaps: Array<{ fromTick: number; toTick: number }>;
}
export interface ComparedBranch {
  id: string;
  label: string;
  coverage: BranchComparisonCoverage;
  receipts: CausalChronicleView[];
}
export type BranchComparisonFailure = 'same_branch' | 'missing_branch' | 'invalid_tick' | 'left_unretained' |
  'right_unretained' | 'both_unretained' | 'genesis_mismatch';
export type BranchComparisonResult = {
  ok: true;
  tick: number;
  left: ComparedBranch;
  right: ComparedBranch;
  metrics: BranchComparisonMetric[];
} | {
  ok: false;
  reason: BranchComparisonFailure;
  leftCoverage?: BranchComparisonCoverage;
  rightCoverage?: BranchComparisonCoverage;
};

const validTick = (tick: number) => Number.isSafeInteger(tick) && tick >= 0;
const metricIds: readonly BranchComparisonMetricId[] = ['roster', 'living', 'fallen', 'publicFactsThisTick'];
const sameBirth = (left: WorldState, right: WorldState) => sameGeneratedWorld(left, right) &&
  left.worldgen?.birthTick === right.worldgen?.birthTick;

function branchOf(timeline: WorldTimeline, id: string): TimelineBranch | undefined {
  const candidates = timeline.branches.filter((row) => row.id === id);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function framesOf(branch: TimelineBranch): Map<number, TimelineSnapshot> {
  const frames = new Map<number, TimelineSnapshot>();
  const ambiguous = new Set<number>();
  for (const snapshot of branch.snapshots) {
    if (!validTick(snapshot.tick)) continue;
    if (snapshot.tick !== snapshot.world?.tick || frames.has(snapshot.tick)) ambiguous.add(snapshot.tick);
    else frames.set(snapshot.tick, snapshot);
  }
  for (const tick of ambiguous) frames.delete(tick);
  return frames;
}

function summarize(frames: ReadonlyMap<number, TimelineSnapshot>): BranchComparisonCoverage {
  const retainedTicks = [...frames.keys()].sort((a, b) => a - b);
  const gaps: BranchComparisonCoverage['gaps'] = [];
  for (let index = 1; index < retainedTicks.length; index++) {
    const before = retainedTicks[index - 1], after = retainedTicks[index];
    if (after - before > 1) gaps.push({ fromTick: before + 1, toTick: after - 1 });
  }
  return { retainedTicks, firstTick: retainedTicks[0] ?? null, lastTick: retainedTicks.at(-1) ?? null, gaps };
}

export function listAlignedBranchTicks(timeline: WorldTimeline, leftId: string, rightId: string): number[] {
  if (leftId === rightId) return [];
  const left = branchOf(timeline, leftId), right = branchOf(timeline, rightId);
  if (!left || !right) return [];
  const rightFrames = framesOf(right);
  return [...framesOf(left)].flatMap(([tick, frame]) => {
    const other = rightFrames.get(tick);
    return other && sameBirth(frame.world, other.world) ? [tick] : [];
  }).sort((a,b) => a-b);
}

function count(frame: TimelineSnapshot): Record<BranchComparisonMetricId, number> {
  const roster = frame.world.cultivators.length;
  const living = frame.world.cultivators.filter(({ alive, hp }) => alive && hp > 0).length;
  return { roster, living, fallen: roster - living,
    publicFactsThisTick: publicChronicleSceneEvents(frame.world).filter(({ tick }) => tick === frame.tick).length };
}

function branchSummary(branch: TimelineBranch, coverage: BranchComparisonCoverage, frame: TimelineSnapshot,
  viewerId?: string | null): ComparedBranch {
  const receipts = visibleCausalChronicle(frame.world, viewerId, 24).filter(({ entry }) => entry.tick === frame.tick);
  return { id: branch.id, label: branch.label, coverage, receipts };
}

/** Read two exact retained frames. Counters and branch-local receipts are deliberately not causal conclusions. */
export function compareAlignedBranches(timeline: WorldTimeline, leftId: string, rightId: string,
  tick: number, viewerId?: string | null): BranchComparisonResult {
  if (leftId === rightId) return { ok: false, reason: 'same_branch' };
  const left = branchOf(timeline, leftId), right = branchOf(timeline, rightId);
  if (!left || !right) return { ok: false, reason: 'missing_branch' };
  const leftFrames = framesOf(left), rightFrames = framesOf(right);
  const leftCoverage = summarize(leftFrames), rightCoverage = summarize(rightFrames);
  const failed = (reason: BranchComparisonFailure): BranchComparisonResult => ({ ok:false, reason, leftCoverage, rightCoverage });
  if (!validTick(tick)) return failed('invalid_tick');
  const a = leftFrames.get(tick), b = rightFrames.get(tick);
  if (!a || !b) return failed(!a && !b ? 'both_unretained' : !a ? 'left_unretained' : 'right_unretained');
  if (!sameBirth(a.world, b.world)) return failed('genesis_mismatch');
  const leftCounts = count(a), rightCounts = count(b);
  return { ok:true, tick, left:branchSummary(left,leftCoverage,a,viewerId), right:branchSummary(right,rightCoverage,b,viewerId),
    metrics:metricIds.map(id=>({id,left:leftCounts[id],right:rightCounts[id],delta:rightCounts[id]-leftCounts[id]})) };
}

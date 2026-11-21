import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { sameGeneratedWorld } from './worldIdentity';
import type { WorldState } from '../types/world';
import { executeGodIntervention } from './worldEngine';
import type { GodInterventionCommand } from './worldEngine';
import { validFastForwardCount } from './fastForwardEngine';
import type { FastForwardCheckpoint } from './fastForwardEngine';

export const TIMELINE_MAX_TICKS = 50;
export const TIMELINE_MAX_BRANCHES = 4;
export const TIMELINE_MAX_LABEL = 40;
export const TIMELINE_MAX_WHISPER = 220;

export interface TimelineSnapshot { readonly tick: number; readonly world: WorldState }
export interface TimelineBranch {
  readonly id: string;
  readonly label: string;
  readonly parentBranchId?: string;
  readonly forkTick?: number;
  readonly snapshots: readonly TimelineSnapshot[];
}
export interface WorldTimeline {
  readonly activeBranchId: string;
  readonly branches: readonly TimelineBranch[];
  readonly nextBranchNumber: number;
}
export class TimelineError extends Error {
  constructor(readonly code: 'branch_limit' | 'missing_snapshot' | 'invalid_intervention' | 'invalid_checkpoint', message: string) {
    super(message); this.name = 'TimelineError';
  }
}

function freezeTree<T extends object>(value: T): T {
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freezeTree(child);
  }
  return value;
}
const saveSnapshot = (world: WorldState): TimelineSnapshot => Object.freeze({ tick: world.tick, world: freezeTree(cloneWorldWithColdHistory(world)) });
const branchOf = (timeline: WorldTimeline, branchId = timeline.activeBranchId) => timeline.branches.find(({ id }) => id === branchId);
const immutableBranch = (branch: Omit<TimelineBranch, 'snapshots'>, snapshots: readonly TimelineSnapshot[]): TimelineBranch =>
  Object.freeze({ ...branch, snapshots: Object.freeze([...snapshots]) });

export function createTimeline(world: WorldState): WorldTimeline {
  const original = immutableBranch({ id: 'main', label: '原始时间线' }, [saveSnapshot(world)]);
  return Object.freeze({ activeBranchId: original.id, branches: Object.freeze([original]), nextBranchNumber: 1 });
}

/** Branch/source guards prevent late async work from committing onto a newly selected timeline. */
export function recordTimelineWorld(timeline: WorldTimeline, world: WorldState, expectedBranchId = timeline.activeBranchId): WorldTimeline {
  if (expectedBranchId !== timeline.activeBranchId) return timeline;
  const branch = branchOf(timeline);
  const head = branch?.snapshots.at(-1);
  if (!branch || !head || world === head.world || world.tick < head.tick || !sameGeneratedWorld(world, head.world)) return timeline;
  const existing = world.tick === head.tick ? branch.snapshots.slice(0, -1) : branch.snapshots;
  const snapshots = [...existing, saveSnapshot(world)].slice(-TIMELINE_MAX_TICKS);
  const updated = immutableBranch(branch, snapshots);
  return Object.freeze({ ...timeline, branches: Object.freeze(timeline.branches.map((entry) => entry.id === branch.id ? updated : entry)) });
}

export function selectTimelineBranch(timeline: WorldTimeline, branchId: string): WorldTimeline {
  return branchId === timeline.activeBranchId || !branchOf(timeline, branchId) ? timeline : Object.freeze({ ...timeline, activeBranchId: branchId });
}

export function readTimelineSnapshot(timeline: WorldTimeline, tick: number, branchId = timeline.activeBranchId): WorldState | undefined {
  const snapshot = branchOf(timeline, branchId)?.snapshots.find((entry) => entry.tick === tick);
  return snapshot ? cloneWorldWithColdHistory(snapshot.world) : undefined;
}

export function readTimelineHead(timeline: WorldTimeline, branchId = timeline.activeBranchId): WorldState | undefined {
  const head = branchOf(timeline, branchId)?.snapshots.at(-1);
  return head ? cloneWorldWithColdHistory(head.world) : undefined;
}

const cut = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
function validateIntervention(world: WorldState, command: GodInterventionCommand): GodInterventionCommand {
  const invalid = () => new TimelineError('invalid_intervention', '这条天道指令在所选历史轮次不可执行。');
  if (command.type === 'DEMONIC_TIDE') {
    if (command.targetCultivatorId || command.targetLocationId || command.whisperText ||
        !world.cultivators.some((actor) => actor.alive && actor.hp > 0)) throw invalid();
    return { type: command.type };
  }
  if (command.type === 'SPAWN_TREASURE') {
    if (command.targetCultivatorId || command.whisperText || !world.locations.some(({ id }) => id === command.targetLocationId)) throw invalid();
    return { type: command.type, targetLocationId: command.targetLocationId };
  }
  if (command.type !== 'WHISPER_MIND' && command.type !== 'TRIBULATION_STRIKE') throw invalid();
  if (command.targetLocationId || !world.cultivators.some((actor) => actor.id === command.targetCultivatorId && actor.alive && actor.hp > 0)) throw invalid();
  if (command.type === 'WHISPER_MIND') {
    if (typeof command.whisperText !== 'string' || command.whisperText.length > TIMELINE_MAX_WHISPER) throw invalid();
    const whisperText = cut(command.whisperText, TIMELINE_MAX_WHISPER);
    if (!whisperText) throw invalid();
    return { type: command.type, targetCultivatorId: command.targetCultivatorId, whisperText };
  }
  if (command.whisperText) throw invalid();
  return { type: command.type, targetCultivatorId: command.targetCultivatorId };
}

/** Apply exactly one valid intervention to an isolated historical clone; keep the source branch untouched. */
export function forkTimeline(timeline: WorldTimeline, tick: number, command: GodInterventionCommand, label?: string): WorldTimeline {
  if (timeline.branches.length >= TIMELINE_MAX_BRANCHES) throw new TimelineError('branch_limit', '时间线已达上限，不会删除已有分支。');
  const base = branchOf(timeline);
  const index = base?.snapshots.findIndex((snapshot) => snapshot.tick === tick) ?? -1;
  if (!base || index < 0) throw new TimelineError('missing_snapshot', '所选轮次已经不在这条时间线的存档中。');
  const world = base.snapshots[index].world;
  const valid = validateIntervention(world, command);
  const changed = executeGodIntervention(world, valid);
  if (changed.interventionSequence !== world.interventionSequence + 1) {
    throw new TimelineError('invalid_intervention', '天道指令没有产生可保存的结果。');
  }
  const number = timeline.nextBranchNumber;
  const newBranch = immutableBranch({ id: `branch-${number}`, parentBranchId: base.id, forkTick: tick,
    label: (typeof label === 'string' && cut(label, TIMELINE_MAX_LABEL)) || `支线 ${number}` },
    [...base.snapshots.slice(0, index), saveSnapshot(changed)]);
  return Object.freeze({ activeBranchId: newBranch.id, nextBranchNumber: number + 1, branches: Object.freeze([...timeline.branches, newBranch]) });
}

/** Commit one exact isolated checkpoint to a new branch; never synthesize intermediate history or a God action. */
export function forkTimelineCheckpoint(timeline: WorldTimeline, sourceBranchId: string, sourceTick: number,
  checkpoint: FastForwardCheckpoint, label?: string): WorldTimeline {
  if (timeline.branches.length >= TIMELINE_MAX_BRANCHES) throw new TimelineError('branch_limit', '时间线已达上限，不会删除已有分支。');
  const invalid = () => new TimelineError('invalid_checkpoint', '快进检查点与原始分支不吻合；已有进度未改动。');
  if (timeline.activeBranchId !== sourceBranchId) throw invalid();
  const source = branchOf(timeline, sourceBranchId);
  const anchor = source?.snapshots.find(({ tick }) => tick === sourceTick);
  if (!source || !anchor) throw new TimelineError('missing_snapshot', '原始轮次已不在当前分支的时间线中。');
  const base = anchor.world;
  if (!checkpoint || !checkpoint.world || checkpoint.startTick !== sourceTick ||
      !validFastForwardCount(checkpoint.requestedTicks) || !Number.isSafeInteger(checkpoint.completedTicks) ||
      checkpoint.completedTicks < 1 || checkpoint.completedTicks > checkpoint.requestedTicks ||
      checkpoint.world.tick !== sourceTick + checkpoint.completedTicks || checkpoint.baseRandomState !== base.random.state ||
      checkpoint.baseInterventionSequence !== base.interventionSequence || checkpoint.world.interventionSequence !== base.interventionSequence ||
      checkpoint.world.random.algorithm !== base.random.algorithm || !sameGeneratedWorld(checkpoint.world, base)) throw invalid();
  const candidates = new Set(checkpoint.world.cultivators.map(({ id }) => id));
  if (candidates.size !== checkpoint.world.cultivators.length || base.cultivators.some(({ id }) => !candidates.has(id))) throw invalid();
  const number = timeline.nextBranchNumber;
  const branch = immutableBranch({ id: `branch-${number}`, parentBranchId: source.id, forkTick: sourceTick,
    label: (typeof label === 'string' && cut(label, TIMELINE_MAX_LABEL)) || `快进支线 ${number}` },
  [anchor, saveSnapshot(checkpoint.world)]);
  return Object.freeze({ activeBranchId: branch.id, nextBranchNumber: number + 1,
    branches: Object.freeze([...timeline.branches, branch]) });
}

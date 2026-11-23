import {onLowerPlane} from './upperPassageIsolation';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { activeAvatar, possessAvatar } from './avatarEngine';
import { findEraEntryCandidate } from './eraEntryCandidates';
import { sameGeneratedWorld } from './worldIdentity';
import type { WorldState } from '../types/world';
import { executeGodIntervention } from './worldEngine';
import type { GodInterventionCommand } from './worldEngine';
import { validFastForwardCount } from './fastForwardEngine';
import { addFastForwardCalendarMonths, addCampaignCalendarMonths, FAST_FORWARD_CAMPAIGN_MAX_MONTHS } from './fastForwardCalendar';
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
  constructor(readonly code: 'branch_limit' | 'missing_snapshot' | 'invalid_intervention' | 'invalid_checkpoint' | 'invalid_avatar_entry' | 'invalid_managed_restart' | 'invalid_authored_root' | 'invalid_north_well_law', message: string) {
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
        !world.cultivators.some((actor) => actor.alive && actor.hp > 0 && onLowerPlane(actor))) throw invalid();
    return { type: command.type };
  }
  if (command.type === 'SPAWN_TREASURE') {
    if (command.targetCultivatorId || command.whisperText || !world.locations.some(site=>site.id===command.targetLocationId&&!isScopedExpeditionGate(site))) throw invalid();
    return { type: command.type, targetLocationId: command.targetLocationId };
  }
  if (command.type !== 'WHISPER_MIND' && command.type !== 'TRIBULATION_STRIKE') throw invalid();
  if (command.targetLocationId || !world.cultivators.some((actor) => actor.id === command.targetCultivatorId && actor.alive && actor.hp > 0 && onLowerPlane(actor))) throw invalid();
  if (command.type === 'WHISPER_MIND') {
    if (typeof command.whisperText !== 'string' || command.whisperText.length > TIMELINE_MAX_WHISPER) throw invalid();
    const whisperText = cut(command.whisperText, TIMELINE_MAX_WHISPER);
    if (!whisperText) throw invalid();
    return { type: command.type, targetCultivatorId: command.targetCultivatorId, whisperText };
  }
  if (command.whisperText) throw invalid();
  return { type: command.type, targetCultivatorId: command.targetCultivatorId };
}

/**
 * Append one independently replayed authored root after the UI has explicitly
 * approved the already verified exact output. The existing timeline must still
 * expose the exact origin head pointer reviewed by the caller. This is not a fork.
 */
export function appendAuthoredTimelineRoot(timeline:WorldTimeline,expectedBranchId:string,
  expectedHead:TimelineSnapshot,preparedWorld:WorldState,label?:string):WorldTimeline {
  if(timeline.branches.length>=TIMELINE_MAX_BRANCHES)
    throw new TimelineError('branch_limit','时间线已满，不会删减原有支线。');
  const invalid=()=>new TimelineError('invalid_authored_root','待开启的作者纪元或原时间线已经变化；原世界没有改动。');
  const branch=branchOf(timeline,expectedBranchId), head=branch?.snapshots.at(-1);
  if(timeline.activeBranchId!==expectedBranchId||!head||head!==expectedHead)throw invalid();
  const origin=preparedWorld.authoredEraOrigin;
  if(!origin||origin.version!==1||origin.openedTick!==preparedWorld.tick||
    origin.year!==preparedWorld.year||origin.month!==preparedWorld.month||preparedWorld.scenarioOrigin||
    preparedWorld.random.seed!==origin.draft.seed||preparedWorld.worldgen?.profileId!==origin.draft.profileId||
    preparedWorld.interventionSequence!==0)throw invalid();
  if(timeline.branches.some(row=>row.snapshots.at(-1)?.world.authoredEraOrigin?.id===origin.id))
    throw new TimelineError('invalid_authored_root','同一作者纪元已在这组时间线内开启，不会重复建立来源。');
  const number=timeline.nextBranchNumber, id=`branch-${number}`;
  if(!Number.isSafeInteger(number)||number<1||timeline.branches.some(row=>row.id===id))throw invalid();
  const founded=immutableBranch({id,label:(typeof label==='string'&&cut(label,TIMELINE_MAX_LABEL))||`作者纪元 ${number}`},
    [saveSnapshot(preparedWorld)]);
  return Object.freeze({activeBranchId:founded.id,nextBranchNumber:number+1,branches:Object.freeze([...timeline.branches,founded])});
}

/** Fresh uses a deterministic new seed, so a displayed founding roster always matches the approved restart. */
export function managedRestartSeed(timeline:WorldTimeline):number|undefined {
  if(timeline.branches.length>=TIMELINE_MAX_BRANCHES)return undefined;
  const head=branchOf(timeline)?.snapshots.at(-1)?.world,number=timeline.nextBranchNumber;
  if(!head?.sectManagement?.growth?.failure||!Number.isSafeInteger(number)||number<1||timeline.branches.some(row=>row.id===`branch-${number}`))
    return undefined;
  const occupied=new Set(timeline.branches.map(row=>row.snapshots.at(-1)?.world.random.seed));
  let seed=(head.random.seed^Math.imul(number+1,0x9e3779b1)^Math.imul(head.tick+1,0x85ebca6b))>>>0;
  while(occupied.has(seed))seed=(seed+0x9e3779b1)>>>0;
  return seed;
}

/** A restart begins a separate root. It does not destroy the failed branch or pretend the old months never happened. */
export function appendManagedRestartTimelineRoot(timeline:WorldTimeline,expectedBranchId:string,expectedHead:TimelineSnapshot,
  fresh:WorldState):WorldTimeline {
  if(timeline.branches.length>=TIMELINE_MAX_BRANCHES)
    throw new TimelineError('branch_limit','旧卷已满，不会删掉原来的宗门。');
  const invalid=()=>new TimelineError('invalid_managed_restart','旧局或开宗同行者已经变化，这回还没接任。');
  const head=branchOf(timeline,expectedBranchId)?.snapshots.at(-1);
  const seed=managedRestartSeed(timeline),management=fresh.sectManagement;
  if(timeline.activeBranchId!==expectedBranchId||!head||head!==expectedHead||seed===undefined||fresh.random.seed!==seed||
      !management||management.growth!==undefined||management.latestReport!==undefined||fresh.tick!==1||management.foundedTick!==1||
      fresh.worldgen?.birthTick!==1||fresh.worldgen.profileId!==head.world.worldgen?.profileId||
      fresh.authoredEraOrigin||fresh.scenarioOrigin||fresh.interventionSequence!==0||sameGeneratedWorld(fresh,head.world))throw invalid();
  const named=fresh.sects.find(row=>row.id===management.sectId);
  if(!named||named.leaderId!==management.leaderId||named.headquartersId!==management.homeSiteId)throw invalid();
  const number=timeline.nextBranchNumber,id=`branch-${number}`;
  const branch=immutableBranch({id,label:cut(`${named.name} · 东山再起 ${number}`,TIMELINE_MAX_LABEL)},[saveSnapshot(fresh)]);
  return Object.freeze({activeBranchId:id,nextBranchNumber:number+1,branches:Object.freeze([...timeline.branches,branch])});
}

/** A declared present-day rule on one verified live frame. This is not a second natural past. */
export function appendNorthWellRevisitFork(timeline:WorldTimeline,expectedBranchId:string,
  expectedHead:TimelineSnapshot,declared:WorldState):WorldTimeline {
  if(timeline.branches.length>=TIMELINE_MAX_BRANCHES)
    throw new TimelineError('branch_limit','时间线已满，不会删去原线。');
  const invalid=()=>new TimelineError('invalid_north_well_law','所核原档或作者法已变，原线没有改动。');
  const branch=branchOf(timeline,expectedBranchId), head=branch?.snapshots.at(-1);
  if(!branch||!head||head!==expectedHead||timeline.activeBranchId!==expectedBranchId)throw invalid();
  const law=declared.northWellRevisitLaw;
  if(head.world.northWellRevisitLaw||!law||law.kind!=='authored_old_village_restriction'||
    law.declaredTick!==head.tick||law.year!==head.world.year||law.month!==head.world.month||
    timeline.branches.some(row=>row.snapshots.at(-1)?.world.northWellRevisitLaw?.id===law.id))throw invalid();
  // Compare each member once, disregarding only top-level property insertion order.
  const {northWellRevisitLaw:_,...rest}=declared;
  const names=new Set([...Object.keys(rest),...Object.keys(head.world)]);
  for(const name of names){
    const key=name as keyof typeof rest;
    if(JSON.stringify(rest[key])!==JSON.stringify(head.world[key]))throw invalid();
  }
  const number=timeline.nextBranchNumber, id=`branch-${number}`;
  if(!Number.isSafeInteger(number)||number<1||timeline.branches.some(item=>item.id===id))throw invalid();
  const authored=immutableBranch({id,parentBranchId:branch.id,forkTick:head.tick,label:'作者线 · 旧井禁牌'},
    [...branch.snapshots.slice(0,-1),saveSnapshot(declared)]);
  return Object.freeze({activeBranchId:id,nextBranchNumber:number+1,branches:Object.freeze([...timeline.branches,authored])});
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

export interface TimelineAvatarSelection {
  readonly siteId:string;
  readonly viewerId:string;
  readonly actorId:string;
}

/** Enter one exact retained month by native possession; never touch the original branch or advance time. */
export function forkTimelineAvatarEntry(timeline:WorldTimeline,sourceBranchId:string,sourceTick:number,
  expectedSnapshot:TimelineSnapshot,selection:TimelineAvatarSelection,label?:string):WorldTimeline {
  if(timeline.branches.length>=TIMELINE_MAX_BRANCHES)
    throw new TimelineError('branch_limit','时间线已满，不会删除已有分支。');
  if(timeline.activeBranchId!==sourceBranchId||!Number.isSafeInteger(sourceTick)||sourceTick<0)
    throw new TimelineError('missing_snapshot','现在选中的支线已不是这段历史。');
  const source=branchOf(timeline,sourceBranchId);
  const matching=source?.snapshots.filter(snapshot=>snapshot.tick===sourceTick)??[];
  const historical=matching.length===1?matching[0]:undefined;
  if(!source||!historical||historical!==expectedSnapshot||historical.world.tick!==sourceTick)
    throw new TimelineError('missing_snapshot','所选历史快照已变化，没有入世。');
  const {siteId,viewerId,actorId}=selection;
  const invalid=()=>new TimelineError('invalid_avatar_entry','所选的人在这个年月不符合附身资格。原支线没有改变。');
  const candidate=findEraEntryCandidate(historical.world,siteId,viewerId,actorId);
  if(candidate?.decision.kind!=='rest_or_cultivate')throw invalid();
  const changed=cloneWorldWithColdHistory(historical.world);
  if(!possessAvatar(changed,actorId)||activeAvatar(changed)?.id!==actorId)throw invalid();
  const number=timeline.nextBranchNumber;
  const branch=immutableBranch({id:`branch-${number}`,parentBranchId:source.id,forkTick:sourceTick,
    label:(typeof label==='string'&&cut(label,TIMELINE_MAX_LABEL))||`入世支线 ${number}`},
    [...source.snapshots.slice(0,source.snapshots.indexOf(historical)),saveSnapshot(changed)]);
  return Object.freeze({activeBranchId:branch.id,nextBranchNumber:number+1,branches:Object.freeze([...timeline.branches,branch])});
}

/** Only after the entire durable campaign and the original live source have been separately verified. */
export function forkTimelineCampaignCheckpoint(timeline: WorldTimeline, sourceBranchId: string, sourceTick: number,
  checkpoint: FastForwardCheckpoint, label?: string): WorldTimeline {
  if (timeline.branches.length >= TIMELINE_MAX_BRANCHES) throw new TimelineError('branch_limit','时间线已满，不会删除原分支。');
  const invalid=()=>new TimelineError('invalid_checkpoint','长局检查点与原始分支或目标年月不吻合。');
  if(timeline.activeBranchId!==sourceBranchId)throw invalid();
  const source=branchOf(timeline,sourceBranchId),anchor=source?.snapshots.at(-1);
  if(!source||!anchor||anchor.tick!==sourceTick)throw invalid();
  const base=anchor.world;
  if(!checkpoint?.world||checkpoint.startTick!==sourceTick||!Number.isSafeInteger(checkpoint.requestedTicks)||
      checkpoint.requestedTicks<1||checkpoint.requestedTicks>FAST_FORWARD_CAMPAIGN_MAX_MONTHS||
      checkpoint.completedTicks!==checkpoint.requestedTicks||checkpoint.world.tick!==sourceTick+checkpoint.completedTicks||
      checkpoint.baseRandomState!==base.random.state||checkpoint.baseInterventionSequence!==base.interventionSequence||
      checkpoint.world.interventionSequence!==base.interventionSequence||checkpoint.world.random.algorithm!==base.random.algorithm||
      !sameGeneratedWorld(checkpoint.world,base))throw invalid();
  const date=addCampaignCalendarMonths(base,checkpoint.completedTicks);
  if(!date||checkpoint.world.year!==date.year||checkpoint.world.month!==date.month)throw invalid();
  const ids=new Set(checkpoint.world.cultivators.map(({id})=>id));
  if(ids.size!==checkpoint.world.cultivators.length||base.cultivators.some(({id})=>!ids.has(id)))throw invalid();
  const number=timeline.nextBranchNumber;
  const branch=immutableBranch({id:`branch-${number}`,parentBranchId:sourceBranchId,forkTick:sourceTick,
    label:(typeof label==='string'&&cut(label,TIMELINE_MAX_LABEL))||`长局支线 ${number}`},
    [anchor,saveSnapshot(checkpoint.world)]);
  return Object.freeze({activeBranchId:branch.id,nextBranchNumber:number+1,
    branches:Object.freeze([...timeline.branches,branch])});
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
  const calendar = addFastForwardCalendarMonths(base,checkpoint.completedTicks);
  if (!calendar || checkpoint.world.year !== calendar.year || checkpoint.world.month !== calendar.month) throw invalid();
  const candidates = new Set(checkpoint.world.cultivators.map(({ id }) => id));
  if (candidates.size !== checkpoint.world.cultivators.length || base.cultivators.some(({ id }) => !candidates.has(id))) throw invalid();
  const number = timeline.nextBranchNumber;
  const branch = immutableBranch({ id: `branch-${number}`, parentBranchId: source.id, forkTick: sourceTick,
    label: (typeof label === 'string' && cut(label, TIMELINE_MAX_LABEL)) || `快进支线 ${number}` },
  [anchor, saveSnapshot(checkpoint.world)]);
  return Object.freeze({ activeBranchId: branch.id, nextBranchNumber: number + 1,
    branches: Object.freeze([...timeline.branches, branch]) });
}

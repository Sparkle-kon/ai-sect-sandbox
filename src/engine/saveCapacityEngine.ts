import type { ChronicleChapter,WorldState } from '../types/world';
import { activeColdHistoryAnchorIds,COLD_HISTORY_MIN_AGE_TICKS,COLD_HISTORY_ORDINARY_CHAPTERS,
  freezeColdHistory,publicChronicleChapters } from './coldHistoryEngine';
import { isChronicleStoryFact } from './chronicleLead';
import { WORLD_SAVE_MAX_BYTES,worldSaveByteCount } from './storageEngine';
import type { WorldTimeline } from './timelineEngine';
import { sealNarrativeArchiveReview } from './saveArchiveSeal';
export { applyArchiveOptimization } from './saveArchiveSeal';

export interface TimelinePressure {
  branchCount: number;
  snapshotReferences: number;
  uniqueSnapshots: number;
  sharedReferences: number;
}
export interface SaveCapacityReport {
  tick:number;
  jsonBytes:number|null;
  limitBytes:number;
  withinLimit:boolean|null;
  timeline?:TimelinePressure;
}
export const ARCHIVE_OPTIMIZATION_KEEP_HOT = 4;

export interface NarrativeArchivePlan {
  tick:number;
  beforeBytes:number|null;
  afterBytes:number|null;
  limitBytes:number;
  hotBefore:number;
  hotAfter:number;
  coldBefore:number;
  coldAfter:number;
  eligibleCount:number;
  availableColdRoom:number;
  movedCount:number;
  movedChapterIds:readonly string[];
}

export function measureTimelinePressure(timeline:WorldTimeline):TimelinePressure {
  let snapshotReferences=0;
  const retained=new Set<WorldState>();
  for(const branch of timeline.branches) for(const snapshot of branch.snapshots) {
    snapshotReferences++;
    retained.add(snapshot.world);
  }
  return {branchCount:timeline.branches.length,snapshotReferences,uniqueSnapshots:retained.size,sharedReferences:snapshotReferences-retained.size};
}

function currentBytes(world:WorldState):number|null {
  try { return worldSaveByteCount(world); } catch { return null; }
}

/** Exact current JSON envelope bytes, never a heap or future-save estimate. Only call on a manual preview. */
export function measureSaveCapacity(world:WorldState,timeline?:WorldTimeline):SaveCapacityReport {
  const jsonBytes=currentBytes(world);
  return {tick:world.tick,jsonBytes,limitBytes:WORLD_SAVE_MAX_BYTES,withinLimit:jsonBytes===null?null:jsonBytes<=WORLD_SAVE_MAX_BYTES,
    ...(timeline?{timeline:measureTimelinePressure(timeline)}:{})};
}

const newer=(a:ChronicleChapter,b:ChronicleChapter)=>b.chapterNumber-a.chapterNumber || b.endTick-a.endTick ||
  (a.id<b.id?-1:a.id>b.id?1:0);
const protects=(chapter:ChronicleChapter,ids:ReadonlySet<string>) => chapter.anchors.some(anchor=>ids.has(anchor.id));

function archiveChoices(world:WorldState) {
  const hot=world.chronicleArchive.chapters,cold=world.coldHistory;
  const unavailable=new Set(world.events.filter(event=>event.witnessScope==='participants'||event.tick>world.tick).map(event=>event.id));
  const bookmarks=new Set(world.annotations.bookmarks.filter(entry=>entry.createdTick<=world.tick &&
    entry.eventTick<=entry.createdTick && !unavailable.has(entry.eventId)).map(entry=>entry.eventId));
  const protectedIds=new Set([...activeColdHistoryAnchorIds(world),...bookmarks]);
  for(const row of [...world.chronicleErrata.sources,...world.chronicleErrata.retellings,...world.chronicleErrata.corrections]) {
    if(row.tick<=world.tick) protectedIds.add(row.sourceEventId);
  }
  for(const node of world.chronicleCausality.nodes) if(node.tick<=world.tick) {
    protectedIds.add(node.eventId);
    for(const predecessor of node.predecessors) protectedIds.add(predecessor.eventId);
  }
  const publicChapters=new Set(publicChronicleChapters(world));
  const seen=new Set<string>(),duplicates=new Set<string>();
  for(const chapter of [...hot,...cold.chapters]) {
    if(seen.has(chapter.id)) duplicates.add(chapter.id);
    seen.add(chapter.id);
  }
  const ordinary=cold.chapters.filter(chapter=>!protects(chapter,bookmarks)).length;
  const room=Math.max(0,COLD_HISTORY_ORDINARY_CHAPTERS-ordinary);
  const eligible=[...hot].sort(newer).slice(ARCHIVE_OPTIMIZATION_KEEP_HOT).filter(chapter=>
    world.tick-chapter.endTick>=COLD_HISTORY_MIN_AGE_TICKS && !duplicates.has(chapter.id) &&
    publicChapters.has(chapter) && chapter.anchors.length>0 &&
    chapter.anchors.every(anchor=>isChronicleStoryFact(anchor,world.tick)) && !protects(chapter,protectedIds)).reverse();
  return {eligible,room,selected:eligible.slice(0,room)};
}

/** Calculate and seal a precise proposal without changing either the archive or live state. */
export function prepareArchiveOptimization(world:WorldState):NarrativeArchivePlan {
  const {eligible,room,selected}=archiveChoices(world);
  const hot=world.chronicleArchive.chapters,cold=world.coldHistory;
  const move=new Set(selected);
  const nextHot=selected.length?hot.filter(chapter=>!move.has(chapter)):hot;
  const nextCold=selected.length?freezeColdHistory({chapters:[...cold.chapters,...selected].sort(newer),
    droppedChapters:cold.droppedChapters}):cold;
  const beforeBytes=currentBytes(world);
  const afterBytes=selected.length?currentBytes({...world,chronicleArchive:{...world.chronicleArchive,chapters:nextHot},
    coldHistory:nextCold}):beforeBytes;
  const measurable=beforeBytes!==null && afterBytes!==null;
  const review: NarrativeArchivePlan=Object.freeze({tick:world.tick,beforeBytes,afterBytes,limitBytes:WORLD_SAVE_MAX_BYTES,
    hotBefore:hot.length,hotAfter:measurable?nextHot.length:hot.length,coldBefore:cold.chapters.length,
    coldAfter:measurable?nextCold.chapters.length:cold.chapters.length,eligibleCount:eligible.length,availableColdRoom:room,
    movedCount:measurable?selected.length:0,movedChapterIds:Object.freeze(measurable?selected.map(chapter=>chapter.id):[])});
  if(measurable && selected.length) {
    const hotFingerprint=JSON.stringify(hot);
    const coldFingerprint=Object.isFrozen(cold)?undefined:JSON.stringify(cold);
    sealNarrativeArchiveReview(world,review,current=>{
      if(current.chronicleArchive.chapters!==hot || current.coldHistory!==cold) return undefined;
      const choice=archiveChoices(current).selected;
      if(choice.length!==review.movedCount || choice.some((chapter,index)=>chapter.id!==review.movedChapterIds[index])) return undefined;
      try {
        if(JSON.stringify(hot)!==hotFingerprint ||
          coldFingerprint!==undefined && JSON.stringify(cold)!==coldFingerprint) return undefined;
      } catch { return undefined; }
      return {...current,chronicleArchive:{...current.chronicleArchive,chapters:nextHot},coldHistory:nextCold};
    });
  }
  return review;
}

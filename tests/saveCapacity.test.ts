import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { COLD_HISTORY_ORDINARY_CHAPTERS,freezeColdHistory } from '../src/engine/coldHistoryEngine';
import { applyArchiveOptimization,measureSaveCapacity,measureTimelinePressure,prepareArchiveOptimization } from '../src/engine/saveCapacityEngine';
import { decodeWorldSave,encodeWorldSave,WORLD_SAVE_MAX_BYTES,worldSaveByteCount } from '../src/engine/storageEngine';
import { createTimeline,forkTimeline,readTimelineHead,recordTimelineWorld } from '../src/engine/timelineEngine';
import type { ChronicleChapter,WorldState } from '../src/types/world';

function chapter(world:WorldState,n:number):ChronicleChapter {
  const actor=world.cultivators[0],endTick=n*12,startTick=endTick-11;
  const anchor={id:`archive-fact-${n}`,tick:endTick-1,year:1001+n,month:11,title:`渡口旧事 ${n}`,
    description:'仍有一记公开凭据',category:'heavenly' as const,actorIds:[actor.id],locationId:actor.locationId};
  return {id:`chapter-${startTick}-${endTick}`,chapterNumber:n,startTick,endTick,title:`第${n}章：旧事`,
    body:`旧闻·烟霞 ${n}`,anchors:[anchor],source:'utility',
    biographies:[{actorId:actor.id,name:actor.name,realm:actor.realm,anchorIds:[anchor.id]}]};
}
function fixture(hotCount:number,coldCount=0) {
  const world=createInitialWorld(77);
  world.tick=(hotCount+coldCount)*12+180;
  world.events=[];
  const records=Array.from({length:hotCount+coldCount},(_,i)=>chapter(world,i+1));
  world.chronicleArchive.chapters=records.slice(coldCount).reverse();
  world.coldHistory=freezeColdHistory({chapters:records.slice(0,coldCount).reverse(),droppedChapters:2});
  const bookmark=(n:number)=>{
    const anchor=records[n-1].anchors[0];
    world.annotations.bookmarks.push({id:`bookmark-${n}`,eventId:anchor.id,eventTick:anchor.tick,
      createdTick:world.tick,title:anchor.title,category:anchor.category});
  };
  return {world,records,bookmark};
}
const allChapters=(world:WorldState)=>[...world.chronicleArchive.chapters,...world.coldHistory.chapters]
  .sort((a,b)=>a.chapterNumber-b.chapterNumber);

describe('save capacity counts and explicit no-prune narrative archive',()=>{
  it('measures exact current UTF-8 envelope, not JavaScript character length or heap; large roster stays intact',()=>{
    const world=createInitialWorld(112);
    const raw=encodeWorldSave(world);
    const measured=measureSaveCapacity(world);
    expect(measured).toEqual({tick:world.tick,jsonBytes:new TextEncoder().encode(raw).byteLength,
      limitBytes:WORLD_SAVE_MAX_BYTES,withinLimit:true});
    expect(measured.jsonBytes).toBeGreaterThan(raw.length);
    const prototype=world.cultivators[0];
    world.cultivators.push(...Array.from({length:526-world.cultivators.length},(_,index)=>({...structuredClone(prototype),
      id:`actual-large-${index}`,name:`沧海修士${index}`})));
    expect(measureSaveCapacity(world).jsonBytes).toBe(worldSaveByteCount(world));
    expect(world.cultivators).toHaveLength(526);
  });

  it('counts real fork reference sharing separately from unique objects, without serializing the timeline',()=>{
    const world=createInitialWorld(728);
    const initial=createTimeline(world);
    const branchAt=readTimelineHead(initial)!;
    branchAt.tick++;
    const recorded=recordTimelineWorld(initial,branchAt);
    const fork=forkTimeline(recorded,branchAt.tick,{type:'SPAWN_TREASURE',targetLocationId:world.locations[0].id});
    expect(fork.branches[0].snapshots[0]).toBe(fork.branches[1].snapshots[0]);
    expect(fork.branches[0].snapshots[1].world).not.toBe(fork.branches[1].snapshots[1].world);
    const expected={branchCount:2,snapshotReferences:4,uniqueSnapshots:3,sharedReferences:1};
    expect(measureTimelinePressure(fork)).toEqual(expected);
    expect(measureSaveCapacity(world,fork)).toMatchObject({timeline:expected,jsonBytes:worldSaveByteCount(world)});
  });

  it('moves exact public older chapters and nothing else, preserving bookmarks, claims, both causal sides and private refutations',()=>{
    const {world,records,bookmark}=fixture(12,1);
    bookmark(2);
    const [person,other]=world.cultivators;
    const [erratum,parent,child,claim,hidden,move1,move2]=records.slice(2,9).map(chapter=>chapter.anchors[0]);
    world.chronicleErrata.sources.push({kind:'duel',sourceEventId:erratum.id,tick:erratum.tick,locationId:person.locationId,
      participantIds:[person.id,other.id],winnerId:person.id});
    world.chronicleCausality.nodes.push({eventId:child.id,tick:child.tick,sequence:9,kind:'market_settlement',
      entityId:'same-shipment',outcome:'delivered',predecessors:[{eventId:parent.id,relation:'settled_shipment'}]});
    world.witnesses.claims.push({id:'actual-claim',sourceEventId:claim.id,publicationEventId:'active-publication',
      claimantId:person.id,subjectId:other.id,locationId:person.locationId,filedTick:world.tick-1,
      deadlineTick:world.tick+3,challengeUntilTick:world.tick+6,status:'pending',attestations:[],reputationPenalty:0,reputationRestored:0});
    world.events=[{...hidden,witnessScope:'participants'}];
    const keptTimeline=createTimeline(world);
    const before=worldSaveByteCount(world);
    const review=prepareArchiveOptimization(world);
    expect(review.movedChapterIds).toEqual([records[7].id,records[8].id]);
    expect(review).toMatchObject({beforeBytes:before,hotBefore:12,hotAfter:10,coldBefore:1,coldAfter:3,movedCount:2});
    const moved=applyArchiveOptimization(world,review)!;
    expect(moved).toBeDefined();
    expect(worldSaveByteCount(moved)).toBe(review.afterBytes);
    expect(review.afterBytes).toBe(review.beforeBytes); // Merely relocating JSON rows doesn't remove their payload bytes.
    expect(moved.chronicleArchive.chapters.map(chapter=>chapter.anchors[0].id)).not.toContain(move1.id);
    expect(moved.coldHistory.chapters.map(chapter=>chapter.anchors[0].id)).toContain(move2.id);
    expect(moved.coldHistory.droppedChapters).toBe(2);
    expect(allChapters(moved)).toEqual(records);
    for(const key of ['cultivators','workshops','events','annotations','chronicleCausality','witnesses','chronicleErrata','random'] as const) {
      expect(moved[key]).toEqual(world[key]);
    }
    expect(moved.chronicleArchive.anchors).toEqual(world.chronicleArchive.anchors);
    expect(Object.isFrozen(moved.coldHistory.chapters.at(-1))).toBe(true);
    expect(keptTimeline.branches[0].snapshots[0].world.chronicleArchive.chapters).toHaveLength(12);
    expect(applyArchiveOptimization(world,review)).toBeUndefined();
    expect(applyArchiveOptimization(moved,review)).toBeUndefined();
  });

  it('refuses full ordinary shelves, leaves bookmarks and age gates intact, and rejects stale identity or forged plans',()=>{
    const capped=fixture(6,COLD_HISTORY_ORDINARY_CHAPTERS+1);
    capped.bookmark(1); // One exempt bookmarked chapter, but still exactly 64 ordinary entries.
    const blocked=prepareArchiveOptimization(capped.world);
    expect(blocked).toMatchObject({eligibleCount:2,availableColdRoom:0,movedCount:0});
    expect(applyArchiveOptimization(capped.world,blocked)).toBeUndefined();
    const {world,records}=fixture(7);
    world.tick=records[2].endTick+47; // Invalid future rows do not become eligible; first two are old.
    const review=prepareArchiveOptimization(world);
    expect(review.movedChapterIds).toEqual(records.slice(0,2).map(chapter=>chapter.id));
    expect(applyArchiveOptimization(structuredClone(world),review)).toBeUndefined();
    expect(applyArchiveOptimization(world,{...review})).toBeUndefined();
    world.chronicleArchive.chapters.at(-1)!.body='同一身份但已改写，原审核不可用';
    expect(applyArchiveOptimization(world,review)).toBeUndefined();
  });

  it('round-trips the revised shelf through the existing strict JSON codec without adding a world format',()=>{
    const {world,records}=fixture(8,3);
    const review=prepareArchiveOptimization(world);
    expect(review.movedCount).toBe(4);
    const revised=applyArchiveOptimization(world,review)!;
    const saved=decodeWorldSave(encodeWorldSave(revised));
    expect(allChapters(saved)).toEqual(records);
    expect(saved.coldHistory.droppedChapters).toBe(2);
    expect(saved.chronicleArchive.anchors).toEqual(world.chronicleArchive.anchors);
    expect(worldSaveByteCount(revised)).toBe(review.afterBytes);
  });

  it('distinguishes an unreadable preview from an oversize exact measurement and never applies unreviewed bytes',()=>{
    const {world}=fixture(5);
    world.cultivators[0].innerMonologue='修'.repeat(Math.ceil(WORLD_SAVE_MAX_BYTES/3));
    const over=measureSaveCapacity(world);
    expect(over.withinLimit).toBe(false);
    expect(over.jsonBytes).toBeGreaterThan(WORLD_SAVE_MAX_BYTES);
    Object.defineProperty(world,'testCycle',{value:world,enumerable:true});
    expect(measureSaveCapacity(world)).toMatchObject({jsonBytes:null,withinLimit:null});
    const review=prepareArchiveOptimization(world);
    expect(review.beforeBytes).toBeNull();
    expect(review.afterBytes).toBeNull();
    expect(applyArchiveOptimization(world,review)).toBeUndefined();
  });
});

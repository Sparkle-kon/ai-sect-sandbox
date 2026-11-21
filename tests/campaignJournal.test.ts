import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { cloneWorldWithColdHistory } from '../src/engine/coldHistoryEngine';
import { CampaignPersistenceError, readCampaignSource, sealCampaignSource } from '../src/engine/campaignMemento';
import { createCampaignJournal, createMemoryCampaignBackend } from '../src/engine/campaignJournal';
import { encodeEraWorldSave } from '../src/engine/storageEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld, selectTimelineBranch } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';
import type { CampaignCheckpoint } from '../src/engine/fastForwardCampaignEngine';

const rule='a'.repeat(64);
const step=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility');
const advance=(world:WorldState,months:number)=>{
  for(let n=0;n<months;n++)world=step(world);
  return world;
};
function threeBranches(){
  const original=createInitialWorld(2031);
  let timeline=createTimeline(original);
  const one=step(original);
  timeline=recordTimelineWorld(timeline,one);
  const living=one.cultivators.find(actor=>actor.alive)?.id??one.cultivators[0].id;
  timeline=forkTimeline(timeline,one.tick,{type:'WHISPER_MIND',targetCultivatorId:living,whisperText:'第一条原支'});
  timeline=selectTimelineBranch(timeline,'main');
  timeline=forkTimeline(timeline,one.tick,{type:'SPAWN_TREASURE',targetLocationId:one.locations[0].id},'第二条原支');
  timeline=selectTimelineBranch(timeline,'main');
  return {timeline,one};
}
function value(base:WorldState,months:number,requestedTicks:number):CampaignCheckpoint{
  return {startTick:base.tick,requestedTicks,completedTicks:months,baseRandomState:base.random.state,
    baseInterventionSequence:base.interventionSequence,world:advance(base,months)};
}
const shape=(timeline:ReturnType<typeof createTimeline>)=>timeline.branches.map(
  ({id,parentBranchId,forkTick,label,snapshots})=>({id,parentBranchId,forkTick,label,
    snapshots:snapshots.map(snapshot=>[snapshot.tick,encodeEraWorldSave(snapshot.world)])}));
describe('portable local candidate journal, not an ordinary save slot',()=>{
  it('admits a newly created or read-back live shape at its first frame without accepting a genuinely changed same-date world',async()=>{
    const fresh=createInitialWorld(2031);
    const raw=encodeEraWorldSave(fresh);
    const timeline=createTimeline(fresh);
    const source=await sealCampaignSource(timeline,'fresh-world-lineage',fresh);
    const journal=createCampaignJournal(createMemoryCampaignBackend());
    const saved=await journal.begin(source,121,rule);
    expect(saved).toMatchObject({completedTicks:0,status:'pending',source:{tick:fresh.tick,year:fresh.year,month:fresh.month}});
    const loaded=await journal.load();
    expect(encodeEraWorldSave(loaded!.source.world)).toBe(encodeEraWorldSave(cloneWorldWithColdHistory(fresh)));
    expect(encodeEraWorldSave(fresh)).toBe(raw);
    const changed=structuredClone(fresh);
    changed.cultivators[0].spiritStones+=1;
    await expect(sealCampaignSource(timeline,'fresh-world-lineage',changed)).rejects.toBeInstanceOf(CampaignPersistenceError);
  });

  it('restores every original branch and snapshot, and deduplicates shared native bytes without merging worlds',async()=>{
    const {timeline,one}=threeBranches();
    const memento=await sealCampaignSource(timeline,'original-ledger-1',one);
    expect(memento.branches).toHaveLength(3);
    expect(memento.blobs.length).toBeLessThan(memento.branches.flatMap(b=>b.snapshots).length);
    const result=await readCampaignSource(structuredClone(memento));
    expect(result.timelineId).toBe('original-ledger-1');
    expect(result.timeline.activeBranchId).toBe('main');
    expect(result.timeline.nextBranchNumber).toBe(3);
    expect(shape(result.timeline)).toEqual(shape(timeline));
    expect(encodeEraWorldSave(result.world)).toBe(encodeEraWorldSave(one));
    expect(result.world).not.toBe(result.timeline.branches[0].snapshots.at(-1)?.world);
    expect(Object.isFrozen(result.timeline.branches[0].snapshots.at(-1)?.world)).toBe(true);

    const bad=structuredClone(memento);
    const edited={...bad,blobs:bad.blobs.map((blob,i)=>i===0?{...blob,content:blob.content.replace('1001','1002')}:blob)};
    await expect(readCampaignSource(edited)).rejects.toMatchObject({code:'integrity'});
    await expect(readCampaignSource({...bad,blobs:bad.blobs.slice(1)})).rejects.toMatchObject({code:'invalid'});
    await expect(sealCampaignSource(timeline,'original-ledger-1',readTimelineHead(timeline,'branch-1')!))
      .rejects.toMatchObject({code:'invalid'});
    const abort=new AbortController();
    abort.abort();
    await expect(readCampaignSource(memento,{signal:abort.signal})).rejects.toMatchObject({code:'abort'});
  });

  it('survives reacquisition, ready finalization and duplicate click without consuming an internal branch',async()=>{
    const {timeline,one}=threeBranches();
    const source=await sealCampaignSource(timeline,'exact-live-timeline',one);
    const before=shape(timeline), backend=createMemoryCampaignBackend();
    const first=createCampaignJournal(backend);
    const created=await first.begin(source,5,rule);
    expect(created).toMatchObject({revision:1,status:'pending',completedTicks:0});
    await expect(first.begin(source,5,rule)).rejects.toMatchObject({code:'conflict'});
    const partial=await first.checkpoint(created,value(one,2,5));
    expect(partial).toMatchObject({completedTicks:2,previousSha256:created.source.sha256});
    expect(shape(timeline)).toEqual(before);

    const second=createCampaignJournal(backend);
    const loaded=(await second.load())!;
    const exact=value(one,2,5);
    expect(loaded.record.revision).toBe(partial.revision);
    expect(encodeEraWorldSave(loaded.checkpoint.world)).toBe(encodeEraWorldSave(exact.world));
    expect(shape(loaded.source.timeline)).toEqual(before);
    await expect(second.claim(partial,'b'.repeat(64))).rejects.toMatchObject({code:'rule'});
    const claimed=await second.claim(partial,rule);
    await expect(first.checkpoint(partial,value(one,5,5))).rejects.toMatchObject({code:'conflict'});
    const finish={...loaded.checkpoint,completedTicks:5,world:advance(loaded.checkpoint.world,3)};
    const ready=await second.checkpoint(claimed,finish);
    expect(ready).toMatchObject({status:'ready',completedTicks:5,previousSha256:partial.head?.sha256});
    expect(encodeEraWorldSave((await second.load())!.checkpoint.world)).toBe(encodeEraWorldSave(value(one,5,5).world));
    await expect(second.finalize(ready,'branch-2')).rejects.toMatchObject({code:'invalid'});
    const finalized=await second.finalize(ready,'branch-3');
    expect(finalized).toMatchObject({status:'finalized',committedBranchId:'branch-3'});
    await expect(second.finalize(ready,'branch-3')).rejects.toMatchObject({code:'conflict'});
    expect((await first.load())?.record.committedBranchId).toBe('branch-3');
    expect(shape(timeline)).toEqual(before);
  });

  it('keeps the previous durable state on a failed write and opens the verified origin independently of a bad candidate',async()=>{
    const {timeline,one}=threeBranches();
    const source=await sealCampaignSource(timeline,'tested-ledger',one);
    const backend=createMemoryCampaignBackend();
    const journal=createCampaignJournal(backend);
    const started=await journal.begin(source,5,rule);
    const constrained=createCampaignJournal({...backend,commit:async()=>{throw new CampaignPersistenceError('unavailable','quota');}});
    await expect(constrained.checkpoint(started,value(one,2,5))).rejects.toMatchObject({code:'unavailable'});
    expect((await journal.load())?.record.revision).toBe(started.revision);
    expect((await journal.load())?.checkpoint.completedTicks).toBe(0);
    const partial=await journal.checkpoint(started,value(one,2,5));
    const head=partial.head!;
    const corrupt=createCampaignJournal({...backend,read:async()=>({...partial,
      head:{...head,content:head.content.replace('1001','1002')}})});
    await expect(corrupt.load()).rejects.toMatchObject({code:'integrity'});
    expect(shape((await corrupt.loadSource(partial)).timeline)).toEqual(shape(timeline));
  });

  it('atomically handles two tabs, cancellation, malformed worker frames and late receipts',async()=>{
    const {timeline,one}=threeBranches();
    const source=await sealCampaignSource(timeline,'another-live-timeline',one);
    const backend=createMemoryCampaignBackend(), a=createCampaignJournal(backend), b=createCampaignJournal(backend);
    const begins=await Promise.allSettled([a.begin(source,5,rule),b.begin(source,5,rule)]);
    expect(begins.filter(row=>row.status==='fulfilled')).toHaveLength(1);
    const token=(await a.read())!;
    const next=value(one,2,5);
    await expect(a.checkpoint(token,{...next,world:{...next.world,year:next.world.year+1}})).rejects.toMatchObject({code:'invalid'});
    await expect(a.checkpoint(token,{...next,world:{...next.world,cultivators:[]}})).rejects.toMatchObject({code:'invalid'});
    const competing=await Promise.allSettled([a.claim(token,rule),b.claim(token,rule)]);
    expect(competing.filter(row=>row.status==='fulfilled')).toHaveLength(1);
    const claimed=(await a.read())!;
    const tombstone=await b.cancel(claimed);
    expect(tombstone).toMatchObject({status:'cancelled',completedTicks:0});
    await expect(a.checkpoint(claimed,next)).rejects.toMatchObject({code:'conflict'});
    expect((await b.cancel(tombstone)).revision).toBe(tombstone.revision);
    await b.discard(tombstone);
    expect(await a.read()).toBeUndefined();
    const renewed=await a.begin(source,5,rule);
    expect(renewed.id).not.toBe(tombstone.id);
    await expect(a.checkpoint(claimed,next)).rejects.toMatchObject({code:'conflict'});
  });
});

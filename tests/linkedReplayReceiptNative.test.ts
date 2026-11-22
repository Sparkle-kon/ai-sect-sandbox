import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {verifyReplayReceipt} from '../src/engine/replayReceiptEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,readTimelineHead,readTimelineSnapshot,recordTimelineWorld,selectTimelineBranch,TIMELINE_MAX_TICKS,
  type WorldTimeline} from '../src/engine/timelineEngine';
import * as worldEngine from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';
import {captureLinkedReplayReceipt,verifyLinkedReplayReceipts} from '../src/components/linkedReplayReceipts';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const rule=__SECT_UTILITY_RULE_VERSION__;
const runtime={knownRuleVersions:new Set([rule])};
const knownOlderBuild='6a3021ffac448ae9ca9cd3bdbce85c0378e699c0dda5947b71d9c234f0ce31ec';
const next=(world:WorldState)=>worldEngine.advanceWorldTick(world,undefined,undefined,'utility');
const hash=(world:WorldState)=>campaignSHA256(new TextEncoder().encode(encodeWorldSave(world)));
const ensure=<T,>(value:T|undefined,why:string):T=>{
  if(value===undefined)throw Error(why);
  return value;
};
function sources(){
  let world=createInitialWorld(30301),timeline=createTimeline(world);
  let throughJunction:WorldTimeline|undefined;
  while(world.tick<9){
    world=next(world);
    timeline=recordTimelineWorld(timeline,world);
    if(world.tick===5)throughJunction=timeline;
  }
  return {timeline,throughJunction:ensure(throughJunction,'Actual original timeline before T9'),
    initial:ensure(readTimelineSnapshot(timeline,1),'Actual T1 frame'),
    middle:ensure(readTimelineSnapshot(timeline,5),'Actual T5 frame'),end:ensure(readTimelineSnapshot(timeline,9),'Actual T9 frame')};
}
async function receipt(base:WorldState,branchId='main',runId=`actual-${base.tick}`){
  const response=await verifyReplayReceipt({type:'verify_replay',runId,source:{kind:'branch',branchId,tick:base.tick},base},
    {ruleVersion:rule,timingScope:'node_process'});
  if(response.outcome.status!=='verified')throw Error(`No real proof for ${branchId} T${base.tick}`);
  return response;
}

async function nativePair(){
  const f=sources();
  const a=await receipt(f.initial),b=await receipt(f.middle);
  const first=await captureLinkedReplayReceipt(f.timeline,'main',a.outcome,runtime);
  if(first.status!=='captured')throw Error('First true receipt capture failed');
  const second=await captureLinkedReplayReceipt(f.timeline,'main',b.outcome,runtime,first.record);
  if(second.status!=='captured')throw Error('Second true receipt capture failed');
  return {...f,a,b,first:first.record,second:second.record};
}

describe('real retained checkpoint receipt linking',()=>{
  it('compares two separately produced native receipts with explicit predecessor and exact independently retained T1, T5, and T9 bytes',async()=>{
    expect(rule).toMatch(/^[a-f0-9]{64}$/u);
    const f=await nativePair();
    expect(f.first.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(f.first.predecessorDigest).toBeUndefined();
    expect(f.second.predecessorDigest).toBe(f.first.digest);
    expect(f.second.digest).not.toBe(f.first.digest);
    expect(f.a.outcome.status).toBe('verified');
    expect(f.b.outcome.status).toBe('verified');
    if(f.a.outcome.status!=='verified'||f.b.outcome.status!=='verified')throw Error('Exact typed receipts required');
    const [one,five,nine]=await Promise.all([hash(f.initial),hash(f.middle),hash(f.end)]);
    const {receipt:a}=f.a.outcome,{receipt:b}=f.b.outcome;
    expect([a.sourceCheckpoint.sha256,a.direct.sha256,a.chunked.sha256,b.sourceCheckpoint.sha256,b.direct.sha256,b.chunked.sha256])
      .toEqual([one,five,five,five,nine,nine]);
    expect(a.sourceCheckpoint.actorCount).toBe(16);
    expect(b.direct.actorCount).toBe(17); // Naturally recruited in this actual seed, not a fabricated headcount.
    const baseline=JSON.stringify(f.timeline),states=[f.initial,f.middle,f.end].map(encodeWorldSave);
    const spy=vi.spyOn(worldEngine,'advanceWorldTick').mockImplementation(()=>{throw Error('Comparison cannot run a turn');});
    try{
      const result=await verifyLinkedReplayReceipts(f.timeline,f.first,f.second,runtime);
      expect(result).toMatchObject({status:'linked',startTick:1,junctionTick:5,endTick:9});
      expect(spy).not.toHaveBeenCalled();
      const output=JSON.stringify(result);
      expect(output).not.toMatch(/cultivators|memories|knownLocations|timelineId|原始时间线/);
      expect(JSON.stringify(f.timeline)).toBe(baseline);
      expect([f.initial,f.middle,f.end].map(encodeWorldSave)).toEqual(states);
    }finally{spy.mockRestore();}
  });

  it('refuses to infer an unstored predecessor from identical native junction bytes',async()=>{
    const f=await nativePair();
    const unlinked=await captureLinkedReplayReceipt(f.timeline,'main',f.b.outcome,runtime);
    if(unlinked.status!=='captured')throw Error('Independent receipt must be reviewable even without a predecessor');
    await expect(verifyLinkedReplayReceipts(f.timeline,f.first,unlinked.record,runtime))
      .resolves.toMatchObject({status:'mismatch',reason:'predecessor'});
    const forged={...unlinked.record,predecessorDigest:f.first.digest};
    await expect(verifyLinkedReplayReceipts(f.timeline,f.first,forged,runtime)).resolves.toMatchObject({status:'mismatch'});
  });

  it('does not confuse two genuine same-calendar same-label siblings or try to replace an old source with a cousin',async()=>{
    const f=await nativePair(),label='同名支线不得作凭证';
    const command=(whisperText:string)=>({type:'WHISPER_MIND' as const,targetCultivatorId:'npc-2',whisperText});
    const one=forkTimeline(f.timeline,5,command('甲本私记不得外流'),label);
    let fork=forkTimeline(selectTimelineBranch(one,'main'),5,command('乙本私记不得外流'),label);
    const firstSibling=ensure(readTimelineHead(fork,one.activeBranchId),'Actual own sibling A');
    const other=ensure(readTimelineHead(fork),'Actual own sibling B');
    expect(firstSibling.tick).toBe(other.tick);
    expect(firstSibling.interventionSequence).toBe(other.interventionSequence);
    expect(fork.branches[1].label).toBe(fork.branches[2].label);
    expect(await hash(firstSibling)).not.toBe(await hash(other));
    expect(await hash(other)).not.toBe(await hash(f.middle));
    const cousin=await receipt(other,fork.activeBranchId,'actual-sibling-b');
    for(let i=0;i<4;i++)fork=recordTimelineWorld(fork,next(ensure(readTimelineHead(fork),'Sibling head continues natively')));
    const captured=await captureLinkedReplayReceipt(fork,fork.activeBranchId,cousin.outcome,runtime,f.first);
    if(captured.status==='captured'){
      await expect(verifyLinkedReplayReceipts(fork,f.first,captured.record,runtime))
        .resolves.toMatchObject({status:'mismatch'});
    }else expect(captured).toMatchObject({status:'mismatch'});
    expect(JSON.stringify(captured)).not.toMatch(/同名支线不得作凭证|甲本私记不得外流|乙本私记不得外流|cultivators|memories/);
    const falseMain=await captureLinkedReplayReceipt(fork,'main',cousin.outcome,runtime);
    expect(falseMain).toMatchObject({status:'mismatch',reason:'snapshot'});
  });


  it('requires the actual native T9 output checkpoint and detects its independent replacement at the same tick',async()=>{
    const f=await nativePair();
    const withoutEnd=f.throughJunction;
    expect(await hash(ensure(readTimelineHead(withoutEnd),'Exact shorter boundary'))).toBe(await hash(f.middle));
    expect(readTimelineSnapshot(withoutEnd,9)).toBeUndefined();
    await expect(verifyLinkedReplayReceipts(withoutEnd,f.first,f.second,runtime))
      .resolves.toMatchObject({status:'unavailable',reason:'snapshot_lost'});
    let reseeded=createTimeline(f.initial),current=f.initial;
    while(current.tick<f.middle.tick){current=next(current);reseeded=recordTimelineWorld(reseeded,current);}
    expect(await hash(ensure(readTimelineHead(reseeded),'Exact but independently replayed shorter boundary'))).toBe(await hash(f.middle));
    await expect(verifyLinkedReplayReceipts(reseeded,f.first,f.second,runtime))
      .resolves.toMatchObject({status:'mismatch',reason:'source'});
    const altered=worldEngine.executeGodIntervention(f.end,{type:'WHISPER_MIND',targetCultivatorId:'npc-2',
      whisperText:'不可将实际末端的此异文借作原来的复演。'});
    const changed=recordTimelineWorld(f.timeline,altered);
    const sameDate=ensure(readTimelineSnapshot(changed,9),'Current alternative retained at T9');
    expect(sameDate.tick).toBe(f.end.tick);
    expect(await hash(sameDate)).not.toBe(await hash(f.end));
    expect(await hash(ensure(readTimelineSnapshot(changed,5),'Earlier native state unchanged'))).toBe(await hash(f.middle));
    await expect(verifyLinkedReplayReceipts(changed,f.first,f.second,runtime))
      .resolves.toMatchObject({status:'mismatch',reason:'snapshot'});
    await expect(verifyLinkedReplayReceipts(f.timeline,f.first,f.second,runtime))
      .resolves.toMatchObject({status:'linked'});
  });

  it('reports real eviction, unavailable historical build and unavailable hashing separately from mismatch',async()=>{
    const f=await nativePair();
    expect(knownOlderBuild).not.toBe(rule);
    await expect(verifyLinkedReplayReceipts(f.timeline,f.first,f.second,{knownRuleVersions:new Set([knownOlderBuild])}))
      .resolves.toMatchObject({status:'unavailable',reason:'rule_build'});
    await expect(verifyLinkedReplayReceipts(f.timeline,f.first,f.second,{...runtime,sha256:async()=>{throw Error('hidden');}}))
      .resolves.toMatchObject({status:'unavailable',reason:'crypto'});
    let timeline:WorldTimeline=f.timeline,world=f.end;
    while(world.tick<TIMELINE_MAX_TICKS+1){world=next(world);timeline=recordTimelineWorld(timeline,world);}
    expect(timeline.branches[0].snapshots).toHaveLength(TIMELINE_MAX_TICKS);
    expect(readTimelineSnapshot(timeline,1)).toBeUndefined();
    expect(await hash(ensure(readTimelineSnapshot(timeline,5),'Actual T5 still retained'))).toBe(await hash(f.middle));
    await expect(verifyLinkedReplayReceipts(timeline,f.first,f.second,runtime)).resolves
      .toMatchObject({status:'unavailable',reason:'snapshot_lost'});
  });
});

import {beforeAll,describe,expect,it,vi} from 'vitest';
// @ts-expect-error Node-only test harness; app compilation does not include Node ambient declarations.
import {createHash} from 'node:crypto';
import {createInitialWorld} from '../src/data/initialWorld';
import {captureLinkedReplayReceipt,verifyLinkedReplayReceipts,type LinkedReplayRecord} from '../src/components/linkedReplayReceipts';
import {verifyReplayReceipt,type ReplayReceiptOutcome} from '../src/engine/replayReceiptEngine';
import {createTimeline,recordTimelineWorld,type WorldTimeline} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const RULE=__SECT_UTILITY_RULE_VERSION__;
const SHA=async(text:string):Promise<string>=>createHash('sha256').update(text).digest('hex');
const runtime={knownRuleVersions:new Set([RULE]),sha256:SHA};
type Outcome=Extract<ReplayReceiptOutcome,{receipt:unknown}>;
type Pair={timeline:WorldTimeline;firstOutcome:Outcome;secondOutcome:Outcome;first:LinkedReplayRecord;second:LinkedReplayRecord};
async function verifyRun(base:WorldState){
  const response=await verifyReplayReceipt({type:'verify_replay',runId:`test-${base.tick}`,base,
    source:{kind:'branch',branchId:'main',tick:base.tick}},{ruleVersion:RULE,timingScope:'node_process',sha256:SHA});
  if(response.outcome.status!=='verified')throw Error('Expected native verified receipt');
  return response.outcome;
}
async function record(timeline:WorldTimeline,result:Outcome,predecessor?:LinkedReplayRecord){
  const captured=await captureLinkedReplayReceipt(timeline,'main',result,runtime,predecessor);
  if(captured.status!=='captured')throw Error(`Expected authentic captured local record, got ${JSON.stringify(captured)}`);
  return captured.record;
}
let pair:Pair;
beforeAll(async()=>{
  const start=createInitialWorld(30301);
  let world=start,timeline=createTimeline(start);
  while(world.tick<start.tick+8){
    world=advanceWorldTick(world,undefined,undefined,'utility');
    timeline=recordTimelineWorld(timeline,world);
  }
  const junction=timeline.branches[0].snapshots.find(row=>row.tick===start.tick+4)!;
  const [firstOutcome,secondOutcome]=await Promise.all([verifyRun(timeline.branches[0].snapshots[0].world),verifyRun(junction.world)]);
  const first=await record(timeline,firstOutcome),second=await record(timeline,secondOutcome,first);
  pair={timeline,firstOutcome,secondOutcome,first,second};
});
const sameScope=(make:(branch:WorldTimeline['branches'][number])=>WorldTimeline['branches'])=>
  ({...pair.timeline,branches:make(pair.timeline.branches[0])});
const linked=()=>expect(verifyLinkedReplayReceipts(pair.timeline,pair.first,pair.second,runtime)).resolves.toMatchObject({
  status:'linked',startTick:pair.first.receipt.sourceCheckpoint.tick,junctionTick:pair.second.receipt.sourceCheckpoint.tick,
  endTick:pair.second.receipt.direct.tick,
});

describe('linked replay receipts refuse independent false identities and false package seals',()=>{
  it('requires independently produced, explicitly ordered records and a previously recorded predecessor',async()=>{
    await linked();
    const {timeline,first,second,secondOutcome}=pair;
    const independentlyKept=await record(timeline,secondOutcome);
    expect(independentlyKept.predecessorDigest).toBeUndefined();
    await expect(verifyLinkedReplayReceipts(timeline,first,independentlyKept,runtime))
      .resolves.toMatchObject({status:'mismatch',reason:'predecessor'});
    await expect(verifyLinkedReplayReceipts(timeline,second,first,runtime)).resolves.toMatchObject({status:'mismatch'});
    await expect(verifyLinkedReplayReceipts(timeline,first,first,runtime)).resolves.toMatchObject({status:'mismatch'});
    const absent=undefined as unknown as LinkedReplayRecord;
    await expect(verifyLinkedReplayReceipts(timeline,first,absent,runtime)).resolves.toMatchObject({status:'mismatch',reason:'receipt'});
    await linked();
  });

  it('refuses ram-time source, agreed output and predecessor edits after an authentic capture',async()=>{
    const {timeline,first,second}=pair;
    const badDigest='7'.repeat(64);
    const predecessor={...second,predecessorDigest:badDigest};
    const source=structuredClone(second);
    source.receipt.sourceCheckpoint.sha256=badDigest;
    const bothOutputs=structuredClone(second);
    bothOutputs.receipt.direct.sha256=badDigest;
    bothOutputs.receipt.chunked.sha256=badDigest; // Internally still look consistent; authentic seal must break.
    const wrongIdentity={...second,branchId:'branch-1'};
    const foreignExactCopy=structuredClone(second);
    for(const tampered of [predecessor,source,bothOutputs,wrongIdentity,foreignExactCopy]){
      expect(tampered.digest).toBe(second.digest);
      await expect(verifyLinkedReplayReceipts(timeline,first,tampered,runtime)).resolves.toMatchObject({status:'mismatch'});
    }
    await linked();
  });

  it('treats a duplicate exact branch or an exact duplicate retained tick as ambiguous, not a renewed valid source',async()=>{
    const {first,second,firstOutcome}=pair;
    const repeatedBranch=sameScope(branch=>[branch,{...branch,label:'do not disclose duplicate branch label'}]);
    const repeatedSource=sameScope(branch=>[{...branch,snapshots:[...branch.snapshots,branch.snapshots[0]]}]);
    for(const ambiguous of [repeatedBranch,repeatedSource]){
      await expect(verifyLinkedReplayReceipts(ambiguous,first,second,runtime)).resolves.toMatchObject({status:'mismatch',reason:'source'});
      await expect(captureLinkedReplayReceipt(ambiguous,'main',firstOutcome,runtime)).resolves
        .toMatchObject({status:'mismatch',reason:'source'});
    }
  });

  it('distinguishes changed canonical bytes at the same identity from source loss and missing rule build',async()=>{
    const {first,second}=pair;
    const tick=first.receipt.sourceCheckpoint.tick;
    const absent=sameScope(branch=>[{...branch,snapshots:branch.snapshots.filter(frame=>frame.tick!==tick)}]);
    const different=sameScope(branch=>[{...branch,snapshots:branch.snapshots.map(frame=>{
      if(frame.tick!==tick)return frame;
      const swapped=structuredClone(frame.world);
      swapped.cultivators[0].innerMonologue='A private same-tick byte change cannot become a valid receipt source';
      return {...frame,world:swapped};
    })}]);
    expect(different.branches[0].snapshots[0].world.random.state).toBe(first.receipt.sourceCheckpoint.randomState);
    expect(different.branches[0].snapshots[0].world.cultivators.length).toBe(first.receipt.sourceCheckpoint.actorCount);
    await expect(verifyLinkedReplayReceipts(different,first,second,runtime)).resolves.toMatchObject({status:'mismatch',reason:'snapshot'});
    await expect(verifyLinkedReplayReceipts(absent,first,second,runtime)).resolves.toMatchObject({status:'unavailable',reason:'snapshot_lost'});
    const shouldNotHash=vi.fn(SHA);
    await expect(verifyLinkedReplayReceipts(pair.timeline,first,second,{
      sha256:shouldNotHash,knownRuleVersions:new Set(['9'.repeat(64)]),
    })).resolves.toMatchObject({status:'unavailable',reason:'rule_build'});
    expect(shouldNotHash).not.toHaveBeenCalled();
    await expect(verifyLinkedReplayReceipts(pair.timeline,first,second,{
      ...runtime,sha256:async()=>{throw Error('sensitive provider/native path');},
    })).resolves.toEqual({status:'unavailable',reason:'crypto'});
  });

  it('requires the independently retained final checkpoint, including when its tick is duplicated or unchanged',async()=>{
    const {first,second}=pair;
    const tick=second.receipt.direct.tick;
    const original=pair.timeline.branches[0].snapshots.find(frame=>frame.tick===tick)!;
    const abs=sameScope(branch=>[{...branch,snapshots:branch.snapshots.filter(frame=>frame.tick!==tick)}]);
    const ambiguous=sameScope(branch=>[{...branch,snapshots:[...branch.snapshots,original]}]);
    const replaced=sameScope(branch=>[{...branch,snapshots:branch.snapshots.map(frame=>{
      if(frame.tick!==tick)return frame;
      const world=structuredClone(frame.world);
      world.cultivators[0].spiritStones++;
      return {...frame,world};
    })}]);
    await expect(verifyLinkedReplayReceipts(abs,first,second,runtime))
      .resolves.toMatchObject({status:'unavailable',reason:'snapshot_lost'});
    await expect(verifyLinkedReplayReceipts(ambiguous,first,second,runtime))
      .resolves.toMatchObject({status:'mismatch',reason:'source'});
    await expect(verifyLinkedReplayReceipts(replaced,first,second,runtime))
      .resolves.toMatchObject({status:'mismatch',reason:'snapshot'});
    await linked();
  });

  it('normalizes wall clock samples out of the digest and keeps no mutable aliases or private unknown properties',async()=>{
    const {firstOutcome,first,second,timeline}=pair;
    const raw=structuredClone(firstOutcome);
    raw.receipt.direct.elapsedMs=976422.5;
    raw.receipt.chunked.elapsedMs=null;
    Object.assign(raw.receipt,{branchLabel:'THIS PRIVATE BRANCH LABEL MUST NOT ENTER THE RECORD'});
    Object.assign(raw.receipt.sourceCheckpoint,{worldState:'THIS PRIVATE BODY MUST NOT ENTER THE RECORD'});
    const kept=await record(timeline,raw);
    expect(kept.digest).toBe(first.digest);
    expect(JSON.stringify(kept)).not.toMatch(/THIS PRIVATE|worldState|branchLabel/u);
    const stable=JSON.stringify(kept);
    raw.receipt.direct.sha256='0'.repeat(64);
    expect(JSON.stringify(kept)).toBe(stable);
    await expect(verifyLinkedReplayReceipts(timeline,kept,second,runtime)).resolves.toMatchObject({status:'linked'});
  });

  it('does not accept a worker mismatch or malformed metadata as a newly kept record',async()=>{
    const {timeline,firstOutcome}=pair;
    const inconsistent=structuredClone(firstOutcome);
    inconsistent.receipt.chunked.randomState^=1;
    const wrongStep=structuredClone(firstOutcome);
    wrongStep.receipt.direct.tick++;
    const unsupported=structuredClone(firstOutcome);
    Object.assign(unsupported.receipt,{protocolVersion:2});
    for(const malformed of [{status:'mismatch' as const,receipt:firstOutcome.receipt},inconsistent,wrongStep,unsupported]){
      await expect(captureLinkedReplayReceipt(timeline,'main',malformed,runtime)).resolves.toMatchObject({status:'mismatch',reason:'receipt'});
    }
  });
});

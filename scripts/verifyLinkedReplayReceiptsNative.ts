import {captureLinkedReplayReceipt,verifyLinkedReplayReceipts,type LinkedReplayRecord} from '../src/components/linkedReplayReceipts';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {verifyReplayReceipt} from '../src/engine/replayReceiptEngine';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,readTimelineSnapshot,recordTimelineWorld,selectTimelineBranch,type WorldTimeline} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {createInitialWorld} from '../src/data/initialWorld';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{exitCode?:number};
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const hash=(text:string)=>campaignSHA256(new TextEncoder().encode(text));
const exact=(timeline:WorldTimeline,tick:number,branchId='main')=>{
  const state=readTimelineSnapshot(timeline,tick,branchId);
  if(!state)throw Error('Expected actual retained snapshot');
  return state;
};
function carry(timeline:WorldTimeline,world:WorldState,end:number){
  for(;world.tick<end;){
    world=advanceWorldTick(world);
    timeline=recordTimelineWorld(timeline,world);
  }
  return {timeline,world};
}

async function main(){
  const rule=__SECT_UTILITY_RULE_VERSION__;
  const runtime={knownRuleVersions:new Set([rule]),sha256:hash};
  const seed=30301,base=createInitialWorld(seed),partial=carry(createTimeline(base),base,5);
  async function take(line:WorldTimeline,tick:number,branchId:string,predecessor?:LinkedReplayRecord){
    const raw=exact(line,tick,branchId);
    const output=await verifyReplayReceipt({type:'verify_replay',runId:'isolated-operator-'+tick,
      source:{kind:'branch',branchId,tick},base:raw},{ruleVersion:rule,timingScope:'node_process',sha256:hash});
    if(output.outcome.status!=='verified')throw Error('Actual historical replay failed');
    const marked=await captureLinkedReplayReceipt(line,branchId,output.outcome,runtime,predecessor);
    if(marked.status!=='captured')throw Error('This actual replay could not be retained: '+JSON.stringify(marked));
    return marked.record;
  }
  const a=await take(partial.timeline,1,'main'),b=await take(partial.timeline,5,'main',a);
  const early=await verifyLinkedReplayReceipts(partial.timeline,a,b,runtime);
  assert(early.status==='unavailable'&&early.reason==='snapshot_lost','Expected unvisited final original to remain unavailable');
  const built=carry(partial.timeline,partial.world,9);
  const timeline=built.timeline;
  const versions=timeline.branches.map(branch=>branch.snapshots.map(({world})=>encodeWorldSave(world)));
  const result=await verifyLinkedReplayReceipts(timeline,a,b,runtime);
  assert(result.status==='linked'&&result.startTick===1&&result.junctionTick===5&&result.endTick===9,'Actual two chain ends do not match');
  const head=exact(timeline,9),mid=exact(timeline,5);
  const midHash=await hash(encodeWorldSave(mid)),endHash=await hash(encodeWorldSave(head));
  assert(midHash===a.receipt.direct.sha256&&midHash===b.receipt.sourceCheckpoint.sha256&&endHash===b.receipt.direct.sha256,
    'Independent exact retained snapshots disagree with actual worker-equivalent results');
  const independent=createInitialWorld(seed),replacement=carry(createTimeline(independent),independent,9);
  assert(await hash(encodeWorldSave(exact(replacement.timeline,5)))===midHash,'Independent identical-world control diverged');
  const wrongSession=await verifyLinkedReplayReceipts(replacement.timeline,a,b,runtime);
  assert(wrongSession.status==='mismatch'&&wrongSession.reason==='source','Byte-identical restart inherited an old capture');
  const sameLabel='隔离验收不输出的支名';
  const forkA=forkTimeline(timeline,5,{type:'WHISPER_MIND',targetCultivatorId:'npc-2',whisperText:'另支甲原话。'},sameLabel);
  const forked=forkTimeline(selectTimelineBranch(forkA,'main'),5,
    {type:'WHISPER_MIND',targetCultivatorId:'npc-2',whisperText:'另支乙原话。'},sameLabel);
  const idA=forkA.activeBranchId,idB=forked.activeBranchId;
  const differentA=await take(forked,5,idA),differentB=await take(forked,5,idB);
  assert(differentA.receipt.sourceCheckpoint.sha256!==differentB.receipt.sourceCheckpoint.sha256,'Genuine sibling bytes fell together');
  const wrong=await verifyLinkedReplayReceipts(forked,a,differentB,runtime);
  assert(wrong.status==='mismatch','A same-label sibling supplied a missing link');
  const evicted=carry(timeline,built.world,51);
  assert(!readTimelineSnapshot(evicted.timeline,1,'main')&&!!readTimelineSnapshot(evicted.timeline,5,'main'),'Expected exact real retention gap');
  const lost=await verifyLinkedReplayReceipts(evicted.timeline,a,b,runtime);
  assert(lost.status==='unavailable'&&lost.reason==='snapshot_lost','Lost source confused with an actual mismatch');
  const unbuilt=await verifyLinkedReplayReceipts(timeline,a,b,{...runtime,knownRuleVersions:new Set()});
  assert(unbuilt.status==='unavailable'&&unbuilt.reason==='rule_build','Unavailable rule confused with a lost source');
  assert(JSON.stringify(timeline.branches.map(branch=>branch.snapshots.map(({world})=>encodeWorldSave(world))))===JSON.stringify(versions),
    'Reading a link mutated the original timeline');
  console.log(JSON.stringify({seed,rule,result,startingSha:a.receipt.sourceCheckpoint.sha256,midHash,endHash,
    sameLabelDifferentSourceRejected:true,sameBytesNewRunRejected:true,early,missingAtNativeTick:evicted.world.tick,lost,unbuilt,originalUnchanged:true,
    actualActorCounts:[a.receipt.sourceCheckpoint.actorCount,b.receipt.sourceCheckpoint.actorCount,b.receipt.direct.actorCount]}));
}
void main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});

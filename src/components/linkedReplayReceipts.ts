import type {ReplayReceipt,ReplayReceiptCheckpoint,ReplayReceiptOutcome,ReplayReceiptRun} from '../engine/replayReceiptEngine';
import {encodeWorldSave} from '../engine/storageEngine';
import type {WorldTimeline} from '../engine/timelineEngine';
import {sameGeneratedWorld} from '../engine/worldIdentity';
import type {WorldState} from '../types/world';

export interface LinkedReplayRuntime {
  readonly knownRuleVersions:ReadonlySet<string>;
  readonly sha256?:(canonicalText:string)=>Promise<string>;
}
export interface LinkedReplayRecord {
  readonly digest:string;
  readonly predecessorDigest?:string;
  readonly branchId:string;
  readonly receipt:ReplayReceipt;
}
export type LinkedReplayFailure=
  | {status:'unavailable';reason:'snapshot_lost'|'rule_build'|'crypto'}
  | {status:'mismatch';reason:'receipt'|'snapshot'|'source'|'predecessor'};
export type LinkedReplayCapture={status:'captured';record:LinkedReplayRecord}|LinkedReplayFailure;
export type LinkedReplayVerification={status:'linked';startTick:number;junctionTick:number;endTick:number}|LinkedReplayFailure;

const sha=/^[a-f0-9]{64}$/u;
const branchPattern=/^(?:main|branch-[1-9][0-9]*)$/u;
const profiles=new Set<ReplayReceipt['profileId']>([null,'classic','spirit-bloom','fractured-frontier']);
// A tiny token binds the actual immutable frame object without extending the lifetime of its bytes.
const frameTokens=new WeakMap<WorldState,object>();
const captured=new WeakMap<LinkedReplayRecord,object>();
function frameToken(world:WorldState):object {
  const existing=frameTokens.get(world);
  if(existing)return existing;
  const token=Object.freeze({});
  frameTokens.set(world,token);
  return token;
}
const unavailable=(reason:Extract<LinkedReplayFailure,{status:'unavailable'}>['reason']):LinkedReplayFailure=>({status:'unavailable',reason});
const mismatch=(reason:Extract<LinkedReplayFailure,{status:'mismatch'}>['reason']):LinkedReplayFailure=>({status:'mismatch',reason});
const count=(value:number,minimum=0)=>Number.isSafeInteger(value)&&value>=minimum;
const uint=(value:number)=>count(value)&&value<=0xffffffff;
const checkpoint=(row:ReplayReceiptCheckpoint|undefined):row is ReplayReceiptCheckpoint=>
  !!row&&count(row.tick,1)&&count(row.actorCount)&&count(row.livingCount)&&row.livingCount<=row.actorCount&&
  uint(row.randomState)&&typeof row.sha256==='string'&&sha.test(row.sha256);
const sameCheckpoint=(a:ReplayReceiptCheckpoint,b:ReplayReceiptCheckpoint)=>
  a.tick===b.tick&&a.actorCount===b.actorCount&&a.livingCount===b.livingCount&&a.randomState===b.randomState&&a.sha256===b.sha256;
const validRun=(row:ReplayReceiptRun|undefined,start:ReplayReceiptCheckpoint,ticks:number)=>
  !!row&&checkpoint(row)&&row.actorCount>=start.actorCount&&row.tick===start.tick+ticks&&row.completedTicks===ticks&&
  row.retainedSourceActors===true&&(row.elapsedMs===null||Number.isFinite(row.elapsedMs)&&row.elapsedMs>=0);

function validReceipt(receipt:ReplayReceipt|undefined):receipt is ReplayReceipt{
  if(!receipt||receipt.protocolVersion!==1||receipt.requestedTicks!==4||
    typeof receipt.ruleVersion!=='string'||!sha.test(receipt.ruleVersion)||
    !uint(receipt.seed)||!profiles.has(receipt.profileId)||receipt.randomAlgorithm!=='mulberry32-v1'||
    receipt.timingScope!=='browser_worker'&&receipt.timingScope!=='node_process'||
    receipt.identicalVerifiedSave!==true||!checkpoint(receipt.sourceCheckpoint))return false;
  return validRun(receipt.direct,receipt.sourceCheckpoint,receipt.requestedTicks)&&
    validRun(receipt.chunked,receipt.sourceCheckpoint,receipt.requestedTicks)&&sameCheckpoint(receipt.direct,receipt.chunked);
}
function copyCheckpoint(row:ReplayReceiptCheckpoint):ReplayReceiptCheckpoint{
  return {tick:row.tick,actorCount:row.actorCount,livingCount:row.livingCount,randomState:row.randomState,sha256:row.sha256};
}
function copyRun(row:ReplayReceiptRun):ReplayReceiptRun{
  return Object.freeze({...copyCheckpoint(row),completedTicks:row.completedTicks,elapsedMs:row.elapsedMs,retainedSourceActors:row.retainedSourceActors});
}
function frozenReceipt(r:ReplayReceipt):ReplayReceipt{
  return Object.freeze({protocolVersion:r.protocolVersion,ruleVersion:r.ruleVersion,seed:r.seed,profileId:r.profileId,
    randomAlgorithm:r.randomAlgorithm,requestedTicks:r.requestedTicks,timingScope:r.timingScope,
    sourceCheckpoint:Object.freeze(copyCheckpoint(r.sourceCheckpoint)),direct:copyRun(r.direct),chunked:copyRun(r.chunked),
    identicalVerifiedSave:r.identicalVerifiedSave});
}
async function hash(text:string,runtime:LinkedReplayRuntime):Promise<string|undefined>{
  try{
    let digest:string;
    if(runtime.sha256)digest=await runtime.sha256(text);
    else {
      if(!globalThis.crypto?.subtle)return undefined;
      const raw=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
      digest=Array.from(new Uint8Array(raw),byte=>byte.toString(16).padStart(2,'0')).join('');
    }
    return typeof digest==='string'&&sha.test(digest)?digest:undefined;
  }catch{return undefined;}
}
const stableCheckpoint=(c:ReplayReceiptCheckpoint)=>[c.tick,c.actorCount,c.livingCount,c.randomState,c.sha256] as const;
const stableRun=(r:ReplayReceiptRun)=>[...stableCheckpoint(r),r.completedTicks,r.retainedSourceActors] as const;
function canonical(record:Omit<LinkedReplayRecord,'digest'>):string{
  const r=record.receipt;
  return JSON.stringify(['sect-linked-replay',1,record.branchId,record.predecessorDigest??null,
    r.protocolVersion,r.ruleVersion,r.seed,r.profileId,r.randomAlgorithm,r.requestedTicks,
    stableCheckpoint(r.sourceCheckpoint),stableRun(r.direct),stableRun(r.chunked),r.identicalVerifiedSave]);
}

type SourceProof={status:'source';world:WorldState};
async function sourceProof(timeline:WorldTimeline,branchId:string,receipt:ReplayReceipt,runtime:LinkedReplayRuntime,
  source=receipt.sourceCheckpoint):Promise<SourceProof|LinkedReplayFailure>{
  if(!runtime.knownRuleVersions.has(receipt.ruleVersion))return unavailable('rule_build');
  if(typeof branchId!=='string'||!branchPattern.test(branchId))return mismatch('source');
  const branches=timeline.branches.filter(row=>row.id===branchId);
  if(!branches.length)return unavailable('snapshot_lost');
  if(branches.length!==1)return mismatch('source');
  const snapshots=branches[0].snapshots.filter(row=>row.tick===source.tick);
  if(!snapshots.length)return unavailable('snapshot_lost');
  if(snapshots.length!==1)return mismatch('source');
  const {world}=snapshots[0];
  let exact:string;
  try{
    if(!world||world.tick!==source.tick||world.random.seed!==receipt.seed||world.random.algorithm!==receipt.randomAlgorithm||
      (world.worldgen?.profileId??null)!==receipt.profileId||world.random.state!==source.randomState||
      world.cultivators.length!==source.actorCount||world.cultivators.filter(row=>row.alive&&row.hp>0).length!==source.livingCount)
      return mismatch('snapshot');
    exact=encodeWorldSave(world);
  }catch{return mismatch('snapshot');}
  const digest=await hash(exact,runtime);
  if(!digest)return unavailable('crypto');
  if(digest!==source.sha256)return mismatch('snapshot');
  return {status:'source',world};
}

async function verifyRecord(timeline:WorldTimeline,record:LinkedReplayRecord,runtime:LinkedReplayRuntime):
  Promise<SourceProof|LinkedReplayFailure>{
  if(!record||typeof record.digest!=='string'||!sha.test(record.digest)||
    record.predecessorDigest!==undefined&&(typeof record.predecessorDigest!=='string'||!sha.test(record.predecessorDigest))||
    !validReceipt(record.receipt))return mismatch('receipt');
  if(!runtime.knownRuleVersions.has(record.receipt.ruleVersion))return unavailable('rule_build');
  const digest=await hash(canonical(record),runtime);
  if(!digest)return unavailable('crypto');
  const token=captured.get(record);
  if(digest!==record.digest||!token)return mismatch('receipt');
  const source=await sourceProof(timeline,record.branchId,record.receipt,runtime);
  if(source.status==='source'&&frameToken(source.world)!==token)return mismatch('source');
  return source;
}
function sameJunction(first:ReplayReceipt,second:ReplayReceipt):boolean{
  return first.ruleVersion===second.ruleVersion&&first.seed===second.seed&&first.profileId===second.profileId&&
    first.randomAlgorithm===second.randomAlgorithm&&sameCheckpoint(first.direct,second.sourceCheckpoint);
}

/** Remember only explicit local Worker results; the source is re-read from the real retained branch, never imported. */
export async function captureLinkedReplayReceipt(timeline:WorldTimeline,branchId:string,outcome:ReplayReceiptOutcome,
  runtime:LinkedReplayRuntime,predecessor?:LinkedReplayRecord):Promise<LinkedReplayCapture>{
  if(!outcome)return mismatch('receipt');
  if(outcome.status==='unavailable')return outcome.reason==='rules_version'?unavailable('rule_build'):
    outcome.reason==='crypto'?unavailable('crypto'):mismatch('source');
  if(outcome.status!=='verified'||!validReceipt(outcome.receipt))return mismatch('receipt');
  const receipt=frozenReceipt(outcome.receipt);
  const retained=await sourceProof(timeline,branchId,receipt,runtime);
  if(retained.status!=='source')return retained;
  if(predecessor){
    const prior=await verifyRecord(timeline,predecessor,runtime);
    if(prior.status!=='source')return prior;
    if(predecessor.branchId!==branchId||!sameGeneratedWorld(prior.world,retained.world))return mismatch('source');
    if(!sameJunction(predecessor.receipt,receipt))return mismatch('predecessor');
  }
  const envelope:Omit<LinkedReplayRecord,'digest'>={branchId,receipt,...(predecessor?{predecessorDigest:predecessor.digest}:{})};
  const digest=await hash(canonical(envelope),runtime);
  if(!digest)return unavailable('crypto');
  const record=Object.freeze({...envelope,digest});
  captured.set(record,frameToken(retained.world));
  return {status:'captured',record};
}

/** Revalidate selected receipts and actual snapshots, without replaying history or applying any result. */
export async function verifyLinkedReplayReceipts(timeline:WorldTimeline,first:LinkedReplayRecord,second:LinkedReplayRecord,
  runtime:LinkedReplayRuntime):Promise<LinkedReplayVerification>{
  if(first===second||first?.digest===second?.digest)return mismatch('predecessor');
  const a=await verifyRecord(timeline,first,runtime);
  if(a.status!=='source')return a;
  const b=await verifyRecord(timeline,second,runtime);
  if(b.status!=='source')return b;
  if(first.branchId!==second.branchId||!sameGeneratedWorld(a.world,b.world))return mismatch('source');
  if(second.predecessorDigest!==first.digest||!sameJunction(first.receipt,second.receipt))return mismatch('predecessor');
  const terminal=await sourceProof(timeline,second.branchId,second.receipt,runtime,second.receipt.direct);
  if(terminal.status!=='source')return terminal;
  if(!sameGeneratedWorld(b.world,terminal.world))return mismatch('source');
  return {status:'linked',startTick:first.receipt.sourceCheckpoint.tick,junctionTick:second.receipt.sourceCheckpoint.tick,
    endTick:second.receipt.direct.tick};
}

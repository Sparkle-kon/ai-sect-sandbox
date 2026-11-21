import type { WorldState } from '../types/world';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { createFastForwardRunner } from './fastForwardEngine';
import type { ReplayReceiptFixtureId } from './replayReceiptFixtures';
import { createReplayReceiptFixture, REPLAY_RECEIPT_FIXTURE_COUNTS } from './replayReceiptFixtures';
import { encodeWorldSave, WorldSaveError } from './storageEngine';
import { advanceWorldTick } from './worldEngine';
import { sameGeneratedWorld } from './worldIdentity';

export const REPLAY_RECEIPT_PROTOCOL=1;
export const REPLAY_RECEIPT_TICKS=4;
export type ReplayReceiptSource={kind:'branch';branchId:string;tick:number}|{kind:'fixture';fixtureId:ReplayReceiptFixtureId};
export type ReplayReceiptRequest={type:'verify_replay';runId:string}&(
  {source:Extract<ReplayReceiptSource,{kind:'branch'}>;base:WorldState}|
  {source:Extract<ReplayReceiptSource,{kind:'fixture'}>});
export type ReplayReceiptUnavailable='rules_version'|'crypto'|'source'|'save_size'|'invalid_save'|'execution';
export type ReplayReceiptTimingScope='browser_worker'|'node_process';
export type ReplayReceiptCheckpoint={tick:number;actorCount:number;livingCount:number;randomState:number;sha256:string};
export type ReplayReceiptRun=ReplayReceiptCheckpoint&{completedTicks:number;elapsedMs:number|null;retainedSourceActors:boolean};
export interface ReplayReceipt {
  protocolVersion:typeof REPLAY_RECEIPT_PROTOCOL;
  ruleVersion:string;
  seed:number;
  profileId:NonNullable<WorldState['worldgen']>['profileId']|null;
  randomAlgorithm:WorldState['random']['algorithm'];
  requestedTicks:typeof REPLAY_RECEIPT_TICKS;
  timingScope:ReplayReceiptTimingScope;
  sourceCheckpoint:ReplayReceiptCheckpoint;
  direct:ReplayReceiptRun;
  chunked:ReplayReceiptRun;
  identicalVerifiedSave:boolean;
}
export type ReplayReceiptOutcome=
  {status:'verified'|'mismatch';receipt:ReplayReceipt}|{status:'unavailable';reason:ReplayReceiptUnavailable};
export type ReplayReceiptResponse={type:'replay_receipt';runId:string;source:ReplayReceiptSource;outcome:ReplayReceiptOutcome};
export interface ReplayReceiptRuntime {
  ruleVersion:string|undefined;
  timingScope?:ReplayReceiptTimingScope;
  now?:()=>number;
  sha256?:(canonicalText:string)=>Promise<string>;
}
const shaPattern=/^[a-f0-9]{64}$/;
const safeBranch=/^(?:main|branch-[1-9]\d*)$/;
async function hashSave(canonicalText:string):Promise<string> {
  const bytes=new TextEncoder().encode(canonicalText);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
const describe=(world:WorldState):Omit<ReplayReceiptCheckpoint,'sha256'>=>({
  tick:world.tick, actorCount:world.cultivators.length, livingCount:world.cultivators.filter(actor=>actor.alive&&actor.hp>0).length,
  randomState:world.random.state,
});
const elapsed=(start:number,end:number):number|null=>Number.isFinite(start)&&Number.isFinite(end)&&end>=start?end-start:null;

/** Explicit local QA only: no state replacement, model, or apply-able checkpoint leaves this boundary. */
export async function verifyReplayReceipt(request:ReplayReceiptRequest, runtime:ReplayReceiptRuntime):Promise<ReplayReceiptResponse> {
  const {runId}=request;
  const source:ReplayReceiptSource=request.source.kind==='branch'
    ?{kind:'branch',branchId:request.source.branchId,tick:request.source.tick}
    :{kind:'fixture',fixtureId:request.source.fixtureId};
  const reply=(outcome:ReplayReceiptOutcome):ReplayReceiptResponse=>({type:'replay_receipt',runId,source,outcome});
  const unavailable=(reason:ReplayReceiptUnavailable)=>reply({status:'unavailable',reason});
  const {ruleVersion,now=()=>performance.now(),sha256=hashSave,timingScope='browser_worker'}=runtime;
  if(!ruleVersion || !shaPattern.test(ruleVersion)) return unavailable('rules_version');
  if(!runtime.sha256 && !globalThis.crypto?.subtle) return unavailable('crypto');
  if(source.kind==='branch'?
    !safeBranch.test(source.branchId)||!('base'in request)||!request.base||source.tick!==request.base.tick||
      !Number.isSafeInteger(source.tick)||source.tick<1||!Number.isSafeInteger(source.tick+REPLAY_RECEIPT_TICKS):
    !Object.hasOwn(REPLAY_RECEIPT_FIXTURE_COUNTS,source.fixtureId)) return unavailable('source');

  let base:WorldState, direct:WorldState, chunked:WorldState;
  let baseSave:string,directSave:string,chunkedSave:string;
  let directMs:number|null,chunkedMs:number|null;
  try{
    if(source.kind==='fixture') base=createReplayReceiptFixture(source.fixtureId);
    else if('base'in request) base=request.base;
    else return unavailable('source');
    baseSave=encodeWorldSave(base);
    const directStart=now();
    direct=cloneWorldWithColdHistory(base);
    for(let i=0;i<REPLAY_RECEIPT_TICKS;i++){
      const past=direct;
      direct=advanceWorldTick(past,undefined,undefined,'utility');
      if(direct.tick!==past.tick+1 || direct.interventionSequence!==base.interventionSequence || !sameGeneratedWorld(past,direct)) {
        return unavailable('execution');
      }
    }
    directMs=elapsed(directStart,now());
    const chunkedStart=now();
    const runner=createFastForwardRunner(base,REPLAY_RECEIPT_TICKS,{now});
    let progress=runner.readProgress();
    for(let i=0;i<REPLAY_RECEIPT_TICKS&&progress.completedTicks<REPLAY_RECEIPT_TICKS;i++) progress=runner.advanceChunk();
    const checkpoint=runner.checkpoint();
    if(!checkpoint || checkpoint.completedTicks!==REPLAY_RECEIPT_TICKS || checkpoint.world.tick!==base.tick+REPLAY_RECEIPT_TICKS) {
      return unavailable('execution');
    }
    chunked=checkpoint.world;
    chunkedMs=elapsed(chunkedStart,now());
    directSave=encodeWorldSave(direct);
    chunkedSave=encodeWorldSave(chunked);
  }catch(error){
    return unavailable(error instanceof WorldSaveError?(error.code==='size'?'save_size':'invalid_save'):'execution');
  }

  const initialIds=base.cultivators.map(actor=>actor.id);
  const keeps=(candidate:WorldState)=>{
    const ids=new Set(candidate.cultivators.map(actor=>actor.id));
    return ids.size===candidate.cultivators.length && initialIds.every(id=>ids.has(id));
  };
  const directRetained=keeps(direct),chunkedRetained=keeps(chunked);
  const identicalVerifiedSave=directSave===chunkedSave;
  const seed=base.random.seed,profileId=base.worldgen?.profileId??null,randomAlgorithm=base.random.algorithm;
  const baseTick=base.tick;
  const baseCheckpoint=describe(base),directCheckpoint=describe(direct),chunkedCheckpoint=describe(chunked);
  try{
    const [baseHash,directHash,chunkedHash]=await Promise.all([sha256(baseSave),sha256(directSave),
      identicalVerifiedSave?Promise.resolve(undefined):sha256(chunkedSave)]);
    const chunkHash=chunkedHash??directHash;
    if(![baseHash,directHash,chunkHash].every(hash=>shaPattern.test(hash))) return unavailable('crypto');
    return reply({status:identicalVerifiedSave&&directRetained&&chunkedRetained?'verified':'mismatch',
      receipt:{protocolVersion:REPLAY_RECEIPT_PROTOCOL,ruleVersion,seed,
        profileId,randomAlgorithm,requestedTicks:REPLAY_RECEIPT_TICKS,timingScope,
        sourceCheckpoint:{...baseCheckpoint,sha256:baseHash},
        direct:{...directCheckpoint,sha256:directHash,completedTicks:directCheckpoint.tick-baseTick,elapsedMs:directMs,retainedSourceActors:directRetained},
        chunked:{...chunkedCheckpoint,sha256:chunkHash,completedTicks:chunkedCheckpoint.tick-baseTick,elapsedMs:chunkedMs,retainedSourceActors:chunkedRetained},
        identicalVerifiedSave}});
  }catch{return unavailable('crypto');}
}

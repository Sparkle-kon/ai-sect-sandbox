import type { WorldState } from '../types/world';
import { applyAuthoredEraDesign, AuthoredEraError, authoredEraTarget } from './authoredEraEngine';
import type { AuthoredEraErrorCode } from './authoredEraEngine';
import { encodeEraDesignDraft, EraDesignError } from './eraDesignDraft';
import type { EraDesignDraft } from './eraDesignDraft';
import { FAST_FORWARD_CHUNK_MS, FAST_FORWARD_CHUNK_TICKS } from './fastForwardEngine';
import { addCampaignCalendarMonths } from './fastForwardCalendar';
import type { FastForwardCalendarDate } from './fastForwardCalendar';
import { decodeEraWorldSave, encodeEraWorldSave, WorldSaveError } from './storageEngine';
import { advanceWorldTick } from './worldEngine';
import { sameGeneratedWorld } from './worldIdentity';

export const AUTHORED_ERA_BUILD_PROTOCOL=1;
export type AuthoredEraBuildDate=FastForwardCalendarDate&{readonly tick:number};
export interface AuthoredEraBuildProgress {
  readonly current:AuthoredEraBuildDate;
  readonly target:FastForwardCalendarDate;
  readonly completedMonths:number;
  readonly requestedMonths:number;
  readonly phase:'simulating'|'verifying';
}
export interface AuthoredEraBuildCandidate {
  readonly normalizedDraft:string;
  readonly draftSha256:string;
  readonly baselineSha256:string;
  readonly resultSha256:string;
  readonly ruleVersion:string;
  readonly target:AuthoredEraBuildDate;
  readonly resultText:string;
  readonly resultBytes:number;
}
export type AuthoredEraBuildError='draft'|'range'|'rules'|'constraints'|'codec'|'integrity'|'execution';
export interface AuthoredEraBuildIssue {readonly code:AuthoredEraErrorCode;readonly conditionIndex?:number}
export type AuthoredEraWorkerRequest=
  |{type:'authored_era_start';runId:string;draft:EraDesignDraft}
  |{type:'authored_era_cancel';runId:string};
export type AuthoredEraWorkerResponse=
  |{type:'authored_era_progress';runId:string;progress:AuthoredEraBuildProgress}
  |{type:'authored_era_ready';runId:string;candidate:AuthoredEraBuildCandidate}
  |{type:'authored_era_error';runId:string;reason:AuthoredEraBuildError;issues?:readonly AuthoredEraBuildIssue[]}
  |{type:'authored_era_cancelled';runId:string};
export interface AuthoredEraBuildControllerOptions {
  readonly post:(response:AuthoredEraWorkerResponse)=>void;
  readonly schedule:(callback:()=>void)=>unknown;
  readonly cancelSchedule:(handle:unknown)=>void;
  readonly ruleVersion:string|undefined;
  readonly now?:()=>number;
  readonly sha256?:(bytes:Uint8Array)=>Promise<string>;
}

const hex64=/^[a-f0-9]{64}$/;
const sameDate=(left:FastForwardCalendarDate,right:FastForwardCalendarDate)=>left.year===right.year&&left.month===right.month;
const date=(world:WorldState):AuthoredEraBuildDate=>({year:world.year,month:world.month,tick:world.tick});
const bytes=(value:string)=>new TextEncoder().encode(value);
export async function authoredEraBuildSha256(value:Uint8Array):Promise<string> {
  if(!globalThis.crypto?.subtle) throw Error('SHA-256 unavailable');
  const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',value));
  return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
class BadCandidate extends Error {
  constructor(readonly reason:AuthoredEraBuildError){super(reason);}
}
interface Job {
  runId:string; draft:EraDesignDraft; normalizedDraft:string; ruleVersion:string;
  start:AuthoredEraBuildDate; world:WorldState; requestedMonths:number;
  initialActorIds:Set<string>;
  scheduled?:{handle?:unknown};
  phase:AuthoredEraBuildProgress['phase'];
}

function verifiedNativeText(world:WorldState):string {
  const canonical=encodeEraWorldSave(world);
  if(encodeEraWorldSave(decodeEraWorldSave(canonical))!==canonical) throw new BadCandidate('integrity');
  return canonical;
}
function classify(error:unknown):{reason:AuthoredEraBuildError;issues?: AuthoredEraBuildIssue[]} {
  if(error instanceof BadCandidate) return {reason:error.reason};
  if(error instanceof EraDesignError) return {reason:'draft'};
  if(error instanceof WorldSaveError) return {reason:'codec'};
  if(error instanceof AuthoredEraError) {
    if(error.code==='unsupported_target') return {reason:'range'};
    if(error.code==='unverified_source') return {reason:'integrity'};
    const index=error.conditionIndex;
    return {reason:'constraints',issues:[{code:error.code,...(index!==undefined?{conditionIndex:index}:{})}]};
  }
  return {reason:'execution'};
}

/** This controller owns only a detached seeded world. It cannot apply, load or store anything. */
export function createAuthoredEraWorkerController(options:AuthoredEraBuildControllerOptions):(request:AuthoredEraWorkerRequest)=>void {
  const {post,schedule,cancelSchedule,now=()=>performance.now(),sha256=authoredEraBuildSha256}=options;
  let job:Job|undefined;
  const current=(candidate:Job)=>job===candidate;
  const stop=(candidate:Job)=>{
    if(!current(candidate))return false;
    job=undefined;
    if(candidate.scheduled)cancelSchedule(candidate.scheduled.handle);
    candidate.scheduled=undefined;
    return true;
  };
  const fail=(candidate:Job,error:unknown)=>{
    if(stop(candidate))post({type:'authored_era_error',runId:candidate.runId,...classify(error)});
  };
  const report=(candidate:Job)=>{
    if(current(candidate))post({type:'authored_era_progress',runId:candidate.runId,progress:{
      current:date(candidate.world),target:candidate.draft.target,completedMonths:candidate.world.tick-candidate.start.tick,
      requestedMonths:candidate.requestedMonths,phase:candidate.phase,
    }});
  };
  const hash=async (value:Uint8Array)=>{
    let digest:string;
    try{digest=await sha256(value);}catch{throw new BadCandidate('integrity');}
    if(!hex64.test(digest))throw new BadCandidate('integrity');
    return digest;
  };

  async function finish(candidate:Job) {
    if(!current(candidate))return;
    candidate.phase='verifying';
    report(candidate);
    if(!current(candidate))return;
    const {world:baseline,draft,normalizedDraft,ruleVersion}=candidate;
    if(!sameDate(baseline,draft.target)||baseline.tick!==candidate.start.tick+candidate.requestedMonths)throw new BadCandidate('integrity');
    const ids=new Set(baseline.cultivators.map(row=>row.id));
    if(ids.size!==baseline.cultivators.length || [...candidate.initialActorIds].some(id=>!ids.has(id)))throw new BadCandidate('integrity');
    const baselineText=encodeEraWorldSave(baseline);
    const [draftSha256,baselineSha256]=await Promise.all([hash(bytes(normalizedDraft)),hash(bytes(baselineText))]);
    if(!current(candidate))return;
    const authored=applyAuthoredEraDesign(draft,baseline,{rulesRevision:ruleVersion,designDigest:draftSha256,baselineDigest:baselineSha256});
    const origin=authored.authoredEraOrigin;
    if(authored.tick!==baseline.tick||!sameDate(authored,baseline)||authored.random.seed!==draft.seed||authored.worldgen?.profileId!==draft.profileId||
      authored.interventionSequence!==baseline.interventionSequence||authored.cultivators.length!==ids.size||
      authored.cultivators.some(actor=>!ids.delete(actor.id))||ids.size!==0||
      !origin||origin.openedTick!==authored.tick||!sameDate(origin,authored)||origin.rulesRevision!==ruleVersion||
      origin.designDigest!==draftSha256||origin.baselineDigest!==baselineSha256||encodeEraDesignDraft(origin.draft)!==normalizedDraft)
      throw new BadCandidate('integrity');
    const resultText=verifiedNativeText(authored);
    const resultBytes=bytes(resultText);
    const resultSha256=await hash(resultBytes);
    if(!current(candidate))return;
    if(stop(candidate))post({type:'authored_era_ready',runId:candidate.runId,candidate:{
      normalizedDraft,draftSha256,baselineSha256,resultSha256,ruleVersion,target:date(authored),resultText,resultBytes:resultBytes.byteLength,
    }});
  }
  function queue(candidate:Job) {
    if(!current(candidate)||candidate.scheduled||candidate.phase!=='simulating')return;
    const ticket:{handle?:unknown}={};
    candidate.scheduled=ticket;
    ticket.handle=schedule(()=>{
      if(!current(candidate)||candidate.scheduled!==ticket)return;
      candidate.scheduled=undefined;
      try{
        const chunkStart=now();
        let complete=candidate.world.tick-candidate.start.tick;
        for(let round=0;round<FAST_FORWARD_CHUNK_TICKS&&complete<candidate.requestedMonths;round++){
          const past=candidate.world,next=advanceWorldTick(past,undefined,undefined,'utility');
          const expected=addCampaignCalendarMonths(candidate.start,complete+1);
          if(!expected||!sameDate(next,expected)||next.tick!==past.tick+1||next.interventionSequence!==past.interventionSequence||
            next.random.algorithm!==past.random.algorithm||next.cultivators.length<past.cultivators.length||
            !sameGeneratedWorld(next,past))throw new BadCandidate('execution');
          candidate.world=next;
          complete++;
          if(now()-chunkStart>=FAST_FORWARD_CHUNK_MS)break;
        }
        if(complete===candidate.requestedMonths)void finish(candidate).catch(error=>fail(candidate,error));
        else{report(candidate);queue(candidate);}
      }catch(error){fail(candidate,error);}
    });
  }
  return (request)=>{
    if(!request||typeof request.runId!=='string'||request.runId.length<1||request.runId.length>96)return;
    if(request.type==='authored_era_cancel'){
      const candidate=job;
      if(candidate?.runId===request.runId&&stop(candidate))post({type:'authored_era_cancelled',runId:candidate.runId});
      return;
    }
    if(request.type!=='authored_era_start'||job)return;
    const {runId}=request;
    const {ruleVersion}=options;
    if(!ruleVersion||!hex64.test(ruleVersion)){
      post({type:'authored_era_error',runId,reason:'rules'});return;
    }
    try{
      const {draft,start,months}=authoredEraTarget(request.draft);
      const normalizedDraft=encodeEraDesignDraft(draft);
      const candidate:Job={runId,draft,normalizedDraft,ruleVersion,start:date(start),world:start,
        requestedMonths:months,initialActorIds:new Set(start.cultivators.map(row=>row.id)),phase:'simulating'};
      job=candidate;
      report(candidate);
      queue(candidate);
    }catch(error){
      if(job?.runId===runId)fail(job,error);
      else post({type:'authored_era_error',runId,...classify(error)});
    }
  };
}

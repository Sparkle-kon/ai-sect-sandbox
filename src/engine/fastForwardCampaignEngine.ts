import type {WorldState} from '../types/world';
import {FAST_FORWARD_MAX_TICKS,type FastForwardCheckpoint,type FastForwardProgress,type FastForwardWorkerRequest,type FastForwardWorkerResponse} from './fastForwardEngine';
import {addCampaignCalendarMonths,planCampaignCalendar,FAST_FORWARD_CAMPAIGN_MAX_MONTHS,
  type FastForwardCalendarDate,type FastForwardCalendarPlan} from './fastForwardCalendar';
export {addCampaignCalendarMonths};
export const planFastForwardCampaign=planCampaignCalendar;
import {sameGeneratedWorld} from './worldIdentity';

export const FAST_FORWARD_CAMPAIGN_MAX_TICKS=FAST_FORWARD_CAMPAIGN_MAX_MONTHS;
export interface CampaignCheckpoint {
  readonly startTick:number;readonly requestedTicks:number;readonly completedTicks:number;
  readonly baseRandomState:number;readonly baseInterventionSequence:number;readonly world:WorldState;
}
export type CampaignPlan=FastForwardCalendarPlan;
const nat=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const countValid=(n:number)=>nat(n)&&n>0&&n<=FAST_FORWARD_CAMPAIGN_MAX_TICKS;

const asCalendar=(world:WorldState,date:FastForwardCalendarDate|undefined)=>!!date&&world.year===date.year&&world.month===date.month;
const includesActualOriginalActors=(current:WorldState,base:WorldState)=>{
  const ids=new Set(current.cultivators.map(row=>row.id));
  return ids.size===current.cultivators.length&&base.cultivators.every(row=>ids.has(row.id));
};
/** Structural native continuity; user confirmation must separately prove the committed CAS/source capability. */
export function validCampaignCheckpoint(source:WorldState,checkpoint:CampaignCheckpoint):boolean{
  if(!checkpoint?.world||!countValid(checkpoint.requestedTicks)||!nat(checkpoint.completedTicks)||
      checkpoint.completedTicks>checkpoint.requestedTicks||checkpoint.startTick!==source.tick||
      checkpoint.baseRandomState!==source.random.state||checkpoint.baseInterventionSequence!==source.interventionSequence||
      !addCampaignCalendarMonths(source,checkpoint.requestedTicks))return false;
  const world=checkpoint.world;
  return world.tick===source.tick+checkpoint.completedTicks&&world.random.algorithm===source.random.algorithm&&
    (checkpoint.completedTicks!==0||world.random.state===source.random.state)&&world.interventionSequence===source.interventionSequence&&
    sameGeneratedWorld(world,source)&&includesActualOriginalActors(world,source)&&
    asCalendar(world,addCampaignCalendarMonths(source,checkpoint.completedTicks));
}
export function createCampaignCheckpoint(source:WorldState,requestedTicks:number):CampaignCheckpoint{
  const checkpoint={startTick:source.tick,requestedTicks,completedTicks:0,baseRandomState:source.random.state,
    baseInterventionSequence:source.interventionSequence,world:source};
  if(!validCampaignCheckpoint(source,checkpoint))throw RangeError('推演目标或原分支仙历无效。');
  return checkpoint;
}

export interface CampaignWorker {
  post(request:FastForwardWorkerRequest):void;
  terminate():void;
}
export type CampaignPhase='paused'|'running'|'pausing'|'checkpointing'|'ready'|'cancelling'|'cancelled'|'detached'|'error';
export interface CampaignControllerState {
  readonly phase:CampaignPhase;
  readonly completedTicks:number;
  readonly durableTicks:number;
  readonly requestedTicks:number;
  readonly currentDate:FastForwardCalendarDate;
  readonly durableDate:FastForwardCalendarDate;
  readonly notice?:string;
}
export interface FastForwardCampaignControllerOptions {
  /** Unique within this document/backend attempt (never a user-entered branch label). */
  readonly runId:string;
  readonly source:WorldState;
  readonly initial:CampaignCheckpoint;
  readonly createWorker:(receive:(message:FastForwardWorkerResponse)=>void,failed:()=>void)=>CampaignWorker;
  readonly commit:(previous:CampaignCheckpoint,next:CampaignCheckpoint)=>Promise<boolean>;
  readonly discard:()=>Promise<boolean>;
  readonly onState?:(state:CampaignControllerState)=>void;
}
interface Batch {
  id:string;base:CampaignCheckpoint;requested:number;progress:number;pausedAt?:number;port?:CampaignWorker;
}
export function createFastForwardCampaignController(options:FastForwardCampaignControllerOptions){
  if(!validCampaignCheckpoint(options.source,options.initial)||!/^[A-Za-z0-9_-]{1,64}(?![\s\S])/.test(options.runId))
    throw RangeError('隔离候选的起点、时间或标识无效。');
  const {source}=options;
  let durable=options.initial,completed=durable.completedTicks,batch:Batch|undefined,serial=0,generation=0;
  let pauseWanted=false,notice:string|undefined;
  let phase:CampaignPhase=completed===durable.requestedTicks?'ready':'paused';
  let pendingCommit:Promise<void>|undefined,pendingCancel:Promise<boolean>|undefined;
  function read():CampaignControllerState{
    return {phase,completedTicks:completed,durableTicks:durable.completedTicks,requestedTicks:durable.requestedTicks,
      currentDate:addCampaignCalendarMonths(source,completed)!,durableDate:addCampaignCalendarMonths(source,durable.completedTicks)!,
      ...(notice?{notice}:{})};
  }
  function announce(){try{options.onState?.(read());}catch{/* A presentation observer cannot interrupt native custody. */}}
  function stopWorker(){
    const local=batch;batch=undefined;
    try{local?.port?.terminate();}catch{/* stale notifications are still invalidated */}
  }
  function fail(text:string){
    if(phase==='cancelling'||phase==='cancelled')return;
    generation++;stopWorker();completed=durable.completedTicks;phase='error';notice=text;announce();
  }
  function globalCandidate(local:Batch,step:FastForwardCheckpoint):CampaignCheckpoint|undefined{
    if(!step)return undefined;
    const base=local.base.world,next=step.world;
    if(!next||step.startTick!==base.tick||step.baseRandomState!==base.random.state||
      step.baseInterventionSequence!==base.interventionSequence||step.requestedTicks!==local.requested||
      step.completedTicks!==local.progress||step.completedTicks<1||
      Math.min(local.pausedAt??local.requested,local.requested)!==step.completedTicks||
      !includesActualOriginalActors(next,base))return undefined;
    const checkpoint={...local.base,completedTicks:local.base.completedTicks+step.completedTicks,world:next};
    return validCampaignCheckpoint(source,checkpoint)?checkpoint:undefined;
  }
  function receive(local:Batch,token:number,message:FastForwardWorkerResponse){
    if(batch!==local||token!==generation||!message||message.runId!==local.id)return;
    if(message.type==='error'){fail('隔离批次失败，保留最后已验证节点。');return;}
    if(message.type==='cancelled'){fail('隔离批次意外中断，保留最后已验证节点。');return;}
    const progress:FastForwardProgress=message.progress;
    if(!progress||!nat(progress.completedTicks)||progress.startTick!==local.base.world.tick||
      progress.requestedTicks!==local.requested||progress.currentTick!==progress.startTick+progress.completedTicks||
      progress.completedTicks>local.requested||progress.completedTicks<local.progress||
      !addCampaignCalendarMonths(source,local.base.completedTicks+progress.completedTicks)){
      fail('快进批次回报月份不吻合；未接受检查点。');return;
    }
    local.progress=progress.completedTicks;completed=local.base.completedTicks+local.progress;
    if(message.type==='paused'){
      if(!pauseWanted||phase!=='pausing'){fail('快进批次暂停回报不吻合。');return;}
      local.pausedAt=local.progress;
      if(!local.progress){stopWorker();phase='paused';announce();return;}
      try{local.port?.post({type:'stage',runId:local.id});}
      catch{fail('无法封存暂停节点，已保留上一已验证节点。');}
      return;
    }
    if(message.type==='staged'){
      const next=globalCandidate(local,message.checkpoint);
      if(!next){fail('快进批次检查点未通过连续性校验。');return;}
      stopWorker();phase='checkpointing';
      // Schedule before announcing so even a synchronous UI cancel correctly waits for this write.
      const writing=Promise.resolve().then(async()=>{
        if(token!==generation)return;
        let written=false;
        try{written=await options.commit(local.base,next);}catch{/* keep original durable candidate */}
        if(token!==generation)return;
        if(!written){fail('检查点未能持久保存，未启动下一批。');return;}
        durable=next;completed=next.completedTicks;
        if(completed===next.requestedTicks){phase='ready';announce();}
        else if(pauseWanted){phase='paused';announce();}
        else startBatch();
      });
      pendingCommit=writing;
      void writing.finally(()=>{if(pendingCommit===writing)pendingCommit=undefined;});
      announce();
      return;
    }
    announce();
  }
  function startBatch(){
    if(pauseWanted||durable.completedTicks===durable.requestedTicks)return;
    const token=generation;
    const local:Batch={id:`${options.runId}-${++serial}`,base:durable,requested:Math.min(FAST_FORWARD_MAX_TICKS,
      durable.requestedTicks-durable.completedTicks),progress:0};
    batch=local;phase='running';notice=undefined;announce();
    if(token!==generation||batch!==local)return;
    try{
      local.port=options.createWorker(message=>receive(local,token,message),()=>{
        if(batch===local&&token===generation)fail('隔离 Worker 不可用，保留最后已验证节点。');
      });
      if(token!==generation||batch!==local){local.port.terminate();return;}
      local.port.post({type:'start',runId:local.id,base:durable.world,requestedTicks:local.requested});
    }catch{fail('隔离 Worker 无法开始批次，当前世界未改变。');}
  }
  function start():boolean{
    if(phase!=='paused')return false;
    pauseWanted=false;startBatch();return true;
  }
  function pause():boolean{
    if(phase!=='running'&&phase!=='checkpointing')return false;
    pauseWanted=true;
    if(phase==='checkpointing')return true;
    const local=batch;
    if(!local?.port){
      // Handle a synchronous user pause before the first native Worker message was posted.
      stopWorker();completed=durable.completedTicks;phase='paused';announce();return true;
    }
    phase='pausing';announce();
    if(batch!==local)return true;
    try{local.port.post({type:'pause',runId:local.id});}catch{fail('暂停失败，保留最后已验证节点。');}
    return true;
  }
  function cancel():Promise<boolean>{
    if(pendingCancel)return pendingCancel;
    if(phase==='cancelled')return Promise.resolve(true);
    if(phase==='detached')return Promise.resolve(false);
    generation++;pauseWanted=true;stopWorker();phase='cancelling';notice=undefined;
    const writing=pendingCommit;
    const cancelling=Promise.resolve().then(async()=>{
      // A previously transmitted IDB CAS may already have won. Discard against adapter's new token.
      try{await writing;}catch{/* still attempt exact discard */}
      let removed=false;
      try{removed=await options.discard();}catch{/* no unsupported deletion claim */}
      completed=durable.completedTicks;
      phase=removed?'cancelled':'error';
      notice=removed?undefined:'未确认已删除候选；原时间线没有改变。';announce();
      return removed;
    });
    pendingCancel=cancelling;
    void cancelling.finally(()=>{if(pendingCancel===cancelling)pendingCancel=undefined;});
    announce();
    return cancelling;
  }
  function detach(){
    if(phase==='detached'||phase==='cancelled'||phase==='cancelling')return;
    generation++;pauseWanted=true;stopWorker();phase='detached';
    // Do not mutate the durable record. Any CAS already sent can safely finish.
  }
  return {read,start,resume:start,pause,cancel,detach,
    /** Final App confirmation still must consume the exact durable journal authority. */
    readReadyCheckpoint:()=>phase==='ready'?durable:undefined};
}

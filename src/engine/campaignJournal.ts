import { addCampaignCalendarMonths, FAST_FORWARD_CAMPAIGN_MAX_MONTHS } from './fastForwardCalendar';
import type { CampaignCheckpoint } from './fastForwardCampaignEngine';
import { campaignStopReceiptMatchesResult, isCampaignStopCondition, isCampaignStopReceipt, validCampaignStopCondition } from './campaignStopCondition';
import type { CampaignStopCondition, CampaignStopReceipt } from './campaignStopCondition';
import { sameGeneratedWorld } from './worldIdentity';
import { badCampaign, CampaignPersistenceError, campaignHashValid, campaignInteger, campaignKeys,
  campaignRecord, campaignSHA256, campaignTokenKeyValid, checkCampaignBlob, readCampaignSource,
  readCampaignWorld, sealCampaignWorld, stopCampaignRead } from './campaignMemento';
import type { CampaignSourceMemento, CampaignWorldBlob, CampaignWorldRef, ReadCampaignSource } from './campaignMemento';

const DB = 'ai-sect-campaigns-v1';
const RECORDS = 'campaigns';
const SOURCES = 'origins';
const ACTIVE_KEY = 'active';
const MAX_MONTHS = FAST_FORWARD_CAMPAIGN_MAX_MONTHS;
export type CampaignJournalStatus = 'pending'|'ready'|'cancelled'|'finalized';
export interface CampaignJournalToken { readonly id:string; readonly revision:number; readonly generation:string }
interface CampaignTarget { readonly tick:number;readonly year:number;readonly month:number }
export interface CampaignJournalRecord extends CampaignJournalToken {
  readonly ruleVersion:string;
  readonly topologySha256:string;
  readonly source:CampaignWorldRef;
  readonly sourceTimelineId:string;
  readonly sourceBranchId:string;
  readonly baseRandomState:number;
  readonly baseInterventionSequence:number;
  readonly target:CampaignTarget;
  readonly requestedTicks:number;
  readonly completedTicks:number;
  readonly status:CampaignJournalStatus;
  readonly head?:CampaignWorldBlob;
  readonly previousSha256?:string;
  readonly committedBranchId?:string;
  readonly stopCondition?:CampaignStopCondition;
  readonly stopReceipt?:CampaignStopReceipt;
  readonly seal:string;
}
export interface LoadedCampaignJournal { readonly record:CampaignJournalRecord;readonly source:ReadCampaignSource;
  readonly checkpoint:CampaignCheckpoint }
type JournalWrite =
  | {readonly kind:'begin'; readonly next:CampaignJournalRecord; readonly source:CampaignSourceMemento}
  | {readonly kind:'write'; readonly expected:CampaignJournalToken&{readonly seal:string}; readonly next:CampaignJournalRecord}
  | {readonly kind:'discard'; readonly expected:CampaignJournalToken&{readonly seal:string}};
export interface CampaignJournalBackend {
  read():Promise<unknown>;
  readSource(id:string):Promise<unknown>;
  /** Atomic compare and swap across the row and associated source memento. */
  commit(change:JournalWrite):Promise<boolean>;
}
const unavailable=()=>new CampaignPersistenceError('unavailable','浏览器暂不能写入年代推演检查点。原世界与已有存档未改变。');
const conflict=()=>new CampaignPersistenceError('conflict','另一处已改变该推演，请重新检查最后已落档月份。');
const ruleError=()=>new CampaignPersistenceError('rule','本机推演规则和原候选不同，不能继续或确认；原线仍可重新打开。');
const id = () => {
  if(typeof globalThis.crypto?.randomUUID!=='function')throw unavailable();
  return globalThis.crypto.randomUUID();
};
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const sourceRef=(raw:unknown):CampaignWorldRef=>{
  if(!campaignRecord(raw)||!campaignKeys(raw,['sha256','tick','year','month'])||!campaignHashValid(raw.sha256)||
     !campaignInteger(raw.tick)||!campaignInteger(raw.year)||!campaignInteger(raw.month,1,12))return badCampaign();
  return {sha256:raw.sha256,tick:raw.tick,year:raw.year,month:raw.month};
};
const targetRef=(raw:unknown):CampaignTarget=>{
  if(!campaignRecord(raw)||!campaignKeys(raw,['tick','year','month'])||!campaignInteger(raw.tick)||
     !campaignInteger(raw.year)||!campaignInteger(raw.month,1,12))return badCampaign();
  return {tick:raw.tick,year:raw.year,month:raw.month};
};
function sameToken(left:CampaignJournalToken,right:CampaignJournalToken):boolean {
  return left.id===right.id&&left.generation===right.generation&&left.revision===right.revision;
}
function tokenFrom(raw:unknown):CampaignJournalToken|undefined {
  if(!campaignRecord(raw)||!campaignTokenKeyValid(raw.id)||!campaignTokenKeyValid(raw.generation)||!campaignInteger(raw.revision,1))return;
  return {id:raw.id,generation:raw.generation,revision:raw.revision};
}
function stopConditionFrom(raw:unknown):CampaignStopCondition|undefined {
  if(raw===undefined)return;
  if(!isCampaignStopCondition(raw))return badCampaign();
  return Object.freeze({...raw});
}
function stopReceiptFrom(raw:unknown,condition:CampaignStopCondition|undefined):CampaignStopReceipt|undefined {
  if(raw===undefined)return;
  if(!condition||!isCampaignStopReceipt(raw)||raw.kind!==condition.kind||
    (raw.kind==='actor_died'&&condition.kind==='actor_died'&&raw.actorId!==condition.actorId)||
    (raw.kind==='site_owner_changed'&&condition.kind==='site_owner_changed'&&raw.siteId!==condition.siteId)||
    (raw.kind==='sect_leader_changed'&&condition.kind==='sect_leader_changed'&&raw.sectId!==condition.sectId))return badCampaign();
  return Object.freeze({...raw});
}
function stopConditionTuple(point:CampaignStopCondition) {
  switch(point.kind){
    case 'actor_died':return [point.kind,point.actorId];
    case 'site_owner_changed':return [point.kind,point.siteId];
    case 'sect_leader_changed':return [point.kind,point.sectId,point.initialLeaderId];
  }
}
function stopReceiptTuple(point:CampaignStopReceipt) {
  const head=[point.kind,point.tick,point.year,point.month,point.eventId??null];
  switch(point.kind){
    case 'actor_died':return [...head,point.actorId];
    case 'site_owner_changed':return [...head,point.siteId,point.fromSectId,point.toSectId,point.planId??null];
    case 'sect_leader_changed':return [...head,point.sectId,point.fromActorId,point.toActorId,point.method??null,point.filledVacancy??null];
  }
}
function checkRecord(raw:unknown):CampaignJournalRecord {
  const token=tokenFrom(raw);
  if(!token||!campaignRecord(raw)||!campaignKeys(raw,['id','generation','revision','ruleVersion','topologySha256','source',
    'sourceTimelineId','sourceBranchId','baseRandomState','baseInterventionSequence','target','requestedTicks','completedTicks',
    'status','head','previousSha256','committedBranchId','stopCondition','stopReceipt','seal'])||
    !campaignHashValid(raw.ruleVersion)||!campaignHashValid(raw.topologySha256)||!campaignTokenKeyValid(raw.sourceTimelineId)||
    !campaignTokenKeyValid(raw.sourceBranchId)||!campaignInteger(raw.baseRandomState,0,0xffffffff)||
    !campaignInteger(raw.baseInterventionSequence)||!campaignInteger(raw.requestedTicks,1,MAX_MONTHS)||
    !campaignInteger(raw.completedTicks,0,raw.requestedTicks)||!campaignHashValid(raw.seal))return badCampaign();
  const {status}=raw, head=raw.head===undefined?undefined:checkCampaignBlob(raw.head), source=sourceRef(raw.source), target=targetRef(raw.target);
  const stopCondition=stopConditionFrom(raw.stopCondition);
  const stopReceipt=stopReceiptFrom(raw.stopReceipt,stopCondition);
  const completed=raw.completedTicks>0, reached=raw.completedTicks===raw.requestedTicks||!!stopReceipt;
  const reachedDate=completed?advance(source,raw.completedTicks):undefined;
  if(stopReceipt&&(!reachedDate||stopReceipt.tick!==reachedDate.tick||stopReceipt.year!==reachedDate.year||
    stopReceipt.month!==reachedDate.month))return badCampaign();
  if((status!=='pending'&&status!=='ready'&&status!=='cancelled'&&status!=='finalized')||
    completed!==!!head||completed!==campaignHashValid(raw.previousSha256)||
    (!completed&&raw.previousSha256!==undefined)||(status==='pending'&&reached)||
    ((status==='ready'||status==='finalized')&&!reached)||
    (status==='finalized'?!campaignTokenKeyValid(raw.committedBranchId):raw.committedBranchId!==undefined))return badCampaign();
  const date=advance(source,raw.requestedTicks);
  if(!date||target.tick!==date.tick||target.year!==date.year||target.month!==date.month)return badCampaign();
  return {...token,status,head,source,target,ruleVersion:raw.ruleVersion,topologySha256:raw.topologySha256,
    sourceTimelineId:raw.sourceTimelineId,sourceBranchId:raw.sourceBranchId,baseRandomState:raw.baseRandomState,
    baseInterventionSequence:raw.baseInterventionSequence,requestedTicks:raw.requestedTicks,completedTicks:raw.completedTicks,
    previousSha256:completed?raw.previousSha256 as string:undefined,
    committedBranchId:typeof raw.committedBranchId==='string'?raw.committedBranchId:undefined,
    ...(stopCondition?{stopCondition}:{}),...(stopReceipt?{stopReceipt}:{}),seal:raw.seal};
}
function advance(source:CampaignTarget,months:number):CampaignTarget|undefined {
  if(!campaignInteger(months,1,MAX_MONTHS)||!campaignInteger(source.tick+months))return;
  const date=addCampaignCalendarMonths(source,months);
  return date?{...date,tick:source.tick+months}:undefined;
}
type Unsealed=Omit<CampaignJournalRecord,'seal'>;
const sign=(r:Unsealed,signal?:AbortSignal)=>campaignSHA256(encode([
  'campaign-journal',1,r.id,r.generation,r.revision,r.status,r.ruleVersion,r.topologySha256,r.sourceTimelineId,r.sourceBranchId,
  [r.source.sha256,r.source.tick,r.source.year,r.source.month],r.baseRandomState,r.baseInterventionSequence,
  [r.target.tick,r.target.year,r.target.month],r.requestedTicks,r.completedTicks,
  r.head?[r.head.sha256,r.head.bytes]:null,r.previousSha256??null,r.committedBranchId??null,
  // Date-only E1-4 rows keep byte-identical seal material; stop plans have a typed domain-separated suffix.
  ...(r.stopCondition?[['stop-v1',stopConditionTuple(r.stopCondition),r.stopReceipt?stopReceiptTuple(r.stopReceipt):null]]:[]),
]),signal);
async function verifiedRecord(raw:unknown,signal?:AbortSignal):Promise<CampaignJournalRecord|undefined> {
  if(raw===undefined)return;
  const r=checkRecord(raw);
  if(await sign(r,signal)!==r.seal)throw new CampaignPersistenceError('integrity','持久推演凭据摘要不符。');
  return r;
}
async function needsToken(backend:CampaignJournalBackend,token:CampaignJournalToken,signal?:AbortSignal) {
  stopCampaignRead(signal);
  const chosen=tokenFrom(token);
  if(!chosen)throw conflict();
  const current=await verifiedRecord(await backend.read(),signal);
  if(!current||!sameToken(current,chosen))throw conflict();
  return current;
}
function correctRule(engineRuleVersion:string,current?:CampaignJournalRecord){
  if(!campaignHashValid(engineRuleVersion)||(current&&current.ruleVersion!==engineRuleVersion))throw ruleError();
}
async function loadOrigin(backend:CampaignJournalBackend,record:CampaignJournalRecord,signal?:AbortSignal):Promise<ReadCampaignSource>{
  stopCampaignRead(signal);
  const source=await readCampaignSource(await backend.readSource(record.id),{signal});
  if(source.timelineId!==record.sourceTimelineId||source.worldHash!==record.source.sha256||
     source.topologySha256!==record.topologySha256||source.timeline.activeBranchId!==record.sourceBranchId||
     source.world.tick!==record.source.tick||source.world.year!==record.source.year||source.world.month!==record.source.month||
     source.world.random.state!==record.baseRandomState||source.world.interventionSequence!==record.baseInterventionSequence||
     (record.status==='finalized'&&record.committedBranchId!==`branch-${source.timeline.nextBranchNumber}`))return badCampaign();
  return source;
}
async function load(backend:CampaignJournalBackend,record:CampaignJournalRecord,signal?:AbortSignal):Promise<LoadedCampaignJournal>{
  const source=await loadOrigin(backend,record,signal);
  if(record.stopCondition&&!validCampaignStopCondition(source.world,record.stopCondition))return badCampaign();
  const candidate=record.head?await readCampaignWorld(record.head,signal):source.world;
  const checkpoint:CampaignCheckpoint={startTick:record.source.tick,requestedTicks:record.requestedTicks,completedTicks:record.completedTicks,
    baseRandomState:record.baseRandomState,baseInterventionSequence:record.baseInterventionSequence,world:candidate,
    ...(record.stopReceipt?{stopReceipt:record.stopReceipt}:{})};
  if(record.head&&!validWorldProgress(record,checkpoint,source.world))return badCampaign();
  await needsToken(backend,record,signal); // Detect a concurrent update while validating both physical records.
  return {record,source,checkpoint};
}
/** Endpoint check supplements the native per-month Worker, never substitutes for it. */
function endpointRequiresStop(condition:CampaignStopCondition,previous:CampaignCheckpoint['world'],next:CampaignCheckpoint['world']){
  if(condition.kind==='actor_died'){
    const actor=next.cultivators.find(row=>row.id===condition.actorId);
    return !!actor&&!actor.alive&&actor.hp===0;
  }
  if(condition.kind==='sect_leader_changed'){
    const nextLeader=next.sects.find(row=>row.id===condition.sectId)?.leaderId;
    return !!nextLeader&&nextLeader!==condition.initialLeaderId;
  }
  const before=previous.locations.find(row=>row.id===condition.siteId),after=next.locations.find(row=>row.id===condition.siteId);
  return !!before&&!!after&&before.ownerSectId!==after.ownerSectId;
}
function stopMatchesPrevious(proof:CampaignStopReceipt, condition:CampaignStopCondition,previous:CampaignCheckpoint['world']){
  if(proof.kind==='actor_died')return previous.cultivators.some(actor=>actor.alive&&actor.hp>0&&actor.id===proof.actorId);
  if(proof.kind==='site_owner_changed'){
    const site=previous.locations.find(row=>row.id===proof.siteId);
    return !!site&&(site.ownerSectId??null)===proof.fromSectId;
  }
  return condition.kind==='sect_leader_changed'&&proof.fromActorId===condition.initialLeaderId;
}
function validWorldProgress(record:CampaignJournalRecord,checkpoint:CampaignCheckpoint,previous:CampaignCheckpoint['world']) {
  const {world}=checkpoint;
  if(!world||checkpoint.startTick!==record.source.tick||checkpoint.requestedTicks!==record.requestedTicks||
    checkpoint.baseRandomState!==record.baseRandomState||checkpoint.baseInterventionSequence!==record.baseInterventionSequence||
    !campaignInteger(checkpoint.completedTicks,1,record.requestedTicks))return false;
  const actual=advance(record.source,checkpoint.completedTicks);
  if(!actual||world.tick!==actual.tick||world.year!==actual.year||world.month!==actual.month||
    world.random.algorithm!==previous.random.algorithm||world.interventionSequence!==record.baseInterventionSequence||
    !sameGeneratedWorld(previous,world))return false;
  const {stopCondition}=record;
  if(checkpoint.stopReceipt!==undefined){
    if(!stopCondition||!campaignStopReceiptMatchesResult(stopCondition,checkpoint.stopReceipt,world)||
      !endpointRequiresStop(stopCondition,previous,world)||!stopMatchesPrevious(checkpoint.stopReceipt,stopCondition,previous))return false;
  }else if(stopCondition&&endpointRequiresStop(stopCondition,previous,world))return false;
  const candidates=new Set(world.cultivators.map(({id})=>id));
  return candidates.size===world.cultivators.length&&previous.cultivators.every(({id})=>candidates.has(id));
}
async function update(backend:CampaignJournalBackend,current:CampaignJournalRecord,change:Partial<Unsealed>,
  signal?:AbortSignal):Promise<CampaignJournalRecord> {
  const draft={...current,...change,revision:current.revision+1};
  const next=checkRecord({...draft,seal:await sign(draft,signal)});
  stopCampaignRead(signal);
  if(!await backend.commit({kind:'write',expected:current,next}))throw conflict();
  return next;
}

export function createCampaignJournal(backend:CampaignJournalBackend = createIndexedDBCampaignBackend()) {
  return {
    async read({signal}:{signal?:AbortSignal}={}) {stopCampaignRead(signal);return verifiedRecord(await backend.read(),signal);},
    async load({signal}:{signal?:AbortSignal}={}) {
      stopCampaignRead(signal);
      const record=await verifiedRecord(await backend.read(),signal);
      return record?load(backend,record,signal):undefined;
    },
    async loadSource(token:CampaignJournalToken,{signal}:{signal?:AbortSignal}={}) {
      const record=await needsToken(backend,token,signal);
      const source=await loadOrigin(backend,record,signal);
      await needsToken(backend,record,signal);
      return source;
    },
    async begin(source:CampaignSourceMemento,requestedTicks:number,engineRuleVersion:string,
      {signal,stopCondition:input}:{signal?:AbortSignal;stopCondition?:CampaignStopCondition}={}) {
      const stopCondition=stopConditionFrom(input);
      correctRule(engineRuleVersion);
      if(await backend.read()!==undefined)throw conflict();
      const origin=await readCampaignSource(source,{signal});
      if(stopCondition&&!validCampaignStopCondition(origin.world,stopCondition))return badCampaign('停止条件与原分支不符。');
      const target=advance(source.active,requestedTicks);
      if(!target||origin.timeline.branches.length>=4)return badCampaign('目标日期无效，或时间线已无最终分支位。');
      const draft:Unsealed={id:id(),generation:id(),revision:1,ruleVersion:engineRuleVersion,topologySha256:origin.topologySha256,
        source:source.active,sourceTimelineId:origin.timelineId,sourceBranchId:origin.timeline.activeBranchId,
        baseRandomState:origin.world.random.state,baseInterventionSequence:origin.world.interventionSequence,
        target,requestedTicks,completedTicks:0,status:'pending',...(stopCondition?{stopCondition}:{})};
      const next=checkRecord({...draft,seal:await sign(draft,signal)});
      stopCampaignRead(signal);
      if(!await backend.commit({kind:'begin',source,next}))throw conflict();
      return next;
    },
    async claim(token:CampaignJournalToken,engineRuleVersion:string,{signal}:{signal?:AbortSignal}={}) {
      const current=await needsToken(backend,token,signal);
      correctRule(engineRuleVersion,current);
      if(current.status!=='pending'&&current.status!=='ready')throw conflict();
      return update(backend,current,{generation:id()},signal);
    },
    async checkpoint(token:CampaignJournalToken,checkpoint:CampaignCheckpoint,{signal}:{signal?:AbortSignal}={}) {
      const current=await needsToken(backend,token,signal);
      if(current.status!=='pending'||!campaignInteger(checkpoint.completedTicks,current.completedTicks+1,
        Math.min(current.completedTicks+120,current.requestedTicks)))throw conflict();
      const previous=current.head?await readCampaignWorld(current.head,signal):
        (await loadOrigin(backend,current,signal)).world;
      const stopReceipt=stopReceiptFrom(checkpoint.stopReceipt,current.stopCondition);
      if(!validWorldProgress(current,{...checkpoint,stopReceipt},previous))return badCampaign();
      const candidate=await sealCampaignWorld(checkpoint.world,signal);
      return update(backend,current,{head:candidate,previousSha256:current.head?.sha256??current.source.sha256,
        completedTicks:checkpoint.completedTicks,
        status:checkpoint.completedTicks===current.requestedTicks||stopReceipt?'ready':'pending',
        ...(stopReceipt?{stopReceipt}:{})},signal);
    },
    async cancel(token:CampaignJournalToken,{signal}:{signal?:AbortSignal}={}) {
      const current=await needsToken(backend,token,signal);
      if(current.status==='cancelled')return current;
      if(current.status==='finalized')throw conflict();
      return update(backend,current,{generation:id(),status:'cancelled'},signal);
    },
    async finalize(token:CampaignJournalToken,branchId:string,{signal}:{signal?:AbortSignal}={}) {
      const current=await needsToken(backend,token,signal);
      if(current.status!=='ready')throw conflict();
      const full=await load(backend,current,signal);
      if(branchId!==`branch-${full.source.timeline.nextBranchNumber}`)return badCampaign();
      return update(backend,current,{generation:id(),status:'finalized',committedBranchId:branchId},signal);
    },
    async discard(token:CampaignJournalToken,{signal}:{signal?:AbortSignal}={}) {
      const current=await needsToken(backend,token,signal);
      if(current.status!=='cancelled'&&current.status!=='finalized')throw conflict();
      stopCampaignRead(signal);
      if(!await backend.commit({kind:'discard',expected:current}))throw conflict();
    },
  };
}
export type CampaignJournal = ReturnType<typeof createCampaignJournal>;

export function createMemoryCampaignBackend():CampaignJournalBackend {
  let record:CampaignJournalRecord|undefined,origin:CampaignSourceMemento|undefined;
  return {
    async read(){return record&&structuredClone(record);},
    async readSource(id){return record?.id===id&&origin?structuredClone(origin):undefined;},
    async commit(change){
      if(change.kind==='begin'){
        if(record)return false;
        record=structuredClone(change.next);origin=structuredClone(change.source);return true;
      }
      if(!record||!sameToken(record,change.expected)||record.seal!==change.expected.seal)return false;
      if(change.kind==='discard'){record=undefined;origin=undefined;}
      else record=structuredClone(change.next);
      return true;
    },
  };
}
export function createIndexedDBCampaignBackend(openName=DB):CampaignJournalBackend {
  function open():Promise<IDBDatabase>{
    if(typeof indexedDB==='undefined')return Promise.reject(unavailable());
    return new Promise((resolve,reject)=>{
      let request:IDBOpenDBRequest, ended=false;
      try {request=indexedDB.open(openName,1);} catch {reject(unavailable());return;}
      const error=()=>{ended=true;reject(unavailable());};
      request.onblocked=error;request.onerror=error;
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(RECORDS))request.result.createObjectStore(RECORDS);
        if(!request.result.objectStoreNames.contains(SOURCES))request.result.createObjectStore(SOURCES);
      };
      request.onsuccess=()=>{
        const db=request.result;
        if(ended){db.close();return;}
        db.onversionchange=()=>db.close();
        resolve(db);
      };
    });
  }
  async function transaction<T>(names:string[],mode:IDBTransactionMode,
    action:(transaction:IDBTransaction,set:(value:T)=>void)=>void):Promise<T>{
    const db=await open();
    try{
      return await new Promise<T>((resolve,reject)=>{
        let result:T|undefined;
        const tx=db.transaction(names,mode);
        tx.oncomplete=()=>resolve(result as T);
        tx.onabort=()=>reject(unavailable());tx.onerror=()=>reject(unavailable());
        try {action(tx,value=>{result=value;});}
        catch {try{tx.abort();}catch{ /* already inactive */ } reject(unavailable());}
      });
    } catch(error) {
      if(error instanceof CampaignPersistenceError)throw error;
      throw unavailable();
    } finally {db.close();}
  }
  const get=(name:string,key:string)=>transaction<unknown>([name],'readonly',(tx,value)=>{
    const req=tx.objectStore(name).get(key);
    req.onsuccess=()=>value(req.result);
  });
  return {
    read:()=>get(RECORDS,ACTIVE_KEY),
    readSource:id=>get(SOURCES,id),
    commit:change=>transaction([RECORDS,SOURCES],'readwrite',(tx,result)=>{
      const records=tx.objectStore(RECORDS), sources=tx.objectStore(SOURCES), request=records.get(ACTIVE_KEY);
      request.onsuccess=()=>{
        try {
          const old=request.result;
          if(change.kind==='begin'){
            if(old!==undefined){result(false);return;}
            sources.add(change.source,change.next.id);records.add(change.next,ACTIVE_KEY);
          }else {
            const token=tokenFrom(old);
            if(!token||!campaignRecord(old)||!sameToken(token,change.expected)||old.seal!==change.expected.seal){result(false);return;}
            if(change.kind==='discard'){records.delete(ACTIVE_KEY);sources.delete(token.id);}
            else records.put(change.next,ACTIVE_KEY);
          }
          result(true);
        } catch {
          // Includes synchronous structured-clone failures after the first request.
          // Treat the entire commit as failed, never one object store by itself.
          tx.abort();
        }
      };
    }),
  };
}
let browserJournal:CampaignJournal|undefined;
export const campaignJournal = () => browserJournal??=createCampaignJournal();

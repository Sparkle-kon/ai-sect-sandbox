import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { decodeEraWorldSave, encodeEraWorldSave, ERA_WORLD_SAVE_MAX_BYTES } from './storageEngine';
import { TIMELINE_MAX_BRANCHES, TIMELINE_MAX_LABEL, TIMELINE_MAX_TICKS } from './timelineEngine';
import type { TimelineBranch, TimelineSnapshot, WorldTimeline } from './timelineEngine';
import type { WorldState } from '../types/world';

export const CAMPAIGN_SOURCE_MAX_BYTES = 128 * 1024 * 1024;
const FORMAT = 'ai-sect-campaign-source';
const VERSION = 1;
export type CampaignPersistenceErrorCode = 'invalid'|'integrity'|'size'|'abort'|'unavailable'|'conflict'|'rule';
export class CampaignPersistenceError extends Error {
  constructor(readonly code:CampaignPersistenceErrorCode,message:string) {super(message);this.name='CampaignPersistenceError';}
}
export const badCampaign = (message = '年代推演原线或候选检查点未通过校验。'):never => {throw new CampaignPersistenceError('invalid',message);};
export const stopCampaignRead = (signal?:AbortSignal) => {if(signal?.aborted)throw new CampaignPersistenceError('abort','已停止本次操作；实时世界未改变。');};
export const campaignHashValid = (s:unknown):s is string => typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export const campaignTokenKeyValid = (s:unknown):s is string => typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s);
export const campaignInteger = (n:unknown,min=0,max=Number.MAX_SAFE_INTEGER):n is number =>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
export const campaignRecord = (o:unknown):o is Record<string,unknown> => !!o&&typeof o==='object'&&!Array.isArray(o);
export const campaignKeys = (o:Record<string,unknown>,keys:readonly string[]) => Object.keys(o).every(k=>keys.includes(k));
const encoder=new TextEncoder();
export const CAMPAIGN_MAX_WORLDS = TIMELINE_MAX_BRANCHES * TIMELINE_MAX_TICKS;
export interface CampaignWorldBlob {readonly sha256:string;readonly bytes:number;readonly content:string}
export interface CampaignWorldRef {readonly sha256:string;readonly tick:number;readonly year:number;readonly month:number}
export interface CampaignBranchMemento {
  readonly id:string;readonly label:string;readonly parentBranchId?:string;readonly forkTick?:number;
  readonly snapshots:readonly CampaignWorldRef[];
}
export interface CampaignSourceMemento {
  readonly format:typeof FORMAT;readonly version:typeof VERSION;readonly timelineId:string;
  readonly activeBranchId:string;readonly nextBranchNumber:number;readonly active:CampaignWorldRef;
  readonly branches:readonly CampaignBranchMemento[];readonly blobs:readonly CampaignWorldBlob[];
  readonly topologySha256:string;
}
export interface ReadCampaignSource {
  readonly timeline:WorldTimeline;readonly timelineId:string;readonly world:WorldState;readonly worldHash:string;
  readonly topologySha256:string;
}
export async function campaignSHA256(bytes:Uint8Array,signal?:AbortSignal):Promise<string> {
  stopCampaignRead(signal);
  if(!globalThis.crypto?.subtle)throw new CampaignPersistenceError('unavailable','当前浏览器不支持检查点完整性校验。');
  let result:ArrayBuffer;
  try {result=await globalThis.crypto.subtle.digest('SHA-256',bytes);}
  catch {stopCampaignRead(signal);throw new CampaignPersistenceError('unavailable','无法校验年代推演的内容摘要。');}
  stopCampaignRead(signal);
  return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function sealCampaignWorld(world:WorldState,signal?:AbortSignal):Promise<CampaignWorldBlob> {
  stopCampaignRead(signal);
  let content:string;
  try {content=encodeEraWorldSave(world);}
  catch(error) {
    if(campaignRecord(error)&&error.code==='size')throw new CampaignPersistenceError('size','单个推演快照超过 32 MiB；未更改原世界。');
    return badCampaign();
  }
  const raw=encoder.encode(content);
  return {sha256:await campaignSHA256(raw,signal),bytes:raw.byteLength,content};
}
export function checkCampaignBlob(value:unknown):CampaignWorldBlob {
  if(!campaignRecord(value)||!campaignKeys(value,['sha256','bytes','content'])||!campaignHashValid(value.sha256)||
     !campaignInteger(value.bytes,1,ERA_WORLD_SAVE_MAX_BYTES)||typeof value.content!=='string'||value.content.length>value.bytes)
    return badCampaign();
  return {sha256:value.sha256,bytes:value.bytes,content:value.content};
}
export async function readCampaignWorld(blob:CampaignWorldBlob,signal?:AbortSignal):Promise<WorldState> {
  const narrow=checkCampaignBlob(blob);
  stopCampaignRead(signal);
  const raw=encoder.encode(narrow.content);
  if(raw.byteLength!==narrow.bytes||await campaignSHA256(raw,signal)!==narrow.sha256)
    throw new CampaignPersistenceError('integrity','推演快照的内容摘要或字节数不符。');
  try {return decodeEraWorldSave(narrow.content);}
  catch {return badCampaign();}
}
const ref = (world:WorldState,sha256:string):CampaignWorldRef => ({sha256,tick:world.tick,year:world.year,month:world.month});
const refTuple = (r:CampaignWorldRef) => [r.sha256,r.tick,r.year,r.month] as const;
const sameRef = (r:CampaignWorldRef,s:CampaignWorldRef) => r.sha256===s.sha256&&r.tick===s.tick&&r.year===s.year&&r.month===s.month;
function readRef(value:unknown):CampaignWorldRef {
  if(!campaignRecord(value)||!campaignKeys(value,['sha256','tick','year','month'])||!campaignHashValid(value.sha256)||
     !campaignInteger(value.tick)||!campaignInteger(value.year)||!campaignInteger(value.month,1,12))return badCampaign();
  return {sha256:value.sha256,tick:value.tick,year:value.year,month:value.month};
}
type Shell=Omit<CampaignSourceMemento,'topologySha256'|'blobs'>;
async function shellDigest(shell:Shell,signal?:AbortSignal) {
  return campaignSHA256(encoder.encode(JSON.stringify([FORMAT,VERSION,shell.timelineId,shell.activeBranchId,
    shell.nextBranchNumber,refTuple(shell.active),shell.branches.map(b=>[
      b.id,b.label,b.parentBranchId??null,b.forkTick??null,b.snapshots.map(refTuple)])])),signal);
}
function checkShell(value:Record<string,unknown>):Shell {
  if(value.format!==FORMAT||value.version!==VERSION||!campaignTokenKeyValid(value.timelineId)||
      !campaignTokenKeyValid(value.activeBranchId)||!campaignInteger(value.nextBranchNumber,1)||
      !Array.isArray(value.branches)||value.branches.length<1||value.branches.length>TIMELINE_MAX_BRANCHES)return badCampaign();
  const active=readRef(value.active);
  const branchNos = new Set<string>();
  const branches:CampaignBranchMemento[]=value.branches.map((row:unknown,index)=>{
    if(!campaignRecord(row)||!campaignKeys(row,['id','label','parentBranchId','forkTick','snapshots'])||
       !campaignTokenKeyValid(row.id)||typeof row.label!=='string'||row.label.trim()===''||row.label.length>TIMELINE_MAX_LABEL||
       /[\u0000-\u001f\u007f]/.test(row.label)||!Array.isArray(row.snapshots)||row.snapshots.length<1||
       row.snapshots.length>TIMELINE_MAX_TICKS||branchNos.has(row.id))return badCampaign();
    if(index===0 ? row.id!=='main'||row.parentBranchId!==undefined||row.forkTick!==undefined
      : !/^branch-[1-9][0-9]*$/.test(row.id)||Number(row.id.slice(7))>=Number(value.nextBranchNumber)||
       !campaignTokenKeyValid(row.parentBranchId)||!branchNos.has(row.parentBranchId)||!campaignInteger(row.forkTick))return badCampaign();
    const snapshots = row.snapshots.map(readRef);
    if(snapshots.some((snap,i)=>i>0&&snap.tick<=snapshots[i-1].tick)||
       (typeof row.forkTick==='number'&&row.forkTick>snapshots[snapshots.length-1].tick))return badCampaign();
    branchNos.add(row.id);
    return {id:row.id,label:row.label,snapshots,...(typeof row.parentBranchId==='string'?{parentBranchId:row.parentBranchId}:{}),
      ...(typeof row.forkTick==='number'?{forkTick:row.forkTick}:{})};
  });
  const head=branches.find(branch=>branch.id===value.activeBranchId)?.snapshots.at(-1);
  if(!head||!sameRef(active,head))return badCampaign();
  return {format:FORMAT,version:VERSION,timelineId:value.timelineId,activeBranchId:value.activeBranchId,
    nextBranchNumber:value.nextBranchNumber,active,branches};
}
const tooLarge=()=>new CampaignPersistenceError('size','原时间线超过完整保留预算（128 MiB）；不会裁剪分支或历史。');

/** Capture only the exact currently authorized timeline and native bytes, never a seed reconstruction. */
export async function sealCampaignSource(timeline:WorldTimeline,timelineId:string,activeWorld:WorldState,
  {signal}:{signal?:AbortSignal}={}):Promise<CampaignSourceMemento> {
  stopCampaignRead(signal);
  if(!campaignTokenKeyValid(timelineId)||timeline.branches.length<1||timeline.branches.length>TIMELINE_MAX_BRANCHES||
     timeline.branches.some(branch=>branch.snapshots.length<1||branch.snapshots.length>TIMELINE_MAX_TICKS))return badCampaign();
  const seen=new Map<WorldState,CampaignWorldRef>();
  const blobs=new Map<string,CampaignWorldBlob>();
  let bytes=0;
  const branches:CampaignBranchMemento[]=[];
  for(const branch of timeline.branches){
    const snapshots:CampaignWorldRef[]=[];
    for(const snapshot of branch.snapshots){
      stopCampaignRead(signal);
      if(snapshot.tick!==snapshot.world.tick)return badCampaign();
      let proof=seen.get(snapshot.world);
      if(!proof){
        const blob=await sealCampaignWorld(snapshot.world,signal);
        proof=ref(snapshot.world,blob.sha256);seen.set(snapshot.world,proof);
        if(!blobs.has(blob.sha256)){
          bytes+=blob.bytes;
          if(bytes>CAMPAIGN_SOURCE_MAX_BYTES)throw tooLarge();
          blobs.set(blob.sha256,blob);
        }
      }
      snapshots.push(proof);
    }
    branches.push({id:branch.id,label:branch.label,snapshots,...(branch.parentBranchId!==undefined?{parentBranchId:branch.parentBranchId}:{}),
      ...(branch.forkTick!==undefined?{forkTick:branch.forkTick}:{})});
  }
  const anchor=seen.get(activeWorld)??ref(activeWorld,(await sealCampaignWorld(activeWorld,signal)).sha256);
  const shell=checkShell({format:FORMAT,version:VERSION,timelineId,activeBranchId:timeline.activeBranchId,
    nextBranchNumber:timeline.nextBranchNumber,active:anchor,branches});
  return freezeTree({...shell,blobs:[...blobs.values()],topologySha256:await shellDigest(shell,signal)});
}
function freezeTree<T extends object>(value:T):T {
  if(Object.isFrozen(value))return value;
  Object.freeze(value);
  for(const child of Object.values(value))if(child&&typeof child==='object')freezeTree(child);
  return value;
}
export async function readCampaignSource(value:unknown,{signal}:{signal?:AbortSignal}={}):Promise<ReadCampaignSource> {
  stopCampaignRead(signal);
  if(!campaignRecord(value)||!campaignKeys(value,['format','version','timelineId','activeBranchId','nextBranchNumber',
    'active','branches','blobs','topologySha256'])||!Array.isArray(value.blobs)||value.blobs.length>CAMPAIGN_MAX_WORLDS||
    !campaignHashValid(value.topologySha256))return badCampaign();
  const shell=checkShell(value);
  const topologySha256=await shellDigest(shell,signal);
  if(topologySha256!==value.topologySha256)throw new CampaignPersistenceError('integrity','原时间线拓扑摘要不符。');
  const refs=new Set(shell.branches.flatMap(branch=>branch.snapshots.map(snapshot=>snapshot.sha256)));
  const blobs=new Map<string,CampaignWorldBlob>();
  let bytes=0;
  for(const candidate of value.blobs){
    const blob=checkCampaignBlob(candidate);
    if(!refs.has(blob.sha256)||blobs.has(blob.sha256))return badCampaign();
    bytes+=blob.bytes;
    if(bytes>CAMPAIGN_SOURCE_MAX_BYTES)throw tooLarge();
    blobs.set(blob.sha256,blob);
  }
  if(blobs.size!==refs.size)return badCampaign();
  const worlds=new Map<string,WorldState>();
  for(const blob of blobs.values())worlds.set(blob.sha256,freezeTree(await readCampaignWorld(blob,signal)));
  const branches:TimelineBranch[]=shell.branches.map(({snapshots,...branch})=>{
    const bound:TimelineSnapshot[]=snapshots.map(s=>{
      const world=worlds.get(s.sha256);
      if(!world||!sameRef(s,ref(world,s.sha256)))return badCampaign();
      return Object.freeze({tick:s.tick,world});
    });
    return Object.freeze({...branch,snapshots:Object.freeze(bound)});
  });
  const active=worlds.get(shell.active.sha256);
  if(!active)return badCampaign();
  return {timeline:Object.freeze({activeBranchId:shell.activeBranchId,nextBranchNumber:shell.nextBranchNumber,
    branches:Object.freeze(branches)}),timelineId:shell.timelineId,world:cloneWorldWithColdHistory(active),
    worldHash:shell.active.sha256,topologySha256};
}

/** Streaming Node-side adapter. This does not build WorldTimeline, use IndexedDB, or contact a model. */
import { campaignHashValid, campaignInteger, campaignRecord, stopCampaignRead } from '../src/engine/campaignMemento';
import { decodeDetachedArchiveManifest, detachedArchiveCapacity, describeDetachedArchiveBlob, chunkDetachedArchiveBlob, encodeDetachedArchiveManifest,
  findDetachedArchiveSnapshot, readDetachedArchiveBlob, sealDetachedArchiveManifest, checkDetachedArchiveBlob,
  DETACHED_ARCHIVE_TOTAL_MAX_BYTES, DETACHED_ARCHIVE_WORLD_MAX_BYTES, DETACHED_ARCHIVE_MAX_BRANCHES, DETACHED_ARCHIVE_MAX_SNAPSHOTS,
  type DetachedArchiveBlob, type DetachedArchiveBranch, type DetachedArchiveManifest, type DetachedArchiveSnapshot } from '../src/engine/detachedCampaignArchive';
import { ERA_CHECKPOINT_MANIFEST_BYTES, verifyEraCheckpoint, verifyEraCheckpointPayload,
  type EraInput } from '../src/engine/eraCheckpointEngine';
import { createFastForwardRunner, FAST_FORWARD_MAX_TICKS, type FastForwardProgress } from '../src/engine/fastForwardEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import type { WorldState } from '../src/types/world';
import { LocalDetachedArchive, LocalDetachedArchiveError,
  type LocalArchiveHead, type LocalArchiveRef, type LocalArchiveToken } from './detachedCampaignFilesystem';

const utf8=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
declare const __SECT_UTILITY_RULE_VERSION__:string;
const buildRule=()=>typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
export const DETACHED_EXPLICIT_MAX_MONTHS=1200;

export interface DetachedFramePin {readonly tick:number;readonly year:number;readonly month:number;readonly bytes:number;readonly sha256:string}
export type DetachedSourceFrame = ({readonly payload:Uint8Array}|{readonly manifestFile:EraInput;readonly partFiles:readonly EraInput[]}) &
  {readonly expected?:DetachedFramePin};
export interface DetachedSourceBranch {
  readonly id:string;readonly label:string;readonly parentBranchId?:string;readonly forkTick?:number;
  readonly frames:AsyncIterable<DetachedSourceFrame>|Iterable<DetachedSourceFrame>;
}
export interface CreateDetachedArchiveOptions {
  readonly directory:string;readonly sourceRuleVersion:string;readonly writerRuleVersion:string;
  readonly timelineId:string;readonly active:{readonly branchId:string;readonly tick:number;readonly sha256:string};
  readonly nextBranchNumber?:number;readonly branches:readonly DetachedSourceBranch[];
  readonly signal?:AbortSignal;
}
export type DetachedLocalRevision=
  | {readonly kind:'origin';readonly manifest:LocalArchiveRef;readonly manifestId:string;readonly writerRuleVersion:string;readonly tick:number;readonly worldSha256:string}
  | {readonly kind:'advance';readonly manifestId:string;readonly writerRuleVersion:string;readonly tick:number;readonly worldSha256:string;
      readonly previousWorldSha256:string;readonly months:number;readonly snapshot:DetachedArchiveSnapshot};
export interface DetachedLocalAudit {
  readonly manifest:DetachedArchiveManifest;readonly head:LocalArchiveHead<DetachedLocalRevision>;
  readonly origin:LocalArchiveHead<DetachedLocalRevision>;readonly world:WorldState;
  readonly retainedBytes:number;
}
function requireThat(value:unknown,message:string):asserts value{
  if(!value)throw new LocalDetachedArchiveError('integrity',message);
}
function only(record:Record<string,unknown>,keys:readonly string[]){return Object.keys(record).every(k=>keys.includes(k));}
function archiveRef(value:unknown):LocalArchiveRef{
  requireThat(campaignRecord(value)&&only(value,['sha256','bytes'])&&campaignHashValid(value.sha256)&&
    campaignInteger(value.bytes,1,4*1024*1024),'独立档案清单引用无效。');
  return {sha256:value.sha256,bytes:value.bytes};
}
function localSnapshot(value:unknown):DetachedArchiveSnapshot{
  requireThat(campaignRecord(value)&&only(value,['tick','year','month','world'])&&campaignInteger(value.tick)&&
    campaignInteger(value.year)&&campaignInteger(value.month,1,12),'独立续跑世界日期无效。');
  return {tick:value.tick,year:value.year,month:value.month,world:checkDetachedArchiveBlob(value.world)};
}
function localRevision(value:unknown):DetachedLocalRevision{
  requireThat(campaignRecord(value)&&campaignHashValid(value.manifestId)&&campaignHashValid(value.writerRuleVersion)&&
    campaignInteger(value.tick)&&campaignHashValid(value.worldSha256),'独立档案发布内容无效。');
  const {kind,manifestId,writerRuleVersion,tick,worldSha256}=value;
  if(kind==='origin'){
    requireThat(only(value,['kind','manifest','manifestId','writerRuleVersion','tick','worldSha256']),'独立档案第一代字段无效。');
    return {kind,manifest:archiveRef(value.manifest),manifestId,writerRuleVersion,tick,worldSha256};
  }
  requireThat(kind==='advance'&&only(value,['kind','manifestId','writerRuleVersion','tick','worldSha256','previousWorldSha256','months','snapshot'])&&
    campaignHashValid(value.previousWorldSha256)&&campaignInteger(value.months,1,DETACHED_EXPLICIT_MAX_MONTHS),'独立档案续跑字段无效。');
  const snapshot=localSnapshot(value.snapshot);
  requireThat(snapshot.tick===tick&&snapshot.world.sha256===worldSha256,'独立档案续跑日期或世界 SHA-256 不符。');
  return {kind,manifestId,writerRuleVersion,tick,worldSha256,previousWorldSha256:value.previousWorldSha256,months:value.months,snapshot};
}
type Store=LocalDetachedArchive<DetachedLocalRevision>;
const asInput=(bytes:Uint8Array):EraInput=>({size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function writeBlob(store:Store,bytes:Uint8Array,signal?:AbortSignal):Promise<DetachedArchiveBlob>{
  stopCampaignRead(signal);
  const blob=await describeDetachedArchiveBlob(bytes,{signal});
  await storeBlob(store,bytes,blob,signal);
  return blob;
}
async function storeBlob(store:Store,bytes:Uint8Array,blob:DetachedArchiveBlob,signal?:AbortSignal){
  for(const piece of chunkDetachedArchiveBlob(bytes,blob)){
    stopCampaignRead(signal);
    const ref=await store.put(piece.bytes);
    requireThat(ref.sha256===piece.ref.sha256&&ref.bytes===piece.ref.bytes,'独立档案写入的分页不符原始摘要。');
  }
}
async function readBlob(store:Store,blob:DetachedArchiveBlob,signal?:AbortSignal):Promise<Uint8Array>{
  return readDetachedArchiveBlob(blob,ref=>{stopCampaignRead(signal);return store.read(ref);},{signal});
}
function checkDate(world:WorldState,snapshot:DetachedArchiveSnapshot){
  requireThat(world.tick===snapshot.tick&&world.year===snapshot.year&&world.month===snapshot.month,'保留世界的真实年月不同于索引。');
}
function checkContinue(before:WorldState,after:WorldState,months:number){
  requireThat(sameGeneratedWorld(before,after)&&before.random.algorithm===after.random.algorithm&&
    after.interventionSequence===before.interventionSequence&&after.tick===before.tick+months&&
    after.year*12+after.month===before.year*12+before.month+months,'独立续跑的世界同源、日期或干预计数不符。');
  const ids=new Set(after.cultivators.map(actor=>actor.id));
  requireThat(ids.size===after.cultivators.length&&before.cultivators.every(actor=>ids.has(actor.id)),'独立续跑丢失了原有人物身份。');
}
function checkEraSource(manifest:{source:{branchId:string;timelineId?:string};engineRuleVersion:string},sourceRule:string,timelineId:string,branchId:string){
  requireThat(manifest.source.branchId===branchId&&(manifest.source.timelineId===undefined||manifest.source.timelineId===timelineId)&&
    manifest.engineRuleVersion===sourceRule,'原始年代文件的分支、时间线或打包规则不符。');
}
async function readSnapshot(store:Store,snapshot:DetachedArchiveSnapshot,source?:{rule:string;timelineId:string;branchId:string},signal?:AbortSignal){
  const payload=await readBlob(store,snapshot.world,signal);
  if(snapshot.sourceManifest){
    requireThat(source,'续跑输出不能伪称为原始年代文件。');
    const raw=await readBlob(store,snapshot.sourceManifest,signal);
    requireThat(raw.length<=ERA_CHECKPOINT_MANIFEST_BYTES,'原始年代清单超限。');
    const verified=await verifyEraCheckpointPayload(asInput(raw),payload,codec,{signal});
    checkEraSource(verified.manifest,source.rule,source.timelineId,source.branchId);
    checkDate(verified.world,snapshot);return {world:verified.world,payload,sourceManifest:raw};
  }
  const world=decodeEraWorldSave(decode.decode(payload));checkDate(world,snapshot);return {world,payload};
}
async function importFrame(store:Store,frame:DetachedSourceFrame,sourceRule:string,timelineId:string,branchId:string,remaining:number,signal?:AbortSignal){
  let payload:Uint8Array|undefined,original:Uint8Array|undefined,world:WorldState;
  if('payload' in frame){
    requireThat(campaignInteger(frame.payload.length,1,DETACHED_ARCHIVE_WORLD_MAX_BYTES),'原生帧字节数超限。');
    payload=frame.payload;world=decodeEraWorldSave(decode.decode(payload));
  }else{
    requireThat(campaignInteger(frame.manifestFile.size,1,ERA_CHECKPOINT_MANIFEST_BYTES),'原始年代清单超限。');
    original=new Uint8Array(await frame.manifestFile.arrayBuffer());
    requireThat(original.length===frame.manifestFile.size,'原始年代清单字节数不符。');
    const verified=await verifyEraCheckpoint(asInput(original),frame.partFiles,{...codec,decode(text){
      payload=utf8.encode(text);return codec.decode(text);
    }},{signal});
    checkEraSource(verified.manifest,sourceRule,timelineId,branchId);
    world=verified.world;requireThat(payload,'年代文件未产生已认证的原始内容。');
  }
  requireThat(payload.length+(original?.length??0)<=remaining,'独立档案原始历史已达字节预算；未写入越限帧。');
  const worldRef=await describeDetachedArchiveBlob(payload,{signal});
  const pin=frame.expected;
  if(pin)requireThat(pin.tick===world.tick&&pin.year===world.year&&pin.month===world.month&&
    pin.bytes===worldRef.bytes&&pin.sha256===worldRef.sha256,'实际原生快照的日期、长度或摘要不符。');
  await storeBlob(store,payload,worldRef,signal);
  const snapshot:DetachedArchiveSnapshot={tick:world.tick,year:world.year,month:world.month,world:worldRef,
    ...(original?{sourceManifest:await writeBlob(store,original,signal)}:{})};
  return snapshot;
}
async function originManifest(store:Store,first:LocalArchiveHead<DetachedLocalRevision>){
  const v=first.value;requireThat(v.kind==='origin','独立档案首个发布记录不是原线。');
  const manifest=await decodeDetachedArchiveManifest(await store.read(v.manifest));
  requireThat(v.manifestId===manifest.id&&v.writerRuleVersion===manifest.writerRuleVersion&&
    v.worldSha256===manifest.active.sha256&&v.tick===manifest.active.tick,'独立档案首个发布记录与原线不匹配。');
  return manifest;
}
export async function createDetachedArchive(options:CreateDetachedArchiveOptions):Promise<{manifest:DetachedArchiveManifest;head:LocalArchiveHead<DetachedLocalRevision>}>{
  const {sourceRuleVersion,writerRuleVersion,timelineId,active:expectedActive,signal}=options;
  requireThat(campaignHashValid(sourceRuleVersion)&&campaignHashValid(writerRuleVersion)&&writerRuleVersion===buildRule(),'需要原帧指纹以及与当前构建实际相同的写入规则。');
  stopCampaignRead(signal);
  const store=await LocalDetachedArchive.create(options.directory,localRevision);
  const branches:DetachedArchiveBranch[]=[];let total=0,frameCount=0;
  requireThat(options.branches.length>0&&options.branches.length<=DETACHED_ARCHIVE_MAX_BRANCHES,'独立档案分支数量超限或为空。');
  for(const {id,label,parentBranchId,forkTick,frames} of options.branches){
    const snapshots:DetachedArchiveSnapshot[]=[];
    for await(const frame of frames){
      stopCampaignRead(signal);
      requireThat(++frameCount<=DETACHED_ARCHIVE_MAX_BRANCHES*DETACHED_ARCHIVE_MAX_SNAPSHOTS&&
        snapshots.length<DETACHED_ARCHIVE_MAX_SNAPSHOTS,'独立档案历史快照数量超限；没有发布部分历史。');
      const snapshot=await importFrame(store,frame,sourceRuleVersion,timelineId,id,DETACHED_ARCHIVE_TOTAL_MAX_BYTES-total,signal);
      total+=snapshot.world.bytes+(snapshot.sourceManifest?.bytes??0);
      snapshots.push(snapshot);
    }
    branches.push({id,label,...(parentBranchId!==undefined?{parentBranchId}:{}),...(forkTick!==undefined?{forkTick}:{}),snapshots});
  }
  const active=branches.find(b=>b.id===expectedActive.branchId)?.snapshots.at(-1);
  requireThat(active&&active.tick===expectedActive.tick&&active.world.sha256===expectedActive.sha256,'独立档案没有确切的活跃世界。');
  const manifest=await sealDetachedArchiveManifest({format:'ai-sect-detached-campaign',version:1,sourceRuleVersion,writerRuleVersion,
    timelineId,...(options.nextBranchNumber!==undefined?{nextBranchNumber:options.nextBranchNumber}:{}),active:{...expectedActive},branches},{signal});
  const manifestRef=await store.put(await encodeDetachedArchiveManifest(manifest));
  const head=await store.commit(null,{kind:'origin',manifest:manifestRef,manifestId:manifest.id,writerRuleVersion,
    tick:active.tick,worldSha256:active.world.sha256},{beforePublish:async()=>stopCampaignRead(signal)});
  return {manifest,head};
}
export async function readDetachedArchiveOriginal(directory:string,branchId:string,tick:number,{signal}:{signal?:AbortSignal}={}){
  const store=await LocalDetachedArchive.open(directory,localRevision),first=(await store.revisions())[0];
  requireThat(first,'找不到独立档案原线。');
  const manifest=await originManifest(store,first);
  const snapshot=findDetachedArchiveSnapshot(manifest,branchId,tick);
  requireThat(snapshot,'未找到确切的原始分支和日期。');
  return readSnapshot(store,snapshot,{rule:manifest.sourceRuleVersion,timelineId:manifest.timelineId,branchId},signal);
}
export async function readDetachedArchiveSnapshot(directory:string,branchId:string,tick:number,options:{signal?:AbortSignal}={}){
  return (await readDetachedArchiveOriginal(directory,branchId,tick,options)).world;
}
async function audit(store:Store,signal?:AbortSignal):Promise<DetachedLocalAudit>{
  const revisions=await store.revisions(),origin=revisions[0],head=revisions.at(-1);
  requireThat(origin&&head,'找不到独立档案原线。');
  const manifest=await originManifest(store,origin);
  let world:WorldState|undefined;
  for(const branch of manifest.branches)for(const snapshot of branch.snapshots){
    stopCampaignRead(signal);
    const row=await readSnapshot(store,snapshot,{rule:manifest.sourceRuleVersion,timelineId:manifest.timelineId,branchId:branch.id},signal);
    if(branch.id===manifest.active.branchId&&snapshot.tick===manifest.active.tick)world=row.world;
  }
  requireThat(world,'档案原线活跃读回失败。');
  let prior=origin.value,retainedBytes=detachedArchiveCapacity(manifest).referencedBytes;
  for(const revision of revisions.slice(1)){
    const next=revision.value;
    requireThat(next.kind==='advance'&&next.manifestId===manifest.id&&next.writerRuleVersion===manifest.writerRuleVersion&&
      next.previousWorldSha256===prior.worldSha256,'续跑版本与原线或前一真实世界不一致。');
    retainedBytes+=next.snapshot.world.bytes;
    requireThat(retainedBytes<=DETACHED_ARCHIVE_TOTAL_MAX_BYTES,'独立档案已发布内容超过总限额，未跳过旧历史。');
    const readback=await readSnapshot(store,next.snapshot,undefined,signal);
    checkContinue(world,readback.world,next.months);world=readback.world;prior=next;
  }
  stopCampaignRead(signal);
  return {manifest,origin,head,world,retainedBytes};
}
export async function auditDetachedArchive(directory:string,{signal}:{signal?:AbortSignal}={}):Promise<DetachedLocalAudit>{
  return audit(await LocalDetachedArchive.open(directory,localRevision),signal);
}
export async function advanceDetachedArchive(directory:string,options:{writerRuleVersion:string;months:number;expected?:LocalArchiveToken;
  signal?:AbortSignal;onProgress?:(value:FastForwardProgress)=>void}):Promise<LocalArchiveHead<DetachedLocalRevision>>{
  const {months,writerRuleVersion,signal}=options;
  requireThat(campaignInteger(months,1,DETACHED_EXPLICIT_MAX_MONTHS),'显式独立续跑应为 1 到 1200 个月。');
  requireThat(campaignHashValid(writerRuleVersion)&&writerRuleVersion===buildRule(),'调用者规则不等于当前引擎构建规则。');
  stopCampaignRead(signal);
  const store=await LocalDetachedArchive.open(directory,localRevision);
  const verified=await audit(store,signal);
  requireThat(writerRuleVersion===verified.manifest.writerRuleVersion,'运行规则与独立档案原版不一致，拒绝跨版本接续。');
  const expected=options.expected??verified.head.token;
  if(expected.revision!==verified.head.token.revision||expected.seal!==verified.head.token.seal)
    throw new LocalDetachedArchiveError('conflict','预期的独立档案版本已经改变。');
  let world=verified.world;
  for(let done=0;done<months;){
    stopCampaignRead(signal);
    const batch=Math.min(FAST_FORWARD_MAX_TICKS,months-done),runner=createFastForwardRunner(world,batch);
    let progress=runner.readProgress();
    while(progress.completedTicks<batch){
      stopCampaignRead(signal);
      progress=runner.advanceChunk();
      options.onProgress?.({...progress,startTick:verified.world.tick,requestedTicks:months,
        completedTicks:done+progress.completedTicks});
      // Give Ctrl-C and other cancellation scheduled by the caller a chance to be observed.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    const result=runner.checkpoint();requireThat(result&&result.completedTicks===batch,'原生快进未完成明确月份。');
    checkContinue(world,result.world,batch);world=result.world;done+=batch;
  }
  checkContinue(verified.world,world,months);
  const payload=utf8.encode(encodeEraWorldSave(world));
  requireThat(verified.retainedBytes+payload.byteLength<=DETACHED_ARCHIVE_TOTAL_MAX_BYTES,
    '保存这次实际续跑会超过独立档案总限额；没有发布新世界，也没有删除原有历史。');
  const snapshot:DetachedArchiveSnapshot={tick:world.tick,year:world.year,month:world.month,
    world:await writeBlob(store,payload,signal)};
  const reopened=await readSnapshot(store,snapshot,undefined,signal);
  checkContinue(verified.world,reopened.world,months);
  return store.commit(expected,{kind:'advance',manifestId:verified.manifest.id,writerRuleVersion,tick:reopened.world.tick,
    worldSha256:snapshot.world.sha256,previousWorldSha256:verified.head.value.worldSha256,months,snapshot},
  {beforePublish:async()=>stopCampaignRead(signal)});
}

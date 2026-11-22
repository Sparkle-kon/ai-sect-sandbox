/** Portable metadata and exact original bytes only; no filesystem, legacy storage, or simulator effects. */
export const DETACHED_ARCHIVE_FORMAT='ai-sect-detached-campaign' as const;
export const DETACHED_ARCHIVE_VERSION=1 as const;
export const DETACHED_ARCHIVE_CHUNK_BYTES=1024*1024;
export const DETACHED_ARCHIVE_WORLD_MAX_BYTES=32*DETACHED_ARCHIVE_CHUNK_BYTES;
export const DETACHED_ARCHIVE_TOTAL_MAX_BYTES=192*DETACHED_ARCHIVE_CHUNK_BYTES;
export const DETACHED_ARCHIVE_MANIFEST_MAX_BYTES=DETACHED_ARCHIVE_CHUNK_BYTES;
export const DETACHED_ARCHIVE_SOURCE_MANIFEST_MAX_BYTES=8*1024;
export const DETACHED_ARCHIVE_MAX_BRANCHES=4;
export const DETACHED_ARCHIVE_MAX_SNAPSHOTS=50;
export const DETACHED_ARCHIVE_MAX_TICK=100_000_000;

export interface DetachedArchiveChunk {readonly sha256:string;readonly bytes:number}
export interface DetachedArchiveBlob extends DetachedArchiveChunk {readonly chunks:readonly DetachedArchiveChunk[]}
export interface DetachedArchiveSnapshot {
  readonly tick:number;readonly year:number;readonly month:number;
  /** Original native JSON bytes, not a decode/re-encode result. */
  readonly world:DetachedArchiveBlob;
  /** Original portable .era manifest bytes when the frame came from that format. */
  readonly sourceManifest?:DetachedArchiveBlob;
}
export interface DetachedArchiveBranch {
  readonly id:string;readonly label:string;readonly parentBranchId?:string;readonly forkTick?:number;
  readonly snapshots:readonly DetachedArchiveSnapshot[];
}
export interface DetachedArchiveManifestBody {
  readonly format:typeof DETACHED_ARCHIVE_FORMAT;readonly version:typeof DETACHED_ARCHIVE_VERSION;
  readonly sourceRuleVersion:string;readonly writerRuleVersion:string;readonly timelineId:string;
  readonly nextBranchNumber?:number;
  readonly active:{readonly branchId:string;readonly tick:number;readonly sha256:string};
  readonly branches:readonly DetachedArchiveBranch[];
}
export interface DetachedArchiveManifest extends DetachedArchiveManifestBody {readonly id:string}
export type DetachedArchiveErrorCode='format'|'size'|'integrity'|'abort'|'unavailable';
export class DetachedArchiveError extends Error {
  constructor(readonly code:DetachedArchiveErrorCode,message:string){
    super(message);this.name='DetachedArchiveError';
  }
}
export interface DetachedArchiveReadOptions {readonly maxBytes?:number;readonly signal?:AbortSignal}
export interface DetachedArchiveCapacity {
  /** Requested raw bytes, counting logical aliases (never less than unique physical pages). */
  readonly referencedBytes:number;
  readonly uniqueBlobBytes:number;
  readonly uniqueChunkBytes:number;
  readonly snapshotCount:number;
  readonly uniqueBlobs:number;
  readonly uniqueChunks:number;
}
type Fields=Record<string,unknown>;
const encoder=new TextEncoder();
const token=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}(?![\s\S])/u.test(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}(?![\s\S])/u.test(value);
const int=(value:unknown,min:number,max:number):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const object=(value:unknown):value is Fields=>!!value&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value:Fields,required:readonly string[],optional:readonly string[]=[])=>
  required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const own=(value:Fields,key:string)=>Object.hasOwn(value,key);
const fail=(code:DetachedArchiveErrorCode,text:string):never=>{throw new DetachedArchiveError(code,text);};
const checkAbort=(signal?:AbortSignal)=>{if(signal?.aborted)fail('abort','已停止独立年代包校验；未发布更改。');};
const ceiling=(value:number|undefined,base:number):number=>{
  if(value===undefined)return base;
  if(!int(value,1,base))return fail('size','独立年代检查点的字节预算无效。');
  return value;
};
const requiredChunkBytes=(length:number,index:number)=>
  Math.min(DETACHED_ARCHIVE_CHUNK_BYTES,length-index*DETACHED_ARCHIVE_CHUNK_BYTES);

export async function detachedArchiveSha256(bytes:Uint8Array,signal?:AbortSignal):Promise<string>{
  checkAbort(signal);
  if(!(bytes instanceof Uint8Array))return fail('format','只能为原始字节计算 SHA-256。');
  const subtle=globalThis.crypto?.subtle;
  if(!subtle)return fail('unavailable','当前运行环境不支持 SHA-256。');
  let result:ArrayBuffer;
  try{result=await subtle.digest('SHA-256',bytes);}
  catch{checkAbort(signal);return fail('unavailable','无法计算独立年代包字节摘要。');}
  checkAbort(signal);
  return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function requireBytes(bytes:Uint8Array,maxBytes:number){
  if(!(bytes instanceof Uint8Array))return fail('format','独立年代包只能使用原始字节。');
  if(bytes.byteLength<1||bytes.byteLength>maxBytes)return fail('size','独立年代包的原始字节长度超出约束。');
}
function readBlob(value:unknown,maxBytes:number):DetachedArchiveBlob {
  if(!object(value)||!exact(value,['sha256','bytes','chunks'])||!hash(value.sha256)||!Array.isArray(value.chunks))
    return fail('format','独立年代包块索引结构无效。');
  if(!int(value.bytes,1,maxBytes))return fail('size','单个独立年代包内容超出字节约束。');
  const bytes=value.bytes,sha256=value.sha256;
  if(value.chunks.length!==Math.ceil(bytes/DETACHED_ARCHIVE_CHUNK_BYTES))return fail('format','独立年代包的固定页数不符。');
  const chunks=value.chunks.map((row:unknown,index:number):DetachedArchiveChunk=>{
    if(!object(row)||!exact(row,['sha256','bytes'])||!hash(row.sha256)||row.bytes!==requiredChunkBytes(bytes,index))
      return fail('format','独立年代包页缺失、过长或不在正确位置。');
    return Object.freeze({sha256:row.sha256,bytes:row.bytes});
  });
  // Sparse malicious array inputs cannot survive a direct seal either.
  for(let i=0;i<chunks.length;i++)if(!Object.hasOwn(chunks,i))return fail('format','独立年代包页缺失。');
  if(chunks.length===1&&chunks[0].sha256!==sha256)return fail('integrity','单页摘要必须与原始内容摘要相同。');
  return Object.freeze({sha256,bytes,chunks:Object.freeze(chunks)});
}
export function checkDetachedArchiveBlob(value:unknown,{maxBytes}:DetachedArchiveReadOptions={}):DetachedArchiveBlob {
  return readBlob(value,ceiling(maxBytes,DETACHED_ARCHIVE_WORLD_MAX_BYTES));
}

export async function describeDetachedArchiveBlob(bytes:Uint8Array,{maxBytes,signal}:DetachedArchiveReadOptions={}):Promise<DetachedArchiveBlob>{
  checkAbort(signal);
  const maximum=ceiling(maxBytes,DETACHED_ARCHIVE_WORLD_MAX_BYTES);
  requireBytes(bytes,maximum);
  const chunks:DetachedArchiveChunk[]=[];
  for(let offset=0;offset<bytes.byteLength;offset+=DETACHED_ARCHIVE_CHUNK_BYTES){
    const chunk=bytes.subarray(offset,Math.min(offset+DETACHED_ARCHIVE_CHUNK_BYTES,bytes.byteLength));
    chunks.push(Object.freeze({sha256:await detachedArchiveSha256(chunk,signal),bytes:chunk.byteLength}));
  }
  const sha256=chunks.length===1?chunks[0].sha256:await detachedArchiveSha256(bytes,signal);
  return Object.freeze({sha256,bytes:bytes.byteLength,chunks:Object.freeze(chunks)});
}
/** Yields borrowed views of one immutable caller-owned byte buffer, in canonical page order. */
export function* chunkDetachedArchiveBlob(bytes:Uint8Array,blob:DetachedArchiveBlob):Iterable<{
  readonly ref:DetachedArchiveChunk;readonly bytes:Uint8Array
}>{
  const checked=checkDetachedArchiveBlob(blob);
  requireBytes(bytes,checked.bytes);
  if(bytes.byteLength!==checked.bytes)return fail('integrity','内容字节长度不等于块索引。');
  for(const [index,ref] of checked.chunks.entries()){
    const offset=index*DETACHED_ARCHIVE_CHUNK_BYTES;
    yield {ref,bytes:bytes.subarray(offset,offset+ref.bytes)};
  }
}
/**
 * Reader must bound its own I/O to ref.bytes before returning. This layer rechecks every page
 * and the reassembled raw digest; it never trusts a returned path, cache label or decoded world.
 */
export async function readDetachedArchiveBlob(blob:DetachedArchiveBlob,
  read:(ref:DetachedArchiveChunk)=>Promise<Uint8Array>,{maxBytes,signal}:DetachedArchiveReadOptions={}):Promise<Uint8Array>{
  checkAbort(signal);
  const checked=checkDetachedArchiveBlob(blob,{maxBytes});
  const bytes=new Uint8Array(checked.bytes);
  let offset=0;
  for(const ref of checked.chunks){
    checkAbort(signal);
    const incoming=await read(ref);
    checkAbort(signal);
    if(!(incoming instanceof Uint8Array)||incoming.byteLength!==ref.bytes)
      return fail('integrity','独立年代包的实际页长度不符。');
    // Commit to a private buffer first; a read callback may reuse its storage for the next page.
    bytes.set(incoming,offset);
    if(await detachedArchiveSha256(bytes.subarray(offset,offset+ref.bytes),signal)!==ref.sha256)
      return fail('integrity','独立年代包的实际页摘要不符。');
    offset+=ref.bytes;
  }
  if(checked.chunks.length>1&&await detachedArchiveSha256(bytes,signal)!==checked.sha256)
    return fail('integrity','独立年代包的原始整帧摘要不符。');
  return bytes;
}

const label=(value:unknown):value is string=>typeof value==='string'&&value.length<=80&&value.trim()!==''&&
  !/[\u0000-\u001f\u007f]/u.test(value);
const sameCalendar=(a:DetachedArchiveSnapshot,b:DetachedArchiveSnapshot)=>
  (b.year-a.year)*12+b.month-a.month===b.tick-a.tick;
const sameBlob=(a:DetachedArchiveBlob,b:DetachedArchiveBlob)=>a.sha256===b.sha256&&a.bytes===b.bytes&&a.chunks.length===b.chunks.length&&
  a.chunks.every((row,i)=>row.sha256===b.chunks[i].sha256&&row.bytes===b.chunks[i].bytes);
const manifestRequired=['format','version','sourceRuleVersion','writerRuleVersion','timelineId','active','branches'] as const;
function manifestBody(value:unknown):DetachedArchiveManifestBody {
  if(!object(value)||!exact(value,manifestRequired,['nextBranchNumber'])||value.format!==DETACHED_ARCHIVE_FORMAT||
    value.version!==DETACHED_ARCHIVE_VERSION||!hash(value.sourceRuleVersion)||!hash(value.writerRuleVersion)||
    !token(value.timelineId)||!object(value.active)||!exact(value.active,['branchId','tick','sha256'])||
    !token(value.active.branchId)||!int(value.active.tick,0,DETACHED_ARCHIVE_MAX_TICK)||!hash(value.active.sha256)||
    !Array.isArray(value.branches)||!int(value.branches.length,1,DETACHED_ARCHIVE_MAX_BRANCHES)||
    (own(value,'nextBranchNumber')&&!int(value.nextBranchNumber,1,DETACHED_ARCHIVE_MAX_TICK)))
    return fail('format','独立年代包清单字段、版本或规模无效。');
  const parents=new Map<string,DetachedArchiveBranch>(),aliases=new Map<string,DetachedArchiveSnapshot>();
  const branches=value.branches.map((raw:unknown,index:number):DetachedArchiveBranch=>{
    if(!object(raw)||!exact(raw,['id','label','snapshots'],['parentBranchId','forkTick'])||!token(raw.id)||!label(raw.label)||
      parents.has(raw.id)||!Array.isArray(raw.snapshots)||!int(raw.snapshots.length,1,DETACHED_ARCHIVE_MAX_SNAPSHOTS))
      return fail('format','独立年代包的分支键、标签或快照数无效。');
    const hasParent=own(raw,'parentBranchId'),hasFork=own(raw,'forkTick');
    if(hasParent!==hasFork||index===0&&(hasParent||hasFork)||
      hasParent&&(!token(raw.parentBranchId)||!parents.has(raw.parentBranchId)||!int(raw.forkTick,0,DETACHED_ARCHIVE_MAX_TICK)))
      return fail('format','独立年代包的分支必须引用已出现的父支及明确分歧刻。');
    const snapshots=raw.snapshots.map((row:unknown):DetachedArchiveSnapshot=>{
      if(!object(row)||!exact(row,['tick','year','month','world'],['sourceManifest'])||
        !int(row.tick,0,DETACHED_ARCHIVE_MAX_TICK)||!int(row.year,0,DETACHED_ARCHIVE_MAX_TICK)||!int(row.month,1,12))
        return fail('format','独立年代包的快照日期或字段无效。');
      const world=readBlob(row.world,DETACHED_ARCHIVE_WORLD_MAX_BYTES);
      const sourceManifest=own(row,'sourceManifest')?readBlob(row.sourceManifest,DETACHED_ARCHIVE_SOURCE_MANIFEST_MAX_BYTES):undefined;
      const older=aliases.get(world.sha256);
      if(older&&(older.tick!==row.tick||older.year!==row.year||older.month!==row.month||!sameBlob(older.world,world)))
        return fail('integrity','同一个原始世界摘要不能有冲突的内容或日期。');
      const snapshot=Object.freeze({tick:row.tick,year:row.year,month:row.month,world,...(sourceManifest?{sourceManifest}:{})});
      aliases.set(world.sha256,snapshot);
      return snapshot;
    });
    for(let i=0;i<snapshots.length;i++){
      if(!Object.hasOwn(snapshots,i))return fail('format','独立年代包快照列表不能有空项。');
      if(i!==0){
        const a=snapshots[i-1],b=snapshots[i];
        if(b.tick<=a.tick||!sameCalendar(a,b))
          return fail('format','分支快照必须按原生刻序和月历排列。');
      }
    }
    const forkTick=hasFork&&typeof raw.forkTick==='number'?raw.forkTick:undefined;
    const parentBranchId=hasParent&&typeof raw.parentBranchId==='string'?raw.parentBranchId:undefined;
    if(parentBranchId!==undefined&&forkTick!==undefined){
      const parent=parents.get(parentBranchId)!;
      const childHead=snapshots[snapshots.length-1],parentHead=parent.snapshots[parent.snapshots.length-1];
      if(forkTick>childHead.tick||forkTick>parentHead.tick)
        return fail('format','分歧刻不能晚于父支或子支已保存的头。');
      if(!sameCalendar(parentHead,childHead))return fail('format','有父支的分支不能重写原生月历。');
      const old=new Map(parent.snapshots.filter(row=>row.tick<forkTick).map(row=>[row.tick,row]));
      if(snapshots.some(row=>{const inherited=old.get(row.tick);return !!inherited&&
          (inherited.year!==row.year||inherited.month!==row.month||!sameBlob(inherited.world,row.world));}))
        return fail('integrity','父子分支在分歧前的同一条保留快照不一致。');
    }
    const branch=Object.freeze({id:raw.id,label:raw.label,...(parentBranchId!==undefined&&forkTick!==undefined?{parentBranchId,forkTick}:{}),
      snapshots:Object.freeze(snapshots)});
    parents.set(branch.id,branch);
    return branch;
  });
  for(let i=0;i<branches.length;i++)if(!Object.hasOwn(branches,i))return fail('format','独立年代包分支列表不能有空项。');
  const active=Object.freeze({branchId:value.active.branchId,tick:value.active.tick,sha256:value.active.sha256});
  const head=parents.get(active.branchId)?.snapshots.at(-1);
  if(!head||active.tick!==head.tick||active.sha256!==head.world.sha256)
    return fail('integrity','独立年代包 活动头 不等于对应分支的真实最后快照。');
  const nextBranchNumber=value.nextBranchNumber;
  if(typeof nextBranchNumber==='number'&&branches.some(branch=>{
    const serial=/^branch-([1-9][0-9]*)$/u.exec(branch.id);
    return !!serial&&!int(Number(serial[1]),1,nextBranchNumber-1);
  }))return fail('format','独立年代包保留的分支序号不合法。');
  return Object.freeze({format:DETACHED_ARCHIVE_FORMAT,version:DETACHED_ARCHIVE_VERSION,sourceRuleVersion:value.sourceRuleVersion,
    writerRuleVersion:value.writerRuleVersion,timelineId:value.timelineId,
    ...(typeof nextBranchNumber==='number'?{nextBranchNumber}:{}),active,branches:Object.freeze(branches)});
}
function capacity(body:DetachedArchiveManifestBody):DetachedArchiveCapacity {
  const blobs=new Map<string,DetachedArchiveBlob>(),chunks=new Map<string,number>();
  let referencedBytes=0,uniqueBlobBytes=0,uniqueChunkBytes=0,snapshotCount=0;
  for(const branch of body.branches)for(const snapshot of branch.snapshots){
    snapshotCount++;
    for(const blob of [snapshot.world,snapshot.sourceManifest]){
      if(!blob)continue;
      referencedBytes+=blob.bytes;
      if(referencedBytes>DETACHED_ARCHIVE_TOTAL_MAX_BYTES)return fail('size','独立年代包保留的原始内容超过 192 MiB；没有删减历史。');
      const same=blobs.get(blob.sha256);
      if(same&&!sameBlob(same,blob))return fail('integrity','相同内容摘要关联了不同的分块。');
      if(!same){blobs.set(blob.sha256,blob);uniqueBlobBytes+=blob.bytes;}
      for(const chunk of blob.chunks){
        const stored=chunks.get(chunk.sha256);
        if(stored!==undefined&&stored!==chunk.bytes)return fail('integrity','相同页摘要关联了不同的字节长度。');
        if(stored===undefined){chunks.set(chunk.sha256,chunk.bytes);uniqueChunkBytes+=chunk.bytes;}
      }
    }
  }
  if(uniqueBlobBytes>DETACHED_ARCHIVE_TOTAL_MAX_BYTES||uniqueChunkBytes>DETACHED_ARCHIVE_TOTAL_MAX_BYTES)
    return fail('size','独立年代包的唯一内容超过物理预算。');
  return Object.freeze({referencedBytes,uniqueBlobBytes,uniqueChunkBytes,snapshotCount,uniqueBlobs:blobs.size,uniqueChunks:chunks.size});
}
function stripId(value:unknown):{id:string;body:DetachedArchiveManifestBody}{
  if(!object(value)||!exact(value,[...manifestRequired,'id'],['nextBranchNumber'])||!hash(value.id))
    return fail('format','独立年代包清单缺少有效摘要。');
  const {id,...body}=value;
  return {id,body:manifestBody(body)};
}
export function detachedArchiveCapacity(value:DetachedArchiveManifestBody|DetachedArchiveManifest):DetachedArchiveCapacity {
  if(!object(value))return fail('format','需要有效的独立年代包清单。');
  return capacity(Object.hasOwn(value,'id')?stripId(value).body:manifestBody(value));
}
export async function sealDetachedArchiveManifest(body:DetachedArchiveManifestBody,{signal}:DetachedArchiveReadOptions={}):Promise<DetachedArchiveManifest>{
  checkAbort(signal);
  const canonical=manifestBody(body);
  capacity(canonical);
  const id=await detachedArchiveSha256(encoder.encode(JSON.stringify(canonical)),signal);
  const result=Object.freeze({...canonical,id});
  requireBytes(encoder.encode(JSON.stringify(result)),DETACHED_ARCHIVE_MANIFEST_MAX_BYTES);
  return result;
}
/** Use the sealed canonical form; a reader always recomputes the digest. */
export function encodeDetachedArchiveManifest(manifest:DetachedArchiveManifest):Uint8Array {
  const {id,body}=stripId(manifest);
  capacity(body);
  const bytes=encoder.encode(JSON.stringify({...body,id}));
  requireBytes(bytes,DETACHED_ARCHIVE_MANIFEST_MAX_BYTES);
  return bytes;
}
export async function decodeDetachedArchiveManifest(bytes:Uint8Array,{signal}:DetachedArchiveReadOptions={}):Promise<DetachedArchiveManifest>{
  checkAbort(signal);
  requireBytes(bytes,DETACHED_ARCHIVE_MANIFEST_MAX_BYTES);
  let text:string,value:unknown;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);value=JSON.parse(text);}
  catch{return fail('format','独立年代包清单不是规范 UTF-8 JSON。');}
  const {id,body}=stripId(value);
  capacity(body);
  if(JSON.stringify({...body,id})!==text)return fail('format','独立年代包清单存在重复键、非规范字段或多余编码。');
  const actual=await detachedArchiveSha256(encoder.encode(JSON.stringify(body)),signal);
  if(actual!==id)return fail('integrity','独立年代包清单摘要不符。');
  return Object.freeze({...body,id});
}
export function findDetachedArchiveSnapshot(manifest:DetachedArchiveManifest,branchId:string,tick:number):DetachedArchiveSnapshot|undefined {
  if(!token(branchId)||!int(tick,0,DETACHED_ARCHIVE_MAX_TICK))return undefined;
  return manifest.branches.find(branch=>branch.id===branchId)?.snapshots.find(snapshot=>snapshot.tick===tick);
}

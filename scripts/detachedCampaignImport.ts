import {campaignHashValid} from '../src/engine/campaignMemento';
import {ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_MAX_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,ERA_CHECKPOINT_PART_BYTES,
  type EraInput} from '../src/engine/eraCheckpointEngine';
import type {DetachedSourceFrame} from './detachedCampaignLocal';
import {DETACHED_ARCHIVE_MAX_BRANCHES,DETACHED_ARCHIVE_MAX_SNAPSHOTS,DETACHED_ARCHIVE_MAX_TICK} from '../src/engine/detachedCampaignArchive';

const filesModule='node:fs/promises',pathModule='node:path',plainModule='node:fs';
interface OpenedSource {
  stat():Promise<{size:number;isFile():boolean}>;
  read(buffer:Uint8Array,offset:number,length:number,position:number):Promise<{bytesRead:number}>;
  close():Promise<void>;
}
const {open}=await import(filesModule) as {open(path:string,flags:number):Promise<OpenedSource>};
const {resolve,dirname}=await import(pathModule) as {resolve(...parts:string[]):string;dirname(path:string):string};
const {constants:{O_RDONLY,O_NOFOLLOW}}=await import(plainModule) as {constants:{O_RDONLY:number;O_NOFOLLOW:number}};

const PLAN_BYTES=256*1024;
interface ImportBase {tick:number;year:number;month:number;bytes:number;sha256:string}
export type DetachedImportFrame=ImportBase&({kind:'native';file:string}|{kind:'era';manifest:string;parts:string[]});
export interface DetachedImportBranch {
  id:string;
  label:string;
  parentBranchId?:string;
  forkTick?:number;
  snapshots:DetachedImportFrame[];
}
export interface DetachedImportPlan {
  format:'ai-sect-detached-import';
  version:1;
  timelineId:string;
  nextBranchNumber?:number;
  sourceRuleVersion:string;
  active:{branchId:string;tick:number;sha256:string};
  branches:DetachedImportBranch[];
}

const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(row:Record<string,unknown>,allowed:readonly string[])=>Object.keys(row).every(key=>allowed.includes(key));
const token=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/u.test(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&
  value.trim()!==''&&!/[\u0000-\u001f\u007f]/u.test(value);
const count=(value:unknown,min:number,max=Number.MAX_SAFE_INTEGER):value is number=>typeof value==='number'&&
  Number.isSafeInteger(value)&&value>=min&&value<=max;
function check(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}

export function decodeDetachedImportPlan(value:string):DetachedImportPlan {
  let root:unknown;
  try{root=JSON.parse(value);}catch{throw Error('输入清单不是合法 JSON。');}
  check(plain(root)&&keys(root,['format','version','timelineId','nextBranchNumber','sourceRuleVersion','active','branches'])&&
    root.format==='ai-sect-detached-import'&&root.version===1&&token(root.timelineId)&&(root.nextBranchNumber===undefined||count(root.nextBranchNumber,1))&&
    campaignHashValid(root.sourceRuleVersion)&&plain(root.active)&&Array.isArray(root.branches)&&
    count(root.branches.length,1,DETACHED_ARCHIVE_MAX_BRANCHES),'输入清单格式、版本或分支数量无效。');
  const {branchId,tick,sha256}=root.active;
  check(keys(root.active,['branchId','tick','sha256'])&&token(branchId)&&count(tick,0,DETACHED_ARCHIVE_MAX_TICK)&&campaignHashValid(sha256),
    '选定的原分支、月份或摘要无效。');
  const branches:DetachedImportBranch[]=[],previous=new Map<string,DetachedImportBranch>();
  let total=0;
  for(const unknownBranch of root.branches as unknown[]){
    check(plain(unknownBranch)&&keys(unknownBranch,['id','label','parentBranchId','forkTick','snapshots'])&&
      token(unknownBranch.id)&&text(unknownBranch.label,80)&&!previous.has(unknownBranch.id)&&Array.isArray(unknownBranch.snapshots)&&
      count(unknownBranch.snapshots.length,1,DETACHED_ARCHIVE_MAX_SNAPSHOTS),'分支必须有唯一标识与实际快照。');
    const {id,label,parentBranchId,forkTick}=unknownBranch;
    check((parentBranchId===undefined&&forkTick===undefined)||(token(parentBranchId)&&previous.has(parentBranchId)&&count(forkTick,0,DETACHED_ARCHIVE_MAX_TICK)),
      '父子分支的来源或分歧月份无效。');
    total+=unknownBranch.snapshots.length;
    check(total<=DETACHED_ARCHIVE_MAX_BRANCHES*DETACHED_ARCHIVE_MAX_SNAPSHOTS,'输入包含过多快照引用。');
    const snapshots:DetachedImportFrame[]=[];
    for(const raw of unknownBranch.snapshots as unknown[]){
      check(plain(raw)&&count(raw.tick,(snapshots.at(-1)?.tick??-1)+1,DETACHED_ARCHIVE_MAX_TICK)&&count(raw.year,0)&&count(raw.month,1,12)&&
        count(raw.bytes,1,ERA_CHECKPOINT_MAX_BYTES)&&campaignHashValid(raw.sha256),'快照年月、体积或原始摘要无效。');
      const info={tick:raw.tick,year:raw.year,month:raw.month,bytes:raw.bytes,sha256:raw.sha256};
      if(raw.kind==='native'){
        check(keys(raw,['kind','tick','year','month','bytes','sha256','file'])&&text(raw.file,4096),'原生快照须给出实际文件。');
        snapshots.push({...info,kind:'native',file:raw.file});
      }else{
        const parts:unknown[]=Array.isArray(raw.parts)?raw.parts:[];
        check(raw.kind==='era'&&keys(raw,['kind','tick','year','month','bytes','sha256','manifest','parts'])&&text(raw.manifest,4096)&&
          count(parts.length,1,8)&&parts.every((part):part is string=>text(part,4096))&&
          new Set(parts).size===parts.length,'年代输入须给出真实清单与完整的不重复分卷。');
        snapshots.push({...info,kind:'era',manifest:raw.manifest,parts:[...parts]});
      }
    }
    const branch={id,label,...(typeof parentBranchId==='string'&&typeof forkTick==='number'?{parentBranchId,forkTick}:{}),snapshots};
    previous.set(id,branch);
    branches.push(branch);
  }
  const active=previous.get(branchId)?.snapshots.at(-1);
  check(active?.tick===tick&&active.sha256===sha256,'续跑只认清单中真实选定的支线头。');
  return {format:'ai-sect-detached-import',version:1,timelineId:root.timelineId,
    ...(typeof root.nextBranchNumber==='number'?{nextBranchNumber:root.nextBranchNumber}:{}),sourceRuleVersion:root.sourceRuleVersion,active:{branchId,tick,sha256},branches};
}

export async function readDetachedBoundedSource(path:string,maximum:number):Promise<Uint8Array> {
  const file=await open(path,O_RDONLY|O_NOFOLLOW);
  try{
    const before=await file.stat();
    check(before.isFile()&&count(before.size,1,maximum),'源文件类型、空内容或字节限额不符合要求。');
    const bytes=new Uint8Array(before.size);
    for(let offset=0;offset<bytes.length;){
      const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,offset);
      check(count(bytesRead,1,bytes.length-offset),'源文件读取期间已变化。');
      offset+=bytesRead;
    }
    check((await file.stat()).size===before.size,'源文件长度在读取期间已变化。');
    return bytes;
  }finally{await file.close();}
}
const utf8=(bytes:Uint8Array)=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
const input=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
export async function readDetachedImport(path:string) {
  const file=resolve(path);
  const plan=decodeDetachedImportPlan(utf8(await readDetachedBoundedSource(file,PLAN_BYTES)));
  return {plan,resolveSource:(source:string)=>resolve(dirname(file),source)};
}

export async function loadDetachedImportFrame(frame:DetachedImportFrame,
  resolveSource:(source:string)=>string):Promise<DetachedSourceFrame> {
  const {tick,year,month,bytes,sha256}=frame;
  const expected={tick,year,month,bytes,sha256};
  if(frame.kind==='native')return {expected,payload:await readDetachedBoundedSource(resolveSource(frame.file),bytes)};
  const manifestFile=input(await readDetachedBoundedSource(resolveSource(frame.manifest),ERA_CHECKPOINT_MANIFEST_BYTES));
  const partFiles:EraInput[]=[];
  for(const file of frame.parts){
    const ceiling=frame.parts.length===1?ERA_CHECKPOINT_NATIVE_JSON_BYTES:ERA_CHECKPOINT_PART_BYTES+37;
    partFiles.push(input(await readDetachedBoundedSource(resolveSource(file),ceiling)));
  }
  return {expected,manifestFile,partFiles};
}

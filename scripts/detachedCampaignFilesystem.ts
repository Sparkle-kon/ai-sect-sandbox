/** Node-only append-by-link publication. Use a private directory on a local POSIX filesystem, not a shared network volume. */
import { campaignHashValid, campaignRecord, campaignSHA256 } from '../src/engine/campaignMemento';

export interface LocalArchiveRef { readonly sha256:string; readonly bytes:number }
export interface LocalArchiveToken { readonly revision:number; readonly seal:string }
export interface LocalArchiveHead<T> { readonly token:LocalArchiveToken; readonly value:T }
interface Stats { readonly size:number; isFile():boolean; isDirectory():boolean }
interface NativeHandle { stat():Promise<Stats>; read(bytes:Uint8Array,offset:number,length:number,position:number):Promise<{bytesRead:number}>; writeFile(data:Uint8Array):Promise<void>; sync():Promise<void>; close():Promise<void> }
interface NativeFiles {
  mkdir(path:string,options:{mode:number}):Promise<unknown>;
  realpath(path:string):Promise<string>;
  lstat(path:string):Promise<Stats>;
  readdir(path:string):Promise<string[]>;
  open(path:string,flags:number,mode?:number):Promise<NativeHandle>;
  link(oldPath:string,newPath:string):Promise<void>;
  unlink(path:string):Promise<void>;
}
const fsModule='node:fs/promises',constantsModule='node:fs',pathModule='node:path';
const fs=await import(fsModule) as NativeFiles;
const {constants}=await import(constantsModule) as {constants:{O_RDONLY:number;O_CREAT:number;O_EXCL:number;O_WRONLY:number;O_NOFOLLOW:number;O_DIRECTORY:number;O_NONBLOCK:number}};
const {resolve,dirname,basename,join}=await import(pathModule) as {resolve(p:string):string;dirname(p:string):string;basename(p:string):string;join(...p:string[]):string};
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const HEAD_BYTES=64*1024,OBJECT_BYTES=4*1024*1024;
/** A separate bound for metadata, independent of the original world count or native time. */
export const LOCAL_DETACHED_MAX_REVISIONS=512;
const slotName=(n:number)=>String(n).padStart(16,'0')+'.head';
const exactKeys=(r:Record<string,unknown>,keys:string[])=>Object.keys(r).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(r,key));
const checkCode=(e:unknown,code:string)=>typeof e==='object'&&e!==null&&'code' in e&&e.code===code;

export class LocalDetachedArchiveError extends Error {
  constructor(readonly code:'format'|'integrity'|'conflict'|'incomplete'|'durability',message:string,cause?:unknown){
    super(message,{cause}); this.name='LocalDetachedArchiveError';
  }
}
function bad(message:string):never { throw new LocalDetachedArchiveError('integrity',message); }
function checkRef(ref:LocalArchiveRef){
  if(!campaignHashValid(ref.sha256)||!Number.isSafeInteger(ref.bytes)||ref.bytes<1||ref.bytes>OBJECT_BYTES)bad('独立档案对象引用超限或无效。');
}
function crc32(bytes:Uint8Array):string{
  let value=0xffffffff;
  for(const b of bytes){value^=b;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}
  return ((value^0xffffffff)>>>0).toString(16).padStart(8,'0');
}
function parse(bytes:Uint8Array):unknown{
  try{return JSON.parse(decoder.decode(bytes)) as unknown;}catch(e){throw new LocalDetachedArchiveError('format','独立档案提交头不是有效 UTF-8 JSON。',e);}
}
function equalBytes(a:Uint8Array,b:Uint8Array):boolean{return a.length===b.length&&a.every((n,i)=>n===b[i]);}
async function fsyncDirectory(dir:string){
  const handle=await fs.open(dir,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
}
async function readBounded(path:string,max:number,expected?:number):Promise<Uint8Array>{
  const h=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=await h.stat();
    if(!stat.isFile()||stat.size<1||stat.size>max||(expected!==undefined&&stat.size!==expected))bad('独立档案文件类型或字节长度不符。');
    const out=new Uint8Array(stat.size);
    for(let offset=0;offset<out.length;){
      const {bytesRead}=await h.read(out,offset,out.length-offset,offset);
      if(bytesRead<1)bad('读取过程中独立档案文件长度有变。');
      offset+=bytesRead;
    }
    if((await h.stat()).size!==out.length)bad('读取过程中独立档案文件长度有变。');
    return out;
  } finally {await h.close();}
}
async function install(dir:string,name:string,bytes:Uint8Array,allowExisting:(()=>Promise<void>)|undefined,
  beforePublish?:()=>Promise<void>):Promise<void>{
  const temp=join(dir,'.stage-'+globalThis.crypto.randomUUID()),final=join(dir,name);
  const h=await fs.open(temp,constants.O_WRONLY|constants.O_EXCL|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  try{
    try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
    await beforePublish?.();
    try{await fs.link(temp,final);}catch(e){
      if(!checkCode(e,'EEXIST'))throw e;
      if(!allowExisting)throw new LocalDetachedArchiveError('conflict','同一版本已有另一进程提交，未覆盖旧证据。',e);
      await allowExisting();
    }
    // A link that is already visible must not be rolled back on a failed fsync: report unknown durability.
    try{await fsyncDirectory(dir);}catch(e){throw new LocalDetachedArchiveError('durability','提交文件可能已经可见；目录同步失败，请先重新核验，勿盲目重试。',e);}
  }finally{await fs.unlink(temp).catch(()=>undefined);}
}

export class LocalDetachedArchive<T> {
  private constructor(readonly path:string,private readonly decodeValue:(value:unknown)=>T){}
  static async create<T>(requested:string,decodeValue:(value:unknown)=>T):Promise<LocalDetachedArchive<T>>{
    if(!requested.trim())throw new LocalDetachedArchiveError('format','独立档案需要明确的新目录。');
    const full=resolve(requested),parent=await fs.realpath(dirname(full)),path=join(parent,basename(full));
    await fs.mkdir(path,{mode:0o700}); // Never adopt, reuse or write any existing directory.
    await fs.mkdir(join(path,'objects'),{mode:0o700});
    await fs.mkdir(join(path,'published'),{mode:0o700});
    await fsyncDirectory(path);await fsyncDirectory(parent);
    return new LocalDetachedArchive(path,decodeValue);
  }
  static async open<T>(requested:string,decodeValue:(value:unknown)=>T):Promise<LocalDetachedArchive<T>>{
    return (await this.openWithRevisions(requested,decodeValue)).store;
  }
  static async openWithRevisions<T>(requested:string,decodeValue:(value:unknown)=>T):Promise<{
    store:LocalDetachedArchive<T>;revisions:readonly LocalArchiveHead<T>[];
  }>{
    if(!requested.trim())throw new LocalDetachedArchiveError('format','独立档案需要明确的目录。');
    const full=resolve(requested),path=join(await fs.realpath(dirname(full)),basename(full));
    for(const dir of [path,join(path,'objects'),join(path,'published')])if(!(await fs.lstat(dir)).isDirectory())bad('独立档案目录无效（不跟随符号链接）。');
    const archive=new LocalDetachedArchive(path,decodeValue);
    const revisions=await archive.revisions();
    if(!revisions.length)throw new LocalDetachedArchiveError('incomplete','独立档案没有已发布的首个版本。');
    return {store:archive,revisions};
  }
  async put(input:Uint8Array):Promise<LocalArchiveRef>{
    const bytes=Uint8Array.from(input),ref={sha256:await campaignSHA256(bytes),bytes:bytes.length};
    checkRef(ref);
    const dir=join(this.path,'objects');
    await install(dir,ref.sha256,bytes,async()=>{
      if(!equalBytes(await this.read(ref),bytes))bad('既有内容地址存在不相同的字节。');
    });
    if(!equalBytes(await this.read(ref),bytes))bad('独立档案新对象物理读回失败。');
    return ref;
  }
  async read(ref:LocalArchiveRef):Promise<Uint8Array>{
    checkRef(ref);
    const raw=await readBounded(join(this.path,'objects',ref.sha256),OBJECT_BYTES,ref.bytes);
    if(await campaignSHA256(raw)!==ref.sha256)bad('独立档案对象 SHA-256 不符。');
    return raw;
  }
  async revisions():Promise<readonly LocalArchiveHead<T>[]>{
    const dir=join(this.path,'published');
    const names=(await fs.readdir(dir)).filter(name=>!name.startsWith('.stage-')).sort();
    if(names.length>LOCAL_DETACHED_MAX_REVISIONS)bad('独立档案发布头数量超限，未改动旧历史。');
    const chain:LocalArchiveHead<T>[]=[];
    for(const [i,name] of names.entries()){
      const revision=i+1;
      try{
        if(name!==slotName(revision))bad('独立档案发布序号不连续或存在未知文件。');
        const physical=await readBounded(join(dir,name),HEAD_BYTES),raw=parse(physical);
        if(!campaignRecord(raw)||!exactKeys(raw,['revision','previous','value','crc32','seal'])||
          raw.revision!==revision||raw.previous!==(chain.at(-1)?.token.seal??null)||
          !campaignHashValid(raw.seal)||typeof raw.crc32!=='string')bad('独立档案发布头与前一版不匹配。');
        const body=encoder.encode(JSON.stringify({revision,previous:raw.previous,value:raw.value}));
        if(!equalBytes(physical,encoder.encode(JSON.stringify({revision,previous:raw.previous,value:raw.value,crc32:raw.crc32,seal:raw.seal})))||
          crc32(body)!==raw.crc32||await campaignSHA256(body)!==raw.seal)bad('独立档案发布头校验失败。');
        chain.push({token:{revision,seal:raw.seal},value:this.decodeValue(raw.value)});
      }catch(e){
        throw new LocalDetachedArchiveError('integrity',`独立档案发布头第 ${revision} 版无效（前 ${i} 个发布头有效），未自动修复。`,e);
      }
    }
    return chain;
  }
  async head():Promise<LocalArchiveHead<T>|null>{return (await this.revisions()).at(-1)??null;}
  async commit(expected:LocalArchiveToken|null,input:T,
    {beforePublish}: {beforePublish?:()=>Promise<void>}={}):Promise<LocalArchiveHead<T>>{
    const head=await this.head();
    if(!(expected===null?head===null:head?.token.revision===expected.revision&&head.token.seal===expected.seal))
      throw new LocalDetachedArchiveError('conflict','独立档案当前版本已变，先读取新的发布记录。');
    const value=this.decodeValue(input),body={revision:(head?.token.revision??0)+1,previous:head?.token.seal??null,value};
    if(body.revision>LOCAL_DETACHED_MAX_REVISIONS)throw new LocalDetachedArchiveError('format','独立档案发布头已满，旧历史不变。');
    const bodyBytes=encoder.encode(JSON.stringify(body));
    const seal=await campaignSHA256(bodyBytes);
    const data=encoder.encode(JSON.stringify({...body,crc32:crc32(bodyBytes),seal}));
    if(data.length>HEAD_BYTES)throw new LocalDetachedArchiveError('format','独立档案发布头超限。');
    await install(join(this.path,'published'),slotName(body.revision),data,undefined,beforePublish);
    return {token:{revision:body.revision,seal},value};
  }
}

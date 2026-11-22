/** Run: vite-node scripts/verifyDetachedArchiveCas.ts <nonexistent-private-test-dir> */
import {LocalDetachedArchive,LocalDetachedArchiveError} from './detachedCampaignFilesystem';
declare const process:{argv:string[];execPath:string;cwd():string;exitCode?:number;version:string;platform:string};
interface Child {
  kill(signal:'SIGKILL'):boolean;
  once(event:'exit',callback:(code:number|null,signal:string|null)=>void):void;
  once(event:'error',callback:(error:Error)=>void):void;
}
const nativeFiles='node:fs/promises',nativeChild='node:child_process',nativePath='node:path';
const {mkdir,writeFile,readFile,stat}=await import(nativeFiles) as {
  mkdir(path:string,opts:{mode:number}):Promise<unknown>;
  writeFile(path:string,data:string,opts?:{flag:string}):Promise<void>;
  readFile(path:string,encoding:'utf8'):Promise<string>;
  stat(path:string):Promise<unknown>;
};
const {spawn}=await import(nativeChild) as {
  spawn(command:string,args:string[],opts:{stdio:'inherit'}):Child
};
const {join,resolve}=await import(nativePath) as {join(...path:string[]):string;resolve(path:string):string};
const ROOT=process.cwd(),encoded=new TextEncoder();
function requireThat(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
function decodeValue(value:unknown){requireThat(typeof value==='string'&&value.length<200,'bad fixture value');return value;}
async function exists(path:string){try{await stat(path);return true;}catch(e){if(typeof e==='object'&&e&&'code' in e&&e.code==='ENOENT')return false;throw e;}}
async function waitFile(path:string,timeout=20_000){
  const start=Date.now();
  while(!await exists(path)){
    if(Date.now()-start>timeout)throw Error('未收到明确的进程门闩：'+path);
    await new Promise<void>(resolve=>setTimeout(resolve,15));
  }
}
function launch(fixture:string,kind:string){
  const child=spawn(process.execPath,[join(ROOT,'node_modules/vite-node/vite-node.mjs'),join(ROOT,'scripts/verifyDetachedArchiveCas.ts'),
    fixture,kind],{stdio:'inherit'});
  const result=new Promise<{code:number|null;signal:string|null}>((done,reject)=>{
    child.once('exit',(code,signal)=>done({code,signal}));child.once('error',reject);
  });
  return {child,result};
}
const [directory,role,...extra]=process.argv.slice(2);
requireThat(directory&&!extra.length,'用法：vite-node scripts/verifyDetachedArchiveCas.ts <nonexistent-private-test-dir>');
const fixture=resolve(directory),archive=join(fixture,'archive'),gate=join(fixture,'release');
if(role){
  if(role==='reader'){
    const store=await LocalDetachedArchive.open(archive,decodeValue),head=await store.head();
    requireThat(head?.token.revision===2&&(head.value==='first' || head.value==='second'),'新进程无法读回唯一成功发布的档案。');
  }else{
    requireThat(['first','second','killed'].includes(role),'未知测试进程角色。');
    const store=await LocalDetachedArchive.open(archive,decodeValue),base=await store.head();
    requireThat(base?.token.revision===1,'竞速基础必须是物理读回的原版。');
    try {
      await store.put(encoded.encode('own pending object '+role));
      await store.commit(base.token,role,{beforePublish:async()=>{
        await writeFile(join(fixture,'ready-'+role),'fsynced',{flag:'wx'});
        await waitFile(role==='killed'?join(fixture,'never-release'):gate);
      }});
    }catch(e){
      if(e instanceof LocalDetachedArchiveError&&e.code==='conflict')process.exitCode=32;
      else throw e;
    }
  }
}else{
  await mkdir(fixture,{mode:0o700});
  const store=await LocalDetachedArchive.create(archive,decodeValue);
  const proof=await store.put(encoded.encode('original history')),alias=await store.put(encoded.encode('original history'));
  requireThat(alias.sha256===proof.sha256,'相同原字节未落在同一地址。');
  const origin=await store.commit(null,'original-ever');
  const killed=launch(fixture,'killed');
  await waitFile(join(fixture,'ready-killed'));
  requireThat(killed.child.kill('SIGKILL'),'未能终止独立写入进程。');
  requireThat((await killed.result).signal==='SIGKILL','没有观察到实际的提交前 SIGKILL。');
  requireThat((await store.head())?.token.seal===origin.token.seal,'进程提交前终止不应改变上一发布头。');
  const first=launch(fixture,'first'),second=launch(fixture,'second');
  await Promise.all([waitFile(join(fixture,'ready-first')),waitFile(join(fixture,'ready-second'))]);
  await writeFile(gate,'go',{flag:'wx'});
  const results=await Promise.all([first.result,second.result]);
  requireThat(results.map(item=>item.code).sort().join(',')==='0,32','同一预期版本的两个进程没有产生严格的一胜一拒。');
  requireThat((await launch(fixture,'reader').result).code===0,'新进程独立读回失败。');
  const intact=await store.revisions();
  requireThat(intact.length===2&&intact[0].token.seal===origin.token.seal&&new TextDecoder().decode(await store.read(proof))==='original history',
    '旧版本或对象已发生改变。');
  const secondSlot=join(archive,'published','0000000000000002.head');
  const damaged=await readFile(secondSlot,'utf8');
  await writeFile(secondSlot,damaged+' '); // Isolated deliberate corruption, never a production path.
  let detected=false;
  try{await store.head();}catch(e){detected=e instanceof LocalDetachedArchiveError&&e.code==='integrity'&&e.message.includes('前 1 个');}
  requireThat(detected,'损坏最新版本时应明确指出上一个校验版本，不自动降级或修复。');
  requireThat((await readFile(secondSlot,'utf8'))===damaged+' '&&new TextDecoder().decode(await store.read(proof))==='original history',
    '失败核验不能自动改写现场。');
  console.log(JSON.stringify({node:process.version,platform:process.platform,truePrepublicationKill:true,
    processResults:results,reopenedSeparateProcess:true,priorHeadUnchanged:true,rawObjectUnchanged:true,corruptionDetected:true}));
}

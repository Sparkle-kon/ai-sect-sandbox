/** POSIX isolated test; no game/save/archive source is ever edited. Supply a nonexistent output directory. */
import {readFile,stat,join} from './centuryNodeRuntime';
import {advanceDetachedArchive,auditDetachedArchive,createDetachedArchive,readDetachedArchiveOriginal,
  type DetachedLocalRevision} from './detachedCampaignLocal';
import {LocalDetachedArchive,LocalDetachedArchiveError,type LocalArchiveToken} from './detachedCampaignFilesystem';
import {campaignHashValid,campaignInteger,campaignRecord,campaignSHA256} from '../src/engine/campaignMemento';
import {verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];execPath:string;cwd():string;pid:number;version:string;platform:string;exitCode?:number;
  resourceUsage():{maxRSS:number}};
interface NativeFiles {
  mkdir(path:string,opts:{mode:number}):Promise<void>;
  rename(oldPath:string,newPath:string):Promise<void>;
  writeFile(path:string,data:string,options:{flag:'wx';mode:number}):Promise<void>;
  readdir(path:string):Promise<string[]>;
}
interface Child {
  pid?:number;
  kill(signal:'SIGKILL'):boolean;
  once(event:'exit',fn:(code:number|null,signal:string|null)=>void):void;
  once(event:'error',fn:(err:Error)=>void):void;
}
const nodeFiles='node:fs/promises',nodeChildren='node:child_process',nodePath='node:path';
const fs=await import(nodeFiles) as NativeFiles;
const {spawn}=await import(nodeChildren) as {spawn:(command:string,args:string[],opts:{stdio:'inherit'})=>Child};
const {resolve}=await import(nodePath) as {resolve(path:string):string};
const shaSource='eb78f17244d2a1e0e578363ebdcfffff006e7cfd24c3ca63750626a5fd92240c';
const manifestId='dbc3537fb80cb829aaf3095909ab3935fdd745ecebf33a9dbb6e6e579985a3a3';
const historicalRule='09b2223463cc0995a00ebcc1eb7a32c7a6ac9dfc71b71bd0e3545f8ceac23203';
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const encoder=new TextEncoder(),asInput=(raw:Uint8Array)=>({size:raw.length,arrayBuffer:async()=>Uint8Array.from(raw).buffer});
const nativeHash=(world:WorldState)=>campaignSHA256(encoder.encode(encodeEraWorldSave(world)));
function check(ok:unknown,msg:string):asserts ok{if(!ok)throw new Error(msg);}
const [directory,sourceStem,role,...more]=process.argv.slice(2);
check(directory&&sourceStem&&!more.length&&process.platform!=='win32'&&campaignHashValid(__SECT_UTILITY_RULE_VERSION__),
  '用法（本地 POSIX）：verifyDetachedNativeInterruption.ts NEW_PRIVATE_OUTPUT ORIGINAL_T60034_STEM');
const work=resolve(directory),archive=join(work,'archive'),headDir=join(archive,'published'),objects=join(archive,'objects');
const expectedHeadFile=join(work,'reviewed.json'),readyFile=join(work,'ready-before-link.json');
const pendingHead='0000000000000002.head',originHead='0000000000000001.head';
const series={sourceStem:resolve(sourceStem),work,archive};
const write=(path:string,value:unknown)=>fs.writeFile(path,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8')) as unknown;
const exists=async(path:string)=>{try{await stat(path);return true;}catch(e){
  if(typeof e==='object'&&e&&'code' in e&&e.code==='ENOENT')return false;
  throw e;
}};
function token(raw:unknown):LocalArchiveToken{
  check(campaignRecord(raw)&&campaignInteger(raw.revision,1)&&campaignHashValid(raw.seal),'预期发布令牌无效。');
  return {revision:raw.revision,seal:raw.seal};
}
async function physicalSource(){
  const eraPath=series.sourceStem+'.era',rawPath=series.sourceStem+'.json';
  const [eraStat,rawStat]=await Promise.all([stat(eraPath),stat(rawPath)]);
  check(eraStat.size===600&&rawStat.size===751525,'实际输入文件不符合本次中段档体积。');
  const [era,raw]=await Promise.all([readFile(eraPath),readFile(rawPath)]);
  check(era.length===600&&raw.length===751525&&await campaignSHA256(raw)===shaSource,'不是原线精确 T60034 负载。');
  const verified=await verifyEraCheckpoint(asInput(era),[asInput(raw)],codec);
  check(verified.manifest.id===manifestId&&verified.manifest.engineRuleVersion===historicalRule&&verified.world.tick===60034&&
    verified.world.year===6003&&verified.world.month===10&&await nativeHash(verified.world)===shaSource,
    '物理 T60034 年代清单或严格原生内容不符。');
  return {era,raw,verified,manifestFileSha:await campaignSHA256(era)};
}
function currentInventory(world:WorldState){
  const actor=world.cultivators.find(row=>row.id==='elder-danxia-1');
  check(actor?.alive&&actor.hp>0&&actor.locationId==='loc-vein-north','原生闻春岚必须真实在世且原址在场。');
  return {actorId:actor.id,siteId:actor.locationId,stones:actor.spiritStones,roots:actor.herbs.earth_root,herbs:actor.herbs,pills:actor.pills};
}
function oldPropertyProof(world:WorldState){
  return {water:world.coldWaterVein?.openings.find(row=>row.id==='water-gate-8'),
    well:world.villageWorks.projects.find(row=>row.id==='village-work-1'),
    freight:world.villageSupply.agreements.find(row=>row.id==='village-supply-1'),
    charter:world.northMiningCharters?.charters.find(row=>row.id==='north-mining-charter-12')};
}
const stopMarkerKind='fsynced_before_publish_link';
async function installChildFault(){
  // Only this disposable child instruments the already public E42 pre-link test hook.
  const proto=LocalDetachedArchive.prototype as LocalDetachedArchive<DetachedLocalRevision>;
  const commit=proto.commit;
  proto.commit=function(this:LocalDetachedArchive<DetachedLocalRevision>,expected,value,options){
    check(value.kind==='advance'&&expected?.revision===1&&value.tick===60035,'故障钩子只允许真实第二版 T60035 预发布。');
    return commit.call(this,expected,value,{beforePublish:async()=>{
      await options?.beforePublish?.();
      const stages=(await fs.readdir(headDir)).filter(name=>name.startsWith('.stage-'));
      check(this.path===archive&&stages.length===1&&!await exists(join(headDir,pendingHead)),
        '未处于严格预链接边界。');
      const name=stages[0], bytes=await readFile(join(headDir,name)),staged=JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      check(campaignRecord(staged)&&staged.revision===2&&staged.previous===expected.seal&&campaignHashValid(staged.seal),
        '已 fsync 的待发布头没有确切旧令牌。');
      const pending=join(work,'child-ready.tmp');
      await write(pending,{kind:stopMarkerKind,pid:process.pid,name,sha:await campaignSHA256(bytes),seal:staged.seal,
        nativeTick:value.tick,nativeWorldSha256:value.worldSha256,expected});
      await fs.rename(pending,readyFile);
      // Keep the event loop live without ever granting permission to link this candidate.
      await new Promise<void>(()=>{setInterval(()=>undefined,1000);});
    }});
  };
}
function launch(which:'interrupt'|'retry'|'stale'){
  const child=spawn(process.execPath,[join(process.cwd(),'node_modules/vite-node/vite-node.mjs'),
    join(process.cwd(),'scripts/verifyDetachedNativeInterruption.ts'),series.work,series.sourceStem,which],{stdio:'inherit'});
  const result=new Promise<{code:number|null;signal:string|null}>((done,reject)=>{
    child.once('exit',(code,signal)=>done({code,signal}));child.once('error',reject);
  });
  return {child,result};
}
async function waitReady(path:string,signal:AbortSignal,limit=25_000){
  const stop=Date.now()+limit;
  while(!await exists(path)){
    if(signal.aborted)return;
    if(Date.now()>stop)throw Error('进程未能到达已 fsync 尚未链接的发信点。');
    await new Promise<void>(resolve=>setTimeout(resolve,20));
  }
}
if(role!==undefined){
  check(role==='interrupt'||role==='retry'||role==='stale','未知隔离子进程任务。');
  const expected=token(await json(expectedHeadFile));
  if(role==='interrupt')await installChildFault();
  try{
    const head=await advanceDetachedArchive(archive,{writerRuleVersion:__SECT_UTILITY_RULE_VERSION__,months:1,expected});
    check(role==='retry','未获准提交的尝试发布了版本。');
    await write(join(work,'retry.json'),{pid:process.pid,head});
  }catch(error){
    if(role!=='stale'||!(error instanceof LocalDetachedArchiveError)||error.code!=='conflict')throw error;
    await write(join(work,'stale.json'),{pid:process.pid,code:error.code,expected});
    process.exitCode=32;
  }
}else{
  const began=performance.now(),source=await physicalSource();
  const starting=source.verified.world,opening=source.verified.manifest,branch=opening.source.branchId;
  const startingStock=currentInventory(starting),originalProperty=oldPropertyProof(starting);
  check(originalProperty.well?.settledTick===5&&originalProperty.water?.completedTick===14&&
    originalProperty.freight?.closedTick===34&&originalProperty.charter?.firstPassage?.tileId==='tile-13-2',
    '原井与真实旧借还、改道、交割原据缺失。');
  await fs.mkdir(work,{mode:0o700});
  const origin=await createDetachedArchive({directory:archive,sourceRuleVersion:historicalRule,writerRuleVersion:__SECT_UTILITY_RULE_VERSION__,
    timelineId:opening.source.timelineId??'e49-native-interruption-proof',active:{branchId:branch,tick:starting.tick,sha256:shaSource},
    branches:[{id:branch,label:opening.source.label??'同一原井第六千零三年中间帧',frames:[
      {manifestFile:asInput(source.era),partFiles:[asInput(source.raw)],expected:{tick:starting.tick,year:starting.year,month:starting.month,
        bytes:source.raw.length,sha256:shaSource}},
    ]}]});
  const expected=origin.head.token;
  await write(expectedHeadFile,expected);
  const sourceHeadFile=join(headDir,originHead);
  const initialHeadBytes=await campaignSHA256(await readFile(sourceHeadFile));
  const initialObjectNames=new Set(await fs.readdir(objects));
  const heartbeat=launch('interrupt');
  let death:{code:number|null;signal:string|null};
  const waiting=new AbortController();
  try{
    await Promise.race([waitReady(readyFile,waiting.signal),heartbeat.result.then(r=>{throw Error('发布进程在挂起点前退出：'+JSON.stringify(r));})]);
    check(heartbeat.child.kill('SIGKILL'),'未能真正停止在待发布点。');
    death=await heartbeat.result;
  }catch(error){
    heartbeat.child.kill('SIGKILL');await heartbeat.result.catch(()=>undefined);throw error;
  }finally{waiting.abort();}
  check(death.signal==='SIGKILL'&&death.code===null,'故障不是细分进程的真 SIGKILL。');
  const ready=await json(readyFile);
  check(campaignRecord(ready)&&ready.kind===stopMarkerKind&&ready.pid===heartbeat.child.pid&&ready.nativeTick===60035&&
    campaignHashValid(ready.nativeWorldSha256)&&campaignHashValid(ready.sha)&&campaignHashValid(ready.seal)&&
    typeof ready.name==='string'&&/^\.stage-[0-9a-f-]{36}$/u.test(ready.name)&&
    JSON.stringify(token(ready.expected))===JSON.stringify(expected),'未拿到精确的候选/旧头待链接证明。');
  const stageBytes=await campaignSHA256(await readFile(join(headDir,ready.name)));
  const afterDeath=await auditDetachedArchive(archive);
  const actualOriginal=await readDetachedArchiveOriginal(archive,branch,60034);
  check(stageBytes===ready.sha&&!await exists(join(headDir,pendingHead))&&
    JSON.stringify(afterDeath.head.token)===JSON.stringify(expected)&&await nativeHash(afterDeath.world)===shaSource&&
    JSON.stringify(currentInventory(afterDeath.world))===JSON.stringify(startingStock)&&
    await campaignSHA256(await readFile(sourceHeadFile))===initialHeadBytes&&
    await campaignSHA256(actualOriginal.payload)===shaSource&&actualOriginal.sourceManifest&&
    await campaignSHA256(actualOriginal.sourceManifest)===source.manifestFileSha,'中断改变了真实已发布头、历史档或原有库存。');
  const unreferencedObjects=(await fs.readdir(objects)).filter(name=>!initialObjectNames.has(name)).length;
  check(unreferencedObjects>0,'故障没有在对象已生成的真实候选处发生。');
  const retry=launch('retry'),retried=await retry.result;
  check(retried.code===0&&retried.signal===null,'全新的重试进程无法提交。');
  const retryReport=await json(join(work,'retry.json'));
  check(campaignRecord(retryReport)&&retryReport.pid===retry.child.pid&&campaignRecord(retryReport.head),
    '未确认跨进程真实重试结果。');
  const complete=await auditDetachedArchive(archive);
  check(complete.head.value.kind==='advance'&&complete.head.token.revision===2&&
    complete.head.token.seal===ready.seal&&complete.head.value.worldSha256===ready.nativeWorldSha256&&
    await campaignSHA256(await readFile(join(headDir,pendingHead)))===stageBytes&&complete.world.year===6003&&complete.world.month===11&&
    complete.world.tick===60035,'同一 token 重试未发布完全相同的真实候选。');
  const direct=advanceWorldTick(starting,undefined,undefined,'utility'),directHash=await nativeHash(direct);
  check(directHash===complete.head.value.worldSha256&&JSON.stringify(currentInventory(direct))===JSON.stringify(currentInventory(complete.world))&&
    JSON.stringify(oldPropertyProof(complete.world))===JSON.stringify(originalProperty)&&!complete.world.regionalSimulation&&!complete.world.authoredEraOrigin,
    '重试后原生月份、实际财物或旧史没有与独立 Utility 一步一致。');
  const stale=launch('stale'),staleExit=await stale.result;
  check(staleExit.code===32&&staleExit.signal===null,'旧 token 没有失效。');
  const staleReport=await json(join(work,'stale.json'));
  check(campaignRecord(staleReport)&&staleReport.pid===stale.child.pid&&staleReport.code==='conflict'&&
    JSON.stringify(token(staleReport.expected))===JSON.stringify(expected),'未验证过期令牌确切拒绝。');
  const untouched=await auditDetachedArchive(archive),sourceAfter=await physicalSource();
  const headNames=(await fs.readdir(headDir)).filter(name=>name.endsWith('.head')).sort();
  check(JSON.stringify(untouched.head.token)===JSON.stringify(complete.head.token)&&
    JSON.stringify(headNames)===JSON.stringify([originHead,pendingHead])&&
    await campaignSHA256(await readFile(sourceHeadFile))===initialHeadBytes&&
    sourceAfter.manifestFileSha===source.manifestFileSha&&await campaignSHA256(sourceAfter.raw)===shaSource,
    '重试后出现第三版、旧头或原档改变。');
  const report={kind:'native_prepublication_interruption_verified',node:process.version,platform:process.platform,
    sourceRule:historicalRule,executionRule:__SECT_UTILITY_RULE_VERSION__,source:{tick:60034,year:6003,month:10,manifestId,sha256:shaSource,
      manifestFileSha:source.manifestFileSha,payloadBytes:source.raw.length,physicalBytes:source.raw.length+source.era.length,unchanged:true},
    cut:{signal:death.signal,childPid:ready.pid,phase:stopMarkerKind,candidateStagedSha256:stageBytes,stillPublished:afterDeath.head.token,
      publishedTick:afterDeath.world.tick,unreferencedCandidateObjects:unreferencedObjects,exactOriginalSourceRecovered:true},
    retry:{childPid:retryReport.pid,oldToken:expected,token:complete.head.token,tick:complete.world.tick,year:complete.world.year,
      month:complete.world.month,rawBytes:new TextEncoder().encode(encodeEraWorldSave(complete.world)).length,
      worldSha256:directHash,exactSameStagedCandidate:true,exactDirectNativeUtility:true},
    stale:{childPid:staleReport.pid,code:staleReport.code,headUnchanged:true,publishedRevisions:headNames.length},
    inventory:{before:startingStock,atCut:currentInventory(afterDeath.world),after:currentInventory(complete.world),
      actualVintageWaterDebtAndFreightUnchanged:true,valuationScope:'own actual units; no fabricated inventory or balance'},
    elapsedMs:Math.round(performance.now()-began),peakRSSKiB:process.resourceUsage().maxRSS};
  await write(join(work,'interrupt-result.json'),report);
  console.log(JSON.stringify(report));
}

import { arch,join,platform,readFile,stat } from './centuryNodeRuntime';
import { campaignHashValid,campaignInteger,campaignRecord,campaignSHA256 } from '../src/engine/campaignMemento';
import { verifyEraCheckpoint } from '../src/engine/eraCheckpointEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import { projectNorthMiningCharters } from '../src/engine/northMiningCharterEngine';
import { regionForPoint } from '../src/engine/regionalSimulationEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';
import type { ThousandChainCore,ThousandChainLink,ThousandCompletion } from './thousandYearAcceptance';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;resourceUsage():{maxRSS:number}};
const nativeModule='node:fs/promises';
const {readdir}=await import(nativeModule) as {readdir:(dir:string)=>Promise<string[]>};
function invariant(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
const [dir,...more]=process.argv.slice(2),start=performance.now();
invariant(dir&&!more.length,'用法：vite-node scripts/thousandYearAudit.ts <existing-output-dir>');
const build=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
invariant(campaignHashValid(build),'当前构建规则指纹不可用。');
const files=await readdir(dir),unread=new Set(files),codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const mark=async(name:string):Promise<Uint8Array>=>{
  invariant(unread.delete(name),'缺少文件或重复引用：'+name);
  return readFile(join(dir,name));
};
const json=async(name:string):Promise<unknown>=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await mark(name))) as unknown;
const input=async(name:string)=>{
  const data=await mark(name);
  return {size:data.byteLength,arrayBuffer:async()=>Uint8Array.from(data).buffer};
};
const hash=(text:string)=>campaignSHA256(new TextEncoder().encode(text));
function readLink(value:unknown):ThousandChainLink {
  invariant(campaignRecord(value)&&campaignInteger(value.tick,1)&&campaignHashValid(value.manifestId)&&
    campaignHashValid(value.sha256)&&campaignHashValid(value.chainDigest),'摘要节点字段无效。');
  return {tick:value.tick,manifestId:value.manifestId,sha256:value.sha256,chainDigest:value.chainDigest};
}
function sameLink(a:ThousandChainLink|undefined,b:ThousandChainLink|undefined){
  return a===undefined||b===undefined?a===b:
    a.tick===b.tick&&a.manifestId===b.manifestId&&a.sha256===b.sha256&&a.chainDigest===b.chainDigest;
}
const raw=await json('complete.json'); // No completion marker => no thousand-year claim.
invariant(campaignRecord(raw)&&raw.status==='complete'&&raw.ruleVersion===build&&raw.months===12000&&
  raw.sourceUnchanged===true&&campaignHashValid(raw.nativeNextSha)&&campaignInteger(raw.lineagePhysicalBytes,1),'未完成或规则指纹不符。');
const completion:ThousandCompletion={status:'complete',ruleVersion:build,initial:readLink(raw.initial),final:readLink(raw.final),
  months:12000,nativeNextSha:raw.nativeNextSha,sourceUnchanged:true,lineagePhysicalBytes:raw.lineagePhysicalBytes,
  ...(raw.detached===undefined?{}:{detached:readLink(raw.detached)})};
invariant(completion.initial.tick===34&&completion.final.tick===12034&&
  (!completion.detached||completion.detached.tick===12035),'验收的原生起止日期无效。');
const markPhysical=(names:readonly string[])=>Promise.all(names.map(name=>stat(join(dir,name)))).then(rows=>rows.reduce((n,row)=>n+row.size,0));
async function verifyNode(tick:number,kind:ThousandChainCore['kind'],previous?:ThousandChainLink){
  const raw=await json(`t${tick}-chain.json`);
  invariant(campaignRecord(raw)&&raw.tick===tick&&raw.ruleVersion===build&&raw.kind===kind&&campaignInteger(raw.bytes,1)&&
    campaignInteger(raw.physicalBytes,1),'摘要链节点版本、日期或类型无效。');
  const link=readLink(raw),prior=raw.previous===undefined?undefined:readLink(raw.previous);
  invariant(sameLink(prior,previous),'前一节点与同一条摘要链不匹配。');
  const core:ThousandChainCore={tick:link.tick,manifestId:link.manifestId,sha256:link.sha256,bytes:raw.bytes,previous:prior,
    ruleVersion:build!,kind};
  invariant(await hash(JSON.stringify(core))===link.chainDigest,'摘要链节点被更改。');
  const year=1001+Math.floor((tick-1)/12),month=(tick-1)%12+1;
  const stem=`t${tick}-era-${year}-${month}-${link.manifestId.slice(0,12)}`;
  const manifestName=stem+'.era',partNames=files.filter(name=>name===stem+'.json'||name.startsWith(stem+'-')&&/\.(era-part)$/.test(name));
  const opened=await verifyEraCheckpoint(await input(manifestName),await Promise.all(partNames.reverse().map(input)),codec);
  invariant(opened.world.tick===tick&&opened.world.year===year&&opened.world.month===month&&
    opened.manifest.id===link.manifestId&&opened.manifest.payloadSha256===link.sha256&&opened.manifest.engineRuleVersion===build&&
    opened.manifest.payloadBytes===core.bytes&&await hash(encodeEraWorldSave(opened.world))===link.sha256,'便携内容或原生复核不符。');
  const physical=await markPhysical([manifestName,...partNames]);
  invariant(physical===raw.physicalBytes,'清单与分卷字节不一致。');
  return {world:opened.world,link,physical};
}
let first:WorldState|undefined,head:WorldState|undefined,last:ThousandChainLink|undefined,lineagePhysicalBytes=0;
for(let tick=34;tick<=12034;tick+=1200){
  const node=await verifyNode(tick,'lineage',last);
  if(!first){
    first=node.world;
    invariant(sameLink(node.link,completion.initial)&&first.random.seed===1&&first.worldgen?.profileId==='spirit-bloom','验收源线不匹配。');
  }else{
    const ids=new Set(node.world.cultivators.map(actor=>actor.id));
    invariant(sameGeneratedWorld(first,node.world)&&ids.size===node.world.cultivators.length&&
      first.cultivators.every(actor=>ids.has(actor.id)),'血脉或最初的真实人物不一致。');
  }
  head=node.world;last=node.link;lineagePhysicalBytes+=node.physical;
}
invariant(first&&head&&sameLink(last,completion.final)&&lineagePhysicalBytes===completion.lineagePhysicalBytes,'末节点不匹配。');
if(completion.detached){
  const detached=await verifyNode(12035,'detached_action',last);
  invariant(sameLink(detached.link,completion.detached)&&sameGeneratedWorld(head,detached.world),'独立本地行动分支不匹配。');
}
invariant(unread.size===0,'目录存在未认证文件；不将额外或部分文件算作验收。');
const charter=first.northMiningCharters?.charters[0];
invariant(charter&&JSON.stringify(head.northMiningCharters?.charters.find(row=>row.id===charter.id))===JSON.stringify(charter),
  '旧采契没有从同一真实源线下传。');
const orders:Record<string,LLMDecisionPayload>=Object.fromEntries(head.cultivators.filter(a=>a.alive&&a.hp>0).map(a=>
  [a.id,{chosenAction:'REST',innerMonologue:'千年隔离验收有记录的原生指令'}]));
const next=advanceWorldTick(head,orders,undefined,'utility'),nextSha=await hash(encodeEraWorldSave(next));
invariant(next.tick===12035&&completion.nativeNextSha===nextSha,'重新启动进程后，原生下一月不一致。');
const witness=head.cultivators.find(a=>a.id==='elder-danxia-1'&&a.alive&&a.hp>0);
const regions=new Set(head.locations.filter(loc=>loc.type!=='secret_realm'&&loc.type!=='abyss').map(loc=>regionForPoint(head!,loc))
  .filter(region=>region!==undefined));
console.log(JSON.stringify({verifiedLineageSeals:11,ruleVersion:build,node:process.version,platform:platform(),arch:arch(),
  date:[head.year,head.month,head.tick],head:completion.final,months:completion.months,
  finalNativeBytes:new TextEncoder().encode(encodeEraWorldSave(head)).byteLength,nativeNextTick:next.tick,nativeNextSha:nextSha,
  lineagePhysicalBytes,allArtifactBytes:await markPhysical(files),actualLowerRegions:[...regions].sort(),
  regionalApproximationEnabled:!!head.regionalSimulation,upperPresent:!!head.upperPassage,
  visibleOldCharter:projectNorthMiningCharters(head,witness),elapsedMs:Math.round(performance.now()-start),
  peakRSSKiB:process.resourceUsage().maxRSS}));

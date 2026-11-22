/** Independent, read-only physical seal + partial-prefix audit. No multicentury re-simulation. */
import {readFile,stat,join} from './centuryNodeRuntime';
import {sixMillenniaNativeOrders,SIX_MILLENNIA_ROOT_TICK,SIX_MILLENNIA_SEAL_INTERVAL,SIX_MILLENNIA_SOURCE_TICK,
  SIX_MILLENNIA_TERM_TICK} from './sixMillenniaControls';
import {campaignHashValid,campaignInteger,campaignRecord,campaignSHA256} from '../src/engine/campaignMemento';
import {verifyEraCheckpoint,ERA_CHECKPOINT_MAX_BYTES,ERA_CHECKPOINT_PART_BYTES} from '../src/engine/eraCheckpointEngine';
import {encodeEraWorldSave,decodeEraWorldSave} from '../src/engine/storageEngine';
import {inspectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {sameGeneratedWorld} from '../src/engine/worldIdentity';
import type {WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;platform:string;resourceUsage():{maxRSS:number}};
const native='node:fs/promises';
const {readdir}=await import(native) as {readdir:(directory:string)=>Promise<string[]>};
const historicalRule='22f5d7d59d73da2bc436d166a467521d7d63bafc43c6282c304fc543b4ed9048';
const sourceManifest='60cdafea55d32da5b8412c268447db7980592d2bc25ee4102ff66808f01929f0';
const sourceSha='ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239';
const executionRule='09b2223463cc0995a00ebcc1eb7a32c7a6ac9dfc71b71bd0e3545f8ceac23203';
type Link={tick:number;manifestId:string;payloadSha256:string;chainDigest:string};
type Counts={registered:number;living:number;lowerResidents:number;northPopulation:number|undefined};
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),encoder=new TextEncoder();
const encode=encodeEraWorldSave,codec={encode,decode:decodeEraWorldSave};
const sha=(text:string)=>campaignSHA256(encoder.encode(text));
const asInput=(bytes:Uint8Array)=>({size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
function must(ok:unknown,label:string):asserts ok{if(!ok)throw new Error(label);}
function shape(row:Record<string,unknown>,keys:readonly string[]):boolean{
  return Object.keys(row).length===keys.length&&keys.every(key=>Object.hasOwn(row,key));
}
function json(raw:Uint8Array):unknown{return JSON.parse(decoder.decode(raw)) as unknown;}
function loadLink(value:unknown):Link{
  must(campaignRecord(value)&&shape(value,['tick','manifestId','payloadSha256','chainDigest'])&&campaignInteger(value.tick,1)&&
    campaignHashValid(value.manifestId)&&campaignHashValid(value.payloadSha256)&&campaignHashValid(value.chainDigest),'不合法的前一封存指针。');
  return {tick:value.tick,manifestId:value.manifestId,payloadSha256:value.payloadSha256,chainDigest:value.chainDigest};
}
function counts(world:WorldState):Counts {
  return {registered:world.cultivators.length,living:world.cultivators.filter(a=>a.alive&&a.hp>0).length,
    lowerResidents:world.settlements.villages.reduce((n,r)=>n+r.population,0),
    northPopulation:world.settlements.villages.find(r=>r.id==='village-loc-vein-north')?.population};
}
must(__SECT_UTILITY_RULE_VERSION__===executionRule,'当前审计内核不是所声明原生逐月内核。');
const [directory,sourceStem,option,...rest]=process.argv.slice(2);
must(directory&&sourceStem&&(option===undefined||option==='--prefix')&&rest.length===0,
  '用法：auditSixMillenniaSeals.ts SEALED_DIRECTORY ORIGINAL_T36034_STEM [--prefix]');
const started=performance.now();
async function physical(path:string,max:number){
  const before=await stat(path);
  must(before.size>=1&&before.size<=max,'实际文件大小不在期望范围。');
  const data=await readFile(path);must(data.length===before.size,'读取过程中实际字节数变化。');return data;
}
const sourceManifestBytes=await physical(sourceStem+'.era',8192),sourcePayload=await physical(sourceStem+'.json',691834);
const root=await verifyEraCheckpoint(asInput(sourceManifestBytes),[asInput(sourcePayload)],codec);
must(root.manifest.id===sourceManifest&&root.manifest.payloadSha256===sourceSha&&root.manifest.engineRuleVersion===historicalRule&&
  root.world.tick===SIX_MILLENNIA_SOURCE_TICK&&await sha(encode(root.world))===sourceSha,'不匹配已证三千年原包。');
const frozenFacts=(world:WorldState)=>JSON.stringify({
  well:world.villageWorks.projects.find(row=>row.id==='village-work-1'),
  water:world.coldWaterVein?.openings.find(row=>row.id==='water-gate-8'),
  charter:world.northMiningCharters?.charters.find(row=>row.id==='north-mining-charter-12'),
  agreement:world.villageSupply.agreements.find(row=>row.id==='village-supply-1'),
});
const inherited=frozenFacts(root.world),people=root.world.cultivators.map(row=>row.id);
const loadedNames=await readdir(directory),knownNames=new Set(loadedNames);
let published:Link={tick:SIX_MILLENNIA_SOURCE_TICK,manifestId:sourceManifest,payloadSha256:sourceSha,
  chainDigest:await sha(JSON.stringify({sourceRule:historicalRule,tick:SIX_MILLENNIA_SOURCE_TICK,manifestId:sourceManifest,payloadSha256:sourceSha}))};
const prefix:Link[]=[];
let totalPhysical=0,receiptBytes=0,lastCounts=counts(root.world),lastDate={tick:root.world.tick,year:root.world.year,month:root.world.month};
function mark(name:string){must(knownNames.delete(name),'物理文件缺失、被重复关联或不在完成前缀：'+name);return join(directory,name);}
for(let tick=SIX_MILLENNIA_SOURCE_TICK+SIX_MILLENNIA_SEAL_INTERVAL;tick<=SIX_MILLENNIA_TERM_TICK;tick+=SIX_MILLENNIA_SEAL_INTERVAL){
  const name=`t${tick}-seal.json`;
  if(!knownNames.has(name)){
    must(option==='--prefix','缺失已声明的完成封存。');
    must(![...knownNames].some(n=>/^t[0-9]+-seal\.json$/u.test(n)),'封存序列空缺：发现更晚封存，不算完整前缀。');
    break;
  }
  const receipt=await physical(mark(name),128*1024),record=json(receipt);
  must(campaignRecord(record)&&shape(record,['lineage','observed'])&&campaignRecord(record.lineage)&&campaignRecord(record.observed),'封存的版本字段不符。');
  const row=record.lineage;
  must(shape(row,['tick','manifestId','payloadSha256','bytes','physicalBytes','filenames','previous','ruleVersion','nextMonthSha256','chainDigest'])&&
    row.tick===tick&&campaignHashValid(row.manifestId)&&campaignHashValid(row.payloadSha256)&&campaignHashValid(row.chainDigest)&&
    campaignHashValid(row.nextMonthSha256)&&campaignInteger(row.bytes,1,ERA_CHECKPOINT_MAX_BYTES)&&campaignInteger(row.physicalBytes,row.bytes)&&
    row.ruleVersion===executionRule&&Array.isArray(row.filenames)&&row.filenames.every((n:unknown)=>typeof n==='string'),
    '封存明细缺失或超限。');
  must(JSON.stringify(loadLink(row.previous))===JSON.stringify(published),'不可拼接其他分支或跳期。');
  const {chainDigest,...core}=row;
  must(await sha(JSON.stringify(core))===chainDigest,'封存摘要不匹配。');
  const year=1001+Math.floor((tick-1)/12),month=(tick-1)%12+1,stem=`t${tick}-era-${year}-${month}-${row.manifestId.slice(0,12)}`;
  const filenames=row.filenames as string[];
  const expectedParts=row.bytes<=8*1024*1024?[`${stem}.json`]:
    Array.from({length:Math.ceil(row.bytes/ERA_CHECKPOINT_PART_BYTES)},(_,i)=>`${stem}-${i+1}.era-part`);
  must(JSON.stringify(filenames)===JSON.stringify([`${stem}.era`,...expectedParts]),'不明的文件或分块顺序。');
  const files=await Promise.all(filenames.map((file,index)=>physical(mark(file),index?ERA_CHECKPOINT_MAX_BYTES:8192)));
  const verified=await verifyEraCheckpoint(asInput(files[0]),files.slice(1).reverse().map(asInput),codec),world=verified.world;
  const info=verified.manifest;
  must(world.tick===tick&&world.year===year&&world.month===month&&info.id===row.manifestId&&info.engineRuleVersion===executionRule&&
    row.bytes===info.payloadBytes&&row.payloadSha256===info.payloadSha256&&await sha(encode(world))===row.payloadSha256&&
    row.physicalBytes===files.reduce((size,file)=>size+file.length,0),'实读原生负载与 seal 不匹配。');
  must(sameGeneratedWorld(root.world,world)&&!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&
    people.every(id=>world.cultivators.some(person=>person.id===id))&&frozenFacts(world)===inherited,
    '母档原井、已付旧债、旧采契、旧运货或人物未被原样继承。');
  const actualCounts=counts(world),summary=record.observed;
  must(summary.registered===actualCounts.registered&&summary.living===actualCounts.living&&summary.lowerResidents===actualCounts.lowerResidents&&
    summary.northPopulation===actualCounts.northPopulation&&summary.furtherExactNativeMonths===tick-SIX_MILLENNIA_SOURCE_TICK&&
    summary.exactNativeMonthsSinceFreight===tick-SIX_MILLENNIA_ROOT_TICK&&summary.regionalAnnualYears===0&&summary.authoredYears===0,
    '人口口径或真实时间范围列与实档不同。');
  const lower=inspectPhysicalAtlas(world).regions.map(r=>r.id);
  must(lower.join(',')==='west,center,east'&&!world.frontier?.visits.length&&!world.upperArrayField?.visits.length,
    '长时线实档地理与独立地域覆盖混算。');
  const next=advanceWorldTick(world,sixMillenniaNativeOrders(world),undefined,'utility');
  must(next.tick===tick+1&&await sha(encode(next))===row.nextMonthSha256,'独立原生一步不能重现已封存的下一月。');
  published={tick,manifestId:row.manifestId,payloadSha256:row.payloadSha256,chainDigest};prefix.push(published);
  totalPhysical+=row.physicalBytes;receiptBytes+=receipt.length;
  lastCounts=actualCounts;lastDate={tick,year,month};
  console.log(JSON.stringify({kind:'audited_seal',...published,bytes:row.bytes,physicalBytes:row.physicalBytes,
    nextMonthSha256:row.nextMonthSha256,exactIndependentNext:true,counts:actualCounts,lower}));
}
const complete=published.tick===SIX_MILLENNIA_TERM_TICK&&knownNames.has('six-millennia-result.json');
if(complete){
  const marker=await physical(mark('six-millennia-result.json'),256*1024),record=json(marker);
  must(campaignRecord(record)&&record.fullMonthlyNative===true&&record.sourceUnchanged===true&&record.checkpointCount===prefix.length&&
    record.furtherExactNativeMonths===SIX_MILLENNIA_TERM_TICK-SIX_MILLENNIA_SOURCE_TICK&&record.exactNativeMonthsSinceFreight===72000&&
    record.physicalBytes===totalPhysical&&JSON.stringify(loadLink(record.terminal))===JSON.stringify(published)&&
    Array.isArray(record.seals)&&record.seals.length===prefix.length&&record.seals.every((row:unknown,index:number)=>
      campaignRecord(row)&&row.chainDigest===prefix[index].chainDigest&&row.manifestId===prefix[index].manifestId&&
      row.payloadSha256===prefix[index].payloadSha256&&row.tick===prefix[index].tick)&&knownNames.size===0,
    '完整结果标记或档案目录未准确闭合。');
  receiptBytes+=marker.length;
}else{
  must(option==='--prefix'&&!knownNames.has('six-millennia-result.json'),'缺少完整完成标记或标记未经终点封存。');
}
const [lastManifest,lastSource]=await Promise.all([physical(sourceStem+'.era',8192),physical(sourceStem+'.json',691834)]);
must(await campaignSHA256(lastManifest)===await campaignSHA256(sourceManifestBytes)&&
  await campaignSHA256(lastSource)===await campaignSHA256(sourcePayload),'旧源的实际文件字节已变化。');
console.log(JSON.stringify({kind:complete?'independent_chain_complete':'independent_prefix_only',node:process.version,platform:process.platform,
  executionRule,historicalRule,verifiedSeals:prefix.length,lastDate,terminal:published,nativeContinuationMonths:published.tick-SIX_MILLENNIA_SOURCE_TICK,
  nativeMonthsSinceOriginalT34:published.tick-SIX_MILLENNIA_ROOT_TICK,strictIndependentNextMonths:prefix.length,
  knownPhysicalBundleBytes:totalPhysical,knownReceiptAndCompletionBytes:receiptBytes,unsealedOrUnreviewedFiles:[...knownNames],
  currentPopulation:lastCounts,sourceBytesUnchanged:true,elapsedMs:Math.round(performance.now()-started),peakRSSKiB:process.resourceUsage().maxRSS}));

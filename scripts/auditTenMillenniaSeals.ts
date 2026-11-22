/** Read-only exact original well lineage and both E4-8/E4-10 physical seal chains; no long rerun. */
import {readFile,stat,join} from './centuryNodeRuntime';
import {sixMillenniaNativeOrders} from './sixMillenniaControls';
import {tenMillenniaNativeOrders} from './tenMillenniaControls';
import {campaignHashValid,campaignInteger,campaignRecord,campaignSHA256} from '../src/engine/campaignMemento';
import {verifyEraCheckpoint,ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_MAX_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,
  ERA_CHECKPOINT_PART_BYTES,type EraInput} from '../src/engine/eraCheckpointEngine';
import {encodeEraWorldSave,decodeEraWorldSave} from '../src/engine/storageEngine';
import {inspectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {findEraEntryCandidate} from '../src/engine/eraEntryCandidates';
import {northWaterAddress} from '../src/engine/waterVeinEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {sameGeneratedWorld} from '../src/engine/worldIdentity';
import type {WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;platform:string;resourceUsage():{maxRSS:number}};
const fs='node:fs/promises';
const {readdir}=await import(fs) as {readdir(directory:string):Promise<string[]>};
const historicalRule='22f5d7d59d73da2bc436d166a467521d7d63bafc43c6282c304fc543b4ed9048';
const rule='09b2223463cc0995a00ebcc1eb7a32c7a6ac9dfc71b71bd0e3545f8ceac23203';
const original={tick:34,bytes:278888,manifestId:'5431af8b7f17bd3c74d5dbdd59a005a5938cb5f905b8f91dd1382973d3381390',
  payloadSha256:'04f059902d6e2edae8cb1e44db27c880636cc64ed8f277baf1c7cba7ee1725c4',
  manifestFileHash:'ac9979b6d92f72f0e9a0b55e89cce805c2a5c27017e44761b2a625a38e3a5aff'};
const middle={tick:36034,bytes:691834,manifestId:'60cdafea55d32da5b8412c268447db7980592d2bc25ee4102ff66808f01929f0',
  payloadSha256:'ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239',
  manifestFileHash:'9dbc48f7c44c7e1d56bd80939dcab796d60be5895ae50982d58b1062c9178eec'};
const inheritedManifestFileHash='21f6361afc3076aaae6bac0b9171dad77aaafa13126a4890802a75c4d939235c';
const inherited={tick:72034,manifestId:'d3bc95bbd9103b6c704dc071b789d216001f9686b3c4f4af90f3eadf15ebb459',
  payloadSha256:'aa9fa4eeeb908c36f10923cfe907e1631abd09d2c08715929edff9b1ce903b17',
  chainDigest:'3117a2bd1270cb9f1137c232710e7c5b06d15645e2d92b6af845343a2a2520b9'};
type Link={tick:number;manifestId:string;payloadSha256:string;chainDigest:string};
type Segment={name:'six'|'ten';directory:string;source:Link;end:number;branchId:string;
  orders:typeof sixMillenniaNativeOrders;allowPrefix:boolean};
const encode=encodeEraWorldSave,codec={encode,decode:decodeEraWorldSave};
const bytes=new TextEncoder(),text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const sha=(value:string)=>campaignSHA256(bytes.encode(value));
const asInput=(raw:Uint8Array):EraInput=>({size:raw.byteLength,arrayBuffer:async()=>Uint8Array.from(raw).buffer});
const json=(raw:Uint8Array):unknown=>JSON.parse(text.decode(raw)) as unknown;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const ownShape=(row:Record<string,unknown>,keys:readonly string[])=>Object.keys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k));
const date=(tick:number)=>({tick,year:1001+Math.floor((tick-1)/12),month:(tick-1)%12+1});
function must(ok:unknown,detail:string):asserts ok{if(!ok)throw Error(detail);}
function link(value:unknown):Link{
  must(campaignRecord(value)&&ownShape(value,['tick','manifestId','payloadSha256','chainDigest'])&&campaignInteger(value.tick,1)&&
    campaignHashValid(value.manifestId)&&campaignHashValid(value.payloadSha256)&&campaignHashValid(value.chainDigest),'封存前链字段不符');
  return {tick:value.tick,manifestId:value.manifestId,payloadSha256:value.payloadSha256,chainDigest:value.chainDigest};
}
async function physical(path:string,max:number){
  const info=await stat(path) as {size:number;isFile():boolean};
  must(info.isFile()&&info.size>=1&&info.size<=max,'实体文件或大小超限：'+path);
  const value=await readFile(path);
  must(value.byteLength===info.size,'文件读取时发生变化：'+path);
  return value;
}
async function readPair(stem:string,expected:typeof original|typeof middle){
  const raw=await physical(stem+'.json',expected.bytes),manifest=await physical(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES);
  const verified=await verifyEraCheckpoint(asInput(manifest),[asInput(raw)],codec);
  const meta=verified.manifest;
  must(meta.engineRuleVersion===historicalRule&&meta.id===expected.manifestId&&meta.payloadSha256===expected.payloadSha256&&
    meta.payloadBytes===expected.bytes&&encode(verified.world)===text.decode(raw)&&
    equal(date(expected.tick),{tick:verified.world.tick,year:verified.world.year,month:verified.world.month}),'不匹配声明的真实前代实体包');
  const manifestFileHash=await campaignSHA256(manifest);
  must(manifestFileHash===expected.manifestFileHash,'原始实体清单并非已封存的确切字节');
  return {world:verified.world,verifyUnchanged:async()=>{
    must(await campaignSHA256(await physical(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES))===manifestFileHash&&
      await campaignSHA256(await physical(stem+'.json',expected.bytes))===expected.payloadSha256,'已签原始源文件发生变化');
  }};
}
const alive=(actor:WorldState['cultivators'][number])=>actor.alive&&actor.hp>0;
const chosenId='elder-danxia-1',wellId='loc-vein-north',villageId='village-loc-vein-north';
function facts(world:WorldState){
  const address=northWaterAddress(world);
  const actor=world.cultivators.find(row=>row.id===chosenId);
  const well=world.villageWorks.projects.find(row=>row.id==='village-work-1');
  const gate=world.coldWaterVein?.openings.find(row=>row.id==='water-gate-8');
  const charter=world.northMiningCharters?.charters.find(row=>row.id==='north-mining-charter-12');
  const freight=world.villageSupply.agreements.find(row=>row.id===charter?.firstPassage?.agreementId);
  must(address?.site.id===wellId&&address.village.id===villageId&&
    terrainTileAt(world,address.site.x,address.site.y)?.id==='tile-12-2'&&actor?.name==='闻春岚'&&
    well?.id===charter?.wellProjectId&&well?.settledTick===5&&well.status==='completed'&&gate?.id===charter?.openingId&&
    gate?.openedTick===8&&gate.completedTick===14&&gate.paidStones===40&&gate.borrowedUnits===9&&
    charter?.firstPassage?.tick===23&&charter.firstPassage.tileId==='tile-13-2'&&
    freight?.id==='village-supply-1'&&freight.closedTick===34&&freight.status==='completed'&&
    equal(freight.legs?.map(leg=>leg.phase),['delivered','delivered']),'原井、原人、旧债、旧采契或两批真运抵不符');
  return {stablePerson:{id:actor.id,name:actor.name},tileId:'tile-12-2',well,gate,charter,freight};
}
const isLowerThree=(world:WorldState)=>{
  const regions=inspectPhysicalAtlas(world).regions;
  must(equal(regions.map(row=>[row.id,row.tileCount]),[['west',135],['center',120],['east',120]])&&
    !world.frontier?.visits.length&&!world.frontier?.residences.length&&!world.upperArrayField?.visits.length&&!world.upperArrayField?.residences.length&&
    !world.upperPassage,'把独立图域验收误计入单条历史');
  return regions.map(r=>r.id);
};
function population(world:WorldState){
  return {registered:world.cultivators.length,living:world.cultivators.filter(alive).length,
    lowerResidents:world.settlements.villages.reduce((sum,row)=>sum+row.population,0),
    northPopulation:world.settlements.villages.find(row=>row.id===villageId)?.population};
}
function suppliedCounts(summary:Record<string,unknown>,p:ReturnType<typeof population>,tick:number,sourceTick:number){
  must(summary.registered===p.registered&&summary.living===p.living&&summary.lowerResidents===p.lowerResidents&&
    summary.northPopulation===p.northPopulation&&summary.furtherExactNativeMonths===tick-sourceTick&&
    summary.exactNativeMonthsSinceFreight===tick-original.tick&&summary.regionalAnnualYears===0&&summary.authoredYears===0,
    '封存统计与原生实档不符：T'+tick);
}
const [earlyStem,middleStem,sixDirectory,tenDirectory,option,...extra]=process.argv.slice(2);
must(__SECT_UTILITY_RULE_VERSION__===rule,'审计内核不同于实际运行规则');
must(earlyStem&&middleStem&&sixDirectory&&tenDirectory&&sixDirectory!==tenDirectory&&[undefined,'--prefix'].includes(option)&&!extra.length,
  '用法：auditTenMillenniaSeals.ts ORIGINAL_T34_STEM ORIGINAL_T36034_STEM E48_SEAL_DIRECTORY E410_SEAL_DIRECTORY [--prefix]');
const start=performance.now();
const early=await readPair(earlyStem,original),later=await readPair(middleStem,middle);
const oldFacts=facts(early.world),roster=new Set(early.world.cultivators.map(row=>row.id));
const checkedWorld=(world:WorldState)=>{
  must(sameGeneratedWorld(early.world,world)&&!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&
    [...roster].every(id=>world.cultivators.some(person=>person.id===id))&&equal(facts(world),oldFacts),'原井母线不符');
  return isLowerThree(world);
};
checkedWorld(later.world);
console.log(JSON.stringify({kind:'inherited_earlier_sources',original:date(original.tick),t36034:date(middle.tick),
  earlierNativeMonths:middle.tick-original.tick,scope:'separately retained earlier original; no second 36k rerun',oldIdentity:oldFacts.stablePerson,
  oldWell:oldFacts.well.id,wellBuilt:oldFacts.well.settledTick,paidOpening:oldFacts.gate.id,paidDebtClosed:oldFacts.gate.completedTick,
  charter:oldFacts.charter.id,bypass:oldFacts.charter.firstPassage?.tick,realFreight:oldFacts.freight.id,freightClosed:oldFacts.freight.closedTick,
  sameAsOriginalHashes:[original.payloadSha256,middle.payloadSha256]}));
async function auditSegment(segment:Segment){
  const {source,directory,end,allowPrefix}=segment;
  let head=source,current:WorldState|undefined,terminalFiles:{manifest:string;raw:string[];hashes:string[]}|undefined;
  let physicalBytes=0,nativeBytes=0,receiptsBytes=0,Tplus='';
  const committed:Link[]=[],unused=new Set(await readdir(directory));
  const consume=(name:string)=>{
    must(unused.delete(name),'文件不存在或重复引用：'+name);
    return join(directory,name);
  };
  for(let tick=source.tick+1200;tick<=end;tick+=1200){
    const name='t'+tick+'-seal.json';
    if(!unused.has(name)){
      must(allowPrefix&&![...unused].some(file=>/^t[0-9]+-seal\.json$/u.test(file)),'封存有缺项，不能视为完整连续前缀');
      break;
    }
    const receipt=await physical(consume(name),128*1024),record=json(receipt);
    must(campaignRecord(record)&&ownShape(record,['lineage','observed'])&&campaignRecord(record.lineage)&&campaignRecord(record.observed),'封存记录结构不符：T'+tick);
    const row=record.lineage;
    must(ownShape(row,['tick','manifestId','payloadSha256','bytes','physicalBytes','filenames','previous','ruleVersion','nextMonthSha256','chainDigest'])&&
      row.tick===tick&&campaignHashValid(row.manifestId)&&campaignHashValid(row.payloadSha256)&&campaignHashValid(row.chainDigest)&&
      campaignHashValid(row.nextMonthSha256)&&campaignInteger(row.bytes,1,ERA_CHECKPOINT_MAX_BYTES)&&campaignInteger(row.physicalBytes,row.bytes)&&
      row.ruleVersion===rule&&equal(link(row.previous),head),'封存规则、顺序或父链不符：T'+tick);
    const {chainDigest,...core}=row;
    must(await sha(JSON.stringify(core))===chainDigest,'封存摘要不符：T'+tick);
    const expected=date(tick),base='t'+tick+'-era-'+expected.year+'-'+expected.month+'-'+row.manifestId.slice(0,12);
    const partNames=row.bytes<=ERA_CHECKPOINT_NATIVE_JSON_BYTES?[base+'.json']:Array.from(
      {length:Math.ceil(row.bytes/ERA_CHECKPOINT_PART_BYTES)},(_,i)=>base+'-'+(i+1)+'.era-part');
    const names=[base+'.era',...partNames];
    must(equal(row.filenames,names),'实体文件名或分件顺序不符：T'+tick);
    const paths=names.map(consume);
    const files=await Promise.all(paths.map((path,i)=>physical(path,i?ERA_CHECKPOINT_NATIVE_JSON_BYTES:ERA_CHECKPOINT_MANIFEST_BYTES)));
    const verified=await verifyEraCheckpoint(asInput(files[0]),files.slice(1).reverse().map(asInput),codec),w=verified.world,meta=verified.manifest;
    const raw=encode(w);
    must(equal({tick:w.tick,year:w.year,month:w.month},expected)&&meta.id===row.manifestId&&meta.engineRuleVersion===rule&&
      meta.source.branchId===segment.branchId&&meta.payloadSha256===row.payloadSha256&&meta.payloadBytes===row.bytes&&
      files.reduce((sum,file)=>sum+file.byteLength,0)===row.physicalBytes&&await sha(raw)===row.payloadSha256&&
      (files.length!==2||row.bytes>ERA_CHECKPOINT_NATIVE_JSON_BYTES||raw===text.decode(files[1])),'严格物理重读不相等：T'+tick);
    const lower=checkedWorld(w);
    suppliedCounts(record.observed,population(w),tick,source.tick);
    const next=advanceWorldTick(w,segment.orders(w),undefined,'utility');
    must(next.tick===tick+1&&await sha(encode(next))===row.nextMonthSha256,'独立 T+1 原生下一月不符：T'+tick);
    head={tick,manifestId:row.manifestId,payloadSha256:row.payloadSha256,chainDigest}; current=w;Tplus=row.nextMonthSha256;
    physicalBytes+=row.physicalBytes;nativeBytes+=row.bytes;receiptsBytes+=receipt.byteLength;committed.push(head);
    terminalFiles={manifest:paths[0],raw:paths.slice(1),hashes:await Promise.all(files.map(file=>campaignSHA256(file)))};
    console.log(JSON.stringify({kind:'physical_seal',segment:segment.name,...head,at:expected,bytes:row.bytes,
      physicalBytes:row.physicalBytes,nextMonthSha256:Tplus,actualIndependentReplay:true,lower,population:population(w)}));
  }
  const marker=segment.name+'-millennia-result.json',complete=head.tick===end&&unused.has(marker);
  if(complete){
    const raw=await physical(consume(marker),256*1024),result=json(raw);
    must(campaignRecord(result)&&result.fullMonthlyNative===true&&result.sourceUnchanged===true&&result.checkpointCount===committed.length&&
      result.physicalBytes===physicalBytes&&equal(link(result.terminal),head)&&
      (segment.name!=='ten'||(equal(link(result.source),source)&&result.sourceRule===rule&&
        equal(result.physicalSourceHashes,[inheritedManifestFileHash,inherited.payloadSha256])))&&Array.isArray(result.seals)&&
      result.seals.length===committed.length&&result.seals.every((seal:unknown,i:number)=>campaignRecord(seal)&&
        equal({tick:seal.tick,manifestId:seal.manifestId,payloadSha256:seal.payloadSha256,chainDigest:seal.chainDigest},committed[i]))&&
      unused.size===0&&current,'完成标识不闭合或存在未经复核的文件');
    suppliedCounts(result,population(current),end,source.tick);
    receiptsBytes+=raw.byteLength;
  }else must(allowPrefix&&!unused.has(marker),'结尾封存或有效完成标识不全');
  return {head,current,terminalFiles,Tplus,complete,verifiedSeals:committed.length,physicalBytes,nativeBytes,receiptsBytes,unclaimed:[...unused]};
}
const startLink={tick:middle.tick,manifestId:middle.manifestId,payloadSha256:middle.payloadSha256,
  chainDigest:await sha(JSON.stringify({sourceRule:historicalRule,tick:middle.tick,manifestId:middle.manifestId,payloadSha256:middle.payloadSha256}))};
const six=await auditSegment({name:'six',directory:sixDirectory,source:startLink,end:inherited.tick,branchId:'e48-native-continued-from-e39',
  orders:sixMillenniaNativeOrders,allowPrefix:false});
must(equal(six.head,inherited)&&six.terminalFiles&&six.current&&
  equal(six.terminalFiles.hashes,[inheritedManifestFileHash,inherited.payloadSha256]),'六千年材料并非原证实母线末端');
const boundaryNext=advanceWorldTick(six.current,tenMillenniaNativeOrders(six.current),undefined,'utility');
must(boundaryNext.tick===inherited.tick+1&&await sha(encode(boundaryNext))===six.Tplus,'两段封存的控制策略在真实接缝下一月不相同');
const ten=await auditSegment({name:'ten',directory:tenDirectory,source:six.head,end:120034,branchId:'e410-native-continued-from-e48',
  orders:tenMillenniaNativeOrders,allowPrefix:option==='--prefix'});
await early.verifyUnchanged();await later.verifyUnchanged();
const inheritedFiles=[six.terminalFiles.manifest,...six.terminalFiles.raw];
must(equal(await Promise.all(inheritedFiles.map(async(path,i)=>campaignSHA256(await physical(path,
  i?ERA_CHECKPOINT_NATIVE_JSON_BYTES:ERA_CHECKPOINT_MANIFEST_BYTES)))),six.terminalFiles.hashes),'万年续跑的六千年原封包字节发生变化');
const last=ten.current??six.current;
const steward=last.cultivators.find(a=>a.id===chosenId&&alive(a)&&a.positionPlane===undefined&&a.locationId===wellId);
const candidate=steward&&findEraEntryCandidate(last,wellId,steward.id,steward.id);
must(!ten.complete||steward&&candidate?.actorId===steward.id&&candidate.origin.kind==='founder'&&candidate.decision.kind==='rest_or_cultivate',
  '万年终点没有已证原人可入场；不接受重造、迁位或同名替代');
const summarize=({head,Tplus,verifiedSeals,physicalBytes,nativeBytes,receiptsBytes,unclaimed}:typeof six)=>
  ({head,Tplus,verifiedSeals,physicalBytes,nativeBytes,receiptsBytes,unclaimed});
console.log(JSON.stringify({kind:ten.complete?'independent_ten_millennia_complete':'independent_ten_millennia_prefix',rule,historicalRule,
  execution:{node:process.version,platform:process.platform,elapsedMs:Math.round(performance.now()-start),peakRSSKiB:process.resourceUsage().maxRSS},
  lastDate:date(last.tick),nativeMonthsSinceOriginalT34:last.tick-original.tick,originalBeforeSixSealMonths:middle.tick-original.tick,
  sixSubsequentNativeMonths:six.head.tick-middle.tick,tenAdditionalNativeMonths:ten.head.tick-six.head.tick,
  independentPhysicalCheckpoints:six.verifiedSeals+ten.verifiedSeals,independentOneMonthReplays:six.verifiedSeals+ten.verifiedSeals,
  sameHandoffT72035:six.Tplus,
  firstSegment:summarize(six),terminalSegment:summarize(ten),untouchedOriginalT34T36034T72034PhysicalSources:true,actualPopulation:population(last),
  geography:{sameTimelineActiveDomains:isLowerThree(last),otherSixDomainsRequireSeparateEvidence:true,notClaimedCoResident:true},
  livingActualOriginal:steward&&{id:steward.id,name:steward.name,age:steward.age,lifespan:steward.lifespan,locationId:steward.locationId,
    sectId:steward.sectId,rank:steward.sectRank,wallet:steward.spiritStones,eligibleInActualTerminal:!!candidate}}));

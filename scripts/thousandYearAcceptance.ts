import { arch,cpus,join,mkdir,open,platform,readFile,release } from './centuryNodeRuntime';
import { prepareNorthWellHistoricalSource } from '../tests/fixtures/northWellHistoricalNativeFixture';
import { campaignHashValid,campaignSHA256 } from '../src/engine/campaignMemento';
import { prepareEraCheckpoint,verifyEraCheckpoint } from '../src/engine/eraCheckpointEngine';
import { projectEraEntryCandidates } from '../src/engine/eraEntryCandidates';
import { possessAvatar,queueAvatarWaterVein } from '../src/engine/avatarEngine';
import { projectNorthMiningCharters } from '../src/engine/northMiningCharterEngine';
import { NORTH_MINING_SITE,NORTH_MINING_SETTLEMENT } from '../src/engine/northMiningCharterTerms';
import { availableWaterVeinActions } from '../src/engine/waterVeinEngine';
import { createTimeline } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { decodeEraWorldSave,encodeEraWorldSave,worldSaveByteCount } from '../src/engine/storageEngine';
import type { Cultivator,LLMDecisionPayload,WorldState } from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;exitCode?:number;resourceUsage():{maxRSS:number}};
export type ThousandChainLink={tick:number;manifestId:string;sha256:string;chainDigest:string};
export type ThousandChainCore=Omit<ThousandChainLink,'chainDigest'>&{
  bytes:number;previous?:ThousandChainLink;ruleVersion:string;kind:'lineage'|'detached_action';
};
export type ThousandCompletion={
  status:'complete';ruleVersion:string;initial:ThousandChainLink;final:ThousandChainLink;months:12000;
  nativeNextSha:string;sourceUnchanged:true;lineagePhysicalBytes:number;detached?:ThousandChainLink;
};
function invariant(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
const [dir,expected,...more]=process.argv.slice(2);
const ruleVersion=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
invariant(!!dir&&!more.length,'用法：vite-node scripts/thousandYearAcceptance.ts <new-output-dir> [expected-build-sha]');
invariant(campaignHashValid(ruleVersion),'当前构建规则指纹不可用。');
invariant(expected===undefined||campaignHashValid(expected)&&expected===ruleVersion,'指定规则指纹与当前构建不符；未创建输出目录。');
await mkdir(dir,{recursive:false}); // Exclusive: refuse every existing target, even empty/symlink.
const started=performance.now();
const sourceTick=34,endTick=12034,interval=1200 as const;
const mainActor='elder-danxia-1',backup='npc-2';
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const encoder=new TextEncoder();
const hash=(text:string)=>campaignSHA256(encoder.encode(text));
const report=(label:string,detail:unknown)=>console.log(JSON.stringify({label,detail,ruleVersion,
  elapsedMs:Math.round(performance.now()-started),peakRSSKiB:process.resourceUsage().maxRSS}));
const ids=(w:WorldState)=>new Set(w.cultivators.map(row=>row.id));
const live=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const isLocal=(actor:Cultivator)=>live(actor)&&actor.locationId===NORTH_MINING_SITE&&actor.positionPlane===undefined;
const person=(w:WorldState,id:string)=>w.cultivators.find(row=>row.id===id);
const requested={CULTIVATE:0,BREAKTHROUGH:0};
function orders(w:WorldState,allowPractice:boolean):Record<string,LLMDecisionPayload>{
  const target=allowPractice&&w.tick>=3634
    ?w.cultivators.find(a=>a.id===mainActor&&isLocal(a))??w.cultivators.find(a=>a.id===backup&&isLocal(a)):undefined;
  const yearsToGo=Math.ceil((endTick-w.tick)/12)+1;
  return Object.fromEntries(w.cultivators.filter(live).map(a=>{
    const chosenAction=a!==target||a.age+yearsToGo<a.lifespan||a.hp<a.maxHp*.9?'REST':
      a.qiProgress>=90?'BREAKTHROUGH':'CULTIVATE';
    if(chosenAction!=='REST')requested[chosenAction]++;
    return [a.id,{chosenAction,innerMonologue:'千年隔离验收有记录的原生指令'} satisfies LLMDecisionPayload];
  }));
}
function stats(w:WorldState){
  const north=w.settlements.villages.find(row=>row.id===NORTH_MINING_SETTLEMENT);
  const growth=w.villageEvolution.villages.find(row=>row.settlementId===NORTH_MINING_SETTLEMENT);
  return {date:[w.year,w.month,w.tick],registered:w.cultivators.length,living:w.cultivators.filter(live).length,
    mortalResidents:w.settlements.villages.reduce((n,row)=>n+row.population,0),northPopulation:north?.population,
    northStage:growth?.status,firstNorthGrowthTick:growth?.changes[0]?.tick,regionalApproximation:!!w.regionalSimulation,
    upperPresent:!!w.upperPassage,stewards:[mainActor,backup].map(id=>{
      const a=person(w,id);return a&&{id,age:a.age,lifespan:a.lifespan,realm:a.realm,alive:live(a),at:a.locationId};})};
}
async function syncDir(){const fd=await open(dir,'r');try{await fd.sync();}finally{await fd.close();}}
async function exclusiveWrite(name:string,data:Uint8Array|string){
  const fd=await open(join(dir,name),'wx');try{await fd.writeFile(data);await fd.sync();}finally{await fd.close();}
}
const portableInput=async(name:string)=>{
  const data=await readFile(join(dir,name));
  return {size:data.byteLength,arrayBuffer:async()=>Uint8Array.from(data).buffer};
};
let prior:ThousandChainLink|undefined,first:ThousandChainLink|undefined,lineagePhysicalBytes=0;
async function seal(world:WorldState,kind:ThousandChainCore['kind']){
  const base=prior;
  invariant(kind==='detached_action'?base?.tick===endTick&&world.tick===endTick+1:
    base?world.tick-base.tick===interval:world.tick===sourceTick,'验收节点与实算月份不连续。');
  const pack=await prepareEraCheckpoint(world,{branchId:kind==='lineage'?'e38-thousand-isolated':'e38-detached-action',
    label:'Detached native benchmark'},codec,{engineRuleVersion:ruleVersion!});
  const prefix=`t${world.tick}-`,files=[pack.manifestFile,...pack.parts];
  for(const file of files)await exclusiveWrite(prefix+file.name,file.bytes);
  await syncDir();
  const verified=await verifyEraCheckpoint(await portableInput(prefix+pack.manifestFile.name),
    await Promise.all([...pack.parts].reverse().map(file=>portableInput(prefix+file.name))),codec);
  const native=encodeEraWorldSave(world);
  invariant(encodeEraWorldSave(verified.world)===native&&await hash(native)===pack.manifest.payloadSha256,'存读字节不一致。');
  const core:ThousandChainCore={tick:world.tick,manifestId:pack.manifest.id,sha256:pack.manifest.payloadSha256,
    bytes:pack.manifest.payloadBytes,previous:base,ruleVersion:ruleVersion!,kind};
  const link:ThousandChainLink={tick:core.tick,manifestId:core.manifestId,sha256:core.sha256,chainDigest:await hash(JSON.stringify(core))};
  const physicalBytes=files.reduce((n,file)=>n+file.bytes.byteLength,0);
  const entry={...core,chainDigest:link.chainDigest,physicalBytes};
  await exclusiveWrite(`t${world.tick}-chain.json`,JSON.stringify(entry));
  await syncDir();
  if(kind==='lineage'){
    first??=link;prior=link;lineagePhysicalBytes+=physicalBytes;
  }
  report('sealed',{...entry,...stats(world)});
  return {world:verified.world,link};
}

let world:WorldState|undefined;
try{
  report('environment',{node:process.version,platform:platform(),kernel:release(),arch:arch(),cpu:cpus()[0]?.model,
    timingScope:'Node on this host; not browser or handset',seed:1,profile:'spirit-bloom',policy:'native REST with documented original steward practice after T3634; no roster or clock edits'});
  const source=prepareNorthWellHistoricalSource();
  world=source.world;
  const original=createTimeline(world),snapshot=original.branches[0].snapshots[0].world;
  const originalBytes=encodeEraWorldSave(snapshot),baseline=world.northMiningCharters?.charters.find(row=>row.id===source.charterId);
  invariant(baseline?.firstPassage&&baseline.wellProjectId,'没有真实北井凭据。');
  const sourceIds=ids(snapshot);
  world=(await seal(world,'lineage')).world;
  while(world.tick<endTick){
    const prev:WorldState=world;
    world=advanceWorldTick(prev,orders(prev,true),undefined,'utility');
    invariant(world.tick===prev.tick+1&&world.cultivators.length>=prev.cultivators.length&&
      world.year===1001+Math.floor((world.tick-1)/12)&&world.month===(world.tick-1)%12+1,'原生月份或名册连续性不符。');
    if((world.tick-sourceTick)%interval===0){
      const currentIds=ids(world);
      invariant(currentIds.size===world.cultivators.length&&[...sourceIds].every(id=>currentIds.has(id)),'有原始身份遗失。');
      world=(await seal(world,'lineage')).world;
    }
  }
  const originalCharter=world.northMiningCharters?.charters.find(row=>row.id===baseline.id);
  const well=world.villageWorks.projects.find(row=>row.id===baseline.wellProjectId);
  const freight=world.villageSupply.agreements.find(row=>row.id===baseline.firstPassage!.agreementId);
  const tile=world.terrain.tiles.find(row=>row.id===baseline.firstPassage!.tileId);
  invariant(well&&freight?.status==='completed'&&tile&&JSON.stringify(originalCharter)===JSON.stringify(baseline)&&
    original.branches.length===1&&encodeEraWorldSave(snapshot)===originalBytes,'旧井、旧契、真通行或独立原线未能核实。');
  const current=world.cultivators.find(a=>a.id===mainActor&&isLocal(a))??world.cultivators.find(isLocal);
  const host=current&&projectEraEntryCandidates(world,NORTH_MINING_SITE,current.id).find(row=>row.actorId===current.id);
  report('thousand_complete',{...stats(world),months:endTick-sourceTick,nativeBytes:worldSaveByteCount(world),requested,
    well:well.id,charter:baseline.id,pass:baseline.firstPassage,freight:{id:freight.id,closedTick:freight.closedTick},
    host,actualLocalProof:projectNorthMiningCharters(world,current),lineagePhysicalBytes});
  const restored=decodeEraWorldSave(encodeEraWorldSave(world));
  const next=advanceWorldTick(world,orders(world,false),undefined,'utility');
  invariant(encodeEraWorldSave(next)===encodeEraWorldSave(advanceWorldTick(restored,orders(restored,false),undefined,'utility')),
    '读回的原生下一月不相同。');
  const nativeNextSha=await hash(encodeEraWorldSave(next));
  const option=current&&availableWaterVeinActions(current,world,world.tick+1).find(row=>row.waterVeinMove==='observe');
  let detached:ThousandChainLink|undefined;
  if(current&&option&&host?.decision.kind==='rest_or_cultivate'){
    invariant(possessAvatar(restored,current.id)&&queueAvatarWaterVein(restored,current.id,option),'当世人未能实际入世或勘井。');
    const wallet=person(restored,current.id)?.spiritStones;
    const playable=advanceWorldTick(restored,orders(restored,false),undefined,'utility');
    const reading=playable.coldWaterVein?.observations.find(row=>row.tick===playable.tick&&row.actorId===current.id);
    invariant(wallet!==undefined&&reading&&person(playable,current.id)?.spiritStones===wallet-2,'付费勘井未真实结算。');
    detached=(await seal(playable,'detached_action')).link;
    report('native_local_read_after_reread',reading);
  }else report('no_current_local_action',{host});
  invariant(first&&prior,'没有完整摘要链。');
  const completion:ThousandCompletion={status:'complete',ruleVersion,initial:first,final:prior,months:12000,nativeNextSha,
    sourceUnchanged:true,lineagePhysicalBytes,...(detached?{detached}:{})};
  await exclusiveWrite('complete.json',JSON.stringify(completion));await syncDir();
  report('accepted',completion);
}catch(error){
  report('actual_blocker',{error:String(error),tick:world?.tick,bytes:world&&worldSaveByteCount(world),lastFullyVerified:prior});
  process.exitCode=1;
}

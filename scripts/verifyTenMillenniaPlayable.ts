import {activeAvatar,AVATAR_ORDER_COST,AVATAR_POSSESSION_COST,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {findEraEntryCandidate} from '../src/engine/eraEntryCandidates';
import {prepareEraCheckpoint,verifyEraCheckpoint,ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,type EraInput} from '../src/engine/eraCheckpointEngine';
import {projectNorthMiningCharters} from '../src/engine/northMiningCharterEngine';
import {findNorthGateRenewalSource} from '../src/engine/northGateRenewalTerms';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimelineAvatarEntry,readTimelineHead,recordTimelineWorld} from '../src/engine/timelineEngine';
import {availableWaterVeinActions,completedNorthWaterWell,northWaterAddress,projectWaterVein} from '../src/engine/waterVeinEngine';
import {WATER_VEIN_SITE,WATER_VEIN_SURVEY_STONES} from '../src/engine/waterVeinTerms';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {join,mkdir,open,readFile,stat} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const node='node:process',crypto='node:crypto';
const proc=(await import(node) as {default:{argv:string[];version:string}}).default;
const {webcrypto}=await import(crypto) as {webcrypto:Crypto};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const [out,stem,expectedSha,...extra]=proc.argv.slice(2);
function check(result:unknown,why:string):asserts result{if(!result)throw new Error(why);}
check(out&&stem&&expectedSha&&/^[a-f0-9]{64}$/.test(expectedSha)&&!/\.(json|era)$/.test(stem)&&!extra.length,
  'Usage: vite-node scripts/verifyTenMillenniaPlayable.ts <new-dir> <verified T120034 archive stem> <terminal SHA-256 from independent E410 continuation audit>');
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
async function file(path:string,maximum:number){
  const info=await stat(path) as {isFile():boolean;size:number};
  check(info.isFile()&&info.size>0&&info.size<=maximum,'Invalid physical input length '+path);
  const bytes=await readFile(path);check(bytes.length===info.size,'Input changed while reading '+path);
  return bytes;
}
const pair=(base:string)=>Promise.all([file(base+'.era',ERA_CHECKPOINT_MANIFEST_BYTES),file(base+'.json',ERA_CHECKPOINT_NATIVE_JSON_BYTES)]);
const input=(bytes:Uint8Array):EraInput=>({size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
const verify=(files:Uint8Array[])=>verifyEraCheckpoint(input(files[0]),files.slice(1).map(input),codec);
const original=await pair(stem);
const verified=await verify(original),{world,manifest}=verified;
const unchanged=encodeEraWorldSave(world);
check(manifest.payloadSha256===expectedSha&&manifest.engineRuleVersion===__SECT_UTILITY_RULE_VERSION__&&
  manifest.source.branchId==='e410-native-continued-from-e48'&&world.tick===120034&&world.year===11003&&world.month===10&&
  world.random.seed===1&&world.worldgen?.profileId==='spirit-bloom'&&!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&
  unchanged===new TextDecoder('utf-8',{fatal:true}).decode(original[1]),'Incorrect terminal proof, chronology, current rules or normalization');
const id='elder-danxia-1',site=WATER_VEIN_SITE;
const person=(state:WorldState)=>state.cultivators.find(row=>row.id===id);
const body=person(world),address=northWaterAddress(world),lineage=findNorthGateRenewalSource(world);
const well=address&&completedNorthWaterWell(world,address.village.id);
const gate=world.coldWaterVein?.openings.find(row=>row.id===lineage?.openingId);
check(address&&well?.id==='village-work-1'&&well.settledTick===5&&lineage?.siteId===site&&lineage.wellProjectId===well.id&&
  lineage.openingId==='water-gate-8'&&gate?.completedTick===14&&gate.borrowedUnits===9&&
  lineage.passageTileId==='tile-13-2'&&lineage.passageTick===23&&lineage.freightClosedTick===34&&
  world.northGateRenewal?.hearing.outcome?.kind==='failed','Missing original settled well/debt/charter/freight chronology');
const active=projectWaterVein(world,body),charters=projectNorthMiningCharters(world,body);
check(body?.alive&&body.hp>0&&body.name==='闻春岚'&&body.locationId===site&&body.positionPlane===undefined&&
  active?.scope==='local'&&active.siteId===site&&charters?.scope==='local'&&
  charters.rows.some(row=>row.id===lineage.charterId&&row.hasVerifiedPassage)&&!projectWaterVein(world,{...body})&&
  !projectNorthMiningCharters(world,{...body}),'Original body or authorized local history unavailable');
const timeline=createTimeline(world),parent=timeline.branches[0],frame=parent.snapshots[0];
const candidate=findEraEntryCandidate(frame.world,site,id,id);
check(candidate?.origin.kind==='founder'&&candidate.decision.kind==='rest_or_cultivate','Original eligible founder not present at this exact snapshot');
const spawned=forkTimelineAvatarEntry(timeline,parent.id,frame.tick,frame,{siteId:site,viewerId:id,actorId:candidate.actorId},'万年之后：北井亲勘');
const child=spawned.activeBranchId,entrant=readTimelineHead(spawned,child);
check(entrant&&child!==parent.id&&activeAvatar(entrant)?.id===id&&entrant.tick===frame.tick&&
  entrant.playerAvatar.essence===world.playerAvatar.essence-AVATAR_POSSESSION_COST,'Wrong exact incarnation or entry fee');
const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'只守此刻原地，无另行预约。'};
const step=(state:WorldState)=>advanceWorldTick(state,Object.fromEntries(state.cultivators.filter(row=>row.alive&&row.hp>0)
  .map(row=>[row.id,idle])),undefined,'utility');
const passive=step(entrant),before=person(entrant);
check(before,'Entrant disappeared');
const quotes=availableWaterVeinActions(before,entrant,entrant.tick+1);
const quote=quotes.find(row=>row.waterVeinMove==='observe'&&row.targetLocationId===site);
check(quote&&!quotes.some(row=>row.waterVeinMove==='open')&&queueAvatarWaterVein(entrant,id,quote)&&entrant.tick===120034&&
  entrant.playerAvatar.pendingOrder?.actorId===id&&entrant.playerAvatar.essence===world.playerAvatar.essence-AVATAR_POSSESSION_COST-AVATAR_ORDER_COST&&
  before.spiritStones===body.spiritStones&&JSON.stringify(entrant.coldWaterVein)===JSON.stringify(world.coldWaterVein),
  'Wrong queue price or premature action');
const surveyed=step(entrant),paid=person(surveyed),control=person(passive);
const receipt=surveyed.coldWaterVein?.observations.find(row=>row.actorId===id&&row.tick===surveyed.tick);
const rows=surveyed.resourceFlow.months.find(row=>row.tick===surveyed.tick)?.entries.filter(row=>row.refId===receipt?.id)??[];
const fee=rows[0];
check(surveyed.tick===120035&&surveyed.year===11003&&surveyed.month===11&&surveyed.tick===passive.tick&&
  paid?.locationId===site&&paid.currentAction==='WATER_VEIN'&&paid.positionPlane===undefined&&control&&activeAvatar(surveyed)?.id===id&&
  !surveyed.playerAvatar.pendingOrder&&receipt?.paidStones===WATER_VEIN_SURVEY_STONES&&receipt.wellDepth===24&&
  surveyed.events.some(row=>row.id===`evt-${receipt.id}`&&row.locationId===site&&row.actorIds.length===1&&row.actorIds[0]===id)&&
  rows.length===1&&fee.kind==='consumption'&&fee.mechanism==='water_vein'&&fee.reason==='north_well_measured'&&fee.good==='stone'&&
  fee.from.kind==='actor'&&fee.from.id===id&&fee.amount===WATER_VEIN_SURVEY_STONES&&control.spiritStones-paid.spiritStones===fee.amount&&
  JSON.stringify(surveyed.coldWaterVein?.openings)===JSON.stringify(passive.coldWaterVein?.openings)&&
  JSON.stringify(surveyed.northGateRenewal)===JSON.stringify(passive.northGateRenewal),
  'No real same-body timed survey/debit, or action changed the prior debt');
const progressed=recordTimelineWorld(spawned,surveyed,child);
check(progressed.branches[0]===parent&&readTimelineHead(progressed,child)?.tick===120035&&
  encodeEraWorldSave(readTimelineHead(progressed,parent.id)!)===unchanged,'Parent branch changed');
const packages=[];
for(const [label,frameWorld] of [['queued',entrant],['surveyed',surveyed]] as const){
  const packed=await prepareEraCheckpoint(frameWorld,{branchId:child,timelineId:'e410-terminal-native-player',label},codec,
    {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  check(packed.parts.length===1,'Unexpected physical branch bounds');
  packages.push({label,frameWorld,packed});
}
await mkdir(out,{recursive:false});
const results=[];
for(const {label,frameWorld,packed} of packages){
  const dir=join(out,label);await mkdir(dir,{recursive:false});
  const payload=[packed.manifestFile,...packed.parts];
  for(const value of payload){const handle=await open(join(dir,value.name),'wx');try{await handle.writeFile(value.bytes);await handle.sync();}finally{await handle.close();}}
  const disk=await verify(await Promise.all(payload.map((value,i)=>file(join(dir,value.name),i===0?ERA_CHECKPOINT_MANIFEST_BYTES:ERA_CHECKPOINT_NATIVE_JSON_BYTES))));
  check(disk.manifest.id===packed.manifest.id&&encodeEraWorldSave(disk.world)===encodeEraWorldSave(frameWorld)&&
    encodeEraWorldSave(step(disk.world))===encodeEraWorldSave(step(frameWorld)),'Strict physical read/next native month differs: '+label);
  results.push({label,tick:disk.world.tick,sha:disk.manifest.payloadSha256,nativeBytes:disk.manifest.payloadBytes,
    physicalBytes:payload.reduce((sum,part)=>sum+part.bytes.length,0),strictRead:true,nextSameNativeBytes:true});
}
const after=await pair(stem);
check(original.every((bytes,i)=>bytes.length===after[i].length&&bytes.every((byte,j)=>byte===after[i][j])),'Original archive changed');
console.log(JSON.stringify({
  kind:'terminal_payable_branch',scope:'headless native Utility, same-age controlled REST; no browser or mobile test',
  node:proc.version,rule:__SECT_UTILITY_RULE_VERSION__,terminalSha:manifest.payloadSha256,terminalTick:world.tick,sourceUnchanged:true,
  parentBranch:parent.id,playerBranch:child,portrait:{id,name:body.name,age:body.age,realm:body.realm,stage:body.realmStage,place:active.siteName,
    origin: candidate.origin},localInstitution:lineage,wellDepth:receipt.wellDepth,actionTick:surveyed.tick,
  possessionEssence:AVATAR_POSSESSION_COST,queuedEssence:AVATAR_ORDER_COST,personalStonesBefore:body.spiritStones,
  sameAgeIdleStones:control.spiritStones,paidStones:fee.amount,personalStonesAfter:paid.spiritStones,receipt:receipt.id,
  oldDebtRepaidByAction:false,debtUnchangedFromControl:true,results,
}));

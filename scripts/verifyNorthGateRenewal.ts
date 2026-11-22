import type {LLMDecisionPayload, WorldState} from '../src/types/world';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { availableNorthGateRenewalActions, advanceNorthGateRenewal, projectNorthGateRenewal,
  resolveNorthGateRenewalAction } from '../src/engine/northGateRenewalEngine';
import type { NorthGateRenewalMove } from '../src/engine/northGateRenewalTerms';
import { availableWaterVeinActions, openRenewedNorthWaterGate, projectWaterVein } from '../src/engine/waterVeinEngine';
import { WATER_VEIN_RENEWAL_FUNDING, WATER_VEIN_SITE, waterVeinPhase, waterVeinSymptomEventId } from '../src/engine/waterVeinTerms';
import { availableUpperPassageActions, projectUpperPassage } from '../src/engine/upperPassageEngine';
import type { UpperPassageMove } from '../src/engine/upperPassageTerms';
import { granaryAt, validVillageGranaryBook } from '../src/engine/villageGranaryEngine';
import { findNorthGateRenewalSource } from '../src/engine/northGateRenewalTerms';
import { ERA_CHECKPOINT_MANIFEST_BYTES, ERA_CHECKPOINT_NATIVE_JSON_BYTES, prepareEraCheckpoint, verifyEraCheckpoint,
  type EraInput } from '../src/engine/eraCheckpointEngine';
import {readFile,stat,open,join} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
type Proc={argv:string[];version:string;resourceUsage():{maxRSS:number}};
const processModule='node:process',filesModule='node:fs/promises',cryptoModule='node:crypto';
const proc=(await import(processModule) as {default:Proc}).default;
const {mkdir}=await import(filesModule) as {mkdir(path:string):Promise<unknown>};
const {webcrypto}=await import(cryptoModule) as {webcrypto:Crypto};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
function check(value:unknown,label:string):asserts value{if(!value)throw new Error(label);}
const start=performance.now();
const [stem,out,...extra]=proc.argv.slice(2);
check(stem&&out&&extra.length===0&&!stem.endsWith('.era')&&!stem.endsWith('.json'),
  'Usage: vite-node scripts/verifyNorthGateRenewal.ts <native paired checkpoint stem, no .era/.json suffix> <new output directory>');
const input=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function bounded(path:string,ceiling:number){
  const info=await stat(path);
  check(info.size>0&&info.size<=ceiling,'Source file size rejected: '+path);
  const bytes=await readFile(path);
  check(bytes.byteLength===info.size,'Source file length changed: '+path);
  return bytes;
}
const inputPair=async()=>Promise.all([bounded(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES),
  bounded(stem+'.json',ERA_CHECKPOINT_NATIVE_JSON_BYTES)]);
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const pair=await inputPair();
const base=await verifyEraCheckpoint(input(pair[0]),[input(pair[1])],codec);
const detached=base.world;
const originText=new TextDecoder('utf-8',{fatal:true}).decode(pair[1]);
check(originText===encodeEraWorldSave(detached),'Source does not round trip byte-for-byte');
check(detached.tick===36034&&detached.year===4003&&detached.month===10&&detached.random.seed===1,
  'This proof requires genuine seed-1 native T36034 (4003/10) input');
check(!detached.regionalSimulation&&!detached.authoredEraOrigin,'Expected natural, non-regional source');
const source=findNorthGateRenewalSource(detached);
check(source?.freightClosedTick===34&&source.openingId==='water-gate-8'&&source.wellProjectId==='village-work-1'&&
  source.charterId==='north-mining-charter-12'&&source.passageTick===23,'Exact native freight/well/charter chain missing');
const sourceCultivator=detached.cultivators.find(row=>row.id==='elder-danxia-1');
check(sourceCultivator?.alive&&sourceCultivator.name==='闻春岚'&&sourceCultivator.age===3167&&
  sourceCultivator.lifespan===5000&&sourceCultivator.realm==='炼虚','Expected genuine long-lived sponsor');
const sponsor=sourceCultivator.id;
const currentEndorser=detached.cultivators.find(row=>row.alive&&row.id!==sponsor&&row.locationId===WATER_VEIN_SITE);
check(currentEndorser?.id==='recruit-village-loc-vein-north-vol-5993'&&currentEndorser.age===35,'Expected genuine local recruit');
const endorser=currentEndorser.id;
const nativeOriginal=structuredClone(detached);
advanceNorthGateRenewal(nativeOriginal);
const hearing=nativeOriginal.northGateRenewal?.hearing;
check(hearing?.openedTick===36034&&hearing.expiresTick===36040&&!hearing.outcome,'Hearing lifecycle does not own opening at exact due date');
await mkdir(out);
const decision=(chosenAction:LLMDecisionPayload['chosenAction'],payload:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只行当月已有实据的合法动作。',...payload});
function step(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={}) {
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>
    [row.id,orders[row.id]??decision('REST')])));
}
function actor(world:WorldState,id:string) {
  const person=world.cultivators.find(row=>row.id===id);
  check(person,'missing '+id);
  return person;
}
const houseStock=(world:WorldState)=>{
  const book=granaryAt(world,source.settlementId);
  check(book&&validVillageGranaryBook(world,book),'Invalid named granary book');
  return book.roots;
};
const treasury=(world:WorldState)=>{
  const sect=world.sects.find(row=>row.id===sourceCultivator.sectId);
  check(sect,'missing sect treasury');
  return sect.spiritStones;
};
const gateChoice=(world:WorldState,id:string,move:NorthGateRenewalMove,t=world.tick+1)=>{
  const option=availableNorthGateRenewalActions(actor(world,id),world,t).find(row=>row.northGateRenewalMove===move);
  check(option,'Unavailable expected choice '+move+' at '+world.tick+' for '+id);
  return decision('NORTH_GATE_RENEWAL',{northGateRenewalMove:option.northGateRenewalMove,
    targetNorthGateRenewalId:option.targetNorthGateRenewalId});
};
const upperChoice=(world:WorldState,move:UpperPassageMove)=>{
  const option=availableUpperPassageActions(actor(world,sponsor),world,world.tick+1).find(row=>row.upperPassageMove===move);
  check(option,'Expected upper choice absent: '+move+' at '+world.tick);
  return decision('UPPER_PASSAGE',{upperPassageMove:option.upperPassageMove,
    targetUpperPassageNodeId:option.targetUpperPassageNodeId});
};
const denied=(world:WorldState,id:string,payload:LLMDecisionPayload)=>{
  const before=JSON.stringify(world);
  check(resolveNorthGateRenewalAction(world,actor(world,id),payload)===null&&JSON.stringify(world)===before,
    'Unlawful decision changed state');
};
const originalAvailability=availableWaterVeinActions(actor(nativeOriginal,sponsor),nativeOriginal,nativeOriginal.tick+1);
check(!originalAvailability.some(row=>row.waterVeinMove==='open'),'Old opening bypassed campaign');
check(openRenewedNorthWaterGate(nativeOriginal,actor(nativeOriginal,sponsor),hearing.id,'reuse')===null,'Direct funding bypass');
denied(nativeOriginal,sponsor,{...gateChoice(nativeOriginal,sponsor,'reuse'),targetNorthGateRenewalId:'stale-hearing'});
denied(nativeOriginal,sponsor,decision('NORTH_GATE_RENEWAL',{northGateRenewalMove:'accord',targetNorthGateRenewalId:hearing.id}));
const noFunds=structuredClone(nativeOriginal);
const poorSect=noFunds.sects.find(row=>row.id===sourceCultivator.sectId);
check(poorSect,'Missing negative-control treasury');
poorSect.spiritStones=39;
denied(noFunds,sponsor,gateChoice(nativeOriginal,sponsor,'reuse'));
const remote=structuredClone(nativeOriginal);
actor(remote,sponsor).locationId='loc-market'; // Explicit negative test condition, not an acceptance branch.
denied(remote,sponsor,gateChoice(nativeOriginal,sponsor,'reuse'));

const oldOpening=JSON.stringify(detached.coldWaterVein?.openings[0]);
const oldFreight=JSON.stringify(detached.villageSupply.agreements.find(row=>row.id===source.freightId));
const oldCharter=JSON.stringify(detached.northMiningCharters?.charters.find(row=>row.id===source.charterId));
const originalCount=detached.coldWaterVein?.openings.length;
check(oldOpening&&oldFreight&&oldCharter&&originalCount,'Missing old proof');
const preserved=(world:WorldState)=>JSON.stringify(world.coldWaterVein?.openings[0])===oldOpening&&
  JSON.stringify(world.villageSupply.agreements.find(row=>row.id===source.freightId))===oldFreight&&
  JSON.stringify(world.northMiningCharters?.charters.find(row=>row.id===source.charterId))===oldCharter;
async function snapshot(name:string,world:WorldState){
  const prepared=await prepareEraCheckpoint(world,{branchId:name},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const artifact=[prepared.manifestFile,...prepared.parts];
  const verified=await verifyEraCheckpoint(input(prepared.manifestFile.bytes),prepared.parts.map(file=>input(file.bytes)),codec);
  check(encodeEraWorldSave(verified.world)===encodeEraWorldSave(world),'Branch checkpoint is not byte-stable: '+name);
  check(encodeEraWorldSave(step(verified.world))===encodeEraWorldSave(step(world)),'Branch resume diverged: '+name);
  const folder=join(out,name);
  await mkdir(folder);
  for(const file of artifact) {
    const writer=await open(join(folder,file.name),'wx');
    try{await writer.writeFile(file.bytes);}finally{await writer.close();}
  }
  return {archiveId:prepared.manifest.id,sha:prepared.manifest.payloadSha256,bytes:prepared.manifest.payloadBytes,
    physicalBytes:artifact.reduce((sum,file)=>sum+file.bytes.length,0),tick:world.tick};
}

const variants=['reuse','sect','accord'] as const;
const branchProof=[];
for(const stance of variants){
  let staged=structuredClone(nativeOriginal);
  if(stance==='accord'){
    const wild=step(staged);
    staged=step(staged,{[endorser]:gateChoice(staged,endorser,'endorse')});
    check(staged.northGateRenewal?.hearing.endorsement?.actorId===endorser&&houseStock(staged)===houseStock(wild),
      'Endorsement was not independent, or debited before two genuine signatures');
    denied(staged,sponsor,gateChoice(staged,sponsor,'accord')); // Offered next month but not executable on the same tick.
    const absent=structuredClone(staged);
    actor(absent,endorser).locationId='loc-market'; // Negative control only.
    check(!availableNorthGateRenewalActions(actor(absent,sponsor),absent,absent.tick+1).some(row=>row.northGateRenewalMove==='accord'),
      'No active local endorser, but accord was offered');
  }
  const beforeAction=step(staged);
  const opened=step(staged,{[sponsor]:gateChoice(staged,sponsor,stance)});
  const result=opened.northGateRenewal?.hearing.outcome;
  const opening=opened.coldWaterVein?.openings.at(-1);
  const funding=WATER_VEIN_RENEWAL_FUNDING[stance];
  check(result?.kind==='reopened'&&result.stance===stance&&result.actorId===sponsor&&result.openingId===opening?.id&&
    opening.renewal?.id===hearing.id&&opening.renewal.stance===stance&&opening.paidStones===40&&
    opening.borrowedUnits===funding.borrowedUnits&&opened.coldWaterVein?.openings.length===originalCount+1,'Wrong native gate receipt');
  check(treasury(beforeAction)-treasury(opened)===40+funding.extraStones,'Native income-matched cash delta wrong');
  check(houseStock(beforeAction)-houseStock(opened)===funding.roots,'Wrong actual named granary debit');
  const entries=opened.resourceFlow.months.at(-1)?.entries.filter(row=>row.refId===opening.id&&row.mechanism==='water_vein')??[];
  check(entries.length===1+Number(funding.extraStones>0)+Number(funding.roots>0)&&entries.some(row=>
    row.kind==='consumption'&&row.reason==='cold_gate_opened'&&row.amount===40&&row.from.kind==='sect'),'Missing native gate funding flows');
  if(funding.extraStones>0)check(entries.some(row=>row.kind==='consumption'&&row.reason==='cold_gate_renewal_sect'&&
    row.amount===funding.extraStones&&row.from.kind==='sect'&&row.from.id===sourceCultivator.sectId),'Missing current treasury debit');
  if(funding.roots>0)check(entries.some(row=>row.kind==='consumption'&&row.reason==='cold_gate_renewal_granary'&&row.good==='earth_root'&&
    row.from.kind==='granary'&&row.from.id===source.settlementId&&row.visibility.kind==='participants'&&row.visibility.actorIds.includes(endorser)),
    'Missing exact named granary receipt');
  check(preserved(opened),'Old debt or freight overwritten');
  const first=step(opened);
  const measured=step(first,{[sponsor]:decision('WATER_VEIN',{waterVeinMove:'observe',targetLocationId:WATER_VEIN_SITE})});
  const survey=measured.coldWaterVein?.observations.at(-1);
  const expectedWater=stance==='sect'?24:stance==='accord'?23:21;
  const deficit=stance==='sect'?undefined:stance==='accord'?1:3;
  const measuredView=projectWaterVein(measured,actor(measured,sponsor));
  check(survey?.tick===opening.openedTick+2&&survey.actorId===sponsor&&survey.wellDepth===expectedWater&&survey.fieldDeficit===deficit&&
    measuredView?.scope==='local'&&measuredView.mineYield===2,'Native physical follow-up survey did not confirm claim');
  let rest=measured;
  while(rest.tick<opening.openedTick+6) rest=step(rest);
  check(rest.coldWaterVein?.openings.at(-1)?.completedTick===opening.openedTick+6&&waterVeinPhase(opening,rest.tick).remainingUnits===0,
    'Water debt did not close at the canonical +6');
  if(stance==='sect'){
    for(const symptom of ['well','field','mine','recovered'] as const)check(
      !rest.events.some(event=>event.id===waterVeinSymptomEventId(opening,symptom)), 'A dry pathway produced a phantom symptom');
  }
  const checkpoint=await snapshot(stance,rest);
  let upper:unknown;
  if(stance==='sect'){
    let passage=opened;
    for(const move of ['enter','advance','advance','advance','read'] as const)
      passage=step(passage,{[sponsor]:upperChoice(passage,move)});
    check(projectUpperPassage(passage,actor(passage,sponsor))?.nodeId==='realm-upper-array','Dry funding did not reach the actual array');
    const read=projectNorthGateRenewal(passage,actor(passage,sponsor));
    check(read?.scope==='upper'&&read.outcome?.kind==='reopened'&&read.outcome.openingId===opening.id&&
      !read.options.length&&!read.ownEndorsed&&!read.hasEndorsement,'Today’s upper receipt not properly scoped');
    upper={guest:sponsor,position:actor(passage,sponsor).locationId,outcome:read.outcome,checkpoint:await snapshot('sect-upper',passage)};
  }
  denied(rest,sponsor,decision('NORTH_GATE_RENEWAL',{northGateRenewalMove:stance,targetNorthGateRenewalId:hearing.id}));
  branchProof.push({stance,newOpening:opening,paidStones:result.paidStones,remainingGranaryRoots:houseStock(opened),
    beforeActionStones:treasury(beforeAction),afterActionStones:treasury(opened),nativeFlows:entries,survey,
    conservedAfterSix:rest.coldWaterVein?.openings.at(-1)?.completedTick,
    ...(staged.northGateRenewal?.hearing.endorsement?{endorsement:staged.northGateRenewal.hearing.endorsement}:{}),
    checkpoint,...(upper?{upper}:{})});
}
let expired=structuredClone(nativeOriginal);
while(expired.tick<hearing.expiresTick)expired=step(expired);
check(expired.northGateRenewal?.hearing.outcome?.kind==='failed'&&expired.coldWaterVein?.openings.length===originalCount&&
  houseStock(expired)===houseStock(nativeOriginal)&&!expired.upperPassage&&
  expired.resourceFlow.months.every(row=>!row.entries.some(entry=>entry.reason.startsWith('cold_gate_renewal')))&&preserved(expired),
  'Unattended expiry incorrectly created an aperture, charge, passage or changed old source');
check(!availableWaterVeinActions(actor(expired,sponsor),expired,expired.tick+1).some(row=>row.waterVeinMove==='open'),
  'Ordinary gate could bypass completed failure');
const expiredProof=await snapshot('failed',expired);
const finalPair=await inputPair();
check(finalPair.every((bytes,i)=>bytes.byteLength===pair[i].byteLength&&bytes.every((byte,offset)=>byte===pair[i][offset]))&&
  encodeEraWorldSave(detached)===originText,'Original native branch was not byte-stable');
const summary=JSON.stringify({node:proc.version,engineRuleVersion:__SECT_UTILITY_RULE_VERSION__,naturalSource:{...source,
  tick:detached.tick,startYear:1001,endYear:detached.year,completedMonthlyTicksFromFreight:detached.tick-source.freightClosedTick,
  regionalSimulationYears:0,authoredYears:0,sourceArchiveId:base.manifest.id,sourceSha:base.manifest.payloadSha256,
  proofOfProvenance:'Inputs expected from native simulation; checkpoint integrity validates bytes, not narrated provenance.',sourceUnchanged:true},
  branches:branchProof,failed:{proof:expiredProof,outcome:expired.northGateRenewal?.hearing.outcome},
  negativeControls:['ordinary bypass','direct funding','stale hearing','no separate signature','no funding','remote sponsor','remote endorser','same tick','duplicate'],
  ms:performance.now()-start,maxRssKiB:proc.resourceUsage().maxRSS});
const report=await open(join(out,'summary.json'),'wx');
try{await report.writeFile(summary+'\n');}finally{await report.close();}
console.log(summary);

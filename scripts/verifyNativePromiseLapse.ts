import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {availableUpperArrayFieldTradeActions,resolveUpperArrayFieldTradeAction,upperArrayFieldTradeCustody} from '../src/engine/upperArrayFieldTradeEngine';
import {UPPER_ARRAY_TRADE_OFFER_MONTHS} from '../src/engine/upperArrayFieldTradeTerms';
import {availableNorthGateRenewalActions,resolveNorthGateRenewalAction} from '../src/engine/northGateRenewalEngine';
import type {NorthGateRenewalMove} from '../src/engine/northGateRenewalTerms';
import {northRenewalGranaryRootSpent} from '../src/engine/waterVeinTerms';
import {availableWaterVeinActions} from '../src/engine/waterVeinEngine';
import {readFile,stat,open,join} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const node='node:process',fs='node:fs/promises',crypto='node:crypto';
const {mkdir}=await import(fs) as {mkdir(path:string):Promise<unknown>};
const {webcrypto}=await import(crypto) as {webcrypto:Crypto};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const proc=(await import(node) as {default:{argv:string[]}}).default;
const [earlyStem,lateStem,out,...extra]=proc.argv.slice(2);
function check(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(label);}
check(earlyStem&&lateStem&&out&&!extra.length&&[earlyStem,lateStem].every(p=>!p.endsWith('.era')&&!p.endsWith('.json')),
  'Usage: vite-node scripts/verifyNativePromiseLapse.ts <exact T34 pair stem> <exact T36034 pair stem> <fresh output directory>');
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const input=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function bounded(path:string,max:number){
  const stat0=await stat(path);
  check(stat0.size>0&&stat0.size<=max,'Invalid source size '+path);
  const data=await readFile(path);
  check(data.byteLength===stat0.size,'Changed source length '+path);
  return data;
}
const readPair=(stem:string)=>Promise.all([bounded(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES),bounded(stem+'.json',ERA_CHECKPOINT_NATIVE_JSON_BYTES)]);
async function load(stem:string,tick:number,sha:string){
  const original=await readPair(stem);
  const checkpoint=await verifyEraCheckpoint(input(original[0]),[input(original[1])],codec);
  check(checkpoint.manifest.payloadSha256===sha&&checkpoint.world.tick===tick&&!checkpoint.world.authoredEraOrigin&&
    !checkpoint.world.regionalSimulation,'Wrong native lineage '+tick);
  return {world:checkpoint.world,verify:async()=>{
    const current=await readPair(stem);
    check(original.every((bytes,i)=>bytes.byteLength===current[i].byteLength&&bytes.every((byte,j)=>byte===current[i][j])),
      'Original source changed');
  }};
}
const early=await load(earlyStem,34,'04f059902d6e2edae8cb1e44db27c880636cc64ed8f277baf1c7cba7ee1725c4');
const late=await load(lateStem,36034,'ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239');
const sell='elder-danxia-1',buy='npc-6',nextBuyer='elder-danxia-2',signer='recruit-village-loc-vein-north-vol-5993';
const person=(world:WorldState,id:string)=>{
  const actor=world.cultivators.find(row=>row.id===id);
  check(actor,'Missing actor '+id);return actor;
};
const action=(chosenAction:LLMDecisionPayload['chosenAction'],opts:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'原人、原约、原物，各守其据。',...opts});
const tick=(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,orders[row.id]??action('REST')])));
const scope=(world:WorldState,id:string)=>availableUpperArrayFieldTradeActions(person(world,id),world,world.tick+1);
const agreements=(world:WorldState)=>world.upperArrayField?.trade?.agreements??[];
const balances=(world:WorldState,ids:readonly string[])=>ids.map(id=>{
  const actor=person(world,id);
  return [id,actor.herbs.earth_root,actor.spiritStones];
});
const tradeFlows=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries.filter(row=>row.mechanism==='upper_array_field'));
async function stage(folder:string,world:WorldState){
  const packed=await prepareEraCheckpoint(world,{branchId:folder},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const checkback=await verifyEraCheckpoint(input(packed.manifestFile.bytes),packed.parts.map(part=>input(part.bytes)),codec);
  check(encodeEraWorldSave(checkback.world)===encodeEraWorldSave(world)&&
    encodeEraWorldSave(tick(checkback.world))===encodeEraWorldSave(tick(world)),folder+' strict replay differs');
  return {folder,packed,tick:world.tick,sha:packed.manifest.payloadSha256};
}

const offer=(other:string)=>action('UPPER_ARRAY_FIELD_TRADE',{upperArrayFieldTradeMove:'propose',targetCultivatorId:other});
let earlyWorld=early.world;
check(scope(earlyWorld,sell).some(row=>row.upperArrayFieldTradeMove==='propose'&&row.targetCultivatorId===buy),'Original buyer not encountered at well');
earlyWorld=tick(earlyWorld,{[sell]:offer(buy)});
const original=agreements(earlyWorld).at(-1);
check(original?.status==='offered'&&original.buyerId===buy&&original.wellProjectId==='village-work-1','Expected exact original well offer');
const accept=action('UPPER_ARRAY_FIELD_TRADE',{upperArrayFieldTradeMove:'accept',targetUpperArrayFieldTradeId:original.id});
const expiry=original.offeredTick+UPPER_ARRAY_TRADE_OFFER_MONTHS;
const beforeClaim=JSON.stringify(earlyWorld);
check(resolveUpperArrayFieldTradeAction(earlyWorld,person(earlyWorld,nextBuyer),accept)===null&&JSON.stringify(earlyWorld)===beforeClaim,
  'Different real person could accept original offer');
while(earlyWorld.tick<expiry-1)earlyWorld=tick(earlyWorld);
check(scope(earlyWorld,buy).some(row=>row.upperArrayFieldTradeMove==='accept'&&row.targetUpperArrayFieldTradeId===original.id),
  'Original buyer cannot accept in last actually legal month');
const timely=tick(earlyWorld,{[buy]:accept});
check(agreements(timely)[0]?.acceptedTick===expiry&&agreements(timely)[0].status==='accepted','Inclusive real last month is not executable');
const noBusiness=tick(earlyWorld);
const closed=agreements(noBusiness)[0];
check(closed?.status==='expired'&&closed.closedTick===expiry&&!closed.acceptedTick&&!closed.load&&!closed.settlement&&
  !tradeFlows(noBusiness).length&&!upperArrayFieldTradeCustody(noBusiness).length,'Expiry improperly paid, loaded or settled');
check(balances(noBusiness,[sell,buy,nextBuyer]).toString()===balances(timely,[sell,buy,nextBuyer]).toString(),
  'Even the timely signature should not pay in either branch');
check(person(noBusiness,buy).alive&&person(noBusiness,nextBuyer).alive&&person(noBusiness,nextBuyer).locationId==='loc-vein-north',
  'Original and other present customers must be actual different live bodies at the closure');
const beforeStale=encodeEraWorldSave(noBusiness);
check(resolveUpperArrayFieldTradeAction(noBusiness,person(noBusiness,buy),accept)===null&&
  beforeStale===encodeEraWorldSave(noBusiness),'Direct stale acceptance mutated state');
const stale=tick(noBusiness,{[buy]:accept});
const staleControl=tick(noBusiness);
check(JSON.stringify(stale.upperArrayField)===JSON.stringify(staleControl.upperArrayField)&&
  JSON.stringify(stale.coldWaterVein)===JSON.stringify(staleControl.coldWaterVein)&&
  JSON.stringify(balances(stale,[sell,buy,nextBuyer]))===JSON.stringify(balances(staleControl,[sell,buy,nextBuyer]))&&
  !tradeFlows(stale).length,'Stale post-expiry acceptance charged resources or changed agreement/debt');
check(scope(stale,sell).some(row=>row.upperArrayFieldTradeMove==='propose'&&row.targetCultivatorId===nextBuyer),'Different actual next customer unavailable');
const replacement=tick(stale,{[sell]:offer(nextBuyer)});
const newDeal=agreements(replacement).at(-1);
check(newDeal?.buyerId===nextBuyer&&newDeal.id!==original.id&&newDeal.status==='offered','Replacement acquired old contract instead of a new offer');
const newAccept=action('UPPER_ARRAY_FIELD_TRADE',{upperArrayFieldTradeMove:'accept',targetUpperArrayFieldTradeId:newDeal.id});
const signed=tick(replacement,{[nextBuyer]:newAccept});
check(agreements(signed).at(-1)?.status==='accepted'&&JSON.stringify(agreements(signed)[0])===JSON.stringify(closed)&&
  !tradeFlows(signed).length&&!upperArrayFieldTradeCustody(signed).length,'New party illegally recomputed or paid on old terms');
let sameAge=tick(staleControl);
sameAge=tick(sameAge);
check(JSON.stringify(signed.coldWaterVein)===JSON.stringify(sameAge.coldWaterVein),'Signature or expiry changed old water debt');
const earlyStage=await stage('new-signature-after-expiry',signed);

let lateWorld=late.world;
const lateInitialEndorser=person(lateWorld,signer);
check(lateInitialEndorser.alive&&lateInitialEndorser.age===35,'Missing original living native endorser');
const resolve=(w:WorldState,id:string,move:NorthGateRenewalMove)=>{
  const selected=availableNorthGateRenewalActions(person(w,id),w,w.tick+1).find(row=>row.northGateRenewalMove===move);
  check(selected,'No native legal move '+move+' '+w.tick);
  return action(selected.action,{northGateRenewalMove:move,targetNorthGateRenewalId:selected.targetNorthGateRenewalId});
};
lateWorld=tick(lateWorld);
lateWorld=tick(lateWorld,{[signer]:resolve(lateWorld,signer,'endorse')});
const signedLate=lateWorld.northGateRenewal?.hearing;
check(signedLate?.endorsement?.actorId===signer,'No native original actual signed endorsement');
lateWorld=tick(lateWorld,{[sell]:resolve(lateWorld,sell,'accord')});
const receipt=lateWorld.northGateRenewal?.hearing;
const accord=receipt?.outcome;
check(receipt&&accord?.kind==='reopened'&&accord.stance==='accord'&&accord.paidStones===48&&accord.granaryRoots===1,
  'Missing exact genuinely paid native accord');
const settlementId=receipt.source.settlementId, unchanged=JSON.stringify(receipt);
const witnessAge=person(lateWorld,signer).age;
check(northRenewalGranaryRootSpent(lateWorld,settlementId)===1,'Exact agreement root debit missing');
const months=lateWorld.tick;
let lastAlive=lateWorld;
while(person(lateWorld,signer).alive&&lateWorld.tick<months+1700){lastAlive=lateWorld;lateWorld=tick(lateWorld);}
const gone=person(lateWorld,signer);
const death=lateWorld.events.find(row=>row.tick===lateWorld.tick&&row.category==='death'&&row.actorIds.includes(signer));
check(!gone.alive&&person(lastAlive,signer).alive&&death&&lateWorld.tick===lastAlive.tick+1,'Actual native death transition not found');
const attempt=action('NORTH_GATE_RENEWAL',{northGateRenewalMove:'endorse',targetNorthGateRenewalId:receipt.id});
const goneLate=JSON.stringify(lateWorld);
check(!availableNorthGateRenewalActions(gone,lateWorld).length&&resolveNorthGateRenewalAction(lateWorld,gone,attempt)===null&&
  !availableNorthGateRenewalActions(person(lateWorld,sell),lateWorld).length&&
  !availableWaterVeinActions(person(lateWorld,sell),lateWorld).some(row=>row.waterVeinMove==='open')&&
  JSON.stringify(lateWorld)===goneLate,'Loss of signer created renewed authority or opened stale route');
check(unchanged===JSON.stringify(lateWorld.northGateRenewal?.hearing)&&northRenewalGranaryRootSpent(lateWorld,settlementId)===1&&
  lateWorld.coldWaterVein?.openings.filter(row=>row.renewal?.id===receipt.id).length===1&&
  lateWorld.coldWaterVein?.openings.find(row=>row.id===accord.openingId)?.completedTick===accord.openedTick+6,
  'Natural death rewrote previous commitment, created duplicate cost or left debt running');
const lateStage=await stage('actual-life-transition',lateWorld);
await early.verify();await late.verify();
await mkdir(out);
for(const {folder,packed} of [earlyStage,lateStage]){
  const dest=join(out,folder);await mkdir(dest);
  for(const file of [packed.manifestFile,...packed.parts]){
    const entry=await open(join(dest,file.name),'wx');try{await entry.writeFile(file.bytes);}finally{await entry.close();}
  }
}
console.log(JSON.stringify({
  scope:'actual native role replacement after early lapse; late separate original signatory mortality, not transfer of legal rights',
  early:{sourceTick:early.world.tick,original,deadlineInclusive:expiry,closed,claimedByDifferentActor:false,paid:false,
    nextBuyer,newContract:agreements(signed).at(-1),strictNextMonthExact:true,sha:earlyStage.sha},
  late:{sourceTick:late.world.tick,signer,witnessAge,signedTick:receipt.endorsement?.signedTick,paidTick:accord.openedTick,
    monthsAfterPayment:lateWorld.tick-months,deathTick:lateWorld.tick,age:gone.age,lifespan:gone.lifespan,death:death.title,
    historicSignedRootSpend:northRenewalGranaryRootSpent(lateWorld,settlementId),historicAccordUnchanged:true,
    furtherCharges:0,newAuthority:false,strictNextMonthExact:true,sha:lateStage.sha},originalsUnchanged:true,
},null,2));

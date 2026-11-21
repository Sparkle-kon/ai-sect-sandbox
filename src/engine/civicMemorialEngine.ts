import type { CivicErrataEvidence,CivicMemorial,CivicMemorialMove,CivicReliefDeed,Cultivator,HouseholdMember,LLMDecisionPayload,
  MortalSettlement,SettlementRecord,WorldEvent,WorldState } from '../types/world';
import { flowActor,recordResourceFlow } from './resourceFlowEngine';
import { SETTLEMENT_RELIEF } from './settlementReliefTerms';
import { granaryAt,presentAtVillageGranary } from './villageGranaryEngine';

export const CIVIC_MEMORIAL_OFFER_TICKS=4;
export const CIVIC_MEMORIAL_COST={stones:10,earthRoots:1} as const;
export const createCivicMemorialsState=():WorldState['civicMemorials']=>({deeds:[],memorials:[],nextDeedId:1,nextMemorialId:1});
const exactFields=new Set(['action','chosenAction','innerMonologue','spokenLine','civicMemorialMove',
  'targetCivicDeedId','targetCivicMemorialId']);
const ascii=(a:string,b:string)=>a<b?-1:a>b?1:0;
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const exactOldId=(member:HouseholdMember,subjectId:string)=>member.recruitedId===subjectId&&subjectId===`recruit-${member.volunteerId}`;
const openingLive=(row:CivicMemorial,tick:number)=>row.status==='proposed'&&row.openedTick<=tick&&tick<row.expiresTick;
const hasSupplies=(actor:Cultivator)=>Number.isFinite(actor.spiritStones)&&actor.spiritStones>=CIVIC_MEMORIAL_COST.stones&&
  Number.isSafeInteger(actor.herbs.earth_root)&&actor.herbs.earth_root>=CIVIC_MEMORIAL_COST.earthRoots;
const local=(world:WorldState,actor:Cultivator,tick:number)=>{
  const village=presentAtVillageGranary(world,actor,tick);
  return village&&village.population>0?village:undefined;
};

function publicReliefMatches(record:SettlementRecord,settlementId:string,actorId:string,tick:number):boolean {
  return record.id===`settlement-${tick}-relief-${settlementId}-${actorId}`&&record.tick===tick&&record.kind==='relief'&&
    record.settlementId===settlementId&&record.actorId===actorId&&record.people===0&&record.stones===SETTLEMENT_RELIEF.stones&&
    record.herbs===SETTLEMENT_RELIEF.jade_leaf&&record.targetSettlementId===undefined&&record.cultivatorId===undefined&&record.volunteerId===undefined;
}
function enrollment(world:WorldState,village:MortalSettlement,subjectId:string){
  const actor=person(world,subjectId);
  const member=world.households.members.find(row=>row.settlementId===village.id&&exactOldId(row,subjectId));
  if(!actor||!member||!Number.isSafeInteger(member.settledTick)||member.settledTick===undefined||
    member.registeredTick>member.settledTick||!world.households.groups.some(group=>group.id===member.householdId&&
      group.presences.some(presence=>presence.settlementId===village.id)))return undefined;
  const native=village.volunteers.find(row=>row.id===member.volunteerId);
  if(native&&(native.enlistedCultivatorId!==actor.id||native.name!==actor.name))return undefined;
  const status=member.status==='recruited'&&alive(actor)?'recruited' as const :
    member.status==='deceased'&&!actor.alive&&actor.hp<=0?'deceased' as const:undefined;
  return status?{actor,member,statusTick:member.settledTick,status,name:native?.name??actor.name}:undefined;
}
function matchesSubject(world:WorldState,village:MortalSettlement,deed:CivicReliefDeed){
  if(deed.settlementId!==village.id||deed.siteId!==village.locationId||deed.tick>world.tick)return undefined;
  const native=enrollment(world,village,deed.subjectId);
  if(!native||native.member.householdId!==deed.householdId||native.member.volunteerId!==deed.volunteerId||
    (native.status==='recruited'?native.statusTick!==deed.enrolledTick:native.statusTick<=deed.tick)||
    native.name!==deed.name||deed.enrolledTick>=deed.tick)return undefined;
  const original=world.settlements.records.find(row=>row.id===deed.reliefRecordId);
  if(original&&!publicReliefMatches(original,deed.settlementId,deed.subjectId,deed.tick))return undefined;
  if(world.events.some(row=>row.id===`evt-${deed.reliefRecordId}`&&row.witnessScope==='participants'))return undefined;
  return native;
}

/** Called only at the native paid relief append. No historical names or witness opportunities are inferred later. */
export function captureCivicReliefDeed(world:WorldState,record:SettlementRecord):void{
  if(record.tick!==world.tick||!record.actorId||!world.settlements.records.includes(record)||
    !publicReliefMatches(record,record.settlementId,record.actorId,world.tick))return;
  const village=world.settlements.villages.find(row=>row.id===record.settlementId);
  if(!village||village.lastReliefTick!==world.tick)return;
  const native=enrollment(world,village,record.actorId);
  if(!native||native.status!=='recruited'||native.statusTick>=world.tick||local(world,native.actor,world.tick)?.id!==village.id)return;
  const state=world.civicMemorials;
  if(state.deeds.some(row=>row.reliefRecordId===record.id))return;
  const witnesses=world.cultivators.filter(actor=>actor.id!==native.actor.id&&actor.locationId===village.locationId&&
    local(world,actor,world.tick)?.id===village.id).map(actor=>actor.id).sort(ascii);
  if(!witnesses.length)return;
  state.deeds.push({id:`civic-deed-${state.nextDeedId++}`,reliefRecordId:record.id,settlementId:village.id,siteId:village.locationId,
    subjectId:native.actor.id,volunteerId:native.member.volunteerId,householdId:native.member.householdId,name:native.name,
    enrolledTick:native.statusTick,tick:record.tick,stones:record.stones,herbs:record.herbs,witnessIds:witnesses});
}

function existingDonation(world:WorldState,villageId:string,actorId:string,tick:number){
  const rows=granaryAt(world,villageId)?.receipts??[];
  for(let index=rows.length-1;index>=0;index--){
    const row=rows[index];
    if(row.tick<=tick&&row.actorId===actorId&&row.kind!=='draw')return row;
  }
  return undefined;
}
const identityKey=(deed:CivicReliefDeed)=>JSON.stringify([deed.settlementId,deed.subjectId]);
function canVerify(world:WorldState,actor:Cultivator,village:MortalSettlement,row:CivicMemorial,deed:CivicReliefDeed,tick:number){
  if(!openingLive(row,tick)||row.openedTick>=tick||row.proposerId===actor.id||deed.subjectId===actor.id||
    !deed.witnessIds.includes(actor.id)||!matchesSubject(world,village,deed))return undefined;
  const proposer=person(world,row.proposerId);
  return alive(proposer)&&proposer.id!==deed.subjectId&&local(world,proposer,tick)?.id===village.id&&hasSupplies(proposer)?proposer:undefined;
}

export type CivicMemorialOption =
  | {action:'CIVIC_MEMORIAL';civicMemorialMove:'propose';targetCivicDeedId:string;targetCivicMemorialId?:never}
  | {action:'CIVIC_MEMORIAL';civicMemorialMove:'verify';targetCivicMemorialId:string;targetCivicDeedId?:never};

export function availableCivicMemorialActions(actor:Cultivator,world:WorldState,executionTick=world.tick):CivicMemorialOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!world.civicMemorials.deeds.length)return [];
  const village=local(world,actor,executionTick);
  if(!village)return [];
  const state=world.civicMemorials;
  if(state.memorials.some(row=>row.openedTick===executionTick&&row.proposerId===actor.id||
    row.verification?.tick===executionTick&&row.verification.verifierId===actor.id))return [];
  const options:CivicMemorialOption[]=[];
  const deeds=new Map(state.deeds.filter(row=>row.settlementId===village.id).map(row=>[row.id,row]));
  const occupied=new Set<string>();
  for(const row of state.memorials){
    const pending=openingLive(row,executionTick);
    if(!pending&&row.status!=='verified')continue;
    const deed=deeds.get(row.deedId);
    if(!deed)continue;
    occupied.add(identityKey(deed));
    if(pending&&canVerify(world,actor,village,row,deed,executionTick))
      options.push({action:'CIVIC_MEMORIAL',civicMemorialMove:'verify',targetCivicMemorialId:row.id});
  }
  if(hasSupplies(actor)&&existingDonation(world,village.id,actor.id,executionTick))for(const deed of deeds.values()){
    if(deed.subjectId===actor.id||deed.tick>=executionTick||
      !deed.witnessIds.some(id=>id!==actor.id&&id!==deed.subjectId)||occupied.has(identityKey(deed))||!matchesSubject(world,village,deed))continue;
    options.push({action:'CIVIC_MEMORIAL',civicMemorialMove:'propose',targetCivicDeedId:deed.id});
  }
  return options;
}

function event(world:WorldState,row:CivicMemorial,deed:CivicReliefDeed,move:CivicMemorialMove):WorldEvent{
  return {id:`evt-${row.id}-${move}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title:move==='propose'?'村中提议查验前居民赈济实据':'乡祠核实本名与实际赈济',
    description:move==='propose'?'本轮只登记；须原事另一位实际在场者择日复核。':
      '两位不同在场人完成核验和实付，只铭记该份实过赈济与原坊籍本名；不推断亲缘、生死日期或去向。',
    actorIds:[row.proposerId,...(row.verification?[row.verification.verifierId]:[])],
    locationId:deed.siteId,witnessScope:'participants'};
}

export function resolveCivicMemorialAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='CIVIC_MEMORIAL'||Object.entries(decision).some(([key,value])=>value!==undefined&&
    (!exactFields.has(key)||key==='action'&&value!=='CIVIC_MEMORIAL')))return null;
  const choice=availableCivicMemorialActions(actor,world).find(row=>row.civicMemorialMove===decision.civicMemorialMove&&
    row.targetCivicDeedId===decision.targetCivicDeedId&&row.targetCivicMemorialId===decision.targetCivicMemorialId);
  if(!choice)return null;
  const state=world.civicMemorials;
  if(choice.civicMemorialMove==='propose'){
    const source=state.deeds.find(row=>row.id===choice.targetCivicDeedId)!;
    const contribution=existingDonation(world,source.settlementId,actor.id,world.tick);
    if(!contribution)return null;
    const row:CivicMemorial={id:`civic-memorial-${state.nextMemorialId++}`,deedId:source.id,proposerId:actor.id,proposerDonationTick:contribution.tick,
      proposerDonationKind:contribution.kind,openedTick:world.tick,expiresTick:world.tick+CIVIC_MEMORIAL_OFFER_TICKS,status:'proposed'};
    state.memorials.push(row);
    return event(world,row,source,'propose');
  }
  const row=state.memorials.find(source=>source.id===choice.targetCivicMemorialId)!;
  const deed=state.deeds.find(source=>source.id===row.deedId)!;
  const village=local(world,actor,world.tick);
  const proposer=village&&canVerify(world,actor,village,row,deed,world.tick);
  const subject=village&&matchesSubject(world,village,deed);
  if(!proposer||!subject)return null;
  proposer.spiritStones-=CIVIC_MEMORIAL_COST.stones;
  proposer.herbs.earth_root-=CIVIC_MEMORIAL_COST.earthRoots;
  row.status='verified';
  row.verification={tick:world.tick,verifierId:actor.id,subjectStatus:subject.status,stonesSpent:CIVIC_MEMORIAL_COST.stones,
    earthRootsSpent:CIVIC_MEMORIAL_COST.earthRoots};
  const fields={kind:'consumption' as const,mechanism:'civic_memorial' as const,reason:'civic_memorial_supplies',
    from:flowActor(proposer.id),refId:row.id,visibility:{kind:'participants' as const,actorIds:[proposer.id,actor.id]}};
  recordResourceFlow(world,{...fields,good:'stone',amount:CIVIC_MEMORIAL_COST.stones});
  recordResourceFlow(world,{...fields,good:'earth_root',amount:CIVIC_MEMORIAL_COST.earthRoots});
  return event(world,row,deed,'verify');
}

function actualErrata(world:WorldState,deed:CivicReliefDeed):CivicErrataEvidence|undefined {
  if(!world.locations.some(row=>row.id===deed.siteId&&row.type==='market'))return undefined;
  const id=`evt-${deed.reliefRecordId}`;
  if(world.events.some(row=>row.id===id&&row.witnessScope==='participants'))return undefined;
  const native=world.chronicleErrata.sources.find(row=>row.sourceEventId===id);
  if(!native||native.kind!=='relief'||native.actorId!==deed.subjectId||native.settlementId!==deed.settlementId||
    native.locationId!==deed.siteId||native.tick!==deed.tick||native.stones!==deed.stones||native.herbs!==deed.herbs)return undefined;
  const retellings:CivicErrataEvidence['retellings']=world.chronicleErrata.retellings.flatMap(row=>
    row.sourceEventId===id&&row.reading.kind==='relief'&&row.tick>=native.tick&&row.tick<=world.tick?
      [{id:row.id,tick:row.tick,reading:row.reading.delivery}]:[]);
  if(new Set(retellings.map(row=>row.reading)).size<2)return undefined;
  const correction=world.chronicleErrata.corrections.find(row=>
    row.sourceEventId===id&&row.reading.kind==='relief'&&row.reading.delivery==='full_supplies'&&row.tick<=world.tick&&
    retellings.every(item=>item.tick<row.tick&&row.contestedRetellingIds.includes(item.id)));
  return {retellings,...(correction?{correction:{id:correction.id,tick:correction.tick,reading:'full_supplies'}}:{})};
}

/** Preserve actual divergent public readings without replacing either the physical relief or the original reports. */
export function advanceCivicMemorials(world:WorldState):void{
  const state=world.civicMemorials;
  for(const row of state.memorials)if(row.status==='proposed'&&world.tick>=row.expiresTick)row.status='expired';
  if(!world.chronicleErrata.retellings.length)return;
  for(const deed of state.deeds){
    if(deed.errata?.correction)continue;
    const source=actualErrata(world,deed);
    if(source&&(!deed.errata||source.correction))deed.errata=source;
  }
}

export interface CivicPlaqueView {
  id:string;name:string;subjectStatus:'recruited'|'deceased';deedTick:number;inscribedTick:number;
  nameAmbiguous:boolean;
  errata?:{readings:Array<{tick:number;reading:'full_supplies'|'unfunded'}>;correction?:{tick:number;reading:'full_supplies'}};
}
export interface CivicMemorialView {
  settlementId:string;siteId:string;plaques:CivicPlaqueView[];
  proposals:Array<{id:string;name:string;deedTick:number;expiresTick:number;own:boolean;canVerify:boolean}>;
  candidates:Array<{id:string;name:string;deedTick:number;subjectStatus:'recruited'|'deceased'}>;
}
export function projectLocalCivicMemorialCount(world:WorldState,viewer?:Cultivator):{siteId:string;count:number}|undefined{
  const village=viewer&&local(world,viewer,world.tick);
  if(!village)return undefined;
  const deeds=new Set(world.civicMemorials.deeds.filter(row=>row.settlementId===village.id).map(row=>row.id));
  const count=world.civicMemorials.memorials.filter(row=>row.status==='verified'&&deeds.has(row.deedId)).length;
  return {siteId:village.locationId,count};
}

/** Only native name/deed dates and anonymous disagreement are public. Historic persons and signers are not merged. */
export function projectCivicMemorials(world:WorldState,viewer?:Cultivator):CivicMemorialView|undefined{
  const village=viewer&&local(world,viewer,world.tick);
  if(!viewer||!village)return undefined;
  const state=world.civicMemorials;
  const deeds=new Map(state.deeds.filter(row=>row.settlementId===village.id).map(row=>[row.id,row]));
  const choices=availableCivicMemorialActions(viewer,world);
  const validProposals=new Set(choices.filter(row=>row.civicMemorialMove==='verify').map(row=>row.targetCivicMemorialId));
  const byName=(name:string,subjectId:string)=>village.volunteers.some(row=>row.enlistedCultivatorId!==subjectId&&row.name===name)||
    [...deeds.values()].some(row=>row.subjectId!==subjectId&&row.name===name);
  const plaques:CivicPlaqueView[]=state.memorials.flatMap(row=>{
    const deed=deeds.get(row.deedId),triage=row.verification;
    if(!deed||row.status!=='verified'||!triage||triage.tick>world.tick)return [];
    const errata=deed.errata;
    return [{id:row.id,name:deed.name,subjectStatus:triage.subjectStatus,deedTick:deed.tick,inscribedTick:triage.tick,
      nameAmbiguous:byName(deed.name,deed.subjectId),
      ...(errata?{errata:{readings:errata.retellings.map(({tick,reading})=>({tick,reading})),
        ...(errata.correction?{correction:{tick:errata.correction.tick,reading:errata.correction.reading}}:{})}}:{})}];
  });
  const proposals=state.memorials.flatMap(row=>{
    const deed=deeds.get(row.deedId);
    const own=row.proposerId===viewer.id,canVerify=validProposals.has(row.id);
    return deed&&openingLive(row,world.tick)&&(own||canVerify)?
      [{id:row.id,name:deed.name,deedTick:deed.tick,expiresTick:row.expiresTick,own,canVerify}]:[];
  });
  const candidates=choices.flatMap(row=>{
    if(row.civicMemorialMove!=='propose')return [];
    const deed=deeds.get(row.targetCivicDeedId);
    const status=deed&&matchesSubject(world,village,deed)?.status;
    return deed&&status?[{id:deed.id,name:deed.name,deedTick:deed.tick,subjectStatus:status}]:[];
  });
  return {settlementId:village.id,siteId:village.locationId,plaques,proposals,candidates};
}

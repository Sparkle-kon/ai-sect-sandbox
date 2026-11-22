import type { Cultivator, LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { NORTH_MINING_SITE } from './northMiningCharterTerms';
import { granaryAt,presentAtVillageGranary,validVillageGranaryBook } from './villageGranaryEngine';
import { northRenewalWaterTerms, openRenewedNorthWaterGate } from './waterVeinEngine';
import { WATER_VEIN_OPEN_STONES,WATER_VEIN_RENEWAL_FUNDING } from './waterVeinTerms';
import { findNorthGateRenewalSource,northGateRenewalForSource,northGateRenewalHasLegacyOpeningAfterDue,NORTH_GATE_RENEWAL_MONTHS,NORTH_GATE_RENEWAL_MOVES } from './northGateRenewalTerms';
import type { NorthGateRenewalEndorsement,NorthGateRenewalHearing,NorthGateRenewalMove,NorthGateRenewalOutcome,
  NorthGateRenewalSource,NorthGateRenewalStance } from './northGateRenewalTerms';

export type NorthGateRenewalOption = {
  action:'NORTH_GATE_RENEWAL';northGateRenewalMove:NorthGateRenewalMove;targetNorthGateRenewalId:string;
};
const fields=new Set(['chosenAction','action','innerMonologue','spokenLine','northGateRenewalMove','targetNorthGateRenewalId']);
const living=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0;
const currentOrNext=(world:WorldState,tick:number)=>tick===world.tick||tick===world.tick+1;
const physical=(world:WorldState,actor:Cultivator,tick:number)=>living(actor)&&
  actor.positionPlane===undefined&&actor.age>=18&&world.cultivators.includes(actor)&&
  doctrineFoundingPhysicallyAt(world,actor,NORTH_MINING_SITE,tick);
const sameSource=(a:NorthGateRenewalSource,b:NorthGateRenewalSource)=>
  a.siteId===b.siteId&&a.settlementId===b.settlementId&&a.charterId===b.charterId&&a.wellProjectId===b.wellProjectId&&
  a.openingId===b.openingId&&a.freightId===b.freightId&&a.freightClosedTick===b.freightClosedTick&&
  a.passageTick===b.passageTick&&a.passageTileId===b.passageTileId;

function actualHearing(world:WorldState,tick:number):NorthGateRenewalHearing|undefined{
  if(tick<=NORTH_GATE_RENEWAL_MONTHS)return undefined;
  const source=findNorthGateRenewalSource(world,Math.min(tick,world.tick));
  if(!source)return undefined;
  const actual=northGateRenewalForSource(source);
  if(tick<actual.openedTick)return undefined;
  const stored=world.northGateRenewal?.hearing;
  if(!stored)return northGateRenewalHasLegacyOpeningAfterDue(world,actual.openedTick)?undefined:actual;
  return stored.id===actual.id&&stored.openedTick===actual.openedTick&&stored.expiresTick===actual.expiresTick&&
    sameSource(stored.source,source)?stored:undefined;
}

/** Date-driven authority only; missed hearings fail once, without an expense, opening or invented signature. */
export function advanceNorthGateRenewal(world:WorldState):void{
  const actual=actualHearing(world,world.tick);
  if(!actual)return;
  const state=world.northGateRenewal??={version:1,hearing:actual};
  const hearing=state.hearing;
  if(!hearing.outcome&&world.tick>=hearing.expiresTick)hearing.outcome={kind:'failed',closedTick:hearing.expiresTick};
}
function hasNativeHousehold(world:WorldState,actor:Cultivator,settlementId:string,tick:number):Omit<NorthGateRenewalEndorsement,'signedTick'>|undefined {
  if(!physical(world,actor,tick)||presentAtVillageGranary(world,actor,tick)?.id!==settlementId)return undefined;
  const member=world.households.members.find(row=>row.recruitedId===actor.id&&row.status==='recruited'&&
    row.settlementId===settlementId&&row.settledTick!==undefined&&row.settledTick<tick);
  const village=world.settlements.villages.find(row=>row.id===settlementId&&row.locationId===NORTH_MINING_SITE);
  if(!member||!village||village.population<1||actor.id!==`recruit-${member.volunteerId}`||
    !village.volunteers.some(row=>row.id===member.volunteerId&&row.enlistedCultivatorId===actor.id)||
    !world.households.groups.some(row=>row.id===member.householdId&&row.presences.some(site=>
      site.settlementId===settlementId&&(site.adults>0||site.juvenileCohorts.some(cohort=>cohort.count>0)))))return undefined;
  if(member.settledTick===undefined||member.registeredTick>member.settledTick)return undefined;
  const recruit=world.settlements.records.filter(row=>row.kind==='recruitment'&&row.cultivatorId===actor.id);
  if(recruit.length>1||recruit.some(row=>row.volunteerId!==member.volunteerId||row.settlementId!==settlementId||
    row.tick!==member.settledTick||row.people!==1))return undefined;
  return {actorId:actor.id,householdId:member.householdId,volunteerId:member.volunteerId,recruitedTick:member.settledTick};
}
function presentEndorser(world:WorldState,hearing:NorthGateRenewalHearing,funder:Cultivator,tick:number):Cultivator|undefined{
  const signed=hearing.endorsement;
  if(!signed||signed.actorId===funder.id||signed.signedTick<hearing.openedTick||signed.signedTick>=tick)return undefined;
  const actor=world.cultivators.find(row=>row.id===signed.actorId);
  if(!living(actor))return undefined;
  const proof=hasNativeHousehold(world,actor,hearing.source.settlementId,tick);
  return proof&&proof.householdId===signed.householdId&&proof.volunteerId===signed.volunteerId&&
    proof.recruitedTick===signed.recruitedTick?actor:undefined;
}
const listed=(move:NorthGateRenewalMove,id:string):NorthGateRenewalOption=>
  ({action:'NORTH_GATE_RENEWAL',northGateRenewalMove:move,targetNorthGateRenewalId:id});
export function availableNorthGateRenewalActions(actor:Cultivator,world:WorldState,executionTick=world.tick):NorthGateRenewalOption[]{
  if(!currentOrNext(world,executionTick)||!physical(world,actor,executionTick))return [];
  const hearing=actualHearing(world,executionTick);
  if(!hearing||hearing.outcome||executionTick>=hearing.expiresTick)return [];
  const {id}=hearing;
  const goods=granaryAt(world,hearing.source.settlementId);
  const treasury=northRenewalWaterTerms(world,actor,executionTick);
  const options:NorthGateRenewalOption[]=[];
  if(treasury?.well.id===hearing.source.wellProjectId){
    if(treasury.canReuse)options.push(listed('reuse',id));
    if(treasury.canSect)options.push(listed('sect',id));
  }
  // These rows are consent only, not asset reservations. Hold a separate actual local root for residents.
  if(!hearing.endorsement&&goods&&goods.roots>=2&&validVillageGranaryBook(world,goods)&&
    hasNativeHousehold(world,actor,hearing.source.settlementId,executionTick))options.push(listed('endorse',id));
  if(treasury?.well.id===hearing.source.wellProjectId&&treasury.canAccord&&presentEndorser(world,hearing,actor,executionTick))
    options.push(listed('accord',id));
  return options;
}

interface Permit {actor:Cultivator;renewalId:string;stance:NorthGateRenewalStance;tick:number;endorserId?:string}
const permits=new WeakMap<WorldState,Permit>();
/** Water can only settle synchronously from the exact validated decision, never from a quoted option. */
export function nativeNorthGateRenewalAuthorized(world:WorldState,actor:Cultivator,renewalId:string,stance:NorthGateRenewalStance):
  {endorserId?:string}|undefined{
  const permit=permits.get(world);
  if(!permit||permit.tick!==world.tick||permit.actor!==actor||permit.renewalId!==renewalId||permit.stance!==stance||
    world.northGateRenewal?.hearing.id!==renewalId||world.northGateRenewal.hearing.outcome)return undefined;
  permits.delete(world); // Exact single use; even reentrant emission cannot authorize a second native gate.
  return permit.endorserId===undefined?{}:{endorserId:permit.endorserId};
}

export function resolveNorthGateRenewalAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const internalAction=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='NORTH_GATE_RENEWAL'||internalAction!==undefined&&internalAction!=='NORTH_GATE_RENEWAL'||
    Object.entries(payload).some(([key,value])=>value!==undefined&&!fields.has(key))||
    !NORTH_GATE_RENEWAL_MOVES.some(move=>move===payload.northGateRenewalMove))return null;
  const move=payload.northGateRenewalMove;
  // Direct calls do not open a case or create a clock. The normal native pre-turn phase owns lifecycle.
  const hearing=world.northGateRenewal?.hearing;
  if(!hearing||hearing.id!==payload.targetNorthGateRenewalId||!availableNorthGateRenewalActions(actor,world).some(option=>
    option.northGateRenewalMove===move&&option.targetNorthGateRenewalId===hearing.id))return null;
  if(move==='endorse'){
    const proof=hasNativeHousehold(world,actor,hearing.source.settlementId,world.tick);
    if(!proof||hearing.endorsement)return null;
    hearing.endorsement={...proof,signedTick:world.tick};
    return {id:`evt-${hearing.id}-endorse-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
      title:'当世乡席署明同意',description:'只为当世自己所在的真户署名。没有扣走一株地根，也没有让旧采契重新签署。',
      category:'diplomacy',locationId:NORTH_MINING_SITE,actorIds:[actor.id],witnessScope:'participants'};
  }
  if(move!=='reuse'&&move!=='sect'&&move!=='accord'||permits.has(world))return null;
  const terms=northRenewalWaterTerms(world,actor),endorserId=move==='accord'?presentEndorser(world,hearing,actor,world.tick)?.id:undefined;
  if(!terms||move==='accord'&&!endorserId)return null;
  permits.set(world,{actor,renewalId:hearing.id,stance:move,tick:world.tick,endorserId});
  try{
    const event=openRenewedNorthWaterGate(world,actor,hearing.id,move);
    if(!event)return null;
    const funding=WATER_VEIN_RENEWAL_FUNDING[move];
    hearing.outcome={kind:'reopened',stance:move,actorId:actor.id,sectId:terms.sect.id,openedTick:world.tick,
      openingId:`water-gate-${world.tick}`,paidStones:move==='reuse'?WATER_VEIN_OPEN_STONES:move==='sect'?64:48,
      borrowedUnits:funding.borrowedUnits,granaryRoots:funding.roots};
    return event;
  }finally{permits.delete(world);}
}

type PublicOutcome=Omit<Extract<NorthGateRenewalOutcome,{kind:'reopened'}>,'actorId'|'sectId'>|Extract<NorthGateRenewalOutcome,{kind:'failed'}>;
export interface NorthGateRenewalView {
  id:string;
  scope:'lower'|'upper';
  openedTick:number;
  expiresTick:number;
  status:'hearing'|'reopened'|'failed';
  options:NorthGateRenewalOption[];
  ownEndorsed:boolean;
  hasEndorsement:boolean;
  blocked?:'eligibility'|'funds'|'awaits-consent'|'already-endorsed';
  outcome?:PublicOutcome;
}
const publicOutcome=(outcome:NorthGateRenewalOutcome|undefined):PublicOutcome|undefined=>{
  if(outcome?.kind!=='reopened')return outcome;
  const {actorId:_,sectId:__,...publicReceipt}=outcome;
  return publicReceipt;
};
/** Neither exact historic charter signatures nor current endorser identity cross the UI boundary. */
export function projectNorthGateRenewal(world:WorldState,viewer?:Cultivator):NorthGateRenewalView|undefined{
  if(!living(viewer)||!world.cultivators.includes(viewer))return undefined;
  const lower=physical(world,viewer,world.tick);
  if(!lower&&viewer.positionPlane!=='upper')return undefined;
  const hearing=actualHearing(world,world.tick);
  if(!hearing)return undefined;
  const outcome=publicOutcome(hearing.outcome);
  if(!lower){
    if(outcome?.kind!=='reopened'||!world.upperPassage?.journeys.some(journey=>journey.actorId===viewer.id&&
      journey.returnedTick===undefined&&journey.deceasedTick===undefined&&journey.steps.at(-1)?.nodeId===viewer.locationId&&
      journey.reading?.openingId===outcome.openingId&&journey.reading.tick<=world.tick))return undefined;
    return {id:hearing.id,scope:'upper',openedTick:hearing.openedTick,expiresTick:hearing.expiresTick,
      status:'reopened',options:[],ownEndorsed:false,hasEndorsement:false,outcome};
  }
  const options=availableNorthGateRenewalActions(viewer,world,world.tick+1);
  const ownEndorsed=hearing.endorsement?.actorId===viewer.id;
  let blocked:NorthGateRenewalView['blocked'];
  if(!outcome&&world.tick+1<hearing.expiresTick&&!options.length){
    const quote=northRenewalWaterTerms(world,viewer,world.tick+1);
    blocked=ownEndorsed?'already-endorsed':quote&&!quote.canReuse?'funds':'eligibility';
  }
  return {id:hearing.id,scope:'lower',openedTick:hearing.openedTick,expiresTick:hearing.expiresTick,
    status:outcome?.kind??'hearing',options,ownEndorsed,hasEndorsement:hearing.endorsement!==undefined,
    ...(blocked?{blocked}:{}),...(outcome?{outcome}:{})};
}

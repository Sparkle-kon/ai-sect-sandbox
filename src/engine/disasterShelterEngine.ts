import type {DisasterShelter,DisasterShelterOption,DisasterShelterParty} from '../types/disasterShelter';
import type {Cultivator,LLMDecisionPayload,MortalSettlement,RouteWarningHazardProof,WorldEvent,WorldState} from '../types/world';
import {
  DISASTER_SHELTER_HISTORY,DISASTER_SHELTER_MAX_OPEN,DISASTER_SHELTER_MAX_PATH,DISASTER_SHELTER_OFFER_TICKS,
  disasterShelterLocksTravel,disasterShelterOpen,disasterShelterRoomHeld,disasterShelterStrandedInterior,
} from './disasterShelterCheckpoint';
import {routeWarningHazardValid} from './routeWarningProof';
import {housingShelterProof,housingVacantCapacity,seasonalHousingRoomHeld} from './seasonalHousingEngine';
import {terrainTileAt} from './terrainEngine';
import {villageEvolutionPath} from './villageEvolutionEngine';
import {presentAtVillageGranary} from './villageGranaryEngine';
import {supplyLegEndpoints} from './villageSupplyAccounting';

export type {DisasterShelterOption} from '../types/disasterShelter';
export {disasterShelterCheckpoint,disasterShelterLocksTravel} from './disasterShelterCheckpoint';

const findActor=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0&&actor.age>=18&&actor.positionPlane===undefined;
const caseRows=(world:WorldState)=>world.disasterShelter?.cases??[];
const noRoomFor=(world:WorldState,guestId:string)=>caseRows(world).some(row=>row.guest.actorId===guestId&&disasterShelterOpen(row));
const hazardAt=(world:WorldState,tileId:string,tick:number)=>world.mapHazards.find(row=>
  row.tileId===tileId&&row.intensity>=2&&routeWarningHazardValid(world,row,tick));
const safe=(world:WorldState,path:readonly string[],tick:number,returning=false)=>
  (returning?path:path.slice(1)).every(tile=>!hazardAt(world,tile,tick));
const blockedOutwardOrigin=(world:WorldState,origin:RouteWarningHazardProof,tick:number)=>
  world.mapHazards.some(row=>row.tileId===origin.tileId&&row.intensity>=2&&routeWarningHazardValid(world,row,tick)&&
    (row.id!==origin.id||!routeWarningHazardValid(world,origin,tick)));
const atVillage=(world:WorldState,village:MortalSettlement)=>{
  const sites=world.locations.filter(row=>row.id===village.locationId&&row.type!=='abyss'&&row.type!=='secret_realm');
  const [site]=sites;
  return sites.length===1&&site?terrainTileAt(world,site.x,site.y):undefined;
};
function party(world:WorldState,actor:Cultivator,village:MortalSettlement,tick:number):DisasterShelterParty|undefined{
  const members=world.households.members.filter(row=>row.recruitedId===actor.id&&row.status==='recruited'&&
    row.settlementId===village.id&&row.registeredTick<tick&&world.households.groups.some(group=>group.id===row.householdId&&
      group.presences.some(presence=>presence.settlementId===village.id&&presence.adults>0)));
  const [member]=members;
  if(!village.population||members.length!==1||!member||
    !village.volunteers.some(row=>row.id===member.volunteerId&&row.enlistedCultivatorId===actor.id))return undefined;
  return {actorId:actor.id,householdId:member.householdId,volunteerId:member.volunteerId,settlementId:village.id,siteId:village.locationId};
}
function presentParty(world:WorldState,actor:Cultivator|undefined,tick:number){
  if(!live(actor))return undefined;
  const village=presentAtVillageGranary(world,actor,tick);
  const identity=village&&party(world,actor,village,tick);
  return village&&identity&&actor.locationId===village.locationId?{village,identity}:undefined;
}
const sameParty=(a:DisasterShelterParty,b:DisasterShelterParty)=>a.actorId===b.actorId&&a.householdId===b.householdId&&
  a.volunteerId===b.volunteerId&&a.siteId===b.siteId&&a.settlementId===b.settlementId;
function roomAvailable(world:WorldState,hostId:string,guestId:string,tick:number){
  const seasonal=world.seasonalHousing.claims.filter(row=>seasonalHousingRoomHeld(row,tick));
  const disaster=caseRows(world).filter(disasterShelterRoomHeld);
  return !seasonal.some(row=>row.guestId===guestId)&&!disaster.some(row=>row.guest.actorId===guestId)&&
    seasonal.filter(row=>row.settlementId===hostId).length+disaster.filter(row=>row.host.settlementId===hostId).length<
    housingVacantCapacity(world,hostId,tick);
}
function source(world:WorldState,host:Cultivator,guest:Cultivator,tick:number){
  if(host===guest||disasterShelterLocksTravel(world,host)||disasterShelterLocksTravel(world,guest))return undefined;
  const shelter=presentParty(world,host,tick),home=presentParty(world,guest,tick);
  if(!shelter||!home||shelter.village.id===home.village.id||shelter.identity.householdId===home.identity.householdId||
    !roomAvailable(world,shelter.village.id,guest.id,tick))return undefined;
  const origin=atVillage(world,home.village);
  const hazard=origin&&hazardAt(world,origin.id,tick);
  const disasterTick=home.village.lastDisasterTick;
  if(!hazard||disasterTick===undefined||disasterTick>=tick||!routeWarningHazardValid(world,hazard,disasterTick)||blockedOutwardOrigin(world,hazard,tick))return undefined;
  const disasterRecordId=`settlement-${disasterTick}-disaster-${home.village.id}-${hazard.id}`;
  if(!world.settlements.records.some(row=>row.id===disasterRecordId&&row.kind==='disaster'&&
    row.settlementId===home.village.id&&row.tick===disasterTick))return undefined;
  const project=world.villageWorks.projects.find(row=>housingShelterProof(world,shelter.village.id,row.id,tick));
  if(!project)return undefined;
  for(const agreement of world.villageSupply.agreements){
    const path=villageEvolutionPath(world,agreement,home.village,shelter.village,false);
    if(!path||path.length>DISASTER_SHELTER_MAX_PATH||!safe(world,path,tick))continue;
    const leg=agreement.legs?.find(row=>{
      const ends=supplyLegEndpoints(agreement,row.good);
      return ends.source===home.village.id&&ends.destination===shelter.village.id&&row.phase==='delivered';
    });
    if(!leg?.settledTick||leg.settledTick>=disasterTick)continue;
    return {host:shelter.identity,guest:home.identity,shelterProjectId:project.id,agreementId:agreement.id,
      deliveredTick:leg.settledTick,disasterRecordId,disasterTick,hazard:{...hazard},path};
  }
  return undefined;
}
function accepting(world:WorldState,row:DisasterShelter,actor:Cultivator,tick:number){
  const guest=presentParty(world,actor,tick),host=presentParty(world,findActor(world,row.host.actorId),tick);
  return !!guest&&!!host&&sameParty(guest.identity,row.guest)&&sameParty(host.identity,row.host)&&
    !disasterShelterLocksTravel(world,actor)&&!disasterShelterLocksTravel(world,findActor(world,row.host.actorId)!)&&
    roomAvailable(world,row.host.settlementId,actor.id,tick)&&!!routeSites(world,row,tick)&&
    world.mapHazards.some(hazard=>hazard.id===row.hazard.id&&routeWarningHazardValid(world,row.hazard,tick))&&
    !blockedOutwardOrigin(world,row.hazard,tick)&&safe(world,row.path,tick);
}
function routeSites(world:WorldState,row:DisasterShelter,tick:number){
  const home=world.settlements.villages.find(village=>village.id===row.guest.settlementId&&village.locationId===row.guest.siteId);
  const shelter=world.settlements.villages.find(village=>village.id===row.host.settlementId&&village.locationId===row.host.siteId);
  if(!home||!shelter||atVillage(world,home)?.id!==row.path[0]||atVillage(world,shelter)?.id!==row.path.at(-1)||
    !housingShelterProof(world,shelter.id,row.shelterProjectId,tick))return undefined;
  return {home,shelter};
}
export function availableDisasterShelterActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DisasterShelterOption[]{
  if(!live(actor)||!world.cultivators.includes(actor)||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const rows=caseRows(world),out:DisasterShelterOption[]=[];
  function reply(row:DisasterShelter,disasterShelterMove:'accept'|'decline'|'withdraw'|'return'){
    out.push({action:'DISASTER_SHELTER',disasterShelterMove,targetDisasterShelterId:row.id});
  }
  if(rows.filter(row=>disasterShelterOpen(row)||disasterShelterStrandedInterior(row)).length<DISASTER_SHELTER_MAX_OPEN&&!rows.some(row=>
    disasterShelterOpen(row)&&(row.host.actorId===actor.id||row.guest.actorId===actor.id))&&presentParty(world,actor,executionTick)){
    for(const member of world.households.members){
      if(!member.recruitedId||noRoomFor(world,member.recruitedId))continue;
      const guest=findActor(world,member.recruitedId);
      if(live(guest)&&source(world,actor,guest,executionTick))
        out.push({action:'DISASTER_SHELTER',disasterShelterMove:'offer',targetCultivatorId:guest.id});
    }
  }
  for(const row of rows){
    if(row.status==='offered'&&executionTick<row.expiresTick){
      if(row.host.actorId===actor.id&&actor.locationId===row.host.siteId)reply(row,'withdraw');
      if(row.guest.actorId===actor.id&&actor.locationId===row.guest.siteId&&executionTick>row.offeredTick){
        reply(row,'decline');
        if(accepting(world,row,actor,executionTick))reply(row,'accept');
      }
    }
    if(row.status==='reserved'&&(actor.id===row.guest.actorId||actor.id===row.host.actorId))reply(row,'withdraw');
    if(row.status==='occupied'&&row.guest.actorId===actor.id&&row.arrivedTick!==undefined&&row.arrivedTick<executionTick&&
      actor.locationId===row.host.siteId&&routeSites(world,row,executionTick)&&safe(world,row.path,executionTick,true))reply(row,'return');
  }
  return out;
}

type Tag='offer'|'accept'|'declined'|'withdrawn'|'expired'|'stranded'|'lost'|'outbound'|'occupied'|'return-requested'|'returning'|'returned';
const captions:Record<Tag,[string,string]> = {
  offer:['灾后问舍','安顿一位本人，须等那人亲口应允。尚未替任何人留房。'],
  accept:['避灾之约已应','原舍留下一席，人在故村，还不曾动身。'],
  declined:['避灾邀约谢绝','没有人动身，也没有人入住。'],
  withdrawn:['避灾之约撤回','两乡之间尚未迈出一步，所留的一席已退回。'],
  expired:['避灾邀约未应','等候已过，没留下住处，也没有人离村。'],
  stranded:['避灾路断','人在已核实的最后一处，未记作到家。'],
  lost:['避灾人已故','只记本人已故，不作入住或归乡的凭据。'],
  outbound:['向避灾之舍再行一步','实走一段旧路，仍未抵达避灾之处。'],
  occupied:['避灾人实抵借舍','人到了避灾的村舍，方才入住。原村籍不改。'],
  'return-requested':['避灾人请归原村','回家之路已核，人在借舍，尚未离开。'],
  returning:['沿旧路归村','本人实走了这一段，尚未抵达故村。'],
  returned:['避灾人已实归故村','人已到故村。此为本人来回，不是户籍迁徙。'],
};
function event(world:WorldState,row:DisasterShelter,tag:Tag):WorldEvent{
  const [title,description]=captions[tag];
  const locationId=tag==='occupied'||tag==='return-requested'?row.host.siteId:
    tag==='outbound'||tag==='returning'||tag==='stranded'||tag==='lost'?undefined:row.guest.siteId;
  return {id:`evt-${row.id}-${world.tick}-${tag}`,title,description,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',actorIds:[row.host.actorId,row.guest.actorId],witnessScope:'participants',...(locationId?{locationId}:{})};
}
function prune(world:WorldState){
  const state=world.disasterShelter;
  if(!state)return;
  // The previous event ring and this turn's closures coexist until the world appends
  // and trims events. Do not evict the proof before those last private receipts are gone.
  const hotIds=new Set(world.events.flatMap(event=>{
    const match=/^evt-(disaster-shelter-[1-9]\d*)-[0-9]+-[a-z-]+$/.exec(event.id);
    return match?[match[1]]:[];
  }));
  const closed=state.cases.filter(row=>!disasterShelterOpen(row)&&!disasterShelterStrandedInterior(row)&&
    row.closedTick!==world.tick&&!hotIds.has(row.id))
    .sort((a,b)=>(b.closedTick??0)-(a.closedTick??0)||Number(b.id.slice('disaster-shelter-'.length))-Number(a.id.slice('disaster-shelter-'.length)));
  if(closed.length>DISASTER_SHELTER_HISTORY){
    const drop=new Set(closed.slice(DISASTER_SHELTER_HISTORY));
    state.cases=state.cases.filter(row=>!drop.has(row));
  }
}
const payloadKeys=new Set(['chosenAction','innerMonologue','disasterShelterMove','targetCultivatorId','targetDisasterShelterId']);
export function resolveDisasterShelterAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='DISASTER_SHELTER'||Object.keys(payload).some(key=>!payloadKeys.has(key)))return null;
  const action=availableDisasterShelterActions(actor,world).find(option=>option.disasterShelterMove===payload.disasterShelterMove&&
    option.targetCultivatorId===payload.targetCultivatorId&&option.targetDisasterShelterId===payload.targetDisasterShelterId);
  if(!action)return null;
  const tick=world.tick;
  if(action.disasterShelterMove==='offer'){
    const guest=findActor(world,action.targetCultivatorId);
    const proof=guest&&source(world,actor,guest,tick);
    if(!proof)return null;
    const state=world.disasterShelter??={cases:[],nextId:1};
    const row:DisasterShelter={...proof,id:`disaster-shelter-${state.nextId++}`,offeredTick:tick,
      expiresTick:tick+DISASTER_SHELTER_OFFER_TICKS,status:'offered',pathIndex:0,steps:[]};
    state.cases.push(row);
    return event(world,row,'offer');
  }
  const row=caseRows(world).find(item=>item.id===action.targetDisasterShelterId);
  if(!row)return null;
  if(action.disasterShelterMove==='accept'){
    row.status='reserved';row.acceptedTick=tick;
    return event(world,row,'accept');
  }
  if(action.disasterShelterMove==='return'){
    row.status='returning';row.returnRequestedTick=tick;
    return event(world,row,'return-requested');
  }
  const terminal=action.disasterShelterMove==='decline'?'declined':'withdrawn';
  row.status=terminal;row.closeReason=terminal;row.closedTick=tick;
  const receipt=event(world,row,terminal);
  prune(world);
  return receipt;
}

/** No-time interventions may close the right on an actual death, never add a travel step. */
export function reconcileDisasterShelterDeaths(world:WorldState):WorldEvent[]{
  const receipts:WorldEvent[]=[];
  for(const row of caseRows(world)){
    if(!disasterShelterOpen(row))continue;
    const guest=findActor(world,row.guest.actorId),host=findActor(world,row.host.actorId);
    if(guest?.alive&&!(row.status==='offered'&&!host?.alive))continue;
    row.status=guest?.alive?'stranded':'lost';
    row.closedTick=world.tick;
    row.closeReason='party_unavailable';
    receipts.push(event(world,row,row.status));
  }
  return receipts;
}

export function advanceDisasterShelters(world:WorldState):WorldEvent[]{
  const emitted:WorldEvent[]=[];
  if(!world.disasterShelter)return emitted;
  const tick=world.tick;
  for(const row of caseRows(world)){
    if(!disasterShelterOpen(row))continue;
    const guest=findActor(world,row.guest.actorId),host=findActor(world,row.host.actorId);
    if(row.status==='offered'&&tick>=row.expiresTick){
      row.status='expired';row.closedTick=tick;row.closeReason='expired';emitted.push(event(world,row,'expired'));continue;
    }
    if(!guest?.alive){
      row.status='lost';row.closedTick=tick;row.closeReason='party_unavailable';emitted.push(event(world,row,'lost'));continue;
    }
    if(row.status==='offered'&&!host?.alive){
      row.status='stranded';row.closedTick=tick;row.closeReason='party_unavailable';emitted.push(event(world,row,'stranded'));continue;
    }
    const returning=row.status==='returning';
    if(row.status!=='reserved'&&row.status!=='outbound'&&!returning)continue;
    if(!live(guest)||tick<=(returning?(row.returnRequestedTick??tick):(row.acceptedTick??tick))||
      row.steps.at(-1)?.tick===tick)continue;
    const sites=routeSites(world,row,tick),last=row.path.length-1;
    const correctLodging=guest.locationId===(returning?row.host.siteId:row.guest.siteId);
    if(!sites||!correctLodging){
      row.status='stranded';row.closedTick=tick;row.closeReason='site_unavailable';emitted.push(event(world,row,'stranded'));continue;
    }
    const next=row.pathIndex+(returning?-1:1),currentTile=row.path[row.pathIndex],nextTile=row.path[next];
    const blockedHere=returning||row.pathIndex!==0?hazardAt(world,currentTile,tick):blockedOutwardOrigin(world,row.hazard,tick);
    if(!nextTile||blockedHere||hazardAt(world,nextTile,tick))continue;
    row.pathIndex=next;
    row.steps.push({tick,pathIndex:next,tileId:nextTile,direction:returning?'return':'outbound'});
    if(returning){
      row.returnDepartedTick??=tick;
      if(next===0){
        guest.locationId=row.guest.siteId;row.status='returned';row.returnedTick=tick;row.closedTick=tick;
        emitted.push(event(world,row,'returned'));
      } else emitted.push(event(world,row,'returning'));
    }else{
      row.departedTick??=tick;
      if(next===last){
        guest.locationId=row.host.siteId;row.status='occupied';row.arrivedTick=tick;
        emitted.push(event(world,row,'occupied'));
      }else{
        row.status='outbound';emitted.push(event(world,row,'outbound'));
      }
    }
  }
  prune(world);
  return emitted;
}
export function projectDisasterShelters(world:WorldState,viewer?:Cultivator):DisasterShelter[]{
  if(!live(viewer)||!world.cultivators.includes(viewer))return [];
  return caseRows(world).filter(row=>row.host.actorId===viewer.id||row.guest.actorId===viewer.id).map(row=>structuredClone(row));
}

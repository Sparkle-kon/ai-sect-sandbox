import {nightDoorBedsHeld,nightDoorGuestHeld,nightDoorHouseholdHeld} from './nightDoorBeds';
import type {Cultivator,HousingClaim,HousingMove,LLMDecisionPayload,RouteWarningHazardProof,SeasonalHousingState,VillageWorkProject,WorldEvent,WorldState} from '../types/world';
import {routeWarningHazardValid} from './routeWarningProof';
import {courierActedThisTick} from './sealedCourierEngine';
import {knownMapLocations,terrainTileAt} from './terrainEngine';
import {presentAtVillageGranary} from './villageGranaryEngine';
import {disasterShelterRoomHeld} from './disasterShelterCheckpoint';
import {VILLAGE_WORK_RULES} from './villageWorksEngine';

export const createSeasonalHousingState=():SeasonalHousingState=>({claims:[],nextId:1});
export const housingSeasonEnd=(tick:number,month:number)=>tick+3-(month-1)%3;
export type SeasonalHousingOption={action:'SEASONAL_HOUSING'}&(
  | {housingMove:'offer';targetHousingHouseholdId:string;targetCultivatorId:string;targetHousingClaimId?:never}
  | {housingMove:Exclude<HousingMove,'offer'>;targetHousingClaimId:string;targetHousingHouseholdId?:never;targetCultivatorId?:never}
);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0&&actor.age>=18;
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const publicSite=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id&&row.type!=='secret_realm'&&row.type!=='abyss');
const open=(row:HousingClaim)=>row.status==='offered'||row.status==='reserved'||row.status==='occupied';
const usesRoom=(row:HousingClaim)=>row.status==='reserved'||row.status==='occupied';
const eligibleProject=(row:VillageWorkProject,villageId:string,tick:number)=>row.kind==='shelter'&&row.status==='completed'&&
  row.settlementId===villageId&&row.settledTick!==undefined&&row.settledTick<tick&&row.capacityBefore!==undefined&&
  row.capacityAfter===row.capacityBefore+VILLAGE_WORK_RULES.shelter.capacityGain&&row.laborTotal===VILLAGE_WORK_RULES.shelter.labor&&
  row.stonesSpent===VILLAGE_WORK_RULES.shelter.stones&&row.rootsSpent===VILLAGE_WORK_RULES.shelter.roots&&
  row.receipts.reduce((sum,receipt)=>sum+receipt.labor,0)===row.laborTotal;
export function housingShelterProof(world:WorldState,villageId:string,projectId:string,tick:number){
  return world.villageWorks.projects.find(row=>row.id===projectId&&eligibleProject(row,villageId,tick));
}
const hazardAt=(world:WorldState,siteId:string,tick:number):RouteWarningHazardProof|undefined=>{
  const site=publicSite(world,siteId);
  const tile=site&&terrainTileAt(world,site.x,site.y);
  const hazard=tile&&world.mapHazards.find(row=>row.tileId===tile.id&&row.intensity>=2&&routeWarningHazardValid(world,row,tick));
  return hazard&&{id:hazard.id,tileId:hazard.tileId,kind:hazard.kind,intensity:hazard.intensity,
    createdTick:hazard.createdTick,expiresTick:hazard.expiresTick};
};
function hostHousehold(world:WorldState,host:Cultivator,householdId:string,settlementId:string){
  const group=world.households.groups.find(row=>row.id===householdId);
  const presence=group?.presences.find(row=>row.settlementId===settlementId);
  return !!presence&&presence.adults>0&&world.households.members.some(row=>row.householdId===householdId&&row.status==='recruited'&&
    row.recruitedId===host.id&&row.settlementId===settlementId);
}
function hasRoute(world:WorldState,actor:Cultivator,tick:number){
  const id=actor.id;
  return tick===world.tick&&courierActedThisTick(world,actor)||
    world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'))||
    world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&(row.status==='active'||row.lastMovedTick===tick))||
    world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')||
    world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))||
    world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))||
    world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))||
    world.occasions.some(row=>(row.status==='running'||row.status==='registration')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))||
    world.expeditionRescues.requests.some(row=>(row.explorerId===id||row.rescuerId===id)&&row.supplySpent===1&&
      (row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&!row.arrivedIds?.includes(id)&&
        world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}
const settled=(world:WorldState,actor:Cultivator,tick:number)=>!!publicSite(world,actor.locationId)&&
  actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&!hasRoute(world,actor,tick);
export function housingVacantCapacity(world:WorldState,villageId:string,tick:number){
  const village=world.settlements.villages.find(row=>row.id===villageId);
  if(!village||village.population<1||!publicSite(world,village.locationId))return 0;
  const maintained=world.villageWorks.projects.filter(row=>eligibleProject(row,villageId,tick)).length*VILLAGE_WORK_RULES.shelter.capacityGain;
  return Math.max(0, Math.min(maintained,village.capacity-village.population)-nightDoorBedsHeld(world,villageId,tick));
}
export const seasonalHousingRoomHeld=(row:HousingClaim,tick:number)=>usesRoom(row)&&tick<row.seasonEndTick&&
  (row.status==='occupied'||row.arriveByTick!==undefined&&tick<row.arriveByTick);
function roomAvailable(world:WorldState,claim:Pick<HousingClaim,'guestId'|'householdId'|'settlementId'>,tick:number){
  const holds=world.seasonalHousing.claims.filter(row=>seasonalHousingRoomHeld(row,tick));
  const disasters=world.disasterShelter?.cases.filter(disasterShelterRoomHeld)??[];
  if(disasters.some(row=>row.guest.actorId===claim.guestId)||nightDoorGuestHeld(world,claim.guestId,tick)||
    nightDoorHouseholdHeld(world,claim.householdId,tick))return false;
  return !holds.some(row=>row.guestId===claim.guestId||row.householdId===claim.householdId)&&
    holds.filter(row=>row.settlementId===claim.settlementId).length+
    disasters.filter(row=>row.host.settlementId===claim.settlementId).length<housingVacantCapacity(world,claim.settlementId,tick);
}
function canSponsor(world:WorldState,row:HousingClaim,tick:number){
  const host=actorAt(world,row.hostId);
  return live(host)&&presentAtVillageGranary(world,host,tick)?.id===row.settlementId&&
    hostHousehold(world,host,row.householdId,row.settlementId);
}
const knownPeer=(world:WorldState,host:Cultivator,guest:Cultivator)=>world.relationships.some(row=>
  row.fromId===host.id&&row.toId===guest.id||row.fromId===guest.id&&row.toId===host.id);
const inHousehold=(world:WorldState,householdId:string,actorId:string)=>world.households.members.some(row=>
  row.householdId===householdId&&row.recruitedId===actorId);
const futureMonth=(world:WorldState,tick:number)=>(world.month-1+tick-world.tick)%12+1;

export function availableSeasonalHousingActions(actor:Cultivator,world:WorldState,executionTick=world.tick):SeasonalHousingOption[]{
  if(!live(actor)||!world.cultivators.includes(actor)||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const actions:SeasonalHousingOption[]=[],state=world.seasonalHousing;
  const seasonStart=housingSeasonEnd(executionTick,futureMonth(world,executionTick));
  const local=presentAtVillageGranary(world,actor,executionTick);
  const source=local&&world.villageWorks.projects.find(row=>eligibleProject(row,local.id,executionTick));
  if(local&&source&&seasonStart>=executionTick+2&&!hazardAt(world,local.locationId,executionTick)){
    for(const member of world.households.members){
      if(member.recruitedId!==actor.id||!hostHousehold(world,actor,member.householdId,local.id)||
         state.claims.some(row=>row.householdId===member.householdId&&open(row)))continue;
      for(const guest of world.cultivators){
        if(guest.id===actor.id||!live(guest)||!settled(world,guest,executionTick)||guest.locationId===local.locationId||
           !knownPeer(world,actor,guest)||!knownMapLocations(world,guest).some(site=>site.id===local.locationId)||inHousehold(world,member.householdId,guest.id)||state.claims.some(row=>row.guestId===guest.id&&open(row))||
           !roomAvailable(world,{householdId:member.householdId,guestId:guest.id,settlementId:local.id},executionTick))continue;
        actions.push({action:'SEASONAL_HOUSING',housingMove:'offer',targetHousingHouseholdId:member.householdId,targetCultivatorId:guest.id});
      }
    }
  }
  for(const row of state.claims){
    if(!open(row)||executionTick>=row.seasonEndTick)continue;
    if(row.hostId===actor.id&&canSponsor(world,row,executionTick))
      actions.push({action:'SEASONAL_HOUSING',housingMove:'revoke',targetHousingClaimId:row.id});
    if(row.guestId!==actor.id||!settled(world,actor,executionTick))continue;
    if(row.status==='offered'&&row.offeredTick<executionTick&&executionTick<row.expiresTick){
      actions.push({action:'SEASONAL_HOUSING',housingMove:'decline',targetHousingClaimId:row.id});
      if(actor.locationId!==row.siteId&&canSponsor(world,row,executionTick)&&roomAvailable(world,row,executionTick)&&
        housingShelterProof(world,row.settlementId,row.shelterProjectId,executionTick)&&!hazardAt(world,row.siteId,executionTick))
        actions.push({action:'SEASONAL_HOUSING',housingMove:'accept',targetHousingClaimId:row.id});
    }
    if(row.status==='reserved'){
      actions.push({action:'SEASONAL_HOUSING',housingMove:'withdraw',targetHousingClaimId:row.id});
      if(row.acceptedTick!==undefined&&row.arrival&&row.acceptedTick<row.arrival.tick&&row.arrival.tick<executionTick&&
          executionTick>=row.seasonStartTick&&row.arriveByTick!==undefined&&executionTick<row.arriveByTick&&
          actor.locationId===row.siteId&&local?.id===row.settlementId&&canSponsor(world,row,executionTick)&&!hazardAt(world,row.siteId,executionTick))
        actions.push({action:'SEASONAL_HOUSING',housingMove:'check_in',targetHousingClaimId:row.id});
    }
  }
  return actions;
}
function receipt(world:WorldState,row:HousingClaim,title:string,description:string):WorldEvent{
  return {id:`evt-${row.id}-${world.tick}-${row.status}`,tick:world.tick,year:world.year,month:world.month,title,description,
    category:'diplomacy',locationId:row.siteId,actorIds:[row.hostId,row.guestId],witnessScope:'participants'};
}
function close(row:HousingClaim,world:WorldState,reason:NonNullable<HousingClaim['reason']>){
  row.status='closed';row.endedTick=world.tick;row.reason=reason;
}
export function resolveSeasonalHousingAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='SEASONAL_HOUSING')return null;
  const fields=new Set(['chosenAction','innerMonologue','spokenLine','housingMove','targetHousingHouseholdId','targetCultivatorId','targetHousingClaimId']);
  if(Object.keys(payload).some(key=>!fields.has(key)))return null;
  const choice=availableSeasonalHousingActions(actor,world).find(option=>option.housingMove===payload.housingMove&&
    option.targetCultivatorId===payload.targetCultivatorId&&option.targetHousingHouseholdId===payload.targetHousingHouseholdId&&
    option.targetHousingClaimId===payload.targetHousingClaimId);
  if(!choice)return null;
  const state=world.seasonalHousing;
  if(choice.housingMove==='offer'){
    const village=presentAtVillageGranary(world,actor)!;
    const project=world.villageWorks.projects.find(row=>eligibleProject(row,village.id,world.tick))!;
    const seasonStartTick=housingSeasonEnd(world.tick,world.month),seasonEndTick=seasonStartTick+3;
    const row:HousingClaim={id:`housing-claim-${state.nextId++}`,householdId:choice.targetHousingHouseholdId,
      hostId:actor.id,guestId:choice.targetCultivatorId,settlementId:village.id,siteId:village.locationId,shelterProjectId:project.id,
      offeredTick:world.tick,expiresTick:seasonStartTick+1,seasonStartTick,seasonEndTick,status:'offered'};
    state.claims.push(row);
    return receipt(world,row,'节令借居待应','尚未留房或入住。');
  }
  const row=state.claims.find(item=>item.id===choice.targetHousingClaimId)!;
  if(choice.housingMove==='accept'){
    row.status='reserved';row.acceptedTick=world.tick;row.arriveByTick=row.seasonEndTick;
    return receipt(world,row,'访客应允留房','暂留一处房舍。人尚未入住，也不计入在册人口。');
  }
  if(choice.housingMove==='check_in'){
    row.status='occupied';row.checkedInTick=world.tick;
    return receipt(world,row,'访客实地入住','已核明本人抵达并入住。访客不是村中在册居民。');
  }
  if(choice.housingMove==='decline'){close(row,world,'guest_declined');}
  else if(choice.housingMove==='withdraw'){close(row,world,'guest_withdrew');}
  else close(row,world,'host_revoked');
  return receipt(world,row,'借居约止','借居资格已结束；本记录不证明任何人迁出。');
}

/* Immediate hook, only after genuine native EXPLORE changed this exact actor's location. */
export function recordSeasonalHousingMovement(world:WorldState,actor:Cultivator,previousLocationId:string):WorldEvent|null{
  if(!live(actor)||!world.cultivators.includes(actor)||actor.locationId===previousLocationId||
      !publicSite(world,previousLocationId)||!settled(world,actor,world.tick))return null;
  const openRoom=world.seasonalHousing.claims.find(item=>usesRoom(item)&&item.guestId===actor.id&&world.tick<item.seasonEndTick);
  if(!openRoom)return null;
  const proof={tick:world.tick,fromSiteId:previousLocationId,toSiteId:actor.locationId};
  if(openRoom.status==='reserved'&&actor.locationId===openRoom.siteId&&openRoom.acceptedTick!==undefined&&
      openRoom.acceptedTick<world.tick&&openRoom.arriveByTick!==undefined&&world.tick+1<openRoom.arriveByTick){
    if(openRoom.arrival)return null;
    openRoom.arrival=proof;
    const arrived=receipt(world,openRoom,'访客实地抵达','人已到村，仍须本人办理入住。');
    return {...arrived,id:`evt-${openRoom.id}-${world.tick}-arrived`};
  }
  if(openRoom.status!=='occupied'||openRoom.siteId!==previousLocationId||
      openRoom.checkedInTick===undefined||openRoom.checkedInTick>=world.tick)return null;
  openRoom.status='moved_out';openRoom.endedTick=world.tick;openRoom.departure=proof;
  return receipt(world,openRoom,'访客实地迁出','已见本人离开原借居村址，借居房舍归还；村籍未变。');
}

/** May run early after settlement/hazards and late after native routes; status gates make it idempotent. */
export function advanceSeasonalHousing(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[],tick=world.tick,used=new Map<string,number>();
  for(const row of world.disasterShelter?.cases??[])if(disasterShelterRoomHeld(row))
    used.set(row.host.settlementId,(used.get(row.host.settlementId)??0)+1);
  const booked=[...world.seasonalHousing.claims].sort((a,b)=>(a.acceptedTick??Infinity)-(b.acceptedTick??Infinity));
  for(const row of booked){
    if(!open(row))continue;
    const host=actorAt(world,row.hostId),guest=actorAt(world,row.guestId),village=world.settlements.villages.find(item=>item.id===row.settlementId);
    const hazard=hazardAt(world,row.siteId,tick);
    let reason:HousingClaim['reason'];
    if(row.status==='offered'&&tick>=row.expiresTick)reason='offer_expired';
    else if(tick>=row.seasonEndTick)reason='season_ended';
    else if(!live(host)||!live(guest))reason='party_unavailable';
    else if(!village?.population||village.locationId!==row.siteId||!publicSite(world,row.siteId)||
      !housingShelterProof(world,row.settlementId,row.shelterProjectId,tick)||
      !hostHousehold(world,host,row.householdId,row.settlementId))reason='shelter_unavailable';
    else if(hazard){reason='unsafe_shelter';row.hazard=hazard;}
    else if((row.status==='occupied'||row.status==='reserved'&&row.arrival)&&
      (guest.locationId!==row.siteId||hasRoute(world,guest,tick)))reason='route_interrupted';
    else if(usesRoom(row)){
      const current=used.get(row.settlementId)??0;
      if(current>=housingVacantCapacity(world,row.settlementId,tick))reason='no_spare_room';
      else used.set(row.settlementId,current+1);
    }
    if(reason){
      close(row,world,reason);
      events.push(receipt(world,row,'借居资格已止','房舍不再留用；未在本记录办理实地迁出。'));
    }
  }
  return events;
}

export function projectSeasonalHousing(world:WorldState,viewer?:Cultivator){
  if(!live(viewer)||!world.cultivators.includes(viewer))return [];
  return world.seasonalHousing.claims.filter(row=>row.hostId===viewer.id||row.guestId===viewer.id)
    .map(row=>({...row,...(row.hazard?{hazard:{...row.hazard}}:{}),...(row.arrival?{arrival:{...row.arrival}}:{}),...(row.departure?{departure:{...row.departure}}:{})}));
}

export function seasonalHousingTravelTarget(world:WorldState,actor:Cultivator,executionTick=world.tick){
  if(!live(actor)||!settled(world,actor,executionTick))return undefined;
  const reserved=world.seasonalHousing.claims.find(row=>row.guestId===actor.id&&row.status==='reserved'&&
    !row.arrival&&row.arriveByTick!==undefined&&executionTick+1<row.arriveByTick&&row.acceptedTick!==undefined&&executionTick>row.acceptedTick);
  return reserved&&actor.locationId!==reserved.siteId&&knownMapLocations(world,actor).some(site=>site.id===reserved.siteId)?
    reserved.siteId:undefined;
}

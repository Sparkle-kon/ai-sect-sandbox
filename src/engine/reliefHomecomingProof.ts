import type {ReliefHomecomingScene} from '../types/reliefHomecoming';
import type {WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {terrainTileAt} from './terrainEngine';
export const DEPARTURE_TTL=12,RETURN_WINDOW=12;
export function oneHomecoming<T>(rows:readonly T[],accept:(row:T)=>boolean){
  let match:T|undefined;for(const row of rows)if(accept(row)){if(match!==undefined)return;match=row;}return match;
}
const one=oneHomecoming;
export const homeActor=(world:WorldState,id:string)=>one(world.cultivators,row=>row.id===id);
export const homeSite=(world:WorldState,id:string)=>{
  const site=one(world.locations,row=>row.id===id);
  return site?.type==='market'&&!isScopedExpeditionGate(site)?site:undefined;
};
export function homeEnrollment(world:WorldState,actorId:string,villageId:string,before:number){
  const member=one(world.households.members,item=>item.recruitedId===actorId);
  const person=homeActor(world,actorId);
  if(!member||member.settlementId!==villageId||!person||
    (member.status!=='recruited'&&!(member.status==='deceased'&&!person.alive&&person.hp===0))||
    actorId!==`recruit-${member.volunteerId}`||member.settledTick===undefined)return;
  const linked=one(world.settlements.records,row=>row.kind==='recruitment'&&row.settlementId===villageId&&
    row.volunteerId===member.volunteerId&&row.cultivatorId===actorId&&row.tick<before&&row.tick>=member.registeredTick&&
    (member.status==='deceased'?row.tick<=member.settledTick!:row.tick===member.settledTick)&&
    row.id===`settlement-${row.tick}-recruitment-${villageId}-${member.volunteerId}`&&row.people===1&&row.stones===25&&row.herbs===0);
  return linked?{member,linked}:undefined;
}
const clock=(world:WorldState,tick:number)=>{const t=world.year*12+world.month-1-(world.tick-tick);return{year:Math.floor(t/12),month:t%12+1};};
function date(world:WorldState,event:WorldEvent,tick:number){
  const c=clock(world,tick);return event.tick===tick&&event.year===c.year&&event.month===c.month;
}
export const homecomingId=(aidId:string,travelerId:string)=>`relief-homecoming-${aidId}-${travelerId}`;
export function homecomingAuthority(world:WorldState,row:ReliefHomecomingScene,currentAid?:WorldEvent){
  const site=homeSite(world,row.siteId),village=one(world.settlements.villages,item=>item.id===row.villageId&&item.locationId===row.siteId);
  const deed=one(world.civicMemorials.deeds,item=>item.id===row.deedId);
  const aid=one(world.settlements.records,item=>item.id===row.reliefRecordId);
  const disaster=one(world.settlements.records,item=>item.id===row.disasterRecordId);
  const helper=homeEnrollment(world,row.helperId,row.villageId,row.reliefTick);
  const traveler=homeEnrollment(world,row.travelerId,row.villageId,row.departureTick);
  if(!site||!village||!deed||!aid||!disaster||!helper||!traveler||row.helperId===row.travelerId||
    aid.kind!=='relief'||aid.actorId!==row.helperId||aid.tick!==row.reliefTick||aid.settlementId!==row.villageId||
    aid.stones!==12||aid.herbs!==2||aid.people!==0||aid.id!==`settlement-${aid.tick}-relief-${row.villageId}-${row.helperId}`||
    deed.reliefRecordId!==aid.id||deed.siteId!==site.id||deed.settlementId!==row.villageId||deed.subjectId!==row.helperId||
    deed.tick!==aid.tick||deed.stones!==aid.stones||deed.herbs!==aid.herbs||deed.volunteerId!==helper.member.volunteerId||
    deed.householdId!==helper.member.householdId||deed.enrolledTick!==helper.linked.tick||
    disaster.kind!=='disaster'||disaster.settlementId!==row.villageId||disaster.people<=0||
    disaster.id!==`settlement-${disaster.tick}-disaster-${row.villageId}-${row.hazardId}`||
    disaster.tick<=row.departureTick||disaster.tick>=row.reliefTick||row.reliefTick-row.departureTick>DEPARTURE_TTL||
    row.reliefTick>=row.hazardExpiresTick||row.hazardExpiresTick-disaster.tick>4||row.hazardExpiresTick<=disaster.tick||
    row.id!==homecomingId(aid.id,row.travelerId))return;
  const hazardRows=world.mapHazards.filter(hazard=>hazard.id===row.hazardId),hazard=hazardRows[0];
  if(hazardRows.length>1||hazard&&(
    hazard.kind!=='beast_tide'||hazard.expiresTick!==row.hazardExpiresTick||hazard.createdTick>disaster.tick||
    hazard.expiresTick!==hazard.createdTick+4||hazard.tileId!==terrainTileAt(world,site.x,site.y)?.id))return;
  const original=world.events.filter(event=>event.id===`evt-${aid.id}`);
  const reliefMatches=(event:WorldEvent)=>event.id===`evt-${aid.id}`&&date(world,event,aid.tick)&&
    event.category==='diplomacy'&&event.witnessScope===undefined&&event.locationId===site.id&&
    event.title==='凡村赈济'&&event.description===aid.description&&event.actorIds.length===1&&event.actorIds[0]===row.helperId;
  const hot=(tick:number)=>world.events.length<120||world.events.some(event=>event.tick<tick);
  if(original.length>1||original[0]&&!reliefMatches(original[0])||currentAid&&!reliefMatches(currentAid)||
    !original.length&&!currentAid&&hot(aid.tick))return;
  const old=world.events.filter(event=>event.id===`evt-${disaster.id}`);
  if(old.length>1||!old.length&&hot(disaster.tick)||old[0]&&(!date(world,old[0],disaster.tick)||old[0].category!=='diplomacy'||
    old[0].witnessScope!==undefined||old[0].locationId!==site.id||old[0].title!=='凡村灾情'||
    old[0].description!==disaster.description||old[0].actorIds.length>0))return;
  return {site,deed};
}
export function validateReliefHomecomingSave(world:WorldState,fail:(path:string)=>never):void{
  const state=world.reliefHomecomings;
  if(!state)return;
  if(!state.departures.length&&!state.scenes.length)fail('reliefHomecomings.empty');
  const ids=new Set<string>(),pending=new Set<string>();
  const witnessed=(ids:readonly string[])=>ids.length>0&&ids.every((id,index)=>
    (index===0||ids[index-1]<id)&&!!homeActor(world,id));
  for(const row of state.departures){
    if(pending.has(row.actorId)||!homeEnrollment(world,row.actorId,row.villageId,row.tick)||
      !homeSite(world,row.siteId)||!one(world.settlements.villages,item=>item.id===row.villageId&&item.locationId===row.siteId)||
      !Number.isSafeInteger(row.tick)||row.tick<1||row.tick>world.tick||world.tick-row.tick>DEPARTURE_TTL)fail('reliefHomecomings.departure');
    pending.add(row.actorId);
  }
  for(const row of state.scenes){
    const proof=homecomingAuthority(world,row);
    if(ids.has(row.id)||!proof||!Number.isSafeInteger(row.reliefTick)||row.reliefTick>world.tick||
      !Number.isSafeInteger(row.departureTick)||row.departureTick<1||!Number.isSafeInteger(row.hazardExpiresTick)||
      !witnessed(row.aidWitnessIds)||!row.aidWitnessIds.includes(row.helperId)||row.aidWitnessIds.includes(row.travelerId)||
      row.aidWitnessIds.some(id=>id!==row.helperId&&!proof.deed.witnessIds.includes(id)))fail('reliefHomecomings.scene');
    ids.add(row.id);
    if(row.return){
      const {tick,witnessIds}=row.return;
      if(!Number.isSafeInteger(tick)||tick<row.hazardExpiresTick||tick<=row.reliefTick||tick-row.reliefTick>RETURN_WINDOW||tick>world.tick||
        !witnessed(witnessIds)||!witnessIds.includes(row.travelerId))fail('reliefHomecomings.return');
    }
  }
}

export function reliefHomecomingPinnedSettlementIds(world:WorldState):string[]{
  const ids=new Set<string>();
  const state=world.reliefHomecomings;
  for(const row of state?.departures??[]){
    const source=homeEnrollment(world,row.actorId,row.villageId,row.tick)?.linked;
    if(source)ids.add(source.id);
  }
  for(const row of state?.scenes??[]){
    ids.add(row.reliefRecordId);ids.add(row.disasterRecordId);
    const helper=homeEnrollment(world,row.helperId,row.villageId,row.reliefTick)?.linked;
    const traveler=homeEnrollment(world,row.travelerId,row.villageId,row.departureTick)?.linked;
    if(helper)ids.add(helper.id);
    if(traveler)ids.add(traveler.id);
  }
  return [...ids];
}

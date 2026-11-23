import type {ReliefHomecomingScene,ReliefHomecomingView} from '../types/reliefHomecoming';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {terrainTileAt} from './terrainEngine';
import {DEPARTURE_TTL,RETURN_WINDOW,homeActor,homecomingAuthority,homecomingId,homeEnrollment,homeSite,oneHomecoming} from './reliefHomecomingProof';
export type {ReliefHomecomingView} from '../types/reliefHomecoming';

const one=oneHomecoming;
const state=(world:WorldState)=>world.reliefHomecomings??={departures:[],scenes:[]};
const canonical=(world:WorldState,actor:Cultivator)=>homeActor(world,actor.id)===actor&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const located=(world:WorldState,actor:Cultivator,siteId:string)=>canonical(world,actor)&&isGrandSiegeFighterPresent(world,actor,siteId);
const villageAt=(world:WorldState,siteId:string)=>one(world.settlements.villages,row=>row.locationId===siteId);
const quiet=(world:WorldState,siteId:string)=>{
  const place=homeSite(world,siteId),tile=place&&terrainTileAt(world,place.x,place.y);
  return !!tile&&!world.mapHazards.some(hazard=>hazard.tileId===tile.id&&hazard.createdTick<=world.tick&&hazard.expiresTick>world.tick);
};
export function recordReliefHomecomingMovement(world:WorldState,actor:Cultivator,fromSiteId:string):void{
  if(actor.currentAction!=='EXPLORE'||fromSiteId===actor.locationId||!canonical(world,actor))return;
  const existing=world.reliefHomecomings;
  if(existing&&homeSite(world,actor.locationId)&&located(world,actor,actor.locationId)&&quiet(world,actor.locationId)){
    for(const scene of existing.scenes){
      if(scene.travelerId!==actor.id||scene.siteId!==actor.locationId||scene.return||scene.reliefTick>=world.tick||
        world.tick<scene.hazardExpiresTick||world.tick-scene.reliefTick>RETURN_WINDOW||!homecomingAuthority(world,scene))continue;
      const witnesses=world.cultivators.filter(body=>body.locationId===scene.siteId&&located(world,body,scene.siteId))
        .map(body=>body.id).sort();
      scene.return={tick:world.tick,witnessIds:witnesses};
    }
  }
  if(existing)existing.departures=existing.departures.filter(row=>row.actorId!==actor.id||row.siteId!==actor.locationId);
  const origin=homeSite(world,fromSiteId),village=origin&&villageAt(world,origin.id);
  if(!origin||!village||!homeEnrollment(world,actor.id,village.id,world.tick))return;
  const ledger=state(world);
  ledger.departures=ledger.departures.filter(row=>row.actorId!==actor.id);
  ledger.departures.push({actorId:actor.id,villageId:village.id,siteId:origin.id,tick:world.tick});
}
export function recordReliefHomecomingAid(world:WorldState,event:WorldEvent):void{
  const ledger=world.reliefHomecomings;
  if(!ledger?.departures.length||event.witnessScope!==undefined||event.title!=='凡村赈济'||!event.locationId||event.tick!==world.tick||
    event.actorIds.length!==1)return;
  const site=homeSite(world,event.locationId),village=site&&villageAt(world,site.id);
  const helper=homeActor(world,event.actorIds[0]);
  if(!site||!village||!helper||!located(world,helper,site.id))return;
  const deed=one(world.civicMemorials.deeds,row=>`evt-${row.reliefRecordId}`===event.id&&row.subjectId===helper.id&&row.tick===world.tick);
  if(!deed)return;
  const tile=terrainTileAt(world,site.x,site.y);
  for(const departure of ledger.departures){
    if(departure.siteId!==site.id||departure.villageId!==village.id||departure.actorId===helper.id||
      departure.tick>=world.tick||world.tick-departure.tick>DEPARTURE_TTL)continue;
    const traveler=homeActor(world,departure.actorId);
    if(!traveler||!canonical(world,traveler)||traveler.locationId===site.id)continue;
    const hazards=world.mapHazards.filter(hazard=>hazard.kind==='beast_tide'&&hazard.tileId===tile?.id&&
      hazard.createdTick>=departure.tick&&hazard.createdTick<world.tick&&hazard.expiresTick>world.tick);
    const hazard=hazards.length===1?hazards[0]:undefined;
    if(!hazard)continue;
    const disaster=one(world.settlements.records,row=>row.kind==='disaster'&&row.settlementId===village.id&&row.people>0&&
      row.tick>departure.tick&&row.tick<world.tick&&row.id===`settlement-${row.tick}-disaster-${village.id}-${hazard.id}`);
    if(!disaster)continue;
    const id=homecomingId(deed.reliefRecordId,traveler.id);
    if(ledger.scenes.some(row=>row.id===id||row.hazardId===hazard.id&&row.travelerId===traveler.id))continue;
    const witnesses=[helper.id,...deed.witnessIds.filter(id=>{
      const actor=homeActor(world,id);return !!actor&&id!==helper.id&&id!==traveler.id&&located(world,actor,site.id);
    })].sort();
    const scene:ReliefHomecomingScene={id,villageId:village.id,siteId:site.id,travelerId:traveler.id,helperId:helper.id,
      departureTick:departure.tick,disasterRecordId:disaster.id,hazardId:hazard.id,hazardExpiresTick:hazard.expiresTick,
      reliefRecordId:deed.reliefRecordId,deedId:deed.id,reliefTick:world.tick,aidWitnessIds:witnesses};
    if(homecomingAuthority(world,scene,event))ledger.scenes.push(scene);
  }
}
export function advanceReliefHomecomings(world:WorldState):void{
  const ledger=world.reliefHomecomings;
  if(!ledger)return;
  ledger.departures=ledger.departures.filter(row=>world.tick-row.tick<=DEPARTURE_TTL&&!!homeActor(world,row.actorId)?.alive);
  if(!ledger.departures.length&&!ledger.scenes.length)delete world.reliefHomecomings;
}
export function projectReliefHomecoming(world:WorldState,viewer:Cultivator|undefined):ReliefHomecomingView|undefined{
  if(!viewer||!world.reliefHomecomings||!located(world,viewer,viewer.locationId)||!quiet(world,viewer.locationId))return;
  for(const row of [...world.reliefHomecomings.scenes].reverse()){
    if(row.siteId!==viewer.locationId||world.tick<row.hazardExpiresTick||
      (!row.aidWitnessIds.includes(viewer.id)&&!row.return?.witnessIds.includes(viewer.id)))continue;
    const proof=homecomingAuthority(world,row);
    if(!proof)continue;
    const beats:ReliefHomecomingView['beats'][number][]=[];
    if(row.aidWitnessIds.includes(viewer.id))beats.push({kind:'relief',tick:row.reliefTick,title:'灾后亲见实物赈济',
      line:'灵石和灵叶确实送来了。那一月的坊市里，却没有见到那位旧日同乡。'});
    if(row.return?.witnessIds.includes(viewer.id)&&row.return.tick<=world.tick)
      beats.push({kind:'return',tick:row.return.tick,title:row.aidWitnessIds.includes(viewer.id)?'后来亲见旧人归来':'后来亲见有人到坊',
        line:viewer.id===row.travelerId?'兽潮已歇，我这才踏进坊市。早先这里的事，我没有亲眼见。':
          row.aidWitnessIds.includes(viewer.id)?'兽潮歇后，旧日同乡走进坊市。我只望见这一程的末尾。':
          '兽潮已歇，有一人走进坊市。再早些的事，我没有亲见。'});
    if(beats.length)return {siteId:proof.site.id,siteName:proof.site.name,beats};
  }
}

/** Default narrator, not a new protagonist appointment and never an explicit avatar override. */
export function projectReliefHomecomingLead(world:WorldState):(ReliefHomecomingView&{actorName:string})|undefined{
  for(const row of [...world.reliefHomecomings?.scenes??[]].reverse()){
    const helper=homeActor(world,row.helperId);
    if(!helper)continue;
    const story=projectReliefHomecoming(world,helper);
    if(!story||story.siteId!==row.siteId||!story.beats.some(beat=>beat.kind==='relief'&&beat.tick===row.reliefTick))continue;
    const actorName=helper.name.replace(/[\p{C}]/gu,'').trim().slice(0,70);
    if(actorName)return {...story,actorName};
  }
}

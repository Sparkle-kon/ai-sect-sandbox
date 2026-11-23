import type { ContextualEncounterKind, EncounterContextStamp, RoguelikeEncounterRecord } from '../types/roguelikeEncounter';
import type { Cultivator, LocationNode, SpiritBeast, WorldState } from '../types/world';
import { eraHistoryMatchesLiveEvent } from './eraHistoryIndex';
import { isRewildingAcclimating } from './habitatEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { terrainTileAt } from './terrainEngine';

export const contextualEncounterKind = (kind:RoguelikeEncounterRecord['kind']):kind is ContextualEncounterKind =>
  kind==='beast-guard'||kind==='river-farewell'||kind==='snow-shelter';

type Context=(EncounterContextStamp&{kind:ContextualEncounterKind; accompanying?:SpiritBeast});
const order=<T extends {id:string}>(a:T,b:T)=>a.id<b.id?-1:a.id>b.id?1:0;
const winter=(month:number)=>month===12||month===1||month===2;
export const encounterMonth = (world:WorldState,tick:number) => ((world.month-1-(world.tick-tick))%12+12)%12+1;

export function contextualEncounterRoute(world:WorldState,fromSiteId:string,siteId:string):boolean{
  if(fromSiteId===siteId)return false;
  return [fromSiteId,siteId].every(id=>{
    const sites=world.locations.filter(site=>site.id===id);
    return sites.length===1&&!isScopedExpeditionGate(sites[0]);
  });
}
function danger(world:WorldState,site:LocationNode):string|undefined {
  const tile=terrainTileAt(world,site.x,site.y);
  const hazard=world.mapHazards.filter(row=>row.tileId===tile?.id&&row.createdTick<=world.tick&&row.expiresTick>world.tick&&
    (row.kind==='beast_tide'||row.kind==='cursed_miasma')).sort(order)[0];
  return hazard?.id??world.spiritBeasts.filter(row=>row.alive&&row.hp>0&&!row.tamedBy&&row.kind==='凶兽'&&
    row.locationId===site.id&&!isRewildingAcclimating(world,row.id)).sort(order)[0]?.id;
}
function waterSite(world:WorldState,site:LocationNode):boolean{
  // The coastal crossing's lower port, the named cold-water vein, or a village's real completed well.
  if(site.id==='loc-market-east'&&site.type==='market')return true;
  return world.coldWaterVein?.siteId===site.id||world.villageWorks.projects.some(work=>work.kind==='well'&&
    work.status==='completed'&&world.settlements.villages.some(village=>village.id===work.settlementId&&village.locationId===site.id&&village.population>0));
}
export function locallyBondedBeast(world:WorldState,actor:Cultivator,site:string,expected?:string):SpiritBeast|undefined {
  const all=world.spiritBeasts.filter(row=>row.tamedBy===actor.id&&row.alive&&row.hp>0);
  const unique=all.length===1?all[0]:undefined;
  return unique&&(!expected||unique.id===expected)&&unique.locationId===site&&!isRewildingAcclimating(world,unique.id)?
    unique:undefined;
}
function knownDeath(world:WorldState,actor:Cultivator,deadId:string,eventId:string,openedTick:number):boolean{
  const deaths=world.eraHistory.receipts.filter(death=>death.kind==='death'&&death.actorId===deadId&&
    death.eventId===eventId&&death.tick<openedTick);
  const originals=world.events.filter(event=>event.id===eventId);
  const known=world.relationships.some(edge=>edge.fromId===actor.id&&edge.toId===deadId||edge.toId===actor.id&&edge.fromId===deadId);
  if(deaths.length!==1||originals.length!==1||!known)return false;
  const source=originals[0];
  return source.witnessScope===undefined&&eraHistoryMatchesLiveEvent(deaths[0],source)&&
    (source.actorIds.includes(actor.id)||actor.rumors.some(report=>report.originEventId===source.id&&
      report.originTick===source.tick&&report.witnessScope===undefined&&report.confidence>=80));
}

export function describeEncounterArrival(world:WorldState,actor:Cultivator,fromSiteId:string):Context|undefined {
  const site=world.locations.find(row=>row.id===actor.locationId);
  if(!site||!contextualEncounterRoute(world,fromSiteId,site.id))return;
  const threat=danger(world,site);
  if(threat){
    const pet=locallyBondedBeast(world,actor,site.id)??locallyBondedBeast(world,actor,fromSiteId);
    if(pet&&pet.id!==threat)return {kind:'beast-guard',subjectId:pet.id,sourceId:threat,accompanying:pet};
  }
  if(waterSite(world,site)){
    // An actual known death is required; an unrelated obituary or a bare rumor cannot open the scene.
    const death=world.eraHistory.receipts.flatMap(row=>row.kind==='death'&&row.tick<world.tick&&
      world.cultivators.some(dead=>dead.id===row.actorId&&!dead.alive&&dead.hp===0)&&
      knownDeath(world,actor,row.actorId,row.eventId,world.tick)?[row]:[])
      .sort((a,b)=>b.tick-a.tick||(a.eventId<b.eventId?-1:a.eventId>b.eventId?1:0))[0];
    if(death)return {kind:'river-farewell',subjectId:death.actorId,sourceId:death.eventId};
  }
  if(winter(world.month)){
    const village=world.settlements.villages.filter(row=>row.locationId===site.id&&row.population>0).sort(order)[0];
    if(village)return {kind:'snow-shelter',subjectId:village.id};
  }
  return undefined;
}

export function validEncounterContext(world:WorldState,row:RoguelikeEncounterRecord,live=false):boolean {
  const stamp=row.context;
  if(!contextualEncounterKind(row.kind))return stamp===undefined;
  const site=world.locations.find(site=>site.id===row.siteId);
  if(!world.storyteller||row.openedTick<=world.storyteller.configuredTick||
    !stamp||!site||!contextualEncounterRoute(world,row.fromSiteId,row.siteId))return false;
  switch(row.kind){
    case 'beast-guard': {
      const pet=world.spiritBeasts.find(beast=>beast.id===stamp.subjectId);
      const actor=world.cultivators.find(person=>person.id===row.actorId);
      if(!stamp.sourceId||stamp.sourceId===stamp.subjectId||!actor||!pet)return false;
      // In a retained terminal record the hazard or beast need not remain on the map.
      return !live||locallyBondedBeast(world,actor,row.siteId,stamp.subjectId)===pet&&
        (world.tick>row.openedTick||danger(world,site)===stamp.sourceId);
    }
    case 'river-farewell': {
      const actor=world.cultivators.find(person=>person.id===row.actorId);
      return !!stamp.sourceId&&stamp.subjectId!==row.actorId&&world.cultivators.some(dead=>dead.id===stamp.subjectId&&!dead.alive&&dead.hp===0)&&
        world.eraHistory.receipts.some(death=>death.kind==='death'&&death.actorId===stamp.subjectId&&death.eventId===stamp.sourceId&&death.tick<row.openedTick)&&
        (!live||!!actor&&waterSite(world,site)&&knownDeath(world,actor,stamp.subjectId,stamp.sourceId,row.openedTick));
    }
    case 'snow-shelter': {
      const villages=world.settlements.villages.filter(village=>village.id===stamp.subjectId);
      return stamp.sourceId===undefined&&winter(encounterMonth(world,row.openedTick))&&villages.length===1&&
        (!live||villages[0].locationId===site.id&&villages[0].population>0);
    }
  }
}

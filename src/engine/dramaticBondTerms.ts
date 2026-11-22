import type {DramaticBondFact,DramaticBondFactKind} from '../types/dramaticBond';
import type {LocationNode,WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {matchesWitnessedPersonalScene} from './witnessedPersonalStory';

export const DRAMATIC_BOND_FACTS_MAX=192;
export const DRAMATIC_BOND_WITNESSES_MAX=4;
export const dramaticBondCompareIds=(a:string,b:string)=>a<b?-1:a>b?1:0;
export const dramaticBondCompareFacts=(a:DramaticBondFact,b:DramaticBondFact)=>
  a.tick-b.tick||dramaticBondCompareIds(a.sourceEventId,b.sourceEventId);
export const dramaticBondUnique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let item:T|undefined;
  for(const candidate of rows){
    if(candidate.id!==id)continue;
    if(item)return undefined;
    item=candidate;
  }
  return item;
};
const suffix:Record<DramaticBondFactKind,string>={encounter:'social',practice:'dual_cultivation',duel:'duel',lethal_duel:'kill'};
export const dramaticBondSourceId=(tick:number,initiatorId:string,kind:DramaticBondFactKind)=>`evt-${tick}-${initiatorId}-${suffix[kind]}`;
type PublicVenue=LocationNode&{type:DramaticBondFact['venueKindAtSource']};
const canCaptureVenue=(site:LocationNode):site is PublicVenue=>site.type==='market'||site.type==='sect_hq';
export function dramaticBondVenue(world:WorldState,siteId:string){
  const site=dramaticBondUnique(world.locations,siteId);
  return site&&canCaptureVenue(site)&&!isScopedExpeditionGate(site)?site:undefined;
}
export function dramaticBondReadVenue(world:WorldState,fact:Pick<DramaticBondFact,'siteId'|'venueKindAtSource'>){
  const site=dramaticBondUnique(world.locations,fact.siteId);
  if(!site||isScopedExpeditionGate(site))return undefined;
  if(fact.venueKindAtSource==='market')return site.type==='market'?site:undefined;
  // After a real relocation, the exact former sect HQ is retyped as a public spirit vein.
  return fact.venueKindAtSource==='sect_hq'&&(site.type==='sect_hq'||site.type==='spirit_vein')?site:undefined;
}
export function dramaticBondEventKind(event:WorldEvent):DramaticBondFactKind|undefined{
  const [initiator,other]=event.actorIds;
  if(event.witnessScope!==undefined||!event.locationId||event.actorIds.length!==2||!initiator||!other||initiator===other)return undefined;
  if(event.category==='diplomacy'&&event.duelWinnerId===undefined){
    if(event.id===dramaticBondSourceId(event.tick,initiator,'encounter'))return 'encounter';
    if(event.id===dramaticBondSourceId(event.tick,initiator,'practice')&&event.dialogue?.kind==='dual_cultivation')return 'practice';
  }
  if(event.duelWinnerId!==initiator&&event.duelWinnerId!==other)return undefined;
  if(event.category==='combat'&&event.id===dramaticBondSourceId(event.tick,initiator,'duel'))return 'duel';
  if(event.category==='death'&&event.id===dramaticBondSourceId(event.tick,initiator,'lethal_duel'))return 'lethal_duel';
  return undefined;
}
export function matchesDramaticBondFact(fact:DramaticBondFact,event:WorldEvent):boolean{
  return fact.kind===dramaticBondEventKind(event)&&fact.sourceEventId===event.id&&
    fact.tick===event.tick&&fact.year===event.year&&fact.month===event.month&&fact.siteId===event.locationId&&
    fact.actorIds[0]===event.actorIds[0]&&fact.actorIds[1]===event.actorIds[1]&&fact.winnerId===event.duelWinnerId&&
    (fact.kind==='lethal_duel'?
      fact.fallenId===fact.actorIds.find(id=>id!==event.duelWinnerId):fact.fallenId===undefined);
}
export function dramaticBondWitnessIds(world:WorldState,event:WorldEvent):string[]{
  const kind=dramaticBondEventKind(event);
  if(kind!=='duel'&&kind!=='encounter')return [];
  const scenes=world.witnessedPersonalStory.scenes.filter(row=>row.eventId===event.id);
  if(scenes.length!==1||!matchesWitnessedPersonalScene(scenes[0],event))return [];
  return [...new Set(scenes[0].witnessIds.filter(actorId=>!event.actorIds.includes(actorId)))]
    .sort(dramaticBondCompareIds).slice(0,DRAMATIC_BOND_WITNESSES_MAX);
}

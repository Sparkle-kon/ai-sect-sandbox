import type {Cultivator,LocationNode,WitnessedPersonalScene,WitnessedPersonalStoryState,WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {courierActedThisTick} from './sealedCourierEngine';

export const WITNESSED_PERSONAL_STORY_TICKS=12;
export const WITNESSED_PERSONAL_STORY_SCENES=6;
export const createWitnessedPersonalStoryState=():WitnessedPersonalStoryState=>({scenes:[]});
export interface WitnessedPersonalStoryView {
  actorId:string;
  actorName:string;
  scenes:readonly {eventId:string;tick:number;year:number;month:number;siteName:string;title:string;paragraph:string}[];
}
const prose:Record<WitnessedPersonalScene['kind'],{title:string;participant:string;observer:string}>={
  duel:{title:'坊间斗法',participant:'你亲身参与了这一场斗法。',observer:'你在现场看见两位修士交手。'},
  socialize:{title:'坐而论道',participant:'你在当地与另一位修士坐而论道。',observer:'你在现场看见两位修士坐而论道。'},
  breakthrough:{title:'一朝破境',participant:'你在此地成功破境。',observer:'你在现场看见一位修士破境。'},
};
const label=(text:string)=>text.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,80);
const stableSite=(site:LocationNode)=>site.type!=='secret_realm'&&site.type!=='abyss';
const compareIDs=(a:string,b:string)=>a<b?-1:a>b?1:0;
const exactIDs=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);

export function witnessedPersonalSceneKind(event:WorldEvent):WitnessedPersonalScene['kind']|undefined {
  const [initiator,other]=event.actorIds;
  if(!initiator||!event.locationId||!isChronicleStoryFact(event,event.tick))return undefined;
  const id=(token:string)=>`evt-${event.tick}-${initiator}-${token}`;
  if(event.actorIds.length===1&&event.category==='breakthrough'&&event.id===id('break'))return 'breakthrough';
  if(event.actorIds.length===2&&other&&initiator!==other){
    if(event.category==='combat'&&event.id===id('duel')&&(event.duelWinnerId===initiator||event.duelWinnerId===other))return 'duel';
    if(event.category==='diplomacy'&&event.id===id('social'))return 'socialize';
  }
  return undefined;
}

function settledHere(world:WorldState,actor:Cultivator,siteId:string):boolean{
  if(!actor.alive||!(actor.hp>0)||actor.locationId!==siteId||
     actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon')return false;
  const id=actor.id,tick=world.tick;
  return !courierActedThisTick(world,actor)&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'))&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'||row.startedTick===tick||row.lastMovedTick===tick))&&
    !world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='running'||row.status==='registration')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))&&
    !world.expeditionRescues.requests.some(row=>(row.explorerId===id||row.rescuerId===id)&&row.supplySpent===1&&
      (row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&!row.arrivedIds?.includes(id)&&
       world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}

/** Call only for the immediate result of a supported local actor action, before other actors or phases run. */
export function captureWitnessedPersonalScene(world:WorldState,event:WorldEvent):void{
  if(event.tick!==world.tick||event.year!==world.year||event.month!==world.month)return;
  const kind=witnessedPersonalSceneKind(event);
  const sites=world.locations.filter(row=>row.id===event.locationId);
  if(!kind||sites.length!==1||!stableSite(sites[0]))return;
  const siteId=sites[0].id;
  const witnessIds=world.cultivators.filter(actor=>settledHere(world,actor,siteId)).map(actor=>actor.id).sort(compareIDs);
  if(new Set(witnessIds).size!==witnessIds.length||!event.actorIds.every(id=>witnessIds.includes(id))||
      world.witnessedPersonalStory.scenes.some(row=>row.eventId===event.id))return;
  world.witnessedPersonalStory.scenes.push({eventId:event.id,tick:event.tick,year:event.year,month:event.month,siteId,kind,
    actorIds:[...event.actorIds],witnessIds});
}

/** Requires a still-retained unique public native source; no archive, gossip or prose fallback. */
export function matchesWitnessedPersonalScene(row:WitnessedPersonalScene,event:WorldEvent):boolean{
  return row.eventId===event.id&&row.tick===event.tick&&row.year===event.year&&row.month===event.month&&
    row.siteId===event.locationId&&row.kind===witnessedPersonalSceneKind(event)&&exactIDs(row.actorIds,event.actorIds);
}
function sourceIndex(world:WorldState):Map<string,WorldEvent|undefined>{
  const byId=new Map<string,WorldEvent|undefined>();
  for(const event of world.events)byId.set(event.id,byId.has(event.id)?undefined:event);
  return byId;
}

/** Call after the native event list has been finalized. Bounded by proof age and retained events, not headcount. */
export function advanceWitnessedPersonalStory(world:WorldState):void{
  const sources=sourceIndex(world);
  world.witnessedPersonalStory.scenes=world.witnessedPersonalStory.scenes.filter(row=>{
    const source=sources.get(row.eventId);
    return row.tick>=world.tick-WITNESSED_PERSONAL_STORY_TICKS&&!!source&&matchesWitnessedPersonalScene(row,source);
  });
}

/** The selected exact living actor's own frozen events, no other witness or actor list. */
export function projectWitnessedPersonalStory(world:WorldState,actorId?:string,throughTick=world.tick):WitnessedPersonalStoryView|undefined{
  if(!actorId||!Number.isSafeInteger(throughTick)||throughTick<0||throughTick>world.tick)return undefined;
  const actors=world.cultivators.filter(row=>row.id===actorId);
  if(actors.length!==1||!actors[0].alive||!(actors[0].hp>0))return undefined;
  const sources=sourceIndex(world);
  const scenes=world.witnessedPersonalStory.scenes.filter(row=>row.tick<=throughTick&&row.tick>=world.tick-WITNESSED_PERSONAL_STORY_TICKS&&
      row.witnessIds.includes(actorId)).sort((a,b)=>b.tick-a.tick||compareIDs(a.eventId,b.eventId)).flatMap(row=>{
    const source=sources.get(row.eventId);
    const sites=world.locations.filter(site=>site.id===row.siteId);
    if(!source||!matchesWitnessedPersonalScene(row,source)||sites.length!==1||!stableSite(sites[0]))return [];
    const {title,participant,observer}=prose[row.kind];
    return [{eventId:row.eventId,tick:row.tick,year:row.year,month:row.month,siteName:label(sites[0].name),
      title,paragraph:row.actorIds.includes(actorId)?participant:observer}];
  }).slice(0,WITNESSED_PERSONAL_STORY_SCENES);
  return {actorId,actorName:label(actors[0].name),scenes};
}

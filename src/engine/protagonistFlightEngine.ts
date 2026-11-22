import {
  FLIGHT_HISTORY, FLIGHT_MAX_POINTS, FLIGHT_ROUNDS,
  type FlightReason, type ProtagonistFlight, type ProtagonistFlightRound,
} from '../types/protagonistFlight';
import type { Cultivator, LocationNode, MapPoint, PilgrimageJourney, WorldEvent, WorldState } from '../types/world';
import { availablePilgrimageActions, hasReachablePilgrimageDeparture, type PilgrimageOption } from './pilgrimageEngine';
import { projectProtagonistSuccession } from './protagonistSuccession';
import { finishFlightTape } from './protagonistFlightTape';
import { terrainTileAt } from './terrainEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';

const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
};
const local=(actor:Cultivator|undefined):actor is Cultivator=>Boolean(actor?.alive&&actor.hp>0&&actor.positionPlane===undefined);
const actual=(world:WorldState,id:string|undefined):LocationNode|undefined=>{
  const site=id?unique(world.locations,id):undefined;
  return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)?site:undefined;
};
const roundEnded=(scene:ProtagonistFlight)=>scene.rounds.some(row=>row.outcome==='reached'||row.outcome==='retreated');
const journeyOf=(world:WorldState,scene:ProtagonistFlight):PilgrimageJourney|undefined=>{
  const row=unique(world.pilgrimages.journeys,scene.journeyId);
  return row?.organizerId===scene.actorId&&row.companionId===scene.guideId?row:undefined;
};
const currentBounty=(world:WorldState,id:string,actorId:string)=>{
  const row=unique(world.bounties,id);
  return row?.status==='open'&&row.targetCultivatorId===actorId&&row.issuedTick<world.tick&&row.escrow.length>0?row:undefined;
};
function destinationUsable(world:WorldState,site:LocationNode,scene:Pick<ProtagonistFlight,'bountyId'|'pursuerId'>):boolean {
  const pursuer=unique(world.cultivators,scene.pursuerId),bounty=unique(world.bounties,scene.bountyId),tile=terrainTileAt(world,site.x,site.y);
  return !!tile&&!!bounty&&!world.mapHazards.some(row=>row.tileId===tile.id&&row.createdTick<=world.tick&&
    world.tick<row.expiresTick&&row.intensity>=2)&&
    (!local(pursuer)||pursuer.locationId!==site.id)&&
    !bounty.sponsorSectIds.some(id=>site.ownerSectId===id||world.sects.some(sect=>sect.id===id&&sect.headquartersId===site.id));
}
function lastActualStop(world:WorldState,scene:ProtagonistFlight,journey: PilgrimageJourney|undefined):string|undefined{
  const leader=unique(world.cultivators,scene.actorId);
  const last=journey?.stopsVisited.at(-1)?.locationId;
  return local(leader)&&last===leader.locationId&&actual(world,last)?last:undefined;
}
function exactReceipt(events:readonly WorldEvent[],candidate:WorldEvent):boolean {
  return events.filter(row=>row.id===candidate.id).length===1&&events.includes(candidate);
}
function retainedPursuit(world:WorldState,source:WorldEvent):boolean {
  const hot=world.events.filter(row=>row.id===source.id);
  if(hot.length)return hot.length===1&&hot[0]===source;
  const anchors=world.chronicleArchive.anchors.filter(row=>row.id===source.id);
  return anchors.length===1&&anchors[0].tick===source.tick&&anchors[0].category==='combat'&&
    anchors[0].locationId===source.locationId&&anchors[0].actorIds.length===2&&
    anchors[0].actorIds.every((id,index)=>source.actorIds[index]===id);
}
function pilgrimageReceipt(events:readonly WorldEvent[],scene:ProtagonistFlight,tick:number,kinds:readonly string[]){
  const rows=events.filter(row=>row.tick===tick&&row.category==='diplomacy'&&row.witnessScope==='participants'&&
    row.actorIds.length===2&&row.actorIds[0]===scene.actorId&&row.actorIds[1]===scene.guideId&&
    kinds.some(kind=>row.id===`evt-${scene.journeyId}-${kind}-${tick}`));
  return rows.length===1&&exactReceipt(events,rows[0])?rows[0]:undefined;
}

export function activeProtagonistFlight(world:WorldState,actor:Cultivator):ProtagonistFlight|undefined{
  if(!local(actor)||unique(world.cultivators,actor.id)!==actor)return undefined;
  const rows=world.protagonistFlights?.filter(row=>row.actorId===actor.id&&row.openedTick<=world.tick&&
    world.tick<=row.openedTick+FLIGHT_ROUNDS&&row.rounds.length<FLIGHT_ROUNDS&&!roundEnded(row))??[];
  return rows.length===1?rows[0]:undefined;
}

const responseMoves=new Set(['advance','camp','resume','relieve','withdraw','dismantle']);
export function availableProtagonistFlightActions(actor:Cultivator,world:WorldState,executionTick=world.tick+1):PilgrimageOption[]{
  const scene=activeProtagonistFlight(world,actor);
  if(!scene||executionTick<=scene.openedTick||executionTick>scene.openedTick+FLIGHT_ROUNDS)return [];
  const journey=journeyOf(world,scene);
  if(!journey||journey.stopIds[journey.legIndex+1]!==scene.destinationId)return [];
  const destination=actual(world,scene.destinationId);
  return availablePilgrimageActions(actor,world,false,executionTick).filter(row=>
    row.targetPilgrimageId===scene.journeyId&&responseMoves.has(row.pilgrimageMove)&&
    (row.pilgrimageMove!=='advance'&&row.pilgrimageMove!=='resume'||!!destination&&destinationUsable(world,destination,scene)));
}

export interface ProtagonistFlightView{
  id:string;
  openedTick:number;
  nextRound:1|2|3|undefined;
  status:'active'|'reached'|'retreated'|'unfinished';
  title:string;
  rounds:readonly Omit<ProtagonistFlightRound,'sourceEventId'>[];
}
/** Own direct experience only; callers still intersect each painted edge with the displayed map's exact tile scope. */
export function projectProtagonistFlight(world:WorldState,viewer:Cultivator|undefined,throughTick=world.tick):ProtagonistFlightView|undefined{
  if(!local(viewer)||unique(world.cultivators,viewer.id)!==viewer||!Number.isSafeInteger(throughTick)||throughTick<0||throughTick>world.tick)
    return undefined;
  const scene=world.protagonistFlights?.filter(row=>row.actorId===viewer.id&&row.openedTick<=throughTick).at(-1);
  if(!scene||!unique(world.protagonistFlights??[],scene.id))return undefined;
  const rounds=scene.rounds.filter(row=>row.tick<=throughTick).map(({sourceEventId:_,...row})=>
    ({...row,points:row.points.map(({x,y})=>({x,y}))}));
  const status=rounds.some(row=>row.outcome==='retreated')?'retreated':rounds.some(row=>row.outcome==='reached')?'reached':
    rounds.length===FLIGHT_ROUNDS?'unfinished':'active';
  return {id:scene.id,openedTick:scene.openedTick,title:'扶危 · 三月逃亡',status,
    nextRound:rounds.length<FLIGHT_ROUNDS?(rounds.length+1) as 1|2|3:undefined,rounds};
}

function adjudicate(world:WorldState,scene:ProtagonistFlight,events:readonly WorldEvent[],trace:ReturnType<typeof finishFlightTape>):ProtagonistFlightRound {
  const round=(world.tick-scene.openedTick) as 1|2|3;
  const base={tick:world.tick,round,points:[] as MapPoint[]};
  const journey=journeyOf(world,scene), last=lastActualStop(world,scene,journey);
  const retreat=(reason:FlightReason,receipt?:WorldEvent):ProtagonistFlightRound=>({...base,outcome:'retreated',reason,
    ...(last?{locationId:last}:{}),...(receipt?{sourceEventId:receipt.id}:{})});
  if(roundEnded(scene))return {...base,outcome:'held'};
  const leader=unique(world.cultivators,scene.actorId);
  if(!local(leader)||!last)return retreat('leader_lost');
  const end=pilgrimageReceipt(events,scene,world.tick,['withdrawn','member_missing','lost_site','journey_expiry']);
  const guide=unique(world.cultivators,scene.guideId);
  const strides=trace?.strides.filter(row=>row.journeyId===scene.journeyId&&exactReceipt(events,row.event))??[];
  const movement=strides.length===1?strides[0]:undefined;
  const walked=movement&&movement.points.length>=2&&movement.points.length<=FLIGHT_MAX_POINTS&&
    journey?.lastMovedTick===world.tick?movement:undefined;
  const arrived=!!walked?.event.locationId&&last===scene.destinationId&&
    journey?.stopsVisited.some(row=>row.locationId===scene.destinationId&&row.tick===world.tick)===true;
  if(arrived)return {...base,outcome:'reached',locationId:last,sourceEventId:walked!.event.id,points:walked!.points};
  if(!local(guide)||end?.id.includes('-member_missing-')||journey?.reason==='member_missing')
    return {...retreat('guide_lost',end),...(walked?{points:walked.points,sourceEventId:walked.event.id}:{})};
  if(end||!journey||journey.status!=='active')return retreat(
    journey?.reason==='withdrawn'?'withdrawn':journey?.reason==='lost_site'?'destination_lost':'journey_ended',end);
  const final=round===FLIGHT_ROUNDS?{reason:'time_elapsed' as const}:{};
  if(walked)return {...base,...final,outcome:'moved',sourceEventId:walked.event.id,points:walked.points};
  const aidKind=journey.aid.filter(row=>row.tick===world.tick).map(row=>`relief-${journey.aid.indexOf(row)+1}`);
  const action=['camp','dismantled',...aidKind].map(kind=>pilgrimageReceipt(events,scene,world.tick,[kind])).find(Boolean);
  const outcome=action?.id.includes('-relief-')?'aided':action?.id.includes('-camp-')?'camped':'held';
  return {...base,...final,outcome,
    ...(!journey.path.length&&last?{locationId:last}:{}),...(action?{sourceEventId:action.id}:{})};
}

/** Final native month only. Opening never writes orders, creates agreements, spends resources, moves bodies or draws RNG. */
export function finalizeProtagonistFlightTurn(before:WorldState,world:WorldState,events:readonly WorldEvent[]):void{
  const trace=finishFlightTape(world);
  if(!trace||world.tick!==before.tick+1)return;
  const scenes=(world.protagonistFlights??[]).filter(scene=>journeyOf(world,scene));
  if(world.protagonistFlights&&scenes.length!==world.protagonistFlights.length){
    if(scenes.length)world.protagonistFlights=scenes;
    else delete world.protagonistFlights;
  }
  for(const scene of scenes){
    if(world.tick===scene.openedTick+scene.rounds.length+1&&scene.rounds.length<FLIGHT_ROUNDS)
      scene.rounds.push(adjudicate(world,scene,events,trace));
  }
  if(!trace.pursuits.length||scenes.some(row=>row.rounds.length<FLIGHT_ROUNDS))return;
  const lead=projectProtagonistSuccession(before).active;
  if(!lead||scenes.some(row=>row.arcId===lead.id))return;
  const oldLeader=unique(before.cultivators,lead.actorId),leader=unique(world.cultivators,lead.actorId);
  if(!local(leader)||!local(oldLeader))return;
  for(const proof of trace.pursuits){
    const source=proof.event,origin=actual(world,proof.siteId),pursuer=unique(world.cultivators,proof.hunterId);
    if(!origin||!local(pursuer)||leader.id!==proof.targetId||leader.locationId!==origin.id||oldLeader.locationId!==origin.id||
      source.tick!==world.tick||source.year!==world.year||source.month!==world.month||source.locationId!==origin.id||
      source.witnessScope!==undefined||source.actorIds.length!==2||source.actorIds[0]!==pursuer.id||
      source.actorIds[1]!==leader.id||!exactReceipt(events,source)||!retainedPursuit(world,source)||!currentBounty(world,proof.bountyId,leader.id))continue;
    const matches=before.pilgrimages.journeys.filter(row=>row.organizerId===leader.id&&row.status==='active'&&!row.path.length&&
      row.startedTick!==undefined&&row.startedTick<=before.tick&&row.stopsVisited.at(-1)?.locationId===origin.id);
    const oldJourney=matches.length===1?matches[0]:undefined;
    if(!oldJourney)continue;
    const journey=unique(world.pilgrimages.journeys,oldJourney.id),guide=unique(world.cultivators,oldJourney.companionId);
    if(!journey||journey.status!=='active'||journey.lastMovedTick===world.tick||oldJourney.legIndex!==journey.legIndex||
      journey.organizerId!==leader.id||journey.companionId!==oldJourney.companionId||journey.startedTick!==oldJourney.startedTick||
      !local(guide)||guide.id===pursuer.id||guide.locationId!==origin.id||
      (journey.expiresTick??0)<=world.tick+FLIGHT_ROUNDS||!hasReachablePilgrimageDeparture(world,journey,FLIGHT_ROUNDS))continue;
    const oldGuide=unique(before.cultivators,guide.id),destination=actual(world,journey.stopIds[journey.legIndex+1]);
    if(!local(oldGuide)||oldGuide.locationId!==origin.id||!destination||destination.id===origin.id||
      !destinationUsable(world,destination,{bountyId:proof.bountyId,pursuerId:proof.hunterId}))continue;
    scenes.push({id:`flight-${world.tick}`,arcId:lead.id,actorId:leader.id,guideId:guide.id,pursuerId:pursuer.id,
      bountyId:proof.bountyId,journeyId:journey.id,contactEventId:source.id,originId:origin.id,
      destinationId:destination.id,openedTick:world.tick,rounds:[]});
    world.protagonistFlights=scenes.slice(-FLIGHT_HISTORY);
    return;
  }
}

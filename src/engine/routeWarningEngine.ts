import type { Cultivator, LLMDecisionPayload, MapTile, PilgrimageJourney, RouteWarningHazardProof, RouteWarningMove,
  RouteWarningNotice, RouteWarningObservation, WorldEvent, WorldState } from '../types/world';
import { currentVisibleTileIds, terrainTileAt } from './terrainEngine';
import { routeWarningEdgeKey, routeWarningExpiry, routeWarningHazardValid, ROUTE_WARNING_EVIDENCE_TICKS } from './routeWarningProof';
export const createRouteWarningsState=():WorldState['routeWarnings']=>({nextId:1,nextObservationId:1,observations:[],notices:[]});
const allowed=new Set(['action','chosenAction','innerMonologue','spokenLine','routeWarningMove','targetRouteObservationId','targetRouteWarningId']);
const asc=(a:string,b:string)=>a<b?-1:a>b?1:0;
const adjacent=(a:MapTile,b:MapTile)=>Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1;
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const liveNotice=(row:RouteWarningNotice,tick:number)=>row.postedTick<=tick&&tick<row.expiresTick&&row.retractedTick===undefined;
function activeNotices(world:WorldState,tick:number):RouteWarningNotice[] {
  const history=world.routeWarnings.notices;
  const live:RouteWarningNotice[]=[];
  for(let index=history.length-1;index>=0;index--){
    const row=history[index];
    // A post is strictly later than its sighting. Older append-only history cannot still be live.
    if(row.postedTick+ROUTE_WARNING_EVIDENCE_TICKS-1<=tick)break;
    if(liveNotice(row,tick))live.push(row);
  }
  return live.reverse();
}
const sameWarning=(a:RouteWarningObservation,b:RouteWarningObservation)=>routeWarningEdgeKey(a)===routeWarningEdgeKey(b);
const partiesOverlap=(a:RouteWarningObservation,b:RouteWarningObservation)=>a.journeyId===b.journeyId||
  a.partyIds.some(id=>b.partyIds.includes(id));

const proof=(x:RouteWarningHazardProof):RouteWarningHazardProof=>({id:x.id,kind:x.kind,tileId:x.tileId,
  createdTick:x.createdTick,expiresTick:x.expiresTick,intensity:x.intensity});

/** Only the native stride calls this, after proof of motion and before the journey clears its consumed path. */
export function recordPilgrimageRouteObservations(world:WorldState,journey:PilgrimageJourney,fromPathIndex:number):void {
  if(!world.mapHazards.length||!world.pilgrimages.journeys.includes(journey)||journey.status!=='active'||
    journey.lastMovedTick!==world.tick||!Number.isSafeInteger(fromPathIndex)||fromPathIndex<0||
    journey.pathIndex<=fromPathIndex||journey.pathIndex>=journey.path.length)return;
  const starter=world.cultivators.find(row=>row.id===journey.organizerId);
  const companion=world.cultivators.find(row=>row.id===journey.companionId);
  const stop=journey.stopIds[journey.legIndex];
  if(!alive(starter)||!alive(companion)||starter.id===companion.id||starter.locationId!==stop||companion.locationId!==stop)return;
  const path=journey.path, ended=journey.pathIndex;
  function tileAt(index:number){
    const point=path[index];
    return point&&terrainTileAt(world,point.x,point.y);
  }
  for(let toPathIndex=fromPathIndex+1;toPathIndex<=ended;toPathIndex++){
    const from=tileAt(toPathIndex-1),to=tileAt(toPathIndex);
    if(!from||!to||!adjacent(from,to))continue;
    const mark=world.mapHazards.filter(row=>row.tileId===to.id&&routeWarningHazardValid(world,row,world.tick))
      .sort((a,b)=>b.intensity-a.intensity||asc(a.id,b.id))[0];
    if(!mark)continue;
    let exit:{exitTileId:string;exitPathIndex:number}|undefined;
    for(let index=toPathIndex+1;index<=ended;index++){
      const next=tileAt(index);
      if(!next)break;
      if(next.id===to.id)continue;
      if(next.id!==from.id&&adjacent(to,next))exit={exitTileId:next.id,exitPathIndex:index};
      break;
    }
    for(const actor of [starter,companion]){
      const observation:Omit<RouteWarningObservation,'id'>={actorId:actor.id,journeyId:journey.id,partyIds:[starter.id,companion.id],
        legIndex:journey.legIndex,fromPathIndex:toPathIndex-1,toPathIndex,fromTileId:from.id,toTileId:to.id,observedTick:world.tick,
        hazard:proof(mark),...exit};
      if(world.routeWarnings.observations.some(row=>row.actorId===actor.id&&row.journeyId===journey.id&&
          row.legIndex===journey.legIndex&&row.observedTick===world.tick&&row.toPathIndex===toPathIndex))continue;
      const id=`route-observation-${world.routeWarnings.nextObservationId++}`;
      world.routeWarnings.observations.push({id,...observation});
    }
  }
}

export type RouteWarningOption =
  | {action:'ROUTE_WARNING';routeWarningMove:'post';targetRouteObservationId:string;targetRouteWarningId?:never}
  | {action:'ROUTE_WARNING';routeWarningMove:'corroborate';targetRouteObservationId:string;targetRouteWarningId:string}
  | {action:'ROUTE_WARNING';routeWarningMove:'retract';targetRouteWarningId:string;targetRouteObservationId?:never};

function atStation(world:WorldState,actor:Cultivator,tick:number) {
  if(!alive(actor)||!world.cultivators.includes(actor)||actor.tribulation?.stage==='lightning'||
    actor.tribulation?.stage==='heart_demon')return undefined;
  const site=world.locations.find(row=>row.id===actor.locationId&&(row.type==='market'||row.type==='sect_hq'));
  if(!site)return undefined;
  const id=actor.id;
  const guard=actor.guardAssignment;
  if(guard&&guard.assignedTick<=tick&&guard.expiresTick>tick&&guard.locationId!==site.id||
    world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'||
      row.lastAdvancedTick===tick||row.settledTick===tick||row.acceptedTick===tick))||
    world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')||
    world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))||
    world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))||
    world.sieges.some(row=>row.participantIds.includes(id)&&(row.status==='marching'||row.status==='sieging'))||
    world.occasions.some(row=>row.participantIds.includes(id)&&(row.status==='registration'||row.status==='running')&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))||
    world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'&&row.path.length>0||row.lastMovedTick===tick||row.startedTick===tick||
        row.camps?.some(camp=>camp.openedTick===tick||camp.closedTick===tick))))return undefined;
  return site;
}

export function availableRouteWarningActions(actor:Cultivator,world:WorldState,executionTick=world.tick):RouteWarningOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  const own=world.routeWarnings.observations.filter(row=>row.actorId===actor.id&&row.observedTick<executionTick&&
    executionTick<routeWarningExpiry(row));
  const notices=activeNotices(world,executionTick);
  if((!own.length&&!notices.some(row=>row.observation.actorId===actor.id))||!atStation(world,actor,executionTick))return [];
  const choices:RouteWarningOption[]=[];
  for(const source of own){
    const existing=notices.find(row=>sameWarning(row.observation,source));
    if(!existing){
      choices.push({action:'ROUTE_WARNING',routeWarningMove:'post',targetRouteObservationId:source.id});
    }else if(existing.postedTick<executionTick&&!existing.corroboration&&!partiesOverlap(existing.observation,source)){
      choices.push({action:'ROUTE_WARNING',routeWarningMove:'corroborate',targetRouteObservationId:source.id,targetRouteWarningId:existing.id});
    }
  }
  for(const row of notices)if(row.observation.actorId===actor.id&&row.postedTick<executionTick)
    choices.push({action:'ROUTE_WARNING',routeWarningMove:'retract',targetRouteWarningId:row.id});
  return choices;
}
function actionEvent(world:WorldState,actor:Cultivator,id:string,move:RouteWarningMove):WorldEvent{
  const [title,description]={
    post:['实地踏勘，登记驿路警示','只据本人实趋的相邻一段；警示有期限，不会封路。'],
    corroborate:['独立行旅同证驿路警示','另行结伴踏过同一段并见到同场灾变，不会重复记为新灾。'],
    retract:['撤下本人驿路警示','原告示已撤下，旧证据不改，不对实际道路重新判定。'],
  }[move];
  return {id:`evt-${id}-${move}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title,description,actorIds:[actor.id],locationId:actor.locationId,witnessScope:'participants'};
}
export function resolveRouteWarningAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='ROUTE_WARNING'||Object.entries(decision).some(([key,value])=>value!==undefined&&
    (!allowed.has(key)||key==='action'&&value!=='ROUTE_WARNING')))return null;
  const option=availableRouteWarningActions(actor,world).find(row=>row.routeWarningMove===decision.routeWarningMove&&
    row.targetRouteObservationId===decision.targetRouteObservationId&&row.targetRouteWarningId===decision.targetRouteWarningId);
  if(!option)return null;
  const state=world.routeWarnings;
  if(option.routeWarningMove==='retract'){
    const row=state.notices.find(item=>item.id===option.targetRouteWarningId)!;
    row.retractedTick=world.tick;
    return actionEvent(world,actor,row.id,'retract');
  }
  const index=state.observations.findIndex(row=>row.id===option.targetRouteObservationId);
  if(index<0)return null;
  const [observation]=state.observations.splice(index,1);
  if(option.routeWarningMove==='post'){
    const row:RouteWarningNotice={id:`route-warning-${state.nextId++}`,postedTick:world.tick,
      expiresTick:routeWarningExpiry(observation),observation};
    state.notices.push(row);
    return actionEvent(world,actor,row.id,'post');
  }
  const row=state.notices.find(item=>item.id===option.targetRouteWarningId)!;
  row.corroboration={tick:world.tick,observation};
  return actionEvent(world,actor,row.id,'corroborate');
}

export function advanceRouteWarnings(world:WorldState):void{
  const state=world.routeWarnings;
  if(state.observations.length)state.observations=state.observations.filter(row=>world.tick<routeWarningExpiry(row));
}

export interface PublicRouteWarning {
  id:string;fromTileId:string;toTileId:string;exitTileId?:string;kind:RouteWarningHazardProof['kind'];intensity:number;
  observedTick:number;postedTick:number;expiresTick:number;corroborated:boolean;corroboratedTick?:number;
}
export interface OwnRouteWarningHistory {
  id:string;status:'active'|'expired'|'retracted';observedTick:number;postedTick:number;expiresTick:number;
  retractedTick?:number;corroboratedTick?:number;
}

export function projectOwnRouteWarningHistory(world:WorldState,viewer?:Cultivator):OwnRouteWarningHistory[] {
  if(!viewer||!world.cultivators.includes(viewer))return [];
  return world.routeWarnings.notices.filter(row=>row.observation.actorId===viewer.id&&row.postedTick<=world.tick)
    .map(row=>({id:row.id,status:row.retractedTick!==undefined?'retracted':world.tick>=row.expiresTick?'expired':'active',
      observedTick:row.observation.observedTick,postedTick:row.postedTick,expiresTick:row.expiresTick,
      ...(row.retractedTick===undefined?{}:{retractedTick:row.retractedTick}),
      ...(row.corroboration?{corroboratedTick:row.corroboration.tick}:{})}));
}

/** Public only if both actual adjacent endpoints are currently in scope. Never returns travellers or guessed detour geometry. */
export function projectRouteWarnings(world:WorldState,viewer?:Cultivator):PublicRouteWarning[]{
  return viewer&&world.cultivators.includes(viewer) ?
    visiblePublicRouteWarnings(world,currentVisibleTileIds(world,viewer)) : [];
}
export function visiblePublicRouteWarnings(world:WorldState,visibleTiles?:ReadonlySet<string>):PublicRouteWarning[]{
  if(!visibleTiles?.size)return [];
  const rows=activeNotices(world,world.tick).filter(row=>
    visibleTiles.has(row.observation.fromTileId)&&visibleTiles.has(row.observation.toTileId));
  return rows.map(({id,observation,postedTick,expiresTick,corroboration})=>({id,fromTileId:observation.fromTileId,
    toTileId:observation.toTileId,kind:observation.hazard.kind,intensity:observation.hazard.intensity,
    observedTick:observation.observedTick,postedTick,expiresTick,corroborated:!!corroboration,
    ...(corroboration?{corroboratedTick:corroboration.tick}:{}),
    ...(observation.exitTileId&&visibleTiles.has(observation.exitTileId)?{exitTileId:observation.exitTileId}:{})}));
}

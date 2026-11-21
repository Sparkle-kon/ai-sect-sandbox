import type {Cultivator,LocationNode,WorldState} from '../types/world';
import {activeAvatar,availableAvatarHosts,AVATAR_ORDER_COST,AVATAR_POSSESSION_COST} from './avatarEngine';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor,courierActedThisTick} from './sealedCourierEngine';
import {currentVisibleTileIds,knownMapLocations,terrainTileAt} from './terrainEngine';
import {isTribulationActive} from './tribulationEngine';

export type EraEntryOrigin=
  | {readonly kind:'founder';readonly tick:number}
  | {readonly kind:'recruited';readonly tick:number;readonly settlementName?:string};
export type EraEntryDecision=
  | {readonly kind:'rest_or_cultivate'}
  | {readonly kind:'observe_only';readonly reason:'contest'|'tribulation'|'avatar_unavailable'|'existing_order'|'order_essence'};
export interface EraEntryCandidate {
  readonly actorId:string;readonly name:string;readonly origin:EraEntryOrigin;readonly decision:EraEntryDecision;
}
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const nat=(tick:number|undefined):tick is number=>tick!==undefined&&Number.isSafeInteger(tick)&&tick>=0;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const safeLabel=(text:string)=>[...text.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim()].slice(0,80).join('');
const unique=<T>(rows:readonly T[],predicate:(item:T)=>boolean):T|undefined=>{
  const found=rows.filter(predicate);
  return found.length===1?found[0]:undefined;
};
const sitePublic=(site:LocationNode|undefined):site is LocationNode=>!!site&&site.type!=='secret_realm'&&site.type!=='abyss';

function actuallyLocal(world:WorldState,actor:Cultivator,site:LocationNode){
  return actor.locationId===site.id&&!activeCourierForActor(world,actor)&&!courierActedThisTick(world,actor)&&
    !activeRelocationForActor(world,actor)&&!activeEscortForActor(world,actor)&&!pilgrimageCheckpoint(world,actor)&&
    !boundaryReliefCheckpoint(world,actor)&&!expeditionRescueCheckpoint(world,actor)&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===actor.id||row.companionId===actor.id)&&
      (row.status==='active'&&row.path.length>0||row.lastMovedTick===world.tick&&row.path.length>0))&&
    !world.sieges.some(row=>row.status==='marching'&&row.participantIds.includes(actor.id));
}

function entrantOrigin(world:WorldState,actor:Cultivator,known:ReadonlySet<string>):EraEntryOrigin|undefined{
  const certificate=world.worldgen;
  const founders=certificate?.resources.filter(row=>row.actorId===actor.id)??[];
  const recorded=world.households.members.filter(row=>row.recruitedId===actor.id);
  if(founders.length===1){
    if(recorded.length!==0||!certificate||certificate.algorithm!==1||certificate.seed!==world.random.seed||
      !nat(certificate.birthTick)||certificate.birthTick>world.tick||
      !world.locations.some(site=>site.id===founders[0].locationId))return undefined;
    return {kind:'founder',tick:certificate.birthTick};
  }
  if(founders.length!==0||recorded.length!==1)return undefined;
  const member=recorded[0];
  if(member.status!=='recruited'||!nat(member.settledTick)||member.settledTick>world.tick||
      !nat(member.registeredTick)||member.registeredTick>member.settledTick)return undefined;
  const village=unique(world.settlements.villages,row=>row.id===member.settlementId);
  const group=unique(world.households.groups,row=>row.id===member.householdId);
  if(!village||!group||!group.presences.some(row=>row.settlementId===village.id)||
      !world.locations.some(site=>site.id===village.locationId))return undefined;
  const volunteers=village.volunteers.filter(row=>row.id===member.volunteerId);
  if(volunteers.length>1||volunteers.some(row=>row.enlistedCultivatorId!==actor.id))return undefined;
  const recruitment=world.settlements.records.filter(row=>row.kind==='recruitment'&&row.cultivatorId===actor.id);
  if(recruitment.length>1||recruitment.some(row=>row.tick!==member.settledTick||row.settlementId!==village.id||
      row.volunteerId!==member.volunteerId||row.people!==1))return undefined;
  const settlementName=known.has(village.locationId)?safeLabel(village.name):'';
  return {kind:'recruited',tick:member.settledTick,...(settlementName?{settlementName}:{})};
}
function pendingDecision(world:WorldState,actor:Cultivator,site:LocationNode,available:ReadonlySet<string>):EraEntryDecision{
  const observe=(reason:Extract<EraEntryDecision,{kind:'observe_only'}>['reason']):EraEntryDecision=>({kind:'observe_only',reason});
  if(world.occasions.some(row=>row.locationId===site.id&&row.kind==='tournament'&&
      (row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)))return observe('contest');
  if(isTribulationActive(actor))return observe('tribulation');
  if(world.playerAvatar.pendingOrder)return observe('existing_order');
  const already=activeAvatar(world)?.id===actor.id;
  // A newly entered fork uses normal possessAvatar, never cancels/reissues a retained same-body action.
  if(already||!available.has(actor.id))return observe('avatar_unavailable');
  if(world.playerAvatar.essence<AVATAR_POSSESSION_COST+AVATAR_ORDER_COST)return observe('order_essence');
  return {kind:'rest_or_cultivate'};
}

/** For a specific real branch snapshot and observed public site only; choosing a card changes nothing. */
export function projectEraEntryCandidates(world:WorldState,siteId:string,viewerId?:string|null):EraEntryCandidate[]{
  const site=unique(world.locations,row=>row.id===siteId);
  const viewer=viewerId?unique(world.cultivators,row=>row.id===viewerId):undefined;
  if(!live(viewer)||!sitePublic(site))return [];
  const viewerSite=unique(world.locations,row=>row.id===viewer.locationId);
  if(!sitePublic(viewerSite)||!actuallyLocal(world,viewer,viewerSite))return [];
  const cell=terrainTileAt(world,site.x,site.y);
  if(!cell||!currentVisibleTileIds(world,viewer).has(cell.id))return [];
  const known=new Set(knownMapLocations(world,viewer).filter(sitePublic).map(place=>place.id));
  const available=new Set(availableAvatarHosts(world).map(actor=>actor.id));
  const counted=new Map<string,number>();
  for(const actor of world.cultivators)counted.set(actor.id,(counted.get(actor.id)??0)+1);
  return world.cultivators.flatMap((actor):EraEntryCandidate[]=>{
    if(counted.get(actor.id)!==1||!live(actor)||!actuallyLocal(world,actor,site))return [];
    const origin=entrantOrigin(world,actor,known),name=safeLabel(actor.name);
    return origin&&name?[{actorId:actor.id,name,origin,decision:pendingDecision(world,actor,site,available)}]:[];
  }).sort((a,b)=>cmp(a.actorId,b.actorId));
}

export function findEraEntryCandidate(world:WorldState,siteId:string,viewerId:string|null|undefined,actorId:string):EraEntryCandidate|undefined{
  return projectEraEntryCandidates(world,siteId,viewerId).find(row=>row.actorId===actorId);
}

import type {
  BoundaryCoverage,BoundaryRelief,BoundaryReliefMove,BoundaryReliefState,Cultivator,LLMDecisionPayload,LocationNode,
  MapPoint,MapTile,Sect,WorldEvent,WorldState,
} from '../types/world';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';

export const BOUNDARY_RELIEF_OFFER_TICKS = 3;
export const BOUNDARY_RELIEF_STRIDE = 2;
export const BOUNDARY_RELIEF_MAX_PATH_STEPS = 16;
export const BOUNDARY_RELIEF_LATE_GRACE_TICKS = 2;
export const BOUNDARY_RELIEF_QI_PER_TILE = 1;
export const BOUNDARY_RELIEF_GUARD_TICKS = 6;
const BOUNDARY_RELIEF_HISTORY_LIMIT = 96;

export type BoundaryReliefOption = { action:'BOUNDARY_RELIEF' } & (
  | { boundaryReliefMove:'offer'; targetCultivatorId:string;targetLocationId:string;targetBoundaryReliefId?:never }
  | { boundaryReliefMove:Exclude<BoundaryReliefMove,'offer'>;targetBoundaryReliefId:string;targetCultivatorId?:never;targetLocationId?:never }
);
export type BoundaryReliefView = Omit<BoundaryRelief,'path'|'coverage'> & {stepsTotal:number;coverage?:BoundaryCoverage};
export interface BoundaryCoverageView { postSiteId:string;tick:number;kind:BoundaryCoverage['kind'] }
type Reason = NonNullable<BoundaryRelief['closeReason']>;
type Terminal = Exclude<BoundaryRelief['status'],'offered'|'travelling'|'returning'>;
const copyPoint = ({x,y}:MapPoint):MapPoint => ({x,y});
const samePoint = (a:MapPoint|undefined,b:MapPoint|undefined) => !!a && !!b && a.x===b.x && a.y===b.y;
const rankId = (a:string,b:string) => a<b ? -1 : a>b ? 1 : 0;
const live = (actor:Cultivator|undefined):actor is Cultivator => Boolean(actor?.alive && actor.hp>0);
const serving = (actor:Cultivator|undefined):actor is Cultivator => live(actor) && actor.service?.status!=='retired';
const closed = (row:BoundaryRelief) => row.status!=='offered' && row.status!=='travelling' && row.status!=='returning';
const isMovement = (row:BoundaryRelief) => row.status==='travelling' || row.status==='returning';
const interested = (row:BoundaryRelief,id:string) => row.leaderId===id || row.incomingId===id || row.incumbentId===id;
const siteAt = (world:WorldState,id:string) => world.locations.find(site=>site.id===id);
const actorAt = (world:WorldState,id:string) => world.cultivators.find(actor=>actor.id===id);
const adjacent = (a:MapTile,b:MapTile) => Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1;
const ownedPost = (site: LocationNode|undefined,sectId:string):site is LocationNode => !!site && site.type==='spirit_vein' && site.ownerSectId===sectId;

export const createBoundaryReliefState = ():BoundaryReliefState => ({cases:[],nextId:1});

function conflictingDuty(world:WorldState,actor:Cultivator,tick:number) {
  const id=actor.id;
  return actor.tribulation?.stage==='lightning' || actor.tribulation?.stage==='heart_demon' ||
    world.couriers.dispatches.some(row=>row.courierId===id &&
      (row.status==='in_transit' || row.status==='returning' || row.lastAdvancedTick===tick || row.settledTick===tick || row.acceptedTick===tick)) ||
    world.pilgrimages.journeys.some(row=>(row.organizerId===id || row.companionId===id) &&
      (row.status==='active' || row.lastMovedTick===tick || row.startedTick===tick)) ||
    world.escorts.contracts.some(row=>row.escortId===id && row.status==='active') ||
    world.relocations.plans.some(row=>row.garrisonIds.includes(id) && row.status==='in_transit') ||
    world.sieges.some(row=>row.participantIds.includes(id) && (row.status==='marching' || row.status==='sieging')) ||
    world.occasions.some(row=>row.participantIds.includes(id) && (row.status==='registration' || row.status==='running') &&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id && rescue.arrivedIds?.includes(id)));
}

function activeGuard(actor:Cultivator|undefined,world:WorldState,tick:number):actor is Cultivator {
  if (!serving(actor) || !actor.guardAssignment || actor.guardAssignment.assignedTick>tick || actor.guardAssignment.expiresTick<=tick) return false;
  const site=siteAt(world,actor.guardAssignment.locationId);
  return !!site && (!site.ownerSectId || site.ownerSectId===actor.sectId) &&
    (site.type==='spirit_vein' || site.ownerSectId===actor.sectId && (site.type==='secret_realm' || site.type==='abyss')) &&
    world.sects.some(row=>row.id===actor.sectId && row.leaderId!==actor.id);
}
function currentGuards(world:WorldState,post:LocationNode,tick:number) {
  return world.cultivators.filter(actor=>actor.sectId===post.ownerSectId && actor.guardAssignment?.locationId===post.id &&
    activeGuard(actor,world,tick)).sort((a,b)=>rankId(a.id,b.id));
}
function observedGuard(world:WorldState,post:LocationNode,tick:number,guards=currentGuards(world,post,tick)) {
  return guards.find(actor=>actor.locationId===post.id && !conflictingDuty(world,actor,tick) &&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===actor.id && isMovement(row)));
}

function leadership(world:WorldState,sectId:string,leaderId:string,originId:string) {
  const sect=world.sects.find(row=>row.id===sectId),leader=actorAt(world,leaderId),origin=siteAt(world,originId);
  return sect && serving(leader) && leader.sectRank==='掌门' && leader.sectId===sectId && sect.leaderId===leader.id &&
    sect.headquartersId===originId && origin?.type==='sect_hq' && origin.ownerSectId===sectId &&
    !world.relocations.plans.some(row=>row.sectId===sectId && row.status==='in_transit') ? {sect,leader,origin} : undefined;
}
const unsafeTiles = (world:WorldState,tick:number) => new Set(world.mapHazards
  .filter(row=>row.createdTick<=tick && tick<row.expiresTick && row.intensity>=2).map(row=>row.tileId));

/** One physical point per different, mutually known orthogonal cell; same-cell handovers are not routes. */
function planPath(world:WorldState,origin:LocationNode,post:LocationNode,leader:Cultivator,incoming:Cultivator,tick:number):MapPoint[]|undefined {
  if (!knownMapLocations(world,leader).some(site=>site.id===post.id) ||
      !knownMapLocations(world,incoming).some(site=>site.id===post.id)) return undefined;
  const start=terrainTileAt(world,origin.x,origin.y), end=terrainTileAt(world,post.x,post.y);
  const unsafe=unsafeTiles(world,tick);
  if (!start || !end || start.id===end.id || unsafe.has(start.id) || unsafe.has(end.id)) return undefined;
  const known=new Set([...incoming.exploredTileIds,...currentVisibleTileIds(world,incoming)]);
  const {columns,rows,tiles}=world.terrain;
  const distance=new Map([[start.id,0]]);
  const parents=new Map<string,MapTile>();
  const queue=[start];
  for (let i=0;i<queue.length;i++) {
    const from=queue[i];
    if (from.id===end.id) break;
    const next=distance.get(from.id)!+1;
    if (next>BOUNDARY_RELIEF_MAX_PATH_STEPS) continue;
    for (const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const col=from.col+dx,row=from.row+dy;
      if (col<0 || col>=columns || row<0 || row>=rows) continue;
      const tile=tiles[row*columns+col];
      if (!tile || distance.has(tile.id) || !known.has(tile.id) || unsafe.has(tile.id)) continue;
      distance.set(tile.id,next);parents.set(tile.id,from);queue.push(tile);
    }
  }
  const steps=distance.get(end.id);
  if (!steps || !Number.isFinite(incoming.qiProgress) || incoming.qiProgress<2*steps*BOUNDARY_RELIEF_QI_PER_TILE) return undefined;
  const trail=[end];
  while(trail[0].id!==start.id) trail.unshift(parents.get(trail[0].id)!);
  return trail.map((tile,i)=>i===0 ? copyPoint(origin) : i===trail.length-1 ? copyPoint(post) :
    {x:(tile.col+.5)*1000/columns,y:(tile.row+.5)*600/rows});
}

function outgoingBinding(world:WorldState,row:BoundaryRelief,guard:Cultivator|undefined,tick:number) {
  return activeGuard(guard,world,tick) && guard.id===row.incumbentId && guard.sectId===row.sectId &&
    guard.guardAssignment?.locationId===row.postSiteId && guard.guardAssignment?.assignedTick===row.incumbentAssignedTick;
}
function competingGuard(world:WorldState,row:BoundaryRelief,site:LocationNode,tick:number) {
  return currentGuards(world,site,tick).some(actor=>!outgoingBinding(world,row,actor,tick));
}

/** A live offer/forward route reserves the actual post and reserve actor. A returning actor is still occupied. */
export function boundaryReliefBlocksLegacyDispatch(world:WorldState,actorId:string,siteId:string):boolean {
  return world.boundaryReliefs.cases.some(row=>
    (row.status==='travelling' || row.status==='offered' && world.tick<row.offerExpiresTick) &&
      (row.incomingId===actorId || row.postSiteId===siteId) || row.status==='returning' && row.incomingId===actorId);
}

function availableReserve(world:WorldState,actor:Cultivator|undefined,sect:Sect,originId:string,tick:number):actor is Cultivator {
  return serving(actor) && actor.id!==sect.leaderId && actor.sectId===sect.id && actor.locationId===originId &&
    !activeGuard(actor,world,tick) && !conflictingDuty(world,actor,tick);
}

export function availableBoundaryReliefActions(actor:Cultivator,world:WorldState,executionTick=world.tick):BoundaryReliefOption[] {
  if ((executionTick!==world.tick && executionTick!==world.tick+1) || !serving(actor) || !world.cultivators.includes(actor)) return [];
  const {cases}=world.boundaryReliefs;
  const options:BoundaryReliefOption[]=[];
  for(const row of cases) {
    if(closed(row) || row.leaderId!==actor.id && row.incomingId!==actor.id) continue;
    const add=(boundaryReliefMove:Exclude<BoundaryReliefMove,'offer'>)=>
      options.push({action:'BOUNDARY_RELIEF',boundaryReliefMove,targetBoundaryReliefId:row.id});
    if(row.status==='travelling') {add('withdraw');continue;}
    if(row.status!=='offered' || executionTick>=row.offerExpiresTick) continue;
    if(row.leaderId===actor.id) {add('withdraw');continue;}
    add('decline');
    const command=leadership(world,row.sectId,row.leaderId,row.originSiteId);
    const post=siteAt(world,row.postSiteId);
    if(executionTick>row.offeredTick && command && command.leader.locationId===command.origin.id &&
      availableReserve(world,actor,command.sect,command.origin.id,executionTick) && ownedPost(post,row.sectId) &&
      !competingGuard(world,row,post,executionTick) && planPath(world,command.origin,post,command.leader,actor,executionTick)) add('accept');
  }
  if(cases.some(row=>isMovement(row) && row.incomingId===actor.id)) return options;
  const command=leadership(world,actor.sectId,actor.id,actor.locationId);
  if(!command || conflictingDuty(world,actor,executionTick)) return options;
  const posts=world.locations.filter(site=>ownedPost(site,command.sect.id) &&
    !cases.some(row=>!closed(row) && row.status!=='returning' && row.postSiteId===site.id))
    .sort((a,b)=>rankId(a.id,b.id));
  if(!posts.length) return options;
  const engaged=new Set(cases.filter(row=>!closed(row)).map(row=>row.incomingId));
  const reserves=world.cultivators.filter(other=>!engaged.has(other.id) &&
    availableReserve(world,other,command.sect,command.origin.id,executionTick)).sort((a,b)=>rankId(a.id,b.id));
  for(const post of posts) {
    const all=currentGuards(world,post,executionTick);
    if(all.length!==1 || !observedGuard(world,post,executionTick,all)) continue;
    for(const incoming of reserves) if(planPath(world,command.origin,post,actor,incoming,executionTick)) {
      options.push({action:'BOUNDARY_RELIEF',boundaryReliefMove:'offer',targetCultivatorId:incoming.id,targetLocationId:post.id});
    }
  }
  return options;
}

function event(world:WorldState,row:BoundaryRelief,key:string,title:string,description:string,siteId?:string):WorldEvent {
  return {id:`evt-${row.id}-${world.tick}-${key}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',title,description,actorIds:[row.leaderId,row.incumbentId,row.incomingId],witnessScope:'participants',
    ...(siteId&&siteAt(world,siteId)?{locationId:siteId}:{})};
}
function close(world:WorldState,row:BoundaryRelief,status:Terminal,reason?:Reason,actor?:Cultivator) {
  row.status=status;row.closedTick=world.tick;
  if(reason)row.closeReason=reason;
  if(actor)row.closedById=actor.id;
  else if(reason!=='withdrawn')delete row.closedById;
}
function returnStatus(reason:Reason):Terminal {
  return reason==='withdrawn' ? 'withdrawn' : reason==='late' ? 'expired' : 'interrupted';
}
function turnBack(world:WorldState,row:BoundaryRelief,reason:Reason,actor?:Cultivator) {
  if(actor)row.closedById=actor.id;
  if(row.pathIndex===0) close(world,row,returnStatus(reason),reason);
  else {row.status='returning';row.closeReason=reason;}
}
function updateCoverage(world:WorldState,row:BoundaryRelief,post:LocationNode|undefined) {
  const guard=ownedPost(post,row.sectId)?observedGuard(world,post,world.tick):undefined;
  if(guard)row.coverage={tick:world.tick,
    kind:outgoingBinding(world,row,guard,world.tick)?'incumbent':'other',guardId:guard.id};
  else {
    row.coverage={tick:world.tick,kind:'gap'};
    row.firstGapTick??=world.tick;
  }
}

export function resolveBoundaryReliefAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction!=='BOUNDARY_RELIEF')return null;
  const option=availableBoundaryReliefActions(actor,world).find(candidate=>candidate.boundaryReliefMove===payload.boundaryReliefMove &&
    candidate.targetCultivatorId===payload.targetCultivatorId && candidate.targetLocationId===payload.targetLocationId &&
    candidate.targetBoundaryReliefId===payload.targetBoundaryReliefId);
  if(!option)return null;
  const state=world.boundaryReliefs;
  if(option.boundaryReliefMove==='offer'){
    const post=siteAt(world,option.targetLocationId)!;
    const incumbent=observedGuard(world,post,world.tick)!;
    const row:BoundaryRelief={id:`boundary-relief-${state.nextId++}`,sectId:actor.sectId,leaderId:actor.id,incumbentId:incumbent.id,
      incomingId:option.targetCultivatorId,originSiteId:actor.locationId,postSiteId:post.id,
      incumbentAssignedTick:incumbent.guardAssignment!.assignedTick,offeredTick:world.tick,
      offerExpiresTick:world.tick+BOUNDARY_RELIEF_OFFER_TICKS,status:'offered',path:[],pathIndex:0,outboundSteps:0,returnSteps:0,strainSpent:0,
      coverage:{tick:world.tick,kind:'incumbent',guardId:incumbent.id}};
    state.cases.push(row);
    return event(world,row,'offer','提议沿实路换防','仍由已经在岗的原守备值守，候补未经同意、不获守备资格。',row.originSiteId);
  }
  const row=state.cases.find(item=>item.id===option.targetBoundaryReliefId)!;
  if(option.boundaryReliefMove==='decline'){
    close(world,row,'declined','declined',actor);
    return event(world,row,'declined','候补谢绝换防','未出发、未耗气，也没有交接。',row.originSiteId);
  }
  if(option.boundaryReliefMove==='withdraw'){
    turnBack(world,row,'withdrawn',actor);
    return event(world,row,'withdrawn','撤回换防','已经出发的候补沿实走的前缀折返，不瞬移或充当守备。');
  }
  const command=leadership(world,row.sectId,row.leaderId,row.originSiteId)!;
  const post=siteAt(world,row.postSiteId)!;
  const path=planPath(world,command.origin,post,command.leader,actor,world.tick);
  if(!path)return null;
  row.path=path;row.acceptedTick=world.tick;row.deadlineTick=world.tick+
    Math.ceil((path.length-1)/BOUNDARY_RELIEF_STRIDE)+BOUNDARY_RELIEF_LATE_GRACE_TICKS;
  row.status='travelling';
  updateCoverage(world,row,post);
  return event(world,row,'accepted','候补同意实路换防','确认往返气力，尚未离开山门或获得守备资格。',row.originSiteId);
}

function travelReason(world:WorldState,row:BoundaryRelief,incoming:Cultivator|undefined,post:LocationNode|undefined):Reason|undefined {
  if(!live(incoming) || incoming.locationId!==row.originSiteId)return 'actor_lost';
  if(!leadership(world,row.sectId,row.leaderId,row.originSiteId) || !ownedPost(post,row.sectId))return 'title_lost';
  if(!serving(incoming) || incoming.sectId!==row.sectId || activeGuard(incoming,world,world.tick) ||
    conflictingDuty(world,incoming,world.tick) || competingGuard(world,row,post,world.tick))return 'conflicting_duty';
  if(world.tick>=(row.deadlineTick??Infinity))return 'late';
  if(!samePoint(siteAt(world,row.originSiteId),row.path[0]) || !samePoint(post,row.path.at(-1)))return 'route_blocked';
  return undefined;
}

function paidStride(world:WorldState,row:BoundaryRelief,incoming:Cultivator,unsafe:ReadonlySet<string>) {
  const direction=row.status==='returning'?-1:1;
  const initial=row.path[row.pathIndex];
  let previous=initial&&terrainTileAt(world,initial.x,initial.y);
  if(!previous || unsafe.has(previous.id) || !Number.isFinite(incoming.qiProgress))return 0;
  const afford=Math.min(BOUNDARY_RELIEF_STRIDE,Math.floor(incoming.qiProgress/BOUNDARY_RELIEF_QI_PER_TILE));
  let walked=0;
  const explored:string[]=[];
  for(let i=1;i<=afford;i++){
    const point=row.path[row.pathIndex+direction*i];
    const tile=point&&terrainTileAt(world,point.x,point.y);
    if(!tile || !adjacent(previous,tile) || unsafe.has(tile.id))break;
    walked++;previous=tile;explored.push(tile.id);
  }
  if(!walked)return 0;
  row.pathIndex+=direction*walked;
  row.lastAdvancedTick=world.tick;
  if(direction>0)row.outboundSteps+=walked;
  else row.returnSteps+=walked;
  const spent=walked*BOUNDARY_RELIEF_QI_PER_TILE;
  row.strainSpent+=spent;
  incoming.qiProgress-=spent;
  incoming.exploredTileIds=[...new Set([...incoming.exploredTileIds,...explored])];
  return walked;
}

/** Run once after native actor decisions. Assignment changes only when actual final endpoint is reached. */
export function advanceBoundaryReliefs(world:WorldState):WorldEvent[] {
  const state=world.boundaryReliefs;
  if(!state.cases.length)return [];
  const events:WorldEvent[]=[];
  const unsafe=unsafeTiles(world,world.tick);
  for(const row of state.cases){
    if(closed(row))continue;
    const post=siteAt(world,row.postSiteId),incoming=actorAt(world,row.incomingId);
    updateCoverage(world,row,post);
    if(row.status==='offered'){
      const reason:Reason|undefined=world.tick>=row.offerExpiresTick?'offer_expired':!live(incoming)?'actor_lost':
        !leadership(world,row.sectId,row.leaderId,row.originSiteId)||!ownedPost(post,row.sectId)?'title_lost':
          (activeGuard(incoming,world,world.tick) || conflictingDuty(world,incoming,world.tick) ||
            competingGuard(world,row,post,world.tick))?'conflicting_duty':undefined;
      if(reason){
        close(world,row,reason==='offer_expired'?'expired':'interrupted',reason);
        events.push(event(world,row,reason,'换防邀约关闭','未实际出发或交接，原守备资格没有被替换。'));
      }
      continue;
    }
    if(!live(incoming)||incoming.locationId!==row.originSiteId){
      close(world,row,'interrupted','actor_lost');
      events.push(event(world,row,'actor-lost','候补无法继续行进','不把尚未走完的实路写成到岗或归返。'));
      continue;
    }
    if(row.status==='travelling'){
      const invalid=travelReason(world,row,incoming,post);
      if(invalid){
        turnBack(world,row,invalid);
        events.push(event(world,row,'turn-back','换防未成，按实路退回','不更换原守备；候补只沿已经走过的路线折返。'));
        if(closed(row))continue;
      }
    }
    if((row.acceptedTick??Infinity)>=world.tick || row.lastAdvancedTick===world.tick)continue;
    if(row.status==='returning'&&(!samePoint(siteAt(world,row.originSiteId),row.path[0]) ||
      conflictingDuty(world,incoming,world.tick)))continue;
    if(!paidStride(world,row,incoming,unsafe))continue;
    if(row.status==='returning'){
      if(row.pathIndex===0){
        const reason=row.closeReason??'route_blocked';
        close(world,row,returnStatus(reason),reason);
        events.push(event(world,row,'returned','候补沿实路返回山门','没有任命或瞬移；已行进的气力不返还。',row.originSiteId));
      }
      continue;
    }
    if(row.pathIndex!==row.path.length-1 || !post)continue;
    const incumbent=actorAt(world,row.incumbentId);
    const exactCurrent=incumbent?.guardAssignment?.locationId===row.postSiteId &&
      incumbent.guardAssignment.assignedTick===row.incumbentAssignedTick;
    if(exactCurrent && incumbent)delete incumbent.guardAssignment;
    incoming.locationId=post.id;
    incoming.guardAssignment={locationId:post.id,assignedTick:world.tick,expiresTick:world.tick+BOUNDARY_RELIEF_GUARD_TICKS};
    row.coverage={tick:world.tick,kind:'relief',guardId:incoming.id};
    close(world,row,'completed');
    events.push(event(world,row,'handover','候补实到关口后完成换防','只在实际走到原约定岗点时任命原候补；未发放战利品或额外位阶。',post.id));
  }
  const terminal=state.cases.filter(closed).sort((a,b)=>(b.closedTick??-1)-(a.closedTick??-1) ||
    Number(b.id.slice(16))-Number(a.id.slice(16)));
  const keep=new Set(terminal.slice(0,BOUNDARY_RELIEF_HISTORY_LIMIT).map(row=>row.id));
  for(const response of world.boundaryGapResponses?.responses??[])keep.add(response.reliefId);
  state.cases=state.cases.filter(row=>!closed(row)||row.closedTick===world.tick||keep.has(row.id));
  return events;
}

function canWitnessPost(world:WorldState,viewer:Cultivator,post:LocationNode|undefined) {
  const tile=post&&terrainTileAt(world,post.x,post.y);
  return live(viewer) && !!tile && currentVisibleTileIds(world,viewer).has(tile.id);
}

/** The map can publish confirmed visible status, never the people behind it or a remote route. */
export function getCurrentBoundaryCoverage(world:WorldState,viewer?:Cultivator):BoundaryCoverageView[];
export function getCurrentBoundaryCoverage(world:WorldState,viewer:Cultivator|undefined,postSiteId:string):BoundaryCoverageView|undefined;
export function getCurrentBoundaryCoverage(world:WorldState,viewer?:Cultivator,postSiteId?:string):
  BoundaryCoverageView[]|BoundaryCoverageView|undefined {
  if(!viewer || !live(viewer) || actorAt(world,viewer.id)!==viewer) return postSiteId===undefined?[]:undefined;
  const visible=currentVisibleTileIds(world,viewer);
  const cases=world.boundaryReliefs.cases.filter(row=>postSiteId===undefined || row.postSiteId===postSiteId);
  const rows:BoundaryCoverageView[]=[];
  for(const id of [...new Set(cases.map(row=>row.postSiteId))]){
    const post=siteAt(world,id);
    if(!post || !post.ownerSectId || !ownedPost(post,post.ownerSectId))continue;
    const tile=terrainTileAt(world,post.x,post.y);
    if(!tile || !visible.has(tile.id))continue;
    const matched=cases.filter(row=>row.postSiteId===id&&row.sectId===post.ownerSectId);
    if(!matched.length)continue;
    const guard=observedGuard(world,post,world.tick);
    const actualRelief=guard&&matched.some(row=>row.status==='completed'&&
      row.incomingId===guard.id&&row.closedTick===guard.guardAssignment?.assignedTick);
    const actualIncumbent=guard&&matched.some(row=>outgoingBinding(world,row,guard,world.tick));
    rows.push({postSiteId:post.id,tick:world.tick,kind:!guard?'gap':actualRelief?'relief':actualIncumbent?'incumbent':'other'});
  }
  return postSiteId===undefined?rows:rows[0];
}

export function visibleBoundaryReliefs(world:WorldState,viewer?:Cultivator):BoundaryReliefView[] {
  if(!viewer || actorAt(world,viewer.id)!==viewer)return [];
  return world.boundaryReliefs.cases.filter(row=>row.offeredTick<=world.tick&&interested(row,viewer.id)).map(row=>{
    const {path,coverage,firstGapTick,...basic}=row;
    const maySee=canWitnessPost(world,viewer,siteAt(world,row.postSiteId));
    const selfCompleted=row.status==='completed'&&row.incomingId===viewer.id;
    const view:BoundaryReliefView={...basic,stepsTotal:Math.max(0,path.length-1)};
    if(maySee||selfCompleted){
      view.coverage={...coverage};
      if(firstGapTick!==undefined)view.firstGapTick=firstGapTick;
    }
    return view;
  });
}

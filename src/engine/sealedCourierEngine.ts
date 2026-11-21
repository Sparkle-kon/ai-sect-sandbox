import type { CourierHandoff,CourierHandoffMove,CourierMove, Cultivator, DispatchCue, DispatchPayload, DispatchReason, LLMDecisionPayload, LocationNode, MapPoint, MapTile,
  SealedCourierState, SealedDispatch, WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';

export const COURIER_SERVICE_FEE = 12;
export const COURIER_OFFER_TICKS = 3;
export const COURIER_ROUTE_TICKS = 20;
export const COURIER_TILE_STRIDE = 5;
const RETAIN_TERMINAL = 64;
const PUBLIC_PROOF_TICKS = 12;
const DISPATCH_OPTIONS = 18;
const CUES = ['request_audience', 'offer_relief'] as const;

export interface CourierOption {
  action: 'SEALED_COURIER';
  courierMove: CourierMove;
  targetCourierId?: string;
  targetCultivatorId?: string;
  targetDispatchId?: string;
  targetDispatchSourceId?: string;
  dispatchCue?: DispatchCue;
}
export interface CourierView {
  id: string;
  role: 'sender' | 'courier' | 'recipient' | 'previous_courier';
  status: SealedDispatch['status'] | 'transferred';
  openedTick: number;
  offerExpiresTick: number;
  acceptedTick?: number;
  deadlineTick?: number;
  settledTick?: number;
  deliveredTick?: number;
  feePaid: number;
  reason?: DispatchReason;
  senderName?: string;
  recipientName?: string;
  originName?: string;
  destinationName?: string;
  payload?: DispatchPayload;
  checkpoint?: MapPoint;
}

export const createSealedCourierState = (): SealedCourierState => ({ dispatches: [], nextId: 1 });
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const findActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const findSite = (world: WorldState, id: string) => world.locations.find((site) => site.id === id);
const pending = (world: WorldState, row: SealedDispatch) => row.status === 'offered' && row.openedTick <= world.tick && row.offerExpiresTick > world.tick;
const traveling = (row: SealedDispatch) => row.status === 'in_transit' || row.status === 'returning';
const point = ({ x, y }: MapPoint): MapPoint => ({ x, y });

function localTile(world: WorldState, position: MapPoint): MapTile | undefined {
  const { x, y } = position, { rows, columns, tiles } = world.terrain;
  if (!rows || !columns || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1000 || y > 600) return undefined;
  const col = Math.min(columns - 1, Math.floor(x * columns / 1000));
  const row = Math.min(rows - 1, Math.floor(y * rows / 600));
  return tiles[row * columns + col];
}

/** Public surveyed roads use the published endpoints alone, never hidden terrain preferences or hazards. */
export function courierPublicPath(world: WorldState, from: LocationNode, to: LocationNode): MapPoint[] {
  const a = localTile(world, from), b = localTile(world, to);
  if (!a || !b || from.id === to.id) return [];
  if (a.id === b.id) return [point(from), point(to)];
  const { columns, rows } = world.terrain;
  const path = [point(from)];
  let col = a.col, row = a.row;
  const step = () => path.push({ x: (col + .5) * 1000 / columns, y: (row + .5) * 600 / rows });
  while (col !== b.col) { col += Math.sign(b.col - col); step(); }
  while (row !== b.row) { row += Math.sign(b.row - row); step(); }
  if (path.at(-1)?.x !== to.x || path.at(-1)?.y !== to.y) path.push(point(to));
  return path;
}

function publicDesk(world: WorldState, id: string): LocationNode | undefined {
  return world.locations.find((site) => site.id === id && (site.type === 'market' ||
    (site.type !== 'secret_realm' && world.sects.some((sect) => sect.headquartersId === site.id && site.ownerSectId === sect.id))));
}

export function activeCourierForActor(world: WorldState, actor: Cultivator): SealedDispatch | undefined {
  return world.couriers.dispatches.find((row) => traveling(row) && row.courierId === actor.id && (row.acceptedTick ?? Infinity) <= world.tick);
}

export function courierCheckpoint(world: WorldState, actor: Cultivator): MapPoint | undefined {
  if (!live(actor)) return undefined;
  const row = activeCourierForActor(world, actor);
  const position = row?.path[row.pathIndex];
  return position && point(position);
}

export function courierActedThisTick(world: WorldState, actor: Cultivator): boolean {
  return world.couriers.dispatches.some((row) =>
    (row.courierId===actor.id&&row.acceptedTick!==undefined&&
      (row.acceptedTick===world.tick||row.lastAdvancedTick===world.tick||row.settledTick===world.tick))||
    (row.handoff?.status==='transferred'&&row.handoff.settledTick===world.tick&&
      (row.courierId===actor.id||row.handoff.fromCourierId===actor.id)));
}

function physicallyHere(world: WorldState, actor: Cultivator | undefined, siteId: string): actor is Cultivator {
  return live(actor) && actor.age >= 18 && actor.locationId === siteId && Boolean(findSite(world, siteId)) &&
    !activeCourierForActor(world, actor) && !courierActedThisTick(world, actor) && !pilgrimageCheckpoint(world, actor) &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' && (row.organizerId === actor.id || row.companionId === actor.id)) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function legalCourier(world: WorldState, actor: Cultivator | undefined, siteId: string): actor is Cultivator {
  return physicallyHere(world, actor, siteId) && !(actor.guardAssignment && actor.guardAssignment.assignedTick <= world.tick &&
    actor.guardAssignment.expiresTick > world.tick);
}

export type CourierHandoffOption =
  | {action:'COURIER_HANDOFF';courierHandoffMove:'offer';targetDispatchId:string;targetCourierId:string}
  | {action:'COURIER_HANDOFF';courierHandoffMove:Exclude<CourierHandoffMove,'offer'>;targetDispatchId:string;targetCourierId?:never};
const handoffPost=(world:WorldState,id:string)=>world.locations.find(site=>site.id===id&&
  (site.type==='market'||site.type==='sect_hq'&&world.sects.some(sect=>sect.headquartersId===site.id&&site.ownerSectId===sect.id)));
const handoffParticipant=(world:WorldState,dispatch:SealedDispatch,actor:Cultivator|undefined,post:LocationNode):actor is Cultivator=>
  legalCourier(world,actor,post.id)&&actor.id!==dispatch.courierId&&actor.id!==dispatch.senderId&&actor.id!==dispatch.recipientId&&
  !world.boundaryReliefs.cases.some(row=>row.incomingId===actor.id&&(row.status==='travelling'||row.status==='returning'))&&
  !world.expeditionRescues.requests.some(row=>row.gateSiteId===post.id&&(row.explorerId===actor.id||row.rescuerId===actor.id)&&
    row.supplySpent===1&&(row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&
      !row.arrivedIds?.includes(actor.id)&&world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')))&&
  !world.couriers.dispatches.some(row=>row!==dispatch&&row.courierId===actor.id&&(pending(world,row)||traveling(row)));
function matchingPost(world:WorldState,dispatch:SealedDispatch){
  const row=dispatch.handoff;
  if(!row||dispatch.status!=='in_transit'||dispatch.pathIndex!==row.pathIndex||row.pathIndex<=0||
    row.pathIndex>=dispatch.path.length-1)return undefined;
  const checkpoint=dispatch.path[row.pathIndex];
  const post=handoffPost(world,row.postId);
  return post&&checkpoint&&localTile(world,post)?.id===row.tileId&&localTile(world,checkpoint)?.id===row.tileId&&
    Math.hypot(post.x-checkpoint.x,post.y-checkpoint.y)<=30?post:undefined;
}
const handoffDanger=(world:WorldState,tileId:string,tick:number)=>world.mapHazards.some(row=>
  row.tileId===tileId&&row.createdTick<=tick&&tick<row.expiresTick&&row.intensity>=2);
const currentHandoffCarrier=(world:WorldState,dispatch:SealedDispatch,actor:Cultivator)=>
  findActor(world,actor.id)===actor&&live(actor)&&actor.id===dispatch.courierId&&
    actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !pilgrimageCheckpoint(world,actor)&&
    !world.pilgrimages.journeys.some(row=>row.status==='active'&&(row.organizerId===actor.id||row.companionId===actor.id))&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(actor.id))&&
    !world.escorts.contracts.some(row=>row.status==='active'&&row.escortId===actor.id)&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===actor.id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(actor.id)))&&
    !world.expeditionRescues.requests.some(row=>(row.explorerId===actor.id||row.rescuerId===actor.id)&&row.supplySpent===1&&
      (row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&!row.arrivedIds?.includes(actor.id)&&
        world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
export function availableCourierHandoffActions(actor:Cultivator,world:WorldState,executionTick=world.tick):CourierHandoffOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||findActor(world,actor.id)!==actor||!live(actor))return [];
  const actions:CourierHandoffOption[]=[];
  for(const dispatch of world.couriers.dispatches){
    const row=dispatch.handoff;
    if(!row||(dispatch.deadlineTick??0)<=executionTick||!findSite(world,dispatch.destinationId)||
      handoffDanger(world,row.tileId,executionTick))continue;
    const post=matchingPost(world,dispatch);
    if(!post)continue;
    if(row.status==='arrived'&&row.arrivedTick+1===executionTick&&
      (executionTick!==world.tick||row.lastHeldTick===executionTick)&&currentHandoffCarrier(world,dispatch,actor)){
      for(const peer of world.cultivators)if(handoffParticipant(world,dispatch,peer,post))
        actions.push({action:'COURIER_HANDOFF',courierHandoffMove:'offer',targetDispatchId:dispatch.id,targetCourierId:peer.id});
    }
    if(row.status!=='offered'||actor.id!==row.candidateId||executionTick!==(row.offeredTick??-2)+1||
      (executionTick===world.tick&&row.lastHeldTick!==executionTick)||!handoffParticipant(world,dispatch,actor,post))continue;
    const old=findActor(world,dispatch.courierId);
    if(!old||!currentHandoffCarrier(world,dispatch,old)||old.id!==row.fromCourierId)continue;
    actions.push({action:'COURIER_HANDOFF',courierHandoffMove:'accept',targetDispatchId:dispatch.id},
      {action:'COURIER_HANDOFF',courierHandoffMove:'decline',targetDispatchId:dispatch.id});
  }
  return actions;
}
export function courierHandoffMayOfferNow(world:WorldState,actor:Cultivator,executionTick=world.tick):boolean{
  return availableCourierHandoffActions(actor,world,executionTick).some(action=>action.courierHandoffMove==='offer');
}
function endHandoff(row:CourierHandoff,world:WorldState,status:'missed'|'interrupted',reason:NonNullable<CourierHandoff['reason']>){
  row.status=status;row.reason=reason;row.settledTick=world.tick;
}
export function resolveCourierHandoffAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  const move=decision.courierHandoffMove;
  if(decision.chosenAction!=='COURIER_HANDOFF'||Object.entries(decision).some(([key,value])=>value!==undefined&&
    !['chosenAction','innerMonologue','spokenLine','courierHandoffMove','targetDispatchId',
      ...(move==='offer'?['targetCourierId']:[])].includes(key)&&!(key==='action'&&value==='COURIER_HANDOFF')))return null;
  const option=availableCourierHandoffActions(actor,world).find(action=>action.courierHandoffMove===move&&
    action.targetDispatchId===decision.targetDispatchId&&action.targetCourierId===decision.targetCourierId);
  if(!option)return null;
  const dispatch=world.couriers.dispatches.find(row=>row.id===option.targetDispatchId);
  const row=dispatch?.handoff;
  if(!dispatch||!row)return null;
  if(option.courierHandoffMove==='offer'){
    row.status='offered';row.candidateId=option.targetCourierId;row.offeredTick=world.tick;
    return event(world,dispatch,'handoff-offered');
  }
  if(option.courierHandoffMove==='decline'){
    row.status='declined';row.settledTick=world.tick;
    return event(world,dispatch,'handoff-declined');
  }
  const old=findActor(world,row.fromCourierId),post=matchingPost(world,dispatch);
  if(!old||!post)return null;
  dispatch.courierId=actor.id;
  old.locationId=post.id;
  if(!old.exploredTileIds.includes(row.tileId))old.exploredTileIds=[...old.exploredTileIds,row.tileId];
  if(!actor.exploredTileIds.includes(row.tileId))actor.exploredTileIds=[...actor.exploredTileIds,row.tileId];
  row.status='transferred';row.settledTick=world.tick;
  return event(world,dispatch,'handoff-transferred');
}

/** A real checkpoint may stop only once, with enough time for the original trip after both bounded waiting dates. */
function openHandoff(world:WorldState,dispatch:SealedDispatch,fromPathIndex:number,tileId:string):boolean{
  const pathIndex=dispatch.pathIndex,checkpoint=dispatch.path[pathIndex];
  if(dispatch.handoff||dispatch.status!=='in_transit'||pathIndex<=0||pathIndex>=dispatch.path.length-1||
    world.tick+2+Math.ceil((dispatch.path.length-1-pathIndex)/COURIER_TILE_STRIDE)>=(dispatch.deadlineTick??0))return false;
  const carrier=findActor(world,dispatch.courierId);
  if(!carrier||!currentHandoffCarrier(world,dispatch,carrier))return false;
  const posts=world.locations.filter(site=>site.id!==dispatch.originId&&site.id!==dispatch.destinationId&&
    localTile(world,site)?.id===tileId&&Math.hypot(site.x-checkpoint.x,site.y-checkpoint.y)<=30&&handoffPost(world,site.id))
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const post=posts.find(site=>world.cultivators.some(actor=>handoffParticipant(world,dispatch,actor,site)));
  if(!post)return false;
  dispatch.originalCourierId=dispatch.courierId;
  dispatch.handoff={postId:post.id,tileId,fromPathIndex,pathIndex,arrivedTick:world.tick,fromCourierId:dispatch.courierId,
    path:dispatch.path.map(point),furthestPathIndex:pathIndex,status:'arrived'};
  return true;
}

/** Check current route safety first; waiting uses a separate clock and cannot reset the real deadline. */
function holdHandoff(world:WorldState,dispatch:SealedDispatch):boolean{
  const row=dispatch.handoff;
  if(!row||row.status!=='arrived'&&row.status!=='offered')return false;
  if(dispatch.status!=='in_transit'){
    endHandoff(row,world,'interrupted','route_interrupted');
    return false;
  }
  const post=matchingPost(world,dispatch);
  if(!post){endHandoff(row,world,'interrupted','post_unavailable');return false;}
  if(handoffDanger(world,row.tileId,world.tick)){
    endHandoff(row,world,'interrupted','hazard');
    dispatch.status='returning';dispatch.reason='hazard';
    return false;
  }
  const carrier=findActor(world,dispatch.courierId);
  if(!carrier||!currentHandoffCarrier(world,dispatch,carrier)){
    endHandoff(row,world,'interrupted','carrier_unavailable');
    return false;
  }
  const holdDate=row.status==='arrived'?row.arrivedTick+1:(row.offeredTick??-2)+1;
  if(world.tick>holdDate){
    endHandoff(row,world,'missed',row.status==='arrived'?'unoffered':'unconfirmed');
    return false;
  }
  const eligible=row.status==='arrived'?world.cultivators.some(actor=>handoffParticipant(world,dispatch,actor,post)):
    handoffParticipant(world,dispatch,row.candidateId?findActor(world,row.candidateId):undefined,post);
  if(!eligible){endHandoff(row,world,'interrupted','carrier_unavailable');return false;}
  row.lastHeldTick=world.tick;
  return true;
}

export function publicCourierReliefProof(world: WorldState, sender: Cultivator, sourceEventId: string): DispatchPayload | undefined {
  const records = world.events.filter(({ id }) => id === sourceEventId);
  if (records.length !== 1) return undefined;
  const [event] = records;
  if (event.witnessScope === 'participants' || event.tick > world.tick || world.tick - event.tick >= PUBLIC_PROOF_TICKS ||
      event.category !== 'diplomacy' || event.locationId !== sender.locationId || event.actorIds.length !== 1 ||
      event.actorIds[0] !== sender.id) return undefined;
  const receipt = world.settlements.records.find((row) => row.kind === 'relief' && `evt-${row.id}` === sourceEventId &&
    row.tick === event.tick && row.actorId === sender.id && row.people === 0 && row.stones > 0 && row.herbs > 0 &&
    row.id === `settlement-${row.tick}-relief-${row.settlementId}-${sender.id}`);
  if (!receipt || !world.settlements.villages.some((row) => row.id === receipt.settlementId && row.locationId === sender.locationId)) return undefined;
  return { kind: 'public_relief', sourceEventId, settlementId: receipt.settlementId, stones: receipt.stones, herbs: receipt.herbs };
}

export function availableCourierActions(actor: Cultivator, world: WorldState, includeSend = true): CourierOption[] {
  if (!live(actor)) return [];
  const options: CourierOption[] = [];
  const add = (courierMove: CourierMove, targetDispatchId: string) => options.push({ action: 'SEALED_COURIER', courierMove, targetDispatchId });
  for (const dispatch of world.couriers.dispatches) {
    if (dispatch.courierId !== actor.id || !pending(world, dispatch)) continue;
    add('decline', dispatch.id);
    const sender = findActor(world, dispatch.senderId);
    const from = publicDesk(world, dispatch.originId), to = publicDesk(world, dispatch.destinationId);
    if (from && to && physicallyHere(world, sender, from.id) && legalCourier(world, actor, from.id) &&
        sender.spiritStones >= COURIER_SERVICE_FEE && courierPublicPath(world, from, to).length > 1) add('accept', dispatch.id);
  }
  if (!includeSend || actor.spiritStones < COURIER_SERVICE_FEE || !physicallyHere(world, actor, actor.locationId) ||
      world.couriers.dispatches.some((row) => row.senderId === actor.id && (pending(world, row) || traveling(row)))) return options;
  const origin = publicDesk(world, actor.locationId);
  if (!origin) return options;
  const busy = new Set(world.couriers.dispatches.filter((row) => pending(world, row) || traveling(row)).map(({ courierId }) => courierId));
  const localCouriers = world.cultivators.filter((person) => person.id !== actor.id && !busy.has(person.id) && legalCourier(world, person, origin.id))
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2);
  if (!localCouriers.length) return options;
  const relief = [...world.settlements.records].reverse().find((row) => row.kind === 'relief' && row.actorId === actor.id &&
    publicCourierReliefProof(world, actor, `evt-${row.id}`));
  let length = 0;
  for (const other of world.sects) {
    const recipient = other.leaderId && findActor(world, other.leaderId);
    const address = publicDesk(world, other.headquartersId);
    if (!address || address.id === origin.id || !recipient || !live(recipient) || recipient.id === actor.id) continue;
    if (courierPublicPath(world, origin, address).length < 2) continue;
    for (const courier of localCouriers) {
      if (recipient.id === courier.id) continue;
      const common = { action: 'SEALED_COURIER' as const, courierMove: 'send' as const, targetCourierId: courier.id, targetCultivatorId: recipient.id };
      options.push(...CUES.map((dispatchCue) => ({ ...common, dispatchCue })));
      length += CUES.length;
      if (relief) { options.push({ ...common, targetDispatchSourceId: `evt-${relief.id}` }); length++; }
      if (length >= DISPATCH_OPTIONS) return options;
    }
  }
  return options;
}

function event(world: WorldState, dispatch: SealedDispatch, action: string): WorldEvent {
  // The global feed may render participant-scoped events. No names, route, payload, fee or outcome ever go in this shell.
  return { id: `evt-${dispatch.id}-${action}-${world.tick}`, tick: world.tick, year: world.year, month: world.month,
    actorIds: [], category: 'diplomacy', witnessScope: 'participants', title: '密封递送登记更新', description: '内容仅在获授权的信件面板中可见。' };
}

export function resolveCourierAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SEALED_COURIER' || !world.cultivators.includes(actor)) return null;
  const take = availableCourierActions(actor, world, decision.courierMove === 'send').find((row) =>
    row.courierMove === decision.courierMove && row.targetCourierId === decision.targetCourierId && row.targetCultivatorId === decision.targetCultivatorId &&
    row.targetDispatchId === decision.targetDispatchId && row.dispatchCue === decision.dispatchCue && row.targetDispatchSourceId === decision.targetDispatchSourceId);
  if (!take) return null;
  if (take.courierMove === 'send') {
    const recipientSect = world.sects.find(({ leaderId }) => leaderId === take.targetCultivatorId)!;
    const sealed: DispatchPayload | undefined = take.dispatchCue ? { kind: 'private_cue', cue: take.dispatchCue } :
      publicCourierReliefProof(world, actor, take.targetDispatchSourceId!);
    if (!sealed) return null;
    const dispatch: SealedDispatch = { id: `sealed-dispatch-${world.couriers.nextId++}`, senderId: actor.id, recipientId: take.targetCultivatorId!,
      courierId: take.targetCourierId!, originId: actor.locationId, destinationId: recipientSect.headquartersId, openedTick: world.tick,
      offerExpiresTick: world.tick + COURIER_OFFER_TICKS, status: 'offered', sealed, path: [], pathIndex: 0, feePaid: 0 };
    world.couriers.dispatches.push(dispatch);
    return event(world, dispatch, 'booked');
  }
  const dispatch = world.couriers.dispatches.find(({ id }) => id === take.targetDispatchId)!;
  if (take.courierMove === 'decline') {
    dispatch.status = 'declined'; dispatch.reason = 'declined'; dispatch.settledTick = world.tick;
    return event(world, dispatch, 'settled');
  }
  const sender = findActor(world, dispatch.senderId)!;
  const from = publicDesk(world, dispatch.originId)!, to = publicDesk(world, dispatch.destinationId)!;
  dispatch.path = courierPublicPath(world, from, to);
  if (dispatch.path.length < 2) return null;
  sender.spiritStones -= COURIER_SERVICE_FEE;
  actor.spiritStones += COURIER_SERVICE_FEE;
  dispatch.feePaid = COURIER_SERVICE_FEE;
  dispatch.acceptedTick = world.tick;
  dispatch.deadlineTick = world.tick + COURIER_ROUTE_TICKS;
  dispatch.status = 'in_transit';
  return event(world, dispatch, 'accepted');
}

function terminal(world: WorldState, dispatch: SealedDispatch, status: 'delivered' | 'lost' | 'returned', reason?: DispatchReason): WorldEvent {
  dispatch.status = status;
  dispatch.settledTick = world.tick;
  dispatch.reason = reason;
  if (status === 'delivered') dispatch.deliveredTick = world.tick;
  if(dispatch.handoff){
    const handoff=dispatch.handoff;
    if(handoff.status==='arrived'||handoff.status==='offered')endHandoff(handoff,world,'interrupted','route_interrupted');
    handoff.terminal={tick:world.tick,pathIndex:dispatch.pathIndex,courierId:dispatch.courierId,status};
  }
  dispatch.path = [];
  dispatch.pathIndex = 0;
  return event(world, dispatch, 'settled');
}

/** Reconcile verified deaths from this snapshot without inventing a movement step. */
export function reconcileCourierDeaths(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const dispatch of world.couriers.dispatches) {
    if (dispatch.openedTick > world.tick || (dispatch.status !== 'offered' && !traveling(dispatch))) continue;
    const courier = findActor(world, dispatch.courierId);
    if (!courier) continue;
    if (courier.alive && courier.hp > 0) {
      const row=dispatch.handoff;
      if(row&&(row.status==='arrived'||row.status==='offered')){
        const post=matchingPost(world,dispatch);
        const unavailable=!currentHandoffCarrier(world,dispatch,courier)||
          row.status==='offered'&&!!post&&!handoffParticipant(world,dispatch,row.candidateId?findActor(world,row.candidateId):undefined,post);
        if(!post||unavailable){
          endHandoff(row,world,'interrupted',!post?'post_unavailable':'carrier_unavailable');
          events.push(event(world,dispatch,'handoff-interrupted'));
        }
      }
      continue;
    }
    if (dispatch.status === 'offered') {
      dispatch.status = 'expired';
      dispatch.reason = 'courier_death';
      dispatch.settledTick = world.tick;
      events.push(event(world, dispatch, 'settled'));
    } else {
      events.push(terminal(world, dispatch, 'lost', 'courier_death'));
    }
  }
  return events;
}

function recordHandoffTurnback(world:WorldState,dispatch:SealedDispatch,reason:NonNullable<CourierHandoff['turnback']>['reason']){
  if(dispatch.handoff&&!dispatch.handoff.turnback)dispatch.handoff.turnback={tick:world.tick,pathIndex:dispatch.pathIndex,reason};
}
export function advanceCouriers(world: WorldState): WorldEvent[] {
  const state = world.couriers;
  if (!state.dispatches.length) return [];
  const results: WorldEvent[] = [];
  const hazardous = new Set(world.mapHazards.filter((item) => item.createdTick <= world.tick && world.tick < item.expiresTick &&
    item.intensity >= 2).map(({ tileId }) => tileId));
  for (const dispatch of state.dispatches) {
    if (dispatch.openedTick > world.tick) continue;
    if (dispatch.status === 'offered' && dispatch.offerExpiresTick <= world.tick) {
      dispatch.status = 'expired'; dispatch.reason = 'offer_expiry'; dispatch.settledTick = world.tick;
      results.push(event(world, dispatch, 'settled'));
      continue;
    }
    if (!traveling(dispatch) || (dispatch.acceptedTick ?? Infinity) >= world.tick ||
        dispatch.lastAdvancedTick === world.tick || dispatch.handoff?.lastHeldTick===world.tick) continue;
    const courier = findActor(world, dispatch.courierId);
    if (!live(courier)) { results.push(terminal(world, dispatch, 'lost', courier ? 'courier_death' : 'route_lost')); continue; }
    if ((dispatch.deadlineTick ?? 0) <= world.tick) { results.push(terminal(world, dispatch, 'lost', 'deadline')); continue; }
    const origin = findSite(world, dispatch.originId), destination = findSite(world, dispatch.destinationId);
    if (!destination && dispatch.status === 'in_transit') {
      dispatch.status = 'returning'; dispatch.reason = 'route_lost';
      recordHandoffTurnback(world,dispatch,'route_lost');
    }
    if ((!origin && dispatch.status === 'returning') || !dispatch.path[dispatch.pathIndex]) {
      results.push(terminal(world, dispatch, 'lost', 'route_lost')); continue;
    }
    if(holdHandoff(world,dispatch))continue;
    if(dispatch.status==='returning'&&dispatch.reason==='hazard')recordHandoffTurnback(world,dispatch,'hazard');
    dispatch.lastAdvancedTick=world.tick;
    const fromPathIndex=dispatch.pathIndex;
    const direction = dispatch.status === 'returning' ? -1 : 1;
    const end = Math.max(0, Math.min(dispatch.path.length - 1, dispatch.pathIndex + direction * COURIER_TILE_STRIDE));
    const crossed: string[] = [];
    for (let index = dispatch.pathIndex + direction; direction > 0 ? index <= end : index >= end; index += direction) {
      const tile = localTile(world, dispatch.path[index]);
      if (!tile) { results.push(terminal(world, dispatch, 'lost', 'route_lost')); break; }
      crossed.push(tile.id);
      dispatch.pathIndex = index;
      if(dispatch.handoff)dispatch.handoff.furthestPathIndex=Math.max(dispatch.handoff.furthestPathIndex,index);
      if (dispatch.reason !== 'hazard' && hazardous.has(tile.id)) {
        dispatch.status = 'returning';
        dispatch.reason = 'hazard';
        recordHandoffTurnback(world,dispatch,'hazard');
        results.push(event(world, dispatch, 'progress'));
        break;
      }
      if(direction===1 && openHandoff(world,dispatch,fromPathIndex,tile.id)){
        results.push(event(world,dispatch,'handoff-checkpoint'));
        break;
      }
    }
    if (crossed.length) courier.exploredTileIds = [...new Set([...courier.exploredTileIds, ...crossed])];
    if (!traveling(dispatch)) continue;
    if (dispatch.status === 'in_transit' && dispatch.pathIndex === dispatch.path.length - 1 && destination) {
      courier.locationId = destination.id;
      const recipient = findActor(world, dispatch.recipientId);
      if (physicallyHere(world, recipient, destination.id)) results.push(terminal(world, dispatch, 'delivered'));
      else {
        dispatch.status = 'returning';
        dispatch.reason = live(recipient) ? 'recipient_absent' : 'recipient_unavailable';
        recordHandoffTurnback(world,dispatch,dispatch.reason);
        results.push(event(world, dispatch, 'progress'));
      }
    } else if (dispatch.status === 'returning' && dispatch.pathIndex === 0 && origin) {
      courier.locationId = origin.id;
      results.push(terminal(world, dispatch, dispatch.reason === 'hazard' ? 'lost' : 'returned', dispatch.reason));
    }
  }
  const kept = new Set(state.dispatches.filter((row) => row.status !== 'offered' && !traveling(row))
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-RETAIN_TERMINAL).map(({ id }) => id));
  state.dispatches = state.dispatches.filter((row) => row.status === 'offered' || traveling(row) || !!row.handoff || kept.has(row.id) || row.settledTick === world.tick);
  return results;
}

export function visibleCouriers(world: WorldState, viewer?: Cultivator): CourierView[] {
  const actor = viewer && findActor(world, viewer.id);
  if (!actor) return [];
  return world.couriers.dispatches.flatMap((row): CourierView[] => {
    if (row.openedTick > world.tick) return [];
    const role = actor.id === row.senderId ? 'sender' : actor.id === row.courierId ? 'courier' :
      actor.id === row.recipientId && row.status === 'delivered' && (row.deliveredTick ?? Infinity) <= world.tick ? 'recipient' :
        actor.id === row.originalCourierId && row.handoff?.status==='transferred' ? 'previous_courier' : undefined;
    if (!role) return [];
    const checkpoint = role === 'courier' && traveling(row) ? courierCheckpoint(world, actor) : undefined;
    if(role==='previous_courier')return [{id:row.id,role,status:'transferred',openedTick:row.openedTick,
      offerExpiresTick:row.offerExpiresTick,acceptedTick:row.acceptedTick,settledTick:row.handoff?.settledTick,feePaid:row.feePaid}];
    return [{ id: row.id, role, status: row.status, openedTick: row.openedTick, offerExpiresTick: row.offerExpiresTick,
      acceptedTick: row.acceptedTick, deadlineTick: row.deadlineTick, settledTick: row.settledTick, deliveredTick: row.deliveredTick,
      feePaid: role==='recipient'||role==='courier'&&!!row.originalCourierId&&row.originalCourierId!==actor.id?0:row.feePaid,
      reason:row.reason,
      ...(role==='sender'||role==='recipient' ? { senderName: findActor(world, row.senderId)?.name, payload: { ...row.sealed } } : {}),
      ...(role === 'sender' ? { recipientName: findActor(world, row.recipientId)?.name } : {}),
      ...(role==='sender'||role==='courier' ? { originName: findSite(world, row.originId)?.name, destinationName: findSite(world, row.destinationId)?.name } : {}),
      ...(checkpoint ? { checkpoint } : {}) }];
  });
}

/** Only the named parties may see this checkpoint history, without sealed contents or route geometry. */
export function projectCourierHandoffs(world:WorldState,viewer?:Cultivator){
  if(!viewer||findActor(world,viewer.id)!==viewer)return [];
  return world.couriers.dispatches.flatMap(dispatch=>{
    const row=dispatch.handoff;
    if(!row)return [];
    const role=viewer.id===dispatch.senderId?'sender' as const:
      viewer.id===dispatch.recipientId&&dispatch.status==='delivered'?'recipient' as const:
      viewer.id===dispatch.courierId?'current' as const:
      viewer.id===row.fromCourierId&&row.status==='transferred'?'former' as const:
      viewer.id===row.candidateId&&row.offeredTick!==undefined?'invited' as const:undefined;
    if(!role)return [];
    const post=handoffPost(world,row.postId);
    return [{dispatchId:dispatch.id,role,status:row.status,postName:post?.name??'原交接驿站',
      arrivedTick:row.arrivedTick,offeredTick:row.offeredTick,lastHeldTick:row.lastHeldTick,
      settledTick:row.settledTick,reason:row.reason,
      ...(role!=='invited'&&role!=='former'&&row.terminal?{terminalStatus:row.terminal.status}:{})}];
  });
}
export function projectLocalCourierHandoff(world:WorldState,viewer?:Cultivator){
  if(!viewer||findActor(world,viewer.id)!==viewer||!live(viewer))return undefined;
  for(const dispatch of world.couriers.dispatches){
    const row=dispatch.handoff;
    if(!row||row.status!=='arrived'&&row.status!=='offered')continue;
    const post=matchingPost(world,dispatch);
    if(!post||handoffDanger(world,row.tileId,world.tick))continue;
    if(viewer.id===dispatch.courierId&&currentHandoffCarrier(world,dispatch,viewer)||
      row.status==='offered'&&viewer.id===row.candidateId&&handoffParticipant(world,dispatch,viewer,post))
      return {siteId:post.id,status:row.status};
  }
  return undefined;
}

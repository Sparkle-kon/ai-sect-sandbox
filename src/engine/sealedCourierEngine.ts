import type { CourierMove, Cultivator, DispatchCue, DispatchPayload, DispatchReason, LLMDecisionPayload, LocationNode, MapPoint, MapTile,
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
  role: 'sender' | 'courier' | 'recipient';
  status: SealedDispatch['status'];
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
  return world.couriers.dispatches.some((row) => row.courierId === actor.id && row.acceptedTick !== undefined &&
    (row.acceptedTick === world.tick || row.lastAdvancedTick === world.tick || row.settledTick === world.tick));
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
    if (!courier || (courier.alive && courier.hp > 0)) continue;
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
    if (!traveling(dispatch) || (dispatch.acceptedTick ?? Infinity) >= world.tick || dispatch.lastAdvancedTick === world.tick) continue;
    dispatch.lastAdvancedTick = world.tick;
    const courier = findActor(world, dispatch.courierId);
    if (!live(courier)) { results.push(terminal(world, dispatch, 'lost', courier ? 'courier_death' : 'route_lost')); continue; }
    if ((dispatch.deadlineTick ?? 0) <= world.tick) { results.push(terminal(world, dispatch, 'lost', 'deadline')); continue; }
    const origin = findSite(world, dispatch.originId), destination = findSite(world, dispatch.destinationId);
    if (!destination && dispatch.status === 'in_transit') { dispatch.status = 'returning'; dispatch.reason = 'route_lost'; }
    if ((!origin && dispatch.status === 'returning') || !dispatch.path[dispatch.pathIndex]) {
      results.push(terminal(world, dispatch, 'lost', 'route_lost')); continue;
    }
    const direction = dispatch.status === 'returning' ? -1 : 1;
    const end = Math.max(0, Math.min(dispatch.path.length - 1, dispatch.pathIndex + direction * COURIER_TILE_STRIDE));
    const crossed: string[] = [];
    for (let index = dispatch.pathIndex + direction; direction > 0 ? index <= end : index >= end; index += direction) {
      const tile = localTile(world, dispatch.path[index]);
      if (!tile) { results.push(terminal(world, dispatch, 'lost', 'route_lost')); break; }
      crossed.push(tile.id);
      dispatch.pathIndex = index;
      if (dispatch.reason !== 'hazard' && hazardous.has(tile.id)) {
        dispatch.status = 'returning';
        dispatch.reason = 'hazard';
        results.push(event(world, dispatch, 'progress'));
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
        results.push(event(world, dispatch, 'progress'));
      }
    } else if (dispatch.status === 'returning' && dispatch.pathIndex === 0 && origin) {
      courier.locationId = origin.id;
      results.push(terminal(world, dispatch, dispatch.reason === 'hazard' ? 'lost' : 'returned', dispatch.reason));
    }
  }
  const kept = new Set(state.dispatches.filter((row) => row.status !== 'offered' && !traveling(row))
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-RETAIN_TERMINAL).map(({ id }) => id));
  state.dispatches = state.dispatches.filter((row) => row.status === 'offered' || traveling(row) || kept.has(row.id) || row.settledTick === world.tick);
  return results;
}

export function visibleCouriers(world: WorldState, viewer?: Cultivator): CourierView[] {
  const actor = viewer && findActor(world, viewer.id);
  if (!actor) return [];
  return world.couriers.dispatches.flatMap((row): CourierView[] => {
    if (row.openedTick > world.tick) return [];
    const role = actor.id === row.senderId ? 'sender' : actor.id === row.courierId ? 'courier' :
      actor.id === row.recipientId && row.status === 'delivered' && (row.deliveredTick ?? Infinity) <= world.tick ? 'recipient' : undefined;
    if (!role) return [];
    const checkpoint = role === 'courier' && traveling(row) ? courierCheckpoint(world, actor) : undefined;
    return [{ id: row.id, role, status: row.status, openedTick: row.openedTick, offerExpiresTick: row.offerExpiresTick,
      acceptedTick: row.acceptedTick, deadlineTick: row.deadlineTick, settledTick: row.settledTick, deliveredTick: row.deliveredTick,
      feePaid: role === 'recipient' ? 0 : row.feePaid, reason: row.reason,
      ...(role !== 'courier' ? { senderName: findActor(world, row.senderId)?.name, payload: { ...row.sealed } } : {}),
      ...(role === 'sender' ? { recipientName: findActor(world, row.recipientId)?.name } : {}),
      ...(role !== 'recipient' ? { originName: findSite(world, row.originId)?.name, destinationName: findSite(world, row.destinationId)?.name } : {}),
      ...(checkpoint ? { checkpoint } : {}) }];
  });
}

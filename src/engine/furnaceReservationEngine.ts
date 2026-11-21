import type {
  Cultivator, FurnaceReservation, FurnaceReservationState, FurnaceUseKind, FurnaceUseReceipt, LLMDecisionPayload,
  LocationNode, WorldEvent, WorldState,
} from '../types/world';
import { isFurnaceSafetyClosed } from './furnaceSafetyEngine';

export const FURNACE_QUEUE_TICKS = 4;
export const FURNACE_USE_RETENTION_TICKS = 6;
export const FURNACE_TERMINAL_LIMIT = 96;

type FurnaceReason = NonNullable<FurnaceReservation['reason']>;
type Assigned = FurnaceReservation & { assignedTick: number; slot: number };
export type FurnaceReservationActionOption =
  | { action: 'FURNACE_RESERVATION'; furnaceMove: 'reserve'; targetLocationId: string; targetWorkshopId?: string; targetFurnaceReservationId?: never }
  | { action: 'FURNACE_RESERVATION'; furnaceMove: 'cancel'; targetFurnaceReservationId: string; targetLocationId?: never; targetWorkshopId?: never };
export interface FurnaceView {
  siteId: string;
  tick: number;
  capacity: number;
  closed?: true;
  installedCapacity?: number;
  slots: Array<{ slot: number; status: 'free' | 'reserved' | 'used'; isOwn: boolean }>;
  queue: Array<{ position: number; requestedTick: number; expiresTick: number; isOwn: boolean }>;
  ownReservations: FurnaceReservation[];
  ownUses: FurnaceUseReceipt[];
}
export const createFurnaceReservationState = (): FurnaceReservationState => ({ reservations: [], uses: [], nextId: 1 });

const isLive = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const open = (row: FurnaceReservation) => row.status === 'queued' || row.status === 'reserved';
const capacity = (site: LocationNode | undefined) =>
  site?.furnaceGrade === 1 || site?.furnaceGrade === 2 || site?.furnaceGrade === 3 ? site.furnaceGrade : 0;
const operatingCapacity = (world: WorldState, site: LocationNode, tick: number) =>
  isFurnaceSafetyClosed(world,site.id,tick) ? 0 : capacity(site);
const at = (world: WorldState, siteId: string) => world.locations.find(site => site.id === siteId);
const first = (a: FurnaceReservation, b: FurnaceReservation) =>
  a.requestedTick - b.requestedTick || (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0);
const validTick = (world: WorldState, tick: number) => tick === world.tick || tick === world.tick + 1;
const useKinds = new Set<FurnaceUseKind>(['brew','forge','repair','awaken','workshop','relic']);

function physicallyAt(world: WorldState, actor: Cultivator | undefined, siteId: string, tick: number): actor is Cultivator {
  if (!isLive(actor) || actor.locationId !== siteId || actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  const id = actor.id;
  // The same physical restrictions as the world actor loop, without importing any furnace callers.
  return !world.couriers.dispatches.some(row => row.courierId === id &&
    (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === tick || row.settledTick === tick || row.acceptedTick === tick)) &&
    !world.pilgrimages.journeys.some(row => (row.organizerId === id || row.companionId === id) &&
      (row.status === 'active' || row.lastMovedTick === tick || row.startedTick === tick)) &&
    !world.escorts.contracts.some(row => row.status === 'active' && row.escortId === id) &&
    !world.relocations.plans.some(row => row.status === 'in_transit' && row.garrisonIds.includes(id)) &&
    !world.boundaryReliefs.cases.some(row => row.incomingId === id && (row.status === 'travelling' || row.status === 'returning')) &&
    !world.expeditionRescues.requests.some(row => row.gateSiteId === siteId && (row.explorerId === id || row.rescuerId === id) &&
      row.supplySpent === 1 && (row.status === 'extracting' || row.status === 'interrupted' && row.pathIndex > 0 &&
        !row.arrivedIds?.includes(id) && world.occasions.some(occasion => occasion.id === row.occasionId && occasion.status === 'running'))) &&
    !world.sieges.some(row => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(id)) &&
    !world.occasions.some(row => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(id));
}

const workshopActive = (world: WorldState, actorId: string, siteId: string, orderId: string, tick: number) =>
  world.workshops.orders.some(row => row.id === orderId && row.makerId === actorId && row.siteId === siteId &&
    row.status === 'active' && (row.acceptedTick ?? Infinity) <= tick && (row.deadlineTick ?? 0) > tick &&
    isLive(world.cultivators.find(actor => actor.id === row.patronId)));

function unavailable(world: WorldState, row: FurnaceReservation, tick: number, site: LocationNode | undefined, actor?: Cultivator): FurnaceReason | undefined {
  if (!capacity(site) || (row.status === 'reserved' && row.assignedTick === tick && (row.slot ?? Infinity) > capacity(site))) return 'site_unavailable';
  if (!physicallyAt(world, actor ?? world.cultivators.find(person => person.id === row.actorId), row.siteId, tick)) return 'actor_unavailable';
  if (row.workshopOrderId !== undefined && !workshopActive(world,row.actorId,row.siteId,row.workshopOrderId,tick)) return 'workshop_closed';
  if (row.status === 'reserved' && (row.assignedTick ?? -1) < tick) return 'turn_missed';
  if (row.expiresTick <= tick) return 'queue_expired';
  return undefined;
}

/** An eligible waiting row keeps its original identity and priority during a genuine closure. */
function suspendFurnaceTurn(world: WorldState,row: FurnaceReservation,site: LocationNode|undefined): boolean {
  if (!site || !isFurnaceSafetyClosed(world,site.id,world.tick)) return false;
  if (row.requestedTick < world.tick && row.lastSuspendedTick !== world.tick) {
    if (row.status === 'reserved') {
      row.status = 'queued';
      delete row.assignedTick;
      delete row.slot;
    }
    row.lastSuspendedTick = world.tick;
    row.suspendedTicks = (row.suspendedTicks ?? 0) + 1;
    row.expiresTick++;
  }
  return true;
}

function finish(row: FurnaceReservation, status: 'used' | 'cancelled' | 'expired', tick: number, reason?: FurnaceReason) {
  row.status = status;
  row.closedTick = tick;
  if (reason !== undefined) row.reason = reason;
}
const reasonStatus = (reason: FurnaceReason) => reason === 'turn_missed' || reason === 'queue_expired' ? 'expired' : 'cancelled';

function availableSlot(total: number, occupied: ReadonlySet<number>): number | undefined {
  for (let slot = 1; slot <= total; slot++) if (!occupied.has(slot)) return slot;
  return undefined;
}

function allocations(world: WorldState, site: LocationNode, tick: number, considerQueued = true) {
  const used = new Map<number,FurnaceUseReceipt>();
  const reserved = new Map<number,Assigned>();
  const { uses, reservations } = world.furnaceReservations;
  for (const row of uses) if (row.siteId === site.id && row.tick === tick) used.set(row.slot,row);
  const rows = reservations.filter(row => row.siteId === site.id && open(row));
  const actors = rows.length > 3 ? new Map(world.cultivators.map(person => [person.id,person])) : undefined;
  const valid = rows.filter(row => !unavailable(world,row,tick,site,actors?.get(row.actorId)));
  const queue = valid.filter(row => row.status === 'queued').sort(first);
  const total = operatingCapacity(world,site,tick);
  if (!total) return { used, reserved, queue, occupied:new Set(used.keys()) };
  for (const row of valid) {
    if (row.status === 'reserved' && row.assignedTick === tick && row.slot !== undefined && !used.has(row.slot)) {
      reserved.set(row.slot,row as Assigned);
    }
  }
  const occupied = new Set([...used.keys(),...reserved.keys()]);
  for (const row of considerQueued ? queue : []) {
    if (row.requestedTick >= tick) continue; // Today’s requests cannot displace today’s craft.
    const slot = availableSlot(total,occupied);
    if (slot === undefined) break;
    occupied.add(slot);
    reserved.set(slot,{ ...row,status:'reserved',assignedTick:tick,slot });
  }
  return { used,reserved,queue,occupied };
}

/** Monthly grant is deterministic by request tick and ordinal identity, not simulation actor order. */
export function openFurnaceTurn(world: WorldState): void {
  const { reservations } = world.furnaceReservations;
  if (!reservations.some(open)) return;
  const sites = new Map(world.locations.map(site => [site.id,site]));
  const actors = new Map(world.cultivators.map(actor => [actor.id,actor]));
  const queuedBySite = new Set<string>();
  for (const row of reservations) {
    if (!open(row)) continue;
    const site = sites.get(row.siteId);
    const reason = unavailable(world,row,world.tick,site,actors.get(row.actorId));
    if (reason) finish(row,reasonStatus(reason),world.tick,reason);
    else if (!suspendFurnaceTurn(world,row,site) && row.status === 'queued' && row.requestedTick < world.tick) queuedBySite.add(row.siteId);
  }
  const byId = new Map(reservations.map(row => [row.id,row]));
  for (const id of queuedBySite) {
    for (const allocated of allocations(world,sites.get(id)!,world.tick).reserved.values()) {
      const row = byId.get(allocated.id)!;
      if (row.status !== 'queued') continue;
      row.status = 'reserved';
      row.assignedTick = allocated.assignedTick;
      row.slot = allocated.slot;
    }
  }
}

/** Resolve unused capacity after all actors and their real cancellations, deaths or workshop changes. */
export function settleFurnaceTurn(world: WorldState): void {
  const state = world.furnaceReservations;
  if (!state.reservations.length && !state.uses.length) return;
  const sites = new Map(world.locations.map(site => [site.id,site]));
  const actors = new Map(world.cultivators.map(actor => [actor.id,actor]));
  for (const row of state.reservations) {
    if (!open(row)) continue;
    const site = sites.get(row.siteId);
    const reason = unavailable(world,row,world.tick,site,actors.get(row.actorId));
    if (reason) finish(row,reasonStatus(reason),world.tick,reason);
    else if (!suspendFurnaceTurn(world,row,site) && row.status === 'reserved' && row.assignedTick === world.tick) {
      finish(row,'expired',world.tick,'turn_missed');
    }
  }
  state.uses = state.uses.filter(row => row.tick > world.tick - FURNACE_USE_RETENTION_TICKS);
  const pins = new Set(state.uses.flatMap(row => row.reservationId ? [row.reservationId] : []));
  const terminal = state.reservations.filter(row => !open(row) && !pins.has(row.id))
    .sort((a,b) => (b.closedTick ?? -1) - (a.closedTick ?? -1) || Number(b.id.slice(8)) - Number(a.id.slice(8)));
  const keep = new Set(terminal.slice(0,FURNACE_TERMINAL_LIMIT).map(row => row.id));
  state.reservations = state.reservations.filter(row => open(row) || pins.has(row.id) || keep.has(row.id));
}

/** Preview a possible next-turn grant for model decisions; only the actual turn mutates occupancy. */
export function heldFurnaceReservation(world: WorldState, actor: Cultivator, executionTick = world.tick): FurnaceReservation | undefined {
  const site = at(world,actor.locationId);
  if (!validTick(world,executionTick) || !site || !operatingCapacity(world,site,executionTick) || !physicallyAt(world,actor,site.id,executionTick) ||
      !world.cultivators.includes(actor) || !world.furnaceReservations.reservations.some(row => row.actorId === actor.id && open(row))) return undefined;
  const held = [...allocations(world,site,executionTick).reserved.values()].find(row => row.actorId === actor.id);
  return held ? { ...held } : undefined;
}

function actualOption(world: WorldState, actor: Cultivator, siteId: string, kind: FurnaceUseKind, workshopOrderId: string | undefined, tick: number) {
  const site = at(world,siteId);
  if (!validTick(world,tick) || !useKinds.has(kind) || !site || !operatingCapacity(world,site,tick) || !physicallyAt(world,actor,siteId,tick) || !world.cultivators.includes(actor) ||
    (kind === 'workshop') !== (workshopOrderId !== undefined) ||
    (workshopOrderId !== undefined && !workshopActive(world,actor.id,siteId,workshopOrderId,tick)) ||
    world.furnaceReservations.uses.some(row => row.actorId === actor.id && row.tick === tick)) return undefined;
  const { reserved, occupied } = allocations(world,site,tick);
  const owned = [...reserved.values()].find(row => row.actorId === actor.id);
  if (owned) return owned.workshopOrderId === workshopOrderId ? { slot:owned.slot,reservationId:owned.id } : undefined;
  // A live queued holder cannot bypass the queue with a different paid operation.
  if (world.furnaceReservations.reservations.some(row => row.actorId === actor.id && row.status === 'queued' &&
      !unavailable(world,row,tick,at(world,row.siteId),actor))) return undefined;
  const slot = availableSlot(capacity(site),occupied);
  return slot === undefined ? undefined : { slot,reservationId:undefined };
}

export function canUseFurnace(world: WorldState, actor: Cultivator, siteId: string, kind: FurnaceUseKind,
  workshopOrderId?: string, executionTick = world.tick): boolean {
  return actualOption(world,actor,siteId,kind,workshopOrderId,executionTick) !== undefined;
}

/** The caller has already validated its ingredients/output. Claim immediately before the canonical mutation. */
export function claimFurnaceUse(world: WorldState, actor: Cultivator, siteId: string, kind: FurnaceUseKind, workshopOrderId?: string): boolean {
  if (!actualOption(world,actor,siteId,kind,workshopOrderId,world.tick)) return false;
  openFurnaceTurn(world);
  const option = actualOption(world,actor,siteId,kind,workshopOrderId,world.tick);
  if (!option) return false;
  const reservation = option.reservationId && world.furnaceReservations.reservations.find(row => row.id === option.reservationId);
  if (reservation) finish(reservation,'used',world.tick);
  world.furnaceReservations.uses.push({ siteId,actorId:actor.id,tick:world.tick,slot:option.slot,kind,
    ...(workshopOrderId === undefined ? {} : { workshopOrderId }),
    ...(option.reservationId === undefined ? {} : { reservationId:option.reservationId }) });
  return true;
}

export function availableFurnaceReservationActions(actor: Cultivator, world: WorldState, executionTick = world.tick): FurnaceReservationActionOption[] {
  if (!validTick(world,executionTick) || !isLive(actor) || !world.cultivators.includes(actor)) return [];
  const active = world.furnaceReservations.reservations.find(row => row.actorId === actor.id && open(row) &&
    (executionTick === world.tick || !unavailable(world,row,executionTick,at(world,row.siteId),actor)));
  if (active) return [{ action:'FURNACE_RESERVATION',furnaceMove:'cancel',targetFurnaceReservationId:active.id }];
  const site = at(world,actor.locationId);
  if (!site || !operatingCapacity(world,site,executionTick) || !physicallyAt(world,actor,site.id,executionTick)) return [];
  const base = { action:'FURNACE_RESERVATION',furnaceMove:'reserve',targetLocationId:site.id } as const;
  return [base,...world.workshops.orders.filter(row => workshopActive(world,actor.id,site.id,row.id,executionTick + 1))
    .map(row => ({ ...base,targetWorkshopId:row.id }))];
}

function event(world: WorldState, actor: Cultivator, row: FurnaceReservation, cancel: boolean): WorldEvent {
  return { id:`evt-${row.id}-${cancel ? 'cancel' : 'queue'}`, tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy', title:cancel ? '取消炉位预约' : '登记炉位预约',
    description:cancel ? '仅释放本人尚未使用的候炉席位，未划转任何财物。' : '按实际到场时间排炉；灵石、药材与器物未移交。',
    actorIds:[actor.id],witnessScope:'participants',...(at(world,row.siteId) ? { locationId:row.siteId } : {}) };
}

export function resolveFurnaceReservationAction(world: WorldState, actor: Cultivator, payload: LLMDecisionPayload): WorldEvent | null {
  if (payload.chosenAction !== 'FURNACE_RESERVATION') return null;
  const option = availableFurnaceReservationActions(actor,world).find(candidate => candidate.furnaceMove === payload.furnaceMove &&
    candidate.targetFurnaceReservationId === payload.targetFurnaceReservationId && candidate.targetWorkshopId === payload.targetWorkshopId &&
    candidate.targetLocationId === payload.targetLocationId);
  if (!option) return null;
  const state = world.furnaceReservations;
  if (option.furnaceMove === 'cancel') {
    const row = state.reservations.find(entry => entry.id === option.targetFurnaceReservationId)!;
    finish(row,'cancelled',world.tick,'owner_cancelled');
    return event(world,actor,row,true);
  }
  const row: FurnaceReservation = { id:`furnace-${state.nextId++}`, actorId:actor.id,siteId:option.targetLocationId,
    requestedTick:world.tick,expiresTick:world.tick + FURNACE_QUEUE_TICKS,status:'queued',
    ...(option.targetWorkshopId === undefined ? {} : { workshopOrderId:option.targetWorkshopId }) };
  state.reservations.push(row);
  return event(world,actor,row,false);
}

/** Only onsite viewers receive queue order. Everybody else's activity is anonymized even here. */
export function getFurnaceView(world: WorldState, viewer?: Cultivator, siteId = viewer?.locationId): FurnaceView | undefined {
  const site = siteId && at(world,siteId);
  if (!site || !physicallyAt(world,viewer,site.id,world.tick) || !world.cultivators.includes(viewer) || !capacity(site)) return undefined;
  const { used,reserved,queue } = allocations(world,site,world.tick,false);
  const operational = operatingCapacity(world,site,world.tick);
  return {
    siteId:site.id,tick:world.tick,capacity:operational,...(!operational ? {closed:true as const,installedCapacity:capacity(site)} : {}),
    slots:Array.from({ length:operational },(_,index) => {
      const slot = index + 1;
      const holder = used.get(slot) ?? reserved.get(slot);
      return { slot, status:used.has(slot) ? 'used' : holder ? 'reserved' : 'free', isOwn:holder?.actorId === viewer.id };
    }),
    queue:queue.map((row,index) => ({
      position:index + 1,requestedTick:row.requestedTick,expiresTick:row.expiresTick,isOwn:row.actorId === viewer.id,
    })),
    ownReservations:world.furnaceReservations.reservations.filter(row => row.siteId === site.id && row.actorId === viewer.id).map(row => ({ ...row })),
    ownUses:world.furnaceReservations.uses.filter(row => row.siteId === site.id && row.actorId === viewer.id &&
      row.tick > world.tick - FURNACE_USE_RETENTION_TICKS && row.tick <= world.tick).map(row => ({ ...row })),
  };
}

/** The map can show only anonymized, currently visible physical capacity. */
export function availableFurnaceSlotSummary(world: WorldState, viewer?: Cultivator, siteId = viewer?.locationId):
  { capacity: number; queued: number; used: number; reserved: number } | undefined {
  const site = siteId && at(world,siteId);
  if (!site || !capacity(site) || !viewer || !world.cultivators.includes(viewer) ||
    !physicallyAt(world,viewer,site.id,world.tick)) return undefined;
  const { used, reserved, queue } = allocations(world,site,world.tick,false);
  const operational = operatingCapacity(world,site,world.tick);
  return { capacity:operational, queued:queue.length,
    used:[...used.keys()].filter(slot => slot <= operational).length, reserved:reserved.size };
}

import type { Cultivator, HerbId, LLMDecisionPayload, LocationNode, Sect, TerritorialLease, TerritorialLeaseEndReason, TerritorialLeaseMove,
  TerritorialLeaseState, WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { knownMapLocations } from './terrainEngine';

export const LEASE_UNIT_RENT = 4;
export const LEASE_QUOTA = 6;
export const LEASE_DEPOSIT = LEASE_QUOTA * LEASE_UNIT_RENT;
export const LEASE_TERM_TICKS = 6;
export const LEASE_OFFER_TICKS = 3;
export const LEASE_TREASURY_CAP = 50_000;
export const LEASE_HARVEST_MAX = 2;
const RETAIN_TERMINAL = 64;
const MAX_OFFER_CHOICES = 6;
const HERBS = new Set<HerbId>(['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss']);

export interface TerritorialLeaseOption {
  action: 'TERRITORIAL_LEASE';
  leaseMove: TerritorialLeaseMove;
  targetSectId?: string;
  targetLocationId?: string;
  targetTerritorialLeaseId?: string;
}
export type TerritorialLeaseAvailability = 'ready' | 'hostility' | 'title_change' | 'expired' | 'exhausted' | 'inactive' | 'treasury_full';

export const createTerritorialLeaseState = (): TerritorialLeaseState => ({ leases: [], nextId: 1 });
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const findSect = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const findPerson = (world: WorldState, id: string | undefined) => world.cultivators.find((actor) => actor.id === id);
const transferPlan = (world: WorldState, sect: Sect) => world.relocations.plans.find((plan) => plan.sectId === sect.id && plan.status === 'in_transit');
const leaseParty = (row: TerritorialLease, sectId: string) => row.ownerSectId === sectId || row.lesseeSectId === sectId;
const liveOffer = (world: WorldState, row: TerritorialLease) => row.status === 'offered' && row.openedTick <= world.tick && row.offerExpiresTick > world.tick;
const atWar = (world: WorldState, a: string, b: string) => world.diplomacy.some((row) => row.pact === 'war' &&
  ((row.sectAId === a && row.sectBId === b) || (row.sectAId === b && row.sectBId === a)));

function titledHerbSite(world: WorldState, id: string, ownerId: string): LocationNode | undefined {
  return world.locations.find((site) => site.id === id && site.ownerSectId === ownerId && site.type !== 'secret_realm' &&
    Object.values(site.herbCapacity).some((amount) => amount > 0));
}

function treasury(world: WorldState, sect: Sect) {
  const transit = transferPlan(world, sect);
  const total = sect.spiritStones + (transit?.custody.stones ?? 0);
  return {
    headroom: Math.max(0, Math.floor(LEASE_TREASURY_CAP - total)),
    credit(amount: number) { if (transit) transit.custody.stones += amount; else sect.spiritStones += amount; },
  };
}

function physicallyHere(world: WorldState, actor: Cultivator | undefined, locationId: string): actor is Cultivator {
  return live(actor) && actor.locationId === locationId && !pilgrimageCheckpoint(world, actor) &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.escorts.contracts.some((deal) => deal.status === 'active' && deal.escortId === actor.id) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function represents(world: WorldState, actor: Cultivator | undefined, sect: Sect): actor is Cultivator {
  return physicallyHere(world, actor, sect.headquartersId) && actor.sectId === sect.id && actor.id === sect.leaderId && actor.sectRank === '掌门' &&
    !transferPlan(world, sect) && world.locations.some((site) => site.id === sect.headquartersId && site.ownerSectId === sect.id);
}

const validTitle = (world: WorldState, row: TerritorialLease) =>
  Boolean(findSect(world, row.ownerSectId) && titledHerbSite(world, row.siteId, row.ownerSectId));
const activeTerm = (world: WorldState, row: TerritorialLease) => row.status === 'active' &&
  (row.startsTick ?? Infinity) <= world.tick && (row.endsTick ?? 0) > world.tick;

export function territorialLeaseAvailability(world: WorldState, row: TerritorialLease): TerritorialLeaseAvailability {
  if (row.status !== 'active' || (row.startsTick ?? Infinity) > world.tick) return 'inactive';
  const owner = findSect(world, row.ownerSectId);
  if (!owner || !validTitle(world, row)) return 'title_change';
  if ((row.endsTick ?? 0) <= world.tick) return 'expired';
  if (atWar(world, row.ownerSectId, row.lesseeSectId)) return 'hostility';
  if (row.usedUnits >= LEASE_QUOTA || row.escrow < LEASE_UNIT_RENT) return 'exhausted';
  return treasury(world, owner).headroom >= LEASE_UNIT_RENT ? 'ready' : 'treasury_full';
}

export function visibleTerritorialLeases(world: WorldState, viewer?: Cultivator): TerritorialLease[] {
  const actor = viewer && findPerson(world, viewer.id);
  if (!actor || !world.territorialLeases.leases.length) return [];
  const own = world.territorialLeases.leases.filter((row) => leaseParty(row, actor.sectId) && row.openedTick <= world.tick);
  if (!own.length) return [];
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  // Existing signers know the original contract site even if that site since disappeared.
  return own.filter((row) => known.has(row.siteId) || row.ownerSignerId === actor.id || row.lesseeSignerId === actor.id)
    .map((row) => ({ ...row, receipts: row.receipts.map((receipt) => ({ ...receipt })) }));
}

function permittedLease(world: WorldState, actor: Cultivator, site: LocationNode): TerritorialLease | undefined {
  if (!physicallyHere(world, actor, site.id)) return undefined;
  return world.territorialLeases.leases.find((row) => row.siteId === site.id && row.ownerSectId === site.ownerSectId &&
    row.lesseeSectId === actor.sectId && territorialLeaseAvailability(world, row) === 'ready' &&
    !row.receipts.some((receipt) => receipt.kind === 'harvest' && receipt.actorId === actor.id && receipt.tick === world.tick));
}

function leaseLimit(world: WorldState, lease: TerritorialLease): number {
  const owner = findSect(world, lease.ownerSectId);
  if (!owner) return 0;
  return Math.min(LEASE_HARVEST_MAX, LEASE_QUOTA - lease.usedUnits,
    Math.floor(lease.escrow / LEASE_UNIT_RENT), Math.floor(treasury(world, owner).headroom / LEASE_UNIT_RENT));
}

/** Neutral and current title-holder gather as before; foreign actors need a live, funded, local permit. */
export function authorizedHerbHarvestLimit(world: WorldState, actor: Cultivator, site: LocationNode): number {
  const actual = world.locations.find(({ id }) => id === site.id);
  if (!actual || !live(actor) || actor.locationId !== actual.id) return 0;
  if (!actual.ownerSectId || actual.ownerSectId === actor.sectId) return LEASE_HARVEST_MAX;
  const lease = permittedLease(world, actor, actual);
  return lease ? leaseLimit(world, lease) : 0;
}

/** Called synchronously immediately before canonical gather transfers site herbs to the actor. */
export function settleLeasedHerbHarvest(world: WorldState, actor: Cultivator, site: LocationNode, herbId: HerbId, actualAmount: number): boolean {
  const actual = world.locations.find(({ id }) => id === site.id);
  if (!actual || !world.cultivators.includes(actor) || !HERBS.has(herbId) || !live(actor) || actor.locationId !== actual.id ||
      !Number.isSafeInteger(actualAmount) || actualAmount < 1 || actualAmount > LEASE_HARVEST_MAX ||
      actualAmount > actual.herbs[herbId] || actor.herbs[herbId] + actualAmount > 99) return false;
  if (!actual.ownerSectId || actual.ownerSectId === actor.sectId) return true;
  const lease = permittedLease(world, actor, actual);
  if (!lease || actualAmount > leaseLimit(world, lease)) return false;
  const owner = findSect(world, lease.ownerSectId);
  if (!owner) return false;
  const amount = actualAmount * LEASE_UNIT_RENT;
  treasury(world, owner).credit(amount);
  lease.escrow -= amount;
  lease.rentPaid += amount;
  lease.usedUnits += actualAmount;
  lease.receipts.push({ tick: world.tick, kind: 'harvest', amount, actorId: actor.id, herbId, units: actualAmount });
  return true;
}

function occupiedSite(world: WorldState, siteId: string, except?: TerritorialLease): boolean {
  return world.territorialLeases.leases.some((row) => row !== except && row.siteId === siteId && validTitle(world, row) &&
    (liveOffer(world, row) || activeTerm(world, row)));
}

export function availableTerritorialLeaseActions(actor: Cultivator, world: WorldState, includeOffers = true): TerritorialLeaseOption[] {
  const own = findSect(world, actor.sectId);
  if (!own || !world.cultivators.includes(actor) || !represents(world, actor, own)) return [];
  const options: TerritorialLeaseOption[] = [];
  const add = (leaseMove: TerritorialLeaseMove, row: TerritorialLease) =>
    options.push({ action: 'TERRITORIAL_LEASE', leaseMove, targetTerritorialLeaseId: row.id });
  for (const row of world.territorialLeases.leases) {
    if (row.lesseeSectId !== own.id) continue;
    if (activeTerm(world, row) && validTitle(world, row)) { add('surrender', row); continue; }
    if (!liveOffer(world, row) || row.lesseeSignerId !== actor.id) continue;
    add('decline', row);
    const owner = findSect(world, row.ownerSectId);
    if (owner && own.spiritStones >= LEASE_DEPOSIT && represents(world, findPerson(world, row.ownerSignerId), owner) && validTitle(world, row) &&
        !atWar(world, owner.id, own.id) && !occupiedSite(world, row.siteId, row) &&
        knownMapLocations(world, actor).some(({ id }) => id === row.siteId)) add('accept', row);
  }
  if (!includeOffers) return options;
  let count = 0;
  for (const site of world.locations) {
    if (!titledHerbSite(world, site.id, own.id) || occupiedSite(world, site.id)) continue;
    for (const other of world.sects) {
      if (other.id === own.id || other.spiritStones < LEASE_DEPOSIT || atWar(world, own.id, other.id)) continue;
      const leader = findPerson(world, other.leaderId);
      if (!represents(world, leader, other) || !knownMapLocations(world, leader).includes(site)) continue;
      options.push({ action: 'TERRITORIAL_LEASE', leaseMove: 'offer', targetLocationId: site.id, targetSectId: other.id });
      if (++count >= MAX_OFFER_CHOICES) return options;
    }
  }
  return options;
}

function event(world: WorldState, row: TerritorialLease, stage: string, title: string, description: string, ids: string[], locationId?: string): WorldEvent {
  return { id: `evt-${row.id}-${stage}-${world.tick}`, title, description, actorIds: ids, locationId, tick: world.tick, year: world.year,
    month: world.month, category: 'diplomacy', witnessScope: 'participants' };
}

function close(world: WorldState, row: TerritorialLease, endReason: TerritorialLeaseEndReason): void {
  row.status = 'closed';
  row.settledTick = world.tick;
  row.endReason = endReason;
}

function refund(world: WorldState, row: TerritorialLease): number {
  if (row.status !== 'closed' || row.escrow <= 0 ||
      row.receipts.some((receipt) => receipt.kind === 'refund' && receipt.tick === world.tick)) return 0;
  const lessee = findSect(world, row.lesseeSectId);
  if (!lessee) return 0;
  const chest = treasury(world, lessee);
  const amount = Math.min(row.escrow, chest.headroom);
  if (amount < 1) return 0;
  chest.credit(amount);
  row.escrow -= amount;
  row.refunded += amount;
  row.receipts.push({ tick: world.tick, kind: 'refund', amount });
  return amount;
}

export function resolveTerritorialLeaseAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'TERRITORIAL_LEASE') return null;
  const option = availableTerritorialLeaseActions(actor, world, decision.leaseMove === 'offer').find((row) =>
    row.leaseMove === decision.leaseMove && row.targetSectId === decision.targetSectId && row.targetLocationId === decision.targetLocationId &&
    row.targetTerritorialLeaseId === decision.targetTerritorialLeaseId);
  if (!option) return null;
  const own = findSect(world, actor.sectId)!;
  const state = world.territorialLeases;
  if (option.leaseMove === 'offer') {
    const other = findSect(world, option.targetSectId!)!;
    const row: TerritorialLease = { id: `territorial-lease-${state.nextId++}`, ownerSectId: own.id, lesseeSectId: other.id,
      siteId: option.targetLocationId!, ownerSignerId: actor.id, lesseeSignerId: other.leaderId!, openedTick: world.tick,
      offerExpiresTick: world.tick + LEASE_OFFER_TICKS, status: 'offered', escrow: 0, rentPaid: 0, refunded: 0, usedUnits: 0, receipts: [] };
    state.leases.push(row);
    return event(world, row, 'offer', '宗门提出限时采集地契', '不移交土地、阵法或统治，只拟开放有限采集额度；此时尚未付款。',
      [row.ownerSignerId, row.lesseeSignerId], actor.locationId);
  }
  const row = state.leases.find(({ id }) => id === option.targetTerritorialLeaseId)!;
  const signers = [row.ownerSignerId, actor.id];
  if (option.leaseMove === 'decline') {
    row.status = 'declined';
    row.settledTick = world.tick;
    return event(world, row, 'declined', '承租方拒绝采集地契', '未获双签，双方财库未变。', signers, actor.locationId);
  }
  if (option.leaseMove === 'surrender') {
    close(world, row, 'surrender');
    const paid = refund(world, row);
    return event(world, row, 'surrendered', '承租方主动交回采集许可', `即刻撤销许可。未用押金实退${paid}，尚候退${row.escrow}。`,
      signers, actor.locationId);
  }
  own.spiritStones -= LEASE_DEPOSIT;
  row.escrow = LEASE_DEPOSIT;
  row.status = 'active';
  row.startsTick = world.tick;
  row.endsTick = world.tick + LEASE_TERM_TICKS;
  return event(world, row, 'accepted', '双签后封存真实采集押金',
    `承租方实封${LEASE_DEPOSIT}灵石，许可最多${LEASE_QUOTA}株，一株实采才划${LEASE_UNIT_RENT}；未改变真正地籍。`,
    signers, actor.locationId);
}

export function advanceTerritorialLeases(world: WorldState): WorldEvent[] {
  const state = world.territorialLeases;
  const events: WorldEvent[] = [];
  for (const row of state.leases) {
    if (row.openedTick > world.tick) continue;
    const actors = [row.ownerSignerId, row.lesseeSignerId];
    if (row.status === 'offered' && row.offerExpiresTick <= world.tick) {
      row.status = 'expired';
      row.settledTick = world.tick;
      events.push(event(world, row, 'expired', '采集地契邀约届满', '未经双方确认，没有扣款或赋予地权。', actors));
      continue;
    }
    if (row.status === 'active') {
      const reason = !validTitle(world, row) ? 'title_change' : (row.endsTick ?? Infinity) <= world.tick ? 'expiry' : undefined;
      if (reason) {
        close(world, row, reason);
        events.push(event(world, row, 'closed', reason === 'title_change' ? '真实产权变化，采集许可终止' : '限时采集许可届满',
          '只返还尚未使用的押金；原有真实采集结算保留。', actors));
      }
    }
    const amount = refund(world, row);
    if (amount > 0) events.push(event(world, row, 'refund', '采集地契实退未用押金', `承租方实收${amount}灵石，尚候退${row.escrow}。`, actors));
  }
  const retained = new Set(state.leases.filter((row) => row.status !== 'offered' && row.status !== 'active' && row.escrow === 0)
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-RETAIN_TERMINAL).map(({ id }) => id));
  state.leases = state.leases.filter((row) => row.status === 'offered' || row.status === 'active' || row.escrow > 0 || retained.has(row.id));
  return events;
}

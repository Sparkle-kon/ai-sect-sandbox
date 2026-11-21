import type { Cultivator, LocationNode, LLMDecisionPayload, MapPoint, PilgrimageEndReason, PilgrimageJourney, PilgrimageMove,
  PilgrimageState, WorldEvent, WorldState } from '../types/world';
import { findMapPath } from './mapMotionEngine';
import { currentVisibleTileIds, knownMapLocations, noteTerrainVisit, terrainTileAt } from './terrainEngine';

export const PILGRIMAGE_LEG_COST = 8;
export const PILGRIMAGE_RELIEF_HP = 16;
export const PILGRIMAGE_OFFER_TICKS = 3;
export const PILGRIMAGE_ACTIVE_TICKS = 16;
export const PILGRIMAGE_TILE_STRIDE = 5;
const RETAIN_TERMINAL = 64;
const COOLDOWN = 3;
const MAX_OPTIONS = 3;
const MAX_PEERS = 3;
const MAX_SITES = 6;

export interface PilgrimageOption {
  action: 'PILGRIMAGE';
  pilgrimageMove: PilgrimageMove;
  targetPilgrimageId?: string;
  targetPilgrimageNextStopId?: string;
  targetLocationId?: string;
  targetCultivatorId?: string;
}
export interface PilgrimageView {
  journey: Omit<PilgrimageJourney, 'path'>;
  checkpoint?: MapPoint;
  knownStopIds: string[];
}
export const createPilgrimageState = (): PilgrimageState => ({ journeys: [], nextId: 1 });
const alive = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const getActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const getSite = (world: WorldState, id: string) => world.locations.find((site) => site.id === id && site.type !== 'secret_realm');
const two = (journey: PilgrimageJourney) => [journey.organizerId, journey.companionId];
const member = (journey: PilgrimageJourney, actorId: string) => journey.organizerId === actorId || journey.companionId === actorId;
const liveJourney = (world: WorldState, journey: PilgrimageJourney) => journey.status === 'active' &&
  (journey.startedTick ?? Infinity) <= world.tick && (journey.expiresTick ?? 0) > world.tick;
const liveProposal = (world: WorldState, journey: PilgrimageJourney) =>
  journey.status === 'proposed' && journey.proposedTick <= world.tick && journey.offerExpiresTick > world.tick;
const pointOf = ({ x, y }: MapPoint): MapPoint => ({ x, y });

export function activePilgrimageForActor(world: WorldState, actor: Cultivator): PilgrimageJourney | undefined {
  return world.pilgrimages.journeys.find((journey) => liveJourney(world, journey) && member(journey, actor.id));
}

/** Locks both participants for the same monthly action, even where it completed the last leg. */
export function pilgrimageActedThisTick(world: WorldState, actor: Cultivator): boolean {
  return world.pilgrimages.journeys.some((journey) => member(journey, actor.id) &&
    (journey.lastMovedTick === world.tick || journey.startedTick === world.tick));
}

export function pilgrimageCheckpoint(world: WorldState, actor: Cultivator): MapPoint | undefined {
  if (!alive(actor)) return undefined;
  const journey = activePilgrimageForActor(world, actor);
  const point = journey?.path[journey.pathIndex];
  return point && pointOf(point);
}

export function visiblePilgrimages(world: WorldState, selected?: Cultivator): PilgrimageView[] {
  const actor = selected && getActor(world, selected.id);
  if (!actor) return [];
  const own = world.pilgrimages.journeys.filter((journey) => journey.proposedTick <= world.tick && member(journey, actor.id));
  if (!own.length) return [];
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  return own.map(({ path: _path, ...journey }) => ({
      journey, checkpoint: journey.status === 'active' ? pilgrimageCheckpoint(world, actor) : undefined,
      knownStopIds: journey.stopIds.filter((id) => known.has(id) || journey.stopsVisited.some((stop) => stop.locationId === id)),
    }));
}

function unavailable(world: WorldState, actor: Cultivator): boolean {
  return Boolean(actor.guardAssignment && actor.guardAssignment.expiresTick > world.tick) ||
    world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) ||
    world.escorts.contracts.some((contract) => contract.status === 'active' && contract.escortId === actor.id) ||
    world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) ||
    world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') && occasion.participantIds.includes(actor.id)) ||
    actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon';
}

function occupants(world: WorldState, journey: PilgrimageJourney) {
  const leader = getActor(world, journey.organizerId), companion = getActor(world, journey.companionId);
  const last = journey.stopIds[journey.legIndex];
  if (!alive(leader) || !alive(companion) || leader.locationId !== last || companion.locationId !== last ||
    unavailable(world, leader) || unavailable(world, companion)) return undefined;
  return { leader, companion };
}

/** A public causeway is surveyed from its endpoints alone. It does not read hidden terrain, hazards or landmarks. */
function publicCauseway(world: WorldState, from: LocationNode, to: LocationNode): MapPoint[] {
  const start = terrainTileAt(world, from.x, from.y);
  const stop = terrainTileAt(world, to.x, to.y);
  if (!start || !stop) return [];
  if (start.id === stop.id) return [pointOf(from), pointOf(to)];
  const { columns, rows } = world.terrain;
  const result = [pointOf(from)];
  let col = start.col, row = start.row;
  const add = () => result.push({ x: (col + .5) * 1000 / columns, y: (row + .5) * 600 / rows });
  while (col !== stop.col) { col += Math.sign(stop.col - col); add(); }
  while (row !== stop.row) { row += Math.sign(stop.row - row); add(); }
  if (result.at(-1)?.x !== to.x || result.at(-1)?.y !== to.y) result.push(pointOf(to));
  return result;
}

function pathBetween(world: WorldState, from: LocationNode, to: LocationNode, leader: Cultivator, companion: Cultivator): MapPoint[] {
  const publicLandmark = (site: LocationNode) => site.type === 'market' || site.type === 'sect_hq' ||
    world.sects.some((sect) => sect.headquartersId === site.id);
  if (publicLandmark(from) && publicLandmark(to)) return publicCauseway(world, from, to);
  const yours = new Set([...leader.exploredTileIds, ...currentVisibleTileIds(world, leader)]);
  const theirs = new Set([...companion.exploredTileIds, ...currentVisibleTileIds(world, companion)]);
  return findMapPath(world, from, to, (tile) => yours.has(tile.id) && theirs.has(tile.id));
}

function qualifiedStops(world: WorldState, leader: Cultivator, companion: Cultivator, stopIds: [string, string, string]): boolean {
  if (leader.locationId !== stopIds[0] || companion.locationId !== stopIds[0] || new Set(stopIds).size !== 3 ||
    !stopIds.every((id) => getSite(world, id))) return false;
  const leaderKnown = new Set(knownMapLocations(world, leader).map(({ id }) => id));
  const companionKnown = new Set(knownMapLocations(world, companion).map(({ id }) => id));
  if (!stopIds.every((id) => leaderKnown.has(id) && companionKnown.has(id))) return false;
  const [from, second, third] = stopIds.map((id) => getSite(world, id)!);
  const first = pathBetween(world, from, second, leader, companion);
  const last = pathBetween(world, second, third, leader, companion);
  return first.length > 1 && last.length > 1 && [first, last].reduce((sum, route) =>
    sum + Math.ceil((route.length - 1) / PILGRIMAGE_TILE_STRIDE), 0) < PILGRIMAGE_ACTIVE_TICKS;
}

function canDepart(world: WorldState, journey: PilgrimageJourney, leader: Cultivator, companion: Cultivator): MapPoint[] {
  if (leader.spiritStones < PILGRIMAGE_LEG_COST || companion.spiritStones < PILGRIMAGE_LEG_COST) return [];
  const origin = getSite(world, journey.stopIds[journey.legIndex]);
  const next = getSite(world, journey.stopIds[journey.legIndex + 1]);
  if (!origin || !next || !knownMapLocations(world, leader).includes(next) || !knownMapLocations(world, companion).includes(next)) return [];
  return pathBetween(world, origin, next, leader, companion);
}

/** Optional proposal enumeration override for schedulers; pending and active options are always evaluated. */
export function availablePilgrimageActions(actor: Cultivator, world: WorldState, includeProposals = true): PilgrimageOption[] {
  if (!world.cultivators.includes(actor) || !alive(actor) || unavailable(world, actor)) return [];
  const state = world.pilgrimages;
  const locked = (candidateId: string) => state.journeys.some((journey) => member(journey, candidateId) &&
    (liveJourney(world, journey) || liveProposal(world, journey) ||
      (journey.settledTick !== undefined && world.tick - journey.settledTick < COOLDOWN)));
  const options: PilgrimageOption[] = [];
  const existing = state.journeys.find((journey) => member(journey, actor.id) && (liveJourney(world, journey) || liveProposal(world, journey)));
  if (existing) {
    const add = (pilgrimageMove: PilgrimageMove) => options.push({ action: 'PILGRIMAGE', pilgrimageMove, targetPilgrimageId: existing.id });
    const both = occupants(world, existing);
    if (existing.status === 'proposed') {
      if (existing.organizerId === actor.id) add('withdraw');
      else {
        add('decline');
        if (both && both.leader.spiritStones >= PILGRIMAGE_LEG_COST && both.companion.spiritStones >= PILGRIMAGE_LEG_COST &&
          qualifiedStops(world, both.leader, both.companion, existing.stopIds)) add('accept');
      }
      return options;
    }
    if (!both || world.tick <= (existing.startedTick ?? world.tick) || existing.lastMovedTick === world.tick ||
      !existing.stopIds.every((id) => getSite(world, id))) return options;
    if (actor.id === existing.organizerId && (existing.path.length > 1 || canDepart(world, existing, both.leader, both.companion).length > 1)) add('advance');
    if (existing.path.length) return options;
    const other = actor.id === both.leader.id ? both.companion : both.leader;
    const site = existing.stopsVisited.at(-1)?.locationId;
    if (actor.herbs.jade_leaf >= 1 && other.hp < other.maxHp && site &&
      !existing.aid.some((entry) => entry.giverId === actor.id && entry.locationId === site)) add('relieve');
    add('withdraw');
    return options;
  }
  if (!includeProposals || locked(actor.id) || actor.spiritStones < PILGRIMAGE_LEG_COST) return options;
  const origin = getSite(world, actor.locationId);
  if (!origin) return options;
  const potentialSites = knownMapLocations(world, actor).filter((site) => site.id !== origin.id && site.type !== 'secret_realm')
    .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id.localeCompare(b.id))
    .slice(0, MAX_SITES);
  if (potentialSites.length < 2) return options;
  const peers = world.cultivators.filter((other) => other.id !== actor.id && other.locationId === origin.id && alive(other) &&
    !unavailable(world, other) && !locked(other.id) && other.spiritStones >= PILGRIMAGE_LEG_COST)
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_PEERS);
  for (const companion of peers) {
    let proposedPair = false;
    for (const first of potentialSites) {
      for (const second of potentialSites) {
        if (first.id === second.id || !qualifiedStops(world, actor, companion, [origin.id, first.id, second.id])) continue;
        options.push({ action: 'PILGRIMAGE', pilgrimageMove: 'propose', targetCultivatorId: companion.id,
          targetLocationId: first.id, targetPilgrimageNextStopId: second.id });
        proposedPair = true;
        break;
      }
      if (proposedPair) break;
    }
    if (options.length >= MAX_OPTIONS) break;
  }
  return options;
}

function event(world: WorldState, journey: PilgrimageJourney, stage: string, title: string, description: string, locationId?: string): WorldEvent {
  return { id: `evt-${journey.id}-${stage}-${world.tick}`, tick: world.tick, year: world.year, month: world.month,
    title, description, locationId, category: 'diplomacy', actorIds: two(journey), witnessScope: 'participants' };
}
const reasonText: Record<PilgrimageEndReason, string> = {
  declined: '同行者谢绝邀约，未扣路费。', offer_expiry: '邀约限期已过，双方未结伴。', journey_expiry: '同行期限已过，只保留实到站点与支出。',
  withdrawn: '有人在实际停靠点退出，未启程的路段不扣费。', lost_site: '原定站点已失效，余段不能继续。',
  member_missing: '同行者陨落、离队或被其他职责占用，余段不再进行。',
};

function settle(world: WorldState, journey: PilgrimageJourney, status: PilgrimageJourney['status'], reason?: PilgrimageEndReason): void {
  journey.status = status;
  journey.reason = reason;
  journey.settledTick = world.tick;
  journey.path = [];
  journey.pathIndex = 0;
}

export function resolvePilgrimageAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'PILGRIMAGE') return null;
  const option = availablePilgrimageActions(actor, world, decision.pilgrimageMove === 'propose').find((candidate) =>
    candidate.pilgrimageMove === decision.pilgrimageMove && candidate.targetPilgrimageId === decision.targetPilgrimageId &&
    candidate.targetPilgrimageNextStopId === decision.targetPilgrimageNextStopId && candidate.targetLocationId === decision.targetLocationId &&
    candidate.targetCultivatorId === decision.targetCultivatorId);
  if (!option) return null;
  if (option.pilgrimageMove === 'propose') {
    const journey: PilgrimageJourney = { id: `pilgrimage-${world.pilgrimages.nextId++}`, organizerId: actor.id,
      companionId: option.targetCultivatorId!, stopIds: [actor.locationId, option.targetLocationId!, option.targetPilgrimageNextStopId!],
      proposedTick: world.tick, offerExpiresTick: world.tick + PILGRIMAGE_OFFER_TICKS, status: 'proposed',
      stopsVisited: [], legIndex: 0, path: [], pathIndex: 0, spentByEach: 0, aid: [] };
    world.pilgrimages.journeys.push(journey);
    return event(world, journey, 'proposed', '邀约结伴巡礼', '只商定双方已知的两个停靠点，未发生移动或扣费。', actor.locationId);
  }
  const journey = world.pilgrimages.journeys.find(({ id }) => id === option.targetPilgrimageId)!;
  if (option.pilgrimageMove === 'withdraw' || option.pilgrimageMove === 'decline') {
    const reason = option.pilgrimageMove === 'decline' ? 'declined' : 'withdrawn';
    settle(world, journey, reason, reason);
    return event(world, journey, reason, reason === 'declined' ? '同行邀约被谢绝' : '止步退出巡礼', reasonText[reason], actor.locationId);
  }
  const members = occupants(world, journey)!;
  if (option.pilgrimageMove === 'accept') {
    journey.status = 'active';
    journey.startedTick = world.tick;
    journey.expiresTick = world.tick + PILGRIMAGE_ACTIVE_TICKS;
    journey.stopsVisited.push({ locationId: journey.stopIds[0], tick: world.tick });
    return event(world, journey, 'accepted', '两人自愿立下巡礼共愿', '已在起点会合；下回合方可付费启程。', actor.locationId);
  }
  if (option.pilgrimageMove === 'relieve') {
    const receiver = actor.id === members.leader.id ? members.companion : members.leader;
    const hpRestored = Math.min(PILGRIMAGE_RELIEF_HP, receiver.maxHp - receiver.hp);
    actor.herbs.jade_leaf -= 1;
    receiver.hp += hpRestored;
    journey.aid.push({ tick: world.tick, giverId: actor.id, receiverId: receiver.id, locationId: actor.locationId, hpRestored });
    return event(world, journey, `relief-${journey.aid.length}`, '同行者互助', `使用一株真实青玉叶，恢复${hpRestored}点气血。`, actor.locationId);
  }
  if (!journey.path.length) {
    journey.path = canDepart(world, journey, members.leader, members.companion);
    // The option and transaction use the same checked current route; the fee is only for actual departure.
    if (journey.path.length < 2) return null;
    members.leader.spiritStones -= PILGRIMAGE_LEG_COST;
    members.companion.spiritStones -= PILGRIMAGE_LEG_COST;
    journey.spentByEach += PILGRIMAGE_LEG_COST;
  }
  const next = Math.min(journey.path.length - 1, journey.pathIndex + PILGRIMAGE_TILE_STRIDE);
  const visitedTiles = journey.path.slice(journey.pathIndex + 1, next + 1).flatMap((point) => {
    const tile = terrainTileAt(world, point.x, point.y);
    return tile ? [tile.id] : [];
  });
  for (const person of [members.leader, members.companion]) person.exploredTileIds = [...new Set([...person.exploredTileIds, ...visitedTiles])];
  journey.pathIndex = next;
  journey.lastMovedTick = world.tick;
  if (next < journey.path.length - 1) return event(world, journey, 'stride', '沿已勘路线结伴前行', '实际行过本回合路段，尚未抵达下一站。');
  journey.legIndex++;
  const arrived = journey.stopIds[journey.legIndex];
  for (const person of [members.leader, members.companion]) {
    person.locationId = arrived;
    noteTerrainVisit(world, person);
  }
  journey.stopsVisited.push({ locationId: arrived, tick: world.tick });
  journey.path = [];
  journey.pathIndex = 0;
  if (journey.legIndex === journey.stopIds.length - 1) {
    settle(world, journey, 'completed');
    return event(world, journey, 'completed', '两人如约完成巡礼', '双方确实途经全部停靠点，记录实际花费与互助，不另行发奖。', arrived);
  }
  return event(world, journey, 'arrival', '同行巡礼抵达中站', '可待下回合再行、救助同伴或退出。', arrived);
}

export function advancePilgrimages(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  const state = world.pilgrimages;
  for (const journey of state.journeys) {
    if (journey.status !== 'active' && journey.status !== 'proposed') continue;
    const proposed = journey.status === 'proposed';
    const reason = proposed && world.tick >= journey.offerExpiresTick ? 'offer_expiry' :
      !proposed && journey.expiresTick !== undefined && world.tick >= journey.expiresTick ? 'journey_expiry' :
      !journey.stopIds.every((id) => getSite(world, id)) ? 'lost_site' :
      !(proposed ? two(journey).every((id) => alive(getActor(world, id))) : occupants(world, journey)) ? 'member_missing' : undefined;
    if (!reason) continue;
    const interruptedEnRoute = journey.path.length > 0;
    settle(world, journey, reason === 'offer_expiry' || reason === 'journey_expiry' ? 'expired' : 'interrupted', reason);
    const description = reasonText[reason] + (interruptedEnRoute ? '记录回退至最近实站；未将半程记作抵达。' : '');
    const last = journey.stopsVisited.at(-1)?.locationId;
    events.push(event(world, journey, reason, '巡礼事项关闭', description, last && getSite(world, last) ? last : undefined));
  }
  const terminal = new Set(state.journeys.filter((journey) => journey.status !== 'proposed' && journey.status !== 'active')
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-RETAIN_TERMINAL).map(({ id }) => id));
  state.journeys = state.journeys.filter((journey) => journey.status === 'proposed' || journey.status === 'active' ||
    terminal.has(journey.id) || (journey.settledTick !== undefined && world.tick - journey.settledTick < COOLDOWN));
  return events;
}

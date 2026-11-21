import type { Cultivator, LLMDecisionPayload, LocationNode, MapPoint, PilgrimageJourney, RoadCrossing,
  RoadLink, RoadMove, RoadState, Sect, WorldEvent, WorldState } from '../types/world';
import { findMapPath } from './mapMotionEngine';
import { flowActor, flowSect, recordResourceFlow } from './resourceFlowEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';

export const ROAD_CONDITION_MAX = 100;
export const ROAD_OPEN_CONDITION = 60;
export const ROAD_MIN_PASS_CONDITION = 30;
export const ROAD_CHARTER_STONES = 30;
export const ROAD_CHARTER_ROOTS = 3;
export const ROAD_MAINTENANCE_STONES = 12;
export const ROAD_MAINTENANCE_ROOTS = 2;
export const ROAD_MAINTENANCE_GAIN = 24;
export const ROAD_PATROL_GAIN = 6;
export const ROAD_FARE = 4;
export const ROAD_PAID_STRIDE = 8;
export const ROAD_DECAY_INTERVAL = 3;
export const ROAD_PATH_TILE_LIMIT = 16;
export const ROAD_PATH_POINT_LIMIT = ROAD_PATH_TILE_LIMIT;
export const ROAD_CROSSING_HISTORY = 64;
export const ROAD_CLOSED_HISTORY = 32;
const ROAD_DECAY = 3;
const TREASURY_CEILING = 50_000;
const MAX_CHARTERS = 3;
const STEWARDS = new Set<Cultivator['sectRank']>(['掌门', '太上长老', '长老']);

export interface RoadOption {
  action: 'ROAD';
  roadMove: RoadMove;
  targetLocationId?: string;
  targetRoadId?: string;
}
export interface RoadPaidRoute { roadId: string; path: MapPoint[]; fee: number; stride: number }
export type RoadView = Pick<RoadLink, 'id' | 'anchorSiteId' | 'otherSiteId' | 'condition' | 'openedTick' |
  'lastMaintainedTick' | 'lastPatrolledTick' | 'closedTick' | 'closeReason'> & { paidStride: number; fare: number; pathSteps: number };

export const createRoadState = (): RoadState => ({ links: [], crossings: [], nextId: 1 });
const siteById = (world: WorldState, id: string) => world.locations.find((site) => site.id === id);
const sectById = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const alive = (actor: Cultivator) => actor.alive && actor.hp > 0;
const includesEnd = (road: RoadLink, id: string) => road.anchorSiteId === id || road.otherSiteId === id;
const tileId = (world: WorldState, point: MapPoint) => terrainTileAt(world, point.x, point.y)?.id;
const unorderedMatch = (road: RoadLink, from: string, to: string) => includesEnd(road, from) && includesEnd(road, to) && from !== to;

function physicallyPresent(world: WorldState, actor: Cultivator): boolean {
  return alive(actor) && actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon' &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) &&
    !world.couriers.dispatches.some((row) => row.courierId === actor.id &&
      (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === world.tick)) &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' &&
      (row.organizerId === actor.id || row.companionId === actor.id) && (row.path.length > 0 || row.lastMovedTick === world.tick));
}

function currentTitle(world: WorldState, sect: Sect, anchor: LocationNode): boolean {
  return anchor.type !== 'secret_realm' && anchor.type !== 'market' && anchor.id === sect.headquartersId && anchor.ownerSectId === sect.id &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.sectId === sect.id);
}
function marketEndpoint(sect: Sect, other: LocationNode): boolean {
  return other.type === 'market' && (!other.ownerSectId || other.ownerSectId === sect.id);
}
function roadInvalidReason(world: WorldState, road: Pick<RoadLink, 'sectId' | 'anchorSiteId' | 'otherSiteId'>): RoadLink['closeReason'] {
  const anchor = siteById(world, road.anchorSiteId);
  const other = siteById(world, road.otherSiteId);
  const sect = sectById(world, road.sectId);
  if (!anchor || !other || other.type !== 'market') return 'endpoint_lost';
  if (!sect || !currentTitle(world, sect, anchor) || !marketEndpoint(sect, other)) return 'title_lost';
  return undefined;
}

function knownTiles(world: WorldState, actor: Cultivator): ReadonlySet<string> {
  return new Set([...actor.exploredTileIds, ...currentVisibleTileIds(world, actor)]);
}
function charterPath(world: WorldState, from: LocationNode, to: LocationNode, actor: Cultivator): MapPoint[] {
  const known = knownTiles(world, actor);
  const path = findMapPath(world, from, to, (tile) => known.has(tile.id));
  const cells = new Set(path.map((point) => tileId(world, point)));
  if (cells.has(undefined) || cells.size < 2 || cells.size > ROAD_PATH_TILE_LIMIT) return [];
  const origin = tileId(world, from), end = tileId(world, to);
  // A route footstep enters a new cell; don't count an endpoint's center and exact gate as two steps.
  return [path[0], ...path.slice(1, -1).filter((point) => {
    const id = tileId(world, point);
    return id !== origin && id !== end;
  }), path.at(-1)!];
}
function canPatrol(world: WorldState, road: RoadLink, actor: Cultivator): boolean {
  const assigned = actor.guardAssignment;
  const official = STEWARDS.has(actor.sectRank) ||
    (assigned && assigned.assignedTick <= world.tick && assigned.expiresTick > world.tick && assigned.locationId === actor.locationId);
  return Boolean(official && road.condition <= ROAD_CONDITION_MAX - ROAD_PATROL_GAIN &&
    road.lastPatrolledTick !== world.tick && road.lastMaintainedTick !== world.tick &&
    !world.roads.links.some((link) => link.lastPatrolledBy === actor.id && link.lastPatrolledTick === world.tick));
}
function canMaintain(world: WorldState, road: RoadLink, actor: Cultivator, sect: Sect): boolean {
  return STEWARDS.has(actor.sectRank) && road.condition <= ROAD_CONDITION_MAX - ROAD_MAINTENANCE_GAIN &&
    road.lastMaintainedTick !== world.tick && road.lastPatrolledTick !== world.tick &&
    sect.spiritStones >= ROAD_MAINTENANCE_STONES && actor.herbs.earth_root >= ROAD_MAINTENANCE_ROOTS;
}

export function availableRoadActions(actor: Cultivator, world: WorldState, includeCharters = true): RoadOption[] {
  if (!actor.sectId || isRetiredFromService(actor) || !world.cultivators.includes(actor) || !physicallyPresent(world, actor)) return [];
  const sect = sectById(world, actor.sectId);
  if (!sect) return [];
  const options: RoadOption[] = [];
  for (const road of world.roads.links) {
    if (road.sectId !== sect.id || road.closedTick !== undefined || !includesEnd(road, actor.locationId) || roadInvalidReason(world, road)) continue;
    if (canMaintain(world, road, actor, sect)) options.push({ action: 'ROAD', roadMove: 'maintain', targetRoadId: road.id });
    if (canPatrol(world, road, actor)) options.push({ action: 'ROAD', roadMove: 'patrol', targetRoadId: road.id });
  }
  const origin = siteById(world, actor.locationId);
  if (!includeCharters || !origin || sect.leaderId !== actor.id || !currentTitle(world, sect, origin) ||
      sect.spiritStones < ROAD_CHARTER_STONES || actor.herbs.earth_root < ROAD_CHARTER_ROOTS) return options;
  const sites = knownMapLocations(world, actor).filter((other) => other.id !== origin.id && marketEndpoint(sect, other) &&
    !world.roads.links.some((row) => row.closedTick === undefined && unorderedMatch(row, origin.id, other.id)))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id.localeCompare(b.id));
  let count = 0;
  for (const other of sites) {
    if (charterPath(world, origin, other, actor).length < 2) continue;
    options.push({ action: 'ROAD', roadMove: 'charter', targetLocationId: other.id });
    if (++count >= MAX_CHARTERS) break;
  }
  return options;
}

function receipt(world: WorldState, road: RoadLink, actor: Cultivator, move: RoadMove): WorldEvent {
  const labels = { charter: '宗门订立驿路', maintain: '驿路实物修缮', patrol: '护卫在站巡视' };
  return { id: `evt-${road.id}-${move}-${world.tick}`, tick: world.tick, year: world.year, month: world.month, title: labels[move],
    description: `按现存路况登记，当前养护值 ${road.condition}/${ROAD_CONDITION_MAX}，原有免费路径不设障。`,
    actorIds: [actor.id], locationId: actor.locationId, category: 'diplomacy', witnessScope: 'participants' };
}
function expenses(world: WorldState, actor: Cultivator, sect: Sect, road: RoadLink, reason: 'road_charter' | 'road_maintenance',
  stones: number, roots: number): void {
  sect.spiritStones -= stones;
  actor.herbs.earth_root -= roots;
  const common = { kind: 'consumption', mechanism: 'road', reason, refId: road.id,
    visibility: { kind: 'participants', actorIds: [actor.id] } } as const;
  recordResourceFlow(world, { ...common, good: 'stone', amount: stones, from: flowSect(sect.id) });
  recordResourceFlow(world, { ...common, good: 'earth_root', amount: roots, from: flowActor(actor.id) });
}

export function resolveRoadAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'ROAD') return null;
  const option = availableRoadActions(actor, world, decision.roadMove === 'charter').find((row) => row.roadMove === decision.roadMove &&
    row.targetRoadId === decision.targetRoadId && row.targetLocationId === decision.targetLocationId);
  if (!option) return null;
  const sect = sectById(world, actor.sectId)!;
  if (option.roadMove === 'charter') {
    const origin = siteById(world, actor.locationId)!;
    const other = siteById(world, option.targetLocationId!)!;
    const path = charterPath(world, origin, other, actor);
    if (path.length < 2) return null;
    const road: RoadLink = { id: `road-${world.roads.nextId++}`, sectId: sect.id, anchorSiteId: origin.id, otherSiteId: other.id,
      path, condition: ROAD_OPEN_CONDITION, openedTick: world.tick };
    expenses(world, actor, sect, road, 'road_charter', ROAD_CHARTER_STONES, ROAD_CHARTER_ROOTS);
    world.roads.links.push(road);
    return receipt(world, road, actor, 'charter');
  }
  const road = world.roads.links.find(({ id }) => id === option.targetRoadId)!;
  if (option.roadMove === 'maintain') {
    expenses(world, actor, sect, road, 'road_maintenance', ROAD_MAINTENANCE_STONES, ROAD_MAINTENANCE_ROOTS);
    road.condition += ROAD_MAINTENANCE_GAIN;
    road.lastMaintainedTick = world.tick;
    road.lastMaintainedBy = actor.id;
  } else {
    road.condition += ROAD_PATROL_GAIN;
    road.lastPatrolledTick = world.tick;
    road.lastPatrolledBy = actor.id;
  }
  return receipt(world, road, actor, option.roadMove);
}

export function roadCrossingForLeg(world: WorldState, journey: PilgrimageJourney): RoadCrossing | undefined {
  return world.roads.crossings.find((row) => row.journeyId === journey.id && row.legIndex === journey.legIndex &&
    row.departedTick <= world.tick && row.payerId === journey.organizerId && row.companionId === journey.companionId);
}

/** Exact comparison uses the same path point indices consumed by pilgrimage stride accounting. */
export function availableRoadPilgrimageRoutes(world: WorldState, journey: PilgrimageJourney, leader: Cultivator, companion: Cultivator,
  freePath: readonly MapPoint[], freeStride: number, baseCost = 8): RoadPaidRoute[] {
  if (!world.roads.links.length || !world.pilgrimages.journeys.includes(journey) || !world.cultivators.includes(leader) ||
      !world.cultivators.includes(companion) || journey.status !== 'active' || journey.path.length > 0 || journey.lastMovedTick === world.tick ||
      world.tick <= (journey.startedTick ?? world.tick) || world.tick >= (journey.expiresTick ?? world.tick) ||
      journey.organizerId !== leader.id || journey.companionId !== companion.id || leader.id === companion.id ||
      !Number.isSafeInteger(baseCost) || baseCost < 1 || leader.spiritStones < baseCost + ROAD_FARE || companion.spiritStones < baseCost ||
      !physicallyPresent(world, leader) || !physicallyPresent(world, companion) ||
      (journey.legIndex !== 0 && journey.legIndex !== 1) || freePath.length < 2 || !Number.isSafeInteger(freeStride) || freeStride < 1 ||
      roadCrossingForLeg(world, journey)) return [];
  const from = journey.stopIds[journey.legIndex], to = journey.stopIds[journey.legIndex + 1];
  if (leader.locationId !== from || companion.locationId !== from) return [];
  const origin = siteById(world, from);
  const destination = siteById(world, to);
  const equal = (a: MapPoint | undefined, b: MapPoint) => a?.x === b.x && a.y === b.y;
  if (!origin || !destination || !equal(freePath[0], origin) || !equal(freePath.at(-1), destination)) return [];
  const candidates = world.roads.links.filter((road) => road.closedTick === undefined && road.openedTick <= world.tick &&
    road.condition >= ROAD_MIN_PASS_CONDITION && unorderedMatch(road, from, to) && !roadInvalidReason(world, road));
  if (!candidates.length) return [];
  const yours = knownTiles(world, leader), theirs = knownTiles(world, companion);
  return candidates.flatMap((road) => {
    const treasury = sectById(world, road.sectId)!;
    if (treasury.spiritStones + ROAD_FARE > TREASURY_CEILING) return [];
    const path = from === road.anchorSiteId ? road.path : [...road.path].reverse();
    if (!equal(path[0], origin) || !equal(path.at(-1), destination) || path.length < 2 ||
        Math.ceil((path.length - 1) / ROAD_PAID_STRIDE) >= Math.ceil((freePath.length - 1) / freeStride) ||
        path.some((point) => { const id = tileId(world, point); return !id || !yours.has(id) || !theirs.has(id); })) return [];
    return [{ roadId: road.id, path: path.map(({ x, y }) => ({ x, y })), fee: ROAD_FARE, stride: ROAD_PAID_STRIDE }];
  }).sort((a, b) => a.roadId.localeCompare(b.roadId));
}

export function beginRoadPilgrimageCrossing(world: WorldState, journey: PilgrimageJourney, leader: Cultivator, companion: Cultivator, roadId: string,
  freePath: readonly MapPoint[], freeStride: number, baseCost = 8): RoadPaidRoute | undefined {
  const option = availableRoadPilgrimageRoutes(world, journey, leader, companion, freePath, freeStride, baseCost).find((row) => row.roadId === roadId);
  if (!option || (journey.legIndex !== 0 && journey.legIndex !== 1)) return undefined;
  const road = world.roads.links.find(({ id }) => id === roadId)!;
  const treasury = sectById(world, road.sectId)!;
  const id = `crossing-${world.roads.nextId++}`;
  leader.spiritStones -= option.fee;
  treasury.spiritStones += option.fee;
  world.roads.crossings.push({ id, roadId, journeyId: journey.id, legIndex: journey.legIndex, payerId: leader.id,
    companionId: companion.id, departedTick: world.tick, fee: option.fee, stride: option.stride, paidSteps: option.path.length - 1,
    freeSteps: freePath.length - 1, freeStride });
  recordResourceFlow(world, { kind: 'transfer', mechanism: 'road', refId: id, reason: 'road_crossing', good: 'stone',
    amount: option.fee, from: flowActor(leader.id), to: flowSect(treasury.id),
    visibility: { kind: 'participants', actorIds: [leader.id, companion.id] } });
  return option;
}

/** Valid routes keep authority even at condition zero; nobody is barred from the free terrain graph. */
export function advanceRoads(world: WorldState): WorldEvent[] {
  const state = world.roads;
  if (state.lastAdvancedTick !== undefined && state.lastAdvancedTick >= world.tick) return [];
  state.lastAdvancedTick = world.tick;
  if (!state.links.length) return [];
  const hazards = new Map<string, number>();
  for (const row of world.mapHazards) if (row.createdTick <= world.tick && world.tick < row.expiresTick)
    hazards.set(row.tileId, Math.max(hazards.get(row.tileId) ?? 0, row.intensity));
  for (const road of state.links) {
    if (road.closedTick !== undefined) continue;
    const reason = roadInvalidReason(world, road);
    if (reason) { road.closedTick = world.tick; road.closeReason = reason; continue; }
    if (road.openedTick >= world.tick) continue;
    const impact = road.path.reduce((maximum, point) => Math.max(maximum, hazards.get(tileId(world, point) ?? '') ?? 0), 0);
    road.condition = Math.max(0, road.condition - (world.tick % ROAD_DECAY_INTERVAL === 0 ? ROAD_DECAY : 0) - impact);
  }
  const activeLanes = new Set(world.pilgrimages.journeys.filter((row) => row.status === 'active' && row.path.length > 0)
    .map((row) => `${row.id}/${row.legIndex}`));
  const recentCrossings = new Set(state.crossings.slice(-ROAD_CROSSING_HISTORY));
  state.crossings = state.crossings.filter((row) => recentCrossings.has(row) || activeLanes.has(`${row.journeyId}/${row.legIndex}`));
  const onReceipts = new Set(state.crossings.map(({ roadId }) => roadId));
  const recentLinks = new Set(state.links.filter(({ closedTick }) => closedTick !== undefined)
    .sort((a, b) => (a.closedTick ?? 0) - (b.closedTick ?? 0)).slice(-ROAD_CLOSED_HISTORY));
  state.links = state.links.filter((row) => row.closedTick === undefined || recentLinks.has(row) || onReceipts.has(row.id));
  return [];
}

export function visibleRoads(world: WorldState, viewer?: Cultivator): RoadView[] {
  if (!viewer || !world.roads.links.length) return [];
  const actor = world.cultivators.find(({ id }) => id === viewer.id);
  if (!actor || !physicallyPresent(world, actor)) return [];
  const known = new Set(knownMapLocations(world, actor).filter(({ type }) => type !== 'secret_realm').map(({ id }) => id));
  return world.roads.links.flatMap((road) => {
    const party = actor.sectId === road.sectId;
    if ((!party && !includesEnd(road, actor.locationId)) || !known.has(road.anchorSiteId) || !known.has(road.otherSiteId) ||
        road.openedTick > world.tick || (road.closedTick === undefined && roadInvalidReason(world, road))) return [];
    const { id, anchorSiteId, otherSiteId, condition, openedTick, lastMaintainedTick, lastPatrolledTick, closedTick, closeReason } = road;
    return [{ id, anchorSiteId, otherSiteId, condition, openedTick, lastMaintainedTick, lastPatrolledTick, closedTick,
      closeReason, paidStride: ROAD_PAID_STRIDE, fare: ROAD_FARE, pathSteps: road.path.length - 1 }];
  });
}

export function visibleRoadCrossings(world: WorldState, viewer?: Cultivator): RoadCrossing[] {
  if (!viewer || !world.cultivators.some(({ id }) => id === viewer.id)) return [];
  return world.roads.crossings.filter((row) => row.departedTick <= world.tick &&
    (row.payerId === viewer.id || row.companionId === viewer.id)).map((row) => ({ ...row }));
}

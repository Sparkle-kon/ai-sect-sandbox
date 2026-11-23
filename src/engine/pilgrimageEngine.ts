import {pilgrimageForkCheckpoint} from './pilgrimageForkPresence';
import { recordFlightStride } from './protagonistFlightTape';
import type {WaypostMealVisit} from '../types/waypostMeal';
import {waypostMealServedThisTick} from './waypostMealTerms';
import {onLowerPlane} from './upperPassageIsolation';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import { ROAD_FARE, availableRoadPilgrimageRoutes, beginRoadPilgrimageCrossing, roadCrossingForLeg } from './roadEngine';
import type { Cultivator, LocationNode, LLMDecisionPayload, MapPoint, PilgrimageCamp, PilgrimageEndReason, PilgrimageJourney, PilgrimageMove,
  PilgrimageState, WorldEvent, WorldState } from '../types/world';
import { findMapPath } from './mapMotionEngine';
import { currentVisibleTileIds, knownMapLocations, noteTerrainVisit, terrainTileAt } from './terrainEngine';
import { flowActor, recordResourceFlow } from './resourceFlowEngine';
import { recordPilgrimageRouteObservations } from './routeWarningEngine';

export const PILGRIMAGE_LEG_COST = 8;
export const PILGRIMAGE_RELIEF_HP = 16;
export const PILGRIMAGE_OFFER_TICKS = 3;
export const PILGRIMAGE_ACTIVE_TICKS = 16;
export const PILGRIMAGE_TILE_STRIDE = 5;
export const PILGRIMAGE_CAMP_HERB = 'earth_root';
export const PILGRIMAGE_CAMP_RECOVERY_HP = 12;
const RETAIN_TERMINAL = 64;
const COOLDOWN = 3;
const MAX_OPTIONS = 3;
const MAX_PEERS = 3;
const MAX_SITES = 6;

export interface PilgrimageOption {
  action: 'PILGRIMAGE';
  pilgrimageMove: PilgrimageMove;
  targetPilgrimageId?: string;
  targetRoadId?: string;
  targetPilgrimageNextStopId?: string;
  targetLocationId?: string;
  targetCultivatorId?: string;
}
export interface PilgrimageView {
  journey: Omit<PilgrimageJourney, 'path'|'waypostMealWitnesses'>;
  checkpoint?: MapPoint;
  knownStopIds: string[];
}
export const createPilgrimageState = (): PilgrimageState => ({ journeys: [], nextId: 1 });
const alive = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const getActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const getSite = (world: WorldState, id: string) => world.locations.find((site) => site.id === id && site.type !== 'secret_realm');
const two = (journey: PilgrimageJourney) => [journey.organizerId, journey.companionId];
const member = (journey: PilgrimageJourney, actorId: string) => journey.organizerId === actorId || journey.companionId === actorId;
const liveJourney = (world: WorldState, journey: PilgrimageJourney, tick = world.tick) => journey.status === 'active' &&
  (journey.startedTick ?? Infinity) <= tick && (journey.expiresTick ?? 0) > tick;
const liveProposal = (world: WorldState, journey: PilgrimageJourney, tick = world.tick) =>
  journey.status === 'proposed' && journey.proposedTick <= tick && journey.offerExpiresTick > tick;
const pointOf = ({ x, y }: MapPoint): MapPoint => ({ x, y });
const samePoint = (a: MapPoint | undefined, b: MapPoint | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;
const pitchedCamp = (journey: PilgrimageJourney) => journey.camps?.find(({ status }) => status === 'pitched');
const campActedAt = (journey: PilgrimageJourney, tick: number) =>
  journey.camps?.some(camp => camp.openedTick === tick || camp.closedTick === tick) ?? false;

export function activePilgrimageForActor(world: WorldState, actor: Cultivator): PilgrimageJourney | undefined {
  return world.pilgrimages.journeys.find((journey) => liveJourney(world, journey) && member(journey, actor.id));
}

/** Locks both participants for the same monthly action, even where it completed the last leg. */
export function pilgrimageActedThisTick(world: WorldState, actor: Cultivator): boolean {
  return world.pilgrimages.journeys.some((journey) => member(journey, actor.id) &&
    (journey.lastMovedTick === world.tick || journey.startedTick === world.tick || campActedAt(journey,world.tick)));
}

export function pilgrimageCheckpoint(world: WorldState, actor: Cultivator): MapPoint | undefined {
  if (!alive(actor)) return undefined;
  const fork=pilgrimageForkCheckpoint(world,actor);
  if(fork)return fork;
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
  return own.map(({ path: _path,waypostMealWitnesses:_waypostMealWitnesses,...journey }) => ({
      journey: { ...journey, ...(journey.camps ? { camps:journey.camps.map(camp => ({
        ...camp,point:pointOf(camp.point),...(camp.recovery ? {recovery:camp.recovery.map(row => ({...row}))} : {}),
      })) } : {}) },
      checkpoint: journey.status === 'active' ? pilgrimageCheckpoint(world, actor) : undefined,
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

function actualCampOccupants(world: WorldState, journey: PilgrimageJourney) {
  const present = occupants(world,journey);
  if (!present || world.couriers.dispatches.some(row => member(journey,row.courierId ?? '') &&
    (row.status === 'in_transit' || row.status === 'returning'))) return undefined;
  return present;
}

function actualCampAnchor(world: WorldState, journey: PilgrimageJourney) {
  const index = journey.pathIndex;
  if (!Number.isSafeInteger(index) || index <= 0 || index >= journey.path.length - 1 ||
    journey.spentByEach !== (journey.legIndex + 1) * PILGRIMAGE_LEG_COST || journey.lastMovedTick === undefined ||
    journey.lastMovedTick > world.tick) return undefined;
  const from = getSite(world,journey.stopIds[journey.legIndex]);
  const to = getSite(world,journey.stopIds[journey.legIndex+1]);
  if (!samePoint(from,journey.path[0]) || !samePoint(to,journey.path.at(-1))) return undefined;
  const point = journey.path[index];
  const tile = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? terrainTileAt(world,point.x,point.y) : undefined;
  return tile ? { point,tileId:tile.id } : undefined;
}

export interface PilgrimageWaypostCheckpoint {
  visit:WaypostMealVisit;
  tileId:string;
  point:MapPoint;
  leader:Cultivator;
  companion:Cultivator;
}

/** Real paid, stationary lower-world checkpoint; a route preview or location label cannot supply it. */
export function pilgrimageWaypostCheckpoint(world:WorldState,journey:PilgrimageJourney,tick=world.tick):PilgrimageWaypostCheckpoint|undefined {
  if((tick!==world.tick&&tick!==world.tick+1)||!world.pilgrimages.journeys.includes(journey)||
    !liveJourney(world,journey,tick)||journey.organizerId===journey.companionId||journey.lastMovedTick===undefined||
    journey.lastMovedTick>=tick||pitchedCamp(journey)||campActedAt(journey,tick))return undefined;
  const group=actualCampOccupants(world,journey),pin=actualCampAnchor(world,journey);
  if(!group||!pin||!onLowerPlane(group.leader)||!onLowerPlane(group.companion)||
    [group.leader,group.companion].some(person=>boundaryReliefCheckpoint(world,person)||expeditionRescueCheckpoint(world,person)))return undefined;
  const tile=terrainTileAt(world,pin.point.x,pin.point.y);
  if(!tile||tile.biome==='魔渊'||world.mapHazards.some(hazard=>hazard.tileId===pin.tileId&&hazard.createdTick<=tick&&
      tick<hazard.expiresTick&&hazard.intensity>=2))return undefined;
  const originId=journey.stopIds[journey.legIndex],destinationId=journey.stopIds[journey.legIndex+1];
  if(!originId||!destinationId)return undefined;
  return {visit:{journeyId:journey.id,organizerId:journey.organizerId,companionId:journey.companionId,
    spentByEach:journey.spentByEach,legIndex:journey.legIndex,pathIndex:journey.pathIndex,reachedTick:journey.lastMovedTick,originId,destinationId},
    point:pointOf(pin.point),tileId:pin.tileId,...group};
}

function stillAtCamp(world: WorldState, journey: PilgrimageJourney, camp: PilgrimageCamp) {
  const pin = actualCampAnchor(world,journey);
  return pin && camp.legIndex === journey.legIndex && camp.pathIndex === journey.pathIndex &&
    samePoint(camp.point,pin.point) && camp.tileId === pin.tileId && actualCampOccupants(world,journey) ? pin : undefined;
}

/** A live, presently verified temporary checkpoint only, not a route, land title or destination. */
export function pilgrimageCampCheckpoint(world: WorldState, journey: PilgrimageJourney): MapPoint | undefined {
  const camp = pitchedCamp(journey);
  if (!camp || !liveJourney(world,journey) || camp.openedTick > world.tick || world.tick > camp.openedTick + 1 ||
    !world.pilgrimages.journeys.includes(journey)) return undefined;
  const anchor = stillAtCamp(world,journey,camp);
  return anchor ? pointOf(anchor.point) : undefined;
}

function campEligible(world: WorldState, journey: PilgrimageJourney, tick: number) {
  const people = actualCampOccupants(world,journey);
  const pin = actualCampAnchor(world,journey);
  const provision = people?.leader.herbs[PILGRIMAGE_CAMP_HERB];
  if (!people || !pin || journey.camps?.some(camp => camp.legIndex === journey.legIndex) ||
    tick + 1 >= (journey.expiresTick ?? 0) || provision === undefined || !Number.isFinite(provision) || provision < 1 ||
    world.mapHazards.some(hazard => hazard.tileId === pin.tileId && hazard.createdTick <= tick &&
      tick < hazard.expiresTick && hazard.intensity >= 2)) return undefined;
  const injured = [people.leader,people.companion].some(actor => actor.hp <= actor.maxHp * .7);
  const missedStride = tick >= (journey.lastMovedTick ?? Infinity) + 2;
  return injured || missedStride ? { ...pin,people } : undefined;
}

function nextPilgrimageStride(world: WorldState, journey: PilgrimageJourney) {
  const stride = roadCrossingForLeg(world,journey)?.stride ?? PILGRIMAGE_TILE_STRIDE;
  return Math.min(journey.path.length - 1,journey.pathIndex + stride);
}

function campCanResume(world: WorldState, journey: PilgrimageJourney, camp: PilgrimageCamp, tick: number) {
  if (tick !== camp.openedTick + 1 || !stillAtCamp(world,journey,camp)) return false;
  const next = nextPilgrimageStride(world,journey);
  return next > journey.pathIndex && journey.path.slice(journey.pathIndex+1,next+1).every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y) && !!terrainTileAt(world,point.x,point.y));
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

/** Exact already-accepted departure: this does not disclose or reserve a future path. */
export function hasReachablePilgrimageDeparture(world:WorldState,journey:PilgrimageJourney,rounds:number):boolean {
  const pair=occupants(world,journey);
  if(!pair||!liveJourney(world,journey)||journey.path.length||!Number.isSafeInteger(rounds)||rounds<=0)return false;
  const path=canDepart(world,journey,pair.leader,pair.companion);
  if(path.length<=1||path.length-1>rounds*PILGRIMAGE_TILE_STRIDE)return false;
  const visible=new Set([...currentVisibleTileIds(world,pair.leader),...currentVisibleTileIds(world,pair.companion)]);
  const unsafe=new Set(world.mapHazards.filter(row=>visible.has(row.tileId)&&row.createdTick<=world.tick&&
    world.tick<row.expiresTick&&row.intensity>=2).map(row=>row.tileId));
  return !path.some(point=>{const tile=terrainTileAt(world,point.x,point.y);return !tile||unsafe.has(tile.id);});
}

/** Optional proposal enumeration override for schedulers; pending and active options are always evaluated. */
export function availablePilgrimageActions(actor: Cultivator, world: WorldState, includeProposals = true,
  executionTick = world.tick): PilgrimageOption[] {
  if ((executionTick !== world.tick && executionTick !== world.tick + 1) ||
    !world.cultivators.includes(actor) || !alive(actor) || unavailable(world, actor)) return [];
  const state = world.pilgrimages;
  const locked = (candidateId: string) => state.journeys.some((journey) => member(journey, candidateId) &&
    (liveJourney(world, journey, executionTick) || liveProposal(world, journey, executionTick) ||
      (journey.settledTick !== undefined && executionTick - journey.settledTick < COOLDOWN)));
  const options: PilgrimageOption[] = [];
  const existing = state.journeys.find((journey) => member(journey, actor.id) &&
    (liveJourney(world, journey, executionTick) || liveProposal(world, journey, executionTick)));
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
    if (!both || executionTick <= (existing.startedTick ?? executionTick) || existing.lastMovedTick === executionTick ||
      campActedAt(existing,executionTick) ||
      !existing.stopIds.every((id) => getSite(world, id))) return options;
    const served=waypostMealServedThisTick(world,actor.id,executionTick);
    const camp = pitchedCamp(existing);
    if (camp) {
      if (executionTick === camp.openedTick + 1 && stillAtCamp(world,existing,camp)) {
        if (actor.id === existing.organizerId && !served && campCanResume(world,existing,camp,executionTick)) add('resume');
        add('dismantle');
      }
      return options; // A pitched camp locks ordinary advance; even a missed camp needs authoritative cleanup first.
    }
    if (actor.id === existing.organizerId) {
      if (existing.path.length > 1) {
        if (campEligible(world,existing,executionTick)) add('camp');
        if(!served)add('advance');
      }
      else if(!served){
        const normal = canDepart(world, existing, both.leader, both.companion);
        if (normal.length > 1) {
          add('advance');
          if (world.roads.links.length && both.leader.spiritStones >= PILGRIMAGE_LEG_COST + ROAD_FARE) for (const route of availableRoadPilgrimageRoutes(world, existing,
              both.leader, both.companion, normal, PILGRIMAGE_TILE_STRIDE, PILGRIMAGE_LEG_COST)) {
            options.push({ action: 'PILGRIMAGE', pilgrimageMove: 'advance', targetPilgrimageId: existing.id, targetRoadId: route.roadId });
          }
        }
      }
    }
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
  const camp = pitchedCamp(journey);
  if (camp) closeCamp(camp, world.tick, reason === 'journey_expiry' ? 'expired' : 'interrupted');
  journey.status = status;
  journey.reason = reason;
  journey.settledTick = world.tick;
  journey.path = [];
  journey.pathIndex = 0;
}

function closeCamp(camp: PilgrimageCamp, tick: number, status: Exclude<PilgrimageCamp['status'],'pitched'>) {
  if (camp.status !== 'pitched') return;
  camp.status = status;
  camp.closedTick = tick;
}

export function resolvePilgrimageAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'PILGRIMAGE') return null;
  const option = availablePilgrimageActions(actor, world, decision.pilgrimageMove === 'propose').find((candidate) =>
    candidate.pilgrimageMove === decision.pilgrimageMove && candidate.targetPilgrimageId === decision.targetPilgrimageId &&
    candidate.targetPilgrimageNextStopId === decision.targetPilgrimageNextStopId && candidate.targetLocationId === decision.targetLocationId &&
    candidate.targetCultivatorId === decision.targetCultivatorId && candidate.targetRoadId === decision.targetRoadId);
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
  if (option.pilgrimageMove === 'camp') {
    const actual = campEligible(world,journey,world.tick);
    if (!actual) return null;
    actor.herbs[PILGRIMAGE_CAMP_HERB] -= 1;
    (journey.camps ??= []).push({
      legIndex:journey.legIndex,pathIndex:journey.pathIndex,tileId:actual.tileId,point:pointOf(actual.point),
      openedTick:world.tick,payerId:actor.id,status:'pitched',
    });
    recordResourceFlow(world,{
      kind:'consumption',from:flowActor(actor.id),amount:1,good:PILGRIMAGE_CAMP_HERB,
      mechanism:'pilgrimage',reason:'pilgrimage_camp_provision',refId:journey.id,visibility:{kind:'participants',actorIds:[actor.id]},
    });
    return event(world,journey,'camp','在实到关口扎营','实耗一份玄土根，只在已到关口停留。尚未迈过下一程，也未添站点。');
  }
  let resumed = false;
  if (option.pilgrimageMove === 'dismantle' || option.pilgrimageMove === 'resume') {
    const camp = pitchedCamp(journey);
    if (!camp || !stillAtCamp(world,journey,camp) || world.tick !== camp.openedTick + 1) return null;
    if (option.pilgrimageMove === 'dismantle') {
      closeCamp(camp,world.tick,'dismantled');
      return event(world,journey,'dismantled','原地撤营','只拆除临时营地；未移动、未回复气血，也不退已用补给。');
    }
    if (!campCanResume(world,journey,camp,world.tick)) return null;
    const recovery = [];
    for (const person of [members.leader,members.companion]) {
      const hp = Math.min(PILGRIMAGE_CAMP_RECOVERY_HP,Math.max(0,person.maxHp-person.hp));
      if (hp > 0) { person.hp += hp; recovery.push({actorId:person.id,hp}); }
    }
    closeCamp(camp,world.tick,'resumed');
    camp.recovery = recovery;
    resumed = true;
  }
  if (!journey.path.length) {
    const normal = canDepart(world, journey, members.leader, members.companion);
    // No extra debit until both base fares and the exact currently eligible route are verified.
    if (normal.length < 2 || (option.targetRoadId && members.leader.spiritStones < PILGRIMAGE_LEG_COST + ROAD_FARE)) return null;
    const paid = option.targetRoadId ? beginRoadPilgrimageCrossing(world, journey, members.leader, members.companion,
      option.targetRoadId, normal, PILGRIMAGE_TILE_STRIDE, PILGRIMAGE_LEG_COST) : undefined;
    if (option.targetRoadId && !paid) return null;
    journey.path = paid?.path ?? normal;
    members.leader.spiritStones -= PILGRIMAGE_LEG_COST;
    members.companion.spiritStones -= PILGRIMAGE_LEG_COST;
    journey.spentByEach += PILGRIMAGE_LEG_COST;
  }
  const fromPathIndex = journey.pathIndex;
  const next = nextPilgrimageStride(world,journey);
  const visitedTiles = journey.path.slice(journey.pathIndex + 1, next + 1).flatMap((point) => {
    const tile = terrainTileAt(world, point.x, point.y);
    return tile ? [tile.id] : [];
  });
  for (const person of [members.leader, members.companion]) person.exploredTileIds = [...new Set([...person.exploredTileIds, ...visitedTiles])];
  journey.pathIndex = next;
  journey.lastMovedTick = world.tick;
  recordPilgrimageRouteObservations(world,journey,fromPathIndex);
  const traversed=()=>journey.path.slice(fromPathIndex,next+1);
  const record=(receipt:WorldEvent,points:MapPoint[])=>{
    recordFlightStride(world,journey.id,receipt,points);
    return receipt;
  };
  if (next < journey.path.length - 1) return record(resumed
    ? event(world,journey,'resumed','由原关口收营续行','已核对实到关口并沿原路行过本回合路段，尚未抵达下一站。')
    : event(world, journey, 'stride', '沿已勘路线结伴前行', '实际行过本回合路段，尚未抵达下一站。'),traversed());
  const arrivedPoints=traversed();
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
    return record(event(world, journey, 'completed', '两人如约完成巡礼', '双方确实途经全部停靠点，记录实际花费与互助，不另行发奖。', arrived),arrivedPoints);
  }
  return record(event(world, journey, 'arrival', '同行巡礼抵达中站', '可待下回合再行、救助同伴或退出。', arrived),arrivedPoints);
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
    const camp = pitchedCamp(journey);
    if (camp) {
      const valid = !reason && stillAtCamp(world,journey,camp);
      const missed = world.tick >= camp.openedTick + 2;
      if (!valid || missed) {
        const expired = reason === 'journey_expiry' || !!valid && missed;
        closeCamp(camp,world.tick,expired ? 'expired' : 'interrupted');
        events.push(event(world,journey,expired ? 'camp-expiry' : 'camp-interruption',expired ? '野营逾期撤除' : '野营中断',
          '没有发生续行或回复气血，已用补给不退，也不记作到站。'));
      }
    }
    if (!reason) continue;
    const interruptedEnRoute = journey.path.length > 0;
    settle(world, journey, reason === 'offer_expiry' || reason === 'journey_expiry' ? 'expired' : 'interrupted', reason);
    const description = reasonText[reason] + (interruptedEnRoute ? '记录回退至最近实站；未将半程记作抵达。' : '');
    const last = journey.stopsVisited.at(-1)?.locationId;
    events.push(event(world, journey, reason, '巡礼事项关闭', description, last && getSite(world, last) ? last : undefined));
  }
  const terminal = new Set(state.journeys.filter((journey) => journey.status !== 'proposed' && journey.status !== 'active')
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-RETAIN_TERMINAL).map(({ id }) => id));
  const mealProof=new Set((world.waypostMeals?.meals??[]).flatMap(row=>[row.hostVisit.journeyId,row.guestVisit.journeyId]));
  for(const fork of world.pilgrimageForks?.forks??[])mealProof.add(fork.journeyId);
  state.journeys = state.journeys.filter((journey) => journey.status === 'proposed' || journey.status === 'active' ||
    mealProof.has(journey.id) || terminal.has(journey.id) || (journey.settledTick !== undefined && world.tick - journey.settledTick < COOLDOWN));
  return events;
}

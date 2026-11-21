import type { Cultivator, LLMDecisionPayload, LocationNode, MapPoint, RelocationMove, RelocationPlan, RelocationState,
  Sect, WorldEvent, WorldState } from '../types/world';
import { findMapPath } from './mapMotionEngine';
import { knownMapLocations, noteTerrainVisit, terrainTileAt } from './terrainEngine';
import { isTribulationActive } from './tribulationEngine';

const BALLOT_TICKS = 6;
const REPEAT_COOLDOWN = 6;
const EARTH_COST = 1;
const VOYAGE_TICKS = 4;
const ELDERS = new Set<Cultivator['sectRank']>(['掌门', '太上长老', '长老']);
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const active = (plan: RelocationPlan) => plan.status === 'voting' || plan.status === 'in_transit';
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const getActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const getSite = (world: WorldState, id: string) => world.locations.find((site) => site.id === id);
const getSect = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);

export interface RelocationOption {
  action: 'RELOCATE';
  relocationMove: RelocationMove;
  targetLocationId?: string;
  targetRelocationId?: string;
}

export const createRelocationState = (): RelocationState => ({ plans: [], abandonedSites: [], nextId: 1 });

export function relocationQuorum(plan: Pick<RelocationPlan, 'voterIds'>): number {
  return Math.max(2, Math.ceil(2 * plan.voterIds.length / 3));
}

export function activeRelocationForActor(world: WorldState, actor: Cultivator): RelocationPlan | undefined {
  return world.relocations.plans.find((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id));
}

export function activeRelocationForSect(world: WorldState, sectId: string): RelocationPlan | undefined {
  return world.relocations.plans.find((plan) => plan.status === 'in_transit' && plan.sectId === sectId);
}

export function visibleRelocations(world: WorldState, actor?: Cultivator): Pick<RelocationState, 'plans' | 'abandonedSites'> {
  if (!actor) return { plans: world.relocations.plans, abandonedSites: world.relocations.abandonedSites };
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  const knownPair = ({ originId, destinationId, sectId }: { originId: string; destinationId: string; sectId: string }) =>
    actor.sectId === sectId || (known.has(originId) && known.has(destinationId));
  return { plans: world.relocations.plans.filter(knownPair), abandonedSites: world.relocations.abandonedSites.filter(knownPair) };
}

function activeWarRoute(world: WorldState, sect: Sect): boolean {
  return world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') &&
    (siege.attackerSectId === sect.id || siege.defenderSectId === sect.id));
}

function activeTileHazard(world: WorldState, point: MapPoint, minimum: number): boolean {
  const tile = terrainTileAt(world, point.x, point.y);
  return Boolean(tile && world.mapHazards.some((hazard) => hazard.tileId === tile.id && hazard.createdTick <= world.tick &&
    hazard.expiresTick > world.tick && hazard.intensity >= minimum));
}

function weakened(world: WorldState, sect: Sect, origin: LocationNode): boolean {
  return (sect.arrayMaxHp > 0 && sect.arrayHp / sect.arrayMaxHp <= .55) ||
    activeTileHazard(world, origin, 2) ||
    world.sieges.some((siege) => siege.status === 'victory' && siege.defenderSectId === sect.id && siege.destinationId === origin.id &&
      siege.lastResolvedTick !== undefined && siege.lastResolvedTick <= world.tick && world.tick - siege.lastResolvedTick <= 12);
}

function availablePerson(world: WorldState, actor: Cultivator): boolean {
  return live(actor) && !world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') &&
    siege.participantIds.includes(actor.id)) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') &&
      occasion.participantIds.includes(actor.id)) &&
    !isTribulationActive(actor) && !activeRelocationForActor(world, actor);
}

function eligibleVoters(world: WorldState, sect: Sect, originId: string): Cultivator[] {
  return world.cultivators.filter((actor) => actor.sectId === sect.id && actor.locationId === originId &&
    (actor.id === sect.leaderId || ELDERS.has(actor.sectRank)) && availablePerson(world, actor)).sort(byId);
}

function legalDestination(world: WorldState, sect: Sect, origin: LocationNode, destination: LocationNode, myPlanId?: string): boolean {
  const tile = terrainTileAt(world, destination.x, destination.y);
  return destination.id !== origin.id && destination.type === 'spirit_vein' && !destination.ownerSectId &&
    !!tile && (!tile.ownerSectId || tile.ownerSectId === sect.id) &&
    !world.sects.some(({ headquartersId }) => headquartersId === destination.id) &&
    !world.relocations.plans.some((plan) => plan.id !== myPlanId && active(plan) && plan.destinationId === destination.id);
}

const routeCost = (path: MapPoint[]): number => 40 + (path.length - 1) * 3;

function publicEvent(world: WorldState, plan: RelocationPlan, slug: string, title: string, description: string,
  actorIds: string[] = [], locationId: string = plan.originId): WorldEvent {
  return { id: `evt-${world.tick}-${plan.id}-${slug}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId, category: 'diplomacy' };
}

function canPropose(world: WorldState, actor: Cultivator, sect: Sect, origin: LocationNode): boolean {
  const recent = world.relocations.plans.filter((entry) => entry.sectId === sect.id && entry.settledTick !== undefined).at(-1);
  return sect.leaderId === actor.id && actor.locationId === origin.id && origin.ownerSectId === sect.id &&
    availablePerson(world, actor) && !activeWarRoute(world, sect) && weakened(world, sect, origin) &&
    origin.herbs.earth_root >= EARTH_COST && !world.relocations.plans.some((plan) => plan.sectId === sect.id && active(plan)) &&
    (recent?.settledTick === undefined || world.tick - recent.settledTick >= REPEAT_COOLDOWN) &&
    eligibleVoters(world, sect, origin.id).length >= 3;
}

export function availableRelocationActions(actor: Cultivator, world: WorldState): RelocationOption[] {
  if (!world.cultivators.includes(actor) || !availablePerson(world, actor)) return [];
  const sect = getSect(world, actor.sectId);
  const origin = sect ? getSite(world, sect.headquartersId) : undefined;
  if (!sect || !origin || actor.locationId !== origin.id) return [];
  const activePlan = world.relocations.plans.find((plan) => plan.sectId === sect.id && active(plan));
  if (activePlan) {
    if (activePlan.status !== 'voting' || world.tick >= activePlan.deadlineTick || !activePlan.voterIds.includes(actor.id) ||
        activePlan.votes.some(({ actorId }) => actorId === actor.id) ||
        !eligibleVoters(world, sect, origin.id).some(({ id }) => id === actor.id)) return [];
    return (['approve', 'decline'] as const).map((relocationMove) => ({ action: 'RELOCATE', relocationMove,
      targetRelocationId: activePlan.id }));
  }
  if (!canPropose(world, actor, sect, origin)) return [];
  return knownMapLocations(world, actor).filter((destination) => legalDestination(world, sect, origin, destination))
    .sort(byId).flatMap((destination): RelocationOption[] => {
      const path = findMapPath(world, origin, destination);
      return path.length > 1 && sect.spiritStones >= routeCost(path)
        ? [{ action: 'RELOCATE', relocationMove: 'propose', targetLocationId: destination.id }] : [];
    });
}

export function resolveRelocationAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'RELOCATE') return null;
  const option = availableRelocationActions(actor, world).find((entry) => entry.relocationMove === decision.relocationMove &&
    entry.targetRelocationId === decision.targetRelocationId && entry.targetLocationId === decision.targetLocationId);
  if (!option) return null;
  if (option.relocationMove === 'propose') {
    const sect = getSect(world, actor.sectId)!;
    const origin = getSite(world, sect.headquartersId)!;
    const destination = getSite(world, option.targetLocationId!)!;
    const path = findMapPath(world, origin, destination);
    const id = `relocation-${world.relocations.nextId++}`;
    const plan: RelocationPlan = { id, sectId: sect.id, originId: origin.id, destinationId: destination.id,
      status: 'voting', openedTick: world.tick, deadlineTick: world.tick + BALLOT_TICKS, proposerId: actor.id,
      voterIds: eligibleVoters(world, sect, origin.id).map(({ id: voterId }) => voterId),
      votes: [{ actorId: actor.id, tick: world.tick, approve: true }], garrisonIds: [], path, pathIndex: 0,
      stoneCost: routeCost(path), earthCost: EARTH_COST, custody: { stones: 0, pavilion: [] }, spent: false };
    world.relocations.plans.push(plan);
    return publicEvent(world, plan, 'proposed', '宗门迁址提交表决', `${actor.name}提请长老议定沿可通行山路迁往${destination.name}，尚未提取补给。`, [actor.id]);
  }
  const plan = world.relocations.plans.find(({ id }) => id === option.targetRelocationId)!;
  const approve = option.relocationMove === 'approve';
  plan.votes.push({ actorId: actor.id, tick: world.tick, approve });
  return publicEvent(world, plan, `vote-${actor.id}`, approve ? '长老同意迁宗' : '长老反对迁宗',
    `${actor.name}对限期迁址议案投下${approve ? '赞成' : '反对'}票。`, [actor.id]);
}

function restoreCustody(sect: Sect, plan: RelocationPlan): void {
  sect.spiritStones += plan.custody.stones;
  plan.custody.stones = 0;
  sect.pavilion.push(...plan.custody.pavilion);
  plan.custody.pavilion = [];
}

function abort(world: WorldState, plan: RelocationPlan, sect: Sect | undefined, reason: string): WorldEvent {
  if (sect) restoreCustody(sect, plan);
  plan.status = 'aborted';
  plan.settledTick = world.tick;
  plan.reason = reason;
  return publicEvent(world, plan, 'aborted', '迁宗中止', reason, [plan.proposerId]);
}

function claims(world: WorldState, plan: RelocationPlan, origin: LocationNode, destination: LocationNode): void {
  const owned = world.locations.filter((site) => site.ownerSectId === plan.sectId && site.id !== origin.id && site.id !== destination.id);
  for (const tile of world.terrain.tiles) {
    const point = { x: (tile.col + .5) * 1000 / world.terrain.columns, y: (tile.row + .5) * 600 / world.terrain.rows };
    const oldRange = origin.type === 'sect_hq' ? 170 : 100;
    const nearOrigin = Math.hypot(origin.x - point.x, origin.y - point.y) <= oldRange;
    if (nearOrigin && tile.ownerSectId === plan.sectId &&
        !owned.some((site) => Math.hypot(site.x - point.x, site.y - point.y) <= (site.type === 'sect_hq' ? 155 : 84))) delete tile.ownerSectId;
    if (!tile.ownerSectId && Math.hypot(destination.x - point.x, destination.y - point.y) <= 155) tile.ownerSectId = plan.sectId;
  }
}

function arrive(world: WorldState, plan: RelocationPlan, sect: Sect, origin: LocationNode, destination: LocationNode): WorldEvent {
  world.relocations.abandonedSites.push({ id: `abandoned-${plan.id}`, planId: plan.id, sectId: sect.id, originId: origin.id,
    destinationId: destination.id, tick: world.tick, originalType: origin.type, facilities: { ...sect.facilities }, arrayHp: sect.arrayHp, arrayMaxHp: sect.arrayMaxHp });
  claims(world, plan, origin, destination);
  delete origin.ownerSectId;
  if (origin.type === 'sect_hq') origin.type = 'spirit_vein';
  destination.ownerSectId = sect.id;
  destination.type = 'sect_hq';
  sect.headquartersId = destination.id;
  // These are fixed buildings, left in the protected historical snapshot rather than copied.
  sect.facilities = { qi_array: 0, alchemy_hall: 0, scripture_pavilion: 0, defense_array: 0, spirit_mine: 0 };
  sect.arrayHp = 0;
  sect.arrayMaxHp = 0;
  restoreCustody(sect, plan);
  const travelers = world.cultivators.filter((actor) => plan.garrisonIds.includes(actor.id) && live(actor) &&
    actor.locationId === origin.id && actor.sectId === sect.id);
  for (const actor of travelers) {
    actor.locationId = destination.id;
    if (actor.guardAssignment?.locationId === origin.id) delete actor.guardAssignment;
    noteTerrainVisit(world, actor);
  }
  plan.status = 'settled';
  plan.settledTick = world.tick;
  plan.reason = '现有库银、藏经与已登记的驻守人员已经抵达；旧山门及固定设施留档。';
  return publicEvent(world, plan, 'arrived', '宗门安抵新址', plan.reason, travelers.map(({ id }) => id), destination.id);
}

export function advanceRelocations(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const plan of world.relocations.plans) {
    if (!active(plan) || (plan.lastAdvancedTick !== undefined && world.tick <= plan.lastAdvancedTick)) continue;
    // Do not consume the timestamp while waiting for votes; the canonical first advance can run before actors.
    const sect = getSect(world, plan.sectId);
    const origin = getSite(world, plan.originId);
    const destination = getSite(world, plan.destinationId);
    const leader = getActor(world, plan.proposerId);
    if (!sect || !origin || !destination || sect.headquartersId !== origin.id || origin.ownerSectId !== sect.id ||
        !legalDestination(world, sect, origin, destination, plan.id) || !leader || !live(leader) ||
        sect.leaderId !== leader.id || leader.locationId !== origin.id) {
      events.push(abort(world, plan, sect, '山门、迁入地或主持人资格已经改变，托管财物退回原宗。'));
      continue;
    }
    if (activeWarRoute(world, sect)) {
      events.push(abort(world, plan, sect, '交战状态阻断了迁宗路线，托管财物退回原宗。'));
      continue;
    }
    if (plan.status === 'voting') {
      if (world.tick >= plan.deadlineTick) {
        events.push(abort(world, plan, sect, '议案期限内未获满足要求的表决，未使用补给。'));
        continue;
      }
      const currentVoters = new Set(eligibleVoters(world, sect, origin.id).map(({ id }) => id));
      const yesIds = new Set(plan.votes.filter((vote) => vote.approve && currentVoters.has(vote.actorId) &&
        plan.voterIds.includes(vote.actorId)).map(({ actorId }) => actorId));
      const approvals = yesIds.size;
      const remaining = plan.voterIds.filter((id) => currentVoters.has(id) && !plan.votes.some(({ actorId }) => actorId === id)).length;
      if (approvals + remaining < relocationQuorum(plan)) {
        events.push(abort(world, plan, sect, '合资格票数已无法达到门槛，未使用补给。'));
        continue;
      }
      if (approvals < relocationQuorum(plan) || !yesIds.has(plan.proposerId)) continue;
      if (!availablePerson(world, leader) || !weakened(world, sect, origin) ||
          origin.herbs.earth_root < plan.earthCost || sect.spiritStones < plan.stoneCost) {
        events.push(abort(world, plan, sect, '出发前复核山门损伤或实际补给未达要求，未划拨财物。'));
        continue;
      }
      const route = findMapPath(world, origin, destination);
      if (route.length <= 1 || routeCost(route) !== plan.stoneCost ||
          !route.every((point, index) => point.x === plan.path[index]?.x && point.y === plan.path[index]?.y)) {
        events.push(abort(world, plan, sect, '地势或通行路线有变，需重新提交路线与补给议案。'));
        continue;
      }
      plan.garrisonIds = world.cultivators.filter((actor) => actor.sectId === sect.id && actor.locationId === origin.id && availablePerson(world, actor))
        .sort(byId).map(({ id }) => id);
      origin.herbs.earth_root -= plan.earthCost;
      sect.spiritStones -= plan.stoneCost;
      plan.custody = { stones: sect.spiritStones, pavilion: sect.pavilion };
      sect.spiritStones = 0;
      sect.pavilion = [];
      plan.status = 'in_transit';
      plan.spent = true;
      plan.departedTick = world.tick;
      plan.lastAdvancedTick = world.tick;
      events.push(publicEvent(world, plan, 'departed', '迁宗队伍启程', `消耗${plan.earthCost}份玄土根及${plan.stoneCost}灵石，余财与藏经按实际山路托管运送。`,
        plan.garrisonIds));
      continue;
    }
    plan.lastAdvancedTick = world.tick;
    const next = Math.min(plan.path.length - 1, plan.pathIndex + Math.max(1, Math.ceil((plan.path.length - 1) / VOYAGE_TICKS)));
    const originTile = terrainTileAt(world, origin.x, origin.y)?.id;
    const blocked = plan.path.slice(plan.pathIndex + 1, next + 1).some((point) => {
      const tile = terrainTileAt(world, point.x, point.y);
      return !tile || (tile.id !== originTile && activeTileHazard(world, point, 3));
    });
    if (blocked) {
      events.push(abort(world, plan, sect, '实际行程遭遇严重灾害，中止并退回余财、藏经；已消耗补给不退。'));
      continue;
    }
    plan.pathIndex = next;
    if (plan.pathIndex === plan.path.length - 1) events.push(arrive(world, plan, sect, origin, destination));
  }
  const latest = new Set(world.relocations.plans.filter((plan) => !active(plan)).slice(-64));
  world.relocations.plans = world.relocations.plans.filter((plan) => active(plan) || latest.has(plan));
  world.relocations.abandonedSites = world.relocations.abandonedSites.slice(-64);
  return events;
}

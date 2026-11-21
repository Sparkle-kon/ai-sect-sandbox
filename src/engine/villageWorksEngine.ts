import type { Cultivator, LLMDecisionPayload, LocationNode, MortalSettlement, VillageWorkKind, VillageWorkProject, VillageWorksState,
  WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { knownMapLocations, terrainTileAt } from './terrainEngine';

const kinds = ['well', 'field', 'shelter'] as const;
export const VILLAGE_WORK_RULES: Readonly<Record<VillageWorkKind, Readonly<{ stones: number; roots: number; labor: number; capacityGain: number; ticks: number }>>> =
  Object.freeze({
    well: Object.freeze({ stones: 32, roots: 2, labor: 4, capacityGain: 8, ticks: 6 }),
    field: Object.freeze({ stones: 40, roots: 3, labor: 6, capacityGain: 12, ticks: 8 }),
    shelter: Object.freeze({ stones: 30, roots: 2, labor: 4, capacityGain: 6, ticks: 6 }),
  });
export const VILLAGE_WORK_MAX_LABOR_PER_TICK = 2;
export const VILLAGE_WORK_ADULTS_PER_LABOR = 6;
export const VILLAGE_WORK_STRESS_LIMIT = 45;
const PAUSE_AFTER_ABANDONMENT = 2;
const ABANDONED_HISTORY = 64;
const TITLE: Readonly<Record<VillageWorkKind, string>> = { well: '公井', field: '田渠', shelter: '乡舍' };
const SPONSORS = new Set<Cultivator['sectRank']>(['长老', '太上长老', '掌门']);

export type VillageWorkReadiness = 'ready' | 'starting_tick' | 'hazard' | 'stress' | 'labor_shortage' | 'abandoned' | 'site_lost' | 'deadline' | 'inactive';
export interface VillageWorksOption {
  action: 'VILLAGE_WORKS';
  villageWorkKind: VillageWorkKind;
  targetSettlementId: string;
}
export const createVillageWorksState = (): VillageWorksState => ({ projects: [], nextId: 1 });

const villageOf = (world: WorldState, id: string) => world.settlements.villages.find((village) => village.id === id);
const siteOf = (world: WorldState, village: MortalSettlement | undefined) => world.locations.find((site) => site.id === village?.locationId);
const onHazard = (world: WorldState, site: LocationNode) => {
  const tileId = terrainTileAt(world, site.x, site.y)?.id;
  return tileId !== undefined && world.mapHazards.some((hazard) => hazard.tileId === tileId &&
    hazard.createdTick <= world.tick && world.tick < hazard.expiresTick && hazard.intensity >= 1);
};

/** Do not promise the labor of people already tracked in named volunteer or juvenile-cohort roles. */
export function villageWorkAdultSurplus(village: MortalSettlement): number {
  const children = village.juvenileCohorts.reduce((sum, cohort) => sum + cohort.count, 0);
  const volunteers = village.volunteers.filter((person) => !person.enlistedCultivatorId).length;
  return Math.max(0, village.population - children - volunteers);
}
const workLabor = (adults: number) => Math.min(VILLAGE_WORK_MAX_LABOR_PER_TICK, Math.floor(adults / VILLAGE_WORK_ADULTS_PER_LABOR));

export function villageWorkReadiness(world: WorldState, project: VillageWorkProject): VillageWorkReadiness {
  if (project.status !== 'building' || project.startedTick > world.tick) return 'inactive';
  const village = villageOf(world, project.settlementId);
  const site = siteOf(world, village);
  if (!village || !site) return 'site_lost';
  if (village.population <= 0) return 'abandoned';
  if (world.tick >= project.deadlineTick) return 'deadline';
  if (world.tick === project.startedTick) return 'starting_tick';
  if (onHazard(world, site)) return 'hazard';
  if (village.stress >= VILLAGE_WORK_STRESS_LIMIT) return 'stress';
  return workLabor(villageWorkAdultSurplus(village)) > 0 ? 'ready' : 'labor_shortage';
}

function physicallyHere(world: WorldState, actor: Cultivator): boolean {
  return actor.alive && actor.hp > 0 && !pilgrimageCheckpoint(world, actor) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && (row.sectId === actor.sectId || row.garrisonIds.includes(actor.id))) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

export function availableVillageWorksActions(actor: Cultivator, world: WorldState): VillageWorksOption[] {
  if (!SPONSORS.has(actor.sectRank) || !physicallyHere(world, actor)) return [];
  const village = world.settlements.villages.find(({ locationId }) => locationId === actor.locationId);
  if (!village || village.population <= 0 || village.stress >= VILLAGE_WORK_STRESS_LIMIT ||
      !workLabor(villageWorkAdultSurplus(village))) return [];
  const site = siteOf(world, village);
  const sponsor = world.sects.find((sect) => sect.id === actor.sectId);
  if (!site || !sponsor || (site.ownerSectId && site.ownerSectId !== sponsor.id) || onHazard(world, site)) return [];
  const existing = world.villageWorks.projects.filter(({ settlementId }) => settlementId === village.id);
  if (existing.some((project) => project.status === 'building' ||
      (project.status === 'abandoned' && project.settledTick !== undefined && project.settledTick + PAUSE_AFTER_ABANDONMENT > world.tick))) return [];
  return kinds.flatMap((kind): VillageWorksOption[] => {
    const rule = VILLAGE_WORK_RULES[kind];
    return sponsor.spiritStones >= rule.stones && actor.herbs.earth_root >= rule.roots &&
      !existing.some((project) => project.kind === kind && project.status === 'completed') ?
      [{ action: 'VILLAGE_WORKS', villageWorkKind: kind, targetSettlementId: village.id }] : [];
  });
}

export function visibleVillageWorks(world: WorldState, viewer?: Cultivator): VillageWorkProject[] {
  const actor = viewer && world.cultivators.find(({ id }) => id === viewer.id);
  if (!actor || !world.villageWorks.projects.length) return [];
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  const villages = new Set(world.settlements.villages.filter(({ locationId }) => known.has(locationId)).map(({ id }) => id));
  return world.villageWorks.projects.filter((project) => project.startedTick <= world.tick && villages.has(project.settlementId))
    .map((project) => ({ ...project, receipts: project.receipts.map((row) => ({ ...row })) }));
}

function event(world: WorldState, project: VillageWorkProject, stage: string, title: string, description: string, locationId?: string): WorldEvent {
  return { id: `evt-${project.id}-${stage}-${world.tick}`, title, description, actorIds: [project.sponsorId], locationId,
    tick: world.tick, year: world.year, month: world.month, category: 'diplomacy' };
}

export function resolveVillageWorksAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'VILLAGE_WORKS' || !world.cultivators.includes(actor)) return null;
  const option = availableVillageWorksActions(actor, world).find((row) =>
    row.villageWorkKind === decision.villageWorkKind && row.targetSettlementId === decision.targetSettlementId);
  if (!option) return null;
  const sponsor = world.sects.find(({ id }) => id === actor.sectId)!;
  const kind = option.villageWorkKind, rule = VILLAGE_WORK_RULES[kind];
  const id = `village-work-${world.villageWorks.nextId++}`;
  sponsor.spiritStones -= rule.stones;
  actor.herbs.earth_root -= rule.roots;
  const project: VillageWorkProject = { id, settlementId: option.targetSettlementId, sponsorSectId: sponsor.id, sponsorId: actor.id,
    kind, startedTick: world.tick, deadlineTick: world.tick + rule.ticks, status: 'building', laborTotal: 0,
    stonesSpent: rule.stones, rootsSpent: rule.roots, receipts: [] };
  world.villageWorks.projects.push(project);
  return event(world, project, 'funded', `宗门实物赞助乡建：${TITLE[kind]}`,
    `实耗宗库${rule.stones}灵石和本人${rule.roots}玄土根，材料已使用不退。还须由在村居民分轮投入工时，未增加承载人口。`, actor.locationId);
}

export function advanceVillageWorks(world: WorldState): WorldEvent[] {
  // Never assign labor from an earlier census; mortality and real migration are authoritative for this tick.
  if (world.settlements.lastAdvancedTick !== world.tick || !world.villageWorks.projects.length) return [];
  const events: WorldEvent[] = [];
  for (const project of world.villageWorks.projects) {
    if (project.status !== 'building') continue;
    const readiness = villageWorkReadiness(world, project);
    const village = villageOf(world, project.settlementId);
    const site = siteOf(world, village);
    if (readiness === 'deadline' || readiness === 'site_lost' || readiness === 'abandoned') {
      project.status = 'abandoned';
      project.settledTick = world.tick;
      project.endReason = readiness;
      const cause = readiness === 'deadline' ? '工期已满' : readiness === 'site_lost' ? '原址不再存在' : '村内已无居民';
      events.push(event(world, project, 'abandoned', `${TITLE[project.kind]}工程终止`, `${cause}。旧材料与已做工时仍有记载，未提高村庄容量，也未改变在册人数。`, site?.id));
      continue;
    }
    if (readiness !== 'ready' || !village || !site || project.lastWorkedTick === world.tick) continue;
    const rule = VILLAGE_WORK_RULES[project.kind];
    const adultsAvailable = villageWorkAdultSurplus(village);
    const labor = Math.min(workLabor(adultsAvailable), rule.labor - project.laborTotal);
    if (labor < 1) continue;
    project.laborTotal += labor;
    project.lastWorkedTick = world.tick;
    project.receipts.push({ tick: world.tick, labor, adultsAvailable });
    if (project.laborTotal === rule.labor) {
      project.capacityBefore = village.capacity;
      village.capacity += rule.capacityGain;
      project.capacityAfter = village.capacity;
      project.settledTick = world.tick;
      project.status = 'completed';
      events.push(event(world, project, 'completed', `${TITLE[project.kind]}工程实地完工`,
        `在册成年居民累计投入${project.laborTotal}工时，承载上限从${project.capacityBefore}增至${project.capacityAfter}；未凭空登记人口。`, site.id));
    }
  }
  const state = world.villageWorks;
  const retained = new Set(state.projects.filter((project) => project.status === 'abandoned')
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-ABANDONED_HISTORY).map(({ id }) => id));
  state.projects = state.projects.filter((project) => project.status !== 'abandoned' || retained.has(project.id) ||
    (project.settledTick !== undefined && project.settledTick + PAUSE_AFTER_ABANDONMENT > world.tick));
  return events;
}

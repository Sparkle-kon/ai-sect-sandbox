import type {
  Cultivator, LLMDecisionPayload, MortalSettlement, SettlementRecord, VillageCensusCount, VillageCensusMovement,
  VillageCensusObservation, VillageCensusPeriod, VillageCensusesState, WorldEvent, WorldState,
} from '../types/world';
import { activeEscortForActor } from './escortEngine';
import { householdCensus } from './householdEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { MORTAL_MATURITY_TICKS } from './reincarnationEngine';
import { activeRelocationForActor } from './relocationEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { currentVisibleTileIds, terrainTileAt } from './terrainEngine';
import { isTribulationActive } from './tribulationEngine';

export const VILLAGE_CENSUS_PERIOD_LIMIT = 6;
export interface VillageCensusOption { action: 'VILLAGE_CENSUS'; targetSettlementId: string }
export interface VillageCensusProjection {
  tick: number;
  year: number;
  month: number;
  villageId: string;
  closed: boolean;
  opening: VillageCensusCount;
  expected: VillageCensusCount;
  observed?: VillageCensusCount;
  residual?: { population: number; juveniles: number };
  births: number;
  matured: number;
  deaths: number;
  incoming: number;
  outgoing: number;
  enlisted: number;
  unobservedCrossings: number;
  observation?: VillageCensusObservation;
}

export const createVillageCensusesState = (): VillageCensusesState => ({ periods: [] });
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const states = (world: WorldState) => world.villageCensuses.periods;
const livePeriod = (world: WorldState) => states(world).at(-1)?.tick === world.tick ? states(world).at(-1) : undefined;
const present = (world: WorldState, actor?: Cultivator): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0 &&
  world.cultivators.find(({ id }) => id === actor.id) === actor);
const villageFor = (world: WorldState, id: string) => world.settlements.villages.find(village => village.id === id);

function count(village: MortalSettlement): VillageCensusCount {
  return { villageId: village.id, population: village.population, juveniles: village.juvenileCohorts.reduce((n, row) => n + row.count, 0) };
}

function snapshot(world: WorldState): VillageCensusCount[] {
  const locations = new Set(world.locations.map(({ id }) => id));
  return world.settlements.villages.filter(village => locations.has(village.locationId)).map(count)
    .sort((a, b) => compareId(a.villageId, b.villageId));
}

/** Opening belongs to the current world tick. Never recalculate it after a later real mutation. */
export function openVillageCensusPeriod(world: WorldState): VillageCensusPeriod {
  const current = livePeriod(world);
  if (current) return current;
  const period: VillageCensusPeriod = {
    tick: world.tick, year: world.year, month: world.month, opening: snapshot(world), movements: [], observations: [],
  };
  const periods = states(world);
  periods.push(period);
  while (periods[0].tick <= world.tick - VILLAGE_CENSUS_PERIOD_LIMIT || periods.length > VILLAGE_CENSUS_PERIOD_LIMIT) periods.shift();
  return period;
}

/** Read the actual ending inventory independently; no adjustment to the population is authorised. */
export function closeVillageCensusPeriod(world: WorldState): VillageCensusPeriod | undefined {
  const period = livePeriod(world);
  if (!period) return undefined;
  period.closing = snapshot(world);
  return period;
}

function append(period: VillageCensusPeriod, row: VillageCensusMovement) {
  if (period.movements.some(({ id }) => id === row.id) || !period.opening.some(({ villageId }) => villageId === row.villageId) ||
      row.targetVillageId !== undefined && !period.opening.some(({ villageId }) => villageId === row.targetVillageId)) return;
  period.movements.push(row);
  delete period.closing; // A known later valid mutation makes the previous same-tick close stale.
}

/** Copy evidence only from the canonical settlement transaction, not a WorldEvent or prose. */
export function recordVillageCensusSettlement(world: WorldState, record: SettlementRecord): void {
  const period = livePeriod(world);
  if (!period || record.tick !== world.tick || record.kind === 'relief' || !world.settlements.records.includes(record) ||
      !Number.isSafeInteger(record.people) || record.people < 1) return;
  const village = villageFor(world, record.settlementId);
  if (!village || !world.locations.some(({ id }) => id === village.locationId)) return;
  const row = { id: record.id, villageId: village.id, people: record.people };
  if (record.kind === 'growth') {
    if (!village.juvenileCohorts.some(({ bornTick, count: people }) => bornTick === world.tick && people === record.people)) return;
    append(period, { ...row, kind: 'birth', bornTick: world.tick });
  } else if (record.kind === 'disaster') {
    if (village.lastDisasterTick !== world.tick) return;
    append(period, { ...row, kind: 'death' });
  } else if (record.kind === 'migration') {
    const target = record.targetSettlementId && villageFor(world, record.targetSettlementId);
    if (!target || target === village || !world.locations.some(({ id }) => id === target.locationId)) return;
    append(period, { ...row, kind: 'migration', targetVillageId: target.id });
  } else if (record.kind === 'recruitment') {
    const { volunteerId, cultivatorId } = record;
    const volunteer = village.volunteers.find(({ id }) => id === volunteerId);
    const actor = world.cultivators.find(({ id }) => id === cultivatorId);
    if (village.lastRecruitTick !== world.tick || record.people !== 1 || !volunteerId || !cultivatorId ||
        cultivatorId !== `recruit-${volunteerId}` || volunteer?.enlistedCultivatorId !== cultivatorId ||
        !actor || actor.locationId !== village.locationId || actor.sectId !== record.sectId) return;
    append(period, { ...row, kind: 'enrollment', volunteerId, cultivatorId });
  }
}

/** The canonical caller passes precisely the cohort rows removed by the age filter. */
export function recordVillageCensusMaturation(world: WorldState, village: MortalSettlement,
  removedCohorts: readonly { bornTick: number; count: number }[]): void {
  const period = livePeriod(world);
  if (!period || !world.settlements.villages.includes(village)) return;
  for (const { bornTick, count: people } of removedCohorts) {
    if (!Number.isSafeInteger(bornTick) || bornTick < 0 || world.tick - bornTick < MORTAL_MATURITY_TICKS ||
        !Number.isSafeInteger(people) || people < 1 || village.juvenileCohorts.some(cohort => cohort.bornTick === bornTick)) continue;
    append(period, { id: `mature-${world.tick}-${village.id}-${bornTick}`, kind: 'maturation', villageId: village.id, people, bornTick });
  }
}

function onSite(world: WorldState, actor: Cultivator) {
  return world.locations.some(site => site.id === actor.locationId) && !pilgrimageCheckpoint(world, actor) &&
    !courierCheckpoint(world, actor) && !activeRelocationForActor(world, actor) &&
    !activeEscortForActor(world, actor) && !isTribulationActive(actor);
}

export function availableVillageCensusActions(actor: Cultivator, world: WorldState): VillageCensusOption[] {
  if (!present(world, actor) || !onSite(world, actor)) return [];
  const village = world.settlements.villages.find(({ locationId }) => locationId === actor.locationId);
  if (!village || livePeriod(world)?.observations.some(({ villageId }) => villageId === village.id)) return [];
  return [{ action: 'VILLAGE_CENSUS', targetSettlementId: village.id }];
}

/** The signed count is a visit-time view, never the end-of-tick closing value. */
export function resolveVillageCensusAction(world: WorldState, actor: Cultivator, payload: LLMDecisionPayload): WorldEvent | null {
  if (payload.chosenAction !== 'VILLAGE_CENSUS') return null;
  const option = availableVillageCensusActions(actor, world).find(item => item.targetSettlementId === payload.targetSettlementId);
  if (!option) return null;
  const village = villageFor(world, option.targetSettlementId)!;
  const group = householdCensus(world, village.id)?.groups.filter(item => item.adults + item.juveniles + item.namedResidents > 0)
    .sort((a, b) => compareId(a.id, b.id));
  // Select one existing register group, with a deterministic rotation across dated visits.
  const example = group?.length ? group[((world.random.seed + world.tick) >>> 0) % group.length] : undefined;
  const sample = example ? { householdId: example.id, adults: example.adults, juveniles: example.juveniles, namedResidents: example.namedResidents } : undefined;
  const observation: VillageCensusObservation = {
    villageId: village.id, observerId: actor.id, count: count(village), ...(sample ? { sample } : {}),
  };
  openVillageCensusPeriod(world).observations.push(observation);
  return {
    id: `evt-village-census-${world.tick}-${village.id}`, tick: world.tick, year: world.year, month: world.month,
    title: '当场清点村籍', description: '当场签记可观察的人口和一户抽查。抽查不外推；此时点不等同月末结账。',
    actorIds: [actor.id], locationId: village.locationId, category: 'diplomacy', witnessScope: 'participants',
  };
}

function visibleSettlements(world: WorldState, actor: Cultivator) {
  const tiles = currentVisibleTileIds(world, actor);
  const locations = new Map(world.locations.map(site => [site.id, site]));
  return new Set(world.settlements.villages.flatMap(village => {
    const site = locations.get(village.locationId);
    return site && tiles.has(terrainTileAt(world, site.x, site.y)?.id ?? '') ? [village.id] : [];
  }));
}

/** Observed local ledger only: migration across fog exposes no other endpoint identities or counts. */
export function projectVillageCensus(world: WorldState, viewer: Cultivator | undefined, villageId: string, tick: number): VillageCensusProjection | undefined {
  if (!present(world, viewer) || tick > world.tick) return undefined;
  const visible = visibleSettlements(world, viewer);
  if (!visible.has(villageId)) return undefined;
  const period = states(world).find(item => item.tick === tick);
  const opening = period?.opening.find(item => item.villageId === villageId);
  if (!period || !opening) return undefined;
  let births = 0, matured = 0, deaths = 0, incoming = 0, outgoing = 0, enlisted = 0, unobservedCrossings = 0;
  for (const row of period.movements) {
    if (row.kind === 'migration' && row.targetVillageId === villageId) {
      incoming += row.people;
      if (!visible.has(row.villageId)) unobservedCrossings += row.people;
    }
    if (row.villageId !== villageId) continue;
    if (row.kind === 'birth') births += row.people;
    else if (row.kind === 'maturation') matured += row.people;
    else if (row.kind === 'death') deaths += row.people;
    else if (row.kind === 'enrollment') enlisted += row.people;
    else {
      outgoing += row.people;
      if (row.targetVillageId && !visible.has(row.targetVillageId)) unobservedCrossings += row.people;
    }
  }
  const expected = { villageId, population: opening.population + births + incoming - outgoing - deaths - enlisted,
    juveniles: opening.juveniles + births - matured };
  const observed = period.closing?.find(item => item.villageId === villageId);
  const observation = period.observations.find(item => item.villageId === villageId && item.observerId === viewer.id);
  return {
    tick, year: period.year, month: period.month, villageId, closed: observed !== undefined, opening: { ...opening }, expected,
    ...(observed ? { observed: { ...observed }, residual: { population: observed.population - expected.population,
      juveniles: observed.juveniles - expected.juveniles } } : {}),
    births, matured, deaths, incoming, outgoing, enlisted, unobservedCrossings,
    ...(observation ? { observation: { ...observation, count: { ...observation.count },
      ...(observation.sample ? { sample: { ...observation.sample } } : {}) } } : {}),
  };
}

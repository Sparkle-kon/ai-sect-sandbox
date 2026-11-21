import { recordProbationRelief } from './probationEngine';
import { initializeHouseholds, matureHouseholdBirth, recordHouseholdBirth, recordHouseholdMigration, recordHouseholdMortality,
  recordHouseholdRecruitment, registerHouseholdVolunteer, retireHouseholdVolunteer } from './householdEngine';
import { attachRecollectionAfterRecruitment, MORTAL_MATURITY_TICKS, maturingReincarnationCases,
  pruneExpiredVolunteerEchoes, registerMaturedReincarnation, reserveReincarnationBirth } from './reincarnationEngine';
import type { Cultivator, LLMDecisionPayload, LocationNode, MortalSettlement, MortalVolunteer, ReincarnationCase, SettlementRecord, SettlementState, SpiritRoot, WorldEvent, WorldState } from '../types/world';
import { knownMapLocations, noteTerrainVisit, terrainTileAt } from './terrainEngine';

export const SETTLEMENT_RELIEF = { stones: 12, jade_leaf: 2 } as const;
export const SETTLEMENT_RECRUIT_STIPEND = 25;
export const SETTLEMENT_STRESS_LIMIT = 65;
export { MORTAL_MATURITY_TICKS } from './reincarnationEngine';
const MAX_NEW_VOLUNTEERS_PER_YEAR = 2;
const MAX_OUTSTANDING_VOLUNTEERS = 8;
const VOLUNTEER_OFFER_YEARS = 3;
const RETAIN_ENLISTED_PER_VILLAGE = 8;
const ROOTS: SpiritRoot[] = ['金', '木', '水', '火', '土', '雷', '暗'];
const FAMILY = ['沈', '许', '梁', '顾', '乔', '谢', '杜', '陆', '苏', '陈', '温', '林'];
const GIVEN = ['清禾', '怀安', '栖月', '照山', '雨桥', '兰舟', '闻竹', '云川'];
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const activeVolunteers = (village: MortalSettlement) => village.volunteers.filter((person) => !person.enlistedCultivatorId);
const youngCount = (village: MortalSettlement) => village.juvenileCohorts.reduce((sum, cohort) => sum + cohort.count, 0);
const adultCount = (village: MortalSettlement) => Math.max(0, village.population - youngCount(village));
const unregisteredAdults = (village: MortalSettlement) => Math.max(0, adultCount(village) - activeVolunteers(village).length);
const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);

export type SettlementOption =
  | { action: 'RECRUIT_SETTLER'; targetSettlementId: string; targetVolunteerId: string }
  | { action: 'DELIVER_RELIEF'; targetSettlementId: string; targetVolunteerId?: never };

function mixed(seed: number, key: string): number {
  let n = seed >>> 0;
  for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function createSettlementState(locations: LocationNode[], seed: number): SettlementState {
  const publicSites = locations.filter((site) => site.type === 'market').sort(byId).slice(0, 4);
  const frontier = locations.filter((site) => site.type === 'spirit_vein').sort(byId).slice(0, 3);
  const villages = [...publicSites, ...frontier].map((site): MortalSettlement => {
    const id = `village-${site.id}`;
    const base = mixed(seed, id);
    const population = 44 + base % 43;
    const volunteers: MortalVolunteer[] = Array.from({ length: 4 }, (_, i) => {
      const number = mixed(seed, `${id}-${i}`);
      return {
        id: `${id}-vol-${i + 1}`,
        name: FAMILY[number % FAMILY.length] + GIVEN[Math.floor(number / 13) % GIVEN.length],
        age: i === 0 ? 18 + number % 14 : 16 + number % 25,
        spiritRoot: ROOTS[Math.floor(number / 113) % ROOTS.length],
        aptitude: i === 0 ? 60 + number % 36 : 30 + number % 65,
        willingness: i === 0 ? 74 + number % 20 : 20 + number % 75,
      };
    });
    return { id, locationId: site.id, name: `${site.name}外村`, population, capacity: population + 18 + base % 13,
      stress: site.type === 'market' ? 5 + base % 10 : 18 + base % 18, volunteers, nextVolunteerSequence: 5, juvenileCohorts: [] };
  });
  return { villages, records: [] };
}

export function visibleSettlements(world: WorldState, actor?: Cultivator): MortalSettlement[] {
  const known = actor ? knownMapLocations(world, actor) : world.locations.filter((site) => site.type === 'market');
  const locations = new Set(known.map(({ id }) => id));
  return world.settlements.villages.filter((village) => locations.has(village.locationId)).sort(byId);
}

function consenting(village: MortalSettlement, person: MortalVolunteer): boolean {
  return !person.enlistedCultivatorId && person.age >= 18 && person.age <= 47 &&
    person.aptitude >= 58 && person.willingness - Math.floor(village.stress / 4) >= 62;
}

function sponsor(world: WorldState, actor: Cultivator) {
  if (!['长老', '太上长老', '掌门'].includes(actor.sectRank)) return undefined;
  return world.sects.find((sect) => sect.id === actor.sectId && sect.spiritStones >= SETTLEMENT_RECRUIT_STIPEND);
}

export function availableSettlementActions(actor: Cultivator, world: WorldState): SettlementOption[] {
  if (!live(actor) || world.cultivators.find(({ id }) => id === actor.id) !== actor) return [];
  if (!world.locations.some(({ id }) => id === actor.locationId)) return [];
  const village = world.settlements.villages.find(({ locationId }) => locationId === actor.locationId);
  if (!village || village.population <= 0) return [];
  const choices: SettlementOption[] = [];
  if (village.stress >= 15 && (village.lastReliefTick === undefined || world.tick >= village.lastReliefTick + 2) &&
      actor.spiritStones >= SETTLEMENT_RELIEF.stones && actor.herbs.jade_leaf >= SETTLEMENT_RELIEF.jade_leaf) {
    choices.push({ action: 'DELIVER_RELIEF', targetSettlementId: village.id });
  }
  if (village.stress < SETTLEMENT_STRESS_LIMIT && adultCount(village) > 0 && sponsor(world, actor) &&
      village.lastRecruitTick !== world.tick) {
    choices.push(...village.volunteers.filter((person) => consenting(village, person) &&
      !world.cultivators.some(({ id }) => id === `recruit-${person.id}`)).map((person): SettlementOption =>
      ({ action: 'RECRUIT_SETTLER', targetSettlementId: village.id, targetVolunteerId: person.id })));
  }
  return choices;
}

function log(world: WorldState, village: MortalSettlement, row: Omit<SettlementRecord, 'id' | 'tick' | 'settlementId'>,
  key: string, title: string): WorldEvent {
  const rowId = `settlement-${world.tick}-${row.kind}-${village.id}-${key}`;
  const actual: SettlementRecord = { ...row, id: rowId, tick: world.tick, settlementId: village.id };
  world.settlements.records.push(actual);
  world.settlements.records = world.settlements.records.slice(-96);
  if (actual.kind === 'relief') recordProbationRelief(world, actual);
  return { id: `evt-${rowId}`, tick: world.tick, year: world.year, month: world.month,
    title, description: row.description, actorIds: [row.actorId, row.cultivatorId].filter((id): id is string => Boolean(id)),
    locationId: village.locationId, category: 'diplomacy' };
}

function enlist(person: MortalVolunteer, actor: Cultivator, village: MortalSettlement): Cultivator {
  return {
    id: `recruit-${person.id}`, name: person.name, title: '新晋外门弟子', sectId: actor.sectId, sectRank: '外门弟子',
    contribution: 0, transgressions: 0, realm: '练气', realmStage: 1, qiProgress: 0,
    hp: 120, maxHp: 120, combatPower: 100, age: person.age, lifespan: 120, personality: '苟道',
    locationId: village.locationId, spiritStones: SETTLEMENT_RECRUIT_STIPEND, karma: 0,
    currentAction: 'REST', innerMonologue: '既已立意入门，便从根基修起。', secretGoal: '在自愿加入的宗门扎下根基',
    spiritRoot: person.spiritRoot, technique: { name: '入门吐纳诀', spiritRoot: person.spiritRoot },
    techniqueMastery: 0, herbs: { jade_leaf: 0, earth_root: 0, star_bloom: 0, shadow_moss: 0 },
    pills: { foundation: 0, golden: 0, barrier: 0, heart_poison: 0 }, pillToxicity: 0,
    exploredTileIds: [], artifacts: [], memories: [], coreMemories: [], memorySequence: 0, reflections: [], rumors: [], alive: true,
  };
}

export function resolveSettlementAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  const option = availableSettlementActions(actor, world).find((candidate) =>
    candidate.action === decision.chosenAction && candidate.targetSettlementId === decision.targetSettlementId &&
    candidate.targetVolunteerId === decision.targetVolunteerId);
  if (!option) return null;
  const village = world.settlements.villages.find(({ id }) => id === option.targetSettlementId)!;
  if (option.action === 'DELIVER_RELIEF') {
    actor.spiritStones -= SETTLEMENT_RELIEF.stones;
    actor.herbs.jade_leaf -= SETTLEMENT_RELIEF.jade_leaf;
    village.stress = clamp(village.stress - 24);
    village.lastReliefTick = world.tick;
    for (const volunteer of activeVolunteers(village)) volunteer.willingness = clamp(volunteer.willingness + 7);
    return log(world, village, { kind: 'relief', actorId: actor.id, sectId: actor.sectId || undefined,
      people: 0, stones: SETTLEMENT_RELIEF.stones, herbs: SETTLEMENT_RELIEF.jade_leaf,
      description: `${actor.name}向${village.name}提供赈济，灾困缓和，已消耗${SETTLEMENT_RELIEF.stones}灵石、${SETTLEMENT_RELIEF.jade_leaf}份翡翠灵叶。` },
    actor.id, '凡村赈济');
  }
  const sect = sponsor(world, actor)!;
  const person = village.volunteers.find(({ id }) => id === option.targetVolunteerId)!;
  initializeHouseholds(world);
  const recruit = enlist(person, actor, village);
  sect.spiritStones -= SETTLEMENT_RECRUIT_STIPEND;
  village.population--;
  village.lastRecruitTick = world.tick;
  person.enlistedCultivatorId = recruit.id;
  world.cultivators.push(recruit);
  recordHouseholdRecruitment(world, village, person, recruit);
  noteTerrainVisit(world, recruit);
  attachRecollectionAfterRecruitment(world, village, person.id, recruit);
  return log(world, village, { kind: 'recruitment', actorId: actor.id, sectId: sect.id, volunteerId: person.id,
    cultivatorId: recruit.id, people: 1, stones: SETTLEMENT_RECRUIT_STIPEND, herbs: 0,
    description: `${village.name}成年志愿者${person.name}自愿加入${sect.name}，坊籍减一；宗门发放${SETTLEMENT_RECRUIT_STIPEND}灵石安置费。` },
  person.id, '凡人自愿入门');
}


function annualCohort(world: WorldState, village: MortalSettlement, stressedByHazard: boolean, matured: ReincarnationCase[]): WorldEvent | undefined {
  if (world.tick <= 1 || world.month !== 1 || village.lastCohortYear === world.year) return undefined;
  village.lastCohortYear = world.year;

  const referenced = new Set(world.settlements.records.filter(({ settlementId }) => settlementId === village.id)
    .flatMap(({ volunteerId }) => volunteerId ? [volunteerId] : []));
  const latestEnlisted = new Set(village.volunteers.filter((person) => person.enlistedCultivatorId)
    .slice(-RETAIN_ENLISTED_PER_VILLAGE).map(({ id }) => id));
  village.volunteers = village.volunteers.filter((person) => {
    if (person.enlistedCultivatorId) return latestEnlisted.has(person.id) || referenced.has(person.id);
    person.age = Math.min(120, person.age + 1);
    person.cohortYear ??= world.year - 1;
    const stillListed = world.year - person.cohortYear < VOLUNTEER_OFFER_YEARS && person.age <= 47;
    if (!stillListed) retireHouseholdVolunteer(world, village, person);
    return stillListed;
  });
  pruneExpiredVolunteerEchoes(world, village);
  const cannotRegister = stressedByHazard || village.stress >= SETTLEMENT_STRESS_LIMIT;
  for (const item of matured) {
    if (cannotRegister || activeVolunteers(village).length >= MAX_OUTSTANDING_VOLUNTEERS || unregisteredAdults(village) <= 0) {
      registerMaturedReincarnation(world, item, village);
      continue;
    }
    const id = `${village.id}-vol-${village.nextVolunteerSequence++}`;
    const number = mixed(world.random.seed, id);
    village.volunteers.push({ id, cohortYear: world.year, name: FAMILY[number % FAMILY.length] + GIVEN[Math.floor(number / 13) % GIVEN.length],
      age: 18, spiritRoot: ROOTS[Math.floor(number / 113) % ROOTS.length], aptitude: 60 + number % 35, willingness: 68 + number % 30 });
    registerHouseholdVolunteer(world, village, village.volunteers.at(-1)!);
    registerMaturedReincarnation(world, item, village, id);
  }
  if (cannotRegister) return undefined;

  // Candidates are existing, previously unregistered adults; recruiting removes one from the village.
  // New children are tracked independently for a full 18 years and never counted in this supply early.
  const yearlySlots = village.stress < 24 ? MAX_NEW_VOLUNTEERS_PER_YEAR : 1;
  const availableSlots = Math.max(0, Math.min(yearlySlots - matured.filter(({ status }) => status === 'volunteer').length, MAX_OUTSTANDING_VOLUNTEERS - activeVolunteers(village).length, unregisteredAdults(village)));
  for (let slot = 0; slot < availableSlots; slot++) {
    const sequence = village.nextVolunteerSequence++;
    const id = `${village.id}-vol-${sequence}`;
    const number = mixed(world.random.seed, id);
    village.volunteers.push({
      id, cohortYear: world.year, name: FAMILY[number % FAMILY.length] + GIVEN[Math.floor(number / 13) % GIVEN.length],
      age: 18 + number % 23, spiritRoot: ROOTS[Math.floor(number / 113) % ROOTS.length],
      aptitude: 60 + number % 35, willingness: 79 + number % 20,
    });
    registerHouseholdVolunteer(world, village, village.volunteers.at(-1)!);
  }

  // A village needs an adult community; empty or severely distressed settlements cannot create residents.
  const annualBirths = village.stress < 24 ? 3 : village.stress < 45 ? 2 : 1;
  const count = adultCount(village) >= 2 ? Math.min(annualBirths, village.capacity - village.population) : 0;
  if (count <= 0) return undefined;
  village.population += count;
  village.juvenileCohorts.push({ bornTick: world.tick, count });
  recordHouseholdBirth(world, village, world.tick, count);
  reserveReincarnationBirth(world, village, world.tick);
  return log(world, village, { kind: 'growth', people: count, stones: 0, herbs: 0,
    description: `${village.name}今年新生${count}人，纳入未成年坊籍，成年前不计入招募人选。` }, 'births', '凡村人口添丁');
}

export function advanceSettlements(world: WorldState): WorldEvent[] {
  const state = world.settlements;
  if (state.lastAdvancedTick !== undefined && world.tick <= state.lastAdvancedTick) return [];
  state.lastAdvancedTick = world.tick;
  initializeHouseholds(world);
  const events: WorldEvent[] = [];
  const villages = state.villages.filter(({ locationId }) => world.locations.some(({ id }) => id === locationId)).sort(byId);
  for (const village of villages) {
    const matured = maturingReincarnationCases(world, village);
    village.juvenileCohorts = village.juvenileCohorts.filter(({ bornTick }) => {
      if (world.tick - bornTick < MORTAL_MATURITY_TICKS) return true;
      matureHouseholdBirth(world, village, bornTick);
      return false;
    });
    const location = world.locations.find(({ id }) => id === village.locationId)!;
    const tile = terrainTileAt(world, location.x, location.y);
    const hazard = tile && world.mapHazards.filter((item) =>
      item.tileId === tile.id && item.createdTick <= world.tick && world.tick < item.expiresTick && item.intensity >= 1)
      .sort((a, b) => b.intensity - a.intensity || byId(a, b))[0];
    if (hazard && (village.lastDisasterTick === undefined || world.tick - village.lastDisasterTick >= 3)) {
      const stress = 12 + Math.min(24, hazard.intensity * 7);
      // Population includes the named volunteers: do not silently kill a tracked individual.
      const deaths = Math.min(Math.max(0, unregisteredAdults(village) - matured.length),
        Math.min(5, Math.floor(hazard.intensity) + (hazard.kind === 'meteor' ? 1 : 0)));
      village.population -= deaths;
      recordHouseholdMortality(world, village, deaths);
      village.stress = clamp(village.stress + stress);
      village.lastDisasterTick = world.tick;
      for (const person of activeVolunteers(village)) person.willingness = clamp(person.willingness - 4);
      events.push(log(world, village, { kind: 'disaster', people: deaths, stones: 0, herbs: 0,
        description: `${village.name}受地脉灾害冲击，死亡${deaths}人，现有${village.population}人。` }, hazard.id, '凡村灾情'));
    } else if (!hazard && world.tick % 3 === 0) {
      village.stress = clamp(village.stress - 1);
    }
    const growth = annualCohort(world, village, Boolean(hazard), matured);
    if (growth) events.push(growth);
  }
  if (world.tick % 3 !== 0) return events;
  // A given village can send or receive once in a migration round. Population is transferred, never minted.
  const involved = new Set<string>();
  for (const origin of villages) {
    if (involved.has(origin.id) || origin.stress < 45 || origin.population <= 1) continue;
    const destination = villages.filter((target) => target.id !== origin.id && !involved.has(target.id) &&
      target.population < target.capacity && target.stress + 20 <= origin.stress)
      .sort((a, b) => a.stress - b.stress || byId(a, b))[0];
    if (!destination) continue;
    const people = Math.min(4, unregisteredAdults(origin), destination.capacity - destination.population);
    // Ordinary residents migrate as a cohort; named candidate records remain at their home village.
    if (people <= 0) continue;
    origin.population -= people;
    destination.population += people;
    recordHouseholdMigration(world, origin, destination, people);
    involved.add(origin.id);
    involved.add(destination.id);
    events.push(log(world, origin, { kind: 'migration', targetSettlementId: destination.id, people, stones: 0, herbs: 0,
      description: `${people}名乡民从${origin.name}迁至压力更低、仍有余位的村落。` }, destination.id, '凡人迁居'));
  }
  return events;
}

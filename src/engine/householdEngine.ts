import type { Cultivator, HouseholdGuardianship, HouseholdGuardianMove, HouseholdMember, HouseholdPresence, HouseholdState, LLMDecisionPayload,
  MortalHousehold, MortalSettlement, MortalVolunteer, WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { knownMapLocations } from './terrainEngine';

export const HOUSEHOLD_GUARDIAN_OFFER_TICKS = 4;
const GUARDIAN_HISTORY = 64;
const RETIRED_HISTORY = 48;
const CHOICES_PER_ACTOR = 3;

export interface HouseholdCensusGroup {
  id: string;
  branch: MortalHousehold['branch'];
  adults: number;
  juveniles: number;
  namedResidents: number;
  births: number;
  matured: number;
  migratedIn: number;
  migratedOut: number;
  deaths: number;
}
export interface HouseholdCensus {
  settlementId: string;
  population: number;
  adults: number;
  juveniles: number;
  namedResidents: number;
  unassigned: number;
  groups: HouseholdCensusGroup[];
}
export interface HouseholdView {
  censuses: HouseholdCensus[];
  ownMembership?: HouseholdMember;
  guardianContracts: HouseholdGuardianship[];
}
export interface HouseholdGuardianOption {
  action: 'HOUSEHOLD_GUARDIAN';
  guardianMove: HouseholdGuardianMove;
  targetCultivatorId?: string;
  targetGuardianshipId?: string;
}

export const createHouseholdState = (): HouseholdState => ({ groups: [], members: [], guardianships: [], nextId: 1 });
const living = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const ageReady = (actor: Cultivator | undefined): actor is Cultivator => living(actor) && actor.age >= 18;
const findActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const present = (world: WorldState, actor: Cultivator | undefined, siteId: string): actor is Cultivator =>
  ageReady(actor) && actor.locationId === siteId && world.locations.some(({ id }) => id === siteId) && !pilgrimageCheckpoint(world, actor) &&
    !world.escorts.contracts.some((deal) => deal.escortId === actor.id && deal.status === 'active') &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';

function ensurePresence(group: MortalHousehold, settlementId: string): HouseholdPresence {
  const row = group.presences.find((value) => value.settlementId === settlementId);
  if (row) return row;
  const created: HouseholdPresence = { settlementId, adults: 0, juvenileCohorts: [], births: 0, matured: 0, migratedIn: 0, migratedOut: 0, deaths: 0 };
  group.presences.push(created);
  return created;
}

function atVillage(world: WorldState, settlementId: string) {
  return world.households.groups.flatMap((group) => {
    const row = group.presences.find((item) => item.settlementId === settlementId);
    return row ? [{ group, row }] : [];
  }).sort((a, b) => a.group.id.localeCompare(b.group.id));
}
const cohortCount = (row: HouseholdPresence) => row.juvenileCohorts.reduce((sum, cohort) => sum + cohort.count, 0);
const namedLocal = (world: WorldState, settlementId: string) => world.households.members.filter((person) =>
  person.settlementId === settlementId && person.status === 'resident');
const adultsBudget = (village: MortalSettlement) => Math.max(0, village.population -
  village.juvenileCohorts.reduce((sum, row) => sum + row.count, 0) - village.volunteers.filter((person) => !person.enlistedCultivatorId).length);

/** Derive sparse register groups from people already counted, never from surname or supposed biological parentage. */
export function initializeHouseholds(world: WorldState): void {
  // Existing imports initialize lazily at the first authoritative demographic operation.
  for (const village of world.settlements.villages) {
    if (world.households.groups.some((group) => group.originSettlementId === village.id)) continue;
    const groups = (['first', 'second'] as const).map((branch): MortalHousehold => ({
      id: `household-${village.id}-${branch}`, originSettlementId: village.id, branch, createdTick: world.tick, presences: [],
    }));
    const [a, b] = groups.map((group) => ensurePresence(group, village.id));
    const adults = adultsBudget(village);
    a.adults = Math.ceil(adults / 2);
    b.adults = adults - a.adults;
    for (const cohort of village.juvenileCohorts) {
      const first = Math.ceil(cohort.count / 2);
      if (first) a.juvenileCohorts.push({ bornTick: cohort.bornTick, count: first });
      if (cohort.count > first) b.juvenileCohorts.push({ bornTick: cohort.bornTick, count: cohort.count - first });
    }
    [...village.volunteers].sort((left, right) => left.id.localeCompare(right.id)).forEach((volunteer, index) => {
      const enrolled = volunteer.enlistedCultivatorId ? findActor(world, volunteer.enlistedCultivatorId) : undefined;
      // An old disposable or not-yet-materialized roster entry is not proof of anyone joining the cultivator world.
      if (volunteer.enlistedCultivatorId && !enrolled) return;
      world.households.members.push({ volunteerId: volunteer.id, householdId: groups[index % 2].id, settlementId: village.id,
        registeredTick: world.tick, status: enrolled ? (living(enrolled) ? 'recruited' : 'deceased') : 'resident',
        ...(enrolled ? { recruitedId: enrolled.id, settledTick: world.tick } : {}) });
    });
    world.households.groups.push(...groups);
  }
}

export function householdCensus(world: WorldState, settlementId: string): HouseholdCensus | undefined {
  const village = world.settlements.villages.find(({ id }) => id === settlementId);
  if (!village) return undefined;
  const members = namedLocal(world, settlementId);
  const groups = atVillage(world, settlementId).map(({ group, row }): HouseholdCensusGroup => ({
    id: group.id, branch: group.branch, adults: row.adults, juveniles: cohortCount(row),
    namedResidents: members.filter(({ householdId }) => householdId === group.id).length,
    births: row.births, matured: row.matured, migratedIn: row.migratedIn, migratedOut: row.migratedOut, deaths: row.deaths,
  }));
  const adults = groups.reduce((sum, row) => sum + row.adults, 0);
  const juveniles = groups.reduce((sum, row) => sum + row.juveniles, 0);
  const namedResidents = members.length;
  return { settlementId, population: village.population, adults, juveniles, namedResidents,
    unassigned: Math.max(0, village.population - adults - juveniles - namedResidents), groups };
}

export function visibleHouseholds(world: WorldState, viewer?: Cultivator): HouseholdView {
  const actor = viewer && findActor(world, viewer.id);
  if (!actor) return { censuses: [], guardianContracts: [] };
  const membership = world.households.members.find((row) => row.recruitedId === actor.id && row.registeredTick <= world.tick);
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  const censuses = world.settlements.villages.filter((village) => known.has(village.locationId))
    .flatMap((village) => householdCensus(world, village.id) ?? []);
  const guardianContracts = world.households.guardianships.filter((row) => (row.guardianId === actor.id || row.wardId === actor.id) &&
    row.openedTick <= world.tick).map((row) => ({ ...row }));
  return { censuses, ...(membership ? { ownMembership: { ...membership } } : {}), guardianContracts };
}

/** These hooks attribute the original settlement transaction only. Never change population or the NPC roster here. */
export function recordHouseholdBirth(world: WorldState, village: MortalSettlement, bornTick: number, count: number): void {
  if (bornTick !== world.tick || count <= 0 || !village.juvenileCohorts.some((row) => row.bornTick === bornTick && row.count === count)) return;
  const all = atVillage(world, village.id);
  if (!all.length || all.some(({ row }) => row.juvenileCohorts.some((cohort) => cohort.bornTick === bornTick))) return;
  const registered = new Set(namedLocal(world, village.id).map(({ householdId }) => householdId));
  const eligible = all.filter(({ row, group }) => row.adults > 0 || registered.has(group.id));
  const homes = eligible.length ? eligible : all;
  for (const [index, { row }] of homes.entries()) {
    const assigned = Math.floor(count / homes.length) + Number(index < count % homes.length);
    if (!assigned) continue;
    row.juvenileCohorts.push({ bornTick, count: assigned });
    row.births += assigned;
  }
}

export function matureHouseholdBirth(world: WorldState, village: MortalSettlement, bornTick: number): void {
  for (const { row } of atVillage(world, village.id)) {
    const available = row.juvenileCohorts.find(({ bornTick: birth }) => birth === bornTick);
    if (!available) continue;
    row.adults += available.count;
    row.matured += available.count;
    row.juvenileCohorts = row.juvenileCohorts.filter(({ bornTick: birth }) => birth !== bornTick);
  }
}

export function retireHouseholdVolunteer(world: WorldState, village: MortalSettlement, volunteer: MortalVolunteer): void {
  const member = world.households.members.find((row) => row.volunteerId === volunteer.id && row.settlementId === village.id && row.status === 'resident');
  const group = member && world.households.groups.find(({ id }) => id === member.householdId);
  if (!member || !group || volunteer.enlistedCultivatorId) return;
  ensurePresence(group, village.id).adults++;
  member.status = 'retired';
  member.settledTick = world.tick;
}

export function registerHouseholdVolunteer(world: WorldState, village: MortalSettlement, volunteer: MortalVolunteer): void {
  if (!village.volunteers.includes(volunteer) || volunteer.enlistedCultivatorId ||
      world.households.members.some(({ volunteerId }) => volunteerId === volunteer.id)) return;
  const homes = atVillage(world, village.id).sort((a, b) => b.row.adults - a.row.adults || a.group.id.localeCompare(b.group.id));
  const real = homes.find(({ row }) => row.adults > 0);
  if (!real) return;
  real.row.adults--;
  world.households.members.push({ volunteerId: volunteer.id, householdId: real.group.id, settlementId: village.id,
    registeredTick: world.tick, status: 'resident' });
}

export function recordHouseholdRecruitment(world: WorldState, village: MortalSettlement, volunteer: MortalVolunteer, recruit: Cultivator): void {
  if (volunteer.enlistedCultivatorId !== recruit.id || recruit.id !== `recruit-${volunteer.id}` || !world.cultivators.includes(recruit)) return;
  const member = world.households.members.find((row) => row.volunteerId === volunteer.id && row.settlementId === village.id && row.status === 'resident');
  if (!member) return;
  member.status = 'recruited';
  member.recruitedId = recruit.id;
  member.settledTick = world.tick;
}

function withdrawAnonymous(world: WorldState, settlementId: string, count: number, apply: (group: MortalHousehold, row: HouseholdPresence, people: number) => void): void {
  let remaining = count;
  for (const { group, row } of atVillage(world, settlementId).sort((a, b) => b.row.adults - a.row.adults || a.group.id.localeCompare(b.group.id))) {
    const people = Math.min(remaining, row.adults);
    if (people < 1) break;
    row.adults -= people;
    apply(group, row, people);
    remaining -= people;
  }
}

export function recordHouseholdMortality(world: WorldState, village: MortalSettlement, count: number): void {
  withdrawAnonymous(world, village.id, count, (_group, row, people) => { row.deaths += people; });
}
export function recordHouseholdMigration(world: WorldState, from: MortalSettlement, to: MortalSettlement, count: number): void {
  if (from.id === to.id) return;
  withdrawAnonymous(world, from.id, count, (group, row, people) => {
    const destination = ensurePresence(group, to.id);
    row.migratedOut += people;
    destination.adults += people;
    destination.migratedIn += people;
  });
}

const pending = (world: WorldState, row: HouseholdGuardianship) => row.status === 'offered' &&
  row.openedTick <= world.tick && row.expiresTick > world.tick;
const active = (world: WorldState, row: HouseholdGuardianship) => row.status === 'active' &&
  (row.acceptedTick ?? Infinity) <= world.tick;
const belongs = (row: HouseholdGuardianship, id: string) => row.guardianId === id || row.wardId === id;
const guardianshipTarget = (world: WorldState, wardId: string): HouseholdMember | undefined => world.households.members.find((row) =>
  row.recruitedId === wardId && row.status === 'recruited');

function validPair(world: WorldState, guardian: Cultivator, ward: Cultivator, except?: HouseholdGuardianship): boolean {
  if (guardian.id === ward.id || !present(world, guardian, guardian.locationId) || !present(world, ward, guardian.locationId)) return false;
  const edges = world.households.guardianships.filter((row) => row !== except && (active(world, row) || pending(world, row)));
  if (edges.some((row) => row.wardId === ward.id || row.guardianId === guardian.id)) return false;
  // Edges are one-out, one-in. A new guardian cannot already descend from the proposed ward.
  let next = ward.id;
  const visited = new Set<string>();
  while (!visited.has(next)) {
    if (next === guardian.id) return false;
    visited.add(next);
    const edge = edges.find((row) => row.guardianId === next);
    if (!edge) return true;
    next = edge.wardId;
  }
  return false;
}

export function availableGuardianActions(actor: Cultivator, world: WorldState, includeOffers = true): HouseholdGuardianOption[] {
  if (!ageReady(actor)) return [];
  const actions: HouseholdGuardianOption[] = [];
  const add = (guardianMove: HouseholdGuardianMove, row: HouseholdGuardianship) =>
    actions.push({ action: 'HOUSEHOLD_GUARDIAN', guardianMove, targetGuardianshipId: row.id });
  for (const row of world.households.guardianships) {
    if (!belongs(row, actor.id)) continue;
    if (active(world, row)) add('renounce', row);
    else if (pending(world, row)) {
      if (row.wardId !== actor.id) { add('renounce', row); continue; }
      add('decline', row);
      const guardian = findActor(world, row.guardianId);
      if (guardian && guardianshipTarget(world, actor.id)?.householdId === row.householdId && validPair(world, guardian, actor, row)) add('accept', row);
    }
  }
  if (!includeOffers || !present(world, actor, actor.locationId) || world.households.guardianships.some((row) =>
    row.guardianId === actor.id && (active(world, row) || pending(world, row)))) return actions;
  const wards = new Set(world.households.members.filter((row) => row.status === 'recruited').flatMap((row) => row.recruitedId ?? []));
  if (!wards.size) return actions;
  let available = 0;
  for (const target of world.cultivators) {
    if (target.locationId !== actor.locationId || !wards.has(target.id) || !validPair(world, actor, target)) continue;
    actions.push({ action: 'HOUSEHOLD_GUARDIAN', guardianMove: 'offer', targetCultivatorId: target.id });
    if (++available >= CHOICES_PER_ACTOR) break;
  }
  return actions;
}

function event(world: WorldState, row: HouseholdGuardianship, stage: string, title: string, description: string): WorldEvent {
  return { id: `evt-${row.id}-${stage}-${world.tick}`, actorIds: [row.guardianId, row.wardId], title, description, tick: world.tick,
    year: world.year, month: world.month, category: 'diplomacy', witnessScope: 'participants' };
}

export function resolveGuardianAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'HOUSEHOLD_GUARDIAN' || !world.cultivators.includes(actor)) return null;
  const option = availableGuardianActions(actor, world, decision.guardianMove === 'offer').find((row) =>
    row.guardianMove === decision.guardianMove && row.targetCultivatorId === decision.targetCultivatorId &&
    row.targetGuardianshipId === decision.targetGuardianshipId);
  if (!option) return null;
  const state = world.households;
  if (option.guardianMove === 'offer') {
    const wardId = option.targetCultivatorId!;
    const row: HouseholdGuardianship = { id: `household-guardian-${state.nextId++}`, householdId: guardianshipTarget(world, wardId)!.householdId,
      guardianId: actor.id, wardId, openedTick: world.tick, expiresTick: world.tick + HOUSEHOLD_GUARDIAN_OFFER_TICKS, status: 'offered' };
    state.guardianships.push(row);
    return event(world, row, 'offer', '成年人自愿提出监护', '仅邀请；没有改变亲缘、地籍或宗门身份。');
  }
  const row = state.guardianships.find(({ id }) => id === option.targetGuardianshipId)!;
  if (option.guardianMove === 'accept') {
    row.status = 'active';
    row.acceptedTick = world.tick;
    return event(world, row, 'accept', '成年受护者明确同意', '经本人同意登记照应关系，不凭此推定生身亲缘。');
  }
  const declined = option.guardianMove === 'decline';
  row.status = declined ? 'declined' : 'renounced';
  row.settledTick = world.tick;
  row.endReason = declined ? 'declined' : 'renounced';
  return event(world, row, row.status, declined ? '本人谢绝监护邀约' : '自愿终止监护', '解除关系不更改出身簿、人口或宗籍。');
}

export function advanceHouseholds(world: WorldState): WorldEvent[] {
  const state = world.households;
  const events: WorldEvent[] = [];
  if (!state.members.length && !state.guardianships.length) return events;
  const people = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  for (const member of state.members) {
    if (member.status !== 'recruited' || !member.recruitedId) continue;
    const recruited = people.get(member.recruitedId);
    if (recruited && !living(recruited)) {
      member.status = 'deceased';
      member.settledTick = world.tick;
    }
  }
  for (const row of state.guardianships) {
    if (row.status !== 'offered' && row.status !== 'active') continue;
    const guardian = people.get(row.guardianId), ward = people.get(row.wardId);
    if ((guardian && !living(guardian)) || (ward && !living(ward))) {
      row.status = 'ended'; row.endReason = 'death';
    } else if (row.status === 'offered' && row.expiresTick <= world.tick) {
      row.status = 'expired'; row.endReason = 'expiry';
    } else continue;
    row.settledTick = world.tick;
    events.push(event(world, row, 'closed', '监护登记终止', row.endReason === 'death' ? '实际参与者陨落，不再保留有效监护。' : '限期未获本人同意。'));
  }
  const retired = new Set(state.members.filter((row) => row.status === 'retired').slice(-RETIRED_HISTORY).map(({ volunteerId }) => volunteerId));
  state.members = state.members.filter((row) => row.status !== 'retired' || retired.has(row.volunteerId));
  const closed = new Set(state.guardianships.filter((row) => row.status !== 'offered' && row.status !== 'active')
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-GUARDIAN_HISTORY).map(({ id }) => id));
  state.guardianships = state.guardianships.filter((row) => row.status === 'offered' || row.status === 'active' || closed.has(row.id));
  return events;
}

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceHouseholds, availableGuardianActions, createHouseholdState, HOUSEHOLD_GUARDIAN_OFFER_TICKS, householdCensus,
  initializeHouseholds, resolveGuardianAction, visibleHouseholds } from '../src/engine/householdEngine';
import { advanceSettlements, availableSettlementActions, MORTAL_MATURITY_TICKS, resolveSettlementAction } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, HouseholdGuardianMove, MortalSettlement, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(7041);
  world.households = createHouseholdState();
  initializeHouseholds(world);
  const village = world.settlements.villages[0];
  const [sect] = world.sects;
  const guardian = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  guardian.age = Math.max(18, guardian.age);
  guardian.locationId = village.locationId;
  const guard = (actor: Cultivator, guardianMove: HouseholdGuardianMove, id: string) => resolveGuardianAction(world, actor, {
    chosenAction: 'HOUSEHOLD_GUARDIAN', guardianMove, innerMonologue: '本人与对方分别同意',
    ...(guardianMove === 'offer' ? { targetCultivatorId: id } : { targetGuardianshipId: id }),
  });
  return { world, village, guardian, guard };
}

function reconcile(world: WorldState, village: MortalSettlement) {
  const census = householdCensus(world, village.id)!;
  expect(census.adults + census.juveniles + census.namedResidents).toBe(village.population);
  expect(census.namedResidents).toBe(village.volunteers.filter((person) => !person.enlistedCultivatorId).length);
  expect(census.juveniles).toBe(village.juvenileCohorts.reduce((sum, row) => sum + row.count, 0));
  expect(census.unassigned).toBe(0);
  return census;
}

function recruit(world: WorldState, actor: Cultivator, village: MortalSettlement) {
  actor.locationId = village.locationId;
  const choice = availableSettlementActions(actor, world).find((row) => row.action === 'RECRUIT_SETTLER');
  if (!choice) return undefined;
  const before = village.population;
  const startingActors = world.cultivators.length;
  const enrolled = resolveSettlementAction(world, actor, { chosenAction: 'RECRUIT_SETTLER',
    targetSettlementId: choice.targetSettlementId, targetVolunteerId: choice.targetVolunteerId, innerMonologue: '只招自愿的成年人' });
  expect(enrolled).not.toBeNull();
  expect(village.population).toBe(before - 1);
  expect(world.cultivators.length).toBe(startingActors + 1);
  return world.cultivators.at(-1);
}

describe('household group attribution and original settlement conservation', () => {
  it('initializes only existing counted people, attributes actual annual births and matures the exact group count once', () => {
    const { world, village } = fixture();
    for (const settlement of world.settlements.villages) reconcile(world, settlement);
    const initialPopulation = village.population;
    const initialCast = world.cultivators.length;
    const groups = world.households.groups.length;
    initializeHouseholds(world);
    expect(world.households.groups).toHaveLength(groups);
    village.stress = 0;
    world.tick = 13;
    world.year += 1;
    world.month = 1;
    expect(advanceSettlements(world).some(({ title }) => title === '凡村人口添丁')).toBe(true);
    const cohort = village.juvenileCohorts[0];
    expect(cohort.count).toBeGreaterThan(0);
    expect(village.population).toBe(initialPopulation + cohort.count);
    expect(reconcile(world, village).groups.reduce((sum, row) => sum + row.births, 0)).toBe(cohort.count);
    expect(advanceSettlements(world)).toEqual([]);
    expect(world.cultivators).toHaveLength(initialCast);
    world.month = 2;
    world.tick = cohort.bornTick + MORTAL_MATURITY_TICKS - 1;
    advanceSettlements(world);
    expect(reconcile(world, village).juveniles).toBe(cohort.count);
    world.tick++;
    advanceSettlements(world);
    const matured = reconcile(world, village);
    expect(matured.juveniles).toBe(0);
    expect(matured.groups.reduce((sum, row) => sum + row.matured, 0)).toBe(cohort.count);
    expect(village.population).toBe(initialPopulation + cohort.count);
    expect(world.cultivators).toHaveLength(initialCast);
  });

  it('attributes real unnamed deaths and carries group membership through actual migration without new people', () => {
    const { world, village } = fixture();
    const total = () => world.settlements.villages.reduce((sum, row) => sum + row.population, 0);
    const startingPopulation = total();
    const site = world.locations.find(({ id }) => id === village.locationId)!;
    const tile = terrainTileAt(world, site.x, site.y)!;
    world.tick = 14;
    world.month = 2;
    world.mapHazards.push({ id: 'household-traced-meteor', tileId: tile.id, kind: 'meteor', createdTick: world.tick, expiresTick: world.tick + 1, intensity: 2 });
    advanceSettlements(world);
    const mortality = world.settlements.records.find((row) => row.kind === 'disaster' && row.settlementId === village.id)!;
    expect(mortality.people).toBeGreaterThan(0);
    expect(total()).toBe(startingPopulation - mortality.people);
    expect(reconcile(world, village).groups.reduce((sum, row) => sum + row.deaths, 0)).toBe(mortality.people);
    const beforeMigration = total();
    village.stress = 90;
    world.tick++;
    advanceSettlements(world);
    const migration = world.settlements.records.find((row) => row.kind === 'migration' && row.settlementId === village.id)!;
    expect(migration.people).toBeGreaterThan(0);
    expect(total()).toBe(beforeMigration);
    expect(reconcile(world, village).groups.reduce((sum, row) => sum + row.migratedOut, 0)).toBe(migration.people);
    const destination = world.settlements.villages.find(({ id }) => id === migration.targetSettlementId)!;
    expect(reconcile(world, destination).groups.filter((row) => row.migratedIn > 0)).toEqual(
      expect.arrayContaining([expect.objectContaining({ migratedIn: migration.people })]));
  });

  it('keeps an actual recruit as the original registered volunteer across unlimited ongoing recruitment', () => {
    const { world, guardian, village } = fixture();
    const startingCast = world.cultivators.length;
    const first = recruit(world, guardian, village)!;
    expect(first).toBeDefined();
    expect(visibleHouseholds(world, first).ownMembership).toMatchObject({ recruitedId: first.id, settlementId: village.id, status: 'recruited' });
    for (let year = 1; year <= 24; year++) {
      world.tick = 1 + year * 12;
      world.year = year + 1;
      world.month = 1;
      for (const settlement of world.settlements.villages) settlement.stress = 0;
      world.sects[0].spiritStones = 1000;
      advanceSettlements(world);
      for (const community of world.settlements.villages) {
        recruit(world, guardian, community);
        reconcile(world, community);
      }
      advanceHouseholds(world);
    }
    expect(world.cultivators.length).toBeGreaterThan(startingCast + 48);
    expect(new Set(world.cultivators.map(({ id }) => id)).size).toBe(world.cultivators.length);
    expect(visibleHouseholds(world, first).ownMembership).toMatchObject({ recruitedId: first.id, status: 'recruited' });
  });

  it('accepts and ends only independently consented adult guardian roles without conferring clan or sect rights', () => {
    const { world, village, guardian, guard } = fixture();
    const ward = recruit(world, guardian, village)!;
    expect(ward).toBeDefined();
    const third = world.cultivators.find((row) => row.id !== ward.id && row.id !== guardian.id)!;
    const people = village.population;
    const identity = [ward.sectId, ward.sectRank, ward.spiritStones];
    const actualHousehold = visibleHouseholds(world, ward).ownMembership!.householdId;
    expect(guard(third, 'offer', third.id)).toBeNull();
    expect(guard(guardian, 'offer', ward.id)?.witnessScope).toBe('participants');
    const firstOffer = world.households.guardianships[0];
    expect(firstOffer).toMatchObject({ status: 'offered', householdId: actualHousehold });
    expect(firstOffer.expiresTick).toBe(world.tick + HOUSEHOLD_GUARDIAN_OFFER_TICKS);
    expect(guard(guardian, 'accept', firstOffer.id)).toBeNull();
    expect(guard(third, 'accept', firstOffer.id)).toBeNull();
    expect(visibleHouseholds(world, third).guardianContracts).toEqual([]);
    expect(guard(ward, 'decline', firstOffer.id)).not.toBeNull();
    expect(guard(ward, 'accept', firstOffer.id)).toBeNull();
    expect(availableGuardianActions(guardian, world, false).some(({ guardianMove }) => guardianMove === 'offer')).toBe(false);
    expect(guard(guardian, 'offer', ward.id)).not.toBeNull();
    const secondOffer = world.households.guardianships[1];
    expect(guard(ward, 'accept', secondOffer.id)?.title).toBe('成年受护者明确同意');
    expect(guard(ward, 'accept', secondOffer.id)).toBeNull();
    expect([ward.sectId, ward.sectRank, ward.spiritStones]).toEqual(identity);
    expect(village.population).toBe(people);
    ward.alive = false;
    ward.hp = 0;
    world.tick++;
    expect(advanceHouseholds(world)).toHaveLength(1);
    expect(advanceHouseholds(world)).toEqual([]);
    expect(visibleHouseholds(world, ward).ownMembership).toMatchObject({ householdId: actualHousehold, status: 'deceased' });
    expect(secondOffer).toMatchObject({ status: 'ended', endReason: 'death' });
    expect(village.population).toBe(people);
  });
});

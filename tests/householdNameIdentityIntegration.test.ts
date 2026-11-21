import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { HOUSEHOLD_NAME_ALIASES, lookupHouseholdNames, projectHouseholdNames, resolveHouseholdNameAction } from '../src/engine/householdNameEngine';
import { resolveSettlementAction } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const identicalName = '纪同山';
const actualActor = (world: WorldState, id: string) => world.cultivators.find(({ id: candidate }) => candidate === id)!;
const actualVillage = (world: WorldState, id: string) => world.settlements.villages.find(({ id: candidate }) => candidate === id)!;

function recruit(world: WorldState, sponsorId: string, settlementId: string, volunteerId: string) {
  const village = actualVillage(world, settlementId);
  const sponsor = actualActor(world, sponsorId);
  const volunteer = village.volunteers.find(({ id }) => id === volunteerId)!;
  Object.assign(volunteer, { name: identicalName, age: 24, aptitude: 95, willingness: 95 });
  const count = world.cultivators.length;
  const population = village.population;
  const outcome = resolveSettlementAction(world, sponsor, { chosenAction: 'RECRUIT_SETTLER', targetSettlementId: village.id,
    targetVolunteerId: volunteer.id, innerMonologue: '' });
  expect(outcome?.title).toBe('凡人自愿入门');
  expect(world.cultivators).toHaveLength(count + 1);
  expect(village.population).toBe(population - 1);
  const subjectId = `recruit-${volunteer.id}`;
  expect(village.volunteers.find(({ id }) => id === volunteer.id)?.enlistedCultivatorId).toBe(subjectId);
  expect(world.households.members.find(({ volunteerId: id }) => id === volunteer.id)).toMatchObject({ settlementId: village.id,
    recruitedId: subjectId, status: 'recruited' });
  return subjectId;
}

function fixture() {
  const world = createInitialWorld(7041);
  world.tick = 20;
  world.month = 5;
  const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
  village.stress = 0;
  const [first, second, later] = village.volunteers;
  const sponsorId = world.sects[0].leaderId!;
  const sponsor = actualActor(world, sponsorId);
  sponsor.locationId = village.locationId;
  const outsider = world.cultivators.find(({ id, locationId, age }) => id !== sponsorId && locationId !== village.locationId && age >= 18)!;
  const tile = terrainTileAt(world, world.locations.find(({ id }) => id === village.locationId)!.x,
    world.locations.find(({ id }) => id === village.locationId)!.y)!;
  outsider.exploredTileIds.push(tile.id);
  const firstId = recruit(world, sponsorId, village.id, first.id);
  world.tick++;
  const secondId = recruit(world, sponsorId, village.id, second.id);
  return { world, village, first, second, later, firstId, secondId, sponsorId, outsiderId: outsider.id };
}

const act = (world: WorldState, actorId: string, decision: Omit<LLMDecisionPayload, 'chosenAction' | 'innerMonologue'>) =>
  resolveHouseholdNameAction(world, actualActor(world, actorId), { chosenAction: 'HOUSEHOLD_NAME', innerMonologue: '', ...decision });

describe('actual household identity across matching names, witnesses and forks', () => {
  it('shows separate local identities for two actual same-name arrivals and preserves a genuine deceased record', () => {
    const { world, village, first, second, later, firstId, secondId, sponsorId, outsiderId } = fixture();
    const lookup = (current: WorldState) => lookupHouseholdNames(current, actualActor(current, sponsorId), village.id, identicalName);
    const sameName = lookup(world);
    expect(sameName.status).toBe('ambiguous');
    expect(sameName.matches.map(({ actorId }) => actorId).sort()).toEqual([firstId, secondId].sort());
    expect(sameName.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: firstId, volunteerId: first.id, status: 'recruited' }),
      expect.objectContaining({ actorId: secondId, volunteerId: second.id, status: 'recruited' }),
    ]));
    expect(lookupHouseholdNames(world, actualActor(world, sponsorId), village.id, '册里并无此名')).toEqual({ status: 'unresolved', matches: [] });
    expect(lookupHouseholdNames(world, actualActor(world, outsiderId), village.id, identicalName)).toEqual({ status: 'unresolved', matches: [] });
    world.month = 12;
    const dying = actualActor(world, firstId);
    dying.age = dying.lifespan - 1;
    const rest = Object.fromEntries(world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '' } satisfies LLMDecisionPayload]));
    const afterDeath = advanceWorldTick(world, rest, () => .9);
    expect(actualActor(afterDeath, firstId).alive).toBe(false);
    expect(afterDeath.households.members.find(({ recruitedId }) => recruitedId === firstId)?.status).toBe('deceased');
    const current = actualVillage(afterDeath, village.id);
    current.stress = 0;
    afterDeath.tick++;
    const thirdId = recruit(afterDeath, sponsorId, village.id, later.id);
    const after = lookup(afterDeath);
    expect(after.status).toBe('ambiguous');
    expect(after.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: firstId, volunteerId: first.id, status: 'deceased' }),
      expect.objectContaining({ actorId: secondId, volunteerId: second.id, status: 'recruited' }),
      expect.objectContaining({ actorId: thirdId, volunteerId: later.id, status: 'recruited' }),
    ]));
    expect(new Set(after.matches.map(({ id }) => id)).size).toBe(3);
    expect(act(afterDeath, firstId, { nameMove: 'offer', householdAlias: HOUSEHOLD_NAME_ALIASES[0] })).toBeNull();
    const visitor = actualActor(afterDeath, outsiderId);
    visitor.name = identicalName;
    expect(lookup(afterDeath).matches.some(({ actorId }) => actorId === visitor.id)).toBe(false);
    afterDeath.tick++;
    applyCultivatorBrainDecision(afterDeath, visitor, { chosenAction: 'EXPLORE', targetLocationId: village.locationId,
      innerMonologue: '' }, () => .9);
    expect(visitor.locationId).toBe(village.locationId);
    const visitorRow = lookup(afterDeath).matches.find(({ actorId }) => actorId === visitor.id);
    expect(visitorRow).toMatchObject({ status: 'visitor', actorId: visitor.id });
    expect(visitorRow?.volunteerId).toBeUndefined();
    expect(visitorRow?.householdId).toBeUndefined();
    expect(act(afterDeath, outsiderId, { nameMove: 'offer', householdAlias: HOUSEHOLD_NAME_ALIASES[0] })).toBeNull();
    expect(afterDeath.householdNames.entries).toEqual([]);
  });

  it('verifies a voluntary alias and later clear only on a real isolated branch, without changing either person or family', () => {
    const { world, village, first, firstId, secondId, sponsorId, outsiderId } = fixture();
    let timeline = createTimeline(world);
    const main = timeline.activeBranchId;
    const startingTick = world.tick;
    timeline = forkTimeline(timeline, startingTick, { type: 'SPAWN_TREASURE', targetLocationId: village.locationId }, '同名名册验证');
    const fork = readTimelineHead(timeline)!;
    const branch = timeline.activeBranchId;
    const originals = {
      relationships: structuredClone(fork.relationships), households: structuredClone(fork.households),
      populations: fork.settlements.villages.map(({ population }) => population), people: fork.cultivators.map(({ id, name }) => ({ id, name })),
    };
    const alias = HOUSEHOLD_NAME_ALIASES[0];
    const aliasLookup = (current: WorldState) => lookupHouseholdNames(current, actualActor(current, sponsorId), village.id, alias);
    expect(act(fork, firstId, { nameMove: 'offer', householdAlias: alias })?.witnessScope).toBe('participants');
    const [proposal] = fork.householdNames.entries;
    expect(proposal).toMatchObject({ actorId: firstId, volunteerId: first.id, settlementId: village.id, status: 'proposed', kind: 'alias', alias });
    expect(aliasLookup(fork).status).toBe('unresolved');
    expect(act(fork, sponsorId, { nameMove: 'verify', targetHouseholdNameId: proposal.id })).toBeNull();
    fork.tick++;
    for (const witnessId of [firstId, outsiderId]) {
      expect(act(fork, witnessId, { nameMove: 'verify', targetHouseholdNameId: proposal.id })).toBeNull();
    }
    expect(act(fork, sponsorId, { nameMove: 'verify', targetHouseholdNameId: proposal.id })).not.toBeNull();
    expect(act(fork, sponsorId, { nameMove: 'verify', targetHouseholdNameId: proposal.id })).toBeNull();
    expect(aliasLookup(fork)).toMatchObject({ status: 'unique', matches: [{ actorId: firstId, alias }] });
    const local = projectHouseholdNames(fork, actualActor(fork, sponsorId), village.id);
    expect(local?.entries.find(({ actorId }) => actorId === secondId)).toMatchObject({ actorId: secondId, name: identicalName });
    expect(local?.entries.find(({ actorId }) => actorId === secondId)?.alias).toBeUndefined();
    const verifiedTick = fork.tick;
    timeline = recordTimelineWorld(timeline, fork, branch);
    expect(aliasLookup(readTimelineHead(timeline, main)!).status).toBe('unresolved');
    fork.tick++;
    expect(act(fork, firstId, { nameMove: 'offer_clear' })).not.toBeNull();
    const ending = fork.householdNames.entries.at(-1)!;
    expect(ending).toMatchObject({ actorId: firstId, kind: 'clear', status: 'proposed' });
    expect(aliasLookup(fork).status).toBe('unique');
    fork.tick++;
    expect(act(fork, sponsorId, { nameMove: 'verify', targetHouseholdNameId: ending.id })).not.toBeNull();
    expect(aliasLookup(fork).status).toBe('unresolved');
    timeline = recordTimelineWorld(timeline, fork, branch);
    expect(aliasLookup(readTimelineSnapshot(timeline, verifiedTick, branch)!).status).toBe('unique');
    expect(readTimelineHead(timeline, main)!.householdNames.entries).toEqual([]);
    expect(fork.relationships).toEqual(originals.relationships);
    expect(fork.households).toEqual(originals.households);
    expect(fork.settlements.villages.map(({ population }) => population)).toEqual(originals.populations);
    expect(fork.cultivators.map(({ id, name }) => ({ id, name }))).toEqual(originals.people);
  });
});

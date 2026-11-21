import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { HOUSEHOLD_NAME_ALIASES, lookupHouseholdNames, resolveHouseholdNameAction } from '../src/engine/householdNameEngine';
import { resolveSettlementAction } from '../src/engine/settlementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';

describe('durable name registration only for the actual enrolled person', () => {
  it('persists one witnessed alias, rejects a changed stable member or self witness, and never overwrites the given name', () => {
    const world = createInitialWorld(7041);
    world.tick = 20;
    const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
    const [original, different] = village.volunteers;
    const sponsor = world.cultivators.find(({ id }) => id === world.sects[0].leaderId)!;
    sponsor.locationId = village.locationId;
    village.stress = 0;
    Object.assign(original, { age: 24, aptitude: 95, willingness: 95 });
    expect(resolveSettlementAction(world, sponsor, {
      chosenAction: 'RECRUIT_SETTLER', targetSettlementId: village.id, targetVolunteerId: original.id, innerMonologue: '',
    })).not.toBeNull();
    const person = world.cultivators.find(({ id }) => id === `recruit-${original.id}`)!;
    const originalName = person.name;
    const alias = HOUSEHOLD_NAME_ALIASES[0];
    expect(resolveHouseholdNameAction(world, person, {
      chosenAction: 'HOUSEHOLD_NAME', nameMove: 'offer', householdAlias: alias, innerMonologue: '',
    })).not.toBeNull();
    const entry = world.householdNames.entries[0];
    expect(lookupHouseholdNames(world, sponsor, village.id, alias)).toEqual({ status: 'unresolved', matches: [] });
    world.tick++;
    expect(resolveHouseholdNameAction(world, sponsor, {
      chosenAction: 'HOUSEHOLD_NAME', nameMove: 'verify', targetHouseholdNameId: entry.id, innerMonologue: '',
    })).not.toBeNull();
    const opened = decodeWorldSave(encodeWorldSave(world));
    expect(opened.householdNames).toEqual(world.householdNames);
    const present = opened.cultivators.find(({ id }) => id === sponsor.id);
    expect(lookupHouseholdNames(opened, present, village.id, alias).matches[0]).toMatchObject({ actorId: person.id, name: originalName });
    expect(opened.cultivators.find(({ id }) => id === person.id)?.name).toBe(originalName);
    const rebound = structuredClone(opened);
    rebound.householdNames.entries[0].volunteerId = different.id;
    expect(() => encodeWorldSave(rebound)).toThrow('householdNames.entries.identity');
    const self = structuredClone(opened);
    self.householdNames.entries[0].witnessId = person.id;
    expect(() => encodeWorldSave(self)).toThrow('householdNames.entries.identity');
  });
});

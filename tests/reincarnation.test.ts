import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceEstates } from '../src/engine/estateEngine';
import { advanceReincarnation, availableRecollectionActions, createReincarnationState, MORTAL_MATURITY_TICKS, recordReincarnationDeath,
  REINCARNATION_CHANCE, resolveRecollectionAction, visibleRecollection } from '../src/engine/reincarnationEngine';
import { advanceSettlements, resolveSettlementAction, SETTLEMENT_RECRUIT_STIPEND } from '../src/engine/settlementEngine';
import type { WorldEvent, WorldState } from '../src/types/world';

function setup(seed: number) {
  const world = createInitialWorld(seed);
  world.reincarnation = createReincarnationState();
  world.tick = 2; world.month = 2;
  const deceased = world.cultivators[0];
  const opponent = world.cultivators[1];
  const death: WorldEvent = { id: 'fixture-verified-death', tick: 2, year: world.year, month: 2, category: 'death',
    actorIds: [opponent.id, deceased.id], duelWinnerId: opponent.id, locationId: deceased.locationId, title: '旧身份之死',
    description: '丧仪与旧遗产按实际处理', witnessScope: 'participants' };
  const kill = () => { deceased.hp = 0; deceased.alive = false; };
  return { world, deceased, opponent, death, kill };
}
function successful() {
  for (let seed = 0; seed < 256; seed++) {
    const f = setup(seed);
    f.kill();
    recordReincarnationDeath(f.world, f.deceased, f.death);
    if (f.world.reincarnation.cases.length) return f;
  }
  throw new Error('Deterministic fixtures did not hit one seeded outcome');
}

function newYear(world: WorldState, tick: number, originalYear: number) {
  world.tick = tick;
  world.year = originalYear + Math.floor((tick - 1) / 12);
  world.month = (tick - 1) % 12 + 1;
  advanceReincarnation(world);
  return advanceSettlements(world);
}

describe('seeded possible reincarnation without duplicate lives or inherited truth', () => {
  it('observes only a real, current verified death; stable seed outcome never draws world RNG or retries', () => {
    const { world, deceased, opponent, death } = successful();
    expect(REINCARNATION_CHANCE).toBe(.08);
    const original = structuredClone(world.random);
    const one = structuredClone(world.reincarnation);
    recordReincarnationDeath(world, deceased, death);
    recordReincarnationDeath(world, opponent, death);
    expect(world.reincarnation).toEqual(one);
    expect(world.random).toEqual(original);
    const equal = setup(world.random.seed);
    recordReincarnationDeath(equal.world, equal.deceased, equal.death);
    expect(equal.world.reincarnation.cases).toEqual([]);
    equal.kill();
    recordReincarnationDeath(equal.world, equal.deceased, { ...equal.death, category: 'combat' });
    recordReincarnationDeath(equal.world, equal.deceased, { ...equal.death, tick: 1 });
    recordReincarnationDeath(equal.world, equal.deceased, { ...equal.death, actorIds: [equal.opponent.id] });
    expect(equal.world.reincarnation.cases).toEqual([]);
    recordReincarnationDeath(equal.world, equal.deceased, equal.death);
    expect(equal.world.reincarnation).toEqual(one);
    expect(equal.world.random).toEqual(original);
  });

  it('uses one real birth, waits exactly 216 ticks, and requires ordinary voluntary recruitment with exact existing stipend', () => {
    const { world, deceased } = successful();
    const state = world.reincarnation.cases[0];
    const startYear = world.year;
    const previousCults = world.cultivators.length;
    const village = [...world.settlements.villages].sort((a, b) => a.id.localeCompare(b.id))[0];
    const birthPopulation = village.population;
    village.stress = 0;
    for (const other of world.settlements.villages) if (other !== village) other.population = other.capacity;
    const sponsors = world.cultivators.filter(({ sectRank, alive }) => sectRank === '长老' && alive);
    const sponsor = sponsors[0];
    const sect = world.sects.find(({ id }) => id === sponsor.sectId)!;
    const treasury = sect.spiritStones;
    sponsor.locationId = village.locationId;
    deceased.spiritStones = 319; deceased.herbs.star_bloom = 7; deceased.pills.foundation = 2;
    deceased.artifacts = [{ id: 'legacy-lineage-object', name: '遗物不可重复', spiritRoot: '木' }];
    advanceEstates(world);
    const estate = world.estates.entries.find(({ deceasedId }) => deceasedId === deceased.id)!;
    expect(estate.holdings.stones).toBe(319);

    newYear(world, 13, startYear);
    expect(state).toMatchObject({ status: 'reserved', birthTick: 13, birthSlot: 0, settlementId: village.id, maturesTick: 13 + MORTAL_MATURITY_TICKS });
    expect(village.population).toBe(birthPopulation + 3);
    expect(village.juvenileCohorts).toEqual([{ bornTick: 13, count: 3 }]);
    expect(advanceSettlements(world)).toEqual([]);
    expect(state.volunteerId).toBeUndefined();
    newYear(world, state.maturesTick! - 1, startYear);
    expect(state.status).toBe('reserved');
    expect(world.cultivators).toHaveLength(previousCults);
    expect(world.reincarnation.echoes).toEqual([]);
    newYear(world, state.maturesTick!, startYear);
    expect(state.status).toBe('volunteer');
    const volunteer = village.volunteers.find(({ id }) => id === state.volunteerId)!;
    expect(volunteer.age).toBe(18);
    expect(world.cultivators).toHaveLength(previousCults);
    expect(village.juvenileCohorts.some(({ bornTick }) => bornTick === 13)).toBe(false);
    const decision = { chosenAction: 'RECRUIT_SETTLER' as const, targetSettlementId: village.id, targetVolunteerId: volunteer.id,
      innerMonologue: '循普通招录审核' };
    const beforeEnroll = village.population;
    const originalWillingness = volunteer.willingness;
    volunteer.willingness = 0;
    expect(resolveSettlementAction(world, sponsor, decision)).toBeNull();
    volunteer.willingness = originalWillingness;
    expect(resolveSettlementAction(world, sponsor, decision)).not.toBeNull();
    expect(resolveSettlementAction(world, sponsor, decision)).toBeNull();
    expect(state.status).toBe('recruited');
    const actor = world.cultivators.find(({ id }) => id === state.newActorId)!;
    expect(actor).toMatchObject({ age: 18, sectRank: '外门弟子', realm: '练气', spiritStones: SETTLEMENT_RECRUIT_STIPEND, artifacts: [] });
    expect(actor.herbs.star_bloom).toBe(0);
    expect(actor.pills.foundation).toBe(0);
    expect(estate.holdings.stones).toBe(319);
    expect(estate.holdings.artifacts).toHaveLength(1);
    expect(sect.spiritStones).toBe(treasury - SETTLEMENT_RECRUIT_STIPEND);
    expect(village.population).toBe(beforeEnroll - 1);
    expect(world.cultivators).toHaveLength(previousCults + 1);

    const echo = visibleRecollection(world, actor.id)!;
    expect(Object.keys(echo).sort()).toEqual(['actorId', 'confidence', 'receivedTick', 'status', 'theme']);
    expect(echo.status).toBe('unconsidered');
    expect(JSON.stringify(echo)).not.toContain(deceased.id);
    expect(JSON.stringify(echo)).not.toContain(state.deathEventId);
    expect(availableRecollectionActions(actor, world)).toHaveLength(2);
    const considered = resolveRecollectionAction(world, actor, { chosenAction: 'RECOLLECT', recollectionMove: 'consider', innerMonologue: '' });
    expect(considered?.witnessScope).toBe('participants');
    expect(JSON.stringify(considered)).not.toContain(state.deceasedId);
    expect(actor.memories[0].importance).toBe(3);
    expect(resolveRecollectionAction(world, actor, { chosenAction: 'RECOLLECT', recollectionMove: 'dismiss', innerMonologue: '' })).toBeNull();
  });

  it('expires a successful death chance if there is no actual birth and preserves ordinary demographics', () => {
    const { world } = successful();
    const item = world.reincarnation.cases[0];
    const people = world.settlements.villages.reduce((sum, village) => {
      village.population = village.capacity; village.stress = 0;
      return sum + village.population;
    }, 0);
    const initialYear = world.year;
    newYear(world, 13, initialYear);
    newYear(world, 25, initialYear);
    expect(item).toMatchObject({ status: 'awaiting_birth' });
    expect(world.settlements.villages.reduce((sum, village) => sum + village.population, 0)).toBe(people);
    newYear(world, item.expiresTick + 1, initialYear);
    expect(item.status).toBe('expired');
    expect(item.resolvedTick).toBe(world.tick);
    expect(item.birthTick).toBeUndefined();
    expect(world.reincarnation.echoes).toEqual([]);
  });

  it('does not mint a candidate when a reserved cohort no longer exists, and dismissal adds no memories', () => {
    const { world } = successful();
    const year = world.year;
    const item = world.reincarnation.cases[0];
    newYear(world, 13, year);
    const village = world.settlements.villages.find(({ id }) => id === item.settlementId)!;
    // If the world later loses the whole cohort, the reincarnation does not bypass that ledger.
    const before = village.population;
    const actual = village.juvenileCohorts.find((row) => row.bornTick === item.birthTick)!;
    village.population -= actual.count;
    village.juvenileCohorts = village.juvenileCohorts.filter((row) => row !== actual);
    newYear(world, item.maturesTick!, year);
    expect(item.volunteerId).toBeUndefined();
    newYear(world, item.maturesTick! + 1, year);
    expect(item.status).toBe('expired');
    expect(village.population).toBeLessThanOrEqual(before);
    const person = world.cultivators.find(({ alive }) => alive)!;
    const memoryCount = person.memories.length;
    world.reincarnation.echoes.push({ actorId: person.id, theme: 'community', confidence: 'faint',
      receivedTick: world.tick, status: 'unconsidered' });
    expect(resolveRecollectionAction(world, person, { chosenAction: 'RECOLLECT', recollectionMove: 'dismiss', innerMonologue: '' })).not.toBeNull();
    expect(visibleRecollection(world, person.id)?.status).toBe('dismissed');
    expect(person.memories).toHaveLength(memoryCount);
  });
});

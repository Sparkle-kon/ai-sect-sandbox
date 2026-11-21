import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSettlements, MORTAL_MATURITY_TICKS, resolveSettlementAction } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import {
  availableVillageCensusActions, closeVillageCensusPeriod, openVillageCensusPeriod, projectVillageCensus,
  recordVillageCensusMaturation, recordVillageCensusSettlement, resolveVillageCensusAction, VILLAGE_CENSUS_PERIOD_LIMIT,
} from '../src/engine/villageCensusEngine';
import type { MortalSettlement, SettlementRecord, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(89);
  const village = world.settlements.villages[0];
  const actor = world.cultivators.find(({ sectRank }) => sectRank === '长老')!;
  actor.locationId = village.locationId;
  actor.realm = '筑基';
  village.stress = 10;
  const lookup = (id = village.id, tick = world.tick) => projectVillageCensus(world, actor, id, tick);
  return { world, village, actor, lookup };
}
const total = (world: WorldState) => world.settlements.villages.reduce((sum, village) => sum + village.population, 0);
const location = (world: WorldState, village: MortalSettlement) => world.locations.find(({ id }) => id === village.locationId)!;

describe('village census evidence and observed reconciliation', () => {
  it('independently proves newborns and age reclassification using actual canonical settlement changes', () => {
    const { world, village, lookup } = fixture();
    world.tick = MORTAL_MATURITY_TICKS + 1;
    world.year += 18;
    world.month = 1;
    const population = village.population;
    village.juvenileCohorts = [{ bornTick: 1, count: 5 }, { bornTick: 2, count: 2 }];
    advanceSettlements(world);
    expect(lookup()).toMatchObject({
      opening: { population, juveniles: 7 },
      expected: { population: population + 3, juveniles: 5 },
      observed: { population: population + 3, juveniles: 5 },
      residual: { population: 0, juveniles: 0 },
      births: 3, matured: 5, closed: true,
    });
    expect(village.population).toBe(population + 3);
    expect(advanceSettlements(world)).toEqual([]);
    recordVillageCensusMaturation(world, village, [{ bornTick: 1, count: 5 }]);
    expect(lookup()?.matured).toBe(5);
    expect(lookup()?.closed).toBe(true);
    expect(world.villageCensuses.periods[0].movements.filter(({ villageId }) => villageId === village.id).map(({ kind }) => kind))
      .toEqual(['maturation', 'birth']);
  });

  it('ties migration to one real source row while each end shows only its locally observed side and not the fogged counterpart', () => {
    const { world, village: source, actor, lookup } = fixture();
    const destination = world.settlements.villages[1];
    Object.assign(location(world, source), { x: 55, y: 54 });
    Object.assign(location(world, destination), { x: 990, y: 590 });
    for (const other of world.settlements.villages) {
      other.stress = 10;
      if (other !== destination) other.capacity = other.population;
    }
    source.stress = 85;
    destination.stress = 0;
    destination.capacity = destination.population + 20;
    world.tick = 3;
    world.month = 3;
    const before = total(world);
    const first = source.population;
    const second = destination.population;
    actor.exploredTileIds.push(terrainTileAt(world, location(world, destination).x, location(world, destination).y)!.id);
    advanceSettlements(world);
    const rows = world.villageCensuses.periods[0].movements;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'migration', villageId: source.id, targetVillageId: destination.id, people: 4 });
    expect(total(world)).toBe(before);
    const onlyLocal = lookup()!;
    expect(onlyLocal).toMatchObject({ opening: { population: first }, observed: { population: first - 4 },
      outgoing: 4, incoming: 0, unobservedCrossings: 4, residual: { population: 0 } });
    expect(lookup(destination.id)).toBeUndefined();
    expect(JSON.stringify(onlyLocal)).not.toContain(JSON.stringify(destination.id));
    actor.locationId = destination.locationId;
    expect(lookup(source.id)).toBeUndefined();
    const arrived = lookup(destination.id)!;
    expect(arrived).toMatchObject({ opening: { population: second }, observed: { population: second + 4 },
      outgoing: 0, incoming: 4, unobservedCrossings: 4, residual: { population: 0 } });
    expect(JSON.stringify(arrived)).not.toContain(JSON.stringify(source.id));
  });

  it('preserves a signed on-site count before a verified late enrollment without counting a household sample twice', () => {
    const { world, village, actor, lookup } = fixture();
    world.tick = 4;
    world.month = 4;
    const population = village.population;
    const citizens = world.cultivators.length;
    advanceSettlements(world);
    const period = openVillageCensusPeriod(world);
    const opening = structuredClone(period.opening);
    expect(period.closing).toBeDefined();
    expect(availableVillageCensusActions(structuredClone(actor), world)).toEqual([]);
    const census = () => resolveVillageCensusAction(world, actor, {
      chosenAction: 'VILLAGE_CENSUS', targetSettlementId: village.id, innerMonologue: '',
    });
    expect(census()).toMatchObject({ witnessScope: 'participants', actorIds: [actor.id] });
    expect(census()).toBeNull();
    expect(lookup()?.observation).toMatchObject({ observerId: actor.id, count: { population } });
    const sample = lookup()?.observation?.sample!;
    expect(sample).toBeDefined();
    expect(sample.adults + sample.juveniles + sample.namedResidents).toBeLessThan(population);
    const volunteer = village.volunteers[0];
    volunteer.age = 25;
    volunteer.aptitude = 90;
    volunteer.willingness = 90;
    const request = { chosenAction: 'RECRUIT_SETTLER' as const, targetSettlementId: village.id, targetVolunteerId: volunteer.id, innerMonologue: '' };
    expect(resolveSettlementAction(world, actor, request)).toBeTruthy();
    expect(resolveSettlementAction(world, actor, request)).toBeNull();
    expect(world.cultivators).toHaveLength(citizens + 1);
    expect(openVillageCensusPeriod(world)).toBe(period);
    expect(period.opening).toEqual(opening);
    expect(lookup()).toMatchObject({ opening: { population }, observed: { population: population - 1 },
      observation: { count: { population } }, enlisted: 1, residual: { population: 0 } });
    const posting = period.movements.find(({ kind }) => kind === 'enrollment');
    expect(posting).toMatchObject({ people: 1, volunteerId: volunteer.id, cultivatorId: `recruit-${volunteer.id}` });
    const other = world.cultivators.find(({ id }) => id !== actor.id)!;
    other.locationId = actor.locationId;
    expect(projectVillageCensus(world, other, village.id, world.tick)?.observation).toBeUndefined();
    expect(projectVillageCensus(world, undefined, village.id, world.tick)).toBeUndefined();
  });

  it('posts deaths from actual disaster but never counts relief, waivers, duplicate calls or forged typed copies', () => {
    const { world, village, actor, lookup } = fixture();
    world.tick = 4;
    world.month = 4;
    const population = village.population;
    const { x, y } = location(world, village);
    world.mapHazards.push({ id: 'fixture-meteor', kind: 'meteor', tileId: terrainTileAt(world, x, y)!.id,
      createdTick: 4, expiresTick: 6, intensity: 3 });
    advanceSettlements(world);
    actor.spiritStones = 50;
    actor.herbs.jade_leaf = 4;
    expect(resolveSettlementAction(world, actor, { chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id, innerMonologue: '' }))
      .toBeTruthy();
    const canonical = world.settlements.records.find(({ kind }) => kind === 'disaster')!;
    recordVillageCensusSettlement(world, canonical);
    recordVillageCensusSettlement(world, { ...canonical, id: 'fake-second-death', people: 16 });
    expect(lookup()).toMatchObject({ opening: { population }, observed: { population: population - 4 },
      deaths: 4, births: 0, enlisted: 0, residual: { population: 0 } });
    expect(world.villageCensuses.periods[0].movements.filter(({ villageId }) => villageId === village.id)).toHaveLength(1);
  });

  it('keeps open and closed views distinct and exposes unposted changes as discrepancies rather than synthesizing movements', () => {
    const { world, village, lookup } = fixture();
    const population = village.population;
    const fake: SettlementRecord = { id: 'old-prose', tick: world.tick, settlementId: village.id, kind: 'migration',
      people: 8, targetSettlementId: world.settlements.villages[1].id, stones: 0, herbs: 0, description: 'not an opening' };
    world.settlements.records.push(fake);
    recordVillageCensusSettlement(world, fake);
    expect(world.villageCensuses.periods).toHaveLength(0);
    const month = openVillageCensusPeriod(world);
    expect(lookup()).toMatchObject({ closed: false, expected: { population } });
    expect(lookup()).not.toHaveProperty('observed');
    expect(lookup()).not.toHaveProperty('residual');
    village.population -= 2; // Test an unexplained change, not an authorised event.
    expect(openVillageCensusPeriod(world)).toBe(month);
    closeVillageCensusPeriod(world);
    expect(lookup()).toMatchObject({ closed: true, observed: { population: population - 2 }, residual: { population: -2 } });
    expect(month.movements).toEqual([]);
  });

  it('retains only six periods without imposing any population ceiling or adding actors', () => {
    const { world, village, lookup } = fixture();
    const originalActors = world.cultivators.length;
    village.population = 526;
    village.capacity = 900;
    const initialTick = world.tick;
    for (let i = 0; i < VILLAGE_CENSUS_PERIOD_LIMIT + 3; i++) {
      world.tick = initialTick + i;
      openVillageCensusPeriod(world);
      closeVillageCensusPeriod(world);
    }
    expect(world.villageCensuses.periods).toHaveLength(VILLAGE_CENSUS_PERIOD_LIMIT);
    expect(lookup(village.id, initialTick)).toBeUndefined();
    expect(lookup()).toMatchObject({ opening: { population: 526 }, observed: { population: 526 },
      expected: { population: 526 }, residual: { population: 0 } });
    expect(village.population).toBe(526);
    expect(world.cultivators).toHaveLength(originalActors);
  });
});

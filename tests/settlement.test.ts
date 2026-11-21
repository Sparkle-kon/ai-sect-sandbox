import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSettlements, availableSettlementActions, createSettlementState, resolveSettlementAction, MORTAL_MATURITY_TICKS, SETTLEMENT_RECRUIT_STIPEND, SETTLEMENT_RELIEF, visibleSettlements } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldState } from '../src/types/world';

function fixture(seed = 89) {
  const world = createInitialWorld(seed);
  world.settlements = createSettlementState(world.locations, seed);
  const village = world.settlements.villages[0];
  const [person] = village.volunteers;
  const actor = world.cultivators.find(({ sectRank }) => sectRank === '长老')!;
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  actor.locationId = village.locationId;
  village.stress = 10;
  actor.spiritStones = 50;
  actor.herbs.jade_leaf = 3;
  const recruit = () => resolveSettlementAction(world, actor, { innerMonologue: '收徒', chosenAction: 'RECRUIT_SETTLER',
    targetSettlementId: village.id, targetVolunteerId: person.id });
  const relief = () => resolveSettlementAction(world, actor, { innerMonologue: '赈灾', chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id });
  return { world, village, person, actor, sect, recruit, relief };
}

function hazard(world: WorldState, locationId: string, duration = 2) {
  const place = world.locations.find(({ id }) => id === locationId)!;
  world.mapHazards.push({ id: `meteor-${world.tick}`, tileId: terrainTileAt(world, place.x, place.y)!.id, kind: 'meteor',
    createdTick: world.tick, expiresTick: world.tick + duration, intensity: 3 });
}

describe('finite villages and voluntary sect recruitment', () => {
  it('seeds distinct stable finite villages on actual sites, from independent seed/order', () => {
    const { world } = fixture();
    const first = createSettlementState(world.locations, 89);
    expect(first).toEqual(createSettlementState([...world.locations].reverse(), 89));
    expect(first).not.toEqual(createSettlementState(world.locations, 90));
    expect(new Set(first.villages.map(({ id }) => id)).size).toBe(first.villages.length);
    expect(first.villages.length).toBeGreaterThan(2);
    expect(first.villages.every((village) => world.locations.some(({ id }) => id === village.locationId) &&
      village.population <= village.capacity && village.population > village.volunteers.length)).toBe(true);
    expect(visibleSettlements(world).every((village) => world.locations.find(({ id }) => id === village.locationId)?.type === 'market')).toBe(true);
  });

  it('rejects minors, refusal, unauthorized rank and unfunded sponsorship, then transfers one consenting adult once', () => {
    const { world, village, person, actor, sect, recruit } = fixture();
    const population = village.population;
    const initialFunds = sect.spiritStones;
    const citizens = world.cultivators.length;
    person.age = 17;
    expect(recruit()).toBeNull();
    person.age = 20;
    person.willingness = 0;
    expect(recruit()).toBeNull();
    person.willingness = 90;
    actor.sectRank = '外门弟子';
    expect(recruit()).toBeNull();
    actor.sectRank = '长老';
    sect.spiritStones = SETTLEMENT_RECRUIT_STIPEND - 1;
    expect(recruit()).toBeNull();
    sect.spiritStones = initialFunds;
    expect(recruit()?.title).toBe('凡人自愿入门');
    const heir = world.cultivators.find(({ id }) => id === person.enlistedCultivatorId)!;
    expect(heir).toMatchObject({ id: `recruit-${person.id}`, sectId: sect.id, realm: '练气', age: person.age,
      locationId: village.locationId, spiritStones: SETTLEMENT_RECRUIT_STIPEND, alive: true });
    expect(sect.spiritStones).toBe(initialFunds - heir.spiritStones);
    expect(village.population).toBe(population - 1);
    expect(world.cultivators.length).toBe(citizens + 1);
    expect(recruit()).toBeNull();
    heir.alive = false;
    expect(recruit()).toBeNull();
    expect(world.settlements.records).toHaveLength(1);
  });

  it('disaster costs civilian lives and real relief consumes supplies once and restores legal recruitment', () => {
    const { world, village, person, actor, relief, recruit } = fixture();
    village.stress = 46;
    person.willingness = 90;
    world.tick = 4;
    world.month = 4;
    const population = village.population;
    hazard(world, village.locationId);
    expect(advanceSettlements(world)[0]?.title).toBe('凡村灾情');
    expect(village.population).toBe(population - 4);
    expect(village.stress).toBeGreaterThanOrEqual(65);
    expect(recruit()).toBeNull();
    expect(advanceSettlements(world)).toEqual([]);
    expect(village.population).toBe(population - 4);
    expect(relief()?.title).toBe('凡村赈济');
    expect(village.stress).toBeLessThan(65);
    expect(actor.spiritStones).toBe(50 - SETTLEMENT_RELIEF.stones);
    expect(actor.herbs.jade_leaf).toBe(3 - SETTLEMENT_RELIEF.jade_leaf);
    actor.herbs.jade_leaf = 5;
    expect(relief()).toBeNull();
    expect(availableSettlementActions(actor, world)).toContainEqual({ action: 'RECRUIT_SETTLER', targetSettlementId: village.id, targetVolunteerId: person.id });
    expect(world.settlements.records[1]).toMatchObject({ kind: 'relief', stones: 12, herbs: 2 });
  });

  it('moves a bounded real population through existing settlements without creating residents', () => {
    const { world, village } = fixture();
    world.tick = 3;
    world.month = 3;
    village.stress = 85;
    for (const target of world.settlements.villages) if (target !== village) target.stress = 0;
    const total = () => world.settlements.villages.reduce((sum, target) => sum + target.population, 0);
    const previous = total();
    const sourceBefore = village.population;
    expect(advanceSettlements(world)[0]?.title).toBe('凡人迁居');
    const record = world.settlements.records[0];
    expect(record).toMatchObject({ settlementId: village.id, people: 4 });
    expect(record.targetSettlementId).not.toBe(village.id);
    expect(village.population).toBe(sourceBefore - 4);
    expect(total()).toBe(previous);
    expect(advanceSettlements(world)).toEqual([]);
  });

  it('bounds repeated disaster/migration against real deaths over several seeds', () => {
    for (const seed of [0, 43, 9_423, 0xffffffff]) {
      const { world, village } = fixture(seed);
      const initial = world.settlements.villages.reduce((sum, target) => sum + target.population, 0);
      let fatalities = 0;
      let births = 0;
      const initialYear = world.year;
      for (let tick = 2; tick <= 401; tick++) {
        world.tick = tick;
        world.month = (tick - 1) % 12 + 1;
        world.year = initialYear + Math.floor((tick - 1) / 12);
        if (tick % 4 === 0) hazard(world, village.locationId);
        const events = advanceSettlements(world);
        births += world.settlements.records.filter((record) => record.kind === 'growth' && record.tick === tick)
          .reduce((sum, record) => sum + record.people, 0);
        fatalities += world.settlements.records.filter((record) => record.kind === 'disaster' && record.tick === tick)
          .reduce((sum, record) => sum + record.people, 0);
        expect(advanceSettlements(world)).toEqual([]);
        expect(events.length).toBeLessThanOrEqual(world.settlements.villages.length * 2);
        expect(world.settlements.villages.every((target) => target.population >= target.volunteers.filter((p) => !p.enlistedCultivatorId).length &&
          target.population <= target.capacity && target.stress >= 0 && target.stress <= 100)).toBe(true);
      }
      expect(world.settlements.villages.reduce((sum, target) => sum + target.population, 0)).toBe(initial + births - fatalities);
      expect(world.settlements.records.length).toBeLessThanOrEqual(96);
    }
  });
});


describe('sustainable replacement cohorts with no global cultivator cap', () => {
  it('enlists across years well past 48 while conserving population, matching stipend and preventing same-tick bursts', () => {
    const { world, actor, sect } = fixture(49);
    const initialYear = world.year;
    const startingResidents = world.settlements.villages.reduce((sum, village) => sum + village.population, 0);
    const treasury = sect.spiritStones;
    const created = new Set<string>();
    let born = 0;
    for (const village of world.settlements.villages) village.stress = 0;
    for (let year = 1; year <= 11; year++) {
      world.year = initialYear + year;
      for (let month = 1; month <= 2; month++) {
        world.tick = year * 12 + month;
        world.month = month;
        advanceSettlements(world);
        born += world.settlements.records.filter(({ kind, tick }) => kind === 'growth' && tick === world.tick)
          .reduce((sum, record) => sum + record.people, 0);
        for (const village of world.settlements.villages) {
          actor.locationId = village.locationId;
          const annual = village.volunteers.filter(({ cohortYear }) => cohortYear === world.year);
          expect(annual.length).toBeLessThanOrEqual(2);
          if (month === 1) expect(annual.every(({ age }) => age >= 18)).toBe(true);
          const option = availableSettlementActions(actor, world).find((choice) => choice.action === 'RECRUIT_SETTLER');
          if (!option || option.action !== 'RECRUIT_SETTLER') continue;
          const decision = { chosenAction: option.action, targetSettlementId: option.targetSettlementId,
            targetVolunteerId: option.targetVolunteerId, innerMonologue: '按坊籍招收确有意愿的成人' };
          expect(resolveSettlementAction(world, actor, decision)).not.toBeNull();
          expect(created.has(option.targetVolunteerId)).toBe(false);
          created.add(option.targetVolunteerId);
          expect(availableSettlementActions(actor, world).some((choice) => choice.action === 'RECRUIT_SETTLER')).toBe(false);
          expect(resolveSettlementAction(world, actor, decision)).toBeNull();
        }
      }
    }
    expect(created.size).toBeGreaterThan(48);
    expect(world.cultivators.filter(({ alive }) => alive).length).toBeGreaterThan(48);
    expect(new Set(world.cultivators.map(({ id }) => id)).size).toBe(world.cultivators.length);
    expect(sect.spiritStones).toBe(treasury - created.size * SETTLEMENT_RECRUIT_STIPEND);
    expect(world.settlements.villages.reduce((sum, village) => sum + village.population, 0)).toBe(startingResidents + born - created.size);
    expect(world.settlements.villages.every(({ population, capacity }) => population <= capacity)).toBe(true);
  });

  it('cannot replenish volunteers from newborns before 18 years, but a cohort can mature into real adult supply', () => {
    const { world, actor, village } = fixture(44);
    const startingYear = world.year;
    village.population = 2;
    village.stress = 0;
    village.volunteers = [];
    actor.locationId = village.locationId;
    world.tick = 13; world.month = 1; world.year = startingYear + 1;
    advanceSettlements(world);
    expect(village.population).toBe(5);
    expect(village.juvenileCohorts).toEqual([{ bornTick: 13, count: 3 }]);
    const join = () => {
      const option = availableSettlementActions(actor, world).find((choice) => choice.action === 'RECRUIT_SETTLER');
      if (!option) return null;
      return resolveSettlementAction(world, actor, { chosenAction: option.action, targetSettlementId: option.targetSettlementId,
        targetVolunteerId: option.targetVolunteerId, innerMonologue: '只招成年志愿者' });
    };
    expect(join()).not.toBeNull();
    expect(join()).toBeNull();
    world.tick = 14; world.month = 2;
    advanceSettlements(world);
    expect(join()).not.toBeNull();
    expect(village.population).toBe(3);
    for (let year = 2; year <= 18; year++) {
      world.tick = year * 12 + 1; world.month = 1; world.year = startingYear + year;
      advanceSettlements(world);
      expect(join()).toBeNull();
      expect(village.population).toBe(3);
      expect(village.juvenileCohorts).toEqual([{ bornTick: 13, count: 3 }]);
    }
    world.tick = 13 + MORTAL_MATURITY_TICKS; world.year = startingYear + 19;
    advanceSettlements(world);
    expect(village.juvenileCohorts.some(({ bornTick }) => bornTick === 13)).toBe(false);
    expect(join()).not.toBeNull();
    expect(village.population).toBe(5);
  });

  it('relief permits next annual growth under finite capacity while a modelled disaster suppresses it', () => {
    const { world, village, relief } = fixture(19);
    world.tick = 4; world.month = 4;
    village.population = village.capacity - 1;
    village.stress = 70;
    expect(relief()).not.toBeNull();
    world.tick = 13; world.month = 1; world.year++;
    expect(advanceSettlements(world).some(({ title }) => title === '凡村人口添丁')).toBe(true);
    expect(village.population).toBe(village.capacity);
    expect(village.juvenileCohorts).toEqual([{ bornTick: 13, count: 1 }]);
    world.tick = 25; world.year++;
    hazard(world, village.locationId);
    advanceSettlements(world);
    expect(village.population).toBe(village.capacity - 4);
    expect(village.juvenileCohorts.some(({ bornTick }) => bornTick === 25)).toBe(false);
  });
});

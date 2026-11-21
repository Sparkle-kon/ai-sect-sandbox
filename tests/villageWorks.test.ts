import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSettlements } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceVillageWorks, availableVillageWorksActions, createVillageWorksState, resolveVillageWorksAction,
  villageWorkAdultSurplus, villageWorkReadiness, VILLAGE_WORK_ADULTS_PER_LABOR, VILLAGE_WORK_RULES, visibleVillageWorks,
} from '../src/engine/villageWorksEngine';
import type { VillageWorkKind } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(4710);
  world.villageWorks = createVillageWorksState();
  world.tick = 10;
  world.month = 2;
  const [village] = world.settlements.villages;
  village.stress = 0;
  const [sect, foreign] = world.sects;
  const sponsor = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const stranger = world.cultivators.find((actor) => actor.id !== sponsor.id)!;
  const site = world.locations.find(({ id }) => id === village.locationId)!;
  sponsor.locationId = site.id;
  sponsor.herbs.earth_root = 12;
  sect.spiritStones = 240;
  const decide = (kind: VillageWorkKind, targetSettlementId = village.id) => resolveVillageWorksAction(world, sponsor,
    { chosenAction: 'VILLAGE_WORKS', villageWorkKind: kind, targetSettlementId, innerMonologue: '材料按实付，工时到后再记。' });
  const start = (kind: VillageWorkKind) => {
    expect(decide(kind)).not.toBeNull();
    return world.villageWorks.projects.at(-1)!;
  };
  const advance = () => {
    world.tick++;
    advanceSettlements(world);
    return advanceVillageWorks(world);
  };
  return { world, village, sect, foreign, sponsor, stranger, site, decide, start, advance };
}

describe('actual village work, sponsorship and capacity', () => {
  it('funds only a qualified local project once and uses actual later adults/work to increase capacity exactly once', () => {
    const { world, village, sect, foreign, sponsor, site, decide, start, advance } = fixture();
    const baseCapacity = village.capacity;
    const basePopulation = village.population;
    const baseCast = world.cultivators.length;
    expect(decide('well', 'made-up-village')).toBeNull();
    site.ownerSectId = foreign.id;
    expect(decide('well')).toBeNull();
    delete site.ownerSectId;
    sponsor.locationId = 'loc-taixu';
    expect(decide('well')).toBeNull();
    sponsor.locationId = site.id;
    sponsor.herbs.earth_root = 1;
    expect(decide('well')).toBeNull();
    sponsor.herbs.earth_root = 12;
    const rule = VILLAGE_WORK_RULES.well;
    const project = start('well');
    expect(decide('field')).toBeNull();
    expect(sect.spiritStones).toBe(240 - rule.stones);
    expect(sponsor.herbs.earth_root).toBe(12 - rule.roots);
    expect(project).toMatchObject({ laborTotal: 0, deadlineTick: world.tick + rule.ticks, stonesSpent: rule.stones, rootsSpent: rule.roots });
    expect(villageWorkReadiness(world, project)).toBe('starting_tick');
    expect(advanceVillageWorks(world)).toEqual([]);
    expect(advance()).toEqual([]);
    expect(project.laborTotal).toBe(2);
    expect(advanceVillageWorks(world)).toEqual([]);
    expect(project.laborTotal).toBe(2);
    expect(advance()).toHaveLength(1);
    expect(advanceVillageWorks(world)).toEqual([]);
    expect(project).toMatchObject({ status: 'completed', laborTotal: rule.labor, capacityBefore: baseCapacity, capacityAfter: baseCapacity + rule.capacityGain,
      settledTick: world.tick });
    expect(village.capacity).toBe(baseCapacity + rule.capacityGain);
    expect(village.population).toBe(basePopulation);
    expect(world.cultivators).toHaveLength(baseCast);
    expect(availableVillageWorksActions(sponsor, world).some(({ villageWorkKind }) => villageWorkKind === 'well')).toBe(false);
    expect(availableVillageWorksActions(sponsor, world).some(({ villageWorkKind }) => villageWorkKind === 'field')).toBe(true);
    expect(visibleVillageWorks(world, sponsor)).toEqual([project]);
  });

  it('counts unemployed adults after the authoritative settlement phase, never named volunteers, juveniles or yesterday’s census', () => {
    const { world, village, start, advance } = fixture();
    const project = start('shelter');
    world.tick++;
    expect(villageWorkReadiness(world, project)).toBe('ready');
    expect(advanceVillageWorks(world)).toEqual([]);
    expect(project.receipts).toEqual([]);
    const volunteers = village.volunteers.filter((row) => !row.enlistedCultivatorId).length;
    village.juvenileCohorts.push({ bornTick: world.tick, count: 5 });
    village.population = 5 + volunteers + VILLAGE_WORK_ADULTS_PER_LABOR;
    advanceSettlements(world);
    expect(villageWorkAdultSurplus(village)).toBe(VILLAGE_WORK_ADULTS_PER_LABOR);
    expect(advanceVillageWorks(world)).toEqual([]);
    expect(project.receipts).toEqual([{ tick: world.tick, labor: 1, adultsAvailable: VILLAGE_WORK_ADULTS_PER_LABOR }]);
    village.population--;
    expect(advance()).toEqual([]);
    expect(villageWorkReadiness(world, project)).toBe('labor_shortage');
    expect(project.laborTotal).toBe(1);
    expect(project.status).toBe('building');
  });

  it('pauses verified hazards and acute stress, abandons at deadline without fake investment refund or capacity', () => {
    const { world, village, sect, site, sponsor, start, advance } = fixture();
    const oldCapacity = village.capacity;
    const project = start('field');
    const tile = terrainTileAt(world, site.x, site.y)!;
    world.mapHazards.push({ id: 'local-village-meteor', tileId: tile.id, kind: 'meteor', intensity: 2,
      createdTick: world.tick + 1, expiresTick: world.tick + 2 });
    expect(advance()).toEqual([]);
    expect(villageWorkReadiness(world, project)).toBe('hazard');
    expect(project.receipts).toEqual([]);
    expect(world.settlements.records.some(({ kind, settlementId }) => kind === 'disaster' && settlementId === village.id)).toBe(true);
    village.stress = 84;
    expect(advance()).toEqual([]);
    expect(villageWorkReadiness(world, project)).toBe('stress');
    while (world.tick < project.deadlineTick - 1) advance();
    expect(advance()).toHaveLength(1);
    expect(project).toMatchObject({ status: 'abandoned', endReason: 'deadline', laborTotal: 0 });
    expect(advanceVillageWorks(world)).toEqual([]);
    expect(village.capacity).toBe(oldCapacity);
    expect(sect.spiritStones).toBe(240 - VILLAGE_WORK_RULES.field.stones);
    expect(sponsor.herbs.earth_root).toBe(12 - VILLAGE_WORK_RULES.field.roots);
  });

  it('permits actual subsequent births against new capacity, and handles abandoned or lost settlement geometry gracefully', () => {
    const { world, village, site, start, advance } = fixture();
    village.population = village.capacity;
    const oldCapacity = village.capacity;
    const control = structuredClone(world);
    start('well');
    advance();
    advance();
    expect(village.capacity).toBe(oldCapacity + VILLAGE_WORK_RULES.well.capacityGain);
    expect(village.population).toBe(oldCapacity);
    world.tick++;
    world.month = 1;
    world.year++;
    control.tick = world.tick;
    control.month = 1;
    control.year = world.year;
    expect(advanceSettlements(world).some(({ locationId }) => locationId === site.id)).toBe(true);
    expect(advanceSettlements(control).some(({ locationId }) => locationId === site.id)).toBe(false);
    expect(village.population).toBeGreaterThan(oldCapacity);
    const later = start('shelter');
    world.locations = world.locations.filter(({ id }) => id !== site.id);
    expect(advance()).toHaveLength(1);
    expect(later).toMatchObject({ status: 'abandoned', endReason: 'site_lost', laborTotal: 0 });
    expect(village.capacity).toBe(oldCapacity + VILLAGE_WORK_RULES.well.capacityGain);
  });
});

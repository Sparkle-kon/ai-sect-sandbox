import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableSectEconomyActions, facilityBuildCost, isGuardAssignmentActive, maintainSectEconomy, mitigateSectArray, resolveSectEconomyAction, sectQiBonus } from '../src/engine/sectEconomyEngine';
import type { FacilityKind, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const sect = world.sects[0];
  const [chief, guard, hostile] = world.cultivators;
  const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const site = world.locations.find(({ type }) => type === 'spirit_vein')!;
  chief.locationId = guard.locationId = hostile.locationId = hq.id;
  hq.ownerSectId = sect.id;
  delete site.ownerSectId;
  sect.leaderId = chief.id;
  sect.facilities = { qi_array: 0, alchemy_hall: 0, scripture_pavilion: 0, defense_array: 0, spirit_mine: 0 };
  sect.spiritStones = 10_000;
  sect.arrayHp = 0;
  sect.arrayMaxHp = 0;
  return { world, sect, chief, guard, hostile, hq, site };
}

const build = (facilityKind: FacilityKind): LLMDecisionPayload => ({ chosenAction: 'BUILD_FACILITY', facilityKind, innerMonologue: '筹建' });
const duty = { chosenAction: 'GUARD_DUTY', innerMonologue: '镇守' } as const;

describe('sect infrastructure and external territory economy', () => {
  it('charges only the leader treasury and rejects remote, unaffordable and overlevel construction', () => {
    const { world, sect, chief, guard, hq, site } = fixture();
    expect(resolveSectEconomyAction(world, guard, build('qi_array'))).toBeNull();
    chief.locationId = site.id;
    expect(resolveSectEconomyAction(world, chief, build('qi_array'))).toBeNull();
    chief.locationId = hq.id;
    const personal = chief.spiritStones;
    const cost = facilityBuildCost(sect, 'qi_array');
    expect(resolveSectEconomyAction(world, chief, build('qi_array'))?.title).toContain('聚灵阵');
    expect(sect.spiritStones).toBe(10_000 - cost);
    expect(chief.spiritStones).toBe(personal);
    expect(sectQiBonus(world, guard)).toBe(1.09);
    guard.locationId = site.id;
    expect(sectQiBonus(world, guard)).toBe(1);
    sect.facilities.qi_array = 3;
    expect(resolveSectEconomyAction(world, chief, build('qi_array'))).toBeNull();
    sect.spiritStones = 0;
    expect(resolveSectEconomyAction(world, chief, build('defense_array'))).toBeNull();
  });

  it('keeps the base furnace and only raises it when hall level exceeds baseline', () => {
    const { world, chief, hq } = fixture();
    hq.furnaceGrade = 2;
    for (const grade of [2, 2, 3]) {
      expect(resolveSectEconomyAction(world, chief, build('alchemy_hall'))).not.toBeNull();
      expect(hq.furnaceGrade).toBe(grade);
    }
  });

  it('assigns a local eligible guard without instant movement or territory seizure and expires the assignment', () => {
    const { world, sect, chief, guard, hq, site, hostile } = fixture();
    const order = { chosenAction: 'DISPATCH_GUARD', targetCultivatorId: guard.id, targetLocationId: site.id, innerMonologue: '派守' } as const;
    site.ownerSectId = hostile.sectId;
    expect(resolveSectEconomyAction(world, chief, order)).toBeNull();
    expect(resolveSectEconomyAction(world, chief, { ...order, targetCultivatorId: hostile.id })).toBeNull();
    delete site.ownerSectId;
    expect(resolveSectEconomyAction(world, chief, order)?.actorIds).toEqual([chief.id, guard.id]);
    expect(guard.locationId).toBe(hq.id);
    expect(resolveSectEconomyAction(world, chief, order)).toBeNull();
    const points = guard.contribution;
    expect(resolveSectEconomyAction(world, guard, duty)?.title).toBe('守备到岗');
    expect(guard.locationId).toBe(site.id);
    expect(site.ownerSectId).toBeUndefined();
    expect(guard.contribution).toBe(points + 2);
    world.tick++;
    expect(resolveSectEconomyAction(world, guard, duty)?.title).toBe('巡守灵脉');
    expect(guard.contribution).toBe(points + 5);
    sect.facilities.spirit_mine = 1;
    maintainSectEconomy(world);
    const guarded = sect.monthlyEconomy!.mining;
    world.tick = guard.guardAssignment!.expiresTick;
    expect(isGuardAssignmentActive(guard, world)).toBe(false);
    maintainSectEconomy(world);
    expect(guard.guardAssignment).toBeUndefined();
    expect(sect.monthlyEconomy!.mining).toBe(guarded - 10);
    expect(availableSectEconomyActions(guard, world)).toEqual([]);
  });

  it('maintains one monthly ledger, capped treasury and upkeep without altering personal inventory', () => {
    const { world, sect, chief } = fixture();
    sect.facilities.spirit_mine = 1; sect.facilities.defense_array = 1;
    sect.arrayMaxHp = 200; sect.arrayHp = 70;
    sect.spiritStones = 49_999;
    const assets = world.cultivators.map(({ spiritStones }) => spiritStones);
    maintainSectEconomy(world);
    expect(sect.monthlyEconomy).toMatchObject({ tick: world.tick, mining: expect.any(Number), upkeep: 12, net: 1 });
    expect(sect.spiritStones).toBe(50_000);
    expect(sect.arrayHp).toBe(84);
    expect(world.cultivators.map(({ spiritStones }) => spiritStones)).toEqual(assets);
    maintainSectEconomy(world);
    expect(sect.arrayHp).toBe(84);
    expect(sect.leaderId).toBe(chief.id);
  });

  it('consumes actual array capacity only against an outsider attacking inside the headquarters', () => {
    const { world, sect, chief, guard, hostile, site } = fixture();
    resolveSectEconomyAction(world, chief, build('defense_array'));
    expect(sect.arrayHp).toBe(200);
    expect(mitigateSectArray(world, chief, guard, 100)).toBe(100);
    expect(sect.arrayHp).toBe(200);
    expect(mitigateSectArray(world, chief, hostile, 100)).toBe(75);
    expect(sect.arrayHp).toBe(175);
    sect.arrayHp = 5;
    expect(mitigateSectArray(world, chief, hostile, 100)).toBe(95);
    expect(sect.arrayHp).toBe(0);
    chief.locationId = hostile.locationId = site.id;
    sect.arrayHp = 100;
    expect(mitigateSectArray(world, chief, hostile, 100)).toBe(100);
    expect(sect.arrayHp).toBe(100);
  });
});

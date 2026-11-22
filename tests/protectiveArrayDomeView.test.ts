import { describe, expect, it } from 'vitest';
import { buildMapCombatVfxPlan } from '../src/components/mapCombatVfxView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { buildProtectiveArrayDomes } from '../src/components/protectiveArrayDomeView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { adjustSectAffinity, advanceDiplomacy, resolveDiplomacyAction } from '../src/engine/diplomacyEngine';
import { deriveMapPresentation } from '../src/engine/mapMotionEngine';
import { advanceRelocations, resolveRelocationAction } from '../src/engine/relocationEngine';
import { maintainSectEconomy, mitigateSectArray, resolveSectEconomyAction } from '../src/engine/sectEconomyEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, LLMDecisionPayload, RelocationMove, WorldState } from '../src/types/world';

function atMap(world: WorldState, viewer?: Cultivator, fog = false) {
  const view = createTerrainMapView(world, viewer, fog);
  const combat = buildMapCombatVfxPlan(world, view, buildMapPresentation(world, view, []));
  return { view, combat, domes: buildProtectiveArrayDomes(world, view, combat) };
}

function settlement(world = createInitialWorld()) {
  const [sect] = world.sects;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const home = world.locations.find(({ id }) => id === sect.headquartersId)!;
  leader.locationId = home.id;
  const build = () => resolveSectEconomyAction(world, leader, { chosenAction: 'BUILD_FACILITY',
    facilityKind: 'defense_array', innerMonologue: '大阵防御' });
  return { world, sect, leader, home, build };
}

describe('protective array domes use native visible headquarters and actual shield receipts', () => {
  it('uses built capacity, applied outside damage, funded repair and genuinely destroyed state, not a local duel impact', () => {
    const { world, sect, leader, home, build } = settlement();
    expect(atMap(world).domes).toEqual([]);
    expect(build()?.title).toContain('护山阵');
    expect(atMap(world).domes).toEqual([{ id: sect.id, sectId: sect.id, location: home, hp: 200, maxHp: 200,
      integrity: 1, impacted: false, besieged: false }]);
    const outsider = world.cultivators.find(actor => actor.sectId !== sect.id)!;
    outsider.locationId = home.id;
    expect(mitigateSectArray(world, leader, outsider, 100)).toBe(75);
    expect(atMap(world).domes[0]).toMatchObject({ hp: 175, maxHp: 200, integrity: 175 / 200, impacted: false });
    world.tick++;
    maintainSectEconomy(world);
    expect(atMap(world).domes[0]).toMatchObject({ hp: 189, maxHp: 200, integrity: 189 / 200, impacted: false });
    expect(mitigateSectArray(world, leader, outsider, 1000)).toBe(811);
    expect(atMap(world).domes[0]).toMatchObject({ hp: 0, maxHp: 200, integrity: 0, impacted: false });
  });

  it('shows only unique, currently observed, actual owned HQs with valid installed capacity', () => {
    const { world, sect, leader, home, build } = settlement();
    expect(build()).toBeTruthy();
    const outsider = world.cultivators.find(actor => actor.sectId !== sect.id)!;
    const otherSite = world.locations.find(site => site.id === outsider.locationId && site !== home)!;
    Object.assign(home, { x: 100, y: 100 });
    Object.assign(otherSite, { x: 900, y: 500 });
    outsider.exploredTileIds = [terrainTileAt(world, home.x, home.y)!.id];
    expect(atMap(world, outsider, true).domes).toEqual([]);
    expect(atMap(world, leader, true).domes).toHaveLength(1);
    expect(atMap(world, outsider, false).domes).toHaveLength(1);
    outsider.positionPlane = 'upper';
    expect(atMap(world, outsider, false).domes).toEqual([]);
    delete outsider.positionPlane;

    const originalOwner = home.ownerSectId;
    home.ownerSectId = outsider.sectId;
    expect(atMap(world).domes).toEqual([]);
    home.ownerSectId = originalOwner;
    sect.inactiveSinceTick = world.tick;
    expect(atMap(world).domes).toEqual([]);
    delete sect.inactiveSinceTick;
    world.sects.push({ ...sect, id: 'other-registration' });
    expect(atMap(world).domes).toEqual([]);
    world.sects.pop();
    world.locations.push({ ...home });
    expect(atMap(world).domes).toEqual([]);
    world.locations.pop();
    sect.arrayHp = sect.arrayMaxHp + 1;
    expect(atMap(world).domes).toEqual([]);
    sect.arrayHp = 100;
    sect.facilities.defense_array = 0;
    expect(atMap(world).domes).toEqual([]);
    sect.facilities.defense_array = 1;
    const base = atMap(world);
    home.type = 'secret_realm';
    home.expeditionOmenId = 'synthetic-gate-is-never-a-headquarters';
    expect(buildProtectiveArrayDomes(world, base.view, base.combat)).toEqual([]);
  });

  it('separates native march, actual arrival, and checked public assault, never guessing from lower HP or a cached plan', () => {
    const world = createInitialWorld();
    world.diplomacy = [];
    const [attacker, defender, ...allies] = world.sects;
    const leader = world.cultivators.find(actor => actor.id === attacker.leaderId)!;
    const victim = world.cultivators.find(actor => actor.id === defender.leaderId)!;
    const destination = world.locations.find(site => site.id === defender.headquartersId)!;
    for (const actor of world.cultivators) {
      actor.locationId = world.sects.find(sect => sect.id === actor.sectId)!.headquartersId;
      actor.hp = actor.maxHp = 500;
      actor.combatPower = actor.sectId === defender.id ? 220 : 1500;
    }
    expect(resolveSectEconomyAction(world, victim, { chosenAction: 'BUILD_FACILITY', facilityKind: 'defense_array',
      innerMonologue: '实际建阵' })).toBeTruthy();
    const act = (chosenAction: LLMDecisionPayload['chosenAction'], targetSectId: string) =>
      resolveDiplomacyAction(world, leader, { chosenAction, targetSectId, innerMonologue: '军议' });
    for (const ally of allies) {
      adjustSectAffinity(world, attacker.id, ally.id, 60);
      expect(act('OFFER_ALLIANCE', ally.id)).toBeTruthy();
    }
    adjustSectAffinity(world, attacker.id, defender.id, -60);
    expect(act('DECLARE_WAR', defender.id)).toBeTruthy();
    world.tick += 3;
    expect(act('LAUNCH_SIEGE', defender.id)).toBeTruthy();
    const dome = () => atMap(world, victim, true).domes[0];
    expect(dome()).toMatchObject({ location: destination, hp: 200, integrity: 1, impacted: false, besieged: false });
    const next = () => {
      const before = structuredClone(world);
      world.tick++;
      world.month++;
      const events = advanceDiplomacy(world, () => .5);
      world.events.unshift(...events);
      world.mapPresentation = deriveMapPresentation(before, world, events);
      return events[0];
    };
    expect(next().title).toBe('联军完成集结');
    expect(dome()?.besieged).toBe(false);
    expect(next().title).toBe('联军抵达山门');
    expect(dome()).toMatchObject({ hp: 200, impacted: false, besieged: true });
    const firstCombat = next();
    expect(firstCombat.title).toBe('护山阵接战');
    expect(defender.arrayHp).toBeLessThan(200);
    expect(dome()).toMatchObject({ hp: defender.arrayHp, integrity: defender.arrayHp / 200, impacted: true, besieged: true });
    const captured = atMap(world);
    firstCombat.witnessScope = 'participants';
    expect(buildProtectiveArrayDomes(world, captured.view, captured.combat)[0]).toMatchObject({ impacted: false, besieged: true });
    delete firstCombat.witnessScope;
    world.events.push({ ...firstCombat });
    expect(buildProtectiveArrayDomes(world, captured.view, captured.combat)[0]?.impacted).toBe(false);
    world.events.pop();
    world.tick++;
    expect(buildProtectiveArrayDomes(world, captured.view, captured.combat)[0]?.impacted).toBe(false);
    world.sieges[0].status = 'withdrawn';
    expect(buildProtectiveArrayDomes(world, captured.view, captured.combat)[0]).toMatchObject({ impacted: false, besieged: false });
  });

  it('keeps the physical array before actual relocation and never transfers its ruin or old HP to the new map point', () => {
    const { world, sect, leader, home, build } = settlement(createInitialWorld(739));
    const destination = world.locations.find(site => site.id === 'loc-vein-north')!;
    const elders = world.cultivators.filter(actor => actor.sectId === sect.id && actor.id !== leader.id &&
      (actor.sectRank === '长老' || actor.sectRank === '太上长老'));
    for (const actor of elders) actor.locationId = home.id;
    leader.exploredTileIds.push(terrainTileAt(world, destination.x, destination.y)!.id);
    expect(build()).toBeTruthy();
    const outsider = world.cultivators.find(actor => actor.sectId !== sect.id)!;
    outsider.locationId = home.id;
    mitigateSectArray(world, leader, outsider, 700);
    expect(sect.arrayHp).toBe(25);
    const act = (actor: Cultivator, relocationMove: RelocationMove, id: string) =>
      resolveRelocationAction(world, actor, { chosenAction: 'RELOCATE', relocationMove, innerMonologue: '实际迁宗',
        ...(relocationMove === 'propose' ? { targetLocationId: id } : { targetRelocationId: id }) });
    expect(act(leader, 'propose', destination.id)).toBeTruthy();
    const [plan] = world.relocations.plans;
    expect(act(elders[0], 'approve', plan.id)).toBeTruthy();
    expect(advanceRelocations(world)[0].title).toBe('迁宗队伍启程');
    expect(atMap(world).domes[0]?.location).toBe(home);
    for (let i = 0; i < 8 && plan.status === 'in_transit'; i++) {
      world.tick++;
      advanceRelocations(world);
    }
    expect(plan.status).toBe('settled');
    expect(world.relocations.abandonedSites[0]).toMatchObject({ originId: home.id, arrayHp: 25, arrayMaxHp: 200 });
    expect(sect).toMatchObject({ headquartersId: destination.id, arrayHp: 0, arrayMaxHp: 0 });
    expect(atMap(world).domes).toEqual([]);
  });
});

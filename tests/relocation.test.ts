import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeRelocationForActor, activeRelocationForSect, advanceRelocations, availableRelocationActions, createRelocationState,
  relocationQuorum, resolveRelocationAction, visibleRelocations } from '../src/engine/relocationEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, RelocationMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(739);
  world.relocations = createRelocationState();
  const sect = world.sects[0];
  const origin = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const destination = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const elders = world.cultivators.filter((actor) => actor.sectId === sect.id && actor.id !== leader.id &&
    (actor.sectRank === '长老' || actor.sectRank === '太上长老'));
  expect(elders).toHaveLength(2);
  for (const actor of [leader, ...elders]) actor.locationId = origin.id;
  leader.exploredTileIds.push(terrainTileAt(world, destination.x, destination.y)!.id);
  sect.arrayMaxHp = 100;
  sect.arrayHp = 25;
  sect.facilities.defense_array = 1;
  sect.spiritStones = 500;
  const scroll = { id: 'relocation-actual-scroll', name: '旧阁存卷', spiritRoot: '金' as const };
  sect.pavilion = [scroll];
  const act = (actor: Cultivator, relocationMove: RelocationMove, id: string) =>
    resolveRelocationAction(world, actor, { chosenAction: 'RELOCATE', relocationMove, innerMonologue: '按卷宗与实物处理迁宗',
      ...(relocationMove === 'propose' ? { targetLocationId: id } : { targetRelocationId: id }) });
  const propose = () => {
    expect(act(leader, 'propose', destination.id)?.title).toBe('宗门迁址提交表决');
    return world.relocations.plans[0];
  };
  return { world, sect, leader, elders, origin, destination, scroll, act, propose };
}

describe('sect resettlement and actual custody conservation', () => {
  it('requires a damaged owned headquarters, in-person council and a personally known neutral vein', () => {
    const { world, sect, leader, elders, origin, destination, act } = fixture();
    sect.arrayHp = 90;
    expect(act(leader, 'propose', destination.id)).toBeNull();
    sect.arrayHp = 10;
    leader.realm = '练气'; leader.exploredTileIds = []; leader.rumors = [];
    expect(act(leader, 'propose', destination.id)).toBeNull();
    leader.exploredTileIds.push(terrainTileAt(world, destination.x, destination.y)!.id);
    expect(act(elders[0], 'propose', destination.id)).toBeNull();
    elders[0].locationId = destination.id;
    expect(act(leader, 'propose', destination.id)).toBeNull();
    elders[0].locationId = origin.id;
    destination.ownerSectId = world.sects[1].id;
    expect(act(leader, 'propose', destination.id)).toBeNull();
    delete destination.ownerSectId;
    expect(availableRelocationActions(leader, world)).toContainEqual({ action: 'RELOCATE', relocationMove: 'propose', targetLocationId: destination.id });
    expect(act(leader, 'propose', destination.id)).not.toBeNull();
  });

  it('needs distinct current votes and consumes no actual supplies on explicit opposition or expiration', () => {
    const first = fixture();
    const plan = first.propose();
    expect(relocationQuorum(plan)).toBe(2);
    expect(first.act(first.leader, 'approve', plan.id)).toBeNull();
    expect(first.act(first.elders[0], 'decline', plan.id)).not.toBeNull();
    expect(first.act(first.elders[0], 'approve', plan.id)).toBeNull();
    expect(advanceRelocations(first.world)).toEqual([]);
    expect(first.act(first.elders[1], 'decline', plan.id)).not.toBeNull();
    expect(advanceRelocations(first.world)[0]?.title).toBe('迁宗中止');
    expect(plan).toMatchObject({ status: 'aborted', spent: false, custody: { stones: 0, pavilion: [] } });
    expect(first.sect.spiritStones).toBe(500);
    expect(first.sect.pavilion).toEqual([first.scroll]);

    const second = fixture();
    const late = second.propose();
    const herbs = second.origin.herbs.earth_root;
    second.world.tick = late.deadlineTick;
    expect(second.act(second.elders[0], 'approve', late.id)).toBeNull();
    expect(advanceRelocations(second.world)[0]?.title).toBe('迁宗中止');
    expect(second.origin.herbs.earth_root).toBe(herbs);
    expect(advanceRelocations(second.world)).toEqual([]);
  });

  it('moves the actual garrison, residual treasury and same scroll exactly once, and retains the old site', () => {
    const { world, sect, leader, elders, origin, destination, scroll, act, propose } = fixture();
    const outsider = world.cultivators.find(({ sectId }) => sectId !== sect.id)!;
    outsider.locationId = origin.id;
    const away = world.cultivators.find((actor) => actor.sectId === sect.id && ![leader, ...elders].includes(actor))!;
    away.locationId = world.locations.find(({ type }) => type === 'market')!.id;
    const awayLocation = away.locationId;
    const market = world.locations.find(({ type }) => type === 'market')!;
    const herbs = origin.herbs.earth_root;
    const originalTileQi = world.terrain.tiles.map(({ spiritQi }) => spiritQi);
    const plan = propose();
    expect(act(elders[0], 'approve', plan.id)).not.toBeNull();
    expect(advanceRelocations(world)[0]?.title).toBe('迁宗队伍启程');
    expect(plan).toMatchObject({ status: 'in_transit', spent: true, pathIndex: 0 });
    expect(plan.path.length).toBeGreaterThan(4);
    expect(plan.custody.pavilion[0]).toBe(scroll);
    expect(sect.spiritStones).toBe(0);
    expect(sect.pavilion).toEqual([]);
    expect(origin.herbs.earth_root).toBe(herbs - 1);
    expect(activeRelocationForActor(world, leader)).toBe(plan);
    expect(activeRelocationForSect(world, sect.id)).toBe(plan);
    expect(activeRelocationForActor(world, away)).toBeUndefined();
    expect(activeRelocationForActor(world, outsider)).toBeUndefined();
    expect(leader.locationId).toBe(origin.id);
    expect(advanceRelocations(world)).toEqual([]);
    world.tick++;
    advanceRelocations(world);
    const firstStep = plan.pathIndex;
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(plan.path.length - 1);
    advanceRelocations(world);
    expect(plan.pathIndex).toBe(firstStep);
    elders[1].alive = false; elders[1].hp = 0;
    const moved = new Set<string>();
    for (let i = 0; i < 6 && plan.status === 'in_transit'; i++) {
      world.tick++;
      for (const event of advanceRelocations(world)) if (event.title === '宗门安抵新址') event.actorIds.forEach((id) => moved.add(id));
    }
    expect(plan.status).toBe('settled');
    expect(moved).toEqual(new Set([leader.id, elders[0].id]));
    expect(leader.locationId).toBe(destination.id);
    expect(away.locationId).toBe(awayLocation);
    expect(outsider.locationId).toBe(origin.id);
    expect(elders[1].locationId).toBe(origin.id);
    expect(sect.headquartersId).toBe(destination.id);
    expect(destination.type).toBe('sect_hq');
    expect(destination.ownerSectId).toBe(sect.id);
    expect(origin.type).toBe('spirit_vein');
    expect(origin.ownerSectId).toBeUndefined();
    expect(sect.pavilion[0]).toBe(scroll);
    expect(sect.spiritStones).toBe(500 - plan.stoneCost);
    expect(plan.custody).toEqual({ stones: 0, pavilion: [] });
    expect(world.relocations.abandonedSites[0]).toMatchObject({ planId: plan.id, originId: origin.id, destinationId: destination.id,
      originalType: 'sect_hq', arrayHp: 25, facilities: { defense_array: 1 } });
    expect(sect.arrayHp).toBe(0);
    expect(sect.facilities.defense_array).toBe(0);
    expect(world.terrain.tiles.map(({ spiritQi }) => spiritQi)).toEqual(originalTileQi);
    expect(market.type).toBe('market');
    expect(advanceRelocations(world)).toEqual([]);
  });

  it('prevents simultaneous destination reservations and revalidates resources before departure', () => {
    const { world, sect, leader, elders, origin, destination, act, propose } = fixture();
    const rival = world.sects[1];
    const rivalLeader = world.cultivators.find(({ id }) => id === rival.leaderId)!;
    rival.arrayMaxHp = 100; rival.arrayHp = 0;
    rivalLeader.exploredTileIds.push(terrainTileAt(world, destination.x, destination.y)!.id);
    for (const member of world.cultivators.filter(({ sectId }) => sectId === rival.id)) member.locationId = rival.headquartersId;
    expect(availableRelocationActions(rivalLeader, world).some((option) => option.targetLocationId === destination.id)).toBe(true);
    const plan = propose();
    expect(availableRelocationActions(rivalLeader, world).some((option) => option.targetLocationId === destination.id)).toBe(false);
    expect(act(rivalLeader, 'propose', destination.id)).toBeNull();
    expect(visibleRelocations(world, leader).plans).toEqual([plan]);
    const before = sect.spiritStones;
    expect(act(elders[0], 'approve', plan.id)).not.toBeNull();
    origin.herbs.earth_root = 0;
    expect(advanceRelocations(world)[0]?.title).toBe('迁宗中止');
    expect(plan.spent).toBe(false);
    expect(sect.spiritStones).toBe(before);
    expect(sect.pavilion).toHaveLength(1);
  });

  it('aborts on real route hazard, returns custody and later credits once, and never refunds spent supplies', () => {
    const { world, sect, leader, elders, origin, scroll, act, propose } = fixture();
    const originalEarth = origin.herbs.earth_root;
    const plan = propose();
    act(elders[0], 'approve', plan.id);
    advanceRelocations(world);
    const originTile = terrainTileAt(world, origin.x, origin.y)!;
    const threatened = plan.path.slice(1).map(({ x, y }) => terrainTileAt(world, x, y)!).find(({ id }) => id !== originTile.id)!;
    world.mapHazards.push({ id: 'credible-route-meteor', tileId: threatened.id, kind: 'meteor', createdTick: world.tick + 1,
      expiresTick: world.tick + 5, intensity: 4 });
    sect.spiritStones += 7; // An independent receipt while the original treasury is in transit.
    world.tick++;
    expect(advanceRelocations(world)[0]?.title).toBe('迁宗中止');
    expect(plan.status).toBe('aborted');
    expect(plan.spent).toBe(true);
    expect(plan.custody.stones).toBe(0);
    expect(plan.custody.pavilion).toEqual([]);
    expect(sect.spiritStones).toBe(500 - plan.stoneCost + 7);
    expect(sect.pavilion[0]).toBe(scroll);
    expect(origin.herbs.earth_root).toBe(originalEarth - 1);
    expect(sect.headquartersId).toBe(origin.id);
    expect(leader.locationId).toBe(origin.id);
    expect(world.relocations.abandonedSites).toEqual([]);
    expect(advanceRelocations(world)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { boundaryReliefCheckpoint } from '../src/engine/boundaryReliefCheckpoint';
import { advanceBoundaryReliefs, getCurrentBoundaryCoverage, resolveBoundaryReliefAction } from '../src/engine/boundaryReliefEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { deriveMapPresentation } from '../src/engine/mapMotionEngine';
import { maintainSectEconomy, resolveSectEconomyAction } from '../src/engine/sectEconomyEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';

function started() {
  let world = createInitialWorld(2031);
  world = applyMapBrush(world, 'paint_vein', [{ x: 300, y: 220 }]);
  world.tick = 20;
  const sect = world.sects.find(({ id }) => id === 'sect-qingyun')!;
  const post = world.locations.find(({ id, ownerSectId }) => id.startsWith('brush-vein-') && ownerSectId === sect.id)!;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const [original, relief] = world.cultivators.filter(({ id, sectId }) => id !== leader.id && sectId === sect.id);
  const outsider = world.cultivators.find(({ sectId }) => sectId !== sect.id)!;
  for (const member of [leader, original, relief]) {
    member.locationId = sect.headquartersId;
    member.hp = member.maxHp;
    member.qiProgress = 60;
    member.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
  }
  expect(resolveSectEconomyAction(world, leader, { chosenAction: 'DISPATCH_GUARD', targetCultivatorId: original.id,
    targetLocationId: post.id, innerMonologue: '' })).not.toBeNull();
  expect(resolveSectEconomyAction(world, original, { chosenAction: 'GUARD_DUTY', innerMonologue: '' })).not.toBeNull();
  world.tick = original.guardAssignment!.expiresTick - 2;
  expect(resolveBoundaryReliefAction(world, leader, { chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'offer',
    targetCultivatorId: relief.id, targetLocationId: post.id, innerMonologue: '' })).not.toBeNull();
  const row = world.boundaryReliefs.cases[0];
  world.tick++;
  expect(resolveBoundaryReliefAction(world, relief, { chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'accept',
    targetBoundaryReliefId: row.id, innerMonologue: '' })).not.toBeNull();
  return { world, original, relief, outsider, row, post };
}

describe('physical coverage, portable checkpoint and bounded visibility', () => {
  it('keeps the valid branch proof through save and shows no unseen traveler or invented flight with global fog off', () => {
    const { world, original, relief, outsider, row, post } = started();
    expect(row.path.length).toBeGreaterThan(3);
    expect(decodeWorldSave(encodeWorldSave(world)).boundaryReliefs.cases[0]).toEqual(row);
    world.tick++;
    maintainSectEconomy(world);
    advanceBoundaryReliefs(world);
    const point = boundaryReliefCheckpoint(world, relief)!;
    expect(row.coverage.kind).toBe('gap');
    expect(row.firstGapTick).toBe(world.tick);
    expect(row.pathIndex).toBeGreaterThan(0);
    expect(relief.guardAssignment).toBeUndefined();
    expect(getCurrentBoundaryCoverage(world, original, post.id)?.kind).toBe('gap');
    expect(createTerrainMapView(world, relief, false).boundaryPositions.get(relief.id)).toEqual(point);
    outsider.realm = '练气';
    outsider.locationId = [...world.locations].sort((a, b) =>
      Math.hypot(b.x - point.x, b.y - point.y) - Math.hypot(a.x - point.x, a.y - point.y))[0].id;
    outsider.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
    expect(createTerrainMapView(world, outsider, false).boundaryPositions.size).toBe(0);
    expect(createTerrainMapView(world, outsider, false).liveActors.some(({ id }) => id === relief.id)).toBe(false);
    expect(getCurrentBoundaryCoverage(world, outsider, post.id)).toBeUndefined();
    for (let steps = 0; row.status === 'travelling' && steps < row.path.length; steps++) {
      const previous = structuredClone(world);
      world.tick++;
      maintainSectEconomy(world);
      const events = advanceBoundaryReliefs(world);
      expect(deriveMapPresentation(previous, world, events).trails.some(({ cultivatorId }) => cultivatorId === relief.id)).toBe(false);
    }
    expect(row.status).toBe('completed');
    expect(getCurrentBoundaryCoverage(world, relief, post.id)?.kind).toBe('relief');
    expect(decodeWorldSave(encodeWorldSave(world)).boundaryReliefs.cases[0]).toEqual(row);
    const forged = structuredClone(world);
    forged.boundaryReliefs.cases[0].strainSpent += 1;
    expect(() => encodeWorldSave(forged)).toThrow('boundaryReliefs.cases.route');
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceTerrainSuccession, availableTerrainRecoveryActions, createTerrainSuccessionState, recordTerrainMeteor,
  rebaselineTerrainPaint, resolveTerrainRecovery, visibleTerrainSuccession } from '../src/engine/terrainSuccessionEngine';
import type { MapHazard } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(19);
  world.terrainSuccession = createTerrainSuccessionState();
  const [actor, partner, remote] = world.cultivators;
  const local = world.locations.find(({ id }) => id === actor.locationId)!;
  const tile = terrainTileAt(world, local.x, local.y)!;
  tile.spiritQi = 60;
  tile.biome = '灵山';
  partner.locationId = actor.locationId;
  for (const person of [actor, partner]) {
    person.spiritStones = 100;
    person.herbs.earth_root = 10;
    person.tribulation = undefined;
  }
  const elsewhere = world.locations.reduce((best, site) =>
    Math.hypot(site.x - local.x, site.y - local.y) > Math.hypot(best.x - local.x, best.y - local.y) ? site : best, local);
  remote.locationId = elsewhere.id;
  const advance = (tick: number) => { world.tick = tick; return advanceTerrainSuccession(world); };
  const hazard = (id: string, kind: MapHazard['kind'], at: string, start: number, end: number, intensity: number) =>
    world.mapHazards.push({ id, kind, tileId: at, createdTick: start, expiresTick: end, intensity });
  const work = (worker = actor, targetTerrainTileId = tile.id) =>
    resolveTerrainRecovery(world, worker, { chosenAction: 'TERRAIN_RECOVERY', targetTerrainTileId, innerMonologue: '' });
  return { world, tile, actor, partner, remote, advance, hazard, work };
}

describe('canonical long-term terrain succession', () => {
  it('requires actual adjacent ticks, applies only the strongest sustained hazard, and lets reversible ground recover', () => {
    const { world, tile, advance, hazard } = fixture();
    hazard('low', 'beast_tide', tile.id, 1, 7, 1);
    hazard('high', 'cursed_miasma', tile.id, 1, 7, 2);
    advance(1);
    advance(1);
    advance(3);
    advance(4);
    expect(tile.spiritQi).toBe(60);
    advance(5);
    advance(5);
    expect(tile.spiritQi).toBe(52);
    expect(tile.biome).toBe('毒沼');
    expect(world.terrainSuccession.cells).toMatchObject([{ consecutiveStress: 3, recoverableLoss: 8, permanentLoss: 0 }]);
    for (let tick = 6; tick <= 22; tick++) advance(tick);
    expect(tile.spiritQi).toBe(60);
    expect(tile.biome).toBe('灵山');
    expect(world.terrainSuccession.cells[0]).toMatchObject({ phase: 'recovered', recoverableLoss: 0, permanentLoss: 0 });
  });

  it('accounts an already-applied meteor exactly once and repairs only recoverable qi with real bounded spend', () => {
    const { world, tile, actor, partner, remote, advance, hazard, work } = fixture();
    const before = { biome: tile.biome, spiritQi: tile.spiritQi };
    tile.spiritQi -= 24;
    tile.biome = '荒漠';
    hazard('meteor', 'meteor', tile.id, 1, 4, 1);
    recordTerrainMeteor(world, tile.id, before);
    expect(tile.spiritQi).toBe(36);
    expect(world.terrainSuccession.cells[0]).toMatchObject({ baselineQi: 60, permanentLoss: 12, recoverableLoss: 12 });
    expect(work()).toBeNull();
    advance(2);
    advance(3);
    advance(4);
    expect(availableTerrainRecoveryActions(actor, world)).toEqual([{ action: 'TERRAIN_RECOVERY', targetTerrainTileId: tile.id }]);
    expect(work(actor, 'wrong')).toBeNull();
    expect(work(remote)).toBeNull();
    expect(work()).toMatchObject({ witnessScope: 'participants', actorIds: [actor.id] });
    expect(work(partner)).toBeNull();
    expect(actor.spiritStones).toBe(88);
    expect(actor.herbs.earth_root).toBe(8);
    expect(tile.spiritQi).toBe(40);
    expect(world.resourceFlow.months.flatMap(({ entries }) => entries)).toMatchObject([
      { kind: 'consumption', mechanism: 'terrain', good: 'stone', amount: 12, visibility: { kind: 'participants', actorIds: [actor.id] } },
      { kind: 'consumption', mechanism: 'terrain', good: 'earth_root', amount: 2, visibility: { kind: 'participants', actorIds: [actor.id] } },
    ]);
    expect(visibleTerrainSuccession(world, actor)[0]).not.toHaveProperty('lastWorkedBy');
    remote.exploredTileIds.push(tile.id);
    expect(visibleTerrainSuccession(world, remote)).toEqual([]);
    for (let tick = 5; tick <= 35; tick++) advance(tick);
    expect(tile.spiritQi).toBe(48);
    expect(tile.biome).toBe('荒漠');
    expect(world.terrainSuccession.cells[0]).toMatchObject({ phase: 'scarred', permanentLoss: 12, recoverableLoss: 0 });
    expect(work()).toBeNull();

    tile.spiritQi = 68; // An explicit positive God brush, not another ordinary work receipt.
    tile.biome = '灵山';
    rebaselineTerrainPaint(world, tile.id);
    advance(36);
    expect([tile.spiritQi, tile.biome]).toEqual([68, '灵山']);
    expect(world.terrainSuccession.cells).toEqual([]);
  });

  it('preserves new external terrain values and never fabricates an ordinary recovery payment', () => {
    const { world, tile, actor, advance, hazard, work } = fixture();
    hazard('miasma', 'cursed_miasma', tile.id, 1, 4, 2);
    advance(1);
    advance(2);
    advance(3);
    tile.biome = '剑冢'; // An unrelated edit is not the surface this mechanism owns.
    tile.spiritQi = 74;
    advance(4);
    expect(work()).toBeNull();
    for (let tick = 5; tick <= 17; tick++) advance(tick);
    expect(visibleTerrainSuccession(world, actor)[0]).toMatchObject({ currentBiome: '剑冢', currentQi: 74, recoveryCap: 60 });
    expect(actor.spiritStones).toBe(100);
    expect(world.resourceFlow.months.flatMap((month) => month.entries)).toEqual([]);
  });

  it('reopens an exhausted episode budget only after a new credible actual injury', () => {
    const { world, tile, actor, advance, hazard, work } = fixture();
    hazard('first', 'cursed_miasma', tile.id, 1, 4, 2);
    for (let tick = 1; tick <= 4; tick++) advance(tick);
    expect(work()).not.toBeNull();
    advance(5);
    expect(work()).not.toBeNull();
    advance(6); advance(7);
    const cell = world.terrainSuccession.cells[0];
    expect(cell).toMatchObject({ phase: 'recovered', workCount: 2, lastWorkedTick: 5, lastWorkedBy: actor.id });
    hazard('short', 'cursed_miasma', tile.id, 8, 10, 3);
    for (let tick = 8; tick <= 13; tick++) advance(tick);
    expect(cell.workCount).toBe(2);
    hazard('real', 'cursed_miasma', tile.id, 14, 20, 3);
    for (let tick = 14; tick <= 16; tick++) advance(tick);
    expect(cell).toMatchObject({ workCount: 0, lastWorkedTick: 5, lastWorkedBy: actor.id,
      recoverableLoss: 6, permanentLoss: 2 });
    for (let tick = 17; tick <= 19; tick++) advance(tick);
    expect(cell).toMatchObject({ workCount: 0, recoverableLoss: 12, permanentLoss: 4 });
  });

  it('computes an actual deterministic orthogonal alternate using the changed physical biome without declaring a hard closure', () => {
    const { world, advance, hazard } = fixture();
    for (const tile of world.terrain.tiles) { tile.biome = '坊市'; tile.spiritQi = 60; }
    const from = { x: 420, y: 300 };
    const to = { x: 620, y: 300 };
    const affected = [terrainTileAt(world, 500, 300)!, terrainTileAt(world, 540, 300)!];
    const baseline = findMapPath(world, from, to);
    const baselineIds = baseline.map(({ x, y }) => terrainTileAt(world, x, y)!.id);
    for (const tile of affected) {
      expect(baselineIds).toContain(tile.id);
      hazard('ac-' + tile.id, 'cursed_miasma', tile.id, 1, 4, 2);
    }
    advance(1); advance(2); advance(3);
    expect(affected.every(({ biome }) => biome === '毒沼')).toBe(true);
    const alternative = findMapPath(world, from, to);
    expect(alternative).toEqual(findMapPath(world, from, to));
    const tiles = alternative.map(({ x, y }) => terrainTileAt(world, x, y)!);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.some(({ id }) => affected.some((tile) => tile.id === id))).toBe(false);
    expect(tiles.every((tile, i) => i === 0 ||
      Math.abs(tile.col - tiles[i - 1].col) + Math.abs(tile.row - tiles[i - 1].row) <= 1)).toBe(true);
    const oldCorridor = new Set(baselineIds);
    expect(findMapPath(world, from, to, (tile) => oldCorridor.has(tile.id)).length).toBeGreaterThan(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { TERRAIN_RECOVERY_ROOTS, TERRAIN_RECOVERY_STONES } from '../src/engine/terrainSuccessionEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, MapTile, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '留在本人真实所在地。' };
const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
const center = (world: WorldState, { col, row }: MapTile) => ({
  x: (col + .5) * 1000 / world.terrain.columns, y: (row + .5) * 600 / world.terrain.rows,
});
const tile = (world: WorldState, col: number, row: number) => world.terrain.tiles.find((item) => item.col === col && item.row === row)!;
function steps(world: WorldState, from: MapTile, to: MapTile) {
  const nodes = findMapPath(world, center(world, from), center(world, to))
    .map((point) => terrainTileAt(world, point.x, point.y)!);
  return nodes.filter((item, index) => index === 0 || item.id !== nodes[index - 1].id);
}
afterEach(() => vi.unstubAllGlobals());

describe('actual long-term ecology under legal map interventions', () => {
  it('uses weighted real paths from before and after actual meteor scars, without closing or teleporting a route', () => {
    const world = createInitialWorld(9057);
    for (const item of world.terrain.tiles) {
      item.biome = '坊市';
      item.spiritQi = 72;
    }
    const from = tile(world, 3, 10), to = tile(world, 8, 10);
    const scar = [4, 5, 6].map((col) => tile(world, col, 10));
    expect(steps(world, from, to).map(({ col, row }) => [col, row]))
      .toEqual([[3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10]]);
    const next = applyMapBrush(world, 'meteor', scar.map((target) => center(world, target)));
    expect(next.terrainSuccession.cells).toHaveLength(3);
    for (const item of scar) {
      expect(next.terrain.tiles.find(({ id }) => id === item.id)).toMatchObject({ biome: '荒漠', spiritQi: 48 });
      expect(next.terrainSuccession.cells.find(({ tileId }) => tileId === item.id))
        .toMatchObject({ baselineQi: 72, permanentLoss: 12, recoverableLoss: 12, scarredBiome: '荒漠' });
    }
    const alternate = steps(next, from, to);
    expect(alternate[0]?.id).toBe(from.id);
    expect(alternate.at(-1)?.id).toBe(to.id);
    expect(alternate.some((cell) => scar.some(({ id }) => id === cell.id))).toBe(false);
    expect(alternate.every((cell, index) => index === 0 ||
      Math.abs(cell.col - alternate[index - 1].col) + Math.abs(cell.row - alternate[index - 1].row) === 1)).toBe(true);
    expect(decodeWorldSave(encodeWorldSave(next)).terrainSuccession).toEqual(next.terrainSuccession);
  });

  it('waits for an ended disaster, admits only the actual local tile in both brains, and records paid work without erasing the scar', async () => {
    const fresh = createInitialWorld(9058);
    const site = fresh.locations.find(({ id }) => id === 'loc-market')!;
    const originalTile = terrainTileAt(fresh, site.x, site.y)!;
    originalTile.spiritQi = 72;
    let world = applyMapBrush(fresh, 'meteor', [site]);
    for (let i = 0; i < 4; i++) {
      const forced = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
      world = advanceWorldTick(world, forced, () => .99);
    }
    const actor = world.cultivators.find(({ alive }) => alive)!;
    actor.locationId = site.id;
    actor.personality = '刚正';
    actor.hp = actor.maxHp;
    actor.spiritStones = 100;
    actor.herbs.earth_root = 20;
    const cell = world.terrainSuccession.cells[0];
    expect(cell.tileId).toBe(originalTile.id);
    expect(world.mapHazards.some(({ tileId }) => tileId === cell.tileId)).toBe(false);
    const actual = world.terrain.tiles.find(({ id }) => id === cell.tileId)!;
    const before = actual.spiritQi;
    const work = { chosenAction: 'TERRAIN_RECOVERY', targetTerrainTileId: cell.tileId, innerMonologue: '我以实物补地脉。' } satisfies LLMDecisionPayload;
    expect(computeHeuristicDecision(actor, world, () => .99)).toMatchObject({ chosenAction: work.chosenAction, targetTerrainTileId: cell.tileId });
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const mocked = vi.fn(async () => reply({ ...work, targetTerrainTileId: 'invented-remote-tile' }));
    vi.stubGlobal('fetch', mocked);
    const source = vi.fn();
    await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(actor.spiritStones).toBe(100);
    mocked.mockImplementation(async () => reply(work));
    const allowed = await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, actor, allowed, () => .99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world, actor, allowed, () => .99)).toBeNull();
    expect(actor.spiritStones).toBe(100 - TERRAIN_RECOVERY_STONES);
    expect(actor.herbs.earth_root).toBe(20 - TERRAIN_RECOVERY_ROOTS);
    expect(actual.spiritQi).toBeGreaterThan(before);
    expect(actual.spiritQi).toBeLessThanOrEqual(cell.baselineQi - cell.permanentLoss);
    expect(actual.biome).toBe('荒漠');
    const costs = world.resourceFlow.months.at(-1)?.entries.filter(({ mechanism }) => mechanism === 'terrain');
    expect(costs?.map(({ good, amount }) => [good, amount])).toEqual([['stone', TERRAIN_RECOVERY_STONES], ['earth_root', TERRAIN_RECOVERY_ROOTS]]);
    expect(decodeWorldSave(encodeWorldSave(world)).terrainSuccession).toEqual(world.terrainSuccession);
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { observedRouteTargets, proveObservedTerrainRoute } from '../src/components/observedRouteProof';
import { TerrainRouteReceipt, TerrainSuccessionPanel } from '../src/components/TerrainSuccessionPanel';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { drawTerrain, EXPLORED_TERRAIN_SHADE } from '../src/components/terrainMapDraw';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { MapTile, TerrainSuccessionCell } from '../src/types/world';

const position = (col: number, row: number) => ({ x: col * 40 + 20, y: row * 40 + 20 });

function fixture() {
  const world = createInitialWorld();
  world.tick = 26;
  const [viewer] = world.cultivators;
  const [source, destination, outside] = world.locations;
  Object.assign(source, position(8, 8), { name: '可见东口' });
  Object.assign(destination, position(10, 8), { name: '可见西口' });
  Object.assign(outside, position(18, 12), { name: '不可见的隐藏地点' });
  viewer.locationId = source.id;
  const at = (c: number, r: number) => {
    const { x, y } = position(c, r);
    return terrainTileAt(world, x, y)!;
  };
  const tile = at(8, 8), barred = at(9, 8), far = at(18, 12);
  viewer.exploredTileIds = [far.id];
  tile.spiritQi = 42;
  const record: TerrainSuccessionCell = {
    tileId: tile.id, firstTick: 14, lastStressTick: 17, consecutiveStress: 3, quietTicks: 8,
    baselineBiome: '坊市', baselineQi: 61, recoverableLoss: 16, permanentLoss: 3, workCount: 2,
    lastWorkedTick: 21, lastWorkedBy: 'canonical-but-private-worker', phase: 'recovering',
  };
  world.terrainSuccession.cells = [record, { ...record, tileId: far.id, baselineBiome: '魔渊', baselineQi: 149, phase: 'scarred' }];
  const visibility = (tiles: MapTile[]) => {
    const base = createTerrainMapView(world, viewer, false);
    const ids = new Set(tiles.map(({ id }) => id));
    return {
      ...base, current: ids, tileState: (t: MapTile) => ids.has(t.id) ? 'visible' as const : 'explored' as const,
      isCurrentLocation: (id: string) => ids.has(base.locationTile.get(id)?.id ?? ''),
    };
  };
  return { world, viewer, source, destination, outside, tile, barred, far, at, visibility };
}

describe('observed bounded terrain recovery and actual route proofs', () => {
  it('shows current succession and actual paid amounts without exposing remembered cells, and no default map tool', () => {
    const { world, viewer, tile, visibility, at } = fixture();
    const view = visibility([tile, at(10, 8)]);
    const html = renderToStaticMarkup(<TerrainSuccessionPanel world={world} view={view} selected={viewer} />);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">地脉修复与路线检核/);
    expect(html).toContain('连续受压 3 轮');
    expect(html).toContain('单次实耗 12 灵石及玄土根 2 株');
    expect(html).toContain('正在恢复');
    expect(html).toContain('基线 坊市／61 灵气 · 当前 42');
    expect(html).toContain('可恢复损失 16 · 永久损失 3 · 已实作 2 次');
    expect(html).toContain('最近施工 Tick #21');
    expect(html).toContain('可见东口');
    expect(html).not.toContain('不可见的隐藏地点');
    expect(html).not.toContain('149');
    expect(html).not.toContain('canonical-but-private-worker');
    expect(renderToStaticMarkup(<App />)).not.toContain('地脉修复与路线检核');
  });

  it('requires the entire A* route to be visible and can prove real detour without a fictional blockage', () => {
    const { world, source, destination, outside, tile, barred, at, visibility } = fixture();
    const end = at(10, 8);
    const blind = visibility([tile, end]);
    expect(observedRouteTargets(blind).some(({ id }) => id === outside.id)).toBe(false);
    expect(proveObservedTerrainRoute(world, blind, source.id, outside.id)).toEqual({ kind: 'invalid' });
    const unverified = proveObservedTerrainRoute(world, blind, source.id, destination.id);
    expect(unverified).toEqual({ kind: 'unverified' });
    expect(renderToStaticMarkup(<TerrainRouteReceipt proof={unverified} />)).toContain('道路状态待查');
    const observed = visibility([tile, barred, end, at(8, 9), at(9, 9), at(10, 9)]);
    const detour = proveObservedTerrainRoute(world, observed, source.id, destination.id, barred.id);
    expect(detour.kind).toBe('connected');
    if (detour.kind !== 'connected') throw new Error('detour unavailable');
    expect(detour.tiles.map(({ id }) => id)).toEqual([tile.id, at(8, 9).id, at(9, 9).id, at(10, 9).id, end.id]);
    expect(renderToStaticMarkup(<TerrainRouteReceipt proof={detour} alternate />)).toContain('已核实绕行可通 · 穿越 4 步地格');
  });

  it('does not leak biome mutations into remembered-cell pixels', () => {
    const { world, far } = fixture();
    world.terrain.tiles = [far];
    const draw = () => {
      const paints: Array<string> = [];
      const context = {
        canvas: { width: 1000, height: 600 }, fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
        fillRect() { paints.push(this.fillStyle); }, strokeRect() { paints.push(this.strokeStyle); },
        save() {}, restore() {},
      };
      drawTerrain(context as unknown as CanvasRenderingContext2D, world, () => 'explored', true, 0);
      return paints;
    };
    const before = draw();
    far.biome = far.biome === '魔渊' ? '坊市' : '魔渊';
    far.spiritQi = 1;
    expect(draw()).toEqual(before);
    expect(before).toEqual([EXPLORED_TERRAIN_SHADE]);
  });
});

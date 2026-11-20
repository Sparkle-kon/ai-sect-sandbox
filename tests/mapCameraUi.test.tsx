import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import {
  centerCamera, clientToMapViewport, DEFAULT_CAMERA, mapToScreen, panCamera, screenToMap, zoomCamera,
} from '../src/components/mapCamera';
import { brushPoint, getVisibleHazards } from '../src/components/mapBrushView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';

describe('map camera and god-brush UI', () => {
  it('anchors wheel zoom, uses a stable inverse transform for responsive brush points and bounds panning', () => {
    const anchor = { x: 200, y: 150 };
    const zoomed = zoomCamera(DEFAULT_CAMERA, 2, anchor);
    expect(screenToMap(zoomed, anchor)).toEqual(anchor);
    expect(mapToScreen(zoomed, screenToMap(zoomed, { x: 777, y: 489 }))).toEqual({ x: 777, y: 489 });
    const responsive = clientToMapViewport({ left: 10, top: 20, width: 500, height: 300 }, { x: 110, y: 95 });
    expect(responsive).toEqual(anchor);
    expect(screenToMap(zoomed, responsive!)).toEqual(anchor);
    expect(panCamera(zoomed, { x: -5000, y: 4000 })).toEqual({ zoom: 2, x: -1000, y: 0 });
    expect(centerCamera(zoomed, { x: 800, y: 440 })).toEqual({ zoom: 2, x: -1000, y: -580 });
    expect(zoomCamera(zoomed, 0.2, anchor)).toEqual(DEFAULT_CAMERA);
  });

  it('buffers bounded logical coordinates and never paints with detached samples', () => {
    let stroke = brushPoint([], { x: 2, y: 4 });
    expect(brushPoint(stroke, { x: 3, y: 5 })).toBe(stroke);
    expect(brushPoint(stroke, { x: -1, y: 16 })).toBe(stroke);
    expect(brushPoint(stroke, { x: NaN, y: 16 })).toBe(stroke);
    for (let i = 0; i < 199; i += 1) stroke = brushPoint(stroke, { x: 2 + i * 4, y: 4 }, true);
    expect(stroke).toHaveLength(128);
    expect(stroke[0]).toEqual({ x: 2, y: 4 });
    expect(stroke.at(-1)).toEqual({ x: 794, y: 4 });
  });

  it('reveals active hazards only in current vision and renders minimap and brush controls', () => {
    const world = createInitialWorld();
    const viewer = world.cultivators[0];
    const [home, remote] = world.locations;
    const here = terrainTileAt(world, home.x, home.y)!;
    const unseen = terrainTileAt(world, remote.x, remote.y)!;
    viewer.locationId = home.id;
    viewer.exploredTileIds = [unseen.id];
    world.mapHazards = [
      { id: 'local', kind: 'meteor', tileId: here.id, createdTick: world.tick, expiresTick: world.tick + 3, intensity: 22 },
      { id: 'remote', kind: 'cursed_miasma', tileId: unseen.id, createdTick: world.tick, expiresTick: world.tick + 3, intensity: 71 },
      { id: 'expired', kind: 'beast_tide', tileId: here.id, createdTick: world.tick - 1, expiresTick: world.tick, intensity: 99 },
    ];
    expect(getVisibleHazards(world, createTerrainMapView(world, viewer, true)).map(({ hazard }) => hazard.id)).toEqual(['local']);
    const html = renderToStaticMarkup(
      <WorldMapCanvas world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => undefined} onBrushStroke={() => undefined} />
    );
    expect(html).toContain('aria-label="小地图：点击定位"');
    expect(html).toContain('aria-label="放大地图"');
    expect(html).toContain('绘制灵脉');
    expect(html).toContain('天降陨石');
    expect(html).toContain('召唤兽潮');
    expect(html).toContain('升起诅咒瘴气');
    expect(html).toContain('当前可见灾害 · 2 处');
    expect(html).toContain('陨石余波 · 强度 22');
    expect(html).not.toContain('强度 99');
  });
});

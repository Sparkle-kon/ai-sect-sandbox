import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { activatePaintedMark, exactPaintedMarks, MapKeyboardExplorer, MapPaintedTargets } from '../src/components/MapKeyboardExplorer';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import type { PaintedMapMark } from '../src/components/mapPaintedSemantics';
import { createInitialWorld } from '../src/data/initialWorld';

const mark = (kind: PaintedMapMark['kind'], id: string, title: string, summary: string): PaintedMapMark =>
  ({ kind, id, title, summary, point: { x: 123.4598765, y: 198.765423 } });
const territory = mark('territory', 'hidden-territory-id', '甲门的边地', '斜线纹区域');
const hazard = mark('hazard', 'hidden-hazard-id', '大灾区', '交叉点纹 · 强度 3');
const route = mark('route', 'hidden-route-id', '真实迁徙路径', '虚线行程 · 只示可见路段');
const none = () => undefined;

describe('keyboard targets match the supplied painted map', () => {
  it('adds three native plot layer modes without mounting a second index or changing the default mode', () => {
    const world = createInitialWorld(1427);
    const selected = world.cultivators[0];
    const view = createTerrainMapView(world, selected, true);
    const positions = mapActorPositions(view.seenLocations, view.liveActors);
    const presentation = buildMapPresentation(world, view, positions);
    const props = { world, view, selected, actorPositions: positions, presentation, follows: false, zoom: 1,
      onFollow: none, onCamera: none, onSite: none, onActor: none, onFocusLost: none };
    const html = renderToStaticMarkup(<MapKeyboardExplorer {...props} marks={[territory, hazard, route]} onPoint={none} />);
    expect(html).toMatch(/<select[^>]+class="[^"]*min-h-11[^"]*text-base[^"]*"[^>]*>/);
    expect(html).toContain('value="sites" selected=""');
    expect(html).toMatch(/<optgroup label="实绘图层"><option value="territory">宗门领地<\/option><option value="hazard">灾害与地块<\/option><option value="route">路径与行程<\/option><\/optgroup>/);
    expect(html).not.toMatch(/甲门的边地|大灾区|真实迁徙路径|hidden-/);
    expect(renderToStaticMarkup(<MapKeyboardExplorer {...props} />)).not.toContain('实绘图层');
  });

  it('uses text pattern and ordinal labels, never raw mark ID or coordinate metadata', () => {
    const longTitle = '窄屏说明'.repeat(30);
    const html = renderToStaticMarkup(<MapPaintedTargets marks={[route, { ...route, id: 'hidden-second-id', title: longTitle }]}
      kind="route" firstOrdinal={9} onActivate={none} />);
    expect(html).toContain('可定位的路径与行程');
    expect(html).toContain('路径与行程 · 第 9 项');
    expect(html).toContain('路径与行程 · 第 10 项');
    expect(html).toContain('虚线行程 · 只示可见路段');
    expect(html).toContain(longTitle);
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).toMatch(/<button type="button" class="[^"]*min-h-11/);
    expect(html).not.toMatch(/hidden-|123\.4598765|198\.765423|data-point/);
  });

  it('moves only to the exact still-supplied mark and declines stale, ambiguous, invalid or wrong-kind points', () => {
    const go = vi.fn();
    expect(exactPaintedMarks([route, hazard, territory], 'hazard')).toEqual([hazard]);
    expect(activatePaintedMark([route, hazard, territory], 'route', route.id, go)).toBe(true);
    expect(go).toHaveBeenLastCalledWith(route.point);
    expect(activatePaintedMark([hazard], 'route', route.id, go)).toBe(false);
    expect(activatePaintedMark([route], 'hazard', route.id, go)).toBe(false);
    expect(activatePaintedMark([route, { ...route, point: { x: 5, y: 6 } }], 'route', route.id, go)).toBe(false);
    expect(activatePaintedMark([{ ...route, point: { x: Infinity, y: 30 } }], 'route', route.id, go)).toBe(false);
    expect(activatePaintedMark([route], 'route', route.id)).toBe(false);
    expect(go).toHaveBeenCalledTimes(1);
  });
});

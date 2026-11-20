import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { buildMapPresentation, MOTION_MS, sampleFlight } from '../src/components/mapPresentationView';
import { drawFlights, drawMapEffects } from '../src/components/mapPresentationDraw';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';

function fixture() {
  const world = createInitialWorld();
  const [viewer, actor] = world.cultivators;
  const [here, near, remote] = world.locations;
  here.x = 200; here.y = 180;
  near.x = 235; near.y = 180;
  remote.x = 815; remote.y = 420;
  viewer.locationId = here.id;
  actor.locationId = near.id;
  viewer.exploredTileIds = [terrainTileAt(world, remote.x, remote.y)!.id];
  world.mapPresentation = {
    tick: world.tick,
    trails: [{ cultivatorId: actor.id, tick: world.tick, fromLocationId: here.id, toLocationId: near.id, points: [here, near] }],
    effects: [
      { id: 'shown-damage', tick: world.tick, kind: 'damage', locationId: near.id, actorIds: [actor.id], text: '−22 HP' },
      { id: 'shown-breakthrough', tick: world.tick, kind: 'breakthrough', locationId: near.id, actorIds: [actor.id], text: '突破金丹' },
      { id: 'outside-clash', tick: world.tick, kind: 'clash', locationId: remote.id, actorIds: [], text: '隐雾交锋' },
    ],
  };
  const project = (fog: boolean) => {
    const view = createTerrainMapView(world, viewer, fog);
    const positions = mapActorPositions(view.seenLocations, view.liveActors);
    return { positions, ...buildMapPresentation(world, view, positions) };
  };
  return { world, viewer, actor, here, near, remote, project };
}

function fakeCanvas() {
  const strokes: string[] = [];
  const words: Array<{ text: string; y: number }> = [];
  const context = {
    strokeStyle: '', stroke() { strokes.push(this.strokeStyle); },
    fillText(text: string, _x: number, y: number) { words.push({ text, y }); },
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
  };
  return { ctx: context as unknown as CanvasRenderingContext2D, strokes, words };
}

describe('map motion presentation', () => {
  it('interpolates a multi-segment route by distance and moves actor pixels only in animated mode', () => {
    expect(sampleFlight([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 60 }], 0.5).point).toEqual({ x: 20, y: 20 });
    const { actor, project } = fixture();
    const { positions, routes } = project(false);
    const { ctx, strokes } = fakeCanvas();
    const rest = positions.find((position) => position.actor.id === actor.id);
    const inFlight = drawFlights(ctx, positions, routes, 390, true).find((position) => position.actor.id === actor.id);
    expect(inFlight?.x).not.toBe(rest?.x);
    expect(strokes).toContain('#d0f7ff');
    expect(drawFlights(ctx, positions, routes, 390, false)).toBe(positions);
    expect(drawFlights(ctx, positions, routes, MOTION_MS, true)).toBe(positions);
  });

  it('does not reveal motion or events through previously explored or unknown tiles', () => {
    const { world, actor, here, near, remote, project } = fixture();
    expect(project(true).routes.has(actor.id)).toBe(true);
    expect(project(true).effects.map(({ id }) => id)).toEqual(['shown-damage', 'shown-breakthrough']);
    expect(project(false).effects).toHaveLength(3);

    world.mapPresentation.trails[0].points = [here, remote, near];
    expect(project(true).routes.has(actor.id)).toBe(false);
    expect(project(false).routes.has(actor.id)).toBe(true);

    world.tick += 1;
    expect(project(false).effects).toHaveLength(0);
    expect(project(false).routes.size).toBe(0);
  });

  it('keeps static accessible cues, while transient captions float and clear with motion', () => {
    const { world, viewer, actor, here, near, project } = fixture();
    const { effects, positions } = project(false);
    const animated = fakeCanvas();
    drawMapEffects(animated.ctx, effects, positions, 600, true);
    expect(animated.words).toContainEqual({ text: '−22 HP', y: near.y - 57 });
    expect(animated.strokes).toContain('#f9a8d4');
    const reduced = fakeCanvas();
    drawMapEffects(reduced.ctx, effects, positions, 600, false);
    expect(reduced.words).toContainEqual({ text: '−22 HP', y: near.y - 49 });
    expect(reduced.words.some(({ text }) => text === '突破金丹')).toBe(true);
    const finished = fakeCanvas();
    drawMapEffects(finished.ctx, effects, positions, MOTION_MS, true);
    expect(finished.words).toHaveLength(0);

    const markup = renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => undefined} />);
    expect(markup).toContain('本月地图动态 · 移动 1 · 事件 3');
    expect(markup).toContain(`${actor.name}飞往：${here.name} → ${near.name}`);
    expect(markup).toContain('伤害：−22 HP');
  });
});

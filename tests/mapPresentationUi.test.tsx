import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { buildMapPresentation, MOTION_MS, sampleFlight } from '../src/components/mapPresentationView';
import { drawFlights, drawMapEffects } from '../src/components/mapPresentationDraw';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const [viewer, actor, remoteFirst, remoteSecond] = world.cultivators;
  const [here, near, remote] = world.locations;
  here.x = 200; here.y = 180;
  near.x = 235; near.y = 180;
  remote.x = 815; remote.y = 420;
  viewer.locationId = here.id;
  actor.locationId = near.id;
  actor.realm = '金丹';
  actor.realmStage = 1;
  remoteFirst.locationId = remoteSecond.locationId = remote.id;
  const date = { tick: world.tick, year: world.year, month: world.month };
  const attack: WorldEvent = { ...date, id: `evt-${world.tick}-training-harm`, title: '切磋受伤',
    description: '一击落下，气血实减。', category: 'combat', locationId: near.id, actorIds: [actor.id],
    damage: [{ cultivatorId: actor.id, amount: 22 }] };
  const advancement: WorldEvent = { ...date, id: `evt-${world.tick}-${actor.id}-break`, title: `${actor.name}突破至金丹1层`,
    description: `在【${near.name}】，${actor.name}突破瓶颈，修为精进至【金丹1层】！`,
    category: 'breakthrough', locationId: near.id, actorIds: [actor.id] };
  const duel: WorldEvent = { ...date, id: `evt-${world.tick}-${remoteFirst.id}-duel`, title: '比试',
    description: '两位在场修士各出一剑。', category: 'combat', locationId: remote.id,
    actorIds: [remoteFirst.id, remoteSecond.id], duelWinnerId: remoteFirst.id };
  world.events.push(attack, advancement, duel);
  const damageId = `${attack.id}-damage-${actor.id}`;
  const breakthroughId = `evt-${world.tick}-${actor.id}-map-breakthrough`;
  viewer.exploredTileIds = [terrainTileAt(world, remote.x, remote.y)!.id];
  world.mapPresentation = {
    tick: world.tick,
    trails: [{ cultivatorId: actor.id, tick: world.tick, fromLocationId: here.id, toLocationId: near.id, points: [here, near] }],
    effects: [
      { id: damageId, tick: world.tick, kind: 'damage', locationId: near.id, actorIds: [actor.id], text: '−22 HP' },
      { id: breakthroughId, tick: world.tick, kind: 'breakthrough', locationId: near.id, actorIds: [actor.id], text: '金丹1层' },
      { id: `${duel.id}-clash`, tick: world.tick, kind: 'clash', locationId: remote.id, actorIds: duel.actorIds },
    ],
  };
  const project = (fog: boolean) => {
    const view = createTerrainMapView(world, viewer, fog);
    const positions = mapActorPositions(view.seenLocations, view.liveActors);
    return { positions, ...buildMapPresentation(world, view, positions) };
  };
  return { world, viewer, actor, here, near, remote, project, damageId, breakthroughId };
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
    const { world, actor, here, near, remote, project, damageId, breakthroughId } = fixture();
    expect(project(true).routes.has(actor.id)).toBe(true);
    expect(project(true).effects.map(({ id }) => id)).toEqual([damageId, breakthroughId]);
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
    expect(reduced.words.some(({ text }) => text === '金丹1层')).toBe(true);
    const finished = fakeCanvas();
    drawMapEffects(finished.ctx, effects, positions, MOTION_MS, true);
    expect(finished.words).toHaveLength(0);

    const markup = renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => undefined} />);
    expect(markup).toContain('本月地图动态 · 移动 1 · 事件 3');
    expect(markup).toContain(`${actor.name}飞往：${here.name} → ${near.name}`);
    expect(markup).toContain('伤害：−22 HP');
  });
});

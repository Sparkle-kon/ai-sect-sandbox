import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { mapExplorerIndex } from '../src/components/MapKeyboardExplorer';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { MAP_HEIGHT, MAP_WIDTH, DEFAULT_CAMERA, centerCamera, mapToScreen } from '../src/components/mapCamera';
import { CLUSTER_CELL_PX, MAP_ACTOR_PAGE_SIZE, mapActorPage, pickActorMarker, planActorMarkers, visibleMarkerMembers } from '../src/components/mapActorClusters';
import type { MapActorMarker } from '../src/components/mapActorClusters';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';

function fixture(count: 48 | 526, visibleOnlyShare = false) {
  const world = createInitialWorld();
  const [here, explored, hidden] = world.locations;
  Object.assign(here, { x: 220, y: 200 });
  Object.assign(explored, { x: 760, y: 400 });
  Object.assign(hidden, { x: 920, y: 100 });
  const base = world.cultivators[0];
  world.cultivators = Array.from({ length: count }, (_, index) => ({
    ...base, id: `fixture-${String(index).padStart(3, '0')}`,
    name: `修士 ${String(index).padStart(3, '0')}`, realm: '筑基',
    locationId: visibleOnlyShare ? index < 12 ? here.id : index === 12 ? explored.id : hidden.id
      : index < Math.floor(count * .9) ? here.id : index % 2 === 0 ? explored.id : hidden.id,
    alive: index !== count - 2,
    exploredTileIds: [terrainTileAt(world, explored.x, explored.y)!.id],
  }));
  return { world, here, explored, hidden, viewer: world.cultivators[0] };
}

function mapFor(world: ReturnType<typeof fixture>['world'], fog: boolean) {
  const view = createTerrainMapView(world, world.cultivators[0], fog);
  const points = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
  const presentation = buildMapPresentation(world, view, points);
  return { view, points, presentation, index: mapExplorerIndex(world, view, points, presentation) };
}

function memberIds(markers: readonly MapActorMarker[]) {
  return markers.flatMap(m => m.kind === 'cluster' ? m.ids : [m.point.actor.id]).sort();
}

describe('visible actor marker plans and mobile drill-down', () => {
  for (const count of [48, 526] as const) {
    it(`keeps the ${count}-row fixture reachable at 360 and 390px while drawing only projected markers`, () => {
      const { world, here, viewer } = fixture(count);
      const { points, index } = mapFor(world, false);
      expect(points).toHaveLength(count - 1);
      expect(index.actors).toHaveLength(count - 1);
      for (const width of [360, 390]) {
        const size = { width, height: width * MAP_HEIGHT / MAP_WIDTH };
        for (const camera of [DEFAULT_CAMERA, centerCamera({ ...DEFAULT_CAMERA, zoom: 4 }, here)]) {
          const plan = planActorMarkers(points, camera, size, viewer.id);
          const visiblePoints = points.filter(point => {
            const { x, y } = mapToScreen(camera, point);
            return x >= 0 && y >= 0 && x <= MAP_WIDTH && y <= MAP_HEIGHT;
          });
          expect(memberIds(plan)).toEqual(visiblePoints.map(({ actor }) => actor.id).sort());
          expect(new Set(memberIds(plan)).size).toBe(visiblePoints.length);
          expect(plan.length).toBeLessThan(points.length);
          // Viewport cells are bounded, not the roster or the IDs reachable through the index.
          expect(plan.length).toBeLessThanOrEqual((Math.floor(width / CLUSTER_CELL_PX) + 1) *
            (Math.floor(size.height / CLUSTER_CELL_PX) + 1) + 1);
          expect(plan.at(-1)).toMatchObject({ key: viewer.id, selected: true, kind: 'actor' });
          expect(plan).toEqual(planActorMarkers([...points].reverse(), camera, size, viewer.id));
          for (const marker of plan) {
            expect(pickActorMarker(plan, marker, true)?.key).toBe(marker.key);
            expect(pickActorMarker(plan, marker, false)?.key).toBe(marker.key);
          }
        }
      }
      const first = mapActorPage(index.actors, '', 0);
      expect(first.actors).toHaveLength(MAP_ACTOR_PAGE_SIZE);
      const full = Array.from({ length: first.pages }, (_, page) => mapActorPage(index.actors, '', page).actors).flat();
      expect(full.map(({ id }) => id).sort()).toEqual(points.map(({ actor }) => actor.id).sort());
      const last = String(count - 1).padStart(3, '0');
      expect(mapActorPage(index.actors, ` ＦＩＸＴＵＲＥ-${last} `, 99).actors.map(({ id }) => id)).toEqual([`fixture-${last}`]);
      expect(renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={viewer.id} compact onSelectCultivator={() => undefined} />))
        .not.toContain('聚合修士列表');
      expect(world.cultivators).toHaveLength(count);
    });
  }

  it('never lets explored-only or fog-hidden population affect a marker, member count, hit, or query', () => {
    const small = fixture(48, true);
    const large = fixture(526, true);
    for (const width of [360, 390]) {
      const size = { width, height: width * MAP_HEIGHT / MAP_WIDTH };
      const projection = ({ world, viewer }: ReturnType<typeof fixture>) => {
        const { points, index } = mapFor(world, true);
        const plan = planActorMarkers(points, DEFAULT_CAMERA, size, viewer.id);
        return { plan: plan.map(marker => marker.kind === 'actor' ? { ...marker, point: marker.point.actor.id } : marker),
          hit: plan.map(marker => pickActorMarker(plan, marker, true)?.key), roster: index.actors.map(({ id }) => id),
          hiddenSearch: mapActorPage(index.actors, 'fixture-525', 0).total };
      };
      const a = projection(small);
      expect(a).toEqual(projection(large));
      expect(a.roster).toHaveLength(12);
      expect(a.hiddenSearch).toBe(0);
      expect(a.roster).not.toContain('fixture-012'); // Explored terrain isn't live actor knowledge.
    }
  });

  it('revalidates visible members of already painted groups and individuals after a death or fog change', () => {
    const { world, viewer, hidden } = fixture(526, true);
    const { points } = mapFor(world, true);
    const markers = planActorMarkers(points, DEFAULT_CAMERA, { width: 360, height: 216 }, viewer.id);
    const group = markers.find(m => m.kind === 'cluster')!;
    if (group.kind !== 'cluster') throw new Error('fixture needs an aggregate');
    const [goneId, deadId] = group.ids;
    world.cultivators.find(({ id }) => id === goneId)!.locationId = hidden.id;
    world.cultivators.find(({ id }) => id === deadId)!.alive = false;
    const next = new Map(mapFor(world, true).points.map(({ actor }) => [actor.id, actor]));
    expect(visibleMarkerMembers(group, next).map(({ id }) => id)).toEqual(group.ids.slice(2));
    expect(visibleMarkerMembers(markers.at(-1)!, new Map())).toEqual([]);
  });

  it('indexes a visible pilgrimage checkpoint rather than the hidden source node or a false source-site trial', () => {
    const { world, here, hidden, explored, viewer } = fixture(48, true);
    world.tick = 12;
    const pilgrim = world.cultivators.at(-1)!;
    const companion = world.cultivators.at(-3)!;
    expect(pilgrim.locationId).toBe(hidden.id);
    world.pilgrimages.journeys.push({ id: 'trail-fixture', organizerId: pilgrim.id, companionId: companion.id,
      stopIds: [hidden.id, here.id, explored.id], stopsVisited: [], status: 'active', proposedTick: 1,
      offerExpiresTick: 5, startedTick: 3, expiresTick: 16, legIndex: 0,
      path: [{ x: hidden.x, y: hidden.y }, { x: here.x + 2, y: here.y + 3 }], pathIndex: 1, spentByEach: 2, aid: [] });
    const active = mapFor(world, true);
    expect(active.index.sites).not.toContainEqual({ site: hidden, current: true });
    expect(active.index.actors.map(({ id }) => id)).toContain(pilgrim.id);
    const point = active.points.find(({ actor }) => actor.id === pilgrim.id)!;
    expect(Math.hypot(point.x - here.x - 2, point.y - here.y - 3)).toBeCloseTo(10);
    expect(mapFor(world, false).index.actors.filter(({ id }) => id === pilgrim.id)).toHaveLength(1);
    expect(active.view.liveActors).toContain(viewer);
    world.pilgrimages.journeys[0].pathIndex = 0;
    expect(mapFor(world, true).index.actors.map(({ id }) => id)).not.toContain(pilgrim.id);
  });
});

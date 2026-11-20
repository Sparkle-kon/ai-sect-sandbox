import type { WorldState } from '../types/world';
import { terrainTileAt } from '../engine/terrainEngine';
import type { createTerrainMapView, mapActorPositions } from './terrainMapView';

type TerrainView = ReturnType<typeof createTerrainMapView>;
type Position = ReturnType<typeof mapActorPositions>[number];
export type Point = Pick<Position, 'x' | 'y'>;
export const MOTION_MS = 1200;

export const MAP_EFFECT_LABELS = {
  damage: '伤害', breakthrough: '突破', clash: '斗法交锋', lightning: '天雷',
} as const;

export function buildMapPresentation(world: WorldState, view: TerrainView, positions: Position[]) {
  const snapshot = world.mapPresentation;
  const current = snapshot?.tick === world.tick;
  const locations = new Map(view.seenLocations.map((location) => [location.id, location]));
  const targets = new Map(positions.map((position) => [position.actor.id, position]));
  const canShow = (point: Point) => !view.current || view.current.has(terrainTileAt(world, point.x, point.y)?.id ?? '');
  const visibleRoute = (points: Point[]) => !view.current || points.every((point, index) => {
    if (!canShow(point)) return false;
    if (index === 0) return true;
    const previous = points[index - 1];
    // Test each tile crossed, including a short corner crossing between samples.
    const crossings = [0, 1];
    const boundaries = (from: number, to: number, divisions: number, extent: number) => {
      if (from === to) return;
      for (let cell = 1; cell < divisions; cell++) {
        const at = (cell * extent / divisions - from) / (to - from);
        if (at > 0 && at < 1) crossings.push(at);
      }
    };
    boundaries(previous.x, point.x, world.terrain.columns, 1000);
    boundaries(previous.y, point.y, world.terrain.rows, 600);
    crossings.sort((a, b) => a - b);
    return crossings.slice(1).every((end, i) => canShow(lerp(previous, point, (crossings[i] + end) / 2)));
  });
  const routes = new Map<string, { points: Point[]; fromName: string; toName: string }>();
  for (const trail of current ? snapshot.trails : []) {
    if (trail.tick !== world.tick || trail.points.length < 2 || !view.isCurrentLocation(trail.fromLocationId) ||
        !view.isCurrentLocation(trail.toLocationId)) continue;
    const start = locations.get(trail.fromLocationId);
    const end = locations.get(trail.toLocationId);
    const target = targets.get(trail.cultivatorId);
    if (!start || !end || target?.actor.locationId !== end.id) continue;
    const points = [...trail.points, { x: target.x, y: target.y }];
    if (visibleRoute(points)) routes.set(trail.cultivatorId, { points, fromName: start.name, toName: end.name });
  }

  const effects = (current ? snapshot.effects : []).flatMap((effect) => {
    if (effect.tick !== world.tick || !view.isCurrentLocation(effect.locationId)) return [];
    const location = locations.get(effect.locationId);
    return location ? [{ ...effect, location }] : [];
  });
  return { routes, effects };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function sampleFlight(points: Point[], progress: number): { point: Point; behind: Point[] } {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let distance = Math.max(0, Math.min(1, progress)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]) {
      const point = lerp(points[i], points[i + 1], lengths[i] ? distance / lengths[i] : 0);
      return { point, behind: [...points.slice(0, i + 1), point] };
    }
    distance -= lengths[i];
  }
  const point = points.at(-1)!;
  return { point, behind: points };
}

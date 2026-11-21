import { activeEscortForActor } from '../engine/escortEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import type { Cultivator, MapPoint, WorldState } from '../types/world';
import { MAP_WIDTH, MAP_HEIGHT } from './mapCamera';
import type { createTerrainMapView } from './terrainMapView';

type TerrainView = ReturnType<typeof createTerrainMapView>;
export interface VisibleCheckpoint {
  marker: MapPoint;
  route: MapPoint[];
  row: number;
  col: number;
}
export interface VisibleConvoy extends VisibleCheckpoint {
  id: string;
  sectName: string;
}

function visibleSegment(start: MapPoint, end: MapPoint, world: WorldState, visible: (point: MapPoint) => boolean) {
  const crossings = [0, 1];
  const axis = (from: number, to: number, tiles: number, extent: number) => {
    if (from === to) return;
    for (let boundary = 1; boundary < tiles; boundary++) {
      const t = (boundary * extent / tiles - from) / (to - from);
      if (t > 0 && t < 1) crossings.push(t);
    }
  };
  axis(start.x, end.x, world.terrain.columns, MAP_WIDTH);
  axis(start.y, end.y, world.terrain.rows, MAP_HEIGHT);
  crossings.sort((a, b) => a - b);
  const at = (t: number): MapPoint => ({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
  for (let i = 1; i < crossings.length; i++) {
    const low = crossings[i - 1], high = crossings[i];
    if (high > low && !visible(at((low + high) / 2))) return { last: at(low), complete: false };
  }
  return { last: end, complete: visible(end) };
}

function mapTransitPlans(world: WorldState) {
  return (world.relocations?.plans ?? []).filter((plan) => plan.status === 'in_transit' &&
    plan.departedTick !== undefined && plan.departedTick <= world.tick);
}

/** Travellers keep their source node until arrival; do not paint a second marker at the origin. */
export function mapTransitActorIds(world: WorldState): Set<string> {
  const actors = mapTransitPlans(world).flatMap(({ garrisonIds }) => garrisonIds);
  for (const escort of world.escorts?.contracts ?? []) {
    if (escort.status === 'active' && escort.arrivedTick === undefined && escort.escortId) actors.push(escort.escortId);
  }
  return new Set(actors);
}

/** Only a visible checkpoint may expose the connected, currently visible portion of its route. */
export function visibleCheckpointRoute(world: WorldState, view: TerrainView, path: MapPoint[], index: number): VisibleCheckpoint | undefined {
  const visible = (point: MapPoint) => !view.current || view.current.has(terrainTileAt(world, point.x, point.y)?.id ?? '');
  const marker = path[index];
  const tile = marker && terrainTileAt(world, marker.x, marker.y);
  if (!marker || !tile || !visible(marker)) return undefined;
  const arc = (direction: number) => {
    const out: MapPoint[] = [];
    for (let i = index + direction; i >= 0 && i < path.length; i += direction) {
      const start = path[i - direction];
      const edge = visibleSegment(start, path[i], world, visible);
      if (edge.last.x !== start.x || edge.last.y !== start.y) out.push(edge.last);
      if (!edge.complete) break;
    }
    return out;
  };
  return { marker, route: view.current ? [...arc(-1).reverse(), marker, ...arc(1)] : path, row: tile.row + 1, col: tile.col + 1 };
}

export function visibleMapConvoys(world: WorldState, view: TerrainView): VisibleConvoy[] {
  const names = new Map(world.sects.map(({ id, name }) => [id, name]));
  return mapTransitPlans(world).flatMap((plan) => {
    const visible = visibleCheckpointRoute(world, view, plan.path, plan.pathIndex);
    return visible ? [{ ...visible, id: plan.id, sectName: names.get(plan.sectId) ?? '宗门未详' }] : [];
  });
}

/** Only the selected escort's own route is available, and never past visible terrain. */
export function visibleMapEscort(world: WorldState, view: TerrainView, actor?: Cultivator): VisibleCheckpoint | undefined {
  const plan = world.escorts && actor?.alive && actor.hp > 0 ? activeEscortForActor(world, actor) : undefined;
  if (!plan || plan.arrivedTick !== undefined || plan.acceptedTick === undefined || plan.acceptedTick > world.tick) return undefined;
  return visibleCheckpointRoute(world, view, plan.path, plan.pathIndex);
}

/** Static convoy overlay; it neither animates nor advances simulation. */
export function drawMapConvoys(ctx: CanvasRenderingContext2D, convoys: readonly VisibleCheckpoint[], zoom: number, color?: string): void {
  if (!convoys.length) return;
  ctx.save();
  ctx.strokeStyle = color ?? '#fcd34d';
  ctx.fillStyle = color ?? '#fbbf24';
  ctx.lineWidth = 2 / zoom;
  for (const { marker, route } of convoys) {
    ctx.setLineDash([7 / zoom, 4 / zoom]);
    ctx.beginPath();
    for (const [index, point] of route.entries()) index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const size = 11 / zoom;
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - size);
    ctx.lineTo(marker.x + size, marker.y);
    ctx.lineTo(marker.x, marker.y + size);
    ctx.lineTo(marker.x - size, marker.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

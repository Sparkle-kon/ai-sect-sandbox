import { findMapPath } from '../engine/mapMotionEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import type { MapTile, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

type TerrainView = ReturnType<typeof createTerrainMapView>;
export type ObservedRouteProof = { kind: 'invalid' | 'unverified' } | { kind: 'connected'; tiles: MapTile[] };

export function observedRouteTargets(view: TerrainView) {
  return view.seenLocations.filter(({ id }) => view.isCurrentLocation(id));
}

/** Uses the same core routing costs, but never lets unobserved geography affect route choice. */
export function proveObservedTerrainRoute(
  world: WorldState,
  view: TerrainView,
  fromId: string,
  toId: string,
  avoidTileId?: string,
): ObservedRouteProof {
  const sites = observedRouteTargets(view);
  const from = sites.find(({ id }) => id === fromId);
  const to = sites.find(({ id }) => id === toId);
  if (!from || !to || from.id === to.id) return { kind: 'invalid' };
  const sourceTile = terrainTileAt(world, from.x, from.y);
  const destinationTile = terrainTileAt(world, to.x, to.y);
  if (!sourceTile || !destinationTile) return { kind: 'invalid' };
  if (avoidTileId) {
    const avoidance = world.terrain.tiles.find(({ id }) => id === avoidTileId);
    if (!avoidance || view.tileState(avoidance) !== 'visible' ||
      avoidance.id === sourceTile.id || avoidance.id === destinationTile.id) return { kind: 'invalid' };
  }
  const allowed = (tile: MapTile) => tile.id !== avoidTileId && view.tileState(tile) === 'visible';
  const points = findMapPath(world, from, to, allowed);
  const tiles: MapTile[] = [];
  for (const point of points) {
    const tile = terrainTileAt(world, point.x, point.y);
    if (!tile || !allowed(tile)) return { kind: 'unverified' };
    if (tiles.at(-1)?.id !== tile.id) tiles.push(tile);
  }
  return tiles.length ? { kind: 'connected', tiles } : { kind: 'unverified' };
}

import { courierCheckpoint } from '../engine/sealedCourierEngine';
import { pilgrimageCheckpoint } from '../engine/pilgrimageEngine';
import type { Cultivator, LocationNode, MapPoint, MapTile, TerrainBiome, WorldState } from '../types/world';
import { currentVisibleTileIds, terrainTileAt } from '../engine/terrainEngine';

export const BIOME_PALETTE: Record<TerrainBiome, { base: string; detail: string; swatch: string }> = {
  灵山: { base: '#12332c', detail: '#579075', swatch: '#58a891' },
  毒沼: { base: '#262f22', detail: '#829450', swatch: '#8a9f57' },
  剑冢: { base: '#263247', detail: '#7b90a1', swatch: '#97b0cc' },
  荒漠: { base: '#423023', detail: '#ab8156', swatch: '#c28c5c' },
  魔渊: { base: '#301d39', detail: '#905887', swatch: '#bf81af' },
  坊市: { base: '#422729', detail: '#b8796c', swatch: '#d38774' },
};

export function createTerrainMapView(world: WorldState, viewer: Cultivator | undefined, fog: boolean) {
  const current = fog ? (viewer?.alive ? currentVisibleTileIds(world, viewer) : new Set<string>()) : undefined;
  const known = current ? new Set([...viewer?.exploredTileIds ?? [], ...current]) : undefined;
  const tileState = (tile: MapTile) => !current || current.has(tile.id) ? 'visible' : known?.has(tile.id) ? 'explored' : 'hidden';
  const locationTile = new Map<string, MapTile>();
  for (const location of world.locations) {
    const tile = terrainTileAt(world, location.x, location.y);
    if (tile) locationTile.set(location.id, tile);
  }
  const isCurrentLocation = (id: string) => !current || current.has(locationTile.get(id)?.id ?? '');
  const seenLocations = world.locations.filter(({ id }) => !known || known.has(locationTile.get(id)?.id ?? ''));
  const trailPositions = new Map<string, MapPoint>();
  const liveActors = world.cultivators.filter((actor) => {
    if (!actor.alive) return false;
    const checkpoint = courierCheckpoint(world, actor) ?? pilgrimageCheckpoint(world, actor);
    if (!checkpoint) return isCurrentLocation(actor.locationId);
    if (current && !current.has(terrainTileAt(world, checkpoint.x, checkpoint.y)?.id ?? '')) return false;
    trailPositions.set(actor.id, checkpoint);
    return true;
  });
  return {
    current, known, locationTile, tileState, isCurrentLocation, seenLocations, liveActors, trailPositions,
  };
}

/** Same actor centers drive pixels and click hit tests, including under fog. */
export function mapActorPositions(locations: LocationNode[], actors: Cultivator[], trailPositions?: ReadonlyMap<string, MapPoint>) {
  const groups = new Map<string, Cultivator[]>();
  for (const actor of actors) {
    if (trailPositions?.has(actor.id)) continue;
    const group = groups.get(actor.locationId) ?? [];
    group.push(actor);
    groups.set(actor.locationId, group);
  }
  const stationary = locations.flatMap((location) => {
    const group = groups.get(location.id) ?? [];
    return group.map((actor, index) => {
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 4;
      const radius = group.length === 1 ? 0 : 38;
      return { actor, x: location.x + Math.cos(angle) * radius, y: location.y + Math.sin(angle) * radius };
    });
  });
  const trailGroups = new Map<string, Array<{ actor: Cultivator; point: MapPoint }>>();
  for (const actor of actors) {
    const point = trailPositions?.get(actor.id);
    if (!point) continue;
    const key = `${point.x}/${point.y}`;
    const arrivals = trailGroups.get(key) ?? [];
    arrivals.push({ actor, point });
    trailGroups.set(key, arrivals);
  }
  return [...stationary, ...[...trailGroups.values()].flatMap((group) => group.map(({ actor, point }, index) => {
    const angle = 2 * Math.PI * index / group.length;
    const radius = group.length > 1 ? 10 : 0;
    return { actor, x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
  }))];
}

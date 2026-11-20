import type { Cultivator, LocationNode, MapTile, TerrainBiome, WorldState } from '../types/world';
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
  const liveActors = world.cultivators.filter((actor) => actor.alive && isCurrentLocation(actor.locationId));
  return {
    current, known, locationTile, tileState, isCurrentLocation, seenLocations, liveActors,
  };
}

/** Same actor centers drive pixels and click hit tests, including under fog. */
export function mapActorPositions(locations: LocationNode[], actors: Cultivator[]) {
  const groups = new Map<string, Cultivator[]>();
  for (const actor of actors) {
    const group = groups.get(actor.locationId) ?? [];
    group.push(actor);
    groups.set(actor.locationId, group);
  }
  return locations.flatMap((location) => {
    const group = groups.get(location.id) ?? [];
    return group.map((actor, index) => {
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 4;
      const radius = group.length === 1 ? 0 : 38;
      return { actor, x: location.x + Math.cos(angle) * radius, y: location.y + Math.sin(angle) * radius };
    });
  });
}

import {onLowerPlane} from '../engine/upperPassageIsolation';
import { projectMapActorsAtCheckpoints } from './mapActorCheckpointProjection';
import type { Cultivator, LocationNode, MapPoint, MapTile, TerrainBiome, WorldState } from '../types/world';
import { currentVisibleTileIds, terrainTileAt } from '../engine/terrainEngine';
import { canSeeOccasion, canSeeOccasionLocation } from '../engine/expeditionOmenEngine';
import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { isOpenOccasion } from './occasionLabels';

export const BIOME_PALETTE: Record<TerrainBiome, { base: string; detail: string; swatch: string }> = {
  灵山: { base: '#12332c', detail: '#579075', swatch: '#58a891' },
  毒沼: { base: '#262f22', detail: '#829450', swatch: '#8a9f57' },
  剑冢: { base: '#263247', detail: '#7b90a1', swatch: '#97b0cc' },
  荒漠: { base: '#423023', detail: '#ab8156', swatch: '#c28c5c' },
  魔渊: { base: '#301d39', detail: '#905887', swatch: '#bf81af' },
  坊市: { base: '#422729', detail: '#b8796c', swatch: '#d38774' },
};

export function createTerrainMapView(world: WorldState, viewer: Cultivator | undefined, fog: boolean) {
  const above = viewer !== undefined && !onLowerPlane(viewer);
  const current = above || fog ? (viewer?.alive ? currentVisibleTileIds(world, viewer) : new Set<string>()) : undefined;
  const known = current ? new Set(above ? [] : [...viewer?.exploredTileIds ?? [], ...current]) : undefined;
  const tileState = (tile: MapTile) => !current || current.has(tile.id) ? 'visible' : known?.has(tile.id) ? 'explored' : 'hidden';
  // Dismissing terrain fog never authorizes an unlearned temporary gate or its occupants.
  const hiddenGates = new Set((above ? [] : world.locations).filter(location => isScopedExpeditionGate(location) &&
    !canSeeOccasionLocation(world, viewer, location.id)).map(({ id }) => id));
  const locationTile = new Map<string, MapTile>();
  for (const location of above ? [] : world.locations) {
    if (hiddenGates.has(location.id)) continue;
    const tile = terrainTileAt(world, location.x, location.y);
    if (tile) locationTile.set(location.id, tile);
  }
  const isCurrentLocation = (id: string) => locationTile.has(id) && (!current || current.has(locationTile.get(id)?.id ?? ''));
  const seenLocations = (above ? [] : world.locations).filter(({ id }) => !hiddenGates.has(id) && (!known || known.has(locationTile.get(id)?.id ?? '')));
  const visibleOpenOccasions = world.occasions.filter(occasion => isOpenOccasion(occasion) &&
    isCurrentLocation(occasion.locationId) && canSeeOccasion(world, viewer, occasion));
  const actors = projectMapActorsAtCheckpoints(world, { viewer, above, current, hiddenGates, isCurrentLocation });
  return {
    current, known, locationTile, tileState, isCurrentLocation, seenLocations, visibleOpenOccasions,
    ...actors,
  };
}

/** Same actor centers drive pixels and click hit tests, including under fog. */
export function mapActorPositions(locations: LocationNode[], actors: Cultivator[], trailPositions?: ReadonlyMap<string, MapPoint>) {
  const groups = new Map<string, Cultivator[]>();
  for (const actor of actors) {
    if (!onLowerPlane(actor) || trailPositions?.has(actor.id)) continue;
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
    if (!onLowerPlane(actor)) continue;
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

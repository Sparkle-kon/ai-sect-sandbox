import { currentCommonsRound, visibleSharedCommons } from '../engine/sharedCommonsEngine';
import type { Cultivator, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

export function visibleSharedCommonsMapSites(
  world: WorldState,
  view: ReturnType<typeof createTerrainMapView>,
  selected?: Cultivator,
) {
  const actor = selected && world.cultivators.find(({ id }) => id === selected.id);
  if (!actor?.alive || actor.hp <= 0) return new Set<string>();
  const sites = new Map(view.seenLocations.map((site) => [site.id, site]));
  const found = new Set<string>();
  for (const pact of visibleSharedCommons(world, actor)) {
    const site = sites.get(pact.siteId);
    if (!site || !view.isCurrentLocation(site.id) || !currentCommonsRound(world, pact)) continue;
    found.add(site.id);
  }
  return found;
}

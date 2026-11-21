import { LEASE_QUOTA, territorialLeaseAvailability, visibleTerritorialLeases } from '../engine/territorialLeaseEngine';
import type { Cultivator, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

export function visibleLeaseMapSites(
  world: WorldState,
  view: ReturnType<typeof createTerrainMapView>,
  selected?: Cultivator,
) {
  const result = new Map<string, { role: 'owner' | 'lessee'; remaining: number }>();
  const actor = selected && world.cultivators.find(({ id }) => id === selected.id);
  if (!actor?.alive || actor.hp <= 0) return result;
  const visibleSites = new Set(view.seenLocations.map(({ id }) => id));
  for (const lease of visibleTerritorialLeases(world, actor)) {
    if (lease.status !== 'active' || !visibleSites.has(lease.siteId) || !view.isCurrentLocation(lease.siteId)
      || territorialLeaseAvailability(world, lease) !== 'ready') continue;
    result.set(lease.siteId, {
      role: lease.ownerSectId === actor.sectId ? 'owner' : 'lessee',
      remaining: Math.max(0, LEASE_QUOTA - lease.usedUnits),
    });
  }
  return result;
}

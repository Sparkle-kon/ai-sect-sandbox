import type { SpiritBeast, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

export const BEAST_COLORS: Record<SpiritBeast['kind'], string> = {
  妖兽: '#86efac', 凶兽: '#fda4af', 瑞兽: '#fde68a',
};

export function isLivingBeast(beast: SpiritBeast): boolean {
  return beast.alive && beast.hp > 0;
}

export function visibleBeastsByLocation(world: WorldState, view: ReturnType<typeof createTerrainMapView>) {
  const groups = new Map<string, SpiritBeast[]>();
  const knownSites = new Set(view.seenLocations.map(({ id }) => id));
  for (const beast of world.spiritBeasts ?? []) {
    if (!isLivingBeast(beast) || !knownSites.has(beast.locationId) || !view.isCurrentLocation(beast.locationId)) continue;
    const group = groups.get(beast.locationId) ?? [];
    group.push(beast);
    groups.set(beast.locationId, group);
  }
  return groups;
}

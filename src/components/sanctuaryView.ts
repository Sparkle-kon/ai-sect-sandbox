import { activeSanctuaryPass, SANCTUARY_BLOCK_HP } from '../engine/sanctuaryEngine';
import type { Cultivator, SanctuaryCharter, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

export function wardCharges(charter: SanctuaryCharter): number {
  return Math.max(0, Math.floor(charter.shieldHp / SANCTUARY_BLOCK_HP));
}

/** Only selected subject's live issued rights get map treatment; no other visitors' position exists here. */
export function visibleSanctuaryMapMarks(
  world: WorldState,
  mapView: ReturnType<typeof createTerrainMapView>,
  viewer?: Cultivator,
) {
  const result = new Map<string, number>();
  if (!viewer) return result;
  const pass = activeSanctuaryPass(world, viewer);
  const charter = pass && world.sanctuary.charters.find(({ id }) => id === pass.charterId);
  if (charter && mapView.isCurrentLocation(charter.siteId)) result.set(charter.siteId, wardCharges(charter));
  return result;
}

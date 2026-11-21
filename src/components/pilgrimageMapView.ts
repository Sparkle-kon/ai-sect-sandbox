import { visiblePilgrimages } from '../engine/pilgrimageEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

/** Static checkpoint for the selected participant only; never returns a route or another actor's location. */
export function visiblePilgrimageMapCheckpoint(
  world: WorldState,
  view: ReturnType<typeof createTerrainMapView>,
  viewer?: Cultivator,
) {
  if (!viewer?.alive) return undefined;
  const moving = visiblePilgrimages(world, viewer).find(({ journey, checkpoint }) =>
    journey.status === 'active' && !!checkpoint);
  if (!moving?.checkpoint) return undefined;
  const tile = terrainTileAt(world, moving.checkpoint.x, moving.checkpoint.y);
  if (!tile || view.tileState(tile) !== 'visible') return undefined;
  return { point: moving.checkpoint, row: tile.row + 1, col: tile.col + 1 };
}

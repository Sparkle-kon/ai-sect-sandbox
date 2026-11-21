import { pilgrimageCampCheckpoint, visiblePilgrimages } from '../engine/pilgrimageEngine';
import { currentVisibleTileIds, terrainTileAt } from '../engine/terrainEngine';
import type { Cultivator, MapPoint, WorldState } from '../types/world';
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

/** Anonymous co-located camps share one mark. Fog-off never expands this local observation. */
export function visiblePilgrimageCampMarks(world: WorldState, viewer?: Cultivator):
  Array<{ point: MapPoint; parties: number }> {
  if (!viewer?.alive || viewer.hp <= 0 || !world.cultivators.includes(viewer)) return [];
  const active = world.pilgrimages.journeys.filter(({ camps }) => camps?.some(({ status }) => status === 'pitched'));
  if (!active.length) return [];
  const visible = currentVisibleTileIds(world, viewer);
  const marks = new Map<string, { point: MapPoint; parties: number }>();
  for (const journey of active) {
    const point = pilgrimageCampCheckpoint(world, journey);
    const tile = point && terrainTileAt(world, point.x, point.y);
    if (!point || !tile || !visible.has(tile.id)) continue;
    const key = JSON.stringify([point.x, point.y]);
    const existing = marks.get(key);
    if (existing) existing.parties++;
    else marks.set(key, { point: { ...point }, parties: 1 });
  }
  return [...marks.values()];
}

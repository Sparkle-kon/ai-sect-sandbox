import type { Cultivator, MapPoint, WorldState } from '../types/world';

/** A relieving guard remains a traveller until the real endpoint confirms a new guard assignment. */
export function boundaryReliefCheckpoint(world: WorldState, actor: Cultivator): MapPoint | undefined {
  if (!actor.alive || actor.hp <= 0) return undefined;
  const relief = world.boundaryReliefs.cases.find((row) => row.incomingId === actor.id &&
    (row.status === 'travelling' || row.status === 'returning') && row.originSiteId === actor.locationId &&
    (row.acceptedTick ?? Infinity) <= world.tick);
  if (!relief || !Number.isSafeInteger(relief.pathIndex) || relief.pathIndex < 0 || relief.pathIndex >= relief.path.length) return undefined;
  const point = relief.path[relief.pathIndex];
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? { ...point } : undefined;
}

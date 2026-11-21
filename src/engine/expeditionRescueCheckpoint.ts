import type { Cultivator, MapPoint, WorldState } from '../types/world';

/** A living original member stays at a real route checkpoint, never at the named gate between turns. */
export function expeditionRescueCheckpoint(world: WorldState, actor: Cultivator): MapPoint | undefined {
  if (!actor.alive || actor.hp <= 0) return undefined;
  const row = world.expeditionRescues.requests.find((item) =>
    (item.status === 'extracting' || item.status === 'interrupted' && item.supplySpent === 1 && item.pathIndex > 0 &&
      !item.arrivedIds?.includes(actor.id)) &&
    item.gateSiteId === actor.locationId && (item.acceptedTick ?? Infinity) <= world.tick &&
    (item.explorerId === actor.id || item.rescuerId === actor.id));
  if (!row || !Number.isSafeInteger(row.pathIndex) || row.pathIndex < 0 || row.pathIndex >= row.path.length - 1) return undefined;
  if (!world.occasions.some((occasion) => occasion.id === row.occasionId && occasion.kind === 'expedition' &&
    occasion.status === 'running' && occasion.locationId === row.gateSiteId)) return undefined;
  const point = row.path[row.pathIndex];
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? { ...point } : undefined;
}

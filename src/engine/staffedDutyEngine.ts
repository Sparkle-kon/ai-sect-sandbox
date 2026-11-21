import type { Cultivator, WorldState } from '../types/world';

/** Read the actor's own canonical prepaid run, never an inferred almanac or another actor's station. */
export function hasDueObservatoryDuty(world: WorldState, actor: Cultivator, siteId: string, tick: number): boolean {
  if (!actor.alive || actor.hp <= 0 || actor.locationId !== siteId) return false;
  const { byActor } = world.fieldObservatories;
  if (!Object.hasOwn(byActor,actor.id)) return false;
  return byActor[actor.id].runs.some(run => run.locationId === siteId && run.openedTick < tick && run.targetTick === tick &&
    (run.status === 'pending' || run.status === 'measured'));
}

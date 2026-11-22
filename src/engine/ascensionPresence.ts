import type { Cultivator, WorldState } from '../types/world';

/** A real unresolved trial locks its original body even if new travel claims dispute its present site. */
export function ascensionDutyActive(world: WorldState, actor: Pick<Cultivator, 'id'>): boolean {
  return world.ascension?.trials.some(row =>
    row.actorId === actor.id && !row.terminal && (row.phase === 'warning' || row.phase === 'lightning')) ?? false;
}

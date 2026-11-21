import type { WorldState } from '../types/world';

/** Legacy worlds share the classic ruleset, but a seed alone cannot identify another profile. */
export function sameGeneratedWorld(a: WorldState, b: WorldState): boolean {
  return a.random.seed === b.random.seed &&
    (a.worldgen?.profileId ?? 'classic') === (b.worldgen?.profileId ?? 'classic') &&
    (a.worldgen?.algorithm ?? 1) === (b.worldgen?.algorithm ?? 1);
}

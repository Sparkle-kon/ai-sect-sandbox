import type { WorldState } from '../types/world';

/** Seed, birth rules, and an optional portable scenario distinguish independent ancestries. */
export function sameGeneratedWorld(a: WorldState, b: WorldState): boolean {
  return a.random.seed === b.random.seed &&
    (a.worldgen?.profileId ?? 'classic') === (b.worldgen?.profileId ?? 'classic') &&
    (a.worldgen?.algorithm ?? 1) === (b.worldgen?.algorithm ?? 1) &&
    a.scenarioOrigin?.id === b.scenarioOrigin?.id &&
    a.scenarioOrigin?.version === b.scenarioOrigin?.version &&
    a.scenarioOrigin?.ruleset === b.scenarioOrigin?.ruleset &&
    a.scenarioOrigin?.endTick === b.scenarioOrigin?.endTick;
}

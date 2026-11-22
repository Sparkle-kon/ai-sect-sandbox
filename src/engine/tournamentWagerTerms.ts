import type {TournamentWagerStake} from '../types/tournamentWager';
import type {Cultivator,WorldEvent,WorldOccasion,WorldState} from '../types/world';

export const TOURNAMENT_WAGER_STAKES = [5, 10, 20] as const satisfies readonly TournamentWagerStake[];
export const TOURNAMENT_WAGER_HISTORY = 32;
export const tournamentWagerId = (arenaId: string) => `tournament-wager-${arenaId}`;

export const live = (actor: Cultivator | undefined): actor is Cultivator => !!actor?.alive && actor.hp > 0;
export function unique<T extends { id: string }>(rows: readonly T[], id: string): T | undefined {
  let found: T | undefined;
  for (const row of rows) {
    if (row.id !== id) continue;
    if (found) return undefined;
    found = row;
  }
  return found;
}
export const sameOrder = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((entry, i) => entry === right[i]);

export function exactEvent(world: WorldState, row: WorldOccasion, proof: WorldEvent, suffix: string) {
  return proof.id === `evt-${world.tick}-${row.id}-${suffix}` && proof.tick === world.tick &&
    proof.year === world.year && proof.month === world.month && proof.locationId === row.locationId &&
    proof.category === 'heavenly' && proof.witnessScope === undefined;
}

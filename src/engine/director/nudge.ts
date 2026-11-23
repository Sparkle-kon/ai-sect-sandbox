import type { HighlightKind } from './highlight';
import type { StorytellerDirectorState } from '../../types/storytellerDirector';

export type DirectorNudge =
  | { kind: 'travel_bias'; actorId: string; targetSiteId: string; weight: number; reason: HighlightKind; expiresTick: number }
  | { kind: 'encounter_ticket'; actorId: string; targetSiteId: string; reason: 'encounter'; expiresTick: number }
  | { kind: 'omen_bias'; siteId: string; reason: 'dungeon' | 'tournament'; expiresTick: number }
  | { kind: 'npc_accept_bias'; actorId: string; towardActorId: string; delta: number; reason: HighlightKind; expiresTick: number };

export const DIRECTOR_NUDGE_LIMIT = 24;
export const DIRECTOR_NUDGE_MAX_MONTHS = 6;

/** Expiry is inclusive, allowing the final turn to consume the nudge before post-turn pruning. */
export function pruneExpiredNudges(state: StorytellerDirectorState, tick: number): void {
  if (!state.nudges) return;
  const retained = state.nudges.filter(row => row.expiresTick > tick);
  if (retained.length) state.nudges = retained;
  else delete state.nudges;
}

export function directorNudgeKey(nudge: DirectorNudge): string {
  switch (nudge.kind) {
    case 'travel_bias':
    case 'encounter_ticket': return JSON.stringify([nudge.kind, nudge.actorId, nudge.targetSiteId, nudge.reason]);
    case 'omen_bias': return JSON.stringify([nudge.kind, nudge.siteId, nudge.reason]);
    case 'npc_accept_bias': return JSON.stringify([nudge.kind, nudge.actorId, nudge.towardActorId, nudge.reason]);
  }
}

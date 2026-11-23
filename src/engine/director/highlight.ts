import type { Cultivator, LLMDecisionPayload, WorldState } from '../../types/world';
import type { DirectorNudge } from './nudge';

export const DIRECTOR_HIGHLIGHT_LIMIT = 120;

export const HIGHLIGHT_KINDS = [
  'encounter', 'heart_demon', 'tournament', 'dungeon', 'auction', 'dao_path',
  'forbidden_art', 'bond_reunion', 'quest', 'sequel',
] as const;
export type HighlightKind = typeof HIGHLIGHT_KINDS[number];

export const CONSEQUENCE_TAGS = [
  'item', 'technique', 'bond', 'injury', 'breakthrough', 'lifespan',
  'reputation', 'sect', 'sequel', 'death_risk', 'stones_major',
] as const;
export type ConsequenceTag = typeof CONSEQUENCE_TAGS[number];

export interface HighlightOptionPreview {
  readonly id: string;
  readonly label: string;
  readonly consequences: readonly ConsequenceTag[];
  /** Equivalent variants use the same key; different labels alone do not create a choice. */
  readonly resultKey?: string;
}
export interface HighlightCandidate {
  readonly kind: HighlightKind;
  readonly sourceId: string;
  readonly actorId: string;
  readonly siteId: string;
  readonly baseWeight: number;
  readonly title: string;
  readonly teaser: string;
  readonly options: readonly HighlightOptionPreview[];
}
export interface HighlightOfferKey {
  readonly kind: HighlightKind;
  readonly sourceId: string;
  readonly actorId: string;
  readonly siteId: string;
  readonly openedTick: number;
}
export interface HighlightSource {
  readonly kind: HighlightKind;
  probe(world: WorldState, actor: Cultivator, executionTick?: number): readonly HighlightCandidate[];
  seed?(world: WorldState, actor: Cultivator): DirectorNudge | undefined;
  choose?(world: WorldState, actor: Cultivator, candidate: HighlightCandidate, optionId: string): boolean;
  readonly nextMonth?: true;
  decision?(world: WorldState, actor: Cultivator, candidate: HighlightCandidate, optionId: string, executionTick?: number): LLMDecisionPayload | undefined;
}

const basic = new Set(['rest', 'cultivate', 'talk', 'travel', 'socialize', 'explore']);
/** The sole counting predicate for the director, gameplay projections, and the offline audit. */
export function isHighlight(candidate: Pick<HighlightCandidate, 'options'>): boolean {
  const options = candidate.options.filter(row => row.id.trim().length > 0);
  if (new Set(options.map(row => row.id)).size < 2 ||
      new Set(options.map(row => row.resultKey ?? row.id)).size < 2) return false;
  return options.some(row => !basic.has(row.id.trim().toLowerCase()) &&
    row.consequences.some(tag => CONSEQUENCE_TAGS.includes(tag)));
}

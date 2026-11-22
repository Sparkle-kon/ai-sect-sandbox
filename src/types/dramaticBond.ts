import type { Sect } from './world';

export const DRAMATIC_BOND_FACT_KINDS = ['encounter', 'practice', 'duel', 'lethal_duel'] as const;
export type DramaticBondFactKind = typeof DRAMATIC_BOND_FACT_KINDS[number];
export type DramaticBondAlignment = Sect['alignment'];

export interface DramaticBondFact {
  kind: DramaticBondFactKind;
  sourceEventId: string;
  tick: number;
  year: number;
  month: number;
  siteId: string;
  venueKindAtSource: 'market' | 'sect_hq';
  /** In the original initiating/answering order, never outcome order. */
  actorIds: [string, string];
  /** Mutually corroborated actual viewers of the public pair scene, not a map proximity guess. */
  witnessIds?: string[];
  alignmentsAtSource?: [DramaticBondAlignment, DramaticBondAlignment];
  winnerId?: string;
  fallenId?: string;
}

export interface DramaticBondState {
  facts: DramaticBondFact[];
}

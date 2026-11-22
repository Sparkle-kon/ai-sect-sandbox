import type { SectRank } from './world';

export const GRAND_SIEGE_HERO_MOVES = ['elder-rescue', 'leader-last-stand', 'hold'] as const;
export type GrandSiegeHeroMove = typeof GRAND_SIEGE_HERO_MOVES[number];
export type GrandSiegeHeroOrigin = 'player' | 'utility' | 'model';
export type GrandSiegeTerminalStatus = 'victory' | 'repelled' | 'withdrawn';

export interface GrandSiegeFighter {
  actorId: string;
  sectId: string;
  rank?: SectRank;
}

export interface GrandSiegeVanguardClash {
  attackerId: string;
  defenderId: string;
  winnerId: string;
  attackerDamage: number;
  defenderDamage: number;
}

export interface GrandSiegeHeroOrder {
  actorId: string;
  move: GrandSiegeHeroMove;
  queuedTick: number;
}

export interface GrandSiegeHeroResult {
  actorId: string;
  move: Exclude<GrandSiegeHeroMove, 'hold'>;
  origin: GrandSiegeHeroOrigin;
  rank: SectRank;
  paidQi: number;
  paidHp: number;
  wallSaved: number;
}

export interface GrandSiegeRound {
  round: number;
  tick: number;
  sourceEventId: string;
  wallBefore: number;
  wallAfter: number;
  wallMax: number;
  attackers: GrandSiegeFighter[];
  defenders: GrandSiegeFighter[];
  clash?: GrandSiegeVanguardClash;
  hero?: GrandSiegeHeroResult;
}

export interface GrandSiegeTheatre {
  openedTick: number;
  sourceLaunchId: string;
  arrivedTick?: number;
  rounds: GrandSiegeRound[];
  queued?: GrandSiegeHeroOrder;
  terminal?: { tick: number; status: GrandSiegeTerminalStatus; sourceEventId: string; battlefield: boolean };
}

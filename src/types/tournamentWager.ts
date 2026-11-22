export type TournamentWagerStake = 5 | 10 | 20;
export type TournamentWagerStatus = 'open' | 'won' | 'lost' | 'refunded' | 'forfeited';

export interface TournamentWagerSettlement {
  tick: number;
  eventId: string;
  /** Total credited back to the original bearer only. */
  payout: number;
  /** Newly issued virtual spectacle award; the other portion was the bearer’s own stake. */
  award: number;
  winnerId?: string;
}

export interface TournamentWagerTicket {
  id: string;
  arenaId: string;
  siteId: string;
  spectatorId: string;
  contenderId: string;
  stake: TournamentWagerStake;
  placedTick: number;
  status: TournamentWagerStatus;
  settlement?: TournamentWagerSettlement;
}

export interface TournamentWagerState { tickets: TournamentWagerTicket[] }

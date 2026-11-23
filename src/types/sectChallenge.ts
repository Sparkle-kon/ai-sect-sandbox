export const SECT_CHALLENGE_HISTORY_LIMIT=12;
export const SECT_CHALLENGE_EXPIRY_MONTHS=4;
export const SECT_CHALLENGE_INJURY_LIMIT=12;
export const SECT_CHALLENGE_DIRECTIONS=['outbound','inbound'] as const;
export type SectChallengeDirection=typeof SECT_CHALLENGE_DIRECTIONS[number];

export interface SectChallengeIdentity {
  readonly id:string;
  readonly createdTick:number;
  readonly expiresTick:number;
  readonly direction:SectChallengeDirection;
  readonly challengerId:string;
  readonly defenderId:string;
  readonly challengerSectId:string;
  readonly defenderSectId:string;
  readonly siteId:string;
}

export interface SectChallengeOffer extends SectChallengeIdentity {
  readonly phase:'awaiting_response'|'traveling';
}

export type SectChallengeResult=SectChallengeIdentity&({readonly resolvedTick:number}&(
  | {readonly outcome:'completed';readonly eventId:string;readonly winnerId:string;readonly loserId:string;readonly injury:number;readonly reputationMoved:0|1}
  | {readonly outcome:'refused'|'expired'}
));

export interface SectChallengeState {
  readonly pending?:SectChallengeOffer;
  readonly history:readonly SectChallengeResult[];
  readonly lastOfferTick?:number;
}

export const sectChallengeId=(direction:SectChallengeDirection,createdTick:number):string=>`sect-challenge-${direction}-${createdTick}`;
export const sectChallengeEventId=(offer:Pick<SectChallengeIdentity,'id'>,resolvedTick:number):string=>`evt-${resolvedTick}-${offer.id}-completed`;

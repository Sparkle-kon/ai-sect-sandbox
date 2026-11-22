import type { NativeDuelRolls } from './forbiddenArt';

export type BeastDuelChoice = 'guard' | 'withdraw' | 'decline';
export interface BeastDuelContact {
  id: string;
  attackerId: string;
  defenderId: string;
  ownerId: string;
  beastId: string;
  siteId: string;
  openedTick: number;
  rolls: NativeDuelRolls;
  guided: boolean;
  guideUntilTick?: number;
  guideSwitchTick?: number;
  queued?: { choice: BeastDuelChoice; tick: number; destinationId?: string };
}
export interface BeastDuelChoiceOption {
  choice: BeastDuelChoice;
  destinationId?: string;
  destinationName?: string;
}
export interface BeastDuelGuard {
  absorbed: number;
  beastHpBefore: number;
  beastHpAfter: number;
  severed: boolean;
}
export interface BeastDuelView {
  contactId: string;
  ownerId: string;
  beastName: string;
  ownerHp: number;
  beastHp: number;
  options: readonly BeastDuelChoiceOption[];
  queued?: Readonly<NonNullable<BeastDuelContact['queued']>>;
}

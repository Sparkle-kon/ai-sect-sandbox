import type { NativeDuelRolls } from './forbiddenArt';

export type SchoolFormDuelChoice = 'counter' | 'stop';

/** Actual outstanding ordinary challenge. Rolls were drawn by the original challenge, not the response. */
export interface SchoolFormDuelContact {
  id: string;
  attackerId: string;
  defenderId: string;
  lessonId: string;
  practiceTick: number;
  siteId: string;
  openedTick: number;
  rolls: NativeDuelRolls;
}

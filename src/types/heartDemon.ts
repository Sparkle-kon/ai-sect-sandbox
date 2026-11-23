import type { MemoryEntry, PersonalityTrait, ReflectionTheme } from './world';

export const HEART_DEMON_CHOICES = ['sever', 'wrath', 'face'] as const;
export type HeartDemonChoice = typeof HEART_DEMON_CHOICES[number];
export type HeartDemonOrigin = 'player' | 'utility' | 'model' | 'director';
export type HeartDemonOutcome = 'passed' | 'failed' | 'died';

export interface HeartDemonGuide {
  actorId: string;
  trialId: string;
  grantedTick: number;
  bindingGeneration: number;
  originalPossessionUntilTick: number;
}

export type HeartDemonEvidence =
  | { kind: 'mirror' }
  | { kind: 'reflection'; reflectionId: string; reflectionTick: number; theme: ReflectionTheme;
      memoryId: string; memoryTick: number; memoryCategory: MemoryEntry['category'] }
  | { kind: 'bond'; otherActorId: string; role: '血仇' | '道侣' | '师徒' | '挚友'; source:
        { kind: 'scene'; eventId: string; tick: number } |
        { kind: 'lineage'; mentorId: string; studentId: string; tick: number } };

export interface HeartDemonResult {
  choice: HeartDemonChoice;
  origin: HeartDemonOrigin;
  resolvedTick: number;
  outcome: HeartDemonOutcome;
  damage: number;
  karmaDelta: number;
  masteryDelta: number;
  personalityBefore?: PersonalityTrait;
  personalityAfter?: PersonalityTrait;
}

export interface HeartDemonFrame {
  id: string;
  actorId: string;
  siteId: string;
  openedTick: number;
  finalWaveEventId: string;
  evidence: HeartDemonEvidence;
  queued?: { choice: HeartDemonChoice; queuedTick: number };
  releasedTick?: number;
  cancelledTick?: number;
  result?: HeartDemonResult;
}

/** Owner-only receipt of a real survived resolution. No remembered content or subjects. */
export interface HeartDemonAftermath {
  trialId: string;
  resultEventId: string;
  siteId: string;
  resolvedTick: number;
  choice: HeartDemonChoice;
  outcome: Exclude<HeartDemonOutcome, 'died'>;
  endsTick: number;
  recovery?: {tick:number;siteId:string;qiBefore:number;qiPaid:number;eventId:string};
}

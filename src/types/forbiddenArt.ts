export const FORBIDDEN_ART_IDS = [
  'taixu-sword-seal',
  'blood-sea-veil',
  'meridian-reversal',
  'falling-star-echo',
  'abyss-wave-split',
  'thunder-body-seal',
  'heart-lantern-flame',
  'frost-mirror-break',
  'severed-shadow-flight',
  'verdant-last-breath',
] as const;

export type ForbiddenArtId = typeof FORBIDDEN_ART_IDS[number];
export type ForbiddenArtChoice = ForbiddenArtId | 'decline';
export type ForbiddenArtOutcome = 'reversal' | 'escape' | 'survived' | 'fallen';
export type ForbiddenArtOrigin = 'player' | 'utility' | 'model';
export type NativeDuelRolls = [number, number, number, number];

export interface ForbiddenArtCost {
  hp: number;
  lifespan: number;
  durability: number;
}

export interface ForbiddenDuelContact {
  id: string;
  attackerId: string;
  defenderId: string;
  ownerId: string;
  artifactId: string;
  siteId: string;
  openedTick: number;
  rolls: NativeDuelRolls;
  guided: boolean;
  queued?: { choice: ForbiddenArtChoice; tick: number };
}

export interface ForbiddenArtScar {
  id: string;
  contactId: string;
  artId: ForbiddenArtId;
  ownerId: string;
  opponentId: string;
  artifactId: string;
  siteId: string;
  openedTick: number;
  tick: number;
  paid: ForbiddenArtCost;
  result: ForbiddenArtOutcome;
  origin: ForbiddenArtOrigin;
}

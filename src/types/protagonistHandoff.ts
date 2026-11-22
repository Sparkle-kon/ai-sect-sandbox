export type ProtagonistHandoffTieKind = 'encounter' | 'practice' | 'duel';

export interface ProtagonistHandoffTie {
  kind: ProtagonistHandoffTieKind;
  eventId: string;
  tick: number;
  siteId: string;
}

export interface ProtagonistHandoff {
  exitKind: 'public_death' | 'ascension';
  exitEventId: string;
  ties: ProtagonistHandoffTie[];
}

export const ROGUELIKE_ENCOUNTER_KINDS=['sword-cave','wounded-traveler','sealed-scroll'] as const;
export const ROGUELIKE_ENCOUNTER_CHOICES=['cautious','bold','leave'] as const;
export type RoguelikeEncounterKind=(typeof ROGUELIKE_ENCOUNTER_KINDS)[number];
export type RoguelikeEncounterChoice=(typeof ROGUELIKE_ENCOUNTER_CHOICES)[number];

export interface RoguelikeEncounterOutcome {
  success:boolean;
  qiDelta:number;
  hpDelta:number;
  karmaDelta:number;
  lifespanDelta:number;
  affinityDelta:number;
}

/** A native visited site and a single opportunity for one actor, not an instruction supplied by a model. */
export interface RoguelikeEncounterRecord {
  id:string;
  actorId:string;
  fromSiteId:string;
  siteId:string;
  openedTick:number;
  kind:RoguelikeEncounterKind;
  guided:boolean;
  witnessId?:string;
  status:'offered'|'resolved'|'expired';
  resolvedTick?:number;
  choice?:RoguelikeEncounterChoice;
  outcome?:RoguelikeEncounterOutcome;
}

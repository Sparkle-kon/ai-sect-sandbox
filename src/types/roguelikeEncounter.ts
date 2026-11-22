export const ROGUELIKE_ENCOUNTER_KINDS=['sword-cave','wounded-traveler','sealed-scroll','sect-gate'] as const;
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
  sectReputationDelta?:number;
}

export interface SectGateTrialStamp {
  sectId:string;
  leaderId:string;
  possessionUntilTick:number;
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
  sectGate?:SectGateTrialStamp;
  status:'offered'|'resolved'|'expired';
  resolvedTick?:number;
  choice?:RoguelikeEncounterChoice;
  outcome?:RoguelikeEncounterOutcome;
}

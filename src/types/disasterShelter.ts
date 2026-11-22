import type {RouteWarningHazardProof} from './world';

export type DisasterShelterMove='offer'|'accept'|'decline'|'withdraw'|'return';
export type DisasterShelterStatus='offered'|'reserved'|'outbound'|'occupied'|'returning'|'returned'|'declined'|'withdrawn'|'expired'|'stranded'|'lost';
export interface DisasterShelterParty {
  actorId:string; householdId:string; volunteerId:string; settlementId:string; siteId:string;
}
export interface DisasterShelterStep {tick:number;pathIndex:number;tileId:string;direction:'outbound'|'return'}
export interface DisasterShelter {
  id:string;
  host:DisasterShelterParty;
  guest:DisasterShelterParty;
  shelterProjectId:string;
  agreementId:string;
  deliveredTick:number;
  disasterRecordId:string;
  disasterTick:number;
  hazard:RouteWarningHazardProof;
  path:string[];
  offeredTick:number;
  expiresTick:number;
  status:DisasterShelterStatus;
  pathIndex:number;
  steps:DisasterShelterStep[];
  acceptedTick?:number;
  departedTick?:number;
  arrivedTick?:number;
  returnRequestedTick?:number;
  returnDepartedTick?:number;
  returnedTick?:number;
  closedTick?:number;
  closeReason?:'declined'|'withdrawn'|'expired'|'party_unavailable'|'site_unavailable';
}
export interface DisasterShelterState {cases:DisasterShelter[];nextId:number}
export type DisasterShelterOption={action:'DISASTER_SHELTER'}&(
  | {disasterShelterMove:'offer';targetCultivatorId:string;targetDisasterShelterId?:never}
  | {disasterShelterMove:Exclude<DisasterShelterMove,'offer'>;targetDisasterShelterId:string;targetCultivatorId?:never}
);

export const SCRIBE_COMMISSION_DEPOSIT=8;
export const SCRIBE_COMMISSION_INK=2;
export const SCRIBE_COMMISSION_WAGE=6;
export const SCRIBE_COMMISSION_OFFER_TICKS=3;
export const SCRIBE_COMMISSION_WORK_TICKS=6;

export type ScribeCommissionMove='offer'|'accept'|'decline'|'withdraw'|'verify'|'deliver';
export type ScribeCommissionStatus='offered'|'accepted'|'verified'|'delivered'|'declined'|'withdrawn'|'expired'|'unavailable';
export type ScribeCommissionOption={action:'SCRIBE_COMMISSION'}&(
  {scribeCommissionMove:'offer';targetCultivatorId:string;targetChronicleSourceId:string;targetScribeCommissionId?:never}|
  {scribeCommissionMove:Exclude<ScribeCommissionMove,'offer'>;targetScribeCommissionId:string;targetCultivatorId?:never;targetChronicleSourceId?:never}
);
export interface ScribeCommissionVerification {
  tick:number;
  inkPaid:typeof SCRIBE_COMMISSION_INK;
  retellingIds:[]|[string,string];
  correctionId?:string;
}
export interface ScribeManuscript {
  id:string;
  tick:number;
  wagePaid:typeof SCRIBE_COMMISSION_WAGE;
}
export interface ScribeCommission {
  id:string;
  patronId:string;
  scribeId:string;
  siteId:string;
  sourceEventId:string;
  sourceTick:number;
  offeredTick:number;
  offerExpiresTick:number;
  status:ScribeCommissionStatus;
  escrowStones:number;
  refundedStones:number;
  acceptedTick?:number;
  workExpiresTick?:number;
  closedTick?:number;
  unavailableActorId?:string;
  verification?:ScribeCommissionVerification;
  manuscript?:ScribeManuscript;
}
export interface ScribeCommissionState {
  version:1;
  nextId:number;
  commissions:ScribeCommission[];
}
export interface ScribeCommissionManuscriptView {
  title:string;
  body:string;
  sourceTitle:string;
  disagreement?:{witnessA:string;witnessB:string};
  correction?:string;
}

export const scribeCommissionId=(serial:number)=>`scribe-commission-${serial}`;
export const scribeManuscriptId=(commissionId:string)=>`scribe-manuscript-${commissionId}`;
export const scribeCommissionEventId=(id:string,tick:number,phase:ScribeCommissionMove|'expired'|'unavailable')=>`evt-${id}-${tick}-${phase}`;

export type AbandonedQuarterMove='inspect'|'stay'|'leave';
export type AbandonedQuarterOption={action:'ABANDONED_QUARTER';targetAbandonedQuarterId:string}&(
  {abandonedQuarterMove:'inspect'|'stay';targetLocationId?:never}|{abandonedQuarterMove:'leave';targetLocationId:string});
export interface AbandonedQuarterVisit {
  id:string;actorId:string;settlementId:string;siteId:string;enteredTick:number;fromSiteId:string;migrationId:string;
  supersededTick?:number;
  formerRecruitmentId?:string;inspectedTick?:number;stayedTick?:number;left?:{tick:number;destinationId:string;byChoice:boolean};
}
export interface AbandonedQuarterState {visits:AbandonedQuarterVisit[]}
export interface AbandonedQuarterView {
  siteId?:string;siteName:string;villageName:string;standing:'former_resident'|'visitor';options:readonly AbandonedQuarterOption[];
  receipt?:{title:string;description:string};
}

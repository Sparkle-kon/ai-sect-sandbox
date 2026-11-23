export type VillageReunionMove='remember'|'part'|'offer'|'accept';
export type VillageReunionOption={action:'VILLAGE_REUNION'; targetVillageReunionId:string; villageReunionMove:VillageReunionMove};
export interface VillageReunionPair {
  id:string;villageId:string;firstVolunteerId:string;secondVolunteerId:string;firstHouseholdId:string;secondHouseholdId:string;
  firstRecruitTick:number;firstRecruiterId:string;firstActorId:string;
  secondRecruitTick?:number;secondRecruiterId?:string;secondActorId?:string;
  arrival?:{tick:number;siteId:string;fromSiteId:string;actorId:string};
  decisions?:{actorId:string;tick:number;move:VillageReunionMove;expiresTick?:number}[];
  refundTick?:number;
}
export interface VillageReunionState {pairs:VillageReunionPair[]}
export interface VillageReunionView {
  siteId?:string;siteName:string;villageName:string;options:readonly VillageReunionOption[];receipt?:{title:string;description:string};
}

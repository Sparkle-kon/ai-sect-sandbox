export type VacantGateMove='guard'|'withdraw';
export interface VacantGateWardProof {dispatcherId:string;dispatchTick:number;dutyTick:number}
export interface VacantGateRecord {
  siegeId:string;siteId:string;lostActorId:string;lostRole:'leader'|'ward_keeper';lossTick:number;lossEventId:string;
  requestedActorIds?:string[];
  wardProof?:VacantGateWardProof;
  roundTick:number;roundEventId:string;actorId:string;move:VacantGateMove;paidQi:0|8;wallSaved?:number;destinationId?:string;
}
export interface VacantGateState {records:VacantGateRecord[]}
export type VacantGateOption={action:'VACANT_GATE';targetVacantGateSiegeId:string}&(
  {vacantGateMove:'guard';targetLocationId?:never}|{vacantGateMove:'withdraw';targetLocationId:string});
export interface VacantGateView {
  siteName:string;lostRole:'leader'|'ward_keeper';options:readonly VacantGateOption[];
  notice?:string;
  receipt?:{title:string;description:string};
}

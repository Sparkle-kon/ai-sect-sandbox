export interface ReliefHomecomingDeparture {actorId:string;villageId:string;siteId:string;tick:number}
export interface ReliefHomecomingScene {
  id:string;villageId:string;siteId:string;travelerId:string;helperId:string;departureTick:number;
  disasterRecordId:string;hazardId:string;hazardExpiresTick:number;reliefRecordId:string;deedId:string;reliefTick:number;
  aidWitnessIds:string[];return?:{tick:number;witnessIds:string[]};
}
export interface ReliefHomecomingState {departures:ReliefHomecomingDeparture[];scenes:ReliefHomecomingScene[]}
export interface ReliefHomecomingView {
  siteId:string;siteName:string;beats:readonly {kind:'relief'|'return';tick:number;title:string;line:string}[];
}

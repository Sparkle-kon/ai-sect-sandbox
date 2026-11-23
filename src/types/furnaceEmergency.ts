export type FurnaceEmergencyMove='brace'|'retreat'|'request_rescue'|'accept_rescue';
export type FurnaceEmergencyOption={action:'FURNACE_EMERGENCY';targetFurnaceEmergencyId:string}&(
  {furnaceEmergencyMove:'retreat';targetLocationId:string}|
  {furnaceEmergencyMove:Exclude<FurnaceEmergencyMove,'retreat'>;targetLocationId?:never});
export interface FurnaceEmergencyCase {
  id:string;safetyId:string;siteId:string;studentId:string;mentorId:string;tuitionId:string;
  usedTick:number;damagedTick:number;hazardId:string;injuryEventId:string;injuryHp:number;
  decision?:{move:'brace'|'retreat'|'request_rescue';tick:number;refugeId?:string;appliedTick?:number;preventedHp?:number;
    storedRoot?:1;returnedTick?:number;acceptedTick?:number;crossedTick?:number};
}
export interface FurnaceEmergencyState {cases:FurnaceEmergencyCase[]}
export interface FurnaceEmergencyView {siteName:string;siteId?:string;options:readonly FurnaceEmergencyOption[];receipt?:{title:string;description:string}}

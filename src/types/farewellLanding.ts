export type FarewellLandingMove='keep_light'|'farewell';
export const FAREWELL_LANDING_SITE='frontier-east-dock' as const;
export const FAREWELL_LIGHT_TICKS=3;
export interface FarewellLandingRecord {
  id:string;actorId:string;deceasedId:string;deathEventId:string;sharedEventId:string;visitId:string;
  siteId:typeof FAREWELL_LANDING_SITE;tick:number;move:FarewellLandingMove;paidStones:0|1;lightUntilTick?:number;
}
export interface FarewellLandingState {records:FarewellLandingRecord[]}
export interface FarewellLandingOption {
  action:'FAREWELL_LANDING';farewellLandingMove:FarewellLandingMove;targetFarewellDeceasedId:string;
}
export interface FarewellLandingView {
  siteName:string;deceasedName:string;options:readonly FarewellLandingOption[];
  receipt?:{title:string;description:string};
  light?:{chartId:'chart-east-offshore';tileId:typeof FAREWELL_LANDING_SITE};
}

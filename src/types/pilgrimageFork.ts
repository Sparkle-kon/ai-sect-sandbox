import type {MapPoint} from './world';
export type PilgrimageForkMove='escort'|'detour'|'remain';
export type PilgrimageForkOption={action:'PILGRIMAGE_FORK';targetPilgrimageForkId:string}&(
  {pilgrimageForkMove:'remain';targetLocationId?:never}|{pilgrimageForkMove:'escort'|'detour';targetLocationId:string});
export interface PilgrimageForkChoice {
  actorId:string;tick:number;move:PilgrimageForkMove;targetLocationId?:string;
  path?:MapPoint[];pathIndex?:number;steps?:(MapPoint&{tick:number})[];
  status:'remaining'|'waiting'|'traveling'|'arrived'|'closed';
  paidStones:0|8;
}
export interface PilgrimageForkRecord {
  id:string;journeyId:string;siteId:string;arrivalTick:number;arrivalEventId:string;actors:[string,string];escortSiteId:string;
  closedTick?:number;choices:PilgrimageForkChoice[];
}
export interface PilgrimageForkState {forks:PilgrimageForkRecord[]}
export interface PilgrimageForkView {
  siteName:string;siteId?:string;options:readonly PilgrimageForkOption[];sharedWalk?:true;receipt?:{title:string;description:string};
}

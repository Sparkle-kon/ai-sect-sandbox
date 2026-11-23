export type BoundaryGapMove='cover'|'refuse'|'stay';
export type BoundaryGapOption={action:'BOUNDARY_GAP';targetBoundaryGapId:string}&(
  {boundaryGapMove:'cover';targetCultivatorId:string}|{boundaryGapMove:'refuse'|'stay';targetCultivatorId?:never});
export interface BoundaryGapResponse {
  reliefId:string;postSiteId:string;actorId:string;gapTick:number;tick:number;move:BoundaryGapMove;
  targetCultivatorId?:string;applied?:{tick:number;hazardId:string;preventedHp:number};
}
export interface BoundaryGapState {responses:BoundaryGapResponse[]}
export interface BoundaryGapView {
  siteName:string;siteId?:string;status:'gap'|'relieved'|'returned';options:readonly BoundaryGapOption[];
  receipt?:{title:string;description:string};
}

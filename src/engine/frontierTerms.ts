import type {FrontierProductionState} from './frontierProductionTerms';
import type {FrontierTradeState} from './frontierTradeTerms';

export const FRONTIER_REGIONS=['north-snow','south-marsh'] as const;
export type FrontierRegionId=typeof FRONTIER_REGIONS[number];
export type FrontierPositionPlane='frontier';
export type FrontierChartId='chart-north-snow'|'chart-south-marsh';
export type FrontierAnchorId='loc-vein-north'|'loc-market';
export type FrontierMovementMove='enter'|'travel'|'exit'|'settle';
export const FRONTIER_ENTER_STONES=8;
export const FRONTIER_ENTER_ROOTS=1;
export const FRONTIER_SETTLE_STONES=4;
export const FRONTIER_SETTLE_ROOTS=1;
export const FRONTIER_SITE_IDS=[
  'frontier-north-gate','frontier-north-pass','frontier-north-home','frontier-north-spring','frontier-north-plot',
  'frontier-north-lee-west','frontier-north-lee-mid','frontier-north-lee-east',
  'frontier-south-gate','frontier-south-crossway','frontier-south-home','frontier-south-sluice','frontier-south-field-west','frontier-south-field-east',
] as const;
export type FrontierSiteId=typeof FRONTIER_SITE_IDS[number];
export interface FrontierSite {
  id:FrontierSiteId;regionId:FrontierRegionId;chartId:FrontierChartId;col:number;row:number;name:string;
  role:'gate'|'pass'|'home'|'spring'|'winter-plot'|'bypass'|'sluice'|'field';
}
const north='north-snow',south='south-marsh',nc='chart-north-snow',sc='chart-south-marsh';
export const FRONTIER_SITES:readonly FrontierSite[]=[
  {id:'frontier-north-lee-west',regionId:north,chartId:nc,col:0,row:0,name:'西背风台',role:'bypass'},
  {id:'frontier-north-lee-mid',regionId:north,chartId:nc,col:1,row:0,name:'背风石脊',role:'bypass'},
  {id:'frontier-north-lee-east',regionId:north,chartId:nc,col:2,row:0,name:'东背风台',role:'bypass'},
  {id:'frontier-north-gate',regionId:north,chartId:nc,col:0,row:1,name:'雪谷关',role:'gate'},
  {id:'frontier-north-pass',regionId:north,chartId:nc,col:1,row:1,name:'北岭直脊',role:'pass'},
  {id:'frontier-north-home',regionId:north,chartId:nc,col:2,row:1,name:'雪谷聚落',role:'home'},
  {id:'frontier-north-spring',regionId:north,chartId:nc,col:1,row:2,name:'护泉眼',role:'spring'},
  {id:'frontier-north-plot',regionId:north,chartId:nc,col:2,row:2,name:'冬药圃',role:'winter-plot'},
  {id:'frontier-south-sluice',regionId:south,chartId:sc,col:1,row:0,name:'起潮水闸',role:'sluice'},
  {id:'frontier-south-field-east',regionId:south,chartId:sc,col:2,row:0,name:'东轮田',role:'field'},
  {id:'frontier-south-gate',regionId:south,chartId:sc,col:0,row:1,name:'灵田泽关',role:'gate'},
  {id:'frontier-south-crossway',regionId:south,chartId:sc,col:1,row:1,name:'泽心埂',role:'pass'},
  {id:'frontier-south-home',regionId:south,chartId:sc,col:2,row:1,name:'南泽聚落',role:'home'},
  {id:'frontier-south-field-west',regionId:south,chartId:sc,col:1,row:2,name:'西轮田',role:'field'},
];
interface FrontierChart {id:FrontierChartId;name:string;columns:3;rows:3;anchorId:FrontierAnchorId;anchorTileId:string;gateId:FrontierSiteId;homeId:FrontierSiteId}
export const FRONTIER_CHARTS:Readonly<Record<FrontierRegionId,FrontierChart>>={
 [north]:{id:nc,name:'北岭雪谷',columns:3,rows:3,anchorId:'loc-vein-north',anchorTileId:'tile-12-2',
  gateId:'frontier-north-gate',homeId:'frontier-north-home'},
 [south]:{id:sc,name:'南泽灵田',columns:3,rows:3,anchorId:'loc-market',anchorTileId:'tile-12-12',
  gateId:'frontier-south-gate',homeId:'frontier-south-home'},
};
export interface FrontierEdge {from:FrontierSiteId;to:FrontierSiteId;winterClosed?:true}
export const FRONTIER_EDGES:readonly FrontierEdge[]=[
 {from:'frontier-north-gate',to:'frontier-north-pass',winterClosed:true},
 {from:'frontier-north-pass',to:'frontier-north-home',winterClosed:true},
 {from:'frontier-north-gate',to:'frontier-north-lee-west'},
 {from:'frontier-north-lee-west',to:'frontier-north-lee-mid'},
 {from:'frontier-north-lee-mid',to:'frontier-north-lee-east'},
 {from:'frontier-north-lee-east',to:'frontier-north-home'},
 {from:'frontier-north-pass',to:'frontier-north-spring',winterClosed:true},
 {from:'frontier-north-spring',to:'frontier-north-plot'},
 {from:'frontier-north-plot',to:'frontier-north-home'},
 {from:'frontier-south-gate',to:'frontier-south-crossway'},
 {from:'frontier-south-crossway',to:'frontier-south-home'},
 {from:'frontier-south-crossway',to:'frontier-south-sluice'},
 {from:'frontier-south-crossway',to:'frontier-south-field-west'},
 {from:'frontier-south-sluice',to:'frontier-south-field-east'},
 {from:'frontier-south-home',to:'frontier-south-field-east'},
];
export const frontierSite=(id:string):FrontierSite|undefined=>FRONTIER_SITES.find(row=>row.id===id);
export const frontierEdge=(from:string,to:string):FrontierEdge|undefined=>FRONTIER_EDGES.find(row=>
  row.from===from&&row.to===to||row.to===from&&row.from===to);
export const frontierWinter=(month:number):boolean=>month===12||month===1||month===2;
export const frontierStepMonth=(month:number,advance:number):number=>(month-1+advance)%12+1;
export interface FrontierStep {tick:number;siteId:FrontierSiteId}
export interface FrontierVisit {
  id:string;actorId:string;regionId:FrontierRegionId;anchorId:FrontierAnchorId;enteredTick:number;
  paidStones:8;paidRoots:1;steps:FrontierStep[];exitedTick?:number;deceasedTick?:number;
}
export interface FrontierResidence {
  id:string;actorId:string;regionId:FrontierRegionId;homeSiteId:FrontierSiteId;visitId:string;
  settledTick:number;paidStones:4;paidRoots:1;
}
export interface FrontierState {
  version:1;visits:FrontierVisit[];residences:FrontierResidence[];
  production?:FrontierProductionState;trade?:FrontierTradeState;
}
export const frontierVisitId=(tick:number,actorId:string)=>`frontier-visit-${tick}-${actorId}`;
export const frontierResidenceId=(tick:number,actorId:string)=>`frontier-home-${tick}-${actorId}`;

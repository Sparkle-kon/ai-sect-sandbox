import type { FrontierNightHuntState } from '../types/frontierNightHunt';
import type {FrontierDrylandsState} from './frontierDrylandTerms';
import type {FrontierProductionState} from './frontierProductionTerms';
import type {FrontierTradeState} from './frontierTradeTerms';
import type {FrontierPortState} from './frontierPortTerms';

export const FRONTIER_FARM_REGIONS=['north-snow','south-marsh'] as const;
export type FrontierFarmRegionId=typeof FRONTIER_FARM_REGIONS[number];
export const FRONTIER_DRYLAND_REGIONS=['western-saltwell','plateau-thunderridge'] as const;
export type FrontierDrylandRegionId=typeof FRONTIER_DRYLAND_REGIONS[number];
export const isFrontierDrylandRegion=(value:unknown):value is FrontierDrylandRegionId=>
  value==='western-saltwell'||value==='plateau-thunderridge';
export const FRONTIER_REGIONS=[...FRONTIER_FARM_REGIONS,'east-offshore',...FRONTIER_DRYLAND_REGIONS] as const;
export const isFrontierFarmRegion=(value:unknown):value is FrontierFarmRegionId=>value==='north-snow'||value==='south-marsh';
export type FrontierRegionId=typeof FRONTIER_REGIONS[number];
export type FrontierPositionPlane='frontier';
export type FrontierFarmChartId='chart-north-snow'|'chart-south-marsh';
export type FrontierDrylandChartId='chart-western-saltwell'|'chart-plateau-thunderridge';
export type FrontierChartId=FrontierFarmChartId|FrontierDrylandChartId|'chart-east-offshore';
export const FRONTIER_ANCHOR_IDS=['loc-vein-north','loc-market','loc-market-east','loc-taixu','loc-tianji'] as const;
export type FrontierAnchorId=typeof FRONTIER_ANCHOR_IDS[number];
export type FrontierMovementMove='enter'|'travel'|'exit'|'settle';
export const FRONTIER_ENTER_STONES=8;
export const FRONTIER_ENTER_ROOTS=1;
export const FRONTIER_SETTLE_STONES=4;
export const FRONTIER_SETTLE_ROOTS=1;
export const FRONTIER_SITE_IDS=[
  'frontier-north-gate','frontier-north-pass','frontier-north-home','frontier-north-spring','frontier-north-plot',
  'frontier-north-lee-west','frontier-north-lee-mid','frontier-north-lee-east',
  'frontier-south-gate','frontier-south-crossway','frontier-south-home','frontier-south-sluice','frontier-south-field-west','frontier-south-field-east',
  'frontier-east-gate','frontier-east-causeway','frontier-east-home','frontier-east-dock','frontier-east-boatyard',
  'frontier-east-tideflat','frontier-east-warehouse','frontier-east-outer',
  'frontier-west-gate','frontier-west-trail','frontier-west-home','frontier-west-well',
  'frontier-west-saltbed','frontier-west-trial','frontier-west-warehouse',
  'frontier-ridge-gate','frontier-ridge-saddle','frontier-ridge-home','frontier-ridge-pasture',
  'frontier-ridge-quarry','frontier-ridge-ward','frontier-ridge-warehouse',
] as const;
export type FrontierSiteId=typeof FRONTIER_SITE_IDS[number];
export interface FrontierSite {
  id:FrontierSiteId;regionId:FrontierRegionId;chartId:FrontierChartId;col:number;row:number;name:string;
  role:'gate'|'pass'|'home'|'spring'|'winter-plot'|'bypass'|'sluice'|'field'|'dock'|'boatyard'|'tideflat'|'warehouse'|'sea'|
    'well'|'saltbed'|'trial'|'pasture'|'quarry'|'ward';
}
const north='north-snow',south='south-marsh',east='east-offshore',nc='chart-north-snow',sc='chart-south-marsh',ec='chart-east-offshore';
const west='western-saltwell',ridge='plateau-thunderridge',wc='chart-western-saltwell',rc='chart-plateau-thunderridge';
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
  {id:'frontier-east-gate',regionId:east,chartId:ec,col:0,row:1,name:'外港牌关',role:'gate'},
  {id:'frontier-east-causeway',regionId:east,chartId:ec,col:1,row:1,name:'临潮石堤',role:'pass'},
  {id:'frontier-east-home',regionId:east,chartId:ec,col:2,row:1,name:'外港聚落',role:'home'},
  {id:'frontier-east-dock',regionId:east,chartId:ec,col:1,row:0,name:'登验泊位',role:'dock'},
  {id:'frontier-east-boatyard',regionId:east,chartId:ec,col:2,row:0,name:'船工坞',role:'boatyard'},
  {id:'frontier-east-tideflat',regionId:east,chartId:ec,col:1,row:2,name:'低潮滩',role:'tideflat'},
  {id:'frontier-east-warehouse',regionId:east,chartId:ec,col:2,row:2,name:'验货仓',role:'warehouse'},
  {id:'frontier-east-outer',regionId:east,chartId:ec,col:0,row:0,name:'外海潮口',role:'sea'},
  {id:'frontier-west-gate',regionId:west,chartId:wc,col:0,row:1,name:'漠关',role:'gate'},
  {id:'frontier-west-trail',regionId:west,chartId:wc,col:1,row:1,name:'旱驿',role:'pass'},
  {id:'frontier-west-home',regionId:west,chartId:wc,col:2,row:1,name:'西井聚落',role:'home'},
  {id:'frontier-west-well',regionId:west,chartId:wc,col:1,row:0,name:'持秤井',role:'well'},
  {id:'frontier-west-saltbed',regionId:west,chartId:wc,col:2,row:0,name:'盐滩',role:'saltbed'},
  {id:'frontier-west-trial',regionId:west,chartId:wc,col:1,row:2,name:'冲境台',role:'trial'},
  {id:'frontier-west-warehouse',regionId:west,chartId:wc,col:2,row:2,name:'封盐仓',role:'warehouse'},
  {id:'frontier-ridge-gate',regionId:ridge,chartId:rc,col:0,row:1,name:'雷脊关',role:'gate'},
  {id:'frontier-ridge-saddle',regionId:ridge,chartId:rc,col:1,row:1,name:'风鞍口',role:'pass'},
  {id:'frontier-ridge-home',regionId:ridge,chartId:rc,col:2,row:1,name:'雷脊牧居',role:'home'},
  {id:'frontier-ridge-pasture',regionId:ridge,chartId:rc,col:1,row:0,name:'牧场',role:'pasture'},
  {id:'frontier-ridge-quarry',regionId:ridge,chartId:rc,col:2,row:0,name:'雷石坳',role:'quarry'},
  {id:'frontier-ridge-ward',regionId:ridge,chartId:rc,col:1,row:2,name:'避雷桩',role:'ward'},
  {id:'frontier-ridge-warehouse',regionId:ridge,chartId:rc,col:2,row:2,name:'牧料仓',role:'warehouse'},
];
interface FrontierChart {id:FrontierChartId;name:string;columns:3;rows:3;anchorId:FrontierAnchorId;anchorTileId:string;gateId:FrontierSiteId;homeId:FrontierSiteId}
export const FRONTIER_CHARTS={
 [north]:{id:nc,name:'北岭雪谷',columns:3,rows:3,anchorId:'loc-vein-north',anchorTileId:'tile-12-2',
  gateId:'frontier-north-gate',homeId:'frontier-north-home'},
 [south]:{id:sc,name:'南泽灵田',columns:3,rows:3,anchorId:'loc-market',anchorTileId:'tile-12-12',
  gateId:'frontier-south-gate',homeId:'frontier-south-home'},
 [east]:{id:ec,name:'东海外港',columns:3,rows:3,anchorId:'loc-market-east',anchorTileId:'tile-19-4',
  gateId:'frontier-east-gate',homeId:'frontier-east-home'},
 [west]:{id:wc,name:'西漠盐井',columns:3,rows:3,anchorId:'loc-taixu',anchorTileId:'tile-4-3',
  gateId:'frontier-west-gate',homeId:'frontier-west-home'},
 [ridge]:{id:rc,name:'高原雷脊',columns:3,rows:3,anchorId:'loc-tianji',anchorTileId:'tile-19-3',
  gateId:'frontier-ridge-gate',homeId:'frontier-ridge-home'},
} as const satisfies Readonly<Record<FrontierRegionId,FrontierChart>>;

export const isFrontierDrylandAnchorType=(type:string):boolean=>type==='sect_hq'||type==='spirit_vein';
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
 {from:'frontier-east-gate',to:'frontier-east-causeway'},
 {from:'frontier-east-causeway',to:'frontier-east-home'},
 {from:'frontier-east-causeway',to:'frontier-east-dock'},
 {from:'frontier-east-dock',to:'frontier-east-boatyard'},
 {from:'frontier-east-boatyard',to:'frontier-east-home'},
 {from:'frontier-east-causeway',to:'frontier-east-tideflat'},
 {from:'frontier-east-tideflat',to:'frontier-east-warehouse'},
 {from:'frontier-east-warehouse',to:'frontier-east-home'},
 {from:'frontier-west-gate',to:'frontier-west-trail'},
 {from:'frontier-west-trail',to:'frontier-west-home'},
 {from:'frontier-west-trail',to:'frontier-west-well'},
 {from:'frontier-west-well',to:'frontier-west-saltbed'},
 {from:'frontier-west-saltbed',to:'frontier-west-home'},
 {from:'frontier-west-trail',to:'frontier-west-trial'},
 {from:'frontier-west-trial',to:'frontier-west-warehouse'},
 {from:'frontier-ridge-gate',to:'frontier-ridge-saddle'},
 {from:'frontier-ridge-saddle',to:'frontier-ridge-home'},
 {from:'frontier-ridge-saddle',to:'frontier-ridge-pasture'},
 {from:'frontier-ridge-pasture',to:'frontier-ridge-quarry'},
 {from:'frontier-ridge-quarry',to:'frontier-ridge-home'},
 {from:'frontier-ridge-saddle',to:'frontier-ridge-ward'},
 {from:'frontier-ridge-ward',to:'frontier-ridge-warehouse'},
];
/** These cells are a water route only, not a shortcut in ordinary residence movement. */
export const FRONTIER_EAST_SEA_EDGES:readonly FrontierEdge[]=[
 {from:'frontier-east-dock',to:'frontier-east-outer'},
 {from:'frontier-east-outer',to:'frontier-east-gate'},
];
export const frontierSeaEdge=(from:string,to:string):FrontierEdge|undefined=>FRONTIER_EAST_SEA_EDGES.find(row=>
  (row.from===from&&row.to===to)||(row.to===from&&row.from===to));
export const frontierSite=(id:string):FrontierSite|undefined=>FRONTIER_SITES.find(row=>row.id===id);
export type FrontierFarmSite=FrontierSite&{regionId:FrontierFarmRegionId;chartId:FrontierFarmChartId};
export const isFrontierFarmSite=(site:FrontierSite|undefined):site is FrontierFarmSite=>
  !!site&&isFrontierFarmRegion(site.regionId)&&site.chartId===FRONTIER_CHARTS[site.regionId].id;
export function frontierFarmSite(id:string):FrontierFarmSite|undefined{
  const site=frontierSite(id);
  return isFrontierFarmSite(site)?site:undefined;
}
export const frontierEdge=(from:string,to:string):FrontierEdge|undefined=>FRONTIER_EDGES.find(row=>
  row.from===from&&row.to===to||row.to===from&&row.from===to);
export const frontierWinter=(month:number):boolean=>month===12||month===1||month===2;
export const frontierStepMonth=(month:number,advance:number):number=>((month-1+advance)%12+12)%12+1;
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
  production?:FrontierProductionState;trade?:FrontierTradeState;port?:FrontierPortState;drylands?:FrontierDrylandsState;nightHunt?:FrontierNightHuntState;
}
export const frontierVisitId=(tick:number,actorId:string)=>`frontier-visit-${tick}-${actorId}`;
export const frontierResidenceId=(tick:number,actorId:string)=>`frontier-home-${tick}-${actorId}`;

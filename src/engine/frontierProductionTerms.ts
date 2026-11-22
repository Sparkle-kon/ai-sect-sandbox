import type {FrontierRegionId,FrontierSiteId} from './frontierTerms';

export const FRONTIER_PRODUCTION_MOVES=['tend_spring','draw_tide','sow','irrigate','harvest','rest_field','cultivate','protect_crop'] as const;
export type FrontierProductionMove=typeof FRONTIER_PRODUCTION_MOVES[number];
export const FRONTIER_GOODS=['frost_dose','ward_reed'] as const;
export type FrontierGood=typeof FRONTIER_GOODS[number];
export const FRONTIER_WATER_CAPACITY:Readonly<Record<FrontierRegionId,number>>={'north-snow':6,'south-marsh':8};
export const FRONTIER_STOCK_CAPACITY=12;
export const FRONTIER_SOIL_CAPACITY=4;
export const FRONTIER_GROW_TICKS=2;
export const FRONTIER_CROP_EXPIRES=6;
export const FRONTIER_PRACTICE_QI=6;
export const FRONTIER_SOUTH_PRACTICE_WATER=2;
export const FRONTIER_TIDE_WATER=4;
export const frontierTide=(month:number)=>month>=3&&month<=11;
export const frontierPeakTide=(month:number)=>month===8;
export const frontierSpringInflow=(month:number)=>month===12||month<=2?1:3;
export const frontierCropGood=(regionId:FrontierRegionId):FrontierGood=>regionId==='north-snow'?'frost_dose':'ward_reed';
export interface FrontierProductionOption {
  action:'FRONTIER_PRODUCTION';
  frontierProductionMove:FrontierProductionMove;
  targetFrontierSiteId:FrontierSiteId;
}
export interface FrontierBatchSlice {readonly batchId:string;readonly amount:number}
export interface FrontierProductionCustody {
  readonly from:FrontierRegionId;readonly to?:FrontierRegionId;
  readonly loadedTick:number;readonly deliveredTick?:number;readonly slices:readonly FrontierBatchSlice[];
}
export interface FrontierStockEntry extends FrontierBatchSlice {regionId:FrontierRegionId;amount:number}
export interface FrontierHarvestBatch {
  id:string;plotId:string;siteId:FrontierSiteId;regionId:FrontierRegionId;good:FrontierGood;
  units:number;harvestedTick:number;harvesterId:string;
}
export interface FrontierCrop {
  id:string;siteId:FrontierSiteId;regionId:FrontierRegionId;sowerId:string;sownTick:number;readyTick:number;
  irrigatedTick?:number;stressedTick?:number;protectedTick?:number;
  resolved?:{kind:'harvested';tick:number;batchId:string}|{kind:'failed';tick:number};
}
export interface FrontierSoil {siteId:FrontierSiteId;units:number;lastSowTick?:number}
export type FrontierReceiptKind=FrontierProductionMove|'spring_inflow'|'crop_stress'|'crop_failed';
export interface FrontierProductionReceipt {
  id:string;kind:FrontierReceiptKind;tick:number;year:number;month:number;actorId:string;siteId:FrontierSiteId;regionId:FrontierRegionId;
  waterDelta:number;rootsSpent:0|1;soilDelta:number;qiGained:number;plotId?:string;
}
export interface FrontierProductionSpend {
  regionId:FrontierRegionId;actorId:string;tick:number;refId:string;purpose:'practice'|'protect_crop'|'winter_detour';
  good:FrontierGood;slices:FrontierBatchSlice[];
}
export interface FrontierProductionState {
  version:1;
  water:Record<FrontierRegionId,number>;
  soil:FrontierSoil[];
  crops:FrontierCrop[];
  batches:FrontierHarvestBatch[];
  stock:FrontierStockEntry[];
  consumptions:FrontierProductionSpend[];
  receipts:FrontierProductionReceipt[];
  lastAdvancedTick?:number;
}
export interface FrontierProductionView {
  regionId:FrontierRegionId;siteId:FrontierSiteId;water:number;waterCapacity:number;isWinter:boolean;canDrawTide:boolean;
  localPlot?:{soil?:number;plantedTick?:number;readyTick?:number;needIrrigation?:boolean;protected?:boolean};
  stock?:Record<FrontierGood,number>;
  options:FrontierProductionOption[];
}
export const frontierCropId=(tick:number,siteId:FrontierSiteId)=>`frontier-crop-${tick}-${siteId}`;
export const frontierBatchId=(cropId:string)=>`frontier-batch-${cropId}`;
export const frontierProductionReceiptId=(tick:number,kind:FrontierReceiptKind,siteId:FrontierSiteId,actorId:string)=>
  `frontier-production-${tick}-${kind}-${siteId}-${actorId}`;

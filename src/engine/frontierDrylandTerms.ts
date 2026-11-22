import type {CultivationRealm,Cultivator,WorldEvent,WorldState} from '../types/world';
import type {FrontierSiteId} from './frontierTerms';
import type {FrontierDrylandTradeState} from './frontierDrylandTradeTerms';

export const FRONTIER_DRYLAND_REGIONS=['western-saltwell','plateau-thunderridge'] as const;
export type FrontierDrylandRegion=typeof FRONTIER_DRYLAND_REGIONS[number];
export const FRONTIER_DRYLAND_GOODS=['rift_salt','stormstone'] as const;
export type FrontierDrylandGood=typeof FRONTIER_DRYLAND_GOODS[number];
export const FRONTIER_DRYLAND_MOVES=['open_well','draw_water','gather_salt','attempt_layer','tend_herd','feed_herd','quarry_stone','charge_ward'] as const;
export type FrontierDrylandLocalMove=typeof FRONTIER_DRYLAND_MOVES[number];
export type FrontierDrylandMove=FrontierDrylandLocalMove;
export type FrontierDrylandFeed='root'|'salt';
export const FRONTIER_DRYLAND_LOCATIONS={
  well:'frontier-west-well',saltbed:'frontier-west-saltbed',trial:'frontier-west-trial',westStore:'frontier-west-warehouse',
  pasture:'frontier-ridge-pasture',quarry:'frontier-ridge-quarry',ward:'frontier-ridge-ward',ridgeStore:'frontier-ridge-warehouse',
} as const;
export const FRONTIER_DRYLAND_COSTS={
  wellStones:12,wellRoots:2,waterCapacity:6,waterReserve:1,saltWater:2,layerWater:2,haulWater:1,
  herdStones:6,herdRoots:1,herdCount:2,herdWork:2,herdMonths:8,quarryWork:1,haulWork:1,wardMonths:5,wardRoots:1,
  gatherHp:4,layerQi:90,stockCapacity:12,batchYield:2,
} as const;
export const isFrontierDrylandRegion=(value:unknown):value is FrontierDrylandRegion=>
  value===FRONTIER_DRYLAND_REGIONS[0]||value===FRONTIER_DRYLAND_REGIONS[1];
export const isFrontierDrylandHarshMonth=(month:number)=>month===7||month===8;
export const frontierDrylandWellInflow=(month:number)=>isFrontierDrylandHarshMonth(month)?1:3;
export const frontierDrylandStore=(region:FrontierDrylandRegion):FrontierSiteId=>region===FRONTIER_DRYLAND_REGIONS[0]?
  FRONTIER_DRYLAND_LOCATIONS.westStore:FRONTIER_DRYLAND_LOCATIONS.ridgeStore;
export type FrontierDrylandLocalOption={action:'FRONTIER_DRYLAND';targetFrontierSiteId:FrontierSiteId}&(
  {frontierDrylandMove:'feed_herd';frontierDrylandFeed:FrontierDrylandFeed}|
  {frontierDrylandMove:Exclude<FrontierDrylandLocalMove,'feed_herd'>;frontierDrylandFeed?:never}
);
export type NativeSameRealmAttempt=(world:WorldState,actor:Cultivator)=>WorldEvent|null;
export interface DrylandBatchSlice {readonly batchId:string;readonly amount:number}
export interface FrontierDrylandStock extends DrylandBatchSlice {regionId:FrontierDrylandRegion;amount:number}
export interface FrontierDrylandBatch {id:string;good:FrontierDrylandGood;regionId:FrontierDrylandRegion;siteId:FrontierSiteId;
  actorId:string;tick:number;amount:2}
export interface FrontierDrylandWell {actorId:string;openedTick:number;readyTick:number;water:number}
export interface FrontierDrylandHerd {actorId:string;startedTick:number;count:2;fedTick:number;expiresTick:number;work:number}
export interface FrontierDrylandWard {chargedTick:number;expiresTick:number;charges:0|1}
export interface FrontierDrylandLayer {
  nativeEventId:string;realm:CultivationRealm;fromStage:number;toStage:number;beforeQi:number;afterQi:number;
  result:'advanced'|'backlash';
}
export interface FrontierDrylandReceipt {
  id:string;move:FrontierDrylandLocalMove|'haul';actorId:string;regionId:FrontierDrylandRegion;siteId:FrontierSiteId;
  tick:number;year:number;month:number;stonesSpent:number;rootsSpent:number;hpSpent:number;
  waterDelta:number;workDelta:number;wardDelta:number;
  feed?:FrontierDrylandFeed;batchId?:string;spent?:DrylandBatchSlice[];layer?:FrontierDrylandLayer;refId?:string;
}
export interface FrontierDrylandCustody {
  readonly agreementId:string;readonly refId:string;readonly actorId:string;
  readonly from:FrontierDrylandRegion;readonly loadedTick:number;readonly slices:readonly DrylandBatchSlice[];
  readonly to?:FrontierDrylandRegion;readonly landedTick?:number;
}
export interface FrontierDrylandsState {
  version:1;well?:FrontierDrylandWell;herd?:FrontierDrylandHerd;ward?:FrontierDrylandWard;
  batches:FrontierDrylandBatch[];stock:FrontierDrylandStock[];receipts:FrontierDrylandReceipt[];trade?:FrontierDrylandTradeState;
}
export interface FrontierDrylandLocalView {
  regionId:FrontierDrylandRegion;siteId:FrontierSiteId;resident:boolean;window:'dry'|'thunder'|'open';
  options:FrontierDrylandLocalOption[];
  well?:{readyTick:number;water:number;capacity:number};
  herd?:{count:number;work:number;expiresTick:number};
  ward?:{charges:number;expiresTick:number};
  stock?:Record<FrontierDrylandGood,number>;
  lastLayer?:{result:FrontierDrylandLayer['result'];fromStage:number;toStage:number;tick:number};
}
export const frontierDrylandReceiptId=(tick:number,move:FrontierDrylandReceipt['move'],actorId:string)=>
  `frontier-dryland-${tick}-${move}-${actorId}`;
export const frontierDrylandBatchId=(id:string)=>`frontier-dryland-batch-${id}`;
export const frontierDrylandWorkingHerd=(herd:FrontierDrylandHerd|undefined,tick:number)=>
  herd&&tick>=herd.fedTick&&tick<herd.expiresTick?herd.work:0;
export const frontierDrylandChargedWard=(ward:FrontierDrylandWard|undefined,tick:number)=>
  ward&&tick>=ward.chargedTick&&tick<ward.expiresTick?ward.charges:0;
export type FrontierDrylandState=FrontierDrylandsState;

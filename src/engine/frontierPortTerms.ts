import type {FrontierSiteId} from './frontierTerms';
import type {FrontierPortTradeState} from './frontierPortTradeTerms';

export const FRONTIER_PORT_REGION='east-offshore' as const;
export const FRONTIER_PORT_LOCAL_MOVES=['commission','repair','weave_rigging','gather','practice'] as const;
export type FrontierPortLocalMove=typeof FRONTIER_PORT_LOCAL_MOVES[number];
export type FrontierPortMove=FrontierPortLocalMove;
export const FRONTIER_PORT_GOODS=['reef_salt','port_rigging'] as const;
export type FrontierPortGood=typeof FRONTIER_PORT_GOODS[number];
export const FRONTIER_PORT_COMMISSION_STONES=12;
export const FRONTIER_PORT_COMMISSION_ROOTS=3;
export const FRONTIER_PORT_REPAIR_STONES=4;
export const FRONTIER_PORT_REPAIR_ROOTS=2;
export const FRONTIER_PORT_REPAIR_CONDITION=2;
export const FRONTIER_PORT_HULL_INITIAL=4;
export const FRONTIER_PORT_HULL_MAX=6;
export const FRONTIER_PORT_STOCK_MAX=12;
export const FRONTIER_PORT_GATHER_HP=4;
export const FRONTIER_PORT_PRACTICE_HP=6;
export const FRONTIER_PORT_PRACTICE_QI=6;
export const FRONTIER_PORT_SALT_YIELD=2;

export const frontierPortTide=(month:number):'open'|'low'|'wind_closed'=>
  month===7||month===8?'wind_closed':month<=2||month===12?'low':'open';
export interface FrontierPortHull {id:string;builderId:string;createdTick:number;condition:number}
export interface FrontierPortBatch {id:string;good:FrontierPortGood;amount:number;actorId:string;tick:number}
export interface FrontierPortBatchSlice {readonly batchId:string;readonly amount:number}
export interface FrontierPortStockEntry extends FrontierPortBatchSlice {amount:number}
export interface FrontierPortRiggingSpend {
  refId:string;actorId:string;tick:number;slices:FrontierPortBatchSlice[];
}
export interface FrontierPortLocalReceipt {
  id:string;move:FrontierPortLocalMove;tick:number;year:number;month:number;actorId:string;siteId:FrontierSiteId;
  stonesSpent:number;rootsSpent:number;hpSpent:number;qiGained:number;hullDelta:number;
  batchId?:string;rigging?:FrontierPortBatchSlice[];
}
export interface FrontierPortCustody {
  readonly agreementId:string;readonly hullId:string;readonly loadedTick:number;readonly departedTick?:number;readonly closedTick?:number;
  readonly saltSlices:readonly FrontierPortBatchSlice[];readonly returnedTick?:number;
  readonly riggingRefId:string;readonly actorId:string;readonly riggingSlices:readonly FrontierPortBatchSlice[];
}
export interface FrontierPortState {
  version:1;hull?:FrontierPortHull;batches:FrontierPortBatch[];stock:FrontierPortStockEntry[];receipts:FrontierPortLocalReceipt[];
  riggingSpent:FrontierPortRiggingSpend[];trade?:FrontierPortTradeState;
}
export interface FrontierPortLocalOption {
  action:'FRONTIER_PORT';frontierPortMove:FrontierPortLocalMove;targetFrontierSiteId:FrontierSiteId;
}
export interface FrontierPortView {
  siteId:FrontierSiteId;resident:boolean;tide:ReturnType<typeof frontierPortTide>;
  hull?:{id:string;condition:number;status:'berthed'|'reserved'|'away'};
  stock?:Record<FrontierPortGood,number>;
  options:FrontierPortLocalOption[];
}
export const frontierPortHullId=(tick:number,actorId:string)=>`frontier-hull-${tick}-${actorId}`;
export const frontierPortLocalReceiptId=(tick:number,move:FrontierPortLocalMove,actorId:string)=>
  `frontier-port-local-${tick}-${move}-${actorId}`;
export const frontierPortBatchId=(receiptId:string)=>`frontier-port-batch-${receiptId}`;

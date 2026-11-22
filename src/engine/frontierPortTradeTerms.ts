import type {WorldState} from '../types/world';
import {frontierPortTide,type FrontierPortBatchSlice} from './frontierPortTerms';

export const PORT_TRADE_SALT=2;
export const PORT_TRADE_ROOTS=2;
export const PORT_TRADE_FEE_STONES=3;
export const PORT_TRADE_RIGGING=1;
export const PORT_TRADE_HULL_WEAR=1;
export const PORT_TRADE_OFFER_MONTHS=4;
export const PORT_TRADE_LOAD_MONTHS=48;
export const PORT_TRADE_SOFT_MONTHS=8;
export const PORT_TRADE_FINAL_MONTHS=18;
export const PORT_TRADE_LAND_STRIDE=3;
export const PORT_TRADE_EAST_ANCHOR_INDEX=3;
export const PORT_TRADE_INLAND_SITE='loc-market';
export const PORT_TRADE_EAST_SITE='loc-market-east';
export const PORT_TRADE_DOCK_SITE='frontier-east-dock';
export const PORT_TRADE_WAREHOUSE_SITE='frontier-east-warehouse';

export type FrontierPortTradeMove='propose'|'accept'|'load'|'receive'|'recover_roots'|'collect_roots';
export type FrontierPortTradeStatus='offered'|'signed'|'shipping'|'fulfilled'|'unfulfilled'|'expired';
export type FrontierPortRootState='inland_escrow'|'returning_to_port'|'landed_at_port'|'collected_at_port'|'refundable_inland'|'refunded_inland';
export type FrontierPortVoyageStatus='outbound'|'awaiting_buyer'|'returning_roots'|'returning_salt'|'home_salt_held'|'roots_landed'|'salt_returned';
export type FrontierPortCargoPoint={readonly chartId:'chart-east-offshore'|'lower-base';readonly tileId:string};
export type FrontierPortWaitReason='wind_closed'|'tide_closed';
export interface FrontierPortWalk {readonly tick:number;readonly step:number}
export interface FrontierPortWait {readonly tick:number;readonly fromStep:number;readonly toStep:number;readonly reason:FrontierPortWaitReason}
export interface FrontierPortVoyage {
  readonly hullId:string;readonly loadResidenceId:string;
  readonly loadedTick:number;readonly lots:readonly FrontierPortBatchSlice[];readonly rigging:readonly FrontierPortBatchSlice[];
  readonly checkpoints:readonly FrontierPortCargoPoint[];
  readonly feeStones:3;
  cursor:number;
  status:FrontierPortVoyageStatus;
  walks:FrontierPortWalk[];
  waits:FrontierPortWait[];
  departedTick?:number;
  inlandArrivedTick?:number;
  receivedTick?:number;
  returnStartedTick?:number;
  returnedTick?:number;
  restockedTick?:number;
}
export interface FrontierPortTradeAgreement {
  readonly id:string;readonly sellerId:string;readonly buyerId:string;readonly offeredTick:number;
  status:FrontierPortTradeStatus;
  signedTick?:number;
  roots?:FrontierPortRootState;
  rootsReleasedTick?:number;
  rootsCollectedResidenceId?:string;
  closedTick?:number;
  voyage?:FrontierPortVoyage;
}
export interface FrontierPortTradeState {nextId:number;agreements:FrontierPortTradeAgreement[];lastAdvancedTick?:number}
export type FrontierPortHullSite='berthed'|'reserved'|'sea'|'east_anchor';

export function portTradeHullStatus(world:WorldState,hullId:string):FrontierPortHullSite {
  const freight=world.frontier?.port?.trade?.agreements.find(row=>row.status==='shipping'&&row.voyage?.hullId===hullId&&row.voyage.status!=='home_salt_held')?.voyage;
  if(!freight)return 'berthed';
  if(freight.cursor===0)return 'reserved';
  return freight.cursor>=PORT_TRADE_EAST_ANCHOR_INDEX?'east_anchor':'sea';
}
export const portTradeRiggingRef=(id:string)=>`port-trade-rigging-${id}`;
/** Typed natural sea windows. Inland movement is never reported as a sea tide decision. */
export function portTradeEdgeSeason(from:FrontierPortCargoPoint,to:FrontierPortCargoPoint,month:number):FrontierPortWaitReason|undefined {
  if(from.chartId!==to.chartId&&frontierPortTide(month)==='low')return 'tide_closed';
  const atWindEdge=[from.tileId,to.tileId].includes(PORT_TRADE_DOCK_SITE)&&
    [from.tileId,to.tileId].includes('frontier-east-outer');
  if(atWindEdge&&frontierPortTide(month)==='wind_closed')return 'wind_closed';
}

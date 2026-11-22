import type { FrontierBatchSlice, FrontierGood } from './frontierProductionTerms';

export const FRONTIER_TRADE_AMOUNT=2;
export const FRONTIER_TRADE_WINTER_REEDS=1;
export const FRONTIER_TRADE_OFFER_MONTHS=4;
export const FRONTIER_TRADE_TERM_MONTHS=72;
export const FRONTIER_TRADE_STRIDE=3;

export type FrontierTradeMove='propose'|'accept'|'load'|'load_winter';
export type FrontierTradeSide='north-snow'|'south-marsh';
export type FrontierTradeStatus='offered'|'accepted'|'returning'|'exchanged'|'expired'|'returned';
export type FrontierTradeCargoStatus='in_transit'|'arrived'|'returning'|'home_wait'|'returned'|'delivered';
export type FrontierTradeRoute='standard'|'winter';
export interface FrontierTradeCheckpoint {
  readonly chartId:'lower-base'|'chart-north-snow'|'chart-south-marsh';
  readonly tileId:string;
}
export interface FrontierTradeWalk {readonly tick:number;readonly step:number}
export interface FrontierTradeCargo {
  readonly from:FrontierTradeSide;
  readonly good:FrontierGood;
  readonly lots:readonly FrontierBatchSlice[];
  readonly loadedTick:number;
  readonly residenceId:string;
  readonly route:FrontierTradeRoute;
  readonly checkpoints:readonly FrontierTradeCheckpoint[];
  readonly winterReeds?:readonly FrontierBatchSlice[];
  walks:FrontierTradeWalk[];
  winterWaitTicks:number[];
  cursor:number;
  status:FrontierTradeCargoStatus;
  arrivedTick?:number;
  closedTick?:number;
}
export interface FrontierTradeAgreement {
  readonly id:string;
  readonly northActorId:string;
  readonly southActorId:string;
  readonly offeredTick:number;
  status:FrontierTradeStatus;
  acceptedTick?:number;
  returnsTick?:number;
  closedTick?:number;
  north?:FrontierTradeCargo;
  south?:FrontierTradeCargo;
}
export interface FrontierTradeState {
  agreements:FrontierTradeAgreement[];
  nextId:number;
  lastAdvancedTick?:number;
}
export const frontierTradeGood=(side:FrontierTradeSide):FrontierGood=>side==='north-snow'?'frost_dose':'ward_reed';
export const otherFrontierTradeSide=(side:FrontierTradeSide):FrontierTradeSide=>side==='north-snow'?'south-marsh':'north-snow';
export const frontierTradeColdMonth=(month:number):boolean=>month===12||month===1||month===2;
export const frontierTradeWinterRef=(tradeId:string,side:FrontierTradeSide)=>`${tradeId}-${side}`;

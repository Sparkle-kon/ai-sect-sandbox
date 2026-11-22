import type {DrylandBatchSlice,FrontierDrylandGood,FrontierDrylandRegion} from './frontierDrylandTerms';

export const DRYLAND_TRADE_AMOUNT=2;
export const DRYLAND_TRADE_OFFER_MONTHS=4;
export const DRYLAND_TRADE_TERM_MONTHS=72;
export const DRYLAND_TRADE_LAND_STRIDE=3;
export const DRYLAND_TRADE_MARKET='loc-market';

export type FrontierDrylandTradeMove='propose'|'accept'|'load';
export type FrontierDrylandTradeStatus='offered'|'accepted'|'returning'|'exchanged'|'expired'|'returned';
export type FrontierDrylandCargoStatus='in_transit'|'arrived'|'returning'|'home_wait'|'returned'|'delivered';
export type FrontierDrylandCargoPoint={readonly chartId:'chart-western-saltwell'|'chart-plateau-thunderridge'|'lower-base';readonly tileId:string};
export interface FrontierDrylandTradeWalk {readonly tick:number;readonly step:number}
export interface FrontierDrylandTradeWait {readonly tick:number;readonly fromStep:number;readonly toStep:number;readonly reason:'thunder_closed'}
export interface FrontierDrylandTradeCargo {
  readonly from:FrontierDrylandRegion;
  readonly good:FrontierDrylandGood;
  readonly lots:readonly DrylandBatchSlice[];
  readonly loadedTick:number;
  readonly residenceId:string;
  readonly checkpoints:readonly FrontierDrylandCargoPoint[];
  walks:FrontierDrylandTradeWalk[];
  waits:FrontierDrylandTradeWait[];
  cursor:number;
  status:FrontierDrylandCargoStatus;
  arrivedTick?:number;
  closedTick?:number;
}
export interface FrontierDrylandTradeAgreement {
  readonly id:string;
  readonly westActorId:string;
  readonly ridgeActorId:string;
  readonly offeredTick:number;
  status:FrontierDrylandTradeStatus;
  acceptedTick?:number;
  returnsTick?:number;
  closedTick?:number;
  west?:FrontierDrylandTradeCargo;
  ridge?:FrontierDrylandTradeCargo;
}
export interface FrontierDrylandTradeState {
  agreements:FrontierDrylandTradeAgreement[];
  nextId:number;
  lastAdvancedTick?:number;
}

export const drylandTradeGood=(side:FrontierDrylandRegion):FrontierDrylandGood=>side==='western-saltwell'?'rift_salt':'stormstone';
export const otherDrylandTradeSide=(side:FrontierDrylandRegion):FrontierDrylandRegion=>side==='western-saltwell'?'plateau-thunderridge':'western-saltwell';
export const drylandTradeHaulRef=(id:string,side:FrontierDrylandRegion)=>`${id}-${side}`;

export function drylandTradeThunderDue(from:FrontierDrylandCargoPoint,to:FrontierDrylandCargoPoint,month:number):boolean{
  if((month!==7&&month!==8)||from.chartId!=='chart-plateau-thunderridge'||to.chartId!==from.chartId)return false;
  return from.tileId==='frontier-ridge-ward'&&to.tileId==='frontier-ridge-saddle'||
    to.tileId==='frontier-ridge-ward'&&from.tileId==='frontier-ridge-saddle';
}

type ShapeRecord=Record<string,unknown>;
const object=(value:unknown):value is ShapeRecord=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const natural=(value:unknown,min=0):value is number=>Number.isSafeInteger(value)&&typeof value==='number'&&value>=min;
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200&&
  !/[\u0000-\u001f\u007f]/u.test(value);
const exact=(value:ShapeRecord,required:readonly string[],optional:readonly string[]=[])=>required.every(key=>Object.hasOwn(value,key))&&
  Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const moment=(value:unknown)=>value===undefined||natural(value,1);
const oneOf=(value:unknown,items:readonly string[])=>typeof value==='string'&&items.includes(value);

export function validateFrontierDrylandTradeShape(value:unknown,path:string,fail:(path:string)=>never):asserts value is FrontierDrylandTradeState {
  if(!object(value)||!exact(value,['agreements','nextId'],['lastAdvancedTick'])||!natural(value.nextId,1)||
    !moment(value.lastAdvancedTick)||!Array.isArray(value.agreements))fail(path);
  const cargo=(value:unknown,p:string)=>{
    if(!object(value)||!exact(value,['from','good','lots','loadedTick','residenceId','checkpoints','walks','waits','cursor','status'],
      ['arrivedTick','closedTick'])||!oneOf(value.from,['western-saltwell','plateau-thunderridge'])||
      !oneOf(value.good,['rift_salt','stormstone'])||!natural(value.loadedTick,1)||!identifier(value.residenceId)||
      !moment(value.arrivedTick)||!moment(value.closedTick)||
      !oneOf(value.status,['in_transit','arrived','returning','home_wait','returned','delivered']))fail(p);
    if(!Array.isArray(value.checkpoints)||value.checkpoints.length<3||value.checkpoints.length>384||
      !natural(value.cursor)||value.cursor>=value.checkpoints.length)fail(p+'.checkpoints');
    if(!Array.isArray(value.lots)||value.lots.length<1||value.lots.length>DRYLAND_TRADE_AMOUNT)fail(p+'.lots');
    if(!Array.isArray(value.walks)||value.walks.length>2*(value.checkpoints.length-1))fail(p+'.walks');
    if(!Array.isArray(value.waits)||value.waits.length>120)fail(p+'.waits');
    for(const piece of value.lots as unknown[])if(!object(piece)||!exact(piece,['batchId','amount'])||
      !identifier(piece.batchId)||!natural(piece.amount,1)||piece.amount>DRYLAND_TRADE_AMOUNT)fail(p+'.lots');
    for(const step of value.checkpoints as unknown[])if(!object(step)||!exact(step,['chartId','tileId'])||
      !oneOf(step.chartId,['chart-western-saltwell','chart-plateau-thunderridge','lower-base'])||!identifier(step.tileId))
      fail(p+'.checkpoints');
    for(const stamp of value.walks as unknown[])if(!object(stamp)||!exact(stamp,['tick','step'])||!natural(stamp.tick,1)||
      !natural(stamp.step)||stamp.step>=value.checkpoints.length)fail(p+'.walks');
    for(const stamp of value.waits as unknown[])if(!object(stamp)||!exact(stamp,['tick','fromStep','toStep','reason'])||
      !natural(stamp.tick,1)||!natural(stamp.fromStep)||!natural(stamp.toStep)||
      stamp.fromStep>=value.checkpoints.length||stamp.toStep>=value.checkpoints.length||
      Math.abs(stamp.fromStep-stamp.toStep)!==1||stamp.reason!=='thunder_closed')fail(p+'.waits');
  };
  for(const [i,row] of (value.agreements as unknown[]).entries()){
    const p=`${path}.agreements[${i}]`;
    if(!object(row)||!exact(row,['id','westActorId','ridgeActorId','offeredTick','status'],['west','ridge','acceptedTick','returnsTick','closedTick'])||
      typeof row.id!=='string'||!/^frontier-dryland-trade-[1-9][0-9]*(?![\s\S])/u.test(row.id)||row.id.length>50||
      !identifier(row.westActorId)||!identifier(row.ridgeActorId)||!natural(row.offeredTick,1)||
      !oneOf(row.status,['offered','accepted','returning','exchanged','expired','returned'])||!moment(row.acceptedTick)||!moment(row.returnsTick)||
      !moment(row.closedTick))fail(p);
    if(row.west!==undefined)cargo(row.west,p+'.west');
    if(row.ridge!==undefined)cargo(row.ridge,p+'.ridge');
  }
}

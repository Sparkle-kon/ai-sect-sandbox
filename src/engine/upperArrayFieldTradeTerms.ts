import type {WorldState} from '../types/world';
import type {UpperArrayLatticeSlice} from './upperArrayFieldLocalTerms';

export const UPPER_ARRAY_TRADE_LATTICE=2;
export const UPPER_ARRAY_TRADE_ROOTS=2;
export const UPPER_ARRAY_TRADE_OFFER_MONTHS=4;
export const UPPER_ARRAY_TRADE_LOAD_MONTHS=72;
export const UPPER_ARRAY_TRADE_WELL='loc-vein-north';
export const UPPER_ARRAY_TRADE_EXCHANGE='array-field-exchange';

export type UpperArrayFieldTradeMove='propose'|'accept'|'load'|'settle'|'unload';
export type UpperArrayFieldTradeStatus='offered'|'accepted'|'carrying'|'settled'|'restocked'|'expired';
export interface UpperArrayFieldTradeLoad {
  readonly tick:number;
  readonly residenceId:string;
  readonly visitId:string;
  readonly journeyId:string;
  readonly slices:UpperArrayLatticeSlice[];
}
export interface UpperArrayFieldTradeCrossing {readonly returnedTick:number;readonly crossedTick:number;readonly crossingOpeningId:string}
export interface UpperArrayFieldTradeSettlement extends UpperArrayFieldTradeCrossing {
  readonly tick:number;
}
export interface UpperArrayFieldTradeRestock {readonly tick:number;readonly visitId:string;readonly journeyId:string}
export interface UpperArrayFieldTradeAgreement {
  readonly id:string;readonly sellerId:string;readonly buyerId:string;readonly wellProjectId:string;readonly offeredTick:number;
  status:UpperArrayFieldTradeStatus;
  acceptedTick?:number;closedTick?:number;
  load?:UpperArrayFieldTradeLoad;settlement?:UpperArrayFieldTradeSettlement;restock?:UpperArrayFieldTradeRestock;
}
export interface UpperArrayFieldTradeState {
  agreements:UpperArrayFieldTradeAgreement[];
  nextId:number;
  lastAdvancedTick?:number;
}

export function upperArrayFieldActedOnTrade(world:WorldState,actorId:string,tick:number):boolean{
  return world.upperArrayField?.trade?.agreements.some(row=>
    row.sellerId===actorId&&(row.offeredTick===tick||row.load?.tick===tick||row.restock?.tick===tick||row.settlement?.tick===tick)||
    row.buyerId===actorId&&(row.acceptedTick===tick||row.settlement?.tick===tick))??false;
}

type Raw=Record<string,unknown>;
const record=(n:unknown):n is Raw=>n!==null&&typeof n==='object'&&!Array.isArray(n);
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1;
const date=(n:unknown)=>n===undefined||positive(n);
const id=(n:unknown):n is string=>typeof n==='string'&&n.length>=1&&n.length<=160&&!/[\u0000-\u001f\u007f]/u.test(n);
const keys=(n:Raw,required:readonly string[],optional:readonly string[]=[])=>required.every(key=>Object.hasOwn(n,key))&&
  Object.keys(n).every(key=>required.includes(key)||optional.includes(key));
export function validateUpperArrayFieldTradeShape(value:unknown,path:string,fail:(path:string)=>never):asserts value is UpperArrayFieldTradeState{
  if(!record(value)||!keys(value,['agreements','nextId'],['lastAdvancedTick'])||!positive(value.nextId)||!date(value.lastAdvancedTick)||
    !Array.isArray(value.agreements)||value.agreements.length>100_000)fail(path);
  for(const [i,row] of (value.agreements as unknown[]).entries()){
    const p=`${path}.agreements[${i}]`;
    if(!record(row)||!keys(row,['id','sellerId','buyerId','wellProjectId','offeredTick','status'],
      ['acceptedTick','closedTick','load','settlement','restock'])||!id(row.id)||!/^upper-array-trade-[1-9][0-9]*(?![\s\S])/u.test(row.id)||
      !id(row.sellerId)||!id(row.buyerId)||!id(row.wellProjectId)||!positive(row.offeredTick)||
      !date(row.acceptedTick)||!date(row.closedTick)||typeof row.status!=='string'||
      !['offered','accepted','carrying','settled','restocked','expired'].includes(row.status))fail(p);
    const {load,settlement,restock}=row;
    if(load!==undefined){
      if(!record(load)||!keys(load,['tick','residenceId','visitId','journeyId','slices'])||!positive(load.tick)||
        !id(load.residenceId)||!id(load.visitId)||!id(load.journeyId)||!Array.isArray(load.slices)||
        load.slices.length<1||load.slices.length>UPPER_ARRAY_TRADE_LATTICE)fail(p+'.load');
      for(const piece of load.slices as unknown[])if(!record(piece)||!keys(piece,['batchId','quantity'])||
        !id(piece.batchId)||!positive(piece.quantity)||piece.quantity>UPPER_ARRAY_TRADE_LATTICE)fail(p+'.load.slices');
    }
    if(settlement!==undefined&&(!record(settlement)||!keys(settlement,['tick','returnedTick','crossedTick','crossingOpeningId'])||
      !positive(settlement.tick)||!positive(settlement.returnedTick)||!positive(settlement.crossedTick)||!id(settlement.crossingOpeningId)))fail(p+'.settlement');
    if(restock!==undefined&&(!record(restock)||!keys(restock,['tick','visitId','journeyId'])||!positive(restock.tick)||
      !id(restock.visitId)||!id(restock.journeyId)))fail(p+'.restock');
  }
}

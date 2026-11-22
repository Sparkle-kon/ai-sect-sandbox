import type {UpperArrayFieldSiteId} from './upperArrayFieldTerms';

export const UPPER_ARRAY_FIELD_LOCAL_MOVES=['condense','cultivate'] as const;
export type UpperArrayFieldLocalMove=typeof UPPER_ARRAY_FIELD_LOCAL_MOVES[number];
export const UPPER_ARRAY_FIELD_LOCAL_COST={
  condense:{stones:2,roots:1,hp:4,produced:2},
  cultivate:{stones:3,lattice:1,hp:4,qi:6},
} as const;
export const UPPER_ARRAY_FIELD_LATTICE_CAPACITY=12;
export const UPPER_ARRAY_FIELD_LOCAL_LIMIT=100_000;
export type UpperArrayFieldLocalOption={action:'UPPER_ARRAY_FIELD_LOCAL'}&(
  {upperArrayFieldLocalMove:'condense';targetUpperArrayFieldSiteId:'array-field-source'}|
  {upperArrayFieldLocalMove:'cultivate';targetUpperArrayFieldSiteId:'array-field-practice'}
);
export interface UpperArrayLatticeSlice {batchId:string;quantity:number}
export interface UpperArrayFieldLatticeBatch {
  id:string;actorId:string;visitId:string;tick:number;quantity:2;
}
export type UpperArrayFieldLocalReceipt={id:string;actorId:string;visitId:string;tick:number}&(
  {move:'condense';batchId:string}|
  {move:'cultivate';spent:UpperArrayLatticeSlice;beforeQi:number;afterQi:number}
);
export interface UpperArrayFieldProductionState {
  version:1;batches:UpperArrayFieldLatticeBatch[];stock:UpperArrayLatticeSlice[];receipts:UpperArrayFieldLocalReceipt[];
}
export interface UpperArrayFieldLocalView {
  siteId:UpperArrayFieldSiteId;resident:boolean;stock:number;options:UpperArrayFieldLocalOption[];
}
export interface UpperArrayFieldLatticeCustody {
  tradeId:string;actorId:string;loadedTick:number;slices:readonly UpperArrayLatticeSlice[];restockedTick?:number;
}
export const upperArrayFieldLocalReceiptId=(tick:number,actorId:string)=>`array-field-local-${tick}-${actorId}`;
export const upperArrayFieldLatticeBatchId=(receiptId:string)=>`lattice-${receiptId}`;

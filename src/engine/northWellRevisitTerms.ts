import type { NorthWellReviewDecision, WorldState } from '../types/world';

export const NORTH_WELL_REVISIT_MONTHS=3600;
export const NORTH_WELL_REVIEW_FEE=4;
export const NORTH_WELL_SURVEY_RECENCY=3;
export const NORTH_WELL_PERMIT_LIFE=3;
export const northWellLawId=(tick:number,sourceCharterId:string)=>`north-well-law-${tick}-${sourceCharterId}`;
export const northWellReviewId=(tick:number,actorId:string)=>`north-well-review-${tick}-${actorId}`;
export function northWellPrecinctRestricted(world:WorldState,tick=world.tick):boolean{
  const law=world.northWellRevisitLaw;
  return !!law&&law.kind==='authored_old_village_restriction'&&law.declaredTick<=tick;
}
export function northWellNativeMinePermit(world:WorldState,actorId:string,tick=world.tick):NorthWellReviewDecision|undefined{
  const law=world.northWellRevisitLaw;
  if(!northWellPrecinctRestricted(world,tick)||!law)return undefined;
  return world.northWellRevisitReviews?.decisions.find(row=>row.actorId===actorId&&row.move==='permit'&&row.lawId===law.id&&
    row.sourceCharterId===law.sourceCharterId&&row.permit!==undefined&&row.permit.spentTick===undefined&&
    row.permit.validFromTick<=tick&&tick<row.permit.expiresTick);
}
export function spendNorthWellNativeMinePermit(world:WorldState,actorId:string,miningReceiptId:string):void{
  const row=northWellNativeMinePermit(world,actorId);
  if(!row?.permit)return;
  const mined=world.coldWaterVein?.mining.find(item=>item.id===miningReceiptId&&item.actorId===actorId&&item.tick===world.tick);
  if(!mined)return;
  row.permit.spentTick=world.tick;row.permit.miningReceiptId=mined.id;
}

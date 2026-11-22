import type {EstateRecord,WorkshopEstateMove,WorkshopOrder,WorldState} from '../types/world';

export const WORKSHOP_ESTATE_OFFER_TICKS=5;
export const WORKSHOP_ESTATE_REPLY_TICKS=3;
export const WORKSHOP_ESTATE_WORK_TICKS=4;
export interface WorkshopEstateOption {action:'WORKSHOP_ESTATE';workshopEstateMove:WorkshopEstateMove;targetWorkshopId:string}

export function workshopEstateFor(world:WorldState,order:WorkshopOrder):EstateRecord|undefined{
  const chain=order.estateContinuation;
  return chain?.estateId===`estate-${order.patronId}`?world.estates.entries.find(row=>
    row.id===chain.estateId&&row.deceasedId===order.patronId&&row.openedTick===chain.heldTick):undefined;
}
export function workshopEstateBeneficiary(world:WorldState,order:WorkshopOrder,tick:number):string|undefined{
  const estate=workshopEstateFor(world,order);
  const id=estate?.beneficiaryId;
  return estate?.status==='settled'&&estate.settledTick!==undefined&&estate.settledTick<tick&&
    id&&id!==order.patronId&&id!==order.makerId&&estate.eligibleHeirs.some(row=>row.actorId===id)?id:undefined;
}

/** Ordinary work authority changes only after both original estate continuation consents. */
export function workshopWorkRecipientId(world:WorldState,order:WorkshopOrder,tick:number):string|undefined{
  const continuation=order.estateContinuation;
  if(!continuation)return order.patronId;
  const beneficiary=continuation.beneficiaryId;
  return continuation.phase==='resumed'&&continuation.resumeTick!==undefined&&continuation.resumeTick<tick&&
    beneficiary&&workshopEstateBeneficiary(world,order,tick)===beneficiary?beneficiary:undefined;
}

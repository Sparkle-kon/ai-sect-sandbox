import type { WorkshopDisbandReturn, WorkshopInstitutionClosure, WorkshopOrder, WorldState } from '../types/world';
import { WORKSHOP_ACTIVE_TICKS, workshopTerms } from './workshopEngine';

const ARCHIVE_LIMIT = 64;

export function validateWorkshopInstitutionHistory(world: WorldState, actors: ReadonlySet<string>,
  sectors: ReadonlySet<string>, locations: ReadonlySet<string>, fail: (path:string)=>never): void {
  const proofById=new Map<string,WorkshopInstitutionClosure>();
  const obligations=new Map<string,{closure:WorkshopInstitutionClosure;returned?:WorkshopDisbandReturn}>();
  const abandonments=world.relocations.abandonedSites;
  const abandoned=new Map(abandonments.map(row=>[row.id,row]));
  const arrivals=new Map(world.relocations.plans.map(row=>[row.id,row]));
  const arrivalArchive=new Map(abandonments.map(row=>[row.planId,row]));
  const orderById=new Map(world.workshops.orders.map(order=>[order.id,order]));
  const canProveAbandonment=(tick:number) => abandonments.length<ARCHIVE_LIMIT ||
    tick>(abandonments[0]?.tick ?? Number.POSITIVE_INFINITY);
  const validOrderId=(id:string)=>{
    const serial=Number(id.match(/^commission-([1-9][0-9]*)$/)?.[1]);
    return Number.isSafeInteger(serial) && serial<world.workshops.nextId;
  };
  function verifyReturn(row:WorkshopDisbandReturn,closure:WorkshopInstitutionClosure):boolean {
    const terms=workshopTerms(row.tier,row.quantity);
    const finished=Math.floor(row.workCount/2);
    return actors.has(row.patronId) && actors.has(row.makerId) && row.patronId!==row.makerId &&
      row.acceptedTick<closure.tick && closure.tick<row.acceptedTick+WORKSHOP_ACTIVE_TICKS &&
      row.workCount<row.quantity*2 && row.consumedHerbs===row.workCount &&
      row.consumedStones===terms.blankFuel*Math.ceil(row.workCount/2)+terms.finishFuel*finished &&
      row.paidWages<=finished*terms.feePerPiece && row.paidWages%terms.feePerPiece===0 &&
      row.refundedStones===terms.totalStones-row.consumedStones-row.paidWages &&
      row.refundedHerbs===terms.totalHerbs-row.consumedHerbs;
  }
  for(const closure of world.workshopDisbandments.closures) {
    const source=abandoned.get(closure.abandonedSiteId), arrival=arrivals.get(closure.planId);
    const sequence=Number(closure.planId.match(/^relocation-([1-9][0-9]*)$/)?.[1]);
    if(proofById.has(closure.id) || !Number.isSafeInteger(sequence) || sequence>=world.relocations.nextId ||
      closure.id!==`workshop-disband-${closure.planId}` || closure.abandonedSiteId!==`abandoned-${closure.planId}` ||
      !sectors.has(closure.sectId) || !locations.has(closure.originId) || !locations.has(closure.destinationId) ||
      closure.originId===closure.destinationId || closure.tick>world.tick ||
      (!source && canProveAbandonment(closure.tick)) ||
      (source && (source.planId!==closure.planId || source.sectId!==closure.sectId || source.tick!==closure.tick ||
        source.originId!==closure.originId || source.destinationId!==closure.destinationId ||
        source.originalType!=='sect_hq' || (source.facilities.alchemy_hall ?? 0)<1)) ||
      (arrival && (arrival.status!=='settled' || arrival.settledTick!==closure.tick || arrival.sectId!==closure.sectId ||
        arrival.originId!==closure.originId || arrival.destinationId!==closure.destinationId)))
      return fail('workshopDisbandments.closure.source');
    proofById.set(closure.id,closure);
    for(const returned of closure.returns) {
      if(!validOrderId(returned.orderId) || obligations.has(returned.orderId) || !verifyReturn(returned,closure))
        return fail('workshopDisbandments.closure.return');
      obligations.set(returned.orderId,{closure,returned});
    }
    for(const id of closure.voidedOfferIds) {
      if(!validOrderId(id) || obligations.has(id)) return fail('workshopDisbandments.closure.void');
      obligations.set(id,{closure});
    }
  }
  function verifyOrder(order:WorkshopOrder):boolean {
    const {institution,disbandmentId}=order;
    if((order.closeReason==='institution_closed')!==(disbandmentId!==undefined)) return false;
    if(institution) {
      if(!sectors.has(institution.sectId)||institution.establishedTick>order.offeredTick ||
        (institution.establishedTick!==0)!==(institution.arrivalPlanId!==undefined)) return false;
      if(institution.arrivalPlanId) {
        const start=arrivalArchive.get(institution.arrivalPlanId);
        if((!start&&canProveAbandonment(institution.establishedTick)) || (start&&
          (start.sectId!==institution.sectId || start.destinationId!==order.siteId || start.tick!==institution.establishedTick))) return false;
      }
    }
    const proof=obligations.get(order.id);
    if(!disbandmentId) return !proof;
    if(!proof || !institution || !proofById.has(disbandmentId)) return false;
    const {closure,returned}=proof;
    if(closure.id!==disbandmentId || order.status!=='cancelled' || order.settledTick!==closure.tick ||
      institution.sectId!==closure.sectId || order.siteId!==closure.originId || order.offeredTick>=closure.tick ||
      (order.acceptedTick===undefined)!==(returned===undefined)) return false;
    const epoch=abandonments.filter(row=>row.sectId===closure.sectId && row.destinationId===closure.originId &&
      row.tick<closure.tick).sort((a,b)=>b.tick-a.tick)[0];
    if(epoch && (institution.establishedTick!==epoch.tick || institution.arrivalPlanId!==epoch.planId)) return false;
    if(!returned) return order.offerExpiresTick>closure.tick && !order.refundedStones && !order.refundedHerbs;
    return returned.patronId===order.patronId && returned.makerId===order.makerId && returned.acceptedTick===order.acceptedTick &&
      returned.tier===order.tier && returned.quantity===order.quantity && returned.workCount===order.work.length &&
      returned.consumedStones===order.work.reduce((sum,row)=>sum+row.stonesUsed,0) &&
      returned.consumedHerbs===order.work.reduce((sum,row)=>sum+row.herbsUsed,0) &&
      returned.paidWages===order.work.reduce((sum,row)=>sum+(row.feePaid??0),0) &&
      returned.refundedStones===order.refundedStones && returned.refundedHerbs===order.refundedHerbs;
  }
  for(const order of orderById.values()) if(!verifyOrder(order)) return fail('workshopDisbandments.order.reference');
}

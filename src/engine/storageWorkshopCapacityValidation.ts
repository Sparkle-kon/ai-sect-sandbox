import type { WorldState } from '../types/world';
import { WORKSHOP_CAPACITY_RECOVERY_TICKS } from './workshopCapacityTerms';
import { workshopTerms } from './workshopEngine';

export function validateWorkshopCapacityClauses(world:WorldState,fail:(path:string)=>never):void {
  const amended=new Map<string,{tick:number;stone:number;earth_root:number;patronId:string;makerId:string}>();
  const cases=new Map(world.furnaceSafety.cases.map((entry)=>[entry.id,entry]));
  for(const order of world.workshops.orders){
    const {capacityOffer:offer,capacityAmendment:amendment,acceptedTick,deadlineTick}=order;
    if(!offer&&!amendment)continue;
    if(!offer||acceptedTick===undefined||deadlineTick===undefined||order.institution!==undefined||
        order.quantity!==2||order.makerId!==offer.makerId||offer.offeredTick>=deadlineTick||offer.offeredTick>world.tick||
        offer.offeredTick>(order.settledTick??Infinity)||offer.blankTick<=acceptedTick||
        offer.blankTick>=offer.damagedTick||offer.damagedTick>offer.offeredTick)
      return fail('workshops.capacity.offer');
    const source=cases.get(offer.caseId), first=order.work[0];
    const closedAt=(tick:number)=>Boolean(source&&source.siteId===order.siteId&&source.damagedTick===offer.damagedTick&&
      (source.reopenedTick===undefined||tick<=source.reopenedTick)&&
      !world.furnaceSafety.cases.some((entry)=>entry.siteId===order.siteId&&entry.damagedTick>source.damagedTick&&entry.damagedTick<=tick));
    if(!first||first.stage!=='blank'||first.piece!==1||first.tick!==offer.blankTick||
        order.work.slice(1).some((step)=>step.tick<=offer.offeredTick)||!closedAt(offer.offeredTick))
      return fail('workshops.capacity.physicalSource');
    if(!amendment)continue;
    const terms=workshopTerms(order.tier,1);
    if(amendment.patronId!==order.patronId||amendment.acceptedTick<=offer.offeredTick||amendment.acceptedTick>=deadlineTick||
        amendment.acceptedTick>world.tick||amendment.acceptedTick>(order.settledTick??Infinity)||!closedAt(amendment.acceptedTick)||
        amendment.releasedQuantity!==1||amendment.keptQuantity!==1||
        amendment.workUntilTick!==deadlineTick+WORKSHOP_CAPACITY_RECOVERY_TICKS||amendment.releasedStones!==terms.totalStones||
        amendment.releasedHerbs!==terms.totalHerbs||order.refundedStones<amendment.releasedStones||
        order.refundedHerbs<amendment.releasedHerbs||order.work.length>2||
        order.work.slice(1).some((step)=>step.tick<=amendment.acceptedTick||step.tick<=(source?.reopenedTick??Infinity)))
      return fail('workshops.capacity.amendment');
    amended.set(order.id,{tick:amendment.acceptedTick,stone:amendment.releasedStones,earth_root:amendment.releasedHerbs,
      patronId:order.patronId,makerId:order.makerId});
  }
  const complete=new Set<number>(), counts=new Map<string,Set<string>>();
  for(const month of world.resourceFlow.months){
    if(month.totalEntries===month.entries.length)complete.add(month.tick);
    for(const row of month.entries){
      if(row.reason!=='workshop_capacity_release')continue;
      const target=amended.get(row.refId), assets=counts.get(row.refId)??new Set<string>();
      if(!target||row.kind!=='transfer'||row.mechanism!=='workshop'||row.tick!==target.tick||
          row.from.kind!=='workshop'||row.from.id!==row.refId||row.to.kind!=='actor'||row.to.id!==target.patronId||
          (row.good!=='stone'&&row.good!=='earth_root')||row.amount!==target[row.good]||assets.has(row.good)||
          row.visibility.kind!=='participants'||row.visibility.actorIds.length!==2||
          !row.visibility.actorIds.includes(target.patronId)||!row.visibility.actorIds.includes(target.makerId))
        return fail('workshops.capacity.releaseJournal');
      assets.add(row.good);counts.set(row.refId,assets);
    }
  }
  for(const [id,receipt] of amended) if(complete.has(receipt.tick)&&counts.get(id)?.size!==2)fail('workshops.capacity.releaseJournal');
}

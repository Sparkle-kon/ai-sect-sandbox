import type { ResourceFlowAccount,WorldState } from '../types/world';
import { VILLAGE_FAIR_CAPACITY,VILLAGE_FAIR_FEE } from './villageFairEngine';
import { VILLAGE_GRANARY_RECEIPT_LIMIT } from './villageGranaryEngine';
import { flowActor,flowVillageFairStall,sameFlowAccount } from './resourceFlowEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { terrainTileAt } from './terrainEngine';

const fairReasons=new Set(['fair_reserve_fee','fair_local_service','fair_refund_fee']);
type Expected={fairId:string;tick:number;reason:string;kind:'transfer'|'consumption';merchantId:string;sponsorId:string;from:ResourceFlowAccount;to?:ResourceFlowAccount};
export function validateVillageFairHistory(world:WorldState,people:ReadonlySet<string>,fail:(path:string)=>never):void {
  const {fairs,nextId}=world.villageFairs;
  if(!fairs.length) {
    if(world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='village_fair'||fairReasons.has(row.reason)||
      ('from'in row&&row.from.kind==='village_fair')||('to'in row&&row.to.kind==='village_fair'))))fail('villageFairs.fee.source');
    return;
  }
  const ids=new Set<string>(), intervals=new Map<string,Array<{start:number;end:number}>>();
  const sites=new Map(world.locations.map(row=>[row.id,row]));
  const villages=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const books=new Map(world.villageGranaries.granaries.map(row=>[row.settlementId,row]));
  const orders=new Map(world.markets.orders.map(row=>[row.id,row]));
  const expected=new Map<string,Expected>();
  const key=(ref:string,tick:number,reason:string,heldId:string)=>JSON.stringify([ref,tick,reason,heldId]);
  const validId=(id:string,pattern:RegExp,bound:number)=>{
    const serial=Number(pattern.exec(id)?.[1]);return Number.isSafeInteger(serial)&&serial<bound;
  };
  for(const fair of fairs){
    const {id,settlementId,siteId,sponsorId,sponsorDonationTick,sponsorDonationKind,announcedTick,claimTick,opensTick,endsTick,status,closure,closedTick,hazard}=fair;
    const site=sites.get(siteId);
    if(!validId(id,/^village-fair-([1-9]\d*)$/,nextId)||ids.has(id)||!people.has(sponsorId)||
        villages.get(settlementId)?.locationId!==siteId||announcedTick>world.tick||claimTick!==announcedTick+1||
        opensTick!==announcedTick+2||endsTick!==opensTick+1||fair.stalls.length>VILLAGE_FAIR_CAPACITY||
        ((status==='announced'||status==='open')&&site?.type!=='market')||
        (status==='announced'&&(world.tick>=opensTick||closedTick!==undefined||closure!==undefined))||
        (status==='open'&&(world.tick!==opensTick||closedTick!==undefined||closure!==undefined))||
        (status==='ended'&&(closedTick!==endsTick||endsTick>world.tick||closure!==undefined))||
        (status==='cancelled'&&(!closure||closedTick===undefined||closedTick<=announcedTick||closedTick>opensTick||
          closedTick>world.tick||(closure==='sponsor_absent'&&closedTick!==opensTick)))||
        Boolean(hazard)!==(closure==='site_hazard'))
      fail('villageFairs.source');
    ids.add(id);
    const contribution=books.get(settlementId)?.receipts;
    if(sponsorDonationTick>announcedTick||!contribution||
        (!contribution.some(row=>row.actorId===sponsorId&&row.tick===sponsorDonationTick&&row.kind===sponsorDonationKind)&&
          !(contribution.length===VILLAGE_GRANARY_RECEIPT_LIMIT&&sponsorDonationTick<=contribution[0].tick)))
      fail('villageFairs.sponsor');
    if(hazard&&(!site||terrainTileAt(world,site.x,site.y)?.id!==hazard.tileId||
        hazard.intensity<2||(closedTick===undefined||!routeWarningHazardValid(world,hazard,closedTick))))fail('villageFairs.hazard');
    const prior=intervals.get(siteId)??[];
    prior.push({start:announcedTick,end:status==='cancelled'?(closedTick??endsTick):endsTick});
    intervals.set(siteId,prior);

    const merchants=new Set<string>(), references=new Set<string>();
    for(const stall of fair.stalls){
      const {merchantId,orderId,reservedTick,feeEscrow,offering,settledTick,releaseReason}=stall;
      const order=orders.get(orderId), held=flowVillageFairStall(id,orderId);
      const reserved=stall.status==='reserved', paid=stall.status==='paid', finished=paid||stall.status==='refunded';
      if(!people.has(merchantId)||merchantId===sponsorId||merchants.has(merchantId)||references.has(orderId)||
          !validId(orderId,/^order-([1-9]\d*)$/,world.markets.nextId)||reservedTick!==claimTick||reservedTick>world.tick||
          (status==='cancelled'&&reservedTick>=(closedTick??opensTick))||
          feeEscrow!==(finished?0:VILLAGE_FAIR_FEE)||(status==='announced')!==reserved||
          Boolean(offering)!==paid||((reserved||paid)?releaseReason!==undefined:releaseReason===undefined)||
          (releaseReason==='fair_cancelled')!==(status==='cancelled')||(paid&&settledTick!==opensTick)||
          (finished?(settledTick===undefined||settledTick<(status==='cancelled'?(closedTick??opensTick):opensTick)||
            settledTick>world.tick):settledTick!==undefined)||
          (order&&(order.actorId!==merchantId||order.locationId!==siteId||order.side!=='sell'||order.expiresTick<=opensTick||
            order.placedTick>reservedTick||(order.settledTick??Infinity)<reservedTick||
            (paid&&(order.settledTick??Infinity)<opensTick)))||
          (offering&&order&&(offering.good!==order.good||offering.unitPrice!==order.limitPrice||offering.quantity>order.quantity)))
        fail('villageFairs.stalls.source');
      merchants.add(merchantId);references.add(orderId);
      const store=(tick:number,reason:string,kind:Expected['kind'],from:ResourceFlowAccount,to?:ResourceFlowAccount)=>{
        expected.set(key(id,tick,reason,held.id),{fairId:id,tick,reason,kind,merchantId,sponsorId,from,...(to?{to}:{})});
      };
      store(reservedTick,'fair_reserve_fee','transfer',flowActor(merchantId),held);
      if(finished&&settledTick!==undefined) {
        if(paid)store(settledTick,'fair_local_service','consumption',held);
        else store(settledTick,'fair_refund_fee','transfer',held,flowActor(merchantId));
      }
    }
  }
  for(const rows of intervals.values()){
    rows.sort((a,b)=>a.start-b.start||a.end-b.end);
    if(rows.some((row,i)=>i>0&&row.start<rows[i-1].end))fail('villageFairs.overlap');
  }
  const seen=new Set<string>(), complete=new Set<number>();
  for(const month of world.resourceFlow.months) {
    if(month.totalEntries===month.entries.length)complete.add(month.tick);
    for(const row of month.entries){
      const from='from'in row?row.from:undefined, to='to'in row?row.to:undefined;
      const escrow=from?.kind==='village_fair'?from:to?.kind==='village_fair'?to:undefined;
      if(row.mechanism!=='village_fair'&&!fairReasons.has(row.reason)&&!escrow)continue;
      const id=escrow?key(row.refId,row.tick,row.reason,escrow.id):'';
      const wanted=expected.get(id);
      if(row.mechanism!=='village_fair'||!wanted||seen.has(id)||!from||row.kind!==wanted.kind||
          row.good!=='stone'||row.amount!==VILLAGE_FAIR_FEE||!sameFlowAccount(wanted.from,from)||
          (wanted.to?(!to||!sameFlowAccount(wanted.to,to)):to!==undefined)||
          row.visibility.kind!=='participants'||row.visibility.actorIds.length!==2||
          !row.visibility.actorIds.includes(wanted.merchantId)||!row.visibility.actorIds.includes(wanted.sponsorId))
        fail('villageFairs.fee.source');
      seen.add(id);
    }
  }
  for(const [id,row] of expected)if(complete.has(row.tick)&&!seen.has(id))fail('villageFairs.fee.missing');
}

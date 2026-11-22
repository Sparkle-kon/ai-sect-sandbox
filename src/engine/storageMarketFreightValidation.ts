import type {EscortContract,MarketShipment,ResourceFlowAccount,WorldState} from '../types/world';
import {MARKET_FREIGHT_DISPATCH_TICKS,marketFreightCapacity,marketFreightQuote} from './marketFreightTerms';
import {RESOURCE_FLOW_MONTH_LIMIT,sameFlowAccount} from './resourceFlowEngine';
import {terrainTileAt} from './terrainEngine';

const freightEvent=(id:string)=>/^evt-[0-9]+-(?:freight-escort-[1-9][0-9]*-|escort-[1-9][0-9]*-freight-)/u.test(id);
type Fail=(field:string)=>never;
type EventProof={tick:number;actors:readonly string[];siteId?:string};
type FreightTransfer={tick:number;amount:number;actors:readonly string[];from:ResourceFlowAccount;to:ResourceFlowAccount};
type EconomicProof=FreightTransfer&{good:MarketShipment['good']|'stone';optional?:true};
const eq=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,index)=>id===b[index]);
const key=(ref:string,reason:string,tick:number,good:string)=>JSON.stringify([ref,reason,tick,good]);
const pocket=(id:string):ResourceFlowAccount=>({kind:'actor',id});
const actorList=(contract:EscortContract,carrierId:string)=>[contract.clientId,carrierId];
const sameSource=(a:MarketShipment,b:WorldState['markets']['receipts'][number])=>
  a.buyerId===b.buyerId&&a.sellerId===b.sellerId&&a.originId===b.originId&&a.destinationId===b.destinationId&&
  a.good===b.good&&a.quantity===b.quantity&&a.unitPrice===b.unitPrice&&a.status===b.status;

/** Freight evidence never grants a second market fill, a new good, or a second fee. */
export function validateMarketFreight(world:WorldState,fail:Fail):void{
  const escrows=new Set<string>();
  const expectedEvents=new Map<string,EventProof>();
  const expected=new Map<string,EconomicProof>();
  const marketFreightShipments=new Set<string>();
  const marketFreightOrders=new Set<string>();
  const contracts=world.escorts.contracts.filter(contract=>contract.freight);
  if(contracts.length){
    const actors=new Set(world.cultivators.map(row=>row.id));
    const sites=new Map(world.locations.map(row=>[row.id,row]));
    const ships=new Map(world.markets.shipments.map(row=>[row.id,row]));
    const orders=new Map(world.markets.orders.map(row=>[row.id,row]));
    const receipts=new Map<string,WorldState['markets']['receipts']>();
    const reports=new Map<string,WorldState['escorts']['reports']>();
    for(const report of world.escorts.reports){
      const group=reports.get(report.contractId);
      if(group)group.push(report);else reports.set(report.contractId,[report]);
    }
    for(const receipt of world.markets.receipts){
      if(!receipt.shipmentId)continue;
      const group=receipts.get(receipt.shipmentId);
      if(group)group.push(receipt);else receipts.set(receipt.shipmentId,[receipt]);
    }
    for(const contract of contracts){
      const freight=contract.freight;
      if(!freight)return fail('escorts.freight.protocol');
      const shipment=ships.get(contract.shipmentId);
      if(!shipment||shipment.id!==`caravan-${shipment.sequence}`||contract.id!==`freight-escort-${shipment.sequence}`||
        shipment.sequence>=world.markets.nextId||!actors.has(freight.carrierId)||freight.carrierId===shipment.sellerId||
        freight.carrierId===shipment.buyerId||freight.buyOrderId!==shipment.buyOrderId||freight.sellOrderId!==shipment.sellOrderId||
        freight.buyerId!==shipment.buyerId||freight.good!==shipment.good||freight.quantity!==shipment.quantity||
        freight.unitPrice!==shipment.unitPrice||freight.departedTick!==shipment.departedTick||
        contract.offeredTick!==shipment.departedTick+1||contract.expiresTick!==contract.offeredTick+1)
        return fail('escorts.freight.source');
      const {buyerId,sellerId,originId,destinationId,quantity,good,unitPrice,departedTick,arrivalTick,settledTick}=shipment;
      const ask=orders.get(shipment.sellOrderId),bid=orders.get(shipment.buyOrderId);
      if(!ask||!bid||ask.side!=='sell'||bid.side!=='buy'||ask.id!==`order-${ask.sequence}`||bid.id!==`order-${bid.sequence}`||
        ask.sequence>=shipment.sequence||bid.sequence>=shipment.sequence||ask.actorId!==sellerId||bid.actorId!==buyerId||
        ask.locationId!==originId||bid.locationId!==destinationId||ask.good!==good||bid.good!==good||
        ask.quantity-ask.remaining<quantity||bid.quantity-bid.remaining<quantity||ask.placedTick>departedTick||bid.placedTick>departedTick||
        departedTick>=ask.expiresTick||departedTick>=bid.expiresTick||ask.limitPrice>bid.limitPrice||
        unitPrice!==(bid.sequence<ask.sequence?bid.limitPrice:ask.limitPrice))
        return fail('escorts.freight.order');
      marketFreightOrders.add(shipment.buyOrderId);
      marketFreightOrders.add(shipment.sellOrderId);
      const proof=marketFreightQuote(shipment.good,shipment.quantity);
      if(!proof||freight.load!==proof.load||freight.band!==proof.band||freight.fee!==proof.fee||freight.rations!==proof.rations)
        return fail('escorts.freight.quote');
      const marketReceipts=receipts.get(shipment.id)??[];
      if(shipment.status==='in_transit'){
        if(settledTick!==undefined||marketReceipts.length)return fail('escorts.freight.marketReceipt');
      }else{
        const [receipt]=marketReceipts;
        if(marketReceipts.length!==1||!receipt||settledTick===undefined||settledTick<contract.offeredTick||settledTick>world.tick||
          receipt.id!==`receipt-${receipt.sequence}`||receipt.sequence<=shipment.sequence||receipt.sequence>=world.markets.nextId||
          receipt.tick!==settledTick||receipt.reason!==shipment.reason||!sameSource(shipment,receipt))
          return fail('escorts.freight.marketReceipt');
      }
      if(contract.holdAppliedTick!==undefined&&contract.holdAppliedTick!==contract.offeredTick)return fail('escorts.freight.timeline');
      const {acceptedTick,settledTick:closed,status}=contract;
      const {capability,dispatchByTick,dispatch,closedBy}=freight;
      const open=status==='offered'||status==='active';
      const participants=actorList(contract,freight.carrierId);
      const mark=(tick:number,tag:string,siteId:string)=>{
        expectedEvents.set(`evt-${tick}-${contract.id}-freight-${tag}`,{tick,actors:participants,siteId});
      };
      const account:ResourceFlowAccount={kind:'freight',id:contract.id};
      const held:ResourceFlowAccount={kind:'shipment',id:shipment.id};
      const addFee=(tick:number,reason:string,from:ResourceFlowAccount,to:ResourceFlowAccount)=>
        expected.set(key(contract.id,reason,tick,'stone'),{tick,amount:proof.fee,actors:participants,from,to,good:'stone'});
      escrows.add(contract.id);
      marketFreightShipments.add(shipment.id);
      mark(contract.offeredTick,'offered',originId);
      addFee(contract.offeredTick,'freight_deposit',pocket(sellerId),account);

      if(acceptedTick===undefined){
        if(capability||dispatchByTick!==undefined||dispatch||contract.escortId!==undefined||contract.stride!==0||
          contract.path.length||contract.pathIndex!==0||contract.lastCrossedTileIds.length||contract.lastAdvancedTick!==undefined||
          contract.arrivedTick!==undefined||contract.detours.length||contract.usedReportIds.length||
          status!=='offered'&&status!=='expired')
          return fail('escorts.freight.consent');
      }else{
        if(acceptedTick!==contract.expiresTick||contract.escortId!==freight.carrierId||!capability||
          capability.capacity!==marketFreightCapacity(capability.realm,capability.stage)||capability.capacity<proof.load||
          dispatchByTick!==acceptedTick+MARKET_FREIGHT_DISPATCH_TICKS||acceptedTick>(closed??world.tick)||status==='offered'||status==='expired')
          return fail('escorts.freight.consent');
        mark(acceptedTick,'accepted',originId);
        const route=contract.path.map(point=>terrainTileAt(world,point.x,point.y));
        const source=sites.get(originId),destination=sites.get(destinationId);
        if(!source||!destination||route.length<2||route.some(row=>!row)||route[0]?.id===route.at(-1)?.id||
          terrainTileAt(world,source.x,source.y)?.id!==route[0]?.id||
          terrainTileAt(world,destination.x,destination.y)?.id!==route.at(-1)?.id||
          route.slice(1).some((next,index)=>{
            const current=route[index];
            if(!next||!current)return true;
            const distance=Math.abs(next.col-current.col)+Math.abs(next.row-current.row);
            return distance>1||distance!==1&&(index===0||contract.detours.length===0);
          }))return fail('escorts.freight.route');
        const nominal=Math.max(1,Math.ceil((route.length-1)/Math.max(2,arrivalTick-departedTick))-
          (freight.band==='light'?0:freight.band==='medium'?1:2));
        if(contract.stride<=0||!contract.detours.length&&contract.stride!==nominal)return fail('escorts.freight.route');
        if(dispatch){
          if(dispatch.tick<acceptedTick||dispatch.tick>=dispatchByTick||dispatch.tick>(closed??world.tick)||
            dispatch.pathIndex!==1||dispatch.pathIndex>contract.pathIndex||dispatch.fromTileId!==route[0]?.id||dispatch.toTileId!==route[1]?.id||
            dispatch.fromTileId===dispatch.toTileId||(contract.lastAdvancedTick??-1)<dispatch.tick||
            (contract.arrivedTick!==undefined&&contract.arrivedTick<dispatch.tick)||
            contract.detours.some(row=>row.tick<=dispatch.tick))
            return fail('escorts.freight.dispatch');
          addFee(dispatch.tick,'freight_dispatch',account,pocket(freight.carrierId));
        }else if(contract.pathIndex!==0||contract.lastCrossedTileIds.length||contract.arrivedTick!==undefined||contract.detours.length||contract.usedReportIds.length){
          return fail('escorts.freight.dispatch');
        }
      }
      const spent=dispatch?1+contract.detours.length:0;
      if(contract.rationsSpent!==spent||spent>proof.rations||
        contract.rationsEscrow!==(open&&acceptedTick!==undefined?proof.rations-spent:0)||
        contract.rationsReturned!==(!open&&acceptedTick!==undefined?proof.rations-spent:0)||
        contract.feeEscrow!==(open&&!dispatch?proof.fee:0)||contract.feePaid!==(dispatch?proof.fee:0)||
        contract.feeRefunded!==(!open&&!dispatch?proof.fee:0))
        return fail('escorts.freight.custody');
      if(open){
        if(closedBy!==undefined||status==='active'&&!dispatch&&world.tick>=(dispatchByTick??Infinity))
          return fail('escorts.freight.closure');
      }else{
        if(closed===undefined||Boolean(closedBy)===Boolean(dispatch)||status==='delivered'&&(!dispatch||shipment.status!=='delivered'||
          closed!==settledTick||contract.arrivedTick===undefined||contract.arrivedTick>closed)||
          status==='failed'&&(acceptedTick===undefined||settledTick!==closed||shipment.status==='delivered')||
          status==='expired'&&(acceptedTick!==undefined||closedBy!=='declined'&&closedBy!=='withdrawn'&&closedBy!=='expired'&&closedBy!=='shipment_ended')||
          status==='failed'&&!dispatch&&closedBy!=='incapable'&&closedBy!=='shipment_ended')
          return fail('escorts.freight.closure');
        if(closedBy==='shipment_ended'&&closed!==settledTick||
          closedBy==='expired'&&(closed<contract.expiresTick||closed>(settledTick??world.tick)))
          return fail('escorts.freight.closure');
        if(closedBy==='declined'||closedBy==='withdrawn'){
          if(closed>contract.expiresTick||closedBy==='declined'&&closed<=contract.offeredTick)
            return fail('escorts.freight.closure');
          mark(closed,closedBy,originId);
        }else if(acceptedTick!==undefined)mark(closed,'settled',status==='delivered'?destinationId:originId);
        if(!dispatch)addFee(closed,'freight_refund',account,pocket(sellerId));
      }

      const scouts=reports.get(contract.id)??[];
      if(scouts.length>16||scouts.some((report,index)=>{
        if(report.id!==`escort-report-${contract.id}-${index+1}`||acceptedTick===undefined||report.observedTick<acceptedTick||
          report.observedTick>(contract.arrivedTick??Infinity)||report.observedTick>(closed??world.tick)||
          report.reporterId===sellerId||report.reporterId===freight.carrierId)return true;
        expectedEvents.set(`evt-${report.observedTick}-${contract.id}-${report.id}`,
          {tick:report.observedTick,actors:[report.reporterId,freight.carrierId]});
        return false;
      }))return fail('escorts.freight.reports');

      const ordinaryParties=[buyerId,sellerId],price=unitPrice*quantity;
      const addMarket=(tick:number,reason:string,item:MarketShipment['good']|'stone',amount:number,
        from:ResourceFlowAccount,to:ResourceFlowAccount)=>
        expected.set(key(shipment.id,reason,tick,item),{tick,amount,actors:ordinaryParties,from,to,good:item,optional:true});
      addMarket(departedTick,'shipment_departure','stone',price,{kind:'order',id:shipment.buyOrderId},held);
      addMarket(departedTick,'shipment_departure',good,quantity,{kind:'order',id:shipment.sellOrderId},held);
      if(settledTick!==undefined&&shipment.status==='delivered'){
        addMarket(settledTick,'shipment_delivery','stone',price,held,pocket(sellerId));
        addMarket(settledTick,'shipment_delivery',good,quantity,held,pocket(buyerId));
      }else if(settledTick!==undefined&&shipment.status==='returned'){
        addMarket(settledTick,'shipment_return','stone',price,held,pocket(buyerId));
        addMarket(settledTick,'shipment_return',good,quantity,held,pocket(sellerId));
      }else if(settledTick!==undefined&&shipment.status==='lost'){
        addMarket(settledTick,'shipment_refund','stone',price,held,pocket(buyerId));
      }
    }
  }

  // Broader raw arrays are only for exact pinned proofs, not a relaxation of
  // the old world format's maximum unrelated market inventory/history.
  if(world.markets.orders.filter(order=>!marketFreightOrders.has(order.id)).length>320||
    world.markets.shipments.filter(shipment=>!marketFreightShipments.has(shipment.id)).length>160||
    world.markets.receipts.filter(receipt=>!receipt.shipmentId||!marketFreightShipments.has(receipt.shipmentId)).length>100)
    return fail('escorts.freight.marketRetention');
  const seenEvents=new Set<string>();
  for(const fact of world.events){
    if(!freightEvent(fact.id))continue;
    const proof=expectedEvents.get(fact.id);
    if(!proof||seenEvents.has(fact.id)||proof.tick!==fact.tick||proof.siteId!==fact.locationId||
      fact.category!=='diplomacy'||fact.witnessScope!=='participants'||!eq(fact.actorIds,proof.actors))
      return fail('escorts.freight.event');
    seenEvents.add(fact.id);
  }
  const exposed=(anchors:readonly {id:string}[])=>anchors.some(anchor=>freightEvent(anchor.id));
  if(exposed(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(row=>exposed(row.anchors))||
    world.coldHistory.chapters.some(row=>exposed(row.anchors)))return fail('escorts.freight.archive');
  const seen=new Set<string>(),complete=new Map<number,boolean>();
  for(const book of world.resourceFlow.months){
    complete.set(book.tick,book.totalEntries===book.entries.length);
    for(const entry of book.entries){
      const freightAccount=('from'in entry&&entry.from.kind==='freight')||('to'in entry&&entry.to.kind==='freight');
      const origShipment=marketFreightShipments.has(entry.refId)&&/^(?:shipment_departure|shipment_delivery|shipment_return|shipment_refund)$/u.test(entry.reason);
      if(!freightAccount&&!escrows.has(entry.refId)&&!entry.reason.startsWith('freight_')&&!origShipment)continue;
      const k=key(entry.refId,entry.reason,entry.tick,entry.good),match=expected.get(k);
      if(!match||seen.has(k)||entry.kind!=='transfer'||entry.mechanism!=='market'||entry.amount!==match.amount||
        !sameFlowAccount(entry.from,match.from)||!sameFlowAccount(entry.to,match.to)||
        entry.visibility.kind!=='participants'||!eq(entry.visibility.actorIds,match.actors))
        return fail('escorts.freight.journal');
      seen.add(k);
    }
  }
  for(const [k,proof] of expected){
    if(!seen.has(k)&&proof.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&
      (proof.optional?complete.get(proof.tick)===true:complete.get(proof.tick)!==false))
      return fail('escorts.freight.journal');
  }
}

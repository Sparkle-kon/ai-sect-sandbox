import {describe,expect,it} from 'vitest';
import {possessAvatar,queueAvatarMarketFreight} from '../src/engine/avatarEngine';
import {availableMarketFreightActions,ESCORT_FEE} from '../src/engine/escortEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {acceptedNativeFreight,freightActor,freightBuyer,freightCarrier,freightContract,freightDecision,
  freightMonth,freightOpt,freightOrigin,freightSeller,freightShipment,nativeFreightShipment,offeredNativeFreight}
  from './marketFreightNativeFixture';

const row=(w:WorldState)=>freightContract(w)!;
const terms=(w:WorldState)=>row(w).freight!;
const first=(w:WorldState)=>{
  for(let i=0;i<6&&!terms(w).dispatch;i++)w=freightMonth(w);
  expect(terms(w).dispatch).toBeDefined();
  return w;
};
const settle=(w:WorldState)=>{
  for(let i=0;i<12&&freightShipment(w).status==='in_transit';i++)w=freightMonth(w);
  expect(freightShipment(w).status).not.toBe('in_transit');
  return w;
};
const reopened=(world:WorldState)=>{
  const raw=encodeWorldSave(world);
  const restored=decodeWorldSave(raw);
  expect(encodeWorldSave(restored)).toBe(raw);
  return restored;
};
function corrupt(raw:string,mutation:(world:WorldState)=>void){
  const envelope=JSON.parse(raw) as {world:WorldState};
  mutation(envelope.world);
  return ()=>decodeWorldSave(JSON.stringify(envelope));
}

describe('strict freight storage binds one original order match and one actual transfer of fee',()=>{
  it('preserves legacy thirty-stone paths and blank ordinary market histories without inferring weighed freight',()=>{
    const initial=nativeFreightShipment(),ordinary=initial.world;
    expect(reopened(ordinary).escorts.contracts).toEqual([]);
    const legacy=freightMonth(ordinary,{[freightSeller]:freightDecision('ESCORT',{
      escortMove:'offer',targetShipmentId:initial.shipment.id})});
    const booking=legacy.escorts.contracts[0];
    expect(booking.id).toBe(`escort-${initial.shipment.sequence}`);
    expect(booking.freight).toBeUndefined();
    expect(reopened(legacy).escorts.contracts[0]).toMatchObject({feeEscrow:ESCORT_FEE,feePaid:0,status:'offered'});
    const signed=freightMonth(legacy,{[freightCarrier]:freightDecision('ESCORT',{escortMove:'accept',targetEscortId:booking.id})});
    const delivered=settle(signed),saved=reopened(delivered);
    expect(saved.escorts.contracts[0]).toMatchObject({feePaid:30,feeEscrow:0,status:'delivered'});
    expect(saved.escorts.contracts[0].freight).toBeUndefined();
    expect(saved.markets.receipts).toEqual(delivered.markets.receipts);
    const raw=encodeWorldSave(delivered);
    expect(corrupt(raw,w=>{w.escorts.contracts[0].feePaid=29;})).toThrow('escorts.contracts.escrow');
  });

  it('reopens the genuinely partial original shipment and rejects a rescaled, wrong, or duplicated commercial receipt',()=>{
    const offered=offeredNativeFreight(),{world:accepted}=acceptedNativeFreight();
    const moving=first(accepted),delivered=settle(moving);
    for(const phase of [offered.world,accepted,moving,delivered])expect(reopened(phase).escorts).toEqual(phase.escorts);
    const port=encodeEraWorldSave(delivered);
    expect(encodeEraWorldSave(decodeEraWorldSave(port))).toBe(port);
    expect(encodeEraWorldSave(freightMonth(reopened(moving)))).toBe(encodeEraWorldSave(freightMonth(moving)));
    const ship=freightShipment(delivered);
    expect(delivered.markets.orders.find(order=>order.id===ship.sellOrderId)?.quantity).toBe(5);
    expect(ship).toMatchObject({status:'delivered',quantity:1,unitPrice:11});
    expect(delivered.markets.receipts).toEqual([expect.objectContaining({shipmentId:ship.id,quantity:1,unitPrice:11})]);
    const raw=encodeWorldSave(delivered);
    const negatives:Array<[string,(w:WorldState)=>void]>=[
      ['escorts.freight.source',w=>{terms(w).quantity=5;}],
      ['escorts.freight.source',w=>{terms(w).carrierId=freightBuyer;}],
      ['escorts.freight.source',w=>{terms(w).sellOrderId=terms(w).buyOrderId;}],
      ['escorts.freight.order',w=>{w.markets.orders=w.markets.orders.filter(order=>order.id!==terms(w).sellOrderId);}],
      ['escorts.freight.quote',w=>{terms(w).load++;}],
      ['escorts.freight.marketReceipt',w=>{w.markets.receipts[0].quantity=5;}],
      ['escorts.freight.marketReceipt',w=>{w.markets.receipts[0].unitPrice=10;}],
      ['escorts.freight.marketReceipt',w=>{const sequence=w.markets.nextId++;w.markets.receipts.push({...w.markets.receipts[0],sequence,id:`receipt-${sequence}`});}],
      ['escorts.freight.marketReceipt',w=>{w.markets.receipts=[];}],
      ['escorts.freight.protocol',w=>{
        const book=row(w);
        delete book.freight;
        // Old numerical constants can coincide with a weighed quote. Namespace
        // provenance still refuses a protocol downgrade instead of treating it as old escrow.
        book.feePaid=30;book.rationsSpent=1;book.rationsReturned=2;
      }],
      ['escorts.contracts[0].freight.inferredLoss',w=>{Object.assign(terms(w),{inferredLoss:true});}],
    ];
    for(const [field,mutation] of negatives)expect(corrupt(raw,mutation)).toThrow(field);
  });

  it('rejects invented first physical edges, fee reversal after real dispatch, and unrelated or public financial endpoints',()=>{
    const moving=first(acceptedNativeFreight().world),raw=encodeWorldSave(moving);
    const negatives:Array<[string,(w:WorldState)=>void]>=[
      ['escorts.freight.consent',w=>{terms(w).capability!.capacity++;}],
      ['escorts.freight.dispatch',w=>{terms(w).dispatch!.toTileId=terms(w).dispatch!.fromTileId;}],
      ['escorts.freight.dispatch',w=>{terms(w).dispatch!.pathIndex=2;}],
      ['escorts.freight.dispatch',w=>{delete terms(w).dispatch;}],
      ['escorts.freight.custody',w=>{row(w).feeRefunded=row(w).feePaid;row(w).feePaid=0;}],
      ['escorts.freight.custody',w=>{row(w).rationsEscrow++;}],
      ['escorts.freight.journal',w=>{
        const line=w.resourceFlow.months.flatMap(month=>month.entries).find(item=>item.reason==='freight_dispatch');
        if(line?.kind==='transfer')line.to.id=freightBuyer;
      }],
      ['escorts.freight.journal',w=>{
        const line=w.resourceFlow.months.flatMap(month=>month.entries).find(item=>item.reason==='freight_dispatch');
        if(line?.kind==='transfer')line.visibility={kind:'observer'};
      }],
      ['escorts.freight.journal',w=>{
        const line=w.resourceFlow.months.flatMap(month=>month.entries).find(item=>item.reason==='shipment_departure'&&item.good!=='stone');
        if(line?.kind==='transfer')line.from.id=terms(w).buyOrderId;
      }],
      ['escorts.freight.event',w=>{delete w.events.find(event=>event.id.endsWith('-freight-accepted'))!.witnessScope;}],
    ];
    for(const [field,mutation] of negatives)expect(corrupt(raw,mutation)).toThrow(field);
  });

  it('preserves the actual unpaid request and full independent refund when the first edge stays hazardous',()=>{
    const {world:offered}=offeredNativeFreight();
    const origin=offered.locations.find(site=>site.id===freightOrigin)!;
    const unsafe=applyMapBrush(applyMapBrush(offered,'cursed_miasma',[origin]),'cursed_miasma',[origin]);
    const accepted=freightMonth(unsafe,{[freightCarrier]:freightOpt(unsafe,freightCarrier,'accept')});
    expect(row(reopened(accepted))).toMatchObject({status:'active',pathIndex:0,feePaid:0,feeEscrow:10,rationsSpent:0});
    const returned=settle(accepted);
    const saved=reopened(returned);
    expect(terms(saved).dispatch).toBeUndefined();
    expect(row(saved)).toMatchObject({status:'failed',feePaid:0,feeEscrow:0,feeRefunded:10,
      rationsSpent:0,rationsReturned:2,freight:{closedBy:'incapable'}});
    expect(saved.markets.receipts).toEqual([expect.objectContaining({status:'returned',quantity:1,unitPrice:11})]);
    const raw=encodeWorldSave(returned);
    expect(corrupt(raw,w=>{row(w).feePaid=10;row(w).feeRefunded=0;})).toThrow('escorts.freight.custody');
    expect(corrupt(raw,w=>{row(w).rationsSpent=1;row(w).rationsReturned=1;})).toThrow('escorts.freight.custody');
    expect(corrupt(raw,w=>{
      const line=w.resourceFlow.months.flatMap(month=>month.entries).find(item=>item.reason==='freight_refund');
      if(line?.kind==='transfer')line.to.id=freightCarrier;
    })).toThrow('escorts.freight.journal');
  });

  it('round-trips only the actual pending commercial appointment with the precise move payload',()=>{
    const {world,shipment}=nativeFreightShipment();
    expect(possessAvatar(world,freightSeller)).toBe(true);
    const choice=availableMarketFreightActions(freightActor(world,freightSeller),world,world.tick+1)
      .find(option=>option.marketFreightMove==='offer'&&option.targetShipmentId===shipment.id&&option.targetCultivatorId===freightCarrier)!;
    expect(queueAvatarMarketFreight(world,freightSeller,choice)).toBe(true);
    const saved=reopened(world);
    expect(saved.playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(terms(freightMonth(saved))).toMatchObject({carrierId:freightCarrier});
    const raw=encodeWorldSave(world);
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetEscortId:'freight-escort-1'});}))
      .toThrow('pendingOrder.targetEscortId');
    expect(corrupt(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCultivatorId:freightBuyer});}))
      .toThrow('playerAvatar.marketFreightOrder');
  });
});

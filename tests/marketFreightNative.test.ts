import {describe,expect,it} from 'vitest';
import {activeEscortForActor,availableEscortActions,availableMarketFreightActions,ESCORT_FEE} from '../src/engine/escortEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {marketFreightCapacity,marketFreightQuote} from '../src/engine/marketFreightTerms';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {acceptedNativeFreight,freightActor,freightBuyer,freightCarrier,freightContract,freightDecision,
  freightDestination,freightMonth,freightOpt,freightOrigin,freightOther,freightRequire,freightSeller,
  freightShipment,nativeFreightShipment,offeredNativeFreight} from './marketFreightNativeFixture';

const cash=(world:WorldState,id:string)=>freightActor(world,id).spiritStones;
const freightGuide=(world:WorldState)=>freightActor(world,freightCarrier);
const jade=(world:WorldState,id:string)=>freightActor(world,id).herbs.jade_leaf;
const parity=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  expect(encodeEraWorldSave(freightMonth(restored))).toBe(encodeEraWorldSave(freightMonth(world)));
  return restored;
};
function settle(world:WorldState){
  for(let i=0;i<12&&freightShipment(world)?.status==='in_transit';i++)world=freightMonth(world);
  expect(freightShipment(world)?.status).toBe('delivered');
  return world;
}

describe('native verified-weight freight over an exact original partial trade',()=>{
  it('reserves only one matched light load, records real carrier dispatch and settles the same unaltered order and receipt',()=>{
    const {matched,offered,world:accepted,shipment,contract}=acceptedNativeFreight();
    const prior=cash(matched,freightSeller),priorCarrier=cash(matched,freightCarrier);
    const quote=freightContract(offered);
    freightRequire(quote?.feeEscrow,'The actual original seller must fund this measured freight offer');
    const fee=quote.feeEscrow;
    expect(fee).toBe(10);
    expect(quote.freight).toMatchObject({carrierId:freightCarrier,buyerId:freightBuyer,good:'jade_leaf',quantity:1,load:1,band:'light',
      fee:10,rations:2,unitPrice:11,departedTick:shipment.departedTick,buyOrderId:shipment.buyOrderId,sellOrderId:shipment.sellOrderId});
    const guide=freightGuide(matched);
    expect(quote.feePaid).toBe(0);
    expect(cash(offered,freightSeller)).toBe(prior-fee);
    expect(cash(offered,freightCarrier)).toBe(priorCarrier);
    expect(jade(offered,freightBuyer)).toBe(0);
    expect(offered.escorts.contracts).toHaveLength(1);
    expect(availableEscortActions(freightActor(offered,freightOther),offered)).toEqual([]);
    expect(contract).toMatchObject({shipmentId:shipment.id,escortId:freightCarrier,status:'active'});
    expect(accepted.markets.shipments[0].quantity).toBe(1);
    expect(shipment).toMatchObject({id:'caravan-3',quantity:1,unitPrice:11,sellOrderId:'order-1',buyOrderId:'order-2'});
    expect(matched.markets.orders.find(row=>row.id===shipment.sellOrderId)).toMatchObject({
      status:'open',quantity:5,remaining:4,escrowGoods:4});
    let moving=accepted;
    for(let i=0;i<5&&(freightContract(moving)?.pathIndex??0)===0;i++){
      expect(freightContract(moving)?.feePaid).toBe(0);
      expect(cash(moving,freightCarrier)).toBe(priorCarrier);
      moving=freightMonth(moving);
    }
    const dispatched=freightContract(moving);
    freightRequire(dispatched?.pathIndex&&dispatched.pathIndex<dispatched.path.length-1,'Must observe a real interior native crossing');
    const point=dispatched.path[dispatched.pathIndex],previous=dispatched.path[0];
    const departure=terrainTileAt(moving,previous.x,previous.y);
    expect(terrainTileAt(moving,point.x,point.y)?.id).not.toBe(departure?.id);
    expect(activeEscortForActor(moving,freightGuide(moving))?.id).toBe(contract.id);
    expect(dispatched.freight).toMatchObject({capability:{realm:guide.realm,stage:guide.realmStage,
      capacity:marketFreightCapacity(guide.realm,guide.realmStage)},dispatch:{tick:moving.tick,fromTileId:departure?.id}});
    const firstStep=dispatched.path[1];
    expect(dispatched.freight?.dispatch).toMatchObject({pathIndex:1,toTileId:terrainTileAt(moving,firstStep.x,firstStep.y)?.id});
    expect(dispatched.freight?.dispatch?.toTileId).not.toBe(departure?.id);
    expect(dispatched.feePaid).toBe(10);
    expect(dispatched.feeEscrow).toBe(0);
    expect(cash(moving,freightCarrier)).toBe(priorCarrier+10);
    expect(dispatched.rationsSpent).toBe(1);
    expect(dispatched.rationsEscrow).toBe(1);
    expect(freightActor(moving,freightCarrier).locationId).toBe(freightOrigin);
    expect(jade(moving,freightBuyer)).toBe(0);
    parity(moving);
    const world=settle(moving),final=freightContract(world);
    expect(final).toMatchObject({status:'delivered',feePaid:fee,feeEscrow:0,feeRefunded:0,escortId:freightCarrier});
    expect(freightActor(world,freightCarrier).locationId).toBe(freightDestination);
    expect(cash(world,freightCarrier)).toBe(priorCarrier+fee);
    expect(cash(world,freightSeller)).toBe(prior-fee+11);
    expect(jade(world,freightBuyer)).toBe(1);
    expect(world.markets.receipts).toEqual([expect.objectContaining({id:'receipt-4',status:'delivered',shipmentId:shipment.id,
      quantity:1,unitPrice:11,sellerId:freightSeller,buyerId:freightBuyer})]);
    expect(world.markets.orders.find(row=>row.id===shipment.sellOrderId)).toEqual(matched.markets.orders.find(row=>row.id===shipment.sellOrderId));
    const market=world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.mechanism==='market'&&row.refId===shipment.id);
    for(const [reason,good,amount] of [['shipment_departure','jade_leaf',1],['shipment_departure','stone',11],
      ['shipment_delivery','jade_leaf',1],['shipment_delivery','stone',11]] as const){
      expect(market).toContainEqual(expect.objectContaining({reason,good,amount}));
    }
    const fees=world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.refId===contract.id);
    expect(fees).toEqual([expect.objectContaining({reason:'freight_deposit',good:'stone',amount:10,tick:offered.tick,
      from:{kind:'actor',id:freightSeller},to:{kind:'freight',id:contract.id}}),expect.objectContaining({reason:'freight_dispatch',
      good:'stone',amount:10,tick:moving.tick,from:{kind:'freight',id:contract.id},to:{kind:'actor',id:freightCarrier}})]);
    parity(world);
    const late=freightMonth(world,{[freightCarrier]:freightDecision('MARKET_FREIGHT',{marketFreightMove:'accept',targetEscortId:contract.id})});
    expect(cash(late,freightCarrier)).toBe(cash(world,freightCarrier));
    expect(late.markets.receipts).toEqual(world.markets.receipts);
  });

  it('refuses a different carrier even at the actual origin and refunds seller withdrawal exactly once before dispatch',()=>{
    const {matched,world:offered,contract}=offeredNativeFreight();
    expect(freightActor(offered,freightOther).locationId).toBe(freightOrigin);
    expect(availableMarketFreightActions(freightActor(offered,freightOther),offered,offered.tick+1)
      .some(row=>row.marketFreightMove==='accept')).toBe(false);
    const tried=freightMonth(offered,{
      [freightOther]:freightDecision('MARKET_FREIGHT',{marketFreightMove:'accept',targetEscortId:contract.id}),
      [freightSeller]:freightOpt(offered,freightSeller,'withdraw'),
    });
    expect(freightContract(tried)).toMatchObject({status:'expired',feeEscrow:0,feePaid:0,feeRefunded:contract.feeEscrow,freight:{closedBy:'withdrawn'}});
    expect(cash(tried,freightSeller)).toBe(cash(matched,freightSeller));
    expect(cash(tried,freightCarrier)).toBe(cash(matched,freightCarrier));
    const terminal=settle(tried);
    expect(cash(terminal,freightSeller)).toBe(cash(matched,freightSeller)+11);
    expect(cash(terminal,freightCarrier)).toBe(cash(matched,freightCarrier));
    expect(terminal.markets.receipts.at(-1)).toMatchObject({quantity:1,status:'delivered'});
    parity(terminal);
  });


  it('does not dispatch or consume provisions when the actually named carrier refuses the original booking',()=>{
    const {matched,world:offered,contract}=offeredNativeFreight();
    const declined=freightMonth(offered,{[freightCarrier]:freightOpt(offered,freightCarrier,'decline')});
    expect(freightContract(declined)).toMatchObject({status:'expired',pathIndex:0,feePaid:0,feeEscrow:0,
      feeRefunded:contract.feeEscrow,rationsSpent:0,rationsEscrow:0,freight:{closedBy:'declined'}});
    expect(freightContract(declined)?.freight?.dispatch).toBeUndefined();
    expect(freightGuide(declined).herbs.earth_root).toBe(freightGuide(matched).herbs.earth_root);
    expect(cash(declined,freightSeller)).toBe(cash(matched,freightSeller));
    const retry=freightMonth(declined,{[freightCarrier]:freightDecision('MARKET_FREIGHT',{
      marketFreightMove:'decline',targetEscortId:contract.id})});
    expect(freightContract(retry)?.feeRefunded).toBe(contract.feeEscrow);
    expect(cash(retry,freightSeller)).toBe(cash(matched,freightSeller));
    expect(cash(retry,freightCarrier)).toBe(cash(matched,freightCarrier));
    parity(declined);
  });
  it('will not reserve the quote for a named carrier below the actual measured capacity',()=>{
    const {world,shipment}=nativeFreightShipment({good:'earth_root',sellerQuantity:6,buyerQuantity:6});
    expect(shipment.quantity).toBe(6);
    const quote=marketFreightQuote(shipment.good,shipment.quantity),guide=freightGuide(world);
    expect(quote).toMatchObject({load:18,band:'heavy',fee:48,rations:4});
    expect(marketFreightCapacity(guide.realm,guide.realmStage)).toBeLessThan(quote?.load??0);
    expect(guide.herbs.earth_root).toBeGreaterThanOrEqual(quote?.rations??0);
    expect(availableMarketFreightActions(freightActor(world,freightSeller),world,world.tick+1)
      .some(row=>row.marketFreightMove==='offer'&&row.targetCultivatorId===freightCarrier)).toBe(false);
    const rejected=freightMonth(world,{[freightSeller]:freightDecision('MARKET_FREIGHT',{
      marketFreightMove:'offer',targetShipmentId:shipment.id,targetCultivatorId:freightCarrier})});
    expect(freightContract(rejected)).toBeUndefined();
    expect(cash(rejected,freightSeller)).toBe(cash(world,freightSeller));
    expect(cash(rejected,freightCarrier)).toBe(cash(world,freightCarrier));
    expect(freightGuide(rejected).herbs.earth_root).toBe(guide.herbs.earth_root);
    expect(freightShipment(rejected)).toEqual(shipment);
    parity(rejected);
  });

  it('waits before the first physical edge while an actual miasma persists, then refunds all unused custody without a loss',()=>{
    const {start,matched,world:offered,contract,shipment}=offeredNativeFreight();
    const gate=offered.locations.find(site=>site.id===freightOrigin);
    freightRequire(gate,'Real existing freight origin');
    const halted=applyMapBrush(applyMapBrush(offered,'cursed_miasma',[gate]),'cursed_miasma',[gate]);
    const hazard=halted.mapHazards.find(row=>row.tileId===terrainTileAt(halted,gate.x,gate.y)?.id&&row.kind==='cursed_miasma');
    freightRequire(hazard?.intensity===2,'Real native blockage');
    let world=freightMonth(halted,{[freightCarrier]:freightOpt(halted,freightCarrier,'accept')});
    const confirmed=freightContract(world);
    expect(confirmed).toMatchObject({status:'active',pathIndex:0,feePaid:0,feeEscrow:10,rationsEscrow:2,rationsSpent:0});
    const by=confirmed?.freight?.dispatchByTick;
    freightRequire(by&&by<hazard.expiresTick,'Actual unsafe departure persists through the real dispatch window');
    for(;world.tick<by-1;){
      world=freightMonth(world);
      expect(freightContract(world)).toMatchObject({status:'active',pathIndex:0,feePaid:0,feeEscrow:10,rationsEscrow:2,rationsSpent:0});
      expect(cash(world,freightCarrier)).toBe(cash(start,freightCarrier));
      expect(freightGuide(world).locationId).toBe(freightOrigin);
    }
    parity(world);
    const returned=freightMonth(world);
    expect(freightContract(returned)).toMatchObject({status:'failed',pathIndex:0,feePaid:0,feeEscrow:0,feeRefunded:10,
      rationsSpent:0,rationsEscrow:0,rationsReturned:2,freight:{closedBy:'incapable'}});
    expect(freightContract(returned)?.freight?.dispatch).toBeUndefined();
    expect(freightGuide(returned).herbs.earth_root).toBe(freightGuide(start).herbs.earth_root);
    expect(cash(returned,freightSeller)).toBe(cash(start,freightSeller));
    expect(cash(returned,freightBuyer)).toBe(cash(start,freightBuyer));
    expect(jade(returned,freightSeller)).toBe(1);
    expect(jade(returned,freightBuyer)).toBe(0);
    expect(returned.markets.orders.find(row=>row.id===shipment.sellOrderId)).toEqual(matched.markets.orders.find(row=>row.id===shipment.sellOrderId));
    expect(returned.markets.receipts).toEqual([expect.objectContaining({status:'returned',quantity:1,unitPrice:11,shipmentId:shipment.id})]);
    expect(returned.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.refId===contract.id).map(row=>[row.reason,row.amount]))
      .toEqual([['freight_deposit',10],['freight_refund',10]]);
    parity(returned);
  });

  it('does not turn an ordinary unweighed legacy escort or an unclaimed shipment into a weighted booking',()=>{
    const {world:matched,shipment}=nativeFreightShipment();
    const legacy=freightMonth(matched,{[freightSeller]:freightDecision('ESCORT',{escortMove:'offer',targetShipmentId:shipment.id})});
    expect(legacy.escorts.contracts[0]).toMatchObject({feeEscrow:ESCORT_FEE,feePaid:0,status:'offered'});
    expect(freightContract(legacy)).toBeUndefined();
    const signed=freightMonth(legacy,{[freightCarrier]:freightDecision('ESCORT',{escortMove:'accept',targetEscortId:legacy.escorts.contracts[0].id})});
    const delivered=settle(signed),ordinary=settle(matched);
    expect(delivered.escorts.contracts[0]).toMatchObject({status:'delivered',feePaid:ESCORT_FEE});
    expect(freightContract(delivered)).toBeUndefined();
    expect(ordinary.escorts.contracts).toEqual([]);
    expect(ordinary.markets.receipts[0]).toMatchObject({quantity:1,unitPrice:11,status:'delivered',shipmentId:shipment.id});
  });
});

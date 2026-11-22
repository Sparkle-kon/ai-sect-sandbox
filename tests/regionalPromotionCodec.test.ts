import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {ESCORT_FEE,ESCORT_RATIONS} from '../src/engine/escortEngine';
import {availableMarketActions} from '../src/engine/marketEngine';
import {activeRegionalPromotionRegions,projectRegionalPromotions} from '../src/engine/regionalPromotionEngine';
import {beginRegionalSimulationTurn,configureRegionalSimulation} from '../src/engine/regionalSimulationEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {nativeCourierHandoffRoute} from './fixtures/courierHandoffFixture';

const body=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
const choice=(chosenAction:LLMDecisionPayload['chosenAction'],params:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'沿合法的原路核对实际交割。',...params});
const step=(world:WorldState,overrides:Record<string,LLMDecisionPayload>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,overrides[actor.id]??choice('REST')])),()=>.99,'utility');
const roundTrip=(world:WorldState)=>decodeEraWorldSave(encodeEraWorldSave(world));

function actualEscortedCargo(){
  let world=createInitialWorld(5);
  world.tick=5;world.month=5;
  const [seller,buyer,,guide]=world.cultivators;
  seller.locationId=guide.locationId='loc-market-east';buyer.locationId='loc-market';
  seller.herbs.jade_leaf=5;buyer.herbs.jade_leaf=0;guide.herbs.earth_root=ESCORT_RATIONS+2;
  for(const person of [seller,buyer,guide]){person.hp=person.maxHp;person.qiProgress=20;}
  expect(configureRegionalSimulation(world,'loc-taixu')).toBe(true);
  const ask=availableMarketActions(seller,world).find(option=>option.action==='PLACE_MARKET_SELL'&&option.marketGood==='jade_leaf')!;
  const bid=availableMarketActions(buyer,world).find(option=>option.action==='PLACE_MARKET_BUY'&&option.marketGood==='jade_leaf')!;
  world=step(world,{[seller.id]:choice(ask.action,ask),[buyer.id]:choice(bid.action,bid)});
  const cargo=world.markets.shipments[0];
  expect(cargo?.status).toBe('in_transit');
  world=step(world,{[seller.id]:choice('ESCORT',{escortMove:'offer',targetShipmentId:cargo.id})});
  const escort=world.escorts.contracts[0];
  expect(escort?.status).toBe('offered');
  world=step(world,{[guide.id]:choice('ESCORT',{escortMove:'accept',targetEscortId:escort.id})});
  expect(world.escorts.contracts[0].status).toBe('active');
  return {world,cargoId:cargo.id,escortId:escort.id,sellerId:seller.id,buyerId:buyer.id,guideId:guide.id};
}
describe('regional promotion storage keeps actual cross-region custody native',()=>{
  it('strictly reloads a real escorted shipment still at the boundary, native fee and cargo settle once after retuning away and back',()=>{
    const f=actualEscortedCargo();
    const crossed=f.world, clock=crossed.tick; // Native acceptance advances the first physical market stride in this same month.
    expect(crossed.escorts.contracts[0].acceptedTick).toBe(clock);
    expect(crossed.escorts.contracts[0].pathIndex).toBeGreaterThan(0);
    const cargo=crossed.markets.shipments[0];
    const bridge=crossed.regionalSimulation?.promotions?.find(row=>row.kind==='escort_crossed');
    expect(cargo).toMatchObject({id:f.cargoId,status:'in_transit',good:'jade_leaf',quantity:1});
    expect(bridge).toMatchObject({kind:'escort_crossed',shipmentId:f.cargoId,actorId:f.guideId,observedTick:clock,startsTick:clock+1,
      throughTick:clock+3,fromRegionId:'east',toRegionId:'center'});
    expect(projectRegionalPromotions(crossed,body(crossed,f.guideId))).toMatchObject([{kind:'escort_crossed',active:false}]);
    expect(projectRegionalPromotions(crossed,body(crossed,f.sellerId))).toEqual([]);
    const packed=encodeEraWorldSave(crossed),restored=decodeEraWorldSave(packed);
    expect(encodeEraWorldSave(restored)).toBe(packed);
    const personallyOwned=(w:WorldState)=>[f.sellerId,f.buyerId,f.guideId].map(id=>({
      id,stones:body(w,id).spiritStones,jade:body(w,id).herbs.jade_leaf,location:body(w,id).locationId,
      artifacts:body(w,id).artifacts.map(item=>item.id),
    }));
    const before=personallyOwned(restored);
    const relations=structuredClone(restored.relationships);
    expect(configureRegionalSimulation(restored,'loc-market')).toBe(true);
    expect(configureRegionalSimulation(restored,'loc-taixu')).toBe(true);
    expect(personallyOwned(restored)).toEqual(before);expect(restored.relationships).toEqual(relations);
    expect(restored.regionalSimulation?.promotions).toEqual(crossed.regionalSimulation?.promotions);
    const next=step(restored);
    expect(encodeEraWorldSave(next)).toBe(encodeEraWorldSave(step(crossed)));
    expect([...activeRegionalPromotionRegions(next)].sort()).toEqual(['center','east']);
    expect(beginRegionalSimulationTurn(next)?.exactRegions.size).toBe(3);
    let delivered=next;
    while(delivered.markets.shipments.find(row=>row.id===f.cargoId)?.status==='in_transit'&&delivered.tick<clock+9){
      delivered=step(delivered);
    }
    expect(delivered.markets.receipts.filter(row=>row.shipmentId===f.cargoId)).toEqual([
      expect.objectContaining({status:'delivered',quantity:1,good:'jade_leaf'}),
    ]);
    expect(delivered.escorts.contracts[0].feePaid).toBe(ESCORT_FEE);
    expect(body(delivered,f.buyerId).herbs.jade_leaf).toBe(1);
    const after=step(delivered);
    expect(after.markets.receipts.filter(row=>row.shipmentId===f.cargoId)).toHaveLength(1);
    expect(body(after,f.buyerId).herbs.jade_leaf).toBe(1);
    expect(roundTrip(after).regionalSimulation?.promotions).toEqual(after.regionalSimulation?.promotions);

    for(const kind of ['future','clock','duplicate','tile','wrongCargo','fakeCarrier','extraPayload'] as const){
      const corrupt=decodeEraWorldSave(packed),row=corrupt.regionalSimulation!.promotions![0];
      if(row.kind!=='escort_crossed')throw Error('Expected native escort proof');
      if(kind==='future')row.observedTick++;
      if(kind==='clock')row.startsTick=row.observedTick;
      if(kind==='duplicate')corrupt.regionalSimulation!.promotions!.push({...row});
      if(kind==='tile')row.crossedTileIds.reverse();
      if(kind==='wrongCargo')row.shipmentId='caravan-99999';
      if(kind==='fakeCarrier')row.actorId=f.buyerId;
      if(kind==='extraPayload')Object.assign(row,{sealed:'never put secret payload in expansion facts'});
      expect(()=>encodeEraWorldSave(corrupt)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('saves a real courier promotion from exact crossed grid only, keeps both unaware recipient and previous E3-1 file out',()=>{
    const f=nativeCourierHandoffRoute();
    let {world}=f;
    expect(configureRegionalSimulation(world,'loc-tianji')).toBe(true);
    const old=encodeEraWorldSave(world);
    expect(decodeEraWorldSave(old).regionalSimulation?.promotions).toBeUndefined();
    const first=world.couriers.dispatches[0];
    while(!world.regionalSimulation?.promotions?.length&&world.tick<35)world=step(world);
    const proof=world.regionalSimulation?.promotions?.find(row=>row.kind==='courier_crossed');
    expect(proof).toMatchObject({kind:'courier_crossed',actorId:f.originalId,sourceId:f.id,
      observedTick:world.tick,startsTick:world.tick,throughTick:world.tick+2});
    expect(world.couriers.dispatches[0].feePaid).toBe(first.feePaid);
    expect(projectRegionalPromotions(world,body(world,f.originalId))).toMatchObject([{kind:'courier_crossed',active:true}]);
    expect(projectRegionalPromotions(world,body(world,f.senderId))).toEqual([]);
    expect(projectRegionalPromotions(world,body(world,f.recipientId))).toEqual([]);
    const reopened=roundTrip(world);
    expect(reopened.regionalSimulation?.promotions).toEqual(world.regionalSimulation?.promotions);
    expect(encodeEraWorldSave(step(reopened))).toBe(encodeEraWorldSave(step(world)));
  });
});

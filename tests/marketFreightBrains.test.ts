import {afterEach,describe,expect,it,vi} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {marketFreightCheckpoint} from '../src/engine/marketFreightCheckpoint';
import {visibleEscorts} from '../src/engine/escortEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {marketClosureReason} from '../src/engine/marketEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig} from '../src/types/world';
import {acceptedNativeFreight,freightActor,freightBuyer,freightCarrier,freightContract,freightDecision,
  freightDestination,freightMonth,freightOpt,freightOther,freightRequire,freightSeller,nativeFreightShipment} from './marketFreightNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'freight-fixture'};
const reply=(decision:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(decision)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('weighed freight on actual shipments',()=>{
  it('accepts only the native named consent in strict cognitive JSON and in the actual Utility turn',async()=>{
    const {world:before,shipment}=nativeFreightShipment();
    const offer=freightOpt(before,freightSeller,'offer');
    const model=vi.fn(async()=>reply(offer));
    vi.stubGlobal('fetch',model);
    for(const extra of [{quantity:5},{load:0},{fee:1},{delivered:true},{targetEscortId:'manufactured'}]){
      model.mockImplementation(async()=>reply({...offer,...extra}));
      await expect(requestCultivatorLLMDecision(freightActor(before,freightSeller),before,config,before.tick+1)).resolves.toBeUndefined();
    }
    model.mockImplementation(async()=>reply(offer));
    const invitation=await requestCultivatorLLMDecision(freightActor(before,freightSeller),before,config,before.tick+1);
    freightRequire(invitation,'Exact current market shipment and named carrier must be valid options');
    expect(invitation).toEqual(offer);
    const offered=freightMonth(before,{[freightSeller]:invitation});
    const row=freightContract(offered);
    freightRequire(row?.freight,'Only actual offer creates independent custody');
    expect(row.freight).toMatchObject({quantity:shipment.quantity,carrierId:freightCarrier});
    expect(visibleEscorts(offered,freightActor(offered,freightBuyer)).some(view=>view.contract.id===row.id)).toBe(false);
    expect(visibleEscorts(offered,freightActor(offered,freightCarrier)).some(view=>view.contract.id===row.id)).toBe(true);
    const accept=freightOpt(offered,freightCarrier,'accept');
    model.mockImplementation(async()=>reply(accept));
    await expect(requestCultivatorLLMDecision(freightActor(offered,freightOther),offered,config,offered.tick+1)).resolves.toBeUndefined();
    const modelConsent=await requestCultivatorLLMDecision(freightActor(offered,freightCarrier),offered,config,offered.tick+1);
    freightRequire(modelConsent,'Exact named carrier model signature');
    expect(modelConsent).toEqual(accept);
    const strictBranch=freightMonth(offered,{[freightCarrier]:modelConsent});
    const otherChoices=Object.fromEntries(offered.cultivators.filter(row=>row.alive&&row.id!==freightCarrier)
      .map(({id})=>[id,freightDecision('REST')]));
    const utilityBranch=advanceWorldTick(offered,otherChoices,()=>.99,'utility',undefined,{captureTrace:false,capturePresentation:false});
    const utility=freightContract(utilityBranch);
    expect(utility?.escortId).toBe(freightCarrier);
    expect(utility?.freight?.dispatch).toEqual(freightContract(strictBranch)?.freight?.dispatch);
    expect(utility?.feePaid).toBe(freightContract(strictBranch)?.feePaid);
    const actualCarrier=freightActor(strictBranch,freightCarrier);
    const fundedPoint=marketFreightCheckpoint(strictBranch,actualCarrier);
    freightRequire(fundedPoint,'Paid dispatch has a real current route checkpoint');
    expect(createTerrainMapView(strictBranch,actualCarrier,false).trailPositions.get(actualCarrier.id)).toEqual(fundedPoint);
    expect(createTerrainMapView(strictBranch,freightActor(strictBranch,freightBuyer),false).liveActors.some(row=>row.id===freightCarrier)).toBe(false);
  });

  it('keeps the exact delivered cargo and original receipt after unrelated native local trades rotate the market tails',()=>{
    const accepted=acceptedNativeFreight();
    let world=accepted.world;
    for(let i=0;i<12&&freightContract(world)?.status==='active';i++)world=freightMonth(world);
    const contract=freightContract(world);
    freightRequire(contract?.status==='delivered'&&contract.freight?.dispatch,'One truly delivered weighed consignment');
    const original=world.markets.receipts.find(row=>row.shipmentId===accepted.shipment.id&&row.status==='delivered');
    freightRequire(original,'Original exact receipt, not a new freight receipt');
    const oldDispatch=contract.freight.dispatch;
    let fills=0;
    for(let month=0;month<123&&fills<100;month++){
      if(marketClosureReason({...world,tick:world.tick+1},freightDestination)){world=freightMonth(world);continue;}
      const seller=fills%2===0?freightBuyer:freightCarrier;
      const buyer=seller===freightBuyer?freightCarrier:freightBuyer;
      const scope={marketGood:'jade_leaf' as const,marketQuantity:1,marketLimitPrice:1};
      world=freightMonth(world,{[seller]:freightDecision('PLACE_MARKET_SELL',scope),[buyer]:freightDecision('PLACE_MARKET_BUY',scope)});
      if(world.markets.receipts.some(row=>row.tick===world.tick&&row.buyerId===buyer&&row.sellerId===seller&&
        row.status==='local_fill'&&row.quantity===1&&row.unitPrice===1))fills++;
    }
    expect(fills).toBe(100);
    expect(world.markets.receipts.find(row=>row.id===original.id)).toEqual(original);
    expect(world.markets.shipments.find(row=>row.id===accepted.shipment.id)).toMatchObject({quantity:1,unitPrice:11,status:'delivered'});
    expect(world.markets.orders.find(row=>row.id===accepted.shipment.sellOrderId)).toMatchObject({quantity:5});
    expect(freightContract(world)?.freight?.dispatch).toEqual(oldDispatch);
    expect(world.resourceFlow.months.flatMap(row=>row.entries).some(row=>row.refId===contract.id&&row.reason==='freight_dispatch')).toBe(false);
    const raw=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    const modified=structuredClone(world);
    const stripped=freightContract(modified);
    freightRequire(stripped,'Current typed freight contract');
    delete stripped.freight;
    expect(()=>decodeEraWorldSave(encodeEraWorldSave(modified))).toThrow();
  });
  it('does not refund an earned dispatch fee or mislabel the extra original units when a later actual segment loses the one cargo',()=>{
    const accepted=acceptedNativeFreight();
    const moved=freightMonth(accepted.world);
    const actual=freightContract(moved);
    freightRequire(actual?.status==='active'&&actual.freight?.dispatch&&actual.pathIndex+1<actual.path.length-1,
      'Need a genuine next segment before the paid native freight reaches its end');
    const next=actual.path[actual.pathIndex+1];
    const blocked=applyMapBrush(applyMapBrush(moved,'cursed_miasma',[next]),'cursed_miasma',[next]);
    const terminal=freightMonth(blocked);
    const closure=freightContract(terminal);
    expect(closure).toMatchObject({status:'failed',feeEscrow:0,feePaid:10,feeRefunded:0});
    expect(closure?.freight?.dispatch).toEqual(actual.freight.dispatch);
    expect(terminal.markets.receipts).toEqual([expect.objectContaining({shipmentId:accepted.shipment.id,
      status:'lost',quantity:1,unitPrice:11})]);
    expect(terminal.markets.orders.find(row=>row.id===accepted.shipment.sellOrderId))
      .toMatchObject({quantity:5,remaining:4,escrowGoods:4,status:'open'});
    expect(freightActor(terminal,freightCarrier).spiritStones).toBe(freightActor(accepted.matched,freightCarrier).spiritStones+10);
    expect(freightActor(terminal,freightBuyer).spiritStones).toBe(freightActor(accepted.start,freightBuyer).spiritStones);
    expect(freightActor(terminal,freightBuyer).herbs.jade_leaf).toBe(0);
    const raw=encodeEraWorldSave(terminal);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
  });
});

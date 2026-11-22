import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceMarkets,availableMarketActions} from '../src/engine/marketEngine';
import {availableCourierActions,COURIER_SERVICE_FEE,resolveCourierAction} from '../src/engine/sealedCourierEngine';
import {ESCORT_FEE,ESCORT_RATIONS} from '../src/engine/escortEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {adjustSectAffinity,advanceDiplomacy,resolveDiplomacyAction} from '../src/engine/diplomacyEngine';
import {beginRegionalSimulationTurn,configureRegionalSimulation,regionForPoint} from '../src/engine/regionalSimulationEngine';
import {activeRegionalPromotionRegions,projectRegionalPromotions,recordRegionalLatePromotions} from '../src/engine/regionalPromotionEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

function month(w:WorldState){w.tick++;if(w.month===12){w.month=1;w.year++;}else w.month++;}
function act(w:WorldState,actorId:string,choice:LLMDecisionPayload){
  const a=w.cultivators.find(person=>person.id===actorId)!;
  return applyCultivatorBrainDecision(w,a,choice,()=>.99);
}

describe('actual native E3-2 coverage',()=>{
  it('gets a real escorted trade over the eastern boundary with intact custody once',()=>{
    const w=createInitialWorld(5);
    w.tick=6;w.month=6;
    expect(configureRegionalSimulation(w,'loc-taixu')).toBe(true);
    const [seller,buyer,,guide]=w.cultivators;
    seller.locationId=guide.locationId='loc-market-east';buyer.locationId='loc-market';
    seller.herbs.jade_leaf=5;buyer.herbs.jade_leaf=0;
    guide.herbs.earth_root=ESCORT_RATIONS+2;
    for(const person of [seller,buyer,guide]){person.hp=person.maxHp;person.qiProgress=20;}
    const ask=availableMarketActions(seller,w).find(option=>option.action==='PLACE_MARKET_SELL'&&option.marketGood==='jade_leaf')!;
    const bid=availableMarketActions(buyer,w).find(option=>option.action==='PLACE_MARKET_BUY'&&option.marketGood==='jade_leaf')!;
    expect(act(w,seller.id,{...ask,chosenAction:ask.action,innerMonologue:''})).not.toBeNull();
    expect(act(w,buyer.id,{...bid,chosenAction:bid.action,innerMonologue:''})).not.toBeNull();
    advanceMarkets(w);const cargo=w.markets.shipments[0];
    month(w);
    expect(act(w,seller.id,{chosenAction:'ESCORT',escortMove:'offer',targetShipmentId:cargo.id,innerMonologue:''})).not.toBeNull();
    advanceMarkets(w);
    month(w);const caseId=w.escorts.contracts[0].id;
    expect(act(w,guide.id,{chosenAction:'ESCORT',escortMove:'accept',targetEscortId:caseId,innerMonologue:''})).not.toBeNull();
    const escort=w.escorts.contracts[0];
    const starter=regionForPoint(w,escort.path[escort.pathIndex]);
    const trace:Array<{tick:number;region:string;idx:number}>=[];
    for(let i=0;i<15&&cargo.status==='in_transit';i++){
      const prior=structuredClone(w);
      month(w);const events=advanceMarkets(w);recordRegionalLatePromotions(w,prior,events);
      recordRegionalLatePromotions(w,prior,events);
      if(w.tick===9){
        expect(w.regionalSimulation?.promotions).toHaveLength(1);
        expect([...activeRegionalPromotionRegions(w)]).toEqual([]);
        expect([...activeRegionalPromotionRegions(w,10)]).toEqual(['east','center']);
        expect(projectRegionalPromotions(w,guide)).toEqual([{kind:'escort_crossed',observedTick:9,startsTick:10,throughTick:12,
          fromRegionId:'east',toRegionId:'center',active:false}]);
        expect(projectRegionalPromotions(w,w.cultivators[5])).toEqual([]);
      }
      if(w.tick===10)expect([...beginRegionalSimulationTurn(w)!.exactRegions]).toEqual(['west','east','center']);
      const point=escort.path[escort.pathIndex];
      if(point&&escort.lastAdvancedTick===w.tick)trace.push({tick:w.tick,region:regionForPoint(w,point)!,idx:escort.pathIndex});
    }
    expect(cargo.status).toBe('delivered');expect(escort.feePaid).toBe(ESCORT_FEE);
    expect(starter).toBe('east');expect(trace.some(row=>row.region==='center')).toBe(true);
    expect(w.markets.receipts.filter(row=>row.shipmentId===cargo.id&&row.status==='delivered')).toHaveLength(1);
    const cash=[seller.spiritStones,buyer.spiritStones,guide.spiritStones,buyer.herbs.jade_leaf];
    advanceMarkets(w);
    expect([seller.spiritStones,buyer.spiritStones,guide.spiritStones,buyer.herbs.jade_leaf]).toEqual(cash);

  });
  it('gets a real distant war arrival and no early ghost destination event',()=>{
    const w=createInitialWorld(2031),[own,target,ally,other]=w.sects;
    const leader=w.cultivators.find(a=>a.id===own.leaderId)!;
    w.diplomacy=[];w.sieges=[];
    expect(configureRegionalSimulation(w,'loc-taixu')).toBe(true);
    for(const person of w.cultivators){
      person.locationId=w.sects.find(s=>s.id===person.sectId)!.headquartersId;
      person.hp=person.maxHp=500;person.combatPower=person.sectId===target.id?200:1500;
    }
    const move=(chosenAction:LLMDecisionPayload['chosenAction'],targetSectId=target.id)=>
      resolveDiplomacyAction(w,leader,{chosenAction,targetSectId,innerMonologue:''});
    for(const s of [ally,other]){adjustSectAffinity(w,own.id,s.id,60);expect(move('OFFER_ALLIANCE',s.id)).not.toBeNull();}
    adjustSectAffinity(w,own.id,target.id,-60);
    expect(move('DECLARE_WAR')).not.toBeNull();
    for(let i=0;i<3;i++)month(w);
    expect(move('LAUNCH_SIEGE')).not.toBeNull();
    const siege=w.sieges[0];
    const beforeAssembly=structuredClone(w);
    month(w);const assembly=advanceDiplomacy(w,()=>.5);expect(assembly.map(row=>row.title)).toEqual(['联军完成集结']);
    recordRegionalLatePromotions(w,beforeAssembly,assembly);
    expect(w.regionalSimulation?.promotions).toBeUndefined();
    expect(siege.status).toBe('marching');
    expect(leader.locationId).toBe(own.headquartersId);
    const beforeArrival=structuredClone(w);
    month(w);const arrival=advanceDiplomacy(w,()=>.5);expect(arrival.map(row=>row.title)).toEqual(['联军抵达山门']);
    recordRegionalLatePromotions(w,beforeArrival,arrival);
    expect(w.regionalSimulation?.promotions).toMatchObject([{kind:'siege_arrived',observedTick:w.tick,startsTick:w.tick+1}]);
    expect([...activeRegionalPromotionRegions(w)]).toEqual([]);
    expect(siege.status).toBe('sieging');expect(leader.locationId).toBe(target.headquartersId);
    expect(advanceDiplomacy(w,()=>.5)).toEqual([]);
  });
  it('opens a genuinely crossed early sealed-courier region on its own month without revealing it',()=>{
    let w=createInitialWorld(709);
    w.tick=18;w.month=6;
    const [sender, candidate, recipient]=w.cultivators;
    const origin=w.sects.find(row=>row.id===sender.sectId)!.headquartersId;
    const destination=w.sects.find(row=>row.id===recipient.sectId)!.headquartersId;
    sender.locationId=candidate.locationId=origin;recipient.locationId=destination;sender.spiritStones=100;
    expect(configureRegionalSimulation(w,origin)).toBe(true);
    const option=availableCourierActions(sender,w).find(row=>row.courierMove==='send'&&row.targetCultivatorId===recipient.id&&row.dispatchCue==='request_audience')!;
    expect(option).toBeDefined();
    const courier=w.cultivators.find(actor=>actor.id===option.targetCourierId)!;
    expect(resolveCourierAction(w,sender,{...option,chosenAction:'SEALED_COURIER',innerMonologue:''})).not.toBeNull();
    const row=w.couriers.dispatches[0];
    expect(resolveCourierAction(w,courier,{chosenAction:'SEALED_COURIER',courierMove:'accept',targetDispatchId:row.id,innerMonologue:''})).not.toBeNull();
    for(let i=0;i<12&&!w.regionalSimulation?.promotions?.some(item=>item.kind==='courier_crossed');i++)
      w=advanceWorldTick(w,Object.fromEntries(w.cultivators.map(actor=>[actor.id,{chosenAction:'REST',innerMonologue:''}])),()=>.99,'utility');
    const crossing=w.regionalSimulation?.promotions?.find(item=>item.kind==='courier_crossed');
    expect(crossing).toMatchObject({observedTick:w.tick,startsTick:w.tick,actorId:courier.id});
    expect(projectRegionalPromotions(w,w.cultivators.find(actor=>actor.id===courier.id))[0]).toMatchObject({active:true,kind:'courier_crossed'});
    expect(projectRegionalPromotions(w,w.cultivators.find(actor=>actor.id===recipient.id))).toEqual([]);
    expect(projectRegionalPromotions(w,w.cultivators.find(actor=>actor.id===sender.id))).toEqual([]);
    expect(w.couriers.dispatches.find(item=>item.id===row.id)?.feePaid).toBe(COURIER_SERVICE_FEE);
  });
  it('uses actual body moves, even with no random treasure / event, for a return and expires the window',()=>{
    let w=createInitialWorld(2031);
    expect(configureRegionalSimulation(w,'loc-taixu')).toBe(true);
    const id='npc-1', origin=w.cultivators.find(actor=>actor.id===id)!.locationId;
    const step=(value:WorldState,target?:string)=>advanceWorldTick(value,Object.fromEntries(value.cultivators.map(actor=>[actor.id,
      actor.id===id&&target?{chosenAction:'EXPLORE',targetLocationId:target,innerMonologue:''}:{chosenAction:'REST',innerMonologue:''}]
      )),()=>.99,'utility');
    w=step(w,'loc-tianji');
    expect(w.cultivators.find(actor=>actor.id===id)?.locationId).toBe('loc-tianji');
    expect(projectRegionalPromotions(w,w.cultivators.find(actor=>actor.id===id))).toEqual([]);
    w=step(w,origin);
    expect(w.cultivators.find(actor=>actor.id===id)?.locationId).toBe(origin);
    const evidence=w.regionalSimulation?.promotions?.find(row=>row.kind==='actor_returned');
    expect(evidence).toMatchObject({observedTick:w.tick,startsTick:w.tick+1,sourceSiteId:'loc-tianji',destinationSiteId:origin});
    expect(evidence&&'eventId' in evidence).toBe(false);
    expect(activeRegionalPromotionRegions(w,w.tick+4).size).toBe(0);
  });
});

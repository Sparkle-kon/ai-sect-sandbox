import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {frontierPortTide} from '../src/engine/frontierPortTerms';
import {portHullAtBerth,portRiggingStock,portSaltStock,resolveFrontierPortLocalAction} from '../src/engine/frontierPortLocalEngine';
import {advanceFrontierPortTrade,availableFrontierPortTradeActions,frontierPortTradePhysicalEdge,
  portTradeReceivedSalt,projectFrontierPortTrade,resolveFrontierPortTradeAction,verifyFrontierPortTradeAgreement} from '../src/engine/frontierPortTradeEngine';
import {PORT_TRADE_FINAL_MONTHS,PORT_TRADE_SOFT_MONTHS,portTradeHullStatus} from '../src/engine/frontierPortTradeTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const input=(file:EraOutputFile)=>({size:file.bytes.length,arrayBuffer:async()=>Uint8Array.from(file.bytes).buffer});
const seller='npc-5',buyer='npc-6';
const say=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'以真实家底和原生月步验明旧址及货物。',...fields});
const actor=(world:WorldState,id:string)=>world.cultivators.find(a=>a.id===id)!;
function visit(world:WorldState,id:string,to:string){
  const a=actor(world,id),known=knownMapLocations(world,a);
  if(a.locationId===to)return;
  const reachable=world.locations.filter(row=>row.id!==a.locationId&&!(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const unknown=reachable.filter(row=>!known.includes(row)),pool=unknown.length?unknown:reachable;
  const wantsKnown=known.some(row=>row.id===to),index=pool.findIndex(row=>row.id===to);
  expect(wantsKnown||index>=0).toBe(true);
  let draws=0;applyCultivatorBrainDecision(world,a,say('EXPLORE',wantsKnown?{targetLocationId:to}:{}),
    ()=>!wantsKnown&&draws++===0?(index+.2)/pool.length:.99);
  expect(a.locationId).toBe(to);
}
function ready(){
  let world=createInitialWorld(1,'spirit-bloom');
  const month=()=>{
    world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(a=>[a.id,say('REST')])),()=>.99,'utility');
    advanceFrontierPortTrade(world);
  };
  const market=(id:string,frontierPortTradeMove:NonNullable<LLMDecisionPayload['frontierPortTradeMove']>,targetCultivatorId?:string)=>
    resolveFrontierPortTradeAction(world,actor(world,id),say('FRONTIER_PORT_TRADE',{frontierPortTradeMove,
      ...(targetCultivatorId?{targetCultivatorId}:{targetFrontierPortTradeId:'frontier-port-trade-1'})}));
  const travel=(frontierMove:NonNullable<LLMDecisionPayload['frontierMove']>,targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    month();
    expect(resolveFrontierMovementAction(world,actor(world,seller),say('FRONTIER',{frontierMove,targetFrontierSiteId})),
      `${world.year}/${world.month} ${frontierMove} ${targetFrontierSiteId}`).toBeTruthy();
  };
  const local=(frontierPortMove:NonNullable<LLMDecisionPayload['frontierPortMove']>,targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    month();return resolveFrontierPortLocalAction(world,actor(world,seller),say('FRONTIER_PORT',{frontierPortMove,targetFrontierSiteId}));
  };
  visit(world,buyer,'loc-danxia');
  for(let i=0;i<4;i++){
    month();expect(applyCultivatorBrainDecision(world,actor(world,seller),say('GATHER_HERBS',{targetHerbId:'earth_root'}),()=>.99)).toBeTruthy();
    if(i===0)expect(applyCultivatorBrainDecision(world,actor(world,buyer),say('GATHER_HERBS',{targetHerbId:'earth_root'}),()=>.99)).toBeTruthy();
  }
  month();visit(world,seller,'loc-market');visit(world,buyer,'loc-market');
  expect(market(seller,'propose',buyer)).toBeTruthy();
  expect(market(buyer,'accept')).toBeNull();
  const buyerRoots=actor(world,buyer).herbs.earth_root;
  month();expect(market(buyer,'accept')).toBeTruthy();
  expect(actor(world,buyer).herbs.earth_root).toBe(buyerRoots-2);
  expect(world.frontier?.visits).toHaveLength(0);
  expect(projectResourceFlowMonth(world,world.tick,{kind:'observer'})?.rows.some(row=>row.mechanism==='frontier')).toBe(false);
  month();visit(world,seller,'loc-market-east');
  travel('enter','frontier-east-gate');travel('travel','frontier-east-causeway');travel('travel','frontier-east-home');travel('settle','frontier-east-home');
  travel('travel','frontier-east-boatyard');
  expect(local('commission','frontier-east-boatyard')).toBeTruthy();expect(local('weave_rigging','frontier-east-boatyard')).toBeTruthy();
  travel('travel','frontier-east-home');travel('travel','frontier-east-warehouse');travel('travel','frontier-east-tideflat');
  while(frontierPortTide(world.month%12+1)!=='open')month();
  expect(local('gather','frontier-east-tideflat')).toBeTruthy();
  travel('travel','frontier-east-causeway');travel('travel','frontier-east-dock');
  month();while(world.month!==6)month();
  const beforeRoots=actor(world,seller).herbs.earth_root,beforeFee=actor(world,seller).spiritStones;
  expect(portSaltStock(world)).toBe(2);expect(portRiggingStock(world)).toBe(1);
  const beforeLoad=structuredClone(world);
  expect(market(seller,'load')).toBeTruthy();expect(actor(world,seller).spiritStones).toBe(beforeFee-3);
  expect(market(seller,'load')).toBeNull();expect(portSaltStock(world)).toBe(0);expect(portRiggingStock(world)).toBe(0);
  expect(portHullAtBerth(world)).toBeUndefined();expect(world.frontier!.port!.hull!.condition).toBe(4);
  const agreement=()=>world.frontier!.port!.trade!.agreements[0],voyage=()=>agreement().voyage!;
  return {world:()=>world,month,market,travel,local,agreement,voyage,buyerRoots,beforeRoots,beforeLoad};
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('native alternate-chart ship and landed custody',()=>{
  it('accepts only the exact real port option from Cognitive JSON while native Utility will not invent shipping',async()=>{
    const world=ready().beforeLoad,owner=actor(world,seller);
    expect(computeHeuristicDecision(owner,world,()=>.99).chosenAction).not.toBe('FRONTIER_PORT_TRADE');
    const chosen={chosenAction:'FRONTIER_PORT_TRADE',frontierPortTradeMove:'load',targetFrontierPortTradeId:'frontier-port-trade-1'};
    let reply:object=chosen;
    const fetch=vi.fn(async(_url:RequestInfo|URL,_options?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(reply)}}],
    })));
    vi.stubGlobal('fetch',fetch);
    async function request(value:object){
      reply=value;llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(owner,world,{enabled:true,apiBaseUrl:'https://fixture.invalid/v1',apiKey:'test',
        model:'port-fixture'},world.tick+1);
    }
    expect(await request({...chosen,feeStones:0})).toBeUndefined();
    expect(await request({...chosen,targetFrontierPortTradeId:'not-a-real-accord'})).toBeUndefined();
    const valid=await request(chosen);
    expect(valid?.chosenAction).toBe('FRONTIER_PORT_TRADE');
    expect(String(fetch.mock.calls.at(-1)?.[1]?.body)).toContain('本人实到另图 frontier-east-dock');
    const rest=Object.fromEntries(world.cultivators.map(a=>[a.id,say('REST')]));
    const after=advanceWorldTick(world,{...rest,[seller]:valid!},()=>.99,'utility');
    expect(after.frontier?.port?.trade?.agreements[0].voyage).toMatchObject({loadedTick:world.tick+1,feeStones:3,cursor:0});
    expect(actor(after,seller).spiritStones).toBe(owner.spiritStones-3);
  });

  it('hits true wind closure, crosses sea and inland ground, then physically returns the buyer roots to a real repair',async()=>{
    const f=ready(),hull=f.world().frontier!.port!.hull!;
    expect(f.voyage().checkpoints.map(row=>row.tileId).slice(0,4)).toEqual(['frontier-east-dock','frontier-east-outer','frontier-east-gate','tile-19-4']);
    expect(f.voyage().checkpoints.every((p,i,path)=>i===0||frontierPortTradePhysicalEdge(f.world(),path[i-1],p))).toBe(true);
    expect(f.market(buyer,'receive')).toBeNull();
    f.month();expect(f.voyage().cursor).toBe(0);expect(f.voyage().waits.at(-1)?.reason).toBe('wind_closed');
    expect(f.world().frontier!.port!.hull!.condition).toBe(4);
    const wait=f.world(),packed=await prepareEraCheckpoint(wait,{branchId:'real-wind-closed'},
      codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
    const restored=await verifyEraCheckpoint(input(packed.manifestFile),packed.parts.map(input),codec);
    expect(encodeEraWorldSave(restored.world)).toBe(encodeEraWorldSave(wait));
    const quiet=()=>Object.fromEntries(wait.cultivators.map(a=>[a.id,say('REST')]));
    expect(encodeEraWorldSave(advanceWorldTick(restored.world,quiet(),()=>.99,'utility')))
      .toBe(encodeEraWorldSave(advanceWorldTick(wait,quiet(),()=>.99,'utility')));
    f.month();expect(f.voyage().cursor).toBe(0);
    f.month();expect(f.voyage().cursor).toBe(1);
    expect(f.world().frontier!.port!.hull!.condition).toBe(3);
    expect(portTradeHullStatus(f.world(),hull.id)).toBe('sea');
    for(let i=0;i<PORT_TRADE_FINAL_MONTHS&&f.voyage().status!=='awaiting_buyer';i++){
      expect(portTradeReceivedSalt(f.world(),buyer)).toEqual([]);f.month();
    }
    expect(f.voyage().status).toBe('awaiting_buyer');
    expect(f.voyage().inlandArrivedTick!-f.voyage().loadedTick).toBeGreaterThan(PORT_TRADE_SOFT_MONTHS);
    expect(projectFrontierPortTrade(f.world(),actor(f.world(),buyer))[0].cargo?.delayed).toBe(true);
    expect(portTradeHullStatus(f.world(),hull.id)).toBe('east_anchor');
    expect(f.market(buyer,'receive')).toBeNull();
    f.month();expect(f.market(buyer,'receive')).toBeTruthy();expect(f.market(buyer,'receive')).toBeNull();
    expect(portTradeReceivedSalt(f.world(),buyer).flatMap(row=>row.lots)).toEqual(f.voyage().lots);
    expect(portTradeReceivedSalt(f.world(),seller)).toEqual([]);
    for(let i=0;i<24&&f.agreement().status!=='fulfilled';i++){
      expect(actor(f.world(),seller).herbs.earth_root).toBe(f.beforeRoots);f.month();
    }
    expect(f.agreement().status).toBe('fulfilled');
    expect(f.voyage().walks.at(-1)?.step).toBe(0);
    expect(f.market(seller,'collect_roots')).toBeNull();
    f.month();expect(f.market(seller,'collect_roots')).toBeTruthy();expect(f.market(seller,'collect_roots')).toBeNull();
    expect(actor(f.world(),seller).herbs.earth_root).toBe(f.beforeRoots+2);
    f.travel('travel','frontier-east-boatyard');
    expect(f.beforeRoots).toBeLessThan(2);
    expect(f.local('repair','frontier-east-boatyard')).toBeTruthy();
    expect(actor(f.world(),seller).herbs.earth_root).toBe(f.beforeRoots);
    expect(portHullAtBerth(f.world())?.condition).toBe(5);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(f.world())))).toBe(encodeEraWorldSave(f.world()));
    expect(verifyFrontierPortTradeAgreement(f.world(),f.agreement())).toBe(true);
    expect(verifyFrontierPortTradeAgreement(f.world(),{...f.agreement(),voyage:{...f.voyage(),waits:f.voyage().waits.slice(1)}})).toBe(false);
  });
  it('never sells an unaccepted shipment and puts original salt back only after true return',()=>{
    const f=ready();
    for(let i=0;i<48&&f.agreement().status!=='unfulfilled';i++){
      expect(portSaltStock(f.world())).toBe(0);expect(portTradeReceivedSalt(f.world(),buyer)).toEqual([]);f.month();
    }
    expect(f.agreement().status).toBe('unfulfilled');expect(f.voyage().returnedTick).toBeGreaterThan(f.voyage().returnStartedTick!);
    expect(f.voyage().walks.at(-1)?.step).toBe(0);expect(portSaltStock(f.world())).toBe(2);
    expect(actor(f.world(),buyer).herbs.earth_root).toBe(f.buyerRoots-2);
    expect(availableFrontierPortTradeActions(actor(f.world(),buyer),f.world()).some(x=>x.frontierPortTradeMove==='recover_roots')).toBe(true);
    expect(f.market(buyer,'recover_roots')).toBeTruthy();expect(f.market(buyer,'recover_roots')).toBeNull();
    expect(actor(f.world(),buyer).herbs.earth_root).toBe(f.buyerRoots);expect(portTradeReceivedSalt(f.world(),buyer)).toEqual([]);
    expect(verifyFrontierPortTradeAgreement(f.world(),f.agreement())).toBe(true);
  });
});

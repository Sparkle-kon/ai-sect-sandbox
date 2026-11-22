import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {advanceFrontierProduction,frontierTradeStock,resolveFrontierProductionAction} from '../src/engine/frontierProductionEngine';
import {advanceFrontierTrade,availableFrontierTradeActions,frontierTradeCheckpoints,frontierTradeEdge,frontierTradeEscrowSlices,
  projectFrontierTrade,resolveFrontierTradeAction,verifyFrontierTradeAgreement} from '../src/engine/frontierTradeEngine';
import {FRONTIER_TRADE_TERM_MONTHS,frontierTradeColdMonth} from '../src/engine/frontierTradeTerms';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const input=(file:EraOutputFile)=>({size:file.bytes.length,arrayBuffer:async()=>Uint8Array.from(file.bytes).buffer});
const north='north-snow',south='south-marsh',northId='npc-2',southId='npc-6';
const payload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'沿原世界和实际规则验明货路。',...fields});
function person(world:WorldState,id:string){return world.cultivators.find(a=>a.id===id)!;}
function atMarket(world:WorldState,id:string,target:string){
  const actor=person(world,id),known=knownMapLocations(world,actor);
  if(actor.locationId===target)return;
  const unknown=world.locations.filter(row=>row.id!==actor.locationId&&!known.includes(row)&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==actor.locationId&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const index=candidates.findIndex(site=>site.id===target);
  expect(known.some(site=>site.id===target)||index>=0).toBe(true);
  let draws=0;
  applyCultivatorBrainDecision(world,actor,payload('EXPLORE',known.some(site=>site.id===target)?{targetLocationId:target}:{}),
    ()=>index>=0&&draws++===0?(index+.2)/candidates.length:.99);
  expect(actor.locationId).toBe(target);
}
function setup(){
  let world=createInitialWorld(1,'spirit-bloom');
  const month=()=>{
    world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(a=>[a.id,payload('REST')])),()=>.99,'utility');
    advanceFrontierProduction(world); advanceFrontierTrade(world);
  };
  const move=(id:string,frontierMove:NonNullable<LLMDecisionPayload['frontierMove']>,targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    month();
    const event=resolveFrontierMovementAction(world,person(world,id),payload('FRONTIER',{frontierMove,targetFrontierSiteId}));
    expect(event,`${id}/${frontierMove}/${targetFrontierSiteId}/${world.tick}`).toBeTruthy();
  };
  const farm=(id:string,frontierProductionMove:NonNullable<LLMDecisionPayload['frontierProductionMove']>,
    targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    month();
    const event=resolveFrontierProductionAction(world,person(world,id),payload('FRONTIER_PRODUCTION',{frontierProductionMove,targetFrontierSiteId}));
    expect(event,`${id}/${frontierProductionMove}/${targetFrontierSiteId}/${world.tick}`).toBeTruthy();
  };
  const trade=(id:string,frontierTradeMove:NonNullable<LLMDecisionPayload['frontierTradeMove']>,targetCultivatorId?:string)=>
    resolveFrontierTradeAction(world,person(world,id),payload('FRONTIER_TRADE',{frontierTradeMove,
      ...(targetCultivatorId?{targetCultivatorId}:{targetFrontierTradeId:'frontier-trade-1'})}));
  atMarket(world,northId,'loc-taixu');atMarket(world,southId,'loc-danxia');
  for(let i=0;i<3;i++){
    month();
    for(const id of [northId,southId])expect(applyCultivatorBrainDecision(world,person(world,id),payload('GATHER_HERBS',{targetHerbId:'earth_root'}),()=>.99)).toBeTruthy();
  }
  month();atMarket(world,northId,'loc-market');atMarket(world,southId,'loc-market');
  expect(trade(northId,'propose',southId)).toBeTruthy();
  expect(trade(southId,'accept')).toBeNull();
  month();expect(trade(southId,'accept')).toBeTruthy();
  expect(projectFrontierTrade(world,person(world,'npc-3'))).toEqual([]);
  month();atMarket(world,northId,'loc-vein-north');
  move(northId,'enter','frontier-north-gate');
  move(southId,'enter','frontier-south-gate');
  // The longer physical northern walking route also works if these early months are cold.
  move(northId,'travel','frontier-north-lee-west');move(northId,'travel','frontier-north-lee-mid');
  move(northId,'travel','frontier-north-lee-east');move(northId,'travel','frontier-north-home');
  move(northId,'settle','frontier-north-home');
  move(southId,'travel','frontier-south-crossway');move(southId,'travel','frontier-south-home');
  move(southId,'settle','frontier-south-home');
  move(northId,'travel','frontier-north-plot');move(northId,'travel','frontier-north-spring');
  farm(northId,'tend_spring','frontier-north-spring');
  move(northId,'travel','frontier-north-plot');farm(northId,'sow','frontier-north-plot');
  month();farm(northId,'harvest','frontier-north-plot');move(northId,'travel','frontier-north-home');
  move(southId,'travel','frontier-south-field-east');move(southId,'travel','frontier-south-sluice');
  while((world.month===12||world.month<3||world.month>=11)&&world.month!==2)month();
  farm(southId,'draw_tide','frontier-south-sluice');
  move(southId,'travel','frontier-south-field-east');farm(southId,'sow','frontier-south-field-east');
  farm(southId,'irrigate','frontier-south-field-east');farm(southId,'harvest','frontier-south-field-east');
  move(southId,'travel','frontier-south-home');move(southId,'travel','frontier-south-crossway');
  move(southId,'travel','frontier-south-field-west');farm(southId,'sow','frontier-south-field-west');
  farm(southId,'irrigate','frontier-south-field-west');farm(southId,'harvest','frontier-south-field-west');
  move(southId,'travel','frontier-south-crossway');move(southId,'travel','frontier-south-home');
  month();while(world.month!==11)month();
  expect(frontierTradeStock(world,north,'frost_dose')).toBe(2);
  const southStock=frontierTradeStock(world,south,'ward_reed');expect(southStock).toBeGreaterThanOrEqual(3);
  return {current:()=>world,month,trade,southStock,agreement:()=>world.frontier!.trade!.agreements[0]};
}
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('Frontier native trade with actual in-person signatures, paid homes, and harvests',()=>{
  it('round-trips one independently valid provider JSON option and never lets it invent cash or cargo',async()=>{
    const f=setup(),world=f.current(),owner=person(world,northId);
    expect(computeHeuristicDecision(owner,world,()=>.99).chosenAction).not.toBe('FRONTIER_TRADE');
    const accepted={chosenAction:'FRONTIER_TRADE',frontierTradeMove:'load',targetFrontierTradeId:'frontier-trade-1'};
    let reply:object=accepted;
    const fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(reply)}}],
    })));
    vi.stubGlobal('fetch',fetch);
    const decision=async(response:object)=>{
      reply=response;llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(owner,world,{enabled:true,apiBaseUrl:'https://fixture.invalid/v1',apiKey:'fixture',
        model:'frontier-fixture'},world.tick+1);
    };
    expect(await decision({...accepted,amount:200})).toBeUndefined();
    expect(await decision({...accepted,targetFrontierTradeId:'a-rumor'})).toBeUndefined();
    expect(await decision({...accepted,frontierTradeMove:'load_winter'})).toBeUndefined();
    const lawful=await decision(accepted);
    expect(lawful?.chosenAction).toBe('FRONTIER_TRADE');
    expect(String(fetch.mock.calls.at(-1)?.[1]?.body)).toContain('本人实到另图 frontier-north-home');
    const rest=Object.fromEntries(world.cultivators.map(actor=>[actor.id,payload('REST')]));
    const next=advanceWorldTick(world,{...rest,[northId]:lawful!},()=>.99,'utility');
    expect(next.frontier?.trade?.agreements[0].north).toMatchObject({loadedTick:world.tick+1,status:'in_transit'});
    expect(frontierTradeStock(world,north,'frost_dose')).toBe(2);
    expect(frontierTradeStock(next,north,'frost_dose')).toBe(0);
  });

  it('walks a physically longer paid winter detour, keeps unpaid road waiting, and credits both only at proven endpoints',async()=>{
    const f=setup();
    expect(frontierTradeCheckpoints(f.current(),north,'winter')?.length).toBe(frontierTradeCheckpoints(f.current(),north,'standard')!.length+2);
    expect(availableFrontierTradeActions(person(f.current(),northId),f.current()).map(o=>o.frontierTradeMove)).toEqual(['load']);
    expect(f.trade(northId,'load')).toBeTruthy();
    expect(f.trade(southId,'load_winter')).toBeTruthy();
    expect(f.agreement().north?.cursor).toBe(0);
    expect(frontierTradeEscrowSlices(f.current()).reduce((n,s)=>n+s.amount,0)).toBe(4);
    f.month();
    expect(frontierTradeColdMonth(f.current().month)).toBe(true);
    expect(f.agreement().north?.cursor).toBe(0);
    expect(f.agreement().north?.winterWaitTicks).toEqual([f.current().tick]);
    const waiting=f.current(),packed=await prepareEraCheckpoint(waiting,{branchId:'frontier-mid-native'},
      codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
    const portable=await verifyEraCheckpoint(input(packed.manifestFile),packed.parts.map(input),codec);
    expect(encodeEraWorldSave(portable.world)).toBe(encodeEraWorldSave(waiting));
    const untouched=()=>Object.fromEntries(waiting.cultivators.map(actor=>[actor.id,payload('REST')]));
    const restoredNext=advanceWorldTick(portable.world,untouched(),()=>.99,'utility');
    const directNext=advanceWorldTick(waiting,untouched(),()=>.99,'utility');
    expect(encodeEraWorldSave(restoredNext)).toBe(encodeEraWorldSave(directNext));
    for(let i=0;i<30&&f.agreement().status!=='exchanged';i++){
      expect(frontierTradeStock(f.current(),north,'ward_reed')).toBe(0);
      expect(frontierTradeStock(f.current(),south,'frost_dose')).toBe(0);
      f.month();
    }
    const final=f.current(),trade=f.agreement();
    expect(trade.status).toBe('exchanged');
    expect(trade.south!.checkpoints.some(point=>point.tileId==='frontier-north-lee-mid')).toBe(true);
    expect(trade.north!.checkpoints.some(point=>point.tileId==='frontier-north-pass')).toBe(true);
    expect(trade.south!.arrivedTick).toBeLessThan(trade.north!.arrivedTick!);
    for(const cargo of [trade.north!,trade.south!]){
      expect(cargo.checkpoints.every((p,i)=>i===0||frontierTradeEdge(final,cargo.checkpoints[i-1],p))).toBe(true);
      expect(cargo.closedTick).toBe(Math.max(trade.north!.arrivedTick!,trade.south!.arrivedTick!));
    }
    expect(frontierTradeStock(final,north,'ward_reed')).toBe(2);
    const raw=encodeEraWorldSave(final);
    const next=advanceWorldTick(decodeEraWorldSave(raw),{...untouched(),[northId]:payload('FRONTIER_PRODUCTION',{
      frontierProductionMove:'cultivate',targetFrontierSiteId:'frontier-north-home',
    })},()=>.99,'utility');
    expect(frontierTradeStock(next,north,'ward_reed')).toBe(1);
    expect(person(next,northId).qiProgress).toBeGreaterThan(person(final,northId).qiProgress);
    expect(next.frontier?.production?.consumptions.some(row=>row.regionId===north&&row.purpose==='practice')).toBe(true);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(next)))).toBe(encodeEraWorldSave(next));
    expect(frontierTradeStock(final,south,'frost_dose')).toBe(2);
    expect(frontierTradeEscrowSlices(final)).toEqual([]);
    expect(verifyFrontierTradeAgreement(final,trade)).toBe(true);
    expect(verifyFrontierTradeAgreement(final,{...trade,north:{...trade.north!,walks:trade.north!.walks.slice(1)}})).toBe(false);
  });
  it('does not deliver when one party never loads; returns the exact held lot along the real crossed edges',()=>{
    const f=setup();expect(f.trade(northId,'load')).toBeTruthy();
    for(let i=0;i<FRONTIER_TRADE_TERM_MONTHS+40&&f.agreement().status!=='returned';i++){
      expect(frontierTradeStock(f.current(),south,'frost_dose')).toBe(0);
      f.month();
    }
    const trade=f.agreement(),world=f.current();
    expect(trade.status).toBe('returned');
    expect(trade.north?.status).toBe('returned');
    expect(trade.north?.walks.at(-1)?.step).toBe(0);
    expect(trade.north!.walks.at(-1)!.tick).toBeGreaterThan(trade.returnsTick!);
    expect(frontierTradeStock(world,north,'frost_dose')).toBe(2);
    expect(frontierTradeStock(world,south,'ward_reed')).toBe(f.southStock);
    expect(verifyFrontierTradeAgreement(world,trade)).toBe(true);
  });
});

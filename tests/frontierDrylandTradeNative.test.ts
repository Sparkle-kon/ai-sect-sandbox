import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {drylandStock,resolveFrontierDrylandLocalAction} from '../src/engine/frontierDrylandLocalEngine';
import {advanceFrontierDrylandTrade,availableFrontierDrylandTradeActions,frontierDrylandTradeCustody,
  frontierDrylandTradePhysicalEdge,projectFrontierDrylandTrade,resolveFrontierDrylandTradeAction,verifyFrontierDrylandTradeAgreement,verifyFrontierDrylandTradeJournal}
  from '../src/engine/frontierDrylandTradeEngine';
import {DRYLAND_TRADE_TERM_MONTHS,validateFrontierDrylandTradeShape} from '../src/engine/frontierDrylandTradeTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const packet=(file:EraOutputFile)=>({size:file.bytes.length,arrayBuffer:async()=>Uint8Array.from(file.bytes).buffer});
const westId='npc-1',ridgeId='npc-8',west='western-saltwell',ridge='plateau-thunderridge';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const intent=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'用原有的真人、工账、月历和货批验明路线。',...fields});

function visit(world:WorldState,id:string,target:string){
  const person=actor(world,id),known=knownMapLocations(world,person);
  if(person.locationId===target)return;
  const canName=known.some(row=>row.id===target);
  const all=world.locations.filter(row=>row.id!==person.locationId&&!(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const unknown=all.filter(row=>!known.includes(row)),candidates=unknown.length?unknown:all;
  const index=candidates.findIndex(row=>row.id===target);
  expect(canName||index>=0).toBe(true);let draws=0;
  applyCultivatorBrainDecision(world,person,intent('EXPLORE',canName?{targetLocationId:target}:{}),
    ()=>!canName&&draws++===0?(index+.1)/candidates.length:.99);
  expect(person.locationId).toBe(target);
}
type GeographyMove=NonNullable<LLMDecisionPayload['frontierMove']>;
type Site=NonNullable<LLMDecisionPayload['targetFrontierSiteId']>;
type LocalMove=NonNullable<LLMDecisionPayload['frontierDrylandMove']>;
type TradeMove=NonNullable<LLMDecisionPayload['frontierDrylandTradeMove']>;
export function buildDrylandTradeReady(refreshRidge:boolean,prepareLayer=false){
  let world=createInitialWorld(1,'spirit-bloom');
  const month=()=>{
    world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,intent('REST')])),()=>.99,'utility');
    advanceFrontierDrylandTrade(world);
  };
  const move=(id:string,frontierMove:GeographyMove,targetFrontierSiteId:Site)=>{
    expect(resolveFrontierMovementAction(world,actor(world,id),intent('FRONTIER',{frontierMove,targetFrontierSiteId})),
      `T${world.tick}:${id} ${frontierMove} ${targetFrontierSiteId}`).toBeTruthy();
  };
  const order=(id:string,frontierDrylandMove:LocalMove,targetFrontierSiteId:Site,frontierDrylandFeed?:'root'|'salt')=>
    resolveFrontierDrylandLocalAction(world,actor(world,id),intent('FRONTIER_DRYLAND',{frontierDrylandMove,targetFrontierSiteId,
      ...(frontierDrylandFeed?{frontierDrylandFeed}:{})}));
  const work=(id:string,choice:LocalMove,site:Site,feed?:'root'|'salt')=>
    expect(order(id,choice,site,feed),`T${world.tick}:${id} ${choice} ${site}`).toBeTruthy();
  const trade=(id:string,frontierDrylandTradeMove:TradeMove,targetCultivatorId?:string)=>
    resolveFrontierDrylandTradeAction(world,actor(world,id),intent('FRONTIER_DRYLAND_TRADE',{frontierDrylandTradeMove,
      ...(targetCultivatorId?{targetCultivatorId}:{targetFrontierDrylandTradeId:'frontier-dryland-trade-1'})}));
  while(world.tick<9){
    month();
    for(const id of [westId,ridgeId]){
      const decision=prepareLayer&&id===westId&&world.tick===9?intent('CULTIVATE'):intent('GATHER_HERBS',{targetHerbId:'earth_root'});
      applyCultivatorBrainDecision(world,actor(world,id),decision,()=>.99);
    }
  }
  expect(actor(world,westId).herbs.earth_root).toBeGreaterThanOrEqual(4);
  expect(actor(world,ridgeId).herbs.earth_root).toBeGreaterThanOrEqual(6);
  month();visit(world,westId,'loc-market');visit(world,ridgeId,'loc-market');
  expect(trade(westId,'propose',ridgeId)).toBeTruthy();expect(trade(ridgeId,'accept')).toBeNull();
  month();expect(trade(ridgeId,'accept')).toBeTruthy();
  expect(trade(westId,'load')).toBeNull();
  month();visit(world,westId,'loc-taixu');visit(world,ridgeId,'loc-tianji');
  month();move(westId,'enter','frontier-west-gate');move(ridgeId,'enter','frontier-ridge-gate');
  month();move(westId,'travel','frontier-west-trail');move(ridgeId,'travel','frontier-ridge-saddle');
  month();move(westId,'travel','frontier-west-home');move(ridgeId,'travel','frontier-ridge-home');
  month();move(westId,'settle','frontier-west-home');move(ridgeId,'settle','frontier-ridge-home');
  month();move(westId,'travel','frontier-west-saltbed');move(ridgeId,'travel','frontier-ridge-quarry');
  month();move(westId,'travel','frontier-west-well');move(ridgeId,'travel','frontier-ridge-pasture');
  month();work(westId,'open_well','frontier-west-well');work(ridgeId,'tend_herd','frontier-ridge-pasture');
  month();work(westId,'draw_water','frontier-west-well');move(ridgeId,'travel','frontier-ridge-quarry');
  month();work(westId,'draw_water','frontier-west-well');work(ridgeId,'quarry_stone','frontier-ridge-quarry');
  month();move(westId,'travel','frontier-west-saltbed');move(ridgeId,'travel','frontier-ridge-pasture');
  month();work(westId,'gather_salt','frontier-west-saltbed');
  month();move(westId,'travel','frontier-west-home');
  month();move(westId,'travel','frontier-west-trail');
  month();move(westId,'travel','frontier-west-trial');
  month();move(westId,'travel','frontier-west-warehouse');
  while(world.month!==2)month();
  if(refreshRidge)work(ridgeId,'feed_herd','frontier-ridge-pasture','root');
  month();move(ridgeId,'travel','frontier-ridge-saddle');
  month();move(ridgeId,'travel','frontier-ridge-ward');
  month();move(ridgeId,'travel','frontier-ridge-warehouse');
  month();expect(world.month).toBe(6);
  expect(drylandStock(world,west,'rift_salt')).toBe(2);expect(drylandStock(world,ridge,'stormstone')).toBe(2);
  expect(world.frontier?.drylands?.well?.water).toBe(2);
  const agreement=()=>world.frontier!.drylands!.trade!.agreements[0];
  return {world:()=>world,month,move,work,order,trade,agreement};
}
describe('actual West–Ridge consignments',()=>{
  it('pays local budgets, crosses both native base belts, and never lands goods while a partner is still in thunder wait',async()=>{
    const f=buildDrylandTradeReady(true);
    const w0=f.world().frontier!.drylands!.well!.water,r0=f.world().frontier!.drylands!.herd!.work;
    expect(f.trade(westId,'load')).toBeTruthy();expect(f.trade(ridgeId,'load')).toBeTruthy();
    expect(f.world().frontier?.drylands?.well?.water).toBe(w0-1);
    expect(f.world().frontier?.drylands?.herd?.work).toBe(r0-1);
    expect(f.trade(westId,'load')).toBeNull();
    const flow=(actorId:string)=>projectResourceFlowMonth(f.world(),f.world().tick,{kind:'actor',actorId,visibleSiteIds:new Set()})?.rows
      .filter(row=>row.reason==='frontier_dryland_trade_load');
    expect(flow(westId)?.map(row=>[row.good,row.amount])).toEqual([['rift_salt',2],['stormstone',2]]);
    expect(flow('npc-3')).toEqual([]);
    expect(projectResourceFlowMonth(f.world(),f.world().tick,{kind:'observer'})?.rows.some(row=>
      row.reason==='frontier_dryland_trade_load')).toBe(false);
    expect(verifyFrontierDrylandTradeJournal(f.world())).toBe(true);
    const path=f.agreement().west!.checkpoints;
    expect(path.every((p,i)=>i===0||frontierDrylandTradePhysicalEdge(f.world(),path[i-1],p))).toBe(true);
    const lower=path.filter(p=>p.chartId==='lower-base').map(p=>p.tileId);
    expect(lower[0]).toBe('tile-4-3');expect(lower.at(-1)).toBe('tile-19-3');expect(lower).not.toContain('tile-9-3');
    expect(lower.some((p,i)=>p.startsWith('tile-8-')&&lower[i+1]?.startsWith('tile-9-'))).toBe(true);
    expect(lower.some((p,i)=>p.startsWith('tile-16-')&&lower[i+1]?.startsWith('tile-17-'))).toBe(true);
    f.month();expect(f.agreement().ridge?.cursor).toBe(1);
    f.month();expect(f.agreement().ridge?.cursor).toBe(1);
    expect(f.agreement().ridge?.waits).toEqual([{tick:f.world().tick,fromStep:1,toStep:2,reason:'thunder_closed'}]);
    expect(projectFrontierDrylandTrade(f.world(),actor(f.world(),ridgeId))[0].ridge?.waiting).toBe('thunder_closed');
    expect(projectFrontierDrylandTrade(f.world(),actor(f.world(),'npc-3'))).toEqual([]);
    const inThunder=f.world();
    const artifact=await prepareEraCheckpoint(inThunder,{branchId:'dryland-thunder-wait'},codec,
      {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
    const loaded=await verifyEraCheckpoint(packet(artifact.manifestFile),artifact.parts.map(packet),codec);
    expect(codec.encode(loaded.world)).toBe(codec.encode(inThunder));
    const quiet=Object.fromEntries(inThunder.cultivators.map(row=>[row.id,intent('REST')]));
    expect(codec.encode(advanceWorldTick(loaded.world,quiet,()=>.99,'utility')))
      .toBe(codec.encode(advanceWorldTick(inThunder,quiet,()=>.99,'utility')));
    let firstPhysicalArrival:number|undefined;
    for(let i=0;i<48&&f.agreement().status!=='exchanged';i++){
      const outstanding=[f.agreement().west!,f.agreement().ridge!].filter(cargo=>cargo.status==='arrived');
      if(outstanding.length===1)firstPhysicalArrival??=f.world().tick;
      expect(drylandStock(f.world(),west,'stormstone')).toBe(0);expect(drylandStock(f.world(),ridge,'rift_salt')).toBe(0);f.month();
    }
    expect(f.agreement().status).toBe('exchanged');
    expect(drylandStock(f.world(),west,'stormstone')).toBe(2);expect(drylandStock(f.world(),ridge,'rift_salt')).toBe(2);
    expect(f.agreement().west!.arrivedTick).not.toBe(f.agreement().ridge!.arrivedTick);
    expect(firstPhysicalArrival).toBe(Math.min(f.agreement().west!.arrivedTick!,f.agreement().ridge!.arrivedTick!));
    expect(f.agreement().closedTick).toBe(Math.max(f.agreement().west!.arrivedTick!,f.agreement().ridge!.arrivedTick!));
    expect(codec.encode(codec.decode(codec.encode(f.world())))).toBe(codec.encode(f.world()));
    expect(frontierDrylandTradeCustody(f.world()).map(row=>[row.from,row.to,row.landedTick])).toEqual([
      [west,ridge,f.agreement().closedTick],[ridge,west,f.agreement().closedTick]]);
    expect(verifyFrontierDrylandTradeAgreement(f.world(),f.agreement())).toBe(true);
    expect(verifyFrontierDrylandTradeJournal(f.world())).toBe(true);
    const forged=structuredClone(f.world());
    const fake=forged.resourceFlow.months.at(-1)!.entries.find(row=>row.reason==='frontier_dryland_trade_exchange')!;
    fake.amount=3;
    expect(verifyFrontierDrylandTradeJournal(forged)).toBe(false);
    expect(verifyFrontierDrylandTradeAgreement(f.world(),{...f.agreement(),ridge:{...f.agreement().ridge!,waits:[]}})).toBe(false);
    expect(()=>validateFrontierDrylandTradeShape({...f.world().frontier!.drylands!.trade!,ignored:1},'dry.trade',p=>{throw Error(p);})).toThrow('dry.trade');
  });
  it('fails a real expired pasture budget without debiting its ore, then walks the existing opposite cargo back without refunding the well',()=>{
    const f=buildDrylandTradeReady(false),before=JSON.stringify(f.world().frontier!.drylands!);
    expect(availableFrontierDrylandTradeActions(actor(f.world(),ridgeId),f.world())).toEqual([]);
    expect(f.trade(ridgeId,'load')).toBeNull();expect(JSON.stringify(f.world().frontier!.drylands!)).toBe(before);
    expect(f.trade(westId,'load')).toBeTruthy();
    const raw=f.agreement().west!.lots.map(row=>({...row}));
    for(let i=0;i<DRYLAND_TRADE_TERM_MONTHS+48&&f.agreement().status!=='returned';i++){
      expect(drylandStock(f.world(),ridge,'rift_salt')).toBe(0);
      expect(drylandStock(f.world(),west,'rift_salt')).toBe(0);
      f.month();
    }
    expect(f.agreement().status).toBe('returned');expect(f.agreement().ridge).toBeUndefined();
    expect(f.agreement().west?.closedTick).toBeGreaterThan(f.agreement().returnsTick!);
    expect(f.agreement().west?.walks.at(-1)?.step).toBe(0);
    expect(drylandStock(f.world(),west,'rift_salt')).toBe(2);expect(drylandStock(f.world(),ridge,'stormstone')).toBe(2);
    expect(f.world().frontier!.drylands!.well?.water).toBe(1);
    expect(codec.encode(codec.decode(codec.encode(f.world())))).toBe(codec.encode(f.world()));
    expect(frontierDrylandTradeCustody(f.world())[0]).toMatchObject({from:west,to:west,slices:raw,landedTick:f.agreement().closedTick});
    expect(verifyFrontierDrylandTradeAgreement(f.world(),f.agreement())).toBe(true);
    expect(verifyFrontierDrylandTradeJournal(f.world())).toBe(true);
  });
  it('really spends arrived ore at the trial and feeds the ridge with its original shipped salt',()=>{
    const f=buildDrylandTradeReady(true,true);
    expect(actor(f.world(),westId).qiProgress).toBe(100);
    expect(f.trade(westId,'load')).toBeTruthy();
    expect(f.trade(ridgeId,'load')).toBeTruthy();
    for(let i=0;i<36&&f.agreement().status!=='exchanged';i++)f.month();
    expect(f.agreement().status).toBe('exchanged');
    const saltBatch=f.agreement().west!.lots[0].batchId,oreBatch=f.agreement().ridge!.lots[0].batchId;
    f.month();f.move(westId,'travel','frontier-west-trial');f.move(ridgeId,'travel','frontier-ridge-ward');
    expect(f.order(westId,'attempt_layer','frontier-west-trial')).toBeNull();
    f.month();f.move(westId,'travel','frontier-west-trail');f.move(ridgeId,'travel','frontier-ridge-saddle');
    f.month();f.move(westId,'travel','frontier-west-well');f.move(ridgeId,'travel','frontier-ridge-pasture');
    f.month();f.work(westId,'draw_water','frontier-west-well');f.work(ridgeId,'feed_herd','frontier-ridge-pasture','salt');
    const fed=f.world().frontier!.drylands!.receipts.find(row=>row.move==='feed_herd'&&row.feed==='salt');
    expect(fed?.spent).toEqual([{batchId:saltBatch,amount:1}]);
    expect(drylandStock(f.world(),ridge,'rift_salt')).toBe(1);
    expect(f.world().frontier?.drylands?.herd?.work).toBe(2);
    f.month();f.move(westId,'travel','frontier-west-trail');
    f.month();f.move(westId,'travel','frontier-west-trial');
    const source=f.world(),before=actor(source,westId),water=source.frontier!.drylands!.well!.water;
    const decision=intent('FRONTIER_DRYLAND',{frontierDrylandMove:'attempt_layer',targetFrontierSiteId:'frontier-west-trial'});
    const choices=Object.fromEntries(source.cultivators.map(row=>[row.id,row.id===westId?decision:intent('REST')]));
    for(const [draw,outcome] of [[0,'advanced'],[.99,'backlash']] as const){
      const result=advanceWorldTick(source,choices,()=>draw,'utility'),person=actor(result,westId);
      const layer=result.frontier!.drylands!.receipts.find(row=>row.move==='attempt_layer')!;
      expect(result.tick).toBe(source.tick+1);
      expect(layer.spent).toEqual([{batchId:oreBatch,amount:1}]);
      expect(layer.layer).toMatchObject({result:outcome,realm:before.realm,fromStage:before.realmStage,
        toStage:before.realmStage+(outcome==='advanced'?1:0),beforeQi:100,afterQi:outcome==='advanced'?0:45});
      expect(person.locationId).toBe('frontier-west-trial');
      expect(person.realm).toBe(before.realm);
      if(outcome==='backlash')expect(person.hp).toBeLessThan(before.hp);
      expect(result.frontier?.drylands?.well?.water).toBe(water-2);
      expect(drylandStock(result,west,'stormstone')).toBe(1);
      expect(codec.encode(codec.decode(codec.encode(result)))).toBe(codec.encode(result));
    }
    expect(drylandStock(source,west,'stormstone')).toBe(2);
    expect(source.frontier?.drylands?.well?.water).toBe(water);
  });
});

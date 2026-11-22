import {expect} from 'vitest';
import {createInitialWorld} from '../../src/data/initialWorld';
import {knownMapLocations} from '../../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../../src/engine/worldEngine';
import {availableSettlementActions} from '../../src/engine/settlementEngine';
import {availableNorthMiningCharterActions} from '../../src/engine/northMiningCharterEngine';
import {availableVillageSupplyActions} from '../../src/engine/villageSupplyEngine';
import {granaryAt} from '../../src/engine/villageGranaryEngine';
import {NORTH_MINING_MARKET,NORTH_MINING_SETTLEMENT,NORTH_MINING_SITE} from '../../src/engine/northMiningCharterTerms';
import type {LLMDecisionPayload,NorthMiningStance,WorldState} from '../../src/types/world';

const elder='elder-danxia-1', miner='npc-6';
const actor=(world:WorldState,id=elder)=>world.cultivators.find(item=>item.id===id)!;
const a=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按在册原件实做。',...extra});
const water=(waterVeinMove:NonNullable<LLMDecisionPayload['waterVeinMove']>)=>a('WATER_VEIN',{waterVeinMove,targetLocationId:NORTH_MINING_SITE});
const charter=(northMiningMove:'propose'|'sign',value:string)=>
  a('NORTH_MINING_CHARTER',northMiningMove==='propose'?{northMiningMove,northMiningStance:value as NorthMiningStance}:
    {northMiningMove,targetNorthMiningCharterId:value});
const step=(world:WorldState,overrides:Record<string,LLMDecisionPayload>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,overrides[row.id]??a('REST')])),()=>.99,'utility');
function nativeVisit(world:WorldState,id:string,target:string){
  const person=actor(world,id), known=knownMapLocations(world,person);
  if(person.locationId===target)return;
  const has=known.some(row=>row.id===target);
  const unknown=world.locations.filter(row=>row.id!==person.locationId&&!known.includes(row)&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==person.locationId&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const index=candidates.findIndex(row=>row.id===target);
  expect(has||index>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,person,a('EXPLORE',has?{targetLocationId:target}:{}),
    ()=>!has&&draw++===0?(index+.2)/candidates.length:.99);
  expect(person.locationId).toBe(target);
}
function source(seed=1){
  let world=createInitialWorld(seed,'spirit-bloom');
  nativeVisit(world,elder,NORTH_MINING_SITE);
  world=step(world,{[elder]:a('GATHER_HERBS',{targetHerbId:'earth_root'})});
  world=step(world,{[elder]:a('VILLAGE_WORKS',{targetSettlementId:NORTH_MINING_SETTLEMENT,villageWorkKind:'well'})});
  world=step(world,{[elder]:a('GATHER_HERBS',{targetHerbId:'jade_leaf'})});
  world=step(world,{[elder]:a('SEED_CULTURE',{seedMove:'reserve',targetLocationId:NORTH_MINING_SITE})});
  const lot=world.seedCulture.lots[0];
  world=step(world,{[elder]:a('SEED_CULTURE',{seedMove:'test',targetSeedLotId:lot.id})});
  world=step(world,{[elder]:a('SEED_CULTURE',{seedMove:'plant',targetSeedLotId:lot.id})});
  expect(world.villageWorks.projects[0]).toMatchObject({status:'completed',settledTick:5,laborTotal:4});
  world=step(world,{[elder]:water('open')});world=step(world);world=step(world);
  expect(world.seedCulture.plots[0].weather[2]).toMatchObject({tick:10,waterDeficit:3});
  nativeVisit(world,miner,NORTH_MINING_SITE);
  const recruit=availableSettlementActions(actor(world),world).find(row=>row.action==='RECRUIT_SETTLER')!;
  expect(recruit).toBeDefined();
  world=step(world,{[elder]:a('RECRUIT_SETTLER',recruit),[miner]:water('mine')});
  const house=`recruit-${recruit.targetVolunteerId}`;
  expect(actor(world,house).alive).toBe(true);
  expect(world.coldWaterVein?.mining[0]).toMatchObject({id:'water-mine-11-npc-6',actorId:miner,units:1});
  return {world,house};
}
function bargain(baseline:ReturnType<typeof source>,stance:NorthMiningStance,delay=false){
  const {house}=baseline;
  let world=structuredClone(baseline.world);
  if(delay)world=step(world);
  world=step(world,{[house]:charter('propose',stance)});
  const id=world.northMiningCharters!.charters[0].id;
  expect(world.northMiningCharters?.charters[0]).toMatchObject({stance,status:'proposed',signatures:[],fieldDeficit:3,
    plotId:'seed-plot-1',openingId:'water-gate-8',wellProjectId:'village-work-1'});
  expect(availableNorthMiningCharterActions(actor(world,miner),world,world.tick+1)).toEqual([]);
  world=step(world,{[house]:charter('sign',id)});
  world=step(world,{[miner]:charter('sign',id)});
  return {world,id,house};
}


function prepareFreight(start:WorldState){
  const left='elder-taixu-1',right='elder-danxia-2';
  nativeVisit(start,left,'loc-secret-1');nativeVisit(start,right,'loc-secret-1');
  let world=step(start);
  nativeVisit(world,left,NORTH_MINING_SITE);nativeVisit(world,right,'loc-market');
  world=step(world,{[left]:a('GATHER_HERBS',{targetHerbId:'earth_root'})});
  nativeVisit(world,right,NORTH_MINING_SITE);
  world=step(world,{[left]:a('GATHER_HERBS',{targetHerbId:'earth_root'}),
    [right]:a('VILLAGE_GRANARY',{granaryMove:'donate_stones',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  expect(actor(world,left).herbs.earth_root).toBeGreaterThanOrEqual(4);
  nativeVisit(world,left,'loc-market');
  world=step(world,{[left]:a('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:NORTH_MINING_MARKET}),
    [right]:a('VILLAGE_GRANARY',{granaryMove:'donate_stones',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  world=step(world,{[left]:a('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:NORTH_MINING_MARKET})});
  expect(granaryAt(world,NORTH_MINING_MARKET)?.roots).toBe(4);
  expect(granaryAt(world,NORTH_MINING_SETTLEMENT)?.stones).toBe(16);
  world=step(world,{[left]:a('VILLAGE_SUPPLY',{villageSupplyMove:'offer',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  const offered=world.villageSupply.agreements[0];
  expect(offered).toMatchObject({status:'offered'});
  expect(availableVillageSupplyActions(actor(world,right),world,world.tick+1)).toContainEqual(expect.objectContaining({villageSupplyMove:'accept'}));
  world=step(world,{[right]:a('VILLAGE_SUPPLY',{villageSupplyMove:'accept',targetVillageSupplyId:offered.id})});
  return {world,offered,left};
}


export function prepareNorthWellHistoricalSource(){
 const baseline=source();
 const draft=bargain(baseline,'detour');
 const ratified=step(draft.world,{[elder]:charter('sign',draft.id)});
 let {world}=prepareFreight(ratified);
 while(world.villageSupply.agreements[0].status!=='completed'&&world.tick<36)world=step(world);
 const row=world.northMiningCharters!.charters[0];
 expect(world.tick).toBe(34);
 expect(row.id).toBe('north-mining-charter-12');
 expect(row.firstPassage).toMatchObject({tick:23,tileId:'tile-13-2'});
 expect(world.villageSupply.agreements[0].legs?.map(leg=>leg.phase)).toEqual(['delivered','delivered']);
 return {world,actorId:elder,charterId:row.id};
}

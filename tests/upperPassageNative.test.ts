import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';

import {waterVeinPhase,WATER_VEIN_SITE} from '../src/engine/waterVeinTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
const elderId='elder-danxia-1', spectatorId='elder-danxia-2';
const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'本地实地核对。',...fields});
const water=(waterVeinMove:NonNullable<LLMDecisionPayload['waterVeinMove']>)=>
  action('WATER_VEIN',{waterVeinMove,targetLocationId:WATER_VEIN_SITE});
const actor=(world:WorldState,id=elderId)=>world.cultivators.find(row=>row.id===id)!;
const step=(world:WorldState,decision=action('REST'))=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(
  row=>[row.id,row.id===elderId?decision:action('REST')])),()=>.99,'utility');
function northFixture(seed=1){
  let world=createInitialWorld(seed,'spirit-bloom');
  const elder=actor(world), known=knownMapLocations(world,elder);
  const unknown=world.locations.filter(row=>row.id!==elder.locationId&&!known.includes(row));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==elder.locationId);
  const index=candidates.findIndex(row=>row.id===WATER_VEIN_SITE);
  expect(index).toBeGreaterThanOrEqual(0);
  let draw=0;
  applyCultivatorBrainDecision(world,elder,action('EXPLORE'),()=>draw++===0?(index+.2)/candidates.length:.99);
  expect(elder.locationId).toBe(WATER_VEIN_SITE);
  const village=world.settlements.villages.find(row=>row.locationId===WATER_VEIN_SITE)!;
  world=step(world,action('GATHER_HERBS',{targetHerbId:'earth_root'}));
  expect(actor(world).herbs.earth_root).toBe(2);
  world=step(world,action('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  expect(world.villageWorks.projects[0]).toMatchObject({settlementId:village.id,startedTick:3,stonesSpent:32,rootsSpent:2});
  expect(actor(world).herbs.earth_root).toBe(0);
  world=step(world,action('GATHER_HERBS',{targetHerbId:'jade_leaf'}));
  world=step(world,action('SEED_CULTURE',{seedMove:'reserve',targetLocationId:WATER_VEIN_SITE}));
  expect(world.villageWorks.projects[0]).toMatchObject({status:'completed',settledTick:5,laborTotal:4,
    receipts:[{tick:4,labor:2},{tick:5,labor:2}]});
  const lot=world.seedCulture.lots[0];
  world=step(world,action('SEED_CULTURE',{seedMove:'test',targetSeedLotId:lot.id}));
  world=step(world,action('SEED_CULTURE',{seedMove:'plant',targetSeedLotId:lot.id}));
  expect(world.seedCulture.plots[0]).toMatchObject({status:'growing',plantedTick:7,maturesTick:10});
  return world;
}
import { availableUpperPassageActions, projectUpperPassage, resolveUpperPassageAction } from '../src/engine/upperPassageEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { UpperPassageMove } from '../src/engine/upperPassageTerms';

const requested=(world:WorldState,move:UpperPassageMove,who=elderId)=>{
  const result=availableUpperPassageActions(actor(world,who),world,world.tick+1).find(row=>row.upperPassageMove===move);
  expect(result).toBeDefined();
  return action('UPPER_PASSAGE',{upperPassageMove:move,targetUpperPassageNodeId:result!.targetUpperPassageNodeId});
};
const roundTrip=(world:WorldState)=>{
  const bytes=encodeEraWorldSave(world), decoded=decodeEraWorldSave(bytes);
  expect(decoded).toBeDefined();
  expect(encodeEraWorldSave(decoded!)).toBe(bytes);
  return decoded!;
};
function nativeLaterReopener(world:WorldState){
  const other=actor(world,spectatorId), known=knownMapLocations(world,other);
  if(other.locationId===WATER_VEIN_SITE)return;
  const unknown=world.locations.filter(row=>row.id!==other.locationId&&!known.includes(row)&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==other.locationId&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const i=candidates.findIndex(row=>row.id===WATER_VEIN_SITE);
  const has=known.some(row=>row.id===WATER_VEIN_SITE);
  expect(has||i>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,other,action('EXPLORE',has?{targetLocationId:WATER_VEIN_SITE}:{}),
    ()=>!has&&draw++===0?(i+.2)/candidates.length:.99);
  expect(other.locationId).toBe(WATER_VEIN_SITE);
}
function openAndRipen(){
  let world=step(northFixture(),water('open'));
  world=step(world);world=step(world);
  expect(world.coldWaterVein?.openings[0]).toMatchObject({id:'water-gate-8',paidStones:40,wellProjectId:'village-work-1'});
  expect(world.seedCulture.plots[0]).toMatchObject({status:'ready',yield:1});
  expect(world.seedCulture.plots[0].weather.at(-1)).toMatchObject({tick:10,waterDeficit:3});
  return world;
}
function stageUpper(world:WorldState){
  world=step(world,requested(world,'advance')); // T13 throat
  expect(actor(world)).toMatchObject({locationId:'realm-passage-upper-step',positionPlane:'threshold'});
  world=step(world,requested(world,'advance')); // T14 arrival even though the independently scheduled lower aperture has shut
  expect(actor(world)).toMatchObject({locationId:'realm-upper-gate',positionPlane:'upper'});
  expect(world.locations.some(row=>row.id===actor(world).locationId)).toBe(false);
  world=step(world,requested(world,'advance'));
  world=step(world,requested(world,'read'));
  world=step(world,requested(world,'advance'));
  return world;
}

describe('exact independent E3-7 physical path and ledger',()=>{
  it('charges real entry, walks back only the reached prefix, refuses poor or stale moves, and preserves one body',()=>{
    let local=openAndRipen();
    local=step(local,action('SEED_CULTURE',{seedMove:'harvest',targetSeedPlotId:local.seedCulture.plots[0].id}));
    const poor=structuredClone(local);
    // Explicit low-balance test precondition, never part of the historical control.
    actor(poor).spiritStones=7;
    expect(projectUpperPassage(poor,actor(poor))).toMatchObject({blocked:'fee',options:[]});
    const entry=requested(local,'enter'), stones=actor(local).spiritStones, herbs=actor(local).herbs;
    expect(resolveUpperPassageAction(poor,actor(poor),entry)).toBeNull();
    expect(actor(poor).spiritStones).toBe(7);
    expect(poor.upperPassage).toBeUndefined();
    const threshold=step(local,entry);
    expect(actor(threshold)).toMatchObject({id:elderId,locationId:'realm-passage-lower-step',positionPlane:'threshold',
      spiritStones:stones-8,herbs});
    expect(threshold.cultivators.filter(row=>row.id===elderId)).toHaveLength(1);
    expect(threshold.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({reason:'realm_passage_paid',amount:8}));
    expect(projectUpperPassage(threshold,actor(threshold,spectatorId))).toBeUndefined();
    const saved=roundTrip(threshold);
    const returned=step(saved,requested(saved,'turnback'));
    expect(actor(returned)).toMatchObject({locationId:WATER_VEIN_SITE,spiritStones:stones-8,herbs});
    expect(actor(returned).positionPlane).toBeUndefined();
    expect(returned.upperPassage?.journeys[0]).toMatchObject({returnedTick:13,direction:'inbound',
      steps:[{tick:12,nodeId:'realm-passage-lower-step'},{tick:13,nodeId:WATER_VEIN_SITE}]});
    roundTrip(returned);
    const straight=step(structuredClone(threshold),requested(threshold,'turnback'));
    expect(encodeEraWorldSave(straight)).toBe(encodeEraWorldSave(returned));
    const fabricated=structuredClone(threshold);
    fabricated.upperPassage!.journeys[0].steps[0].nodeId='realm-upper-council';
    expect(()=>roundTrip(fabricated)).toThrow();
  });

  it('records genuine old-age death at the reached threshold without dropping custody at a lower site',()=>{
    const source=openAndRipen(),threshold=step(source,requested(source,'enter'));
    expect([threshold.tick,threshold.month]).toEqual([11,11]);
    let late=step(threshold,requested(threshold,'advance'));
    expect(late.month).toBe(12);
    const body=actor(late);
    body.age=body.lifespan-1; // Boundary fixture; the ordinary native calendar, not a fabricated dead event, advances.
    const originalInventory=structuredClone(body.herbs), originalStones=body.spiritStones, originalAddress=body.locationId;
    late=step(late);
    expect([late.tick,late.month]).toEqual([13,1]);
    expect(actor(late)).toMatchObject({alive:false,locationId:originalAddress,positionPlane:'threshold',
      spiritStones:originalStones,herbs:originalInventory});
    expect(late.upperPassage?.journeys[0]).toMatchObject({deceasedTick:13});
    expect(late.upperPassage?.journeys[0].returnedTick).toBeUndefined();
    expect(projectUpperPassage(late,actor(late))).toBeUndefined();
    expect(late.events.find(row=>row.id===`evt-upper-passage-13-${elderId}-oldage`)).toMatchObject({category:'death',witnessScope:'participants'});
    roundTrip(late);
  });

  it('uses genuinely harvested lower proof for a distinct upper offer; both halves live during cutoff and only new paid local reopening reconnects them',()=>{
    const common=openAndRipen(), id=common.seedCulture.plots[0].id;
    const relief0=step(common,action('SEED_CULTURE',{seedMove:'harvest',targetSeedPlotId:id}));
    const ordinary0=step(structuredClone(common));
    expect(relief0.seedCulture.plots[0]).toMatchObject({status:'harvested',settledTick:11,yield:1});
    expect(ordinary0.seedCulture.plots[0].status).toBe('ready');
    const relief1=step(relief0,requested(relief0,'enter')), ordinary1=step(ordinary0,requested(ordinary0,'enter'));
    let relief=stageUpper(relief1), ordinary=stageUpper(ordinary1);
    expect(relief.upperPassage?.journeys[0].reading).toEqual({tick:16,openingId:'water-gate-8',wellProjectId:'village-work-1',
      veinId:'north-cold-water',siteId:WATER_VEIN_SITE,loss:{plotId:id,sampleTick:10,fieldDeficit:3,harvestedTick:11,yield:1}});
    expect(ordinary.upperPassage?.journeys[0].reading?.loss).toBeUndefined();
    const readingBalance=actor(relief).spiritStones;
    relief=step(relief,requested(relief,'petition'));ordinary=step(ordinary,requested(ordinary,'petition'));
    expect(relief.upperPassage).toMatchObject({upperReserve:4,journeys:[{petition:{tick:18,outcome:'lower_relief',paidStones:4}}]});
    expect(ordinary.upperPassage).toMatchObject({upperReserve:10,journeys:[{petition:{outcome:'ordinary',paidStones:10}}]});
    expect(actor(relief).spiritStones).toBe(readingBalance-4);
    expect(relief.seedCulture.plots[0]).toMatchObject({status:'harvested',yield:1});
    expect(relief.coldWaterVein!.openings[0].completedTick).toBe(14);
    expect(waterVeinPhase(relief.coldWaterVein!.openings[0],relief.tick).remainingUnits).toBe(0);
    expect(relief.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({reason:'upper_array_fund_paid',amount:4,
      to:{kind:'upper_passage',id:'realm-upper-council'}}));
    relief=step(relief,requested(relief,'turnback'));
    relief=step(relief,requested(relief,'advance'));
    relief=step(relief,requested(relief,'advance'));
    expect(relief.tick).toBe(21);
    expect(projectUpperPassage(relief,actor(relief))).toMatchObject({nodeId:'realm-passage-upper-step',direction:'inbound',blocked:'closed',options:[]});
    const stalled=roundTrip(relief), oldStones=actor(stalled).spiritStones, upperFunds=stalled.upperPassage?.upperReserve;
    nativeLaterReopener(stalled);
    relief=advanceWorldTick(stalled,Object.fromEntries(stalled.cultivators.map(row=>[row.id,row.id===spectatorId?water('open'):
      row.id===elderId?action('UPPER_PASSAGE',{upperPassageMove:'advance',targetUpperPassageNodeId:'realm-passage-lower-step'}):action('REST')])),
      ()=>.99,'utility');
    expect(relief.coldWaterVein?.openings.at(-1)).toMatchObject({id:'water-gate-22',openerId:spectatorId,paidStones:40});
    expect(actor(relief)).toMatchObject({locationId:'realm-passage-upper-step',spiritStones:oldStones});
    expect(relief.upperPassage?.upperReserve).toBe(upperFunds);
    relief=step(relief,requested(relief,'advance'));
    relief=step(relief,requested(relief,'advance'));
    expect(actor(relief)).toMatchObject({locationId:WATER_VEIN_SITE,spiritStones:oldStones});
    expect(actor(relief).positionPlane).toBeUndefined();
    expect(relief.upperPassage?.journeys[0]).toMatchObject({returnedTick:24,
      steps:expect.arrayContaining([expect.objectContaining({tick:13,crossingOpeningId:'water-gate-8'}),
        expect.objectContaining({tick:23,crossingOpeningId:'water-gate-22'})])});
    roundTrip(relief);
    expect(ordinary.upperPassage?.journeys[0].returnedTick).toBeUndefined();
  });
});

import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {advanceWaterVein,availableWaterVeinActions,projectWaterVein,resolveWaterVeinAction} from '../src/engine/waterVeinEngine';
import {waterVeinOpeningAt,waterVeinPhase,WATER_VEIN_SITE} from '../src/engine/waterVeinTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
const elderId='elder-danxia-1', spectatorId='elder-danxia-2';
const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'本地实地核对。',...fields});
const water=(waterVeinMove:NonNullable<LLMDecisionPayload['waterVeinMove']>)=>
  action('WATER_VEIN',{waterVeinMove,targetLocationId:WATER_VEIN_SITE});
const actor=(world:WorldState,id=elderId)=>world.cultivators.find(row=>row.id===id)!;
const sponsor=(world:WorldState)=>world.sects.find(row=>row.id===actor(world).sectId)!;
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
describe('north-cold-water genuine supplied baseline and monthly causal boundaries',()=>{
  it('debits only native funded gate, reveals well first, depresses the actual planted field before mining, then repays the exact water debt',()=>{
    const baseline=northFixture();
    const exact=step(baseline);
    let changed=step(structuredClone(baseline),water('open'));
    expect(baseline.coldWaterVein).toBeUndefined();
    expect(exact.coldWaterVein).toBeUndefined();
    expect(changed.coldWaterVein).toMatchObject({veinId:'north-cold-water',tileIds:['tile-12-2','tile-12-3','tile-12-4'],
      oreRemaining:18,openings:[{id:'water-gate-8',openedTick:8,paidStones:40,borrowedUnits:9,wellProjectId:baseline.villageWorks.projects[0].id}]});
    expect(sponsor(exact).spiritStones-sponsor(changed).spiritStones).toBe(40);
    const opened=encodeEraWorldSave(changed);
    const source=decodeEraWorldSave(opened);
    expect(encodeEraWorldSave(source)).toBe(opened);
    expect(encodeEraWorldSave(step(source,water('observe')))).toBe(encodeEraWorldSave(step(changed,water('observe'))));
    const invented=decodeEraWorldSave(opened);
    invented.coldWaterVein!.openings[0].wellProjectId='nonexistent-well';
    expect(()=>encodeEraWorldSave(invented)).toThrow(expect.objectContaining({code:'invalid_world'}));
    expect(changed.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({kind:'consumption',
      mechanism:'water_vein',reason:'cold_gate_opened',amount:40,from:{kind:'sect',id:sponsor(changed).id}}));
    expect(projectWaterVein(changed,actor(changed))).toMatchObject({scope:'local',wellDepth:24,mineYield:2});
    expect(resolveWaterVeinAction(changed,actor(changed),water('open'))).toBeNull();
    expect(availableWaterVeinActions(actor(changed),changed,changed.tick+1).some(row=>row.waterVeinMove==='open')).toBe(false);
    const referenceWell=step(exact);
    changed=step(changed,water('observe'));
    expect(advanceWaterVein(changed)).toEqual([]);
    expect(projectWaterVein(changed,actor(changed))).toMatchObject({scope:'local',symptom:'well',wellDepth:21,mineYield:2});
    expect(projectWaterVein(changed,actor(changed))).not.toHaveProperty('fieldDeficit',3);
    expect(changed.seedCulture.plots[0].weather[1]).toEqual(referenceWell.seedCulture.plots[0].weather[1]);
    expect(changed.coldWaterVein?.observations[0]).toMatchObject({paidStones:2,tick:9,wellDepth:21,mineYield:2});
    const referenceField=step(referenceWell);
    changed=step(changed);
    expect(projectWaterVein(changed,actor(changed))).toMatchObject({scope:'local',wellDepth:21,fieldDeficit:3,mineYield:2,symptom:'field'});
    expect(referenceField.seedCulture.plots[0]).toMatchObject({maturedTick:10,yield:2});
    expect(changed.seedCulture.plots[0]).toMatchObject({maturedTick:10,yield:1});
    expect(changed.seedCulture.plots[0].weather[2]).toMatchObject({tick:10,soilQi:94,waterDeficit:3});
    const harvest=action('SEED_CULTURE',{seedMove:'harvest',targetSeedPlotId:changed.seedCulture.plots[0].id});
    const stock1=actor(step(referenceField,harvest)).herbs.jade_leaf,stock2=actor(step(changed,harvest)).herbs.jade_leaf;
    expect([stock1,stock2]).toEqual([2,1]);
    const referenceMine=step(referenceField,water('mine'));
    changed=step(changed,water('mine'));
    expect(referenceMine.coldWaterVein?.mining[0]).toMatchObject({tick:11,units:2});
    expect(changed.coldWaterVein?.mining[0]).toMatchObject({tick:11,units:1});
    expect(referenceMine.coldWaterVein?.oreRemaining).toBe(16);
    expect(changed.coldWaterVein?.oreRemaining).toBe(17);
    const proven=encodeEraWorldSave(changed);
    expect(encodeEraWorldSave(decodeEraWorldSave(proven))).toBe(proven);
    const falseOre=decodeEraWorldSave(proven);
    falseOre.coldWaterVein!.oreRemaining++;
    expect(()=>encodeEraWorldSave(falseOre)).toThrow(expect.objectContaining({code:'invalid_world'}));
    const falseWeather=decodeEraWorldSave(proven);
    falseWeather.seedCulture.plots[0].weather[2].waterDeficit=2;
    expect(()=>encodeEraWorldSave(falseWeather)).toThrow(expect.objectContaining({code:'invalid_world'}));
    expect(changed.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({kind:'production',
      reason:'cold_ore_recovered',amount:1,to:{kind:'actor',id:elderId}}));
    expect(resolveWaterVeinAction(changed,actor(changed),water('mine'))).toBeNull();
    for(let t=12;t<=14;t++)changed=step(changed);
    expect(changed.coldWaterVein?.openings[0]?.completedTick).toBe(14);
    expect(waterVeinPhase(waterVeinOpeningAt(changed.coldWaterVein,14),14).remainingUnits).toBe(0);
    expect(projectWaterVein(changed,actor(changed))).toMatchObject({scope:'local',wellDepth:24,mineYield:2,symptom:'recovered'});
    expect(changed.coldWaterVein?.observations[0]?.wellDepth).toBe(21);
    expect(availableWaterVeinActions(actor(changed),changed,16)).toEqual([]);
  });

  it('shows only an actual received signal to a distant viewer, and dated exact measurements only to their actor',()=>{
    let world=step(northFixture(725),water('open'));
    world=step(world,water('observe'));
    const local=actor(world), remote=actor(world,spectatorId);
    const symptoms=local.rumors.filter(row=>row.originEventId==='evt-water-gate-8-well-9');
    expect(symptoms).toHaveLength(1);
    expect(projectWaterVein(world,remote)).toBeUndefined();
    // Isolate genuine transmissions so the unrelated higher-priority ambient rumor cannot mask the test.
    for(const person of world.cultivators)person.rumors=[];
    local.rumors=symptoms;
    for(let t=10;t<=12;t++)world=step(world);
    const projected=projectWaterVein(world,actor(world,spectatorId));
    expect(projected).toMatchObject({scope:'rumor',symptom:'mine',year:1001,month:11});
    expect(actor(world,spectatorId).rumors.some(row=>row.originEventId==='evt-water-gate-8-mine-11'&&row.learnedTick===12)).toBe(true);
    expect(projected).not.toHaveProperty('wellDepth');
    expect(projected).not.toHaveProperty('ownOpening');
    const elsewhere=world.locations.find(site=>site.id===actor(world,spectatorId).locationId)!;
    const current=actor(world);
    applyCultivatorBrainDecision(world,current,action('EXPLORE',{targetLocationId:elsewhere.id}),()=>.99);
    expect(current.locationId).toBe(elsewhere.id);
    expect(projectWaterVein(world,current)).toMatchObject({scope:'survey',year:1001,month:9,wellDepth:21,ownOpening:{remainingUnits:9}});
    expect(resolveWaterVeinAction(world,current,water('mine'))).toBeNull();
    const native=world.locations.find(row=>row.id===WATER_VEIN_SITE)!;
    world.locations.push({...structuredClone(native),id:'same-tile-other-native-test-address'});
    current.locationId='same-tile-other-native-test-address';
    expect(availableWaterVeinActions(current,world)).toEqual([]);
    expect(projectWaterVein(world,current)).not.toHaveProperty('scope','local');
    expect(projectWaterVein(world,structuredClone(current))).toBeUndefined();
  });
});

import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';

import {WATER_VEIN_SITE} from '../src/engine/waterVeinTerms';
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

import {availableUpperPassageActions,projectUpperPassage} from '../src/engine/upperPassageEngine';
import type {UpperPassageMove} from '../src/engine/upperPassageTerms';
import {UpperPassagePanel} from '../src/components/UpperPassagePanel';
import {renderToStaticMarkup} from 'react-dom/server';
const requested=(world:WorldState,move:UpperPassageMove)=>{
  const legal=availableUpperPassageActions(actor(world),world,world.tick+1).find(row=>row.upperPassageMove===move);
  if(!legal)throw Error('Native real step unavailable: '+move);
  return action('UPPER_PASSAGE',{upperPassageMove:move,targetUpperPassageNodeId:legal.targetUpperPassageNodeId});
};
const html=(world:WorldState,id=elderId)=>{
  const view=projectUpperPassage(world,actor(world,id));
  return view?renderToStaticMarkup(<UpperPassagePanel view={view}/>):'';
};

describe('native upper space renders only what the actual current body can know',()=>{
  it('runs the actual T8 paid gate, reads earned T16 array, and shows separate true payment and position at T18',()=>{
    let world=step(northFixture(),water('open'));
    world=step(step(world));
    world=step(world,action('SEED_CULTURE',{seedMove:'harvest',targetSeedPlotId:world.seedCulture.plots[0].id}));
    const atWell=html(world);
    expect(atWell).toContain('实际踏入才付通行的 8 灵石');
    expect(atWell).not.toContain('上界观阵庭');
    world=step(world,requested(world,'enter'));
    const threshold=html(world);
    expect(threshold).toContain('界隙脚下');
    expect(threshold).toContain('第 12 轮实付 8 灵石');
    expect(threshold).not.toContain('上界观阵庭');
    expect(html(world,spectatorId)).toBe('');
    const alternate=step(world,requested(world,'turnback'));
    expect(html(alternate)).toContain('此人仍在寒玉井边');
    expect(html(alternate)).not.toContain('界隙脚下');
    world=step(world,requested(world,'advance'));
    world=step(world,requested(world,'advance'));
    expect(actor(world).positionPlane).toBe('upper');
    expect(html(world)).toContain('上界观阵庭');
    expect(html(world)).not.toMatch(/下界门槛|阵纹指回/);
    for(const move of ['advance','read','advance','petition'] as const)world=step(world,requested(world,move));
    expect(world.tick).toBe(18);
    const upper=html(world);
    expect(upper).toContain('阵纹指回下界寒玉原井');
    expect(upper).toContain('第 11 轮实收 1 份');
    expect(upper).toContain('第 18 轮实付 4 灵石');
    expect(upper).not.toContain('下界门槛');
    expect(html(world,spectatorId)).toBe('');
  });
});

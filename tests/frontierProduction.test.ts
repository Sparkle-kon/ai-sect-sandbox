import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {advanceFrontierProduction,availableFrontierProductionActions,canCreditFrontierTradeStock,creditFrontierTradeStock,
  debitFrontierTradeStock,frontierTradeStock,projectFrontierProduction,resolveFrontierProductionAction} from '../src/engine/frontierProductionEngine';
import {validateFrontierProduction,validateFrontierProductionShape} from '../src/engine/frontierProductionValidation';
import type {FrontierAnchorId,FrontierMovementMove,FrontierSiteId} from '../src/engine/frontierTerms';
import type {FrontierProductionCustody,FrontierProductionMove} from '../src/engine/frontierProductionTerms';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

const northId='npc-2',southId='npc-6';
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const move=(world:WorldState,who:Cultivator,frontierMove:FrontierMovementMove,targetFrontierSiteId:FrontierSiteId|FrontierAnchorId)=>
  resolveFrontierMovementAction(world,who,{chosenAction:'FRONTIER',frontierMove,targetFrontierSiteId,innerMonologue:'依实地格走一步。'});
const produce=(world:WorldState,who:Cultivator,frontierProductionMove:FrontierProductionMove,target=who.locationId as FrontierSiteId)=>
  resolveFrontierProductionAction(world,who,{chosenAction:'FRONTIER_PRODUCTION',frontierProductionMove,targetFrontierSiteId:target,
    innerMonologue:'只用当地真有之物。'});
const legal=(world:WorldState,who:Cultivator)=>availableFrontierProductionActions(who,world).map(row=>row.frontierProductionMove);
function month(world:WorldState){
  world.tick++;
  if(world.month===12){world.month=1;world.year++;}else world.month++;
  advanceFrontierProduction(world);
}
const fail=(path:string):never=>{throw new Error(path);};
function validated(world:WorldState,custody:readonly FrontierProductionCustody[]=[]){
  const raw=JSON.parse(JSON.stringify(world.frontier?.production)) as unknown;
  validateFrontierProductionShape(raw,'frontier.production.shape',fail);
  validateFrontierProduction(world,custody,fail);
}
function fledgling(){
  const world=createInitialWorld(1,'spirit-bloom');
  const north=person(world,northId),south=person(world,southId);
  expect([north.locationId,south.locationId]).toEqual(['loc-vein-north','loc-market']);
  const gather:LLMDecisionPayload={chosenAction:'GATHER_HERBS',innerMonologue:'采一份真正的母根。',targetHerbId:'earth_root'};
  for(let turn=0;turn<2;turn++){
    for(const who of [north,south])expect(applyCultivatorBrainDecision(world,who,gather,()=>.99)).not.toBeNull();
    month(world);
  }
  expect(north.herbs.earth_root).toBeGreaterThanOrEqual(4);
  expect(south.herbs.earth_root).toBeGreaterThanOrEqual(3);
  expect(move(world,north,'enter','frontier-north-gate')).not.toBeNull();
  expect(move(world,south,'enter','frontier-south-gate')).not.toBeNull();
  expect(world.frontier?.production).toBeUndefined();
  expect(projectFrontierProduction(world,north)).toBeUndefined();
  month(world);
  expect(move(world,north,'travel','frontier-north-pass')).not.toBeNull();
  expect(move(world,south,'travel','frontier-south-crossway')).not.toBeNull();
  month(world);
  expect(move(world,north,'travel','frontier-north-home')).not.toBeNull();
  expect(move(world,south,'travel','frontier-south-home')).not.toBeNull();
  month(world);
  expect(move(world,north,'settle','frontier-north-home')).not.toBeNull();
  expect(move(world,south,'settle','frontier-south-home')).not.toBeNull();
  expect(legal(world,north)).toEqual([]);
  expect(world.frontier?.production).toBeUndefined();
  month(world);
  expect(move(world,north,'travel','frontier-north-plot')).not.toBeNull();
  expect(move(world,south,'travel','frontier-south-crossway')).not.toBeNull();
  month(world);
  expect(produce(world,north,'sow')).toBeNull(); // Pays nothing, because no actual water.
  expect(world.frontier?.production).toBeUndefined();
  expect(move(world,north,'travel','frontier-north-spring')).not.toBeNull();
  expect(move(world,south,'travel','frontier-south-sluice')).not.toBeNull();
  expect(produce(world,north,'tend_spring')).toBeNull(); // Moving itself took this month.
  month(world);
  return {world,north,south};
}
function filled(){
  const result=fledgling(),{world,north,south}=result;
  const roots=north.herbs.earth_root;
  expect(produce(world,north,'tend_spring','frontier-north-plot')).toBeNull();
  expect(produce(world,north,'tend_spring')).not.toBeNull();
  expect(north.herbs.earth_root).toBe(roots-1);
  expect(world.frontier?.production?.water['north-snow']).toBe(0);
  expect(produce(world,north,'tend_spring')).toBeNull();
  expect(produce(world,south,'draw_tide')).not.toBeNull();
  expect(world.frontier?.production?.water['south-marsh']).toBe(4);
  month(world);
  expect(world.frontier?.production?.water['north-snow']).toBe(3);
  expect(move(world,north,'travel','frontier-north-plot')).not.toBeNull();
  expect(move(world,south,'travel','frontier-south-field-east')).not.toBeNull();
  month(world);
  expect(produce(world,north,'sow')).not.toBeNull();
  expect(produce(world,south,'sow')).not.toBeNull();
  expect(world.frontier?.production?.water).toEqual({'north-snow':2,'south-marsh':3});
  expect(world.frontier?.production?.soil).toEqual([{siteId:'frontier-south-field-east',units:3,lastSowTick:world.tick}]);
  expect(frontierTradeStock(world,'north-snow','frost_dose')).toBe(0);
  expect(produce(world,north,'harvest')).toBeNull();
  month(world);
  expect(legal(world,south)).toContain('cultivate');
  expect(produce(world,south,'irrigate')).not.toBeNull();
  expect(produce(world,south,'cultivate')).toBeNull(); // Same actual resident labor, no second water debit.
  expect(world.frontier?.production?.water['south-marsh']).toBe(2);
  expect(produce(world,north,'harvest')).toBeNull();
  month(world);
  expect(produce(world,north,'harvest')).not.toBeNull();
  expect(produce(world,south,'harvest')).not.toBeNull();
  expect(produce(world,south,'harvest')).toBeNull();
  expect(frontierTradeStock(world,'north-snow','frost_dose')).toBe(2);
  expect(frontierTradeStock(world,'south-marsh','ward_reed')).toBe(3);
  validated(world);
  return result;
}

describe('frontier measured resources and one resident labor in each native month',()=>{
  it('does not mint during entry, pays native roots, waits for weather and harvests each actual named batch once',()=>{
    const {world,north,south}=filled();
    const flow=world.resourceFlow.months.flatMap(row=>row.entries);
    expect(flow).toContainEqual(expect.objectContaining({kind:'production',good:'frost_dose',amount:2,to:{kind:'frontier_store',id:'north-snow'}}));
    expect(flow).toContainEqual(expect.objectContaining({kind:'production',good:'ward_reed',amount:3,to:{kind:'frontier_store',id:'south-marsh'}}));
    expect(projectFrontierProduction(world,structuredClone(north))).toBeUndefined();
    expect(projectFrontierProduction(world,north)).not.toHaveProperty('stock');
    expect(projectFrontierProduction(world,south)?.localPlot?.soil).toBe(3);
    month(world);
    const qi=south.qiProgress;
    expect(produce(world,south,'cultivate')).not.toBeNull();
    expect(south.qiProgress).toBe(Math.min(100,qi+6));
    expect(world.frontier?.production?.water['south-marsh']).toBe(0);
    expect(produce(world,south,'rest_field')).toBeNull();
    month(world);
    expect(produce(world,south,'rest_field')).not.toBeNull();
    expect(projectFrontierProduction(world,south)?.localPlot?.soil).toBe(4);
    validated(world);
    const saved=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(saved))).toBe(saved);
  });

  it('requires genuine wet work and root consumption at the right site; an unfinished crop cannot be sold',()=>{
    const {world,north,south}=fledgling();
    north.herbs.earth_root=0; // Explicit no-input denial fixture; never counted as paid work.
    const before=JSON.stringify(world);
    expect(produce(world,north,'tend_spring')).toBeNull();
    expect(produce(world,south,'sow')).toBeNull();
    expect(JSON.stringify(world)).toBe(before);
    expect(debitFrontierTradeStock(world,'south-marsh','ward_reed',2)).toBeUndefined();
    expect(produce(world,south,'draw_tide')).not.toBeNull();
    expect(produce(world,south,'draw_tide')).toBeNull();
    validated(world);
  });

  it('freezes a truly water-starved winter crop and does not award an imaginary harvest',()=>{
    const {world,north,south}=fledgling();
    while(world.month!==11)month(world);
    expect(produce(world,north,'tend_spring')).not.toBeNull();
    month(world); // December, actual partial winter inflow
    expect(produce(world,south,'draw_tide')).toBeNull();
    expect(world.frontier?.production?.water).toEqual({'north-snow':1,'south-marsh':0});
    expect(move(world,north,'travel','frontier-north-plot')).not.toBeNull();
    month(world); // January, the last water pays to plant
    expect(produce(world,north,'sow')).not.toBeNull();
    const crop=world.frontier!.production!.crops[0];
    month(world); // February, actual cold/water stress before native labor
    expect(crop.stressedTick).toBe(world.tick);
    month(world); // March, otherwise mature
    expect(produce(world,north,'harvest')).toBeNull();
    while(world.tick<crop.sownTick+6)month(world);
    expect(crop.resolved).toEqual({kind:'failed',tick:world.tick});
    expect(frontierTradeStock(world,'north-snow','frost_dose')).toBe(0);
    validated(world);
  });

  it('keeps the east and west farms separate so real rotation does not fabricate recovered soil',()=>{
    const {world,south}=filled();
    south.herbs.earth_root+=1; // Explicit alternate-input unit fixture, not a harvest or native travel claim.
    month(world);
    expect(move(world,south,'travel','frontier-south-sluice')).not.toBeNull();
    month(world);
    expect(move(world,south,'travel','frontier-south-crossway')).not.toBeNull();
    month(world);
    expect(move(world,south,'travel','frontier-south-field-west')).not.toBeNull();
    month(world);
    expect(produce(world,south,'sow')).not.toBeNull();
    expect(world.frontier?.production?.soil).toMatchObject([
      {siteId:'frontier-south-field-east',units:3},{siteId:'frontier-south-field-west',units:3},
    ]);
    expect(produce(world,south,'rest_field')).toBeNull();
    validated(world);
  });

  it('requires delivered reed for practice and rejects leaked escrow, fake stock, and incorrect timing',()=>{
    const {world,north}=filled();
    month(world);
    expect(move(world,north,'travel','frontier-north-home')).not.toBeNull();
    month(world);
    const qi=north.qiProgress;
    expect(produce(world,north,'cultivate')).toBeNull();
    expect(north.qiProgress).toBe(qi);
    const slices=debitFrontierTradeStock(world,'south-marsh','ward_reed',2)!;
    // Isolated custody adapter test; the real transport engine independently proves these dates/viewer approvals.
    const lane:FrontierProductionCustody={from:'south-marsh',loadedTick:world.tick,slices};
    validated(world,[lane]);
    const unbacked=structuredClone(world);
    expect(creditFrontierTradeStock(unbacked,'north-snow',slices)).toBe(true);
    expect(()=>validated(unbacked,[lane])).toThrow('frontier.production.stock');
    expect(produce(world,north,'cultivate')).toBeNull();
    month(world);
    const delivered:FrontierProductionCustody={...lane,to:'north-snow',deliveredTick:world.tick};
    expect(canCreditFrontierTradeStock(world,'north-snow',slices)).toBe(true);
    expect(creditFrontierTradeStock(world,'north-snow',slices)).toBe(true);
    expect(creditFrontierTradeStock(world,'north-snow',slices)).toBe(false);
    expect(produce(world,north,'cultivate')).not.toBeNull();
    expect(north.qiProgress).toBe(Math.min(100,qi+6));
    expect(frontierTradeStock(world,'north-snow','ward_reed')).toBe(1);
    expect(projectFrontierProduction(world,north)?.stock).toEqual({frost_dose:2,ward_reed:1});
    validated(world,[delivered]);
    const early=structuredClone(world);
    early.frontier!.production!.consumptions[0].refId='theft';
    expect(()=>validated(early,[delivered])).toThrow('frontier.production.spend');
    const falseWater=structuredClone(world);
    falseWater.frontier!.production!.water['south-marsh']++;
    expect(()=>validated(falseWater,[delivered])).toThrow('frontier.production.replay');
  });
});

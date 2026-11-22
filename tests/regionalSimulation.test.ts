import {describe,it,expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {REGIONAL_BENCHMARK} from '../src/components/regionalBenchmark';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {configureRegionalSimulation, projectRegionalSimulation, regionalModelPassiveActorIds} from '../src/engine/regionalSimulationEngine';
import {modelDecisionCandidates} from '../src/engine/modelDecisionTurn';
import {projectFieldObservatory} from '../src/engine/fieldObservatoryEngine';
import type {WorldState} from '../src/types/world';

function utility(world:WorldState){return advanceWorldTick(world,undefined,undefined,'utility');}
function counts(world:WorldState){
  return {living:world.cultivators.filter(actor=>actor.alive&&actor.hp>0).length,
    villagers:world.settlements.villages.reduce((sum,row)=>sum+row.population,0),
    stones:world.sects.reduce((sum,row)=>sum+row.spiritStones,0)+world.cultivators.reduce((sum,row)=>sum+row.spiritStones,0),
    jade:world.locations.reduce((sum,row)=>sum+row.herbs.jade_leaf,0)+world.cultivators.reduce((sum,row)=>sum+row.herbs.jade_leaf,0),
    eraEvents:world.eraHistory.receipts.length};
}
describe('opt-in focused native cadence',()=>{
  it('settles genuine distant actor-months from actual seed, keeps original roster identity and monthly calendar',()=>{
    const initial=createInitialWorld(2031);
    let exact=initial, regional=structuredClone(initial);
    expect(configureRegionalSimulation(regional,'loc-taixu')).toBe(true);
    expect(initial.regionalSimulation).toBeUndefined();
    for(let i=0;i<24;i++){exact=utility(exact);regional=utility(regional);}
    expect([regional.tick,regional.year,regional.month]).toEqual([exact.tick,exact.year,exact.month]);
    const report=projectRegionalSimulation(regional)!;
    expect(report.globalsRemainMonthly).toBe(true);
    expect(report.registeredRegions).toBe(3);
    expect(report.annual.some(row=>row.actors>0&&row.actorMonths>0&&row.qiAdded>0)).toBe(true);
    expect(report.annual.every(row=>row.qiAdded<=row.actorMonths)).toBe(true);
    expect(regional.events.every(row=>!row.id.startsWith('regional-'))).toBe(true);
    expect(exact.cultivators.find(row=>row.id==='npc-1')?.age).toBe(regional.cultivators.find(row=>row.id==='npc-1')?.age);
    expect(initial.cultivators.every(actor=>regional.cultivators.some(real=>real.id===actor.id))).toBe(true);
    expect(REGIONAL_BENCHMARK.seed).toBe(2031);
    expect(REGIONAL_BENCHMARK.months).toBe(24);
    expect(REGIONAL_BENCHMARK.metrics.map(row=>row.monthly)).toEqual(Object.values(counts(exact)));
    expect(REGIONAL_BENCHMARK.metrics.map(row=>row.regional)).toEqual(Object.values(counts(regional)));
    expect(report.annual.map(({regionId,actorMonths,qiAdded})=>({regionId,actorMonths,qiAdded}))).toEqual([
      {regionId:'east',actorMonths:33,qiAdded:33},{regionId:'east',actorMonths:9,qiAdded:9},
    ]);
  });
  it('waives previously deferred east months when it becomes the actual focus in December, and preflight never writes',()=>{
    let world=createInitialWorld(2031);
    expect(configureRegionalSimulation(world,'loc-taixu')).toBe(true);
    const saved=structuredClone(world),passive=regionalModelPassiveActorIds(world);
    expect(passive.size).toBeGreaterThan(0);
    expect(modelDecisionCandidates(world).some(actor=>passive.has(actor.id))).toBe(false);
    expect(world).toEqual(saved);
    while(world.month<11)world=utility(world);
    expect(world.regionalSimulation?.actors.some(row=>row.regionId==='east'&&row.deferredMonths>0)).toBe(true);
    expect(configureRegionalSimulation(world,'loc-tianji')).toBe(true);
    world=utility(world);
    const east=projectRegionalSimulation(world)?.annual.find(row=>row.regionId==='east');
    expect(east?.waivedActorMonths).toBeGreaterThan(0);
    expect(east?.actorMonths).toBe(0);
    expect(east?.qiAdded).toBe(0);
  });
  it('keeps a real already-paid remote monthly obligation instead of charging or delaying until annual',()=>{
    let anchor=createInitialWorld(70,'spirit-bloom');
    for(let i=0;i<5;i++)anchor=utility(anchor);
    let branch=structuredClone(anchor);
    expect(configureRegionalSimulation(branch,'loc-taixu')).toBe(true);
    const read=(world:WorldState)=>projectFieldObservatory(world,world.cultivators.find(row=>row.id==='npc-2')).runs
      .find(run=>run.openedTick===6&&run.targetTick===8);
    expect(read(branch)?.status).toBe('pending');
    const original=read(branch);
    const protectedStep=(world:WorldState)=>advanceWorldTick(world, {'npc-2':world.tick===6?
      {chosenAction:'REST',innerMonologue:''}:
      {chosenAction:'FIELD_OBSERVATORY',observatoryMove:'measure',targetObservatoryTick:6,targetLocationId:'loc-vein-north',innerMonologue:''}},
      undefined,'utility');
    for(let i=0;i<2;i++){anchor=protectedStep(anchor);branch=protectedStep(branch);}
    expect([anchor.tick,branch.tick]).toEqual([8,8]);
    expect(read(anchor)?.status).toBe('measured');expect(read(branch)?.status).toBe('measured');
    expect(read(branch)?.baseline).toEqual(original?.baseline);
    expect(branch.regionalSimulation?.actors.some(row=>row.actorId==='npc-2')).toBe(false);
  });
});

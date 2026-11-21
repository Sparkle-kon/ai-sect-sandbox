import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectFieldObservatory} from '../src/engine/fieldObservatoryEngine';
import {modelDecisionCandidates} from '../src/engine/modelDecisionTurn';
import {configureRegionalSimulation,currentActorRegion,finishRegionalSimulationTurn,projectRegionalSimulation,beginRegionalSimulationTurn}
  from '../src/engine/regionalSimulationEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import {nativeCourierHandoffRoute} from './fixtures/courierHandoffFixture';
import type {WorldState} from '../src/types/world';

const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const go=(world:WorldState)=>{
  const monthly=new Set<string>();
  const next=advanceWorldTick(world,undefined,undefined,'utility',undefined,{captureTrace:false,onActor:id=>monthly.add(id)});
  return {next,monthly};
};
function unmodifiedOld(){
  let world=createInitialWorld(70,'spirit-bloom');
  while(world.tick<6)world=advanceWorldTick(world,undefined,undefined,'utility');
  return world;
}
const paidSource=(world:WorldState)=>projectFieldObservatory(world,actor(world,'npc-2')).runs.find(run=>
  run.locationId==='loc-vein-north'&&run.openedTick===6&&run.targetTick===8);

function enabled(old=unmodifiedOld()){
  const exact=encodeEraWorldSave(old),versioned=decodeEraWorldSave(exact);
  expect(configureRegionalSimulation(versioned,'loc-taixu')).toBe(true);
  expect(encodeEraWorldSave(old)).toBe(exact);
  return versioned;
}
describe('regional versioned save and native due/monthly parity boundaries',()=>{
  it('preserves unversioned native bytes and uses exact true far paid owner for both scheduling and native T8 resolution',()=>{
    const before=unmodifiedOld(),legacy=encodeEraWorldSave(before);
    expect(Object.hasOwn(JSON.parse(legacy).world,'regionalSimulation')).toBe(false);
    expect(encodeEraWorldSave(decodeEraWorldSave(legacy))).toBe(legacy);
    expect(paidSource(before)).toMatchObject({openedTick:6,targetTick:8,status:'pending'});
    expect(before.resourceFlow.months.find(month=>month.tick===6)?.entries.some(row=>row.kind==='consumption'&&
      row.reason==='observatory_instrument'&&row.from.id==='npc-2'&&row.amount===5)).toBe(true);
    const regional=enabled(before);
    expect(projectRegionalSimulation(regional)).toMatchObject({focus:'west',version:1,globalsRemainMonthly:true});
    expect(currentActorRegion(regional,actor(regional,'npc-2'))).toBe('center');
    const month7=go(regional);
    expect(paidSource(month7.next)?.status).toBe('pending');
    const preview=modelDecisionCandidates(month7.next).map(candidate=>candidate.id);
    expect(preview).toContain('npc-2');
    expect(modelDecisionCandidates(go(before).next).map(candidate=>candidate.id)).toContain('elder-tianji-1');
    expect(preview).not.toContain('elder-tianji-1');
    const month8=go(month7.next);
    expect(month8.monthly.has('npc-2')).toBe(true);
    expect(paidSource(month8.next)).toMatchObject({status:'measured',reading:expect.any(Object)});
    expect(paidSource(go(go(before).next).next)).toMatchObject({status:'measured',reading:expect.any(Object)});
    expect(month8.next.regionalSimulation?.actors.some(row=>row.actorId==='npc-2')).toBe(false);
    const approximated=month7.next.regionalSimulation?.actors.filter(row=>row.lastDeferredTick===7)??[];
    expect(approximated.length).toBeGreaterThan(0);
    expect(approximated.every(row=>!month7.monthly.has(row.actorId)&&row.deferredMonths===1)).toBe(true);
    expect(month8.next.random.algorithm).toBe(before.random.algorithm);
    expect(month8.next.random.seed).toBe(before.random.seed);
    expect(go(go(before).next).next.random.state).not.toEqual(month8.next.random.state);
    const bytes=encodeEraWorldSave(month8.next);
    expect(encodeEraWorldSave(go(decodeEraWorldSave(bytes)).next)).toBe(encodeEraWorldSave(go(month8.next).next));
  });

  it('counts genuine slices once in December, audits forfeited continuity after real focus change and preserves the single native January age increment',()=>{
    let world=enabled();
    while(world.tick<11)world=go(world).next;
    const accumulated=world.regionalSimulation!.actors.filter(row=>row.regionId==='east').reduce((sum,row)=>sum+row.deferredMonths,0);
    expect(accumulated).toBeGreaterThan(0);
    const retuned=decodeEraWorldSave(encodeEraWorldSave(world));
    expect(configureRegionalSimulation(retuned,'loc-tianji')).toBe(true);
    expect(projectRegionalSimulation(retuned)?.focus).toBe('east');
    const waiver=go(retuned).next;
    expect(waiver.regionalSimulation?.annual).toEqual(expect.arrayContaining([
      expect.objectContaining({year:1001,tick:12,regionId:'east',actorMonths:0,waivedActorMonths:accumulated,qiAdded:0,hpAdded:0}),
    ]));
    const settled=go(world).next;
    const audit=settled.regionalSimulation!.annual;
    expect(audit.some(row=>row.tick===12&&row.regionId==='east'&&row.actorMonths>0&&row.qiAdded>0)).toBe(true);
    expect(settled.regionalSimulation?.actors.every(row=>row.deferredMonths===0)).toBe(true);
    const previous=encodeEraWorldSave(settled);
    finishRegionalSimulationTurn(settled,beginRegionalSimulationTurn(settled));
    expect(encodeEraWorldSave(settled)).toBe(previous);
    const elder='elder-tianji-1';
    expect(actor(settled,elder).age).toBe(actor(world,elder).age);
    const newYear=go(settled).next;
    expect([newYear.tick,newYear.year,newYear.month]).toEqual([13,1002,1]);
    expect(actor(newYear,elder).age).toBe(actor(settled,elder).age+1);
    expect(newYear.regionalSimulation!.annual).toEqual(audit);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(newYear)))).toBe(encodeEraWorldSave(newYear));
  });

  it('continues actual cross-region courier custody and keeps a seriously wounded far actor on a native turn',()=>{
    const fixture=nativeCourierHandoffRoute();
    const source=fixture.world.couriers.dispatches[0];
    const route=enabled(fixture.world);
    // Retune away from the courier's current physical region, but do not change its address or position.
    expect(configureRegionalSimulation(route,'loc-tianji')).toBe(true);
    expect(route.regionalSimulation?.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({kind:'courier',id:source.id,regions:expect.arrayContaining(['west','east'])}),
    ]));
    const advanced=go(route).next;
    const packet=advanced.couriers.dispatches.find(row=>row.id===source.id)!;
    expect(packet.pathIndex).toBeGreaterThan(source.pathIndex);
    expect(packet.feePaid).toBe(source.feePaid);
    expect(advanced.regionalSimulation?.actors.some(row=>row.actorId===fixture.originalId)).toBe(false);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(advanced)))).toBe(encodeEraWorldSave(advanced));
    const regional=enabled();
    const patient='elder-tianji-2';
    const wounded=executeGodIntervention(regional,{type:'TRIBULATION_STRIKE',targetCultivatorId:patient});
    expect(actor(wounded,patient).hp/actor(wounded,patient).maxHp).toBeLessThan(.82);
    const protectedTurn=go(wounded);
    expect(protectedTurn.monthly.has(patient)).toBe(true);
    expect(protectedTurn.next.regionalSimulation!.actors.some(row=>row.actorId===patient&&row.lastDeferredTick===protectedTurn.next.tick)).toBe(false);
  });

  it('rejects forged mode, focus, routes/registrations and impossible annual dates or manufactured quanta',()=>{
    let world=enabled();
    while(world.tick<12)world=go(world).next;
    const save=encodeEraWorldSave(world);
    expect(decodeEraWorldSave(save).regionalSimulation).toEqual(world.regionalSimulation);
    for(const forgery of ['mode','focus','registration','siteRegion','actorRegion','route','annualTime','annualCredit',
      'noCreditAndNoWaiver','duplicate'] as const){
      const bad=JSON.parse(save) as {world:WorldState};
      const state=bad.world.regionalSimulation!;
      if(forgery==='mode')Object.assign(state,{version:2});
      if(forgery==='focus')state.focusSiteId='missing-focus';
      if(forgery==='registration')state.registrations[0].registeredTick=world.tick+1;
      if(forgery==='siteRegion')state.registrations.find(row=>row.id==='loc-taixu')!.originRegionId='east';
      if(forgery==='actorRegion')state.actors[0].deferredMonths=12;
      if(forgery==='route')state.routes.push({id:'sealed-dispatch-99999',kind:'courier',firstKnownTick:world.tick,regions:['east','west']});
      if(forgery==='annualTime')state.annual[0].tick--;
      if(forgery==='annualCredit')state.annual[0].qiAdded=state.annual[0].actorMonths+1;
      if(forgery==='noCreditAndNoWaiver')Object.assign(state.annual[0],{actorMonths:0,actors:0,waivedActorMonths:0,qiAdded:0,hpAdded:0});
      if(forgery==='duplicate')state.annual.push({...state.annual[0]});
      expect(()=>encodeEraWorldSave(bad.world)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });
});

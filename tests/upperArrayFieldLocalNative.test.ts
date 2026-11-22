import {describe,it,expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {WATER_VEIN_SITE} from '../src/engine/waterVeinTerms';
import {availableUpperPassageActions} from '../src/engine/upperPassageEngine';
import type {UpperPassageMove} from '../src/engine/upperPassageTerms';
import {availableUpperArrayFieldMovementActions} from '../src/engine/upperArrayFieldMovementEngine';
import type {UpperArrayFieldMove} from '../src/engine/upperArrayFieldTerms';
import {availableUpperArrayFieldLocalActions,projectUpperArrayFieldLocal,resolveUpperArrayFieldLocalAction,
  upperArrayLatticeStock} from '../src/engine/upperArrayFieldLocalEngine';
import {encodeEraWorldSave,decodeEraWorldSave} from '../src/engine/storageEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const id='elder-danxia-1';
const body=(world:WorldState,idOverride=id)=>world.cultivators.find(actor=>actor.id===idOverride)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],params:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'核对眼前实址。',...params});
const step=(world:WorldState,command=order('REST'))=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive)
  .map(row=>[row.id,row.id===id?command:order('REST')])),()=>.99,'utility');
function passage(world:WorldState,move:UpperPassageMove){
  const opts=availableUpperPassageActions(body(world),world,world.tick+1);
  const option=opts.find(item=>item.upperPassageMove===move)!;
  expect(option).toBeDefined();
  return step(world,order('UPPER_PASSAGE',{upperPassageMove:move,targetUpperPassageNodeId:option.targetUpperPassageNodeId}));
}
function travel(world:WorldState,move:UpperArrayFieldMove,site:string) {
  const option=availableUpperArrayFieldMovementActions(body(world),world,world.tick+1)
    .find(row=>row.upperArrayFieldMove===move&&row.targetUpperArrayFieldSiteId===site)!;
  expect(option).toBeDefined();
  return step(world,order(option.action,{upperArrayFieldMove:move,targetUpperArrayFieldSiteId:option.targetUpperArrayFieldSiteId}));
}
function source(){
  let world=createInitialWorld(1,'spirit-bloom');
  const actor=body(world);
  const known=knownMapLocations(world,actor);
  const unknown=world.locations.filter(row=>row.id!==actor.locationId&&!known.includes(row));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==actor.locationId);
  const index=candidates.findIndex(row=>row.id===WATER_VEIN_SITE);
  expect(index).toBeGreaterThanOrEqual(0);
  let draw=0;
  applyCultivatorBrainDecision(world,actor,order('EXPLORE'),()=>draw++===0?(index+.2)/candidates.length:.99);
  expect(actor.locationId).toBe(WATER_VEIN_SITE);
  const village=world.settlements.villages.find(row=>row.locationId===WATER_VEIN_SITE)!;
  world=step(world,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=step(world,order('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  world=step(world,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=step(world,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  expect(world.villageWorks.projects.at(-1)?.status).toBe('completed');
  expect(body(world).herbs.earth_root).toBeGreaterThanOrEqual(2);
  world=step(world,order('WATER_VEIN',{waterVeinMove:'open',targetLocationId:WATER_VEIN_SITE}));
  for(const move of ['enter','advance','advance','advance','read','advance','petition'] as const)world=passage(world,move);
  world=travel(world,'enter','array-field-gate');
  world=travel(world,'travel','array-field-path');
  world=travel(world,'travel','array-field-home');
  world=travel(world,'settle','array-field-home');
  world=travel(world,'travel','array-field-practice');
  world=travel(world,'travel','array-field-source');
  return world;
}
const condense=order('UPPER_ARRAY_FIELD_LOCAL',{upperArrayFieldLocalMove:'condense',targetUpperArrayFieldSiteId:'array-field-source'});
const cultivate=order('UPPER_ARRAY_FIELD_LOCAL',{upperArrayFieldLocalMove:'cultivate',targetUpperArrayFieldSiteId:'array-field-practice'});

describe('native personal upper array production and timed practice',()=>{
  it('charges real personal money, roots and effort; conserves known lattice and old accounts through strict native decode',()=>{
    const before=source(), resting=step(before), worked=step(before,condense);
    const resident=body(worked), idle=body(resting);
    expect(resident.spiritStones).toBe(idle.spiritStones-2);
    expect(resident.hp).toBe(idle.hp-4);
    expect(resident.herbs.earth_root).toBe(idle.herbs.earth_root-1);
    expect(worked.upperPassage).toEqual(resting.upperPassage);
    expect(worked.coldWaterVein).toEqual(resting.coldWaterVein);
    expect(upperArrayLatticeStock(worked,id)).toBe(2);
    expect(projectUpperArrayFieldLocal(worked,body(worked,'npc-1'))).toBeUndefined();
    expect(resolveUpperArrayFieldLocalAction(worked,resident,condense)).toBeNull();
    const atPractice=travel(worked,'travel','array-field-practice');
    const comparison=step(atPractice), practiced=step(atPractice,cultivate);
    expect(body(practiced).spiritStones).toBe(body(comparison).spiritStones-3);
    expect(body(practiced).hp).toBe(body(comparison).hp-4);
    expect(body(practiced).qiProgress).toBe(Math.min(100,body(comparison).qiProgress+6));
    expect(upperArrayLatticeStock(practiced,id)).toBe(1);
    expect(practiced.upperArrayField?.production?.receipts.map(row=>row.move)).toEqual(['condense','cultivate']);
    const bytes=encodeEraWorldSave(practiced), restored=decodeEraWorldSave(bytes);
    expect(encodeEraWorldSave(restored)).toBe(bytes);
    expect(encodeEraWorldSave(step(restored))).toBe(encodeEraWorldSave(step(practiced)));
  });

  it('withholds malformed options, dead or detached body, poor funds, and forged/repeated batch claims',()=>{
    const world=source(), actor=body(world);
    const text=JSON.stringify(world);
    expect(resolveUpperArrayFieldLocalAction(world,actor,condense)).toBeNull(); // occupied this month by travel
    expect(JSON.stringify(world)).toBe(text);
    const deferred=structuredClone(world);
    const poor=body(deferred);poor.herbs.earth_root=0;
    expect(availableUpperArrayFieldLocalActions(poor,deferred,deferred.tick+1)).toEqual([]);
    expect(availableUpperArrayFieldLocalActions({...actor},world,world.tick+1)).toEqual([]);
    expect(availableUpperArrayFieldLocalActions(actor,world,world.tick+2)).toEqual([]);
    const worked=step(world,condense), corrupted=structuredClone(worked);
    const stock=corrupted.upperArrayField?.production?.stock;
    expect(stock?.length).toBe(1);
    stock!.push({...stock![0]});
    expect(()=>encodeEraWorldSave(corrupted)).toThrow();
    const wrongVisit=structuredClone(worked);
    wrongVisit.upperArrayField!.production!.receipts[0].visitId='other-body-visit';
    expect(()=>encodeEraWorldSave(wrongVisit)).toThrow();
    const malformed=structuredClone(worked);
    delete malformed.upperArrayField!.production;
    expect(()=>encodeEraWorldSave(malformed)).toThrow();
  });
});

import {describe,expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {availableFrontierMovementActions,frontierPhysicalSite,frontierResidence,projectFrontierMovement,
  resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {FRONTIER_CHARTS,FRONTIER_EDGES,frontierSite,type FrontierAnchorId,type FrontierMovementMove,type FrontierSiteId} from '../src/engine/frontierTerms';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

const snow='elder-danxia-1', marsh='elder-danxia-2';
const REST:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'按真身实址过本月。'};
const find=(world:WorldState,id=snow):Cultivator=>world.cultivators.find(row=>row.id===id)!;
const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:REST.innerMonologue,...fields});
const move=(world:WorldState,id:string,desired:FrontierMovementMove,target:FrontierAnchorId|FrontierSiteId):LLMDecisionPayload=>{
  const row=availableFrontierMovementActions(find(world,id),world,world.tick+1).find(choice=>
    choice.frontierMove===desired&&choice.targetFrontierSiteId===target);
  expect(row).toBeDefined();
  return action('FRONTIER',{frontierMove:desired,targetFrontierSiteId:target});
};
const step=(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>[row.id,orders[row.id]??REST])),()=>.99,'utility');
const nativeParents=()=>prepareNorthWellHistoricalSource().world;
const rawRestored=(world:WorldState)=>decodeEraWorldSave(encodeEraWorldSave(world));

describe('frontier live bodies, actual separate chart geometry, and paid homes',()=>{
  it('walks one inherited body on each real chart, goes round actual winter closure, reads both homes, and exits through the original interface',()=>{
    let world=nativeParents();
    const original=encodeEraWorldSave(world), source=rawRestored(world);
    expect(source.frontier).toBeUndefined();
    expect(encodeEraWorldSave(source)).toBe(original);
    expect(world.tick).toBe(34);
    expect(world.terrain).toMatchObject({columns:25,rows:15});
    const tileKeys=world.terrain.tiles.map(tile=>tile.id), lowerSites=world.locations.map(site=>site.id);
    expect(find(world).locationId).toBe('loc-vein-north');
    expect(find(world,marsh).locationId).toBe('loc-vein-north');
    for(const edge of FRONTIER_EDGES){
      const left=frontierSite(edge.from)!,right=frontierSite(edge.to)!;
      expect(left.chartId).toBe(right.chartId);
      expect(Math.abs(left.col-right.col)+Math.abs(left.row-right.row)).toBe(1);
    }
    world=step(world,{[snow]:action('GATHER_HERBS',{targetHerbId:'earth_root'}),[marsh]:action('GATHER_HERBS',{targetHerbId:'earth_root'})});
    expect(find(world).herbs.earth_root).toBeGreaterThanOrEqual(2);
    expect(find(world,marsh).herbs.earth_root).toBeGreaterThanOrEqual(2);
    const originalSnowStones=find(world).spiritStones, originalSnowRoots=find(world).herbs.earth_root;
    const granted=move(world,snow,'enter','frontier-north-gate');
    expect(resolveFrontierMovementAction(world,find(world),{...granted,targetFrontierSiteId:'frontier-north-plot'})).toBeNull();
    expect(availableFrontierMovementActions(structuredClone(find(world)),world,world.tick+1)).toEqual([]);
    world=step(world,{[snow]:granted,[marsh]:action('EXPLORE',{targetLocationId:'loc-market'})});
    expect([world.tick,world.month]).toEqual([36,12]);
    expect(find(world)).toMatchObject({id:snow,positionPlane:'frontier',locationId:'frontier-north-gate',
      spiritStones:originalSnowStones-8,herbs:{earth_root:originalSnowRoots-1}});
    expect(world.frontier?.visits[0]).toMatchObject({id:`frontier-visit-36-${snow}`,regionId:'north-snow',anchorId:'loc-vein-north',
      enteredTick:36,paidStones:8,paidRoots:1,steps:[{tick:36,siteId:'frontier-north-gate'}]});
    expect(world.resourceFlow.months.at(-1)?.entries.filter(row=>row.reason==='frontier_entry_paid').map(row=>[row.good,row.amount]))
      .toEqual([['stone',8],['earth_root',1]]);
    expect(frontierPhysicalSite(world,find(world))?.chartId).toBe(FRONTIER_CHARTS['north-snow'].id);
    expect(projectFrontierMovement(world,find(world))?.options.map(row=>row.targetFrontierSiteId)).not.toContain('frontier-north-pass');
    expect(projectFrontierMovement(world,find(world))?.visibleSites.map(row=>row.id)).not.toContain('frontier-north-home');
    expect(availableFrontierMovementActions(find(world),world,world.tick+1).filter(row=>row.frontierMove==='travel')
      .map(row=>row.targetFrontierSiteId)).toEqual(['frontier-north-lee-west']);
    const fromSouth=projectFrontierMovement(world,find(world,marsh));
    expect(fromSouth).toMatchObject({scope:'anchor',regionId:'south-marsh',chartId:'chart-south-marsh',visibleSites:[]});
    world=step(world,{[snow]:move(world,snow,'travel','frontier-north-lee-west'),[marsh]:move(world,marsh,'enter','frontier-south-gate')});
    world=step(world,{[snow]:move(world,snow,'travel','frontier-north-lee-mid'),[marsh]:move(world,marsh,'travel','frontier-south-crossway')});
    world=step(world,{[snow]:move(world,snow,'travel','frontier-north-lee-east'),[marsh]:move(world,marsh,'travel','frontier-south-home')});
    world=step(world,{[snow]:move(world,snow,'travel','frontier-north-home'),[marsh]:move(world,marsh,'settle','frontier-south-home')});
    world=step(world,{[snow]:move(world,snow,'settle','frontier-north-home')});
    expect(world.tick).toBe(41);
    expect(frontierResidence(world,snow)).toMatchObject({homeSiteId:'frontier-north-home',settledTick:41,paidStones:4,paidRoots:1});
    expect(frontierResidence(world,marsh)).toMatchObject({homeSiteId:'frontier-south-home',settledTick:40,paidStones:4,paidRoots:1});
    expect(find(world)).toMatchObject({id:snow,positionPlane:'frontier',locationId:'frontier-north-home',
      spiritStones:originalSnowStones-12,herbs:{earth_root:originalSnowRoots-2}});
    expect(world.cultivators.filter(row=>row.id===snow||row.id===marsh)).toHaveLength(2);
    expect(world.terrain.tiles.map(tile=>tile.id)).toEqual(tileKeys);
    expect(world.locations.map(site=>site.id)).toEqual(lowerSites);
    expect(projectFrontierMovement(world,find(world))?.visibleSites.some(row=>row.regionId==='south-marsh')).toBe(false);
    expect(projectFrontierMovement(world,find(world,marsh))?.visibleSites.some(row=>row.regionId==='north-snow')).toBe(false);
    const forged=structuredClone(world);
    forged.frontier!.visits[0].steps[1].siteId='frontier-north-pass';
    expect(()=>encodeEraWorldSave(forged)).toThrow();
    const fromSaved=rawRestored(world);
    expect(encodeEraWorldSave(fromSaved)).toBe(encodeEraWorldSave(world));
    const northNext=move(world,snow,'travel','frontier-north-pass');
    expect(encodeEraWorldSave(step(fromSaved,{[snow]:northNext}))).toBe(encodeEraWorldSave(step(world,{[snow]:northNext})));
    world=step(world,{[snow]:northNext});
    world=step(world,{[snow]:move(world,snow,'travel','frontier-north-gate')});
    expect(resolveFrontierMovementAction(world,find(world),action('FRONTIER',{frontierMove:'exit',targetFrontierSiteId:'loc-market'}))).toBeNull();
    world=step(world,{[snow]:move(world,snow,'exit','loc-vein-north')});
    expect([world.tick,find(world).locationId,find(world).positionPlane]).toEqual([44,'loc-vein-north',undefined]);
    expect(world.frontier?.visits[0].exitedTick).toBe(44);
    expect(frontierPhysicalSite(world,find(world))).toBeUndefined();
    expect(frontierResidence(world,snow)?.homeSiteId).toBe('frontier-north-home');
    expect(find(world,marsh)).toMatchObject({id:marsh,locationId:'frontier-south-home',positionPlane:'frontier'});
    expect(encodeEraWorldSave(rawRestored(world))).toBe(encodeEraWorldSave(world));
  });

  it('keeps a native January death at the real frontier gate with the same custody and no lower inheritance ghost',()=>{
    let world=nativeParents();
    world=step(world,{[snow]:action('GATHER_HERBS',{targetHerbId:'earth_root'})});
    world=step(world,{[snow]:move(world,snow,'enter','frontier-north-gate')});
    expect([world.tick,world.month]).toEqual([36,12]);
    const body=find(world);
    body.age=body.lifespan-1; // Isolated mortality boundary fixture, not the genuine chronology above.
    const originalStones=body.spiritStones,originalHerbs=structuredClone(body.herbs);
    const inheritance=world.locations.map(row=>[row.id,row.inheritanceScrolls]);
    world=step(world);
    expect([world.tick,world.month]).toEqual([37,1]);
    expect(find(world)).toMatchObject({id:snow,alive:false,locationId:'frontier-north-gate',positionPlane:'frontier',
      spiritStones:originalStones,herbs:originalHerbs});
    expect(world.frontier?.visits[0].deceasedTick).toBe(37);
    expect(world.frontier?.visits[0].exitedTick).toBeUndefined();
    expect(world.locations.map(row=>[row.id,row.inheritanceScrolls])).toEqual(inheritance);
    expect(world.events.find(row=>row.id===`evt-frontier-37-${snow}-oldage`)).toMatchObject({category:'death',witnessScope:'participants'});
    expect(world.events.find(row=>row.id===`evt-frontier-37-${snow}-oldage`)?.locationId).toBeUndefined();
    expect(encodeEraWorldSave(rawRestored(world))).toBe(encodeEraWorldSave(world));
  });
});

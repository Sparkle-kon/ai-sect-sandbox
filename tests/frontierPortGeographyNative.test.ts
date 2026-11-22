import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {currentVisibleTileIds,terrainTileAt} from '../src/engine/terrainEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableFrontierMovementActions,frontierPhysicalSite,frontierResidence,projectFrontierMovement} from '../src/engine/frontierMovementEngine';
import {availableFrontierProductionActions,projectFrontierProduction,frontierTradeStock} from '../src/engine/frontierProductionEngine';
import {validateFrontierProductionShape} from '../src/engine/frontierProductionValidation';
import {availableFrontierTradeActions,frontierTradeCheckpoints,frontierTradeEdge,projectFrontierTrade} from '../src/engine/frontierTradeEngine';
import {FRONTIER_CHARTS,FRONTIER_EDGES,FRONTIER_EAST_SEA_EDGES,frontierEdge,frontierSeaEdge,frontierSite,isFrontierFarmRegion,
  type FrontierFarmRegionId} from '../src/engine/frontierTerms';
import type {FrontierTradeCheckpoint} from '../src/engine/frontierTradeTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const actorId='elder-danxia-2';
const actor=(world:WorldState)=>world.cultivators.find(row=>row.id===actorId)!;
const command=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>({
  chosenAction,innerMonologue:'按本人实走的关口与货账做。',...fields,
});
const step=(world:WorldState,move=command('REST'))=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>[row.id,row.id===actorId?move:command('REST')])),()=>.99,'utility');
function go(world:WorldState,frontierMove:NonNullable<LLMDecisionPayload['frontierMove']>,targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>){
  expect(availableFrontierMovementActions(actor(world),world,world.tick+1).some(row=>
    row.frontierMove===frontierMove&&row.targetFrontierSiteId===targetFrontierSiteId)).toBe(true);
  return step(world,command('FRONTIER',{frontierMove,targetFrontierSiteId}));
}
const restore=(world:WorldState)=>decodeEraWorldSave(encodeEraWorldSave(world));

describe('E4-4 actual offshore geography and farm isolation',()=>{
  it('pays to enter a physically separate 3x3 chart, rejects water on foot, and returns the same body to east native market',()=>{
    let world=createInitialWorld(1,'spirit-bloom');
    expect(world.frontier).toBeUndefined();
    expect(encodeEraWorldSave(restore(world))).toBe(encodeEraWorldSave(world));
    const oldTerrain=world.terrain.tiles.map(row=>row.id),oldNamedSites=world.locations.map(row=>row.id);
    for(const edge of [...FRONTIER_EDGES,...FRONTIER_EAST_SEA_EDGES]){
      const a=frontierSite(edge.from)!,b=frontierSite(edge.to)!;
      expect(a.chartId).toBe(b.chartId);
      expect(Math.abs(a.row-b.row)+Math.abs(a.col-b.col)).toBe(1);
    }
    expect(FRONTIER_CHARTS['east-offshore']).toMatchObject({id:'chart-east-offshore',columns:3,rows:3,anchorId:'loc-market-east',anchorTileId:'tile-19-4'});
    world=step(world,command('GATHER_HERBS',{targetHerbId:'earth_root'}));
    expect(actor(world).herbs.earth_root).toBeGreaterThanOrEqual(2);
    world=step(world,command('EXPLORE',{targetLocationId:'loc-market-east'}));
    expect(actor(world).locationId).toBe('loc-market-east');
    const lower=world.locations.find(row=>row.id==='loc-market-east')!;
    expect(terrainTileAt(world,lower.x,lower.y)?.id).toBe('tile-19-4');
    expect(projectFrontierMovement(world,actor(world))).toMatchObject({scope:'anchor',regionId:'east-offshore',visibleSites:[]});
    const before={wallet:actor(world).spiritStones,roots:actor(world).herbs.earth_root};
    world=go(world,'enter','frontier-east-gate');
    expect(actor(world)).toMatchObject({id:actorId,locationId:'frontier-east-gate',positionPlane:'frontier',
      spiritStones:before.wallet-8,herbs:{earth_root:before.roots-1}});
    expect(world.cultivators.filter(row=>row.id===actorId)).toHaveLength(1);
    expect(world.frontier?.visits[0]).toMatchObject({anchorId:'loc-market-east',enteredTick:4});
    expect(currentVisibleTileIds(world,actor(world))).toEqual(new Set()); // The old 25x15 Canvas cannot position the same body twice.
    world=go(world,'travel','frontier-east-causeway');
    world=go(world,'travel','frontier-east-dock');
    const view=projectFrontierMovement(world,actor(world));
    expect(view?.site?.id).toBe('frontier-east-dock');
    expect(view?.visibleSites).toContainEqual(expect.objectContaining({id:'frontier-east-outer',role:'sea',col:0,row:0}));
    expect(frontierSeaEdge('frontier-east-dock','frontier-east-outer')).toBeDefined();
    expect(frontierEdge('frontier-east-dock','frontier-east-outer')).toBeUndefined();
    expect(view?.options.some(row=>row.targetFrontierSiteId==='frontier-east-outer')).toBe(false);
    const invalidFoot=command('FRONTIER',{frontierMove:'travel',targetFrontierSiteId:'frontier-east-outer'});
    expect(applyCultivatorBrainDecision(world,actor(world),invalidFoot,()=>.99)).toBeNull();
    expect(actor(world).locationId).toBe('frontier-east-dock');
    const ready=restore(world);
    expect(encodeEraWorldSave(ready)).toBe(encodeEraWorldSave(world));
    const stepped=go(world,'travel','frontier-east-boatyard');
    expect(encodeEraWorldSave(go(ready,'travel','frontier-east-boatyard'))).toBe(encodeEraWorldSave(stepped));
    world=go(stepped,'travel','frontier-east-home');
    world=go(world,'settle','frontier-east-home');
    expect(frontierResidence(world,actorId)).toMatchObject({regionId:'east-offshore',homeSiteId:'frontier-east-home',
      settledTick:9,paidStones:4,paidRoots:1});
    expect(actor(world)).toMatchObject({id:actorId,locationId:'frontier-east-home',spiritStones:before.wallet-12,herbs:{earth_root:before.roots-2}});
    expect(frontierPhysicalSite(world,actor(world))?.regionId).toBe('east-offshore');
    expect(projectFrontierProduction(world,actor(world))).toBeUndefined();
    expect(availableFrontierProductionActions(actor(world),world,world.tick+1)).toEqual([]);
    expect(availableFrontierTradeActions(actor(world),world,world.tick+1)).toEqual([]);
    expect(projectFrontierTrade(world,actor(world))).toEqual([]);
    expect(world.frontier?.production).toBeUndefined();
    expect(world.frontier?.trade).toBeUndefined();
    expect(world.frontier?.port).toBeUndefined(); // Living shores are not free salt, boats, cargo, or berth authorization.
    world=go(world,'travel','frontier-east-causeway');
    world=go(world,'travel','frontier-east-gate');
    world=go(world,'exit','loc-market-east');
    expect(actor(world)).toMatchObject({id:actorId,locationId:'loc-market-east'});
    expect(actor(world).positionPlane).toBeUndefined();
    expect(world.frontier?.visits[0].exitedTick).toBe(12);
    expect(frontierPhysicalSite(world,actor(world))).toBeUndefined();
    world=step(world,command('EXPLORE',{targetLocationId:'loc-market'}));
    expect(actor(world).locationId).toBe('loc-market');
    expect(availableFrontierTradeActions(actor(world),world,world.tick+1)).toEqual([]); // Third-chart home is not a north/south signer.
    expect(encodeEraWorldSave(restore(world))).toBe(encodeEraWorldSave(world));
    expect(world.terrain.tiles.map(row=>row.id)).toEqual(oldTerrain);
    expect(world.locations.map(row=>row.id)).toEqual(oldNamedSites);
  });
  it('rejects an offshore address and accidental east fields in the preserved farming/cargo schemas',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const east={chartId:'chart-east-offshore',tileId:'frontier-east-gate'} as unknown as FrontierTradeCheckpoint;
    const eastDock={chartId:'chart-east-offshore',tileId:'frontier-east-dock'} as unknown as FrontierTradeCheckpoint;
    const eastLand={chartId:'chart-east-offshore',tileId:'frontier-east-causeway'} as unknown as FrontierTradeCheckpoint;
    expect(frontierTradeEdge(world,{chartId:'lower-base',tileId:'tile-19-4'},east)).toBeUndefined();
    expect(frontierTradeEdge(world,east,eastLand)).toBeUndefined();
    expect(frontierTradeEdge(world,eastDock,eastLand)).toBeUndefined();
    expect(isFrontierFarmRegion('east-offshore')).toBe(false);
    const badSide='east-offshore' as unknown as FrontierFarmRegionId;
    expect(frontierTradeCheckpoints(world,badSide,'standard')).toBeUndefined();
    expect(frontierTradeStock(world,badSide,'ward_reed')).toBe(0);
    const bad={version:1,water:{'north-snow':0,'south-marsh':0,'east-offshore':0},soil:[],crops:[],batches:[],stock:[],consumptions:[],receipts:[]};
    expect(()=>validateFrontierProductionShape(bad,'caught-east-farm',path=>{throw Error(path);})).toThrow('caught-east-farm');
  });
});

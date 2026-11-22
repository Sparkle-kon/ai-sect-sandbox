import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {applyCultivatorBrainDecision,advanceWorldTick} from '../src/engine/worldEngine';
import {currentVisibleTileIds} from '../src/engine/terrainEngine';
import {availableFrontierMovementActions,frontierAnchor,frontierPhysicalSite,frontierResidence,
  projectFrontierMovement,type FrontierMovementOption} from '../src/engine/frontierMovementEngine';
import {FRONTIER_CHARTS,FRONTIER_DRYLAND_REGIONS,FRONTIER_EDGES,FRONTIER_SITES,frontierEdge,frontierSite,
  type FrontierRegionId,type FrontierSiteId} from '../src/engine/frontierTerms';
import {availableFrontierProductionActions} from '../src/engine/frontierProductionEngine';
import {availableFrontierTradeActions} from '../src/engine/frontierTradeEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const npc=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
const readback=(world:WorldState)=>decodeEraWorldSave(encodeEraWorldSave(world));
const quiet=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按本地可验的名册与足迹行动。',...fields});
function turn(world:WorldState,overrides:Record<string,LLMDecisionPayload>={}) {
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(actor=>actor.alive&&actor.hp>0)
    .map(actor=>[actor.id,overrides[actor.id]??quiet('REST')])),()=>.99,'utility');
}
function go(world:WorldState,id:string,move:FrontierMovementOption['frontierMove'],target:FrontierMovementOption['targetFrontierSiteId']){
  expect(availableFrontierMovementActions(npc(world,id),world,world.tick+1)).toContainEqual(
    {action:'FRONTIER',frontierMove:move,targetFrontierSiteId:target});
  return turn(world,{[id]:quiet('FRONTIER',{frontierMove:move,targetFrontierSiteId:target})});
}
const west='npc-1',ridge='npc-8';
const settle=(world:WorldState,id:string,scenes:readonly [FrontierSiteId,FrontierSiteId,FrontierSiteId])=>
  go(go(go(go(world,id,'enter',scenes[0]),id,'travel',scenes[1]),id,'travel',scenes[2]),id,'settle',scenes[2]);

describe('E4-5 dryland geography and present title',()=>{
  it('opens two separate paid bodily lanes and keeps the original lower chart and native farms unchanged',()=>{
    let world=createInitialWorld(1,'spirit-bloom');
    const baseTiles=world.terrain.tiles.map(tile=>tile.id),baseSites=world.locations.map(site=>site.id);
    expect(npc(world,west).locationId).toBe('loc-taixu');
    expect(npc(world,ridge).locationId).toBe('loc-tianji');
    expect(FRONTIER_CHARTS['western-saltwell']).toMatchObject({anchorTileId:'tile-4-3',id:'chart-western-saltwell'});
    expect(FRONTIER_CHARTS['plateau-thunderridge']).toMatchObject({anchorTileId:'tile-19-3',id:'chart-plateau-thunderridge'});
    expect(FRONTIER_CHARTS['east-offshore'].anchorTileId).toBe('tile-19-4');
    for(const region of FRONTIER_DRYLAND_REGIONS){
      const cells=FRONTIER_SITES.filter(row=>row.regionId===region);
      expect(cells).toHaveLength(7);
      expect(new Set(cells.map(cell=>`${cell.col},${cell.row}`)).size).toBe(7);
    }
    for(const {from,to} of FRONTIER_EDGES){
      const a=frontierSite(from)!,b=frontierSite(to)!;
      expect(a.chartId).toBe(b.chartId);
      expect(Math.abs(a.col-b.col)+Math.abs(a.row-b.row)).toBe(1);
    }
    expect(frontierEdge('frontier-west-warehouse','frontier-west-home')).toBeUndefined();
    expect(frontierEdge('frontier-ridge-warehouse','frontier-ridge-home')).toBeUndefined();
    world=turn(world,{[west]:quiet('GATHER_HERBS',{targetHerbId:'earth_root'}),[ridge]:quiet('GATHER_HERBS',{targetHerbId:'earth_root'})});
    const wallets=[west,ridge].map(id=>({stones:npc(world,id).spiritStones,roots:npc(world,id).herbs.earth_root}));
    world=settle(world,west,['frontier-west-gate','frontier-west-trail','frontier-west-home']);
    world=settle(world,ridge,['frontier-ridge-gate','frontier-ridge-saddle','frontier-ridge-home']);
    for(const [index,id] of [west,ridge].entries()){
      expect(world.cultivators.filter(row=>row.id===id)).toHaveLength(1);
      expect(currentVisibleTileIds(world,npc(world,id))).toEqual(new Set());
      expect(frontierResidence(world,id)).toMatchObject({regionId:FRONTIER_DRYLAND_REGIONS[index],paidStones:4,paidRoots:1});
      expect(npc(world,id)).toMatchObject({spiritStones:wallets[index].stones-12,herbs:{earth_root:wallets[index].roots-2}});
      expect(availableFrontierProductionActions(npc(world,id),world,world.tick+1)).toEqual([]);
      expect(availableFrontierTradeActions(npc(world,id),world,world.tick+1)).toEqual([]);
    }
    expect(world.frontier?.drylands).toBeUndefined();
    expect(encodeEraWorldSave(readback(world))).toBe(encodeEraWorldSave(world));
    const a=go(world,ridge,'travel','frontier-ridge-quarry');
    expect(encodeEraWorldSave(go(readback(world),ridge,'travel','frontier-ridge-quarry'))).toBe(encodeEraWorldSave(a));
    expect(frontierPhysicalSite(a,npc(a,ridge))?.role).toBe('quarry');
    expect(a.locations.map(row=>row.id)).toEqual(baseSites);
    expect(a.terrain.tiles.map(row=>row.id)).toEqual(baseTiles);
  });
  it('denies current title mismatches, while exact paid return and strict historic residence do not adopt the new title',()=>{
    let world=createInitialWorld(1,'spirit-bloom');
    world=turn(world,{[west]:quiet('GATHER_HERBS',{targetHerbId:'earth_root'})});
    const region:FrontierRegionId='western-saltwell';
    const wrong=structuredClone(world),anchor=frontierAnchor(wrong,region)!;
    anchor.ownerSectId='sect-tianji';
    expect(projectFrontierMovement(wrong,npc(wrong,west))).toMatchObject({scope:'anchor',blocked:'title',options:[]});
    expect(applyCultivatorBrainDecision(wrong,npc(wrong,west),quiet('FRONTIER',{frontierMove:'enter',
      targetFrontierSiteId:'frontier-west-gate'}),()=>.99)).toBeNull();
    expect(wrong.frontier).toBeUndefined();
    expect(npc(wrong,west).herbs.earth_root).toBe(npc(world,west).herbs.earth_root);
    world=go(world,west,'enter','frontier-west-gate');
    // Detached relocation after-state fixture: the native relocation engine uses this exact former-HQ type/title transition.
    const former=structuredClone(world),old=frontierAnchor(former,region)!;
    old.type='spirit_vein';delete old.ownerSectId;
    const paid=go(readback(former),west,'exit','loc-taixu');
    expect(frontierPhysicalSite(paid,npc(paid,west))).toBeUndefined();
    expect(npc(paid,west).locationId).toBe('loc-taixu');
    expect(encodeEraWorldSave(readback(paid))).toBe(encodeEraWorldSave(paid));

    const moved=structuredClone(world),missing=frontierAnchor(moved,region)!;
    missing.x+=80;
    expect(availableFrontierMovementActions(npc(moved,west),moved,moved.tick+1).some(op=>op.frontierMove==='exit')).toBe(false);
    expect(()=>readback(moved)).toThrow();
  });
});

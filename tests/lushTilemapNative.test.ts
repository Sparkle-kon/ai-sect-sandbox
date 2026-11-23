import {describe,expect,it,vi} from 'vitest';
import {buildLushTilemap} from '../src/components/lushTilemapModel';
import {MAP_HEIGHT,MAP_WIDTH} from '../src/components/mapCamera';
import {projectMapTerritories} from '../src/components/mapTerritorySemantics';
import {planPhysicalAtlasDrawing} from '../src/components/physicalAtlasMap';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {projectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {currentVisibleTileIds,terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,MapTile,WorldState} from '../src/types/world';
import {moveWestTrip,prepareNativeWestCenterTrip,WEST_TRIP_PAYER} from './fixtures/westCenterNativeFixture';

const person=(world:WorldState,id='npc-1')=>world.cultivators.find(row=>row.id===id)!;
const bodyAt=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const stay:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'等一月。'};
const quiet=(world:WorldState)=>Object.fromEntries(world.cultivators.map(row=>[row.id,stay]));
const center=(world:WorldState,tile:MapTile)=>({
  x:(tile.col+.5)*MAP_WIDTH/world.terrain.columns,y:(tile.row+.5)*MAP_HEIGHT/world.terrain.rows,
});
const scope=(world:WorldState,viewer?:Cultivator)=>{
  const view=createTerrainMapView(world,viewer,!!viewer);
  return {view,art:buildLushTilemap(world,view)};
};

describe('decorative lush tilemap with native terrain authority',()=>{
  it('paints all actual six biomes and exact canonical facades without gaining ownership or settlement IDs',()=>{
    const world=createInitialWorld(1);
    const before=encodeEraWorldSave(world);
    const {art}=scope(world);
    const w=MAP_WIDTH/world.terrain.columns,h=MAP_HEIGHT/world.terrain.rows;
    expect(new Set(art.tiles.map(row=>row.biome))).toEqual(new Set(['灵山','毒沼','剑冢','荒漠','魔渊','坊市']));
    expect(art.tiles).toHaveLength(world.terrain.tiles.length);
    const source=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
    expect(new Set(art.tiles.map(({tileId})=>tileId)).size).toBe(source.size);
    for(const {tileId,biome,x,y,width,height} of art.tiles){
      const tile=source.get(tileId)!;
      expect({biome,x,y,width,height}).toEqual({biome:tile.biome,x:tile.col*w,y:tile.row*h,width:w,height:h});
    }
    const motifs={
      'loc-taixu':'gate','loc-danxia':'terrace','loc-market':'market','loc-tianji':'shrine',
      'loc-vein-north':'well','loc-blood':'abyss',
    } as const;
    for(const [id,kind] of Object.entries(motifs)){
      const site=bodyAt(world,id),tile=terrainTileAt(world,site.x,site.y)!;
      const matching=art.architecture.find(row=>row.siteId===id&&row.kind===kind);
      expect(matching).toMatchObject({kind,siteId:id,tileId:tile.id,anchorX:site.x,anchorY:site.y});
      expect(matching).not.toHaveProperty('ownerSectId');
    }
    const inhabited=world.settlements.villages.filter(row=>row.population>0);
    expect(inhabited.length).toBeGreaterThan(0);
    for(const row of art.architecture){
      expect(world.locations.some(site=>site.id===row.siteId)).toBe(true);
      expect(Boolean(row.village)).toBe(inhabited.some(village=>village.locationId===row.siteId));
    }
    const market=bodyAt(world,'loc-market');
    const cold=bodyAt(world,'loc-vein-north');
    expect(art.architecture.find(row=>row.siteId===market.id)?.village).toBe(true);
    expect(art.tiles.filter(row=>row.frost).map(row=>row.tileId)).toEqual([terrainTileAt(world,cold.x,cold.y)?.id]);
    expect(art.tiles.filter(row=>row.moisture).map(row=>row.tileId))
      .toEqual(art.tiles.filter(row=>row.biome==='毒沼').map(row=>row.tileId));
    expect(scope(world).art).toEqual(art);
    expect(encodeEraWorldSave(world)).toBe(before);
    const reopened=decodeEraWorldSave(before);
    expect(encodeEraWorldSave(reopened)).toBe(before);
    expect(scope(reopened).art).toEqual(art);
  });

  it('keeps explored old land flat and derives seams only from two currently admitted orthogonal neighbours',()=>{
    const start=createInitialWorld(1);
    const actorId=person(start).id;
    const oldPeak=bodyAt(start,person(start).locationId);
    const oldTile=terrainTileAt(start,oldPeak.x,oldPeak.y)!;
    const arrived=advanceWorldTick(start,{...quiet(start),[actorId]:{chosenAction:'EXPLORE',
      targetLocationId:'loc-market',innerMonologue:'沿实际路到坊市。'}},()=>.99);
    const viewer=person(arrived,actorId);
    expect(viewer.locationId).toBe('loc-market');
    expect(viewer.exploredTileIds).toContain(oldTile.id);
    const {view,art}=scope(arrived,viewer);
    expect(view.tileState(oldTile)).toBe('explored');
    const visible=currentVisibleTileIds(arrived,viewer);
    expect(new Set(art.tiles.map(row=>row.tileId))).toEqual(visible);
    expect(art.architecture.some(row=>row.siteId===oldPeak.id)).toBe(false);
    expect(art.architecture).toEqual(expect.arrayContaining([expect.objectContaining({siteId:'loc-market',kind:'market'})]));
    expect(art.architecture.every(row=>visible.has(row.tileId)&&view.isCurrentLocation(row.siteId))).toBe(true);
    expect(art.seams.length).toBeGreaterThan(0);
    const cells=new Map(art.tiles.map(row=>[row.tileId,row]));
    const w=MAP_WIDTH/arrived.terrain.columns,h=MAP_HEIGHT/arrived.terrain.rows;
    for(const seam of art.seams){
      // Offset each side of the seam's center in its single axis; nothing corners across fog.
      const midpoint={x:seam.x+seam.width/2,y:seam.y+seam.height/2};
      const dx=seam.axis==='x'?w*.49:0,dy=seam.axis==='y'?h*.49:0;
      const a=terrainTileAt(arrived,midpoint.x-dx,midpoint.y-dy),b=terrainTileAt(arrived,midpoint.x+dx,midpoint.y+dy);
      expect(a&&b&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)).toBe(1);
      expect(a&&cells.has(a.id)).toBe(true);
      expect(b&&cells.has(b.id)).toBe(true);
      expect(new Set([a?.biome,b?.biome])).toEqual(new Set([seam.from,seam.to]));
    }
    const hidden=arrived.terrain.tiles.find(row=>view.tileState(row)==='hidden'&&row.biome!=='灵山')!;
    const changed=applyMapBrush(arrived,'paint_vein',[center(arrived,hidden)]);
    expect(changed.terrain.tiles.find(row=>row.id===hidden.id)?.biome).toBe('灵山');
    expect(scope(changed,person(changed,actorId)).art).toEqual(art);
  });

  it('does not make forged or upper-plane venues drawable and does not displace native land claims or atlas links',()=>{
    const world=createInitialWorld(1);
    const full=scope(world);
    const known=bodyAt(world,'loc-taixu');
    const scopedGate={...known,id:'malformed-unauthorized-gate',type:'secret_realm' as const,expeditionOmenId:'unknown-native-omen'};
    const bad={...world,locations:[...world.locations,{...known},scopedGate]};
    const view=createTerrainMapView(bad,undefined,false);
    const actual=buildLushTilemap(bad,view);
    expect(actual.architecture.some(row=>row.siteId===known.id||row.siteId===scopedGate.id)).toBe(false);
    const traveler={...person(world),positionPlane:'upper' as const};
    expect(scope({...world,cultivators:world.cultivators.map(row=>row.id===traveler.id?traveler:row)},traveler).art)
      .toEqual({tiles:[],seams:[],architecture:[],roads:[]});
    const territoryBefore=projectMapTerritories(world,full.view.tileState,full.view.seenLocations);
    const {columns,rows}=world.terrain;
    const atlasBefore=planPhysicalAtlasDrawing(projectPhysicalAtlas(world,person(world)),{cols:columns,rows});
    expect(territoryBefore.markers.length).toBeGreaterThan(0);
    expect(scope(world).art).toEqual(full.art);
    expect(projectMapTerritories(world,full.view.tileState,full.view.seenLocations)).toEqual(territoryBefore);
    expect(planPhysicalAtlasDrawing(projectPhysicalAtlas(world,person(world)),{cols:columns,rows})).toEqual(atlasBefore);
  });

  it('decorates only a physically surveyed, paid native charter path and never invents a crossing receipt',()=>{
    const {ready,roadId,journeyId}=prepareNativeWestCenterTrip();
    const road=ready.roads.links.find(row=>row.id===roadId)!;
    expect(ready.roads.crossings).toEqual([]);
    const publicMap=scope(ready);
    const stones=publicMap.art.roads.find(row=>row.roadId===roadId);
    expect(stones?.points).toEqual(road.path);
    const present=person(ready,WEST_TRIP_PAYER);
    expect(present.exploredTileIds).toContain(terrainTileAt(ready,road.path.at(-1)!.x,road.path.at(-1)!.y)?.id);
    expect(scope(ready,present).art.roads.some(row=>row.roadId===roadId)).toBe(false);
    const forged={...ready,roads:{...ready.roads,links:[...ready.roads.links,{...road}]}};
    expect(scope(forged).art.roads.some(row=>row.roadId===roadId)).toBe(false);
    const strict=encodeEraWorldSave(ready);
    expect(scope(ready).art.roads).toEqual(publicMap.art.roads);
    expect(encodeEraWorldSave(ready)).toBe(strict);
    const arrived=moveWestTrip(ready,roadId);
    expect(arrived.roads.crossings.find(row=>row.journeyId===journeyId)).toMatchObject({
      roadId,departedTick:arrived.tick,fee:expect.any(Number),
    });
    expect(person(arrived,WEST_TRIP_PAYER).locationId).toBe(road.otherSiteId);
    expect(scope(arrived).art.roads.find(row=>row.roadId===roadId)?.points).toEqual(road.path);
  });

  it('shows the same native cartography after validated Cognitive or ordinary Utility travel, and reflects a real repaint not a hidden one',async()=>{
    const start=createInitialWorld(1);
    const initial=person(start);
    const travel:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'沿同一条路进城。'};
    const basic=advanceWorldTick(start,{...quiet(start),[initial.id]:travel},()=>.99);
    llmScheduler.resetTickBudget();
    const provider=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(travel)}}]})));
    vi.stubGlobal('fetch',provider);
    let result:LLMDecisionPayload|undefined;
    try{
      result=await requestCultivatorLLMDecision(initial,start,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture-only',model:'fixture'},start.tick+1);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject(travel);
    }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
    if(!result)throw new Error('The verified Cognitive parser must admit the same native route');
    const cognitive=advanceWorldTick(start,{...quiet(start),[initial.id]:result},()=>.99,'deferred',undefined,{
      modelActors:new Set([initial.id]),
    });
    const p=person(basic),modelPerson=person(cognitive);
    expect(p.locationId).toBe(travel.targetLocationId);
    expect(modelPerson.locationId).toBe(p.locationId);
    const scopeBefore=scope(basic,p);
    expect(scope(cognitive,modelPerson).art).toEqual(scopeBefore.art);
    const target=basic.terrain.tiles.find(row=>scopeBefore.view.tileState(row)==='visible'&&row.biome==='坊市')!;
    const before=encodeEraWorldSave(basic);
    const painted=applyMapBrush(basic,'paint_vein',[center(basic,target)]);
    expect(painted.terrain.tiles.find(row=>row.id===target.id)).toMatchObject({biome:'灵山'});
    expect(painted.terrain.tiles.find(row=>row.id===target.id)?.ownerSectId).toBe(target.ownerSectId);
    const scopeAfter=scope(painted,person(painted));
    expect(scopeAfter.art.tiles.find(row=>row.tileId===target.id)).toMatchObject({biome:'灵山'});
    expect(scopeBefore.art.tiles.find(row=>row.tileId===target.id)).toMatchObject({biome:'坊市'});
    expect(scopeAfter.art.architecture).toEqual(scopeBefore.art.architecture);
    expect(encodeEraWorldSave(basic)).toBe(before);
  });
});

import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {MortalVillagesPanel} from '../src/components/MortalVillagesPanel';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {MAP_HEIGHT,MAP_WIDTH} from '../src/components/mapCamera';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {projectUsedVillageMigrationSegments,projectVillageMapLabels} from '../src/components/villageEvolutionMap';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectVillageEvolution} from '../src/engine/villageEvolutionEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';

describe('old nonmarket names do not authorize current village records',()=>{
  it('gives a former visitor only stable identity in both fog modes, in card, map and keyboard label projection',()=>{
    const world=createInitialWorld(2031);
    world.tick=72;
    const village=world.settlements.villages.find(row=>world.locations.find(site=>site.id===row.locationId)?.type==='spirit_vein')!;
    const target=world.locations.find(site=>site.id===village.locationId)!;
    const destination=world.settlements.villages.find(row=>row.id!==village.id&&world.locations.find(site=>site.id===row.locationId)?.type==='market')!;
    const destinationSite=world.locations.find(site=>site.id===destination.locationId)!;
    const oldTile=terrainTileAt(world,target.x,target.y)!;
    const nextTile=world.terrain.tiles.find(tile=>tile.row===oldTile.row&&Math.abs(tile.col-oldTile.col)===1)!;
    Object.assign(destinationSite,{x:(nextTile.col+.5)*MAP_WIDTH/world.terrain.columns,y:(nextTile.row+.5)*MAP_HEIGHT/world.terrain.rows});
    const elsewhere=world.locations.find(site=>site.id!==target.id&&site.type==='sect_hq')!;
    const [local,former]=world.cultivators;
    local.age=former.age=33;
    local.locationId=target.id;
    former.locationId=elsewhere.id;
    // The former visitor is even on the same map tile now, but not at this canonical village.
    Object.assign(elsewhere,{x:target.x,y:target.y});
    local.exploredTileIds=former.exploredTileIds=[oldTile.id,nextTile.id];
    former.rumors=[];
    village.population=0;
    village.volunteers=[];
    village.juvenileCohorts=[];
    const identity={settlementId:village.id,siteId:target.id,registeredName:'崖畔旧村名'};
    world.villageEvolution.villages=[{...identity,status:'ruin',
      samples:[{tick:70,population:9,juveniles:1,namedRemaining:2,usableWell:true,passableCorridors:1,capacity:70,stress:50}],
      changes:[{tick:71,from:'village',to:'ruin',reason:'depopulated',population:0}]}];
    world.villageEvolution.migrations=[{id:'already-used-route',tick:69,fromSettlementId:village.id,toSettlementId:destination.id,
      agreementId:'historical-agreement',path:[oldTile.id,nextTile.id],people:2,fromBefore:11,fromAfter:9,toBefore:35,toAfter:37,
      leftJuveniles:1,leftNamed:2,households:[]}];
    world.settlements.records.push({id:'already-used-route',tick:69,kind:'migration',settlementId:village.id,
      targetSettlementId:destination.id,people:2,stones:0,herbs:0,description:''});
    world.settlements.records.push({id:'latest-local-story',tick:71,kind:'disaster',settlementId:village.id,
      people:2,stones:0,herbs:0,description:'仅本地实录'});
    for(const fog of [true,false]){
      expect(createTerrainMapView(world,former,fog).isCurrentLocation(target.id)).toBe(true);
      expect(projectVillageEvolution(world,former,'崖畔旧村名')).toEqual([{...identity,currentLocal:false}]);
      expect(projectVillageMapLabels(world,former).get(target.id)).toEqual({name:'崖畔旧村名',stage:undefined});
      expect(projectUsedVillageMigrationSegments(world,former)).toEqual([]);
    }
    expect(projectUsedVillageMigrationSegments(world,local)).toHaveLength(1);
    expect(projectVillageEvolution(world,local,'崖畔旧村名')[0]).toMatchObject({
      ...identity,currentLocal:true,status:'ruin',asOfTick:72,population:0,lastSurvey:{tick:70,usableWell:true},
      recentChanges:[{tick:71,reason:'depopulated'}],
    });
    const fold=(actor:typeof local)=>renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={actor}/>);
    expect(fold(local)).toContain('崖畔旧村名 · 旧址');
    expect(fold(local)).toContain('第 70 轮查验：水井可用');
    const formerFold=fold(former);
    expect(formerFold).toContain('崖畔旧村名 · 当前未观测');
    expect(formerFold).not.toMatch(/成为旧址|水井可用|人口 0|本地实录|Tick #71/);
    const forcedMap=(actor:typeof local)=>renderToStaticMarkup(<WorldMapCanvas world={world}
      selectedCultivatorId={actor.id} onSelectCultivator={()=>undefined}/>);
    expect(forcedMap(local)).toContain('崖畔旧村名 · 旧址 · 0 人');
    expect(forcedMap(local)).toContain('虚线只标已实际行过的迁徙路段');
    expect(forcedMap(former)).toContain('崖畔旧村名');
    expect(forcedMap(former)).not.toContain('虚线只标已实际行过的迁徙路段');
    expect(forcedMap(former)).not.toMatch(/崖畔旧村名 · 旧址|崖畔旧村名 · 0 人/);
  });
});

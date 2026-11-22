import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {makeMapNamePills} from '../src/components/mapCanvasNamePills';
import {planActorMarkers} from '../src/components/mapActorClusters';
import {resolveMapEntityHit} from '../src/components/mapEntityHit';
import {DEFAULT_CAMERA,MAP_HEIGHT,MAP_WIDTH,mapToScreen} from '../src/components/mapCamera';
import {mapLabelRectsOverlap} from '../src/components/mapLabelLayout';
import {projectMapSitePins} from '../src/components/mapSitePinLayout';
import {projectMapTerritories} from '../src/components/mapTerritorySemantics';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';

const towerId='loc-tianji',marketId='loc-market-east';
const measure=(kind:string,s:string)=>[...s].reduce((width,char)=>width+(/[\u4e00-\u9fff]/u.test(char)?
  (kind==='site'?13:11):7),0);

describe('one honest, collision-free label plane',()=>{
  it.each([360,390,690,895,1112,1440])('keeps the actual northeast names apart at %i CSS pixels',width=>{
    const world=createInitialWorld(),actor=world.cultivators[0],size={width,height:width*.6},camera=DEFAULT_CAMERA;
    const view=createTerrainMapView(world,actor,false),tower=view.seenLocations.find(site=>site.id===towerId)!;
    const market=view.seenLocations.find(site=>site.id===marketId)!;
    const pins=projectMapSitePins(view.seenLocations,view.isCurrentLocation,camera,size),marker=pins.get(marketId)!;
    expect(marker).toBeDefined();
    expect(Math.abs(marker.x-tower.x)*width/MAP_WIDTH).toBeGreaterThan(26);
    expect(Math.abs(marker.y-tower.y)*size.height/MAP_HEIGHT).toBeGreaterThan(26);
    expect(market).toMatchObject({x:784,y:160});
    const positions=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
    const rendered=positions.map(row=>row.actor.locationId===marketId&&!view.trailPositions.has(row.actor.id)
      ?{...row,x:row.x+marker.x-market.x,y:row.y+marker.y-market.y}:row);
    const markers=planActorMarkers(rendered,camera,size,actor.id);
    const territory=projectMapTerritories(world,view.tileState,[...pins.values()]);
    const plan=makeMapNamePills(size,camera,view.seenLocations,pins,view.isCurrentLocation,territory.markers,
      markers,actor.id,undefined,width<600,measure);
    expect(plan.pills.find(row=>row.id===`site:${towerId}`)).toMatchObject({title:'摘星天机台',tag:'天灵根'});
    expect(plan.pills.find(row=>row.id===`site:${marketId}`)).toMatchObject({title:'松灯坊市',tag:'木'});
    expect(plan.pills.filter(row=>row.kind==='site').every(row=>!/[炉卫经祠集俸苗仓校]/u.test(row.tag??''))).toBe(true);
    for(const [i,first] of plan.pills.entries())for(const later of plan.pills.slice(i+1))
      expect(mapLabelRectsOverlap(first.rect,later.rect)).toBe(false);

    const clicked=plan.siteRects.get(marketId)!;
    const screen={x:(clicked.x+clicked.width/2)*MAP_WIDTH/width,y:(clicked.y+clicked.height/2)*MAP_HEIGHT/size.height};
    const input={screen,isTouch:false,size,painted:{markers,positions,camera,size,scope:'main',sitePins:pins,siteLabels:plan.siteRects},
      scope:'main',positions,camera,actorById:new Map(view.liveActors.map(row=>[row.id,row])),seenLocations:view.seenLocations,
      isCurrentLocation:view.isCurrentLocation};
    const hover=resolveMapEntityHit(input);
    const expected=mapToScreen(camera,marker);
    expect(hover).toEqual({kind:'site',id:marketId,anchor:{x:expected.x*100/MAP_WIDTH,y:expected.y*100/MAP_HEIGHT}});
    expect(resolveMapEntityHit({...input,scope:'sibling'})).toEqual({kind:'stale'});
    expect(resolveMapEntityHit({...input,isCurrentLocation:(id:string)=>id!==marketId&&view.isCurrentLocation(id)}))
      .not.toMatchObject({kind:'site',id:marketId});
  });

  it('does not expose another live pin for a remembered, no longer current position',()=>{
    const world=createInitialWorld(),view=createTerrainMapView(world,undefined,false);
    expect(projectMapSitePins(view.seenLocations,id=>id!==marketId,DEFAULT_CAMERA,{width:390,height:234}).size).toBe(0);
  });
});

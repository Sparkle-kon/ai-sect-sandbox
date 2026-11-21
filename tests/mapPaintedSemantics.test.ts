import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { getVisibleHazards } from '../src/components/mapBrushView';
import { paintedMapMarks } from '../src/components/mapPaintedSemantics';
import { createTerrainMapView } from '../src/components/terrainMapView';

describe('the text index reads only the same legitimate map layers',()=>{
  it('gives current shapes, severity and visible routes without adding remembered hazards or endpoints',()=>{
    let world = createInitialWorld(2061);
    const initial=world.cultivators[0];
    initial.realm='练气';
    const near=world.locations.find(({id})=>id===initial.locationId)!;
    const far=[...world.locations].sort((a,b)=>Math.hypot(b.x-near.x,b.y-near.y)-Math.hypot(a.x-near.x,a.y-near.y))[0];
    world=applyMapBrush(world,'beast_tide',[near]);
    world=applyMapBrush(world,'cursed_miasma',[far]);
    const viewer=world.cultivators[0];
    viewer.exploredTileIds.push(terrainTileAt(world,far.x,far.y)!.id);
    const open=createTerrainMapView(world,viewer,false);
    const fog=createTerrainMapView(world,viewer,true);
    const presentation={routes:new Map([[viewer.id,{points:[{x:near.x,y:near.y},{x:far.x,y:far.y}],fromName:near.name,toName:far.name}]]),effects:[]};
    const markedConvoy={id:'actual-convoy',sectName:'行进宗门',marker:{x:near.x,y:near.y},route:[],row:1,col:2};
    const hiddenConvoy={...markedConvoy,id:'future-hidden-convoy',sectName:'不得显露',marker:{x:far.x,y:far.y}};
    const lower=paintedMapMarks(world,fog,[],getVisibleHazards(world,fog),[markedConvoy,hiddenConvoy],undefined,presentation);
    expect(lower.map(({title})=>title)).toEqual(expect.arrayContaining(['兽潮','行进宗门迁宗队伍']));
    expect(lower.find(({kind})=>kind==='hazard')?.summary).toMatch(/双折线.*强度 1/);
    expect(lower.find(({kind})=>kind==='route')?.summary).toContain('方形');
    for (const absent of ['瘴气','不得显露',far.name,viewer.name]) expect(JSON.stringify(lower)).not.toContain(absent);
    const revealed=paintedMapMarks(world,open,[],getVisibleHazards(world,open),[markedConvoy,hiddenConvoy],undefined,presentation);
    expect(revealed.length).toBeGreaterThan(lower.length);
    expect(revealed.some(({title})=>title.includes(far.name))).toBe(false);
    expect(revealed.some(({summary})=>summary.includes(far.name))).toBe(true);
  });
});

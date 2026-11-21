import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { drawHazards, getVisibleHazards, HAZARD_STYLES } from '../src/components/mapBrushView';
import { drawMapConvoys, MAP_CONVOY_STYLES, visibleCheckpointRoute } from '../src/components/mapConvoyView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';

type Segment={kind:'move'|'line'|'rect'|'close';coordinates:number[]};
function recorder(){
  let path:Segment[]=[];
  const strokes:Segment[][]=[];
  const filled:Segment[][]=[];
  const outlines:{x:number;y:number;width:number;height:number;ink:string;dash:number[]}[]=[];
  const dashes:number[][]=[];
  const text:{label:string;x:number;y:number}[]=[];
  const current={dash:[] as number[]};
  const facade={
    strokeStyle:'',fillStyle:'',globalAlpha:1,lineWidth:1,font:'',textAlign:'',textBaseline:'',
    save:()=>undefined,restore:()=>undefined,fillRect:()=>undefined,
    strokeRect(x:number,y:number,width:number,height:number){outlines.push({x,y,width,height,ink:this.strokeStyle,dash:current.dash});},
    setLineDash(value:number[]){current.dash=[...value];dashes.push(current.dash);},
    beginPath(){path=[];},closePath(){path.push({kind:'close',coordinates:[]});},
    moveTo(x:number,y:number){path.push({kind:'move',coordinates:[x,y]});},
    lineTo(x:number,y:number){path.push({kind:'line',coordinates:[x,y]});},
    rect(x:number,y:number,width:number,height:number){path.push({kind:'rect',coordinates:[x,y,width,height]});},
    stroke(){strokes.push([...path]);},fill(){filled.push([...path]);},
    fillText(label:string,x:number,y:number){text.push({label,x,y});},
  };
  return {context:facade as unknown as CanvasRenderingContext2D,strokes,filled,outlines,dashes,text};
}

describe('the actual visible map uses different geometry even when hues are equal',()=>{
  it('keeps three visible disaster shapes, patterns and strength tokens distinct on one tile and omits distant remembered hazards',()=>{
    const initial=createInitialWorld(341);
    initial.tick=12;
    const near={x:160,y:160}, far={x:920,y:560};
    const home=initial.locations[0];
    Object.assign(home,near);
    initial.cultivators[0].locationId=home.id;
    initial.cultivators[0].exploredTileIds=[terrainTileAt(initial,far.x,far.y)!.id];
    let world=applyMapBrush(initial,'meteor',[near,far]);
    world=applyMapBrush(world,'beast_tide',[near]);
    world=applyMapBrush(world,'beast_tide',[near]);
    for(let mark=0;mark<3;mark++)world=applyMapBrush(world,'cursed_miasma',[near]);
    const viewer=world.cultivators[0];
    const fog=createTerrainMapView(world,viewer,true);
    const local=getVisibleHazards(world,fog);
    const open=createTerrainMapView(world,viewer,false);
    expect(getVisibleHazards(world,open)).toHaveLength(4);
    expect(local).toHaveLength(3);
    for(const entry of local)expect(entry.tile.id).toBe(terrainTileAt(world,near.x,near.y)?.id);
    expect(local.map(({symbolLabel})=>symbolLabel)).toEqual(['三角','双折线','方形']);
    const actual=recorder();
    const commonHue=HAZARD_STYLES.meteor.color;
    drawHazards(actual.context,local.map(entry=>({...entry,color:commonHue})).reverse());
    expect(actual.text.map(({label})=>label)).toEqual(['1','2','3']);
    expect(new Set(actual.text.map(({x,y})=>`${x},${y}`)).size).toBe(3);
    expect(actual.strokes.map(path=>path.map(({kind})=>kind))).toEqual([
      ['move','line','line','close'], ['move','line','line','move','line','line'], ['rect'],
    ]);
    expect(actual.outlines.filter(({ink})=>ink===commonHue).map(({dash})=>dash)).toEqual([
      [...HAZARD_STYLES.meteor.dash],[...HAZARD_STYLES.beast_tide.dash],[...HAZARD_STYLES.cursed_miasma.dash],
    ]);
  });

  it('draws one unchanged clipped route with different migration and escort patterns at the same color',()=>{
    const world=createInitialWorld(81);
    const from={x:61,y:80},middle={x:101,y:80},end={x:181,y:80};
    const view=createTerrainMapView(world,undefined,false);
    const current=new Set([from,middle].map(({x,y})=>terrainTileAt(world,x,y)!.id));
    const checkpoint=visibleCheckpointRoute(world,{...view,current},[from,middle,end],1)!;
    expect(checkpoint.marker).toBe(middle);
    expect(checkpoint.route).toEqual([from,middle,{x:120,y:80}]);
    const migration=recorder(), escort=recorder(), equalColor='#ccc';
    drawMapConvoys(migration.context,[checkpoint],2,equalColor,'migration');
    drawMapConvoys(escort.context,[checkpoint],2,equalColor,'escort');
    expect(migration.dashes[0]).toEqual(MAP_CONVOY_STYLES.migration.dash.map(length=>length/2));
    expect(escort.dashes[0]).toEqual(MAP_CONVOY_STYLES.escort.dash.map(length=>length/2));
    expect(migration.dashes[0]).not.toEqual(escort.dashes[0]);
    expect(migration.filled[0].map(({kind})=>kind)).toEqual(['rect']);
    expect(escort.filled[0].map(({kind})=>kind)).toEqual(['move','line','line','close']);
    expect(migration.strokes[0]).toEqual(escort.strokes[0]);
    expect(migration.strokes[0].map(({coordinates})=>coordinates)).toEqual(checkpoint.route.map(({x,y})=>[x,y]));
  });
});

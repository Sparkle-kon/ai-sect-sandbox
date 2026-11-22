import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {buildCanvasBiomeRelief,drawCanvasBiomeRelief,type CanvasBiomeReliefPlan} from '../src/components/canvasBiomeShader';
import {createTerrainMapView} from '../src/components/terrainMapView';
import type {TerrainBiome} from '../src/types/world';

function recordingContext(){
  const operations:string[]=[];
  const record=(op:string)=>(...args:number[])=>{operations.push([op,...args].join(':'));};
  const methods={save:record('save'),restore:record('restore'),beginPath:record('begin'),rect:record('rect'),
    clip:record('clip'),translate:record('translate'),scale:record('scale'),moveTo:record('move'),lineTo:record('line'),
    closePath:record('close'),arc:record('arc'),quadraticCurveTo:record('quad'),bezierCurveTo:record('curve'),
    stroke:record('stroke'),fill:record('fill'),fillRect:record('fillRect'),
    createLinearGradient(x:number,y:number,endX:number,endY:number){
      record('gradient')(x,y,endX,endY);
      return {addColorStop:record('stop')};
    }};
  return {ctx:methods as unknown as CanvasRenderingContext2D,operations};
}
const actual=(world:ReturnType<typeof createInitialWorld>)=>createTerrainMapView(world,undefined,false);

describe('static canvas ink relief',()=>{
  it('plans all six actual brush types and exact five legacy landmark stamps without advancing the RNG or inventing a node',()=>{
    const world=createInitialWorld(30301),before=JSON.stringify(world);
    const all=buildCanvasBiomeRelief(world,actual(world));
    expect(new Set(all.tiles.map(tile=>tile.biome))).toEqual(new Set<TerrainBiome>(['灵山','毒沼','剑冢','荒漠','魔渊','坊市']));
    expect(all.landmarks.map(({siteId,motif})=>[siteId,motif])).toEqual([
      ['loc-taixu','peaks'],['loc-blood','gorge'],['loc-danxia','terraces'],['loc-tianji','stars'],['loc-vein-north','frost'],
    ]);
    const {columns,rows}=world.terrain;
    expect(all.contours!.length).toBeLessThanOrEqual(Math.ceil(columns/3)*Math.ceil(rows/3));
    expect(all.contours!.some(mark=>mark.coverage.length>1)).toBe(true);
    expect(all.contours!.every(mark=>mark.coverage.every(tile=>tile.biome===mark.biome))).toBe(true);
    expect(all.tiles.every(row=>row.x>=0&&row.y>=0&&row.x+row.width<=1000&&row.y+row.height<=600)).toBe(true);
    expect(buildCanvasBiomeRelief(world,actual(world))).toEqual(all);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('never reads uncertain biome/Qi or reconstructs an explored landmark under fog',()=>{
    const world=createInitialWorld(30301),viewer=world.cultivators[0];
    viewer.exploredTileIds=world.terrain.tiles.map(row=>row.id);
    const fog=createTerrainMapView(world,viewer,true),outside=world.terrain.tiles.filter(row=>fog.tileState(row)!=='visible');
    expect(outside.length).toBeGreaterThan(100);
    expect(outside.every(row=>fog.tileState(row)==='explored')).toBe(true);
    for(const tile of outside)Object.defineProperty(tile,'biome',{get(){throw Error('explored terrain read');}});
    for(const tile of world.terrain.tiles)Object.defineProperty(tile,'spiritQi',{get(){throw Error('current Qi read');}});
    const clipped=buildCanvasBiomeRelief(world,fog);
    expect(clipped.tiles.map(row=>row.tileId)).toEqual(world.terrain.tiles.filter(row=>fog.tileState(row)==='visible').map(row=>row.id));
    expect(clipped.landmarks.map(row=>row.siteId)).toContain('loc-taixu');
    expect(clipped.landmarks.map(row=>row.siteId)).not.toContain('loc-tianji');
    expect(clipped.landmarks.every(row=>fog.isCurrentLocation(row.siteId))).toBe(true);
    expect(clipped.contours!.every(mark=>mark.coverage.every(tile=>fog.current?.has(tile.tileId)))).toBe(true);
    for(const seam of clipped.seams!){
      const {x,y,width,height}=seam;
      expect(clipped.tiles.some(tile=>x>=tile.x&&y>=tile.y&&x+width<=tile.x+tile.width&&y+height<=tile.y+tile.height)).toBe(true);
    }
  });

  it('clips every layer to its verified cell and uses genuinely different brush traces',()=>{
    const world=createInitialWorld(30301),all=buildCanvasBiomeRelief(world,actual(world));
    const distinct=new Map<TerrainBiome,CanvasBiomeReliefPlan['tiles'][number]>();
    for(const tile of all.tiles)if(!distinct.has(tile.biome))distinct.set(tile.biome,tile);
    const fingerprints=[...distinct.values()].map(tile=>{
      const {ctx,operations}=recordingContext();
      drawCanvasBiomeRelief(ctx,{tiles:[{...tile,x:0,y:0,grain:0}],landmarks:[]});
      expect(operations.slice(0,5)).toEqual(['save','save','begin',`rect:0:0:${tile.width}:${tile.height}`,'clip']);
      expect(operations.slice(-2)).toEqual(['restore','restore']);
      return operations.join(';');
    });
    expect(new Set(fingerprints).size).toBe(6);
    const {ctx,operations}=recordingContext();
    drawCanvasBiomeRelief(ctx,all);
    expect(operations.filter(op=>op==='clip')).toHaveLength(all.contours!.length+all.landmarks.length);
    expect(operations.filter(op=>op==='save').length).toBe(operations.filter(op=>op==='restore').length);
  });
});

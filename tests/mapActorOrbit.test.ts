import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {mapActorPositions} from '../src/components/terrainMapView';

const fixture=(count:number)=>{
  const world=createInitialWorld(487),site=world.locations[0],prototype=world.cultivators[0];
  const actors=Array.from({length:count},(_,index)=>({...prototype,id:`orbit-${String(index).padStart(3,'0')}`,locationId:site.id}));
  return {world,site,actors};
};
const pairDistance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);

describe('map station shoulder slots versus authoritative route points',()=>{
  it('uses stable lateral slots, preserves source rows, stays away from vertical headings and separates ordinary parties',()=>{
    const {site,actors}=fixture(18),before=JSON.stringify(actors);
    const plotted=mapActorPositions([site],actors);
    const reversed=new Map(mapActorPositions([site],[...actors].reverse()).map(point=>[point.actor.id,point]));
    expect(plotted.map(point=>point.actor)).toEqual(actors);
    for(const [index,point] of plotted.entries()){
      expect(point.actor).toBe(actors[index]);
      expect(point).toEqual(reversed.get(point.actor.id));
      const dx=Math.abs(point.x-site.x),dy=Math.abs(point.y-site.y);
      expect(dx).toBeGreaterThan(36);
      expect(dx).toBeGreaterThan(dy*1.3);
      expect(Math.hypot(dx,dy)).toBeLessThan(95);
      for(const prior of plotted.slice(0,index))expect(pairDistance(point,prior)).toBeGreaterThan(18);
    }
    expect(JSON.stringify(actors)).toBe(before);
  });

  it('keeps dense and edge cases distinct and inside the map without dropping any actor key',()=>{
    const {site,actors}=fixture(526);
    for(const boundary of [{x:4,y:3},{x:997,y:596},{x:500,y:300}]){
      const plotted=mapActorPositions([{...site,...boundary}],actors);
      expect(plotted).toHaveLength(actors.length);
      expect(new Set(plotted.map(point=>`${point.x}/${point.y}`)).size).toBe(actors.length);
      expect(plotted.every(point=>point.x>=0&&point.y>=0&&point.x<=1000&&point.y<=600)).toBe(true);
      expect(plotted.every(point=>Math.abs(point.x-boundary.x)>Math.abs(point.y-boundary.y))).toBe(true);
    }
  });

  it('leaves the exact lone station and native same-checkpoint trail offsets intact',()=>{
    const {site,actors}=fixture(3),checkpoint={x:250,y:300};
    const trails=new Map([[actors[0].id,checkpoint],[actors[1].id,checkpoint]]);
    const actual=mapActorPositions([site],actors,trails);
    expect(actual).toEqual([
      {actor:actors[2],x:site.x,y:site.y},
      {actor:actors[0],x:260,y:300},
      {actor:actors[1],x:240,y:300},
    ]);
    expect([...trails.values()]).toEqual([checkpoint,checkpoint]);
  });
});

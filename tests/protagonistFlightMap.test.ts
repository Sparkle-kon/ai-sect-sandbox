import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {MAP_HEIGHT,MAP_WIDTH} from '../src/components/mapCamera';
import {buildProtagonistFlightEdges,drawProtagonistFlightEdges,withoutReplacedProtagonistFlightTrajectory} from '../src/components/protagonistFlightMap';
import {createTerrainMapView} from '../src/components/terrainMapView';

describe('real traversed scene route',()=>{
  it('does not connect across an unseen tile, use diagonal shortcuts, or paint future turns',()=>{
    const world=createInitialWorld();world.tick=3;
    const {columns,rows,tiles}=world.terrain;
    const point=(col:number,row:number)=>({x:(col+.5)*MAP_WIDTH/columns,y:(row+.5)*MAP_HEIGHT/rows});
    const a=point(2,2),b=point(3,2),c=point(4,2),d=point(4,3),e=point(5,3);
    const view=createTerrainMapView(world,undefined,false);
    const visible=new Set([tiles[2*columns+2].id,tiles[2*columns+4].id,tiles[3*columns+4].id,tiles[3*columns+5].id]);
    const scoped={...view,current:visible};
    const edges=buildProtagonistFlightEdges(world,scoped,[
      {tick:world.tick-1,points:[a,b,c,d]},
      {tick:world.tick,points:[a,c,e,d]},
      {tick:world.tick+1,points:[d,e]},
    ]);
    expect(edges).toEqual([
      {a:c,b:d,tick:world.tick-1,newest:false},
      {a:e,b:d,tick:world.tick,newest:true},
    ]);
  });

  it('replaces only the exact current flight pilgrimage stroke and preserves an independent ordinary pilgrimage',()=>{
    const a={x:120,y:160},b={x:160,y:160},c={x:160,y:200},d={x:200,y:200};
    const own={kind:'pilgrimage' as const,id:'pilgrimage-1',point:b,walked:[a,b]};
    const independentlyPaid={kind:'pilgrimage' as const,id:'pilgrimage-2',point:d,walked:[c,d]};
    const caravan={kind:'caravan' as const,id:own.id,point:c,walked:[c]};
    const plan={hasMotion:true,markers:[own,independentlyPaid,caravan]};
    const old={a,b,tick:2,newest:true},current={...old,tick:3};
    expect(withoutReplacedProtagonistFlightTrajectory(plan,own.id,[old],3)).toBe(plan);
    expect(withoutReplacedProtagonistFlightTrajectory(plan,own.id,[],3)).toBe(plan);
    expect(withoutReplacedProtagonistFlightTrajectory(plan,undefined,[current],3)).toBe(plan);
    const result=withoutReplacedProtagonistFlightTrajectory(plan,own.id,[current],3);
    expect(result.markers).toEqual([independentlyPaid,caravan]);
    expect(result.markers[0]).toBe(independentlyPaid);
    expect(result.hasMotion).toBe(true);
    expect(withoutReplacedProtagonistFlightTrajectory({hasMotion:true,markers:[own,caravan]},own.id,[current],3))
      .toEqual({hasMotion:false,markers:[caravan]});
  });

  it('paints each admitted section independently with no path joining disjoint edges',()=>{
    const trace:Array<[string,...number[]]>=[];
    const ctx={
      save:()=>trace.push(['save']),restore:()=>trace.push(['restore']),beginPath:()=>trace.push(['begin']),
      moveTo:(x:number,y:number)=>trace.push(['move',x,y]),lineTo:(x:number,y:number)=>trace.push(['line',x,y]),
      stroke:()=>trace.push(['stroke']),
    } as unknown as CanvasRenderingContext2D;
    drawProtagonistFlightEdges(ctx,[
      {a:{x:100,y:101},b:{x:130,y:101},tick:2,newest:true},
      {a:{x:230,y:212},b:{x:230,y:242},tick:2,newest:true},
    ],1);
    expect(trace).toEqual([['save'],['begin'],['move',100,101],['line',130,101],['move',230,212],['line',230,242],
      ['stroke'],['stroke'],['restore']]);
  });
});

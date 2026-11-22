import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {compileCanvasFlights,drawFlights} from '../src/components/mapPresentationDraw';
import {sampleFlight,type Point} from '../src/components/mapPresentationView';

const pathPoints=Array.from({length:70},(_,i)=>({x:25+i*12,y:195}));
const route={points:pathPoints,fromName:'起点',toName:'终点'};
function drawing(){
  const strokes:Array<{color:string;points:Point[]}>=[],stack:string[]=[];
  let path:Point[]=[];
  const fake={
    strokeStyle:'',
    save(){stack.push('save');},restore(){stack.push('restore');},beginPath(){path=[];},
    moveTo(x:number,y:number){path.push({x,y});},lineTo(x:number,y:number){path.push({x,y});},
    stroke(){strokes.push({color:this.strokeStyle,points:[...path]});},
  };
  return {strokes,stack,ctx:fake as unknown as CanvasRenderingContext2D};
}
const span=(points:readonly Point[])=>points.slice(1).reduce((sum,row,index)=>
  sum+Math.hypot(row.x-points[index].x,row.y-points[index].y),0);

describe('native flight wake styling',()=>{
  it('uses real sect alignment colors plus silver for no affiliation, without changing the sampled marker',()=>{
    const world=createInitialWorld(30301);
    const orthodox=world.cultivators.find(actor=>world.sects.some(sect=>sect.id===actor.sectId&&sect.alignment==='正道'))!;
    const demonic=world.cultivators.find(actor=>world.sects.some(sect=>sect.id===actor.sectId&&sect.alignment==='魔道'))!;
    const unaffiliated={...world.cultivators.find(row=>row.id!==orthodox.id&&row.id!==demonic.id)!,sectId:''};
    const positions=[orthodox,demonic,unaffiliated].map(actor=>({actor,x:route.points.at(-1)!.x,y:195}));
    const routes=new Map(positions.map(row=>[row.actor.id,route]));
    const {ctx,strokes}=drawing();
    const read=(actor:Pick<typeof orthodox,'sectId'>)=>world.sects.find(sect=>sect.id===actor.sectId)?.alignment;
    const frame=drawFlights(ctx,positions,routes,390,true,read);
    const sample=sampleFlight(pathPoints,.5).point;
    expect(frame).toEqual(positions.map(row=>({actor:row.actor,...sample})));
    expect(strokes.map(row=>row.color)).toEqual(expect.arrayContaining([
      '#99f6e4','#fef3c7','#fcd47c','#f9a8d4','#fee2e2','#d8a7fc','#f8fafc',
    ]));
  });

  it('draws only a bounded short tail and a fixed number of edge sparks, including over a long native trajectory',()=>{
    const world=createInitialWorld(44),actor=world.cultivators[0],positions=[{actor,x:route.points.at(-1)!.x,y:195}];
    const {ctx,strokes,stack}=drawing();
    const frame=drawFlights(ctx,positions,new Map([[actor.id,route]]),675,true,()=> '魔道');
    const progress=675/780,actual=sampleFlight(pathPoints,progress*progress*(3-2*progress)).point;
    expect(frame[0]).toEqual({actor,...actual});
    expect(strokes.length).toBeGreaterThan(2);
    expect(strokes.length).toBeLessThanOrEqual(6);
    expect(strokes.every(line=>line.points.length<=10&&span(line.points)<=62.0001)).toBe(true);
    expect(strokes.slice(0,3).every(line=>line.points.at(-1)?.x===actual.x)).toBe(true);
    expect(stack).toEqual(['save','restore']);
  });

  it('does not sample decorations or move hit targets in reduced motion or after the animation',()=>{
    const [actor]=createInitialWorld(518).cultivators,positions=[{actor,x:87,y:195}],routes=new Map([[actor.id,route]]);
    const {ctx,strokes}=drawing();
    const styling=vi.fn(()=> '中立' as const);
    expect(drawFlights(ctx,positions,routes,390,false,styling)).toBe(positions);
    expect(drawFlights(ctx,positions,routes,780,true,styling)).toBe(positions);
    expect(styling).not.toHaveBeenCalled();
    expect(strokes).toEqual([]);
    drawFlights(ctx,positions,routes,390,true);
    expect(strokes).toHaveLength(2);
    expect(strokes.map(row=>row.color)).toContain('#d0f7ff');
  });
  it('compiles only visible moving entries and reuses the frame without mutating earlier marker points',()=>{
    const [actor]=createInitialWorld(518).cultivators;
    const positions=Array.from({length:1200},(_,i)=>({actor:{...actor,id:`resident-${i}`},x:87,y:195}));
    const traveler=positions[813], points=[{x:20,y:30},{x:20,y:30},{x:180,y:90},{x:10,y:180},traveler];
    const routes=new Map([[traveler.actor.id,{...route,points}],['hidden-actor',route]]);
    const styling=vi.fn(()=> '中立' as const);
    const plan=compileCanvasFlights(positions,routes,styling);
    const {ctx,strokes}=drawing();
    expect(plan.movingCount).toBe(1);
    const first=plan.draw(ctx,100,true),previousMarker=first[813];
    const later=plan.draw(ctx,600,true);
    expect(later).toBe(first);
    expect(later[0]).toBe(positions[0]);
    expect(later[813]).not.toBe(previousMarker);
    for(const [elapsed,point] of [[100,previousMarker],[600,later[813]]] as const){
      const p=elapsed/780;
      expect(point).toEqual({actor:traveler.actor,...sampleFlight(points,p*p*(3-2*p)).point});
    }
    expect(plan.draw(ctx,780,true)).toBe(positions);
    expect(plan.draw(ctx,170,false)).toBe(positions);
    expect(styling).toHaveBeenCalledTimes(1);
    expect(strokes.length).toBeGreaterThan(0);
  });

});

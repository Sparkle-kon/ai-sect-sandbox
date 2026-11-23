import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {projectAtmosphere} from '../src/components/seasonalAtmosphereModel';
import {drawSeasonalAtmosphere} from '../src/components/seasonalAtmosphereRenderer';

function recorder(){
  const gradients:string[][]=[];
  const path:unknown[][]=[];
  const gradient=()=>{const stops:string[]=[];gradients.push(stops);return {
    addColorStop:(offset:number,color:string)=>{stops.push(`${offset}:${color}`);},
  };};
  const op=(name:string)=>(...args:unknown[])=>path.push([name,...args]);
  const context={
    globalAlpha:1,fillStyle:'#000',strokeStyle:'#000',lineWidth:1,
    save:op('save'),restore:op('restore'),beginPath:op('begin'),rect:op('rect'),clip:op('clip'),
    fillRect:op('box'),moveTo:op('move'),lineTo:op('line'),closePath:op('close'),fill:op('fill'),
    stroke:op('stroke'),ellipse:op('ellipse'),translate:op('translate'),rotate:op('rotate'),
    createLinearGradient:vi.fn(gradient),createRadialGradient:vi.fn(gradient),quadraticCurveTo:op('quad'),
  } as unknown as CanvasRenderingContext2D;
  return {context,path,gradients};
}

describe('weather is illustrated without an in-world hour',()=>{
  const bounds={x:0,y:0,width:640,height:360};
  it('uses four subtle lighting palettes over four actual native monthly states',()=>{
    let world=createInitialWorld(23);
    const light:string[]=[];
    for(let i=0;i<4;i++){
      const earlier=JSON.stringify(world);
      const {context,gradients}=recorder();
      const frame=projectAtmosphere(world,{surface:'stage'});
      drawSeasonalAtmosphere(context,frame,bounds,0);
      expect(gradients[1]).toHaveLength(3);
      light.push(gradients[1].join('|'));
      expect(JSON.stringify(world)).toBe(earlier);
      world=advanceWorldTick(world);
    }
    expect(new Set(light).size).toBe(4);
  });
  it('holds a historical illustration static regardless of requested animation time',()=>{
    const frame=projectAtmosphere(createInitialWorld(23),{surface:'stage',historical:true,season:'winter'});
    const a=recorder(),b=recorder();
    drawSeasonalAtmosphere(a.context,frame,bounds,0);
    drawSeasonalAtmosphere(b.context,frame,bounds,2920);
    expect(a.gradients).toEqual(b.gradients);
    expect(a.path).toEqual(b.path);
    expect(a.path.length).toBeGreaterThan(5);
  });
});

import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {drawProtectiveArrayDomes} from '../src/components/protectiveArrayDomeDraw';
import type {ProtectiveArrayDome} from '../src/components/protectiveArrayDomeView';

function canvas(){
  const ink:string[]=[],alpha:number[]=[];
  const ellipse=vi.fn(),fill=vi.fn(),fillText=vi.fn(),translate=vi.fn(),moveTo=vi.fn(),lineTo=vi.fn(),
    save=vi.fn(),restore=vi.fn(),setLineDash=vi.fn(),addColorStop=vi.fn();
  const ctx={ellipse,fill,fillText,translate,moveTo,lineTo,save,restore,setLineDash,
    beginPath:vi.fn(),closePath:vi.fn(),stroke:vi.fn(),createLinearGradient:()=>({addColorStop}),
    set strokeStyle(tone:string){ink.push(tone);},set globalAlpha(value:number){alpha.push(value);},
  } as unknown as CanvasRenderingContext2D;
  return {ctx,ink,alpha,ellipse,fill,fillText,translate,moveTo,lineTo,save,restore,setLineDash,addColorStop};
}
const world=createInitialWorld(432);
const location=world.locations[0];
const sample=(health:number,extra:Partial<ProtectiveArrayDome>={}):ProtectiveArrayDome=>({
  id:'private-dome',sectId:world.sects[0].id,location,hp:health,maxHp:100,integrity:health/100,impacted:false,besieged:false,...extra,
});

describe('actual protective array dome ink',()=>{
  it('grounds transparent intact dome at actual native HQ and scales only CSS footprint',()=>{
    const {ctx,translate,ellipse,fill,fillText,save,restore,addColorStop}=canvas();
    drawProtectiveArrayDomes(ctx,[sample(100)],220,true,2);
    expect(translate).toHaveBeenCalledWith(location.x,location.y);
    expect(ellipse).toHaveBeenCalledWith(0,0,58,48,0,Math.PI,2*Math.PI);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(addColorStop.mock.calls[0][1]).toMatch(/rgba\(125,211,252,/);
    expect(fillText).not.toHaveBeenCalled();
    expect(save.mock.calls.length).toBe(restore.mock.calls.length);
  });
  it('preserves distinct gaps in a weakened dome and leaves only dashed remnants at zero',()=>{
    const weakened=canvas(),empty=canvas();
    drawProtectiveArrayDomes(weakened.ctx,[sample(30)],0,false,1);
    expect(weakened.fill).toHaveBeenCalledTimes(2);
    expect(weakened.ellipse).not.toHaveBeenCalledWith(0,0,29,24,0,Math.PI,2*Math.PI);
    expect(weakened.ink).toContain('#a6b9d1');
    drawProtectiveArrayDomes(empty.ctx,[sample(0)],0,false,1);
    expect(empty.fill).not.toHaveBeenCalled();
    expect(empty.ellipse).toHaveBeenCalledTimes(2);
    expect(empty.setLineDash).toHaveBeenCalledWith([2.1,2.9]);
  });
  it('shows one current impact only from exact data, never for mere siege, and stays static under reduced motion',()=>{
    const display=(impacted:boolean,elapsed:number,animate=true)=>{
      const out=canvas();
      drawProtectiveArrayDomes(out.ctx,[sample(65,{besieged:true,impacted})],elapsed,animate,1);
      return out;
    };
    expect(display(false,350).ink).not.toContain('#ffe0aa');
    expect(display(true,350).ink).toContain('#ffe0aa');
    expect(display(true,1200).ink).not.toContain('#ffe0aa');
    expect(display(true,1500,false).ink).toContain('#ffe0aa');
    expect(display(true,1500,false).alpha).toEqual(display(true,2500,false).alpha);
  });
  it('does not draw on invalid fixture coordinates or invalid durability',()=>{
    const {ctx,ellipse,translate}=canvas();
    drawProtectiveArrayDomes(ctx,[sample(110),sample(65,{location:{...location,x:NaN}}),sample(0,{maxHp:0})],0,true,1);
    expect(ellipse).not.toHaveBeenCalled();expect(translate).not.toHaveBeenCalled();
  });
});

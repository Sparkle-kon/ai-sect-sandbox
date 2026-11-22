import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {drawMapCombatVfx} from '../src/components/mapCombatVfxDraw';
import type {MapCombatVfxPlan} from '../src/components/mapCombatVfxView';

function canvas(){
  const fillText=vi.fn<(text:string,x:number,y:number)=>void>(),strokeText=vi.fn<(text:string,x:number,y:number)=>void>();
  const ellipse=vi.fn(),quadraticCurveTo=vi.fn(),setLineDash=vi.fn(),moveTo=vi.fn(),lineTo=vi.fn(),save=vi.fn(),restore=vi.fn();
  const ink:string[]=[];
  const ctx={save,restore,translate:vi.fn(),setLineDash,moveTo,lineTo,ellipse,quadraticCurveTo,
    beginPath:vi.fn(),closePath:vi.fn(),fill:vi.fn(),stroke:vi.fn(),fillText,strokeText,measureText:vi.fn(()=>({width:50})),
    set strokeStyle(color:string){ink.push(color);}} as unknown as CanvasRenderingContext2D;
  return {ctx,fillText,strokeText,ellipse,quadraticCurveTo,setLineDash,moveTo,lineTo,save,restore,ink};
}
const world=createInitialWorld(822);
const location={...world.locations[0],x:417,y:285};
const blank=():MapCombatVfxPlan=>({effects:[],storms:[],sieges:[],hasTransient:false});
type Effect=MapCombatVfxPlan['effects'][number];
const effect=(kind:Effect['kind'],fields:Partial<Effect>={}):Effect=>({
  kind,id:`only-${kind}`,tick:world.tick,locationId:location.id,actorIds:[],location,...fields,
});

describe('bounded native fight and tribulation marks',()=>{
  it('paints distinct opposed sword ribbons but never makes a damage number without exact amount',()=>{
    const {ctx,quadraticCurveTo,fillText,ink}=canvas();
    drawMapCombatVfx(ctx,{...blank(),effects:[effect('clash'),effect('damage',{text:'−9999 HP'})],hasTransient:true},280,true,1);
    expect(quadraticCurveTo).toHaveBeenCalledTimes(2);
    expect(ink).toContain('#88ece6');
    expect(ink).toContain('#fcb9d3');
    expect(fillText).not.toHaveBeenCalled();
  });

  it('distinguishes vortex, a single native bolt, and siege perimeter from actual impact',()=>{
    const test={...blank(),storms:[{id:'cloud',location,wave:1,totalWaves:9}],
      sieges:[{id:'siege',location,impact:false}],hasTransient:false};
    const first=canvas();
    drawMapCombatVfx(first.ctx,test,0,false,1);
    expect(first.ellipse).toHaveBeenCalledTimes(5);
    expect(first.lineTo).not.toHaveBeenCalled();
    expect(first.setLineDash).toHaveBeenCalledWith([4,3]);
    const second=canvas();
    drawMapCombatVfx(second.ctx,{...test,effects:[effect('lightning')],
      sieges:[{id:'siege',location,impact:true}],hasTransient:true},0,true,1);
    expect(second.ellipse).toHaveBeenCalledTimes(6);
    expect(second.ink).toContain('#f7e6ff');
    expect(second.lineTo).toHaveBeenCalledTimes(11); // One broken path + one branch + four impact ticks.
    expect(second.fillText).not.toHaveBeenCalled();
  });

  it('draws lotus only for confirmed major advance and settles late frames/static reduced-motion deliberately',()=>{
    const plan={...blank(),effects:[effect('breakthrough',{majorAdvance:true}),effect('breakthrough')],hasTransient:true};
    const lit=canvas(),late=canvas(),reduced=canvas();
    drawMapCombatVfx(lit.ctx,plan,550,true,1);
    drawMapCombatVfx(late.ctx,plan,1200,true,1);
    drawMapCombatVfx(reduced.ctx,plan,1200,false,1,6);
    expect(lit.quadraticCurveTo).toHaveBeenCalledTimes(10);
    expect(late.quadraticCurveTo).not.toHaveBeenCalled();
    expect(reduced.quadraticCurveTo).toHaveBeenCalledTimes(10);
    expect(reduced.save.mock.calls.length).toBe(reduced.restore.mock.calls.length);
  });

  it('uses only actual positive damage, dark outlines and bounded slots at correct zoom',()=>{
    const plan={...blank(),effects:[-1,123,45,1,5].map((amount,index)=>effect('damage',{amount,id:`hit-${index}`})),hasTransient:true};
    const {ctx,fillText,strokeText}=canvas();
    drawMapCombatVfx(ctx,plan,350,true,.5,0,{zoom:2,x:-833,y:-230});
    expect(fillText.mock.calls.map(([text])=>text)).toEqual(['−123 HP','−45 HP','−1 HP']);
    expect(strokeText.mock.calls).toEqual(fillText.mock.calls);
    // Source is near left edge; caption moves within the viewport rather than crossing that edge.
    expect(fillText.mock.calls[0][1]).toBeGreaterThan(0);
  });
});

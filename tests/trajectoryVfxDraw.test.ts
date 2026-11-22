import {describe,expect,it,vi} from 'vitest';
import {drawMapTrajectoryVfx} from '../src/components/trajectoryVfxDraw';
import type {MapTravelTrajectoryMarker} from '../src/components/mapTravelTrajectory';
import type {MapFlyingSword} from '../src/components/mapFlyingSwordView';

function canvas(){
  const fillRect=vi.fn<(x:number,y:number,width:number,height:number)=>void>();
  const translate=vi.fn<(x:number,y:number)=>void>();
  const arc=vi.fn();
  const fillText=vi.fn(),lineTo=vi.fn(),save=vi.fn(),restore=vi.fn();
  const ctx={save,restore,translate,arc,fillText,lineTo,fillRect,
    setLineDash:vi.fn(),moveTo:vi.fn(),beginPath:vi.fn(),closePath:vi.fn(),
    fill:vi.fn(),stroke:vi.fn(),strokeRect:vi.fn(),rotate:vi.fn()} as unknown as CanvasRenderingContext2D;
  return {ctx,translate,fillRect,arc,fillText,lineTo,save,restore};
}
const letter:MapFlyingSword={id:'private-packet',points:[{x:10,y:40},{x:40,y:10},{x:70,y:40}]};
const caravan:MapTravelTrajectoryMarker={id:'private-cargo',kind:'caravan',walked:[{x:10,y:70},{x:50,y:70}],point:{x:50,y:70}};
const pilgrim:MapTravelTrajectoryMarker={id:'named-walker',kind:'pilgrimage',walked:[{x:10,y:90},{x:30,y:90}],point:{x:30,y:90}};

describe('drawing visible sword, caravan and pilgrimage trajectory stamps',()=>{
  it('samples only the approved arc and paints the sealed letter at the exact final point without raw clues',()=>{
    const during=canvas();
    drawMapTrajectoryVfx(during.ctx,[letter],[],390,true,1);
    expect(during.translate).toHaveBeenCalledWith(40,10);
    expect(during.lineTo).toHaveBeenCalledWith(40,10);
    expect(during.fillText).not.toHaveBeenCalled();
    expect(during.arc).not.toHaveBeenCalled();
    const settled=canvas();
    drawMapTrajectoryVfx(settled.ctx,[letter],[],800,true,1);
    expect(settled.fillRect).toHaveBeenCalledWith(64,36,12,8);
    expect(settled.arc).toHaveBeenCalledWith(70,40,1.3,0,Math.PI*2);
    expect(settled.translate).not.toHaveBeenCalled();
  });

  it('moves actual cart and pennant only over the authentic segment, then keeps each at its native checkpoint',()=>{
    const during=canvas();
    drawMapTrajectoryVfx(during.ctx,[],[caravan,pilgrim],330,true,1);
    expect(during.fillRect).toHaveBeenCalledWith(24,66,11,6);
    expect(during.arc).toHaveBeenCalledWith(27,73,2.15,0,Math.PI*2);
    expect(during.arc).toHaveBeenCalledWith(33,73,2.15,0,Math.PI*2);
    expect(during.arc).toHaveBeenCalledWith(21,89.8,1.3,0,Math.PI*2);
    const stopped=canvas();
    drawMapTrajectoryVfx(stopped.ctx,[],[caravan,pilgrim],660,true,1);
    expect(stopped.fillRect).toHaveBeenCalledWith(44,66,11,6);
    expect(stopped.arc).toHaveBeenCalledWith(31,89.8,1.3,0,Math.PI*2);
    expect(stopped.save.mock.calls.length).toBe(stopped.restore.mock.calls.length);
  });

  it('keeps static reduced motion exact and refuses a wrong/stale stop to displace a marker',()=>{
    const staticDraw=canvas();
    drawMapTrajectoryVfx(staticDraw.ctx,[letter],[caravan],0,false,2);
    expect(staticDraw.translate).not.toHaveBeenCalled();
    expect(staticDraw.fillRect).toHaveBeenCalledWith(58,32,24,16);
    expect(staticDraw.fillRect).toHaveBeenCalledWith(38,62,22,12);
    const stale=canvas();
    drawMapTrajectoryVfx(stale.ctx,[{...letter,points:[{x:NaN,y:40}]}],[
      {...caravan,walked:[{x:10,y:70},{x:71,y:56}]},{...pilgrim,walked:[]},
    ],100,true,1);
    expect(stale.translate).not.toHaveBeenCalled();
    expect(stale.fillRect.mock.calls).toEqual([[44,66,11,6]]);
    expect(stale.arc).toHaveBeenCalledWith(31,89.8,1.3,0,Math.PI*2);
  });
});

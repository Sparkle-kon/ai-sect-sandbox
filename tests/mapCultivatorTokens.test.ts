import {describe,expect,it,vi} from 'vitest';
import {drawMapCultivatorToken} from '../src/components/mapCultivatorTokens';

function recorder(){
  const fills:string[]=[],strokes:string[]=[];
  const arc=vi.fn(),ellipse=vi.fn(),translate=vi.fn(),moveTo=vi.fn(),lineTo=vi.fn(),quadraticCurveTo=vi.fn(),save=vi.fn(),restore=vi.fn(),
    fillText=vi.fn(),fill=vi.fn(),stroke=vi.fn(),beginPath=vi.fn(),closePath=vi.fn();
  const ctx={arc,ellipse,translate,moveTo,lineTo,quadraticCurveTo,save,restore,fillText,fill,stroke,beginPath,closePath,
    set fillStyle(value:string){fills.push(value);},set strokeStyle(value:string){strokes.push(value);},
  } as unknown as CanvasRenderingContext2D;
  return {ctx,fills,strokes,arc,ellipse,translate,moveTo,lineTo,quadraticCurveTo,save,restore,fillText};
}

describe('map jade cultivator tokens',()=>{
  it('paints a faction edge, engraved inner ring and fixed gloss without enlarging radius or introducing text',()=>{
    const out=recorder();
    drawMapCultivatorToken(out.ctx,52,61,'金丹','#f43f5e');
    expect(out.fills).toEqual(['#f43f5e','#403128','#fff3d2']);
    expect(out.strokes).toContain('#f5d692');
    expect(out.arc).toHaveBeenCalledWith(52,61,11.2,0,Math.PI*2);
    expect(out.arc.mock.calls.every(([, ,r])=>r<12)).toBe(true);
    expect(out.ellipse).toHaveBeenCalledWith(48.65,56.3,1.9,.75,-.55,0,Math.PI*2);
    expect(out.fillText).not.toHaveBeenCalled();
    expect(out.translate).not.toHaveBeenCalled();
    expect(out.save).toHaveBeenCalledTimes(1);
    expect(out.restore).toHaveBeenCalledTimes(1);
  });
  it('uses canonical realm to vary the texture and rim while leaving faction and body unchanged',()=>{
    const simple=recorder(),full=recorder();
    drawMapCultivatorToken(simple.ctx,4,6,'练气','#34d399');
    drawMapCultivatorToken(full.ctx,4,6,'渡劫','#34d399');
    expect(simple.fills[0]).toBe(full.fills[0]);
    expect(simple.fills[1]).not.toBe(full.fills[1]);
    expect(simple.arc.mock.calls[0]).toEqual(full.arc.mock.calls[0]);
    expect(simple.quadraticCurveTo).toHaveBeenCalledTimes(2);
    expect(full.quadraticCurveTo).not.toHaveBeenCalled();
    expect(full.arc.mock.calls).toHaveLength(simple.arc.mock.calls.length+1);
    expect(full.lineTo.mock.calls.length).toBeGreaterThan(simple.lineTo.mock.calls.length);
  });
  it('does not touch Canvas for invalid marker coordinates',()=>{
    const out=recorder();
    drawMapCultivatorToken(out.ctx,NaN,2,'筑基','#38bdf8');
    expect(out.save).not.toHaveBeenCalled();
    expect(out.arc).not.toHaveBeenCalled();
  });
});

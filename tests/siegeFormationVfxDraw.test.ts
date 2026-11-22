import { describe, expect, it, vi } from 'vitest';
import { drawSiegeFormationVfx, SIEGE_FORMATION_LIFETIME_MS } from '../src/components/siegeFormationVfxDraw';
import type { SiegeFormationFrame } from '../src/components/siegeFormationVfxPlan';

function canvas() {
  const alpha:number[] = [], inks:string[] = [];
  const ellipse = vi.fn(), moveTo = vi.fn(), lineTo = vi.fn(), fill = vi.fn(), stroke = vi.fn(), fillText = vi.fn();
  const save = vi.fn(), restore = vi.fn(), setLineDash = vi.fn();
  const ctx = {
    ellipse,moveTo,lineTo,fill,stroke,fillText,save,restore,setLineDash,beginPath:vi.fn(),closePath:vi.fn(),
    set globalAlpha(a:number){alpha.push(a);},set strokeStyle(ink:string){inks.push(ink);},set fillStyle(ink:string){inks.push(ink);},
  } as unknown as CanvasRenderingContext2D;
  return {ctx,alpha,inks,ellipse,moveTo,lineTo,fill,stroke,fillText,save,restore,setLineDash};
}

const eye:SiegeFormationFrame = {sourceId:'withheld-identity',center:{x:200,y:230},breaths:[],hits:[]};
const frame:SiegeFormationFrame = {
  ...eye,breaths:[{x:185,y:223}],guard:{x:215,y:221},
  hits:[{from:{x:175,y:215},to:{x:223,y:247},kind:'vanguard'},
    {from:{x:190,y:247},to:{x:208,y:209},kind:'signature'}],
};

describe('native siege formation paint', () => {
  it('does not paint any attack or breath when only the eye is opened', () => {
    const out=canvas();
    drawSiegeFormationVfx(out.ctx,[eye],300,true,2);
    expect(out.ellipse).toHaveBeenCalledWith(200,230,44,22,0,0,Math.PI*2);
    expect(out.ellipse).toHaveBeenCalledTimes(3);
    expect(out.inks).toContain('#d2a668');
    expect(out.moveTo).not.toHaveBeenCalled();
    expect(out.fill).not.toHaveBeenCalled();
    expect(out.fillText).not.toHaveBeenCalled();
    expect(out.save).toHaveBeenCalledTimes(1);
    expect(out.restore).toHaveBeenCalledTimes(1);
  });

  it('keeps breaths and guard on actual supplied bodies, and both hit directions on their true endpoints', () => {
    const out=canvas();
    drawSiegeFormationVfx(out.ctx,[frame],0,false,1);
    expect(out.ellipse.mock.calls.filter(([x,y]) => x===185 && y===223)).toHaveLength(2);
    expect(out.ellipse.mock.calls.filter(([x,y]) => x===215 && y===221)).toHaveLength(1);
    expect(out.moveTo).toHaveBeenCalledWith(175,215);
    expect(out.moveTo).toHaveBeenCalledWith(190,247);
    expect(out.lineTo).toHaveBeenCalledWith(223,247);
    expect(out.lineTo).toHaveBeenCalledWith(208,209);
    expect(out.inks).toContain('#c19169');
    expect(out.inks).toContain('#f1ca89');
    expect(out.fill).toHaveBeenCalledTimes(2);
    expect(out.fillText).not.toHaveBeenCalled();
  });

  it('is stationary across ages under reduced motion and empty after the active lifetime', () => {
    const first=canvas(),next=canvas(),late=canvas(),moving=canvas();
    drawSiegeFormationVfx(first.ctx,[frame],0,false,.75);
    drawSiegeFormationVfx(next.ctx,[frame],9000,false,.75);
    drawSiegeFormationVfx(late.ctx,[frame],SIEGE_FORMATION_LIFETIME_MS,true,.75);
    drawSiegeFormationVfx(moving.ctx,[frame],SIEGE_FORMATION_LIFETIME_MS/2,true,.75);
    expect(next.ellipse.mock.calls).toEqual(first.ellipse.mock.calls);
    expect(next.moveTo.mock.calls).toEqual(first.moveTo.mock.calls);
    expect(next.alpha).toEqual(first.alpha);
    expect(late.save).not.toHaveBeenCalled();
    expect(late.ellipse).not.toHaveBeenCalled();
    expect(moving.alpha[0]).toBeLessThan(first.alpha[0]);
    expect(moving.moveTo).toHaveBeenCalledWith(175,215);
  });

  it('skips nonfinite native marks and restores the existing map context even on a paint error', () => {
    const out=canvas(),broken=canvas(),missing=canvas();
    drawSiegeFormationVfx(out.ctx,[{
      ...eye,breaths:[{x:NaN,y:222}],guard:{x:210,y:Infinity},
      hits:[{from:{x:200,y:230},to:{x:NaN,y:221},kind:'signature'}],
    }],0,true,1);
    expect(out.ellipse).toHaveBeenCalledTimes(3);
    expect(out.fill).not.toHaveBeenCalled();
    drawSiegeFormationVfx(missing.ctx,[],0,true,1);
    expect(missing.save).not.toHaveBeenCalled();
    broken.ellipse.mockImplementation(() => { throw Error('canvas'); });
    expect(() => drawSiegeFormationVfx(broken.ctx,[frame],0,false,1)).toThrow('canvas');
    expect(broken.restore).toHaveBeenCalledTimes(1);
  });
});

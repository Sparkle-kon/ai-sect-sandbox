import {describe,expect,it,vi} from 'vitest';
import {drawCultivatorRealmAura} from '../src/components/cultivatorRealmAuraDraw';

const canvas=()=>{
  const ops:string[]=[];
  const context={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),stroke:vi.fn(),strokeStyle:'',
    lineWidth:0,globalAlpha:0,beginPath:()=>ops.push('path'),ellipse:(...parts:number[])=>ops.push('oval '+parts.join(',')),
    moveTo:(...parts:number[])=>ops.push('move '+parts.join(',')),lineTo:(...parts:number[])=>ops.push('line '+parts.join(',')),
    quadraticCurveTo:(...parts:number[])=>ops.push('curve '+parts.join(','))};
  return {ops,context,ctx:context as unknown as CanvasRenderingContext2D};
};

describe('decorative realm effects in the existing Canvas pass',()=>{
  it('keeps each typed realm silhouette distinct and restores Canvas state',()=>{
    const suites=(['gold-wheel','dharma','blood-moon'] as const).map((kind,index)=>{
      const frame=canvas();
      drawCultivatorRealmAura(frame.ctx,32,45,{kind,color:['#ffce75','#b7edff','#ed7794'][index]},.3,false);
      expect(frame.context.translate).toHaveBeenCalledWith(32,45);
      expect(frame.context.save).toHaveBeenCalledOnce();
      expect(frame.context.restore).toHaveBeenCalledOnce();
      return frame.ops.join(';');
    });
    expect(new Set(suites).size).toBe(3);
  });
  it('uses the same static outline regardless of time when reduced motion is active',()=>{
    const a=canvas(),b=canvas(),c=canvas(),halo={kind:'dharma' as const,color:'#b7edff'};
    drawCultivatorRealmAura(a.ctx,0,0,halo,9,false);
    drawCultivatorRealmAura(b.ctx,0,0,halo,100,false);
    drawCultivatorRealmAura(c.ctx,0,0,halo,100,true);
    expect(a.ops).toEqual(b.ops);
    expect(c.ops).not.toEqual(b.ops);
  });
});

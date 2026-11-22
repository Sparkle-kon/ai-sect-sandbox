import {describe,expect,it,vi} from 'vitest';
import {drawMapActorBadges,MAP_ACTOR_BUBBLE_FONT} from '../src/components/mapActorBadgeDraw';

type Layout=Parameters<typeof drawMapActorBadges>[1];
const badges=[
  {actorId:'private-a',kind:'critical',x:43,y:51},
  {actorId:'private-b',kind:'ready',x:63,y:61},
  {actorId:'private-c',kind:'heart-demon',x:83,y:71},
] as const;
const bubbles=[{actorId:'private-b',x:22,y:14,width:104,height:42,
  lines:['此一剑，且问来路。','绝不向雾中拔剑。'],anchor:{x:63,y:68}}];
const layout={badges:[...badges],bubbles} as Layout;
function canvas(){
  const fillStyle:string[]=[],font:string[]=[],alpha:number[]=[];
  const fillText=vi.fn<(text:string,x:number,y:number,maxWidth?:number)=>void>();
  const save=vi.fn(),restore=vi.fn(),arc=vi.fn(),translate=vi.fn(),bezierCurveTo=vi.fn();
  const ctx={save,restore,arc,translate,bezierCurveTo,fillText,
    setLineDash:vi.fn(),beginPath:vi.fn(),lineTo:vi.fn(),moveTo:vi.fn(),quadraticCurveTo:vi.fn(),closePath:vi.fn(),fill:vi.fn(),stroke:vi.fn(),
    set fillStyle(value:string){fillStyle.push(value);},
    set globalAlpha(value:number){alpha.push(value);},
    set font(value:string){font.push(value);},
  } as unknown as CanvasRenderingContext2D;
  return {ctx,save,restore,arc,translate,bezierCurveTo,fillText,fillStyle,font,alpha};
}

describe('readable actor badge ink and exact speech overlays',()=>{
  it('preserves CSS-space anchors and uses distinct drop/orb/crescent pen paths',()=>{
    const {ctx,translate,arc,bezierCurveTo,fillStyle,fillText}=canvas();
    drawMapActorBadges(ctx,{badges:layout.badges,bubbles:[]},400,true,1);
    expect(translate.mock.calls).toEqual([[43,51],[63,61],[83,71]]);
    expect(bezierCurveTo).toHaveBeenCalledTimes(6);
    expect(arc).toHaveBeenCalledWith(0,0,4.4,0,2*Math.PI);
    expect(arc).toHaveBeenCalledWith(3.3,-.8,1.45,0,2*Math.PI);
    expect(fillStyle).toEqual(expect.arrayContaining(['#f4718b','#ffd57a','#26163f']));
    expect(fillText).not.toHaveBeenCalled();
  });
  it('draws only proven quote lines with the 12px layout font and no leaking identities or extra text',()=>{
    const {ctx,fillText,font,save,restore}=canvas();
    drawMapActorBadges(ctx,layout,350,true);
    expect(font).toEqual([MAP_ACTOR_BUBBLE_FONT]);
    expect(fillText.mock.calls).toEqual([['此一剑，且问来路。',74,27.5,94],['绝不向雾中拔剑。',74,42.5,94]]);
    expect(save.mock.calls.length).toBe(restore.mock.calls.length);
  });
  it('softly expires the bubble but retains static qualified badges, and reduced motion remains static',()=>{
    const fading=canvas(),settled=canvas(),quiet=canvas(),later=canvas();
    drawMapActorBadges(fading.ctx,layout,1040,true,2);
    expect(fading.alpha).toContain(.5);
    drawMapActorBadges(settled.ctx,layout,1200,true,5);
    expect(settled.fillText).not.toHaveBeenCalled();
    expect(settled.translate).toHaveBeenCalledTimes(3);
    drawMapActorBadges(quiet.ctx,layout,1500,false,3);
    drawMapActorBadges(later.ctx,layout,3000,false,99);
    expect(quiet.fillText).toHaveBeenCalledTimes(2);
    expect(quiet.fillText.mock.calls).toEqual(later.fillText.mock.calls);
    expect(quiet.alpha).toEqual(later.alpha);
  });
});

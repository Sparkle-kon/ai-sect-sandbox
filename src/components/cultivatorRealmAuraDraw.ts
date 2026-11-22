import type {CultivatorPortraitSpec} from './cultivatorPortraitModel';

type RealmHalo=NonNullable<CultivatorPortraitSpec['halo']>;

/** Decoration behind the already-authorized, already-hit-tested actor marker. */
export function drawCultivatorRealmAura(ctx:CanvasRenderingContext2D,x:number,y:number,halo:RealmHalo,phase:number,animate:boolean):void{
  const breath=animate&&Number.isFinite(phase)?(1+Math.sin(phase*2.4))*.5:0;
  ctx.save();
  ctx.translate(x,y);
  ctx.strokeStyle=halo.color;
  ctx.lineWidth=1.35;
  ctx.globalAlpha=.55+breath*.16;
  ctx.beginPath();
  if(halo.kind==='gold-wheel'){
    ctx.ellipse(0,-2,17+breath,14+breath,0,0,Math.PI*2);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3,x1=Math.cos(a)*19,y1=Math.sin(a)*16-2;
      ctx.moveTo(x1,y1);ctx.lineTo(x1*1.12,(y1+2)*1.12-2);
    }
  }else if(halo.kind==='dharma'){
    ctx.moveTo(-16,5);ctx.quadraticCurveTo(-20,-12,0,-23-breath);
    ctx.quadraticCurveTo(20,-12,16,5);
    ctx.moveTo(-11,9);ctx.quadraticCurveTo(0,13,11,9);
  }else{
    ctx.ellipse(0,-3,17+breath,15+breath,0,-Math.PI*.26,Math.PI*1.5);
    ctx.moveTo(3,-19);ctx.quadraticCurveTo(15,-9,12,4);
  }
  ctx.stroke();
  ctx.restore();
}

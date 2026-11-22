import type {CultivationRealm} from '../types/world';

type Grain='plain'|'seal'|'double'|'crown';
const ink:Readonly<Record<CultivationRealm,{stone:string;rim:string;grain:Grain}>>={
  练气:{stone:'#162e33',rim:'#afd5ca',grain:'plain'},
  筑基:{stone:'#193d3b',rim:'#bde1cb',grain:'seal'},
  金丹:{stone:'#403128',rim:'#f5d692',grain:'seal'},
  元婴:{stone:'#302d49',rim:'#d5c8fb',grain:'double'},
  化神:{stone:'#233747',rim:'#b9e4f0',grain:'double'},
  炼虚:{stone:'#35304a',rim:'#dfd0f7',grain:'double'},
  合体:{stone:'#3d332e',rim:'#efd6ac',grain:'crown'},
  大乘:{stone:'#3b3730',rim:'#ffedc5',grain:'crown'},
  渡劫:{stone:'#343449',rim:'#e9e0ff',grain:'crown'},
};
const twoPi=Math.PI*2;

/** The single visible body only. Hit radius, actor selection, route motion and status aura remain external. */
export function drawMapCultivatorToken(ctx:CanvasRenderingContext2D,x:number,y:number,realm:CultivationRealm,factionColor:string):void{
  const style=ink[realm];
  if(!style||!Number.isFinite(x)||!Number.isFinite(y))return;
  ctx.save();
  ctx.strokeStyle='#071019';
  ctx.lineWidth=1.6;
  ctx.fillStyle=factionColor||'#38bdf8';
  ctx.beginPath();
  ctx.arc(x,y,11.2,0,twoPi);
  ctx.fill();
  ctx.stroke();

  // The old faction color remains a full visible band around the carved jade insert.
  ctx.fillStyle=style.stone;
  ctx.strokeStyle=style.rim;
  ctx.lineWidth=.65;
  ctx.beginPath();
  ctx.arc(x,y,8,0,twoPi);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle=style.rim;
  ctx.lineWidth=.7;
  ctx.lineCap='round';
  ctx.beginPath();
  // Short upper-left polished edge; never extends beyond the original token footprint.
  ctx.arc(x,y,9.7,Math.PI*1.03,Math.PI*1.53);
  if(style.grain==='double'||style.grain==='crown'){
    ctx.moveTo(x+5.65,y);
    ctx.arc(x,y,5.65,0,twoPi);
  }
  ctx.stroke();
  ctx.beginPath();
  if(style.grain==='plain'){
    ctx.moveTo(x-2.65,y+.65);
    ctx.quadraticCurveTo(x-.8,y-1.7,x+2.65,y-.75);
    ctx.moveTo(x-1.45,y+2.05);
    ctx.quadraticCurveTo(x+.15,y+.7,x+1.8,y+.7);
  }else{
    ctx.moveTo(x,y-3.2);
    ctx.lineTo(x+3.35,y);
    ctx.lineTo(x,y+3.2);
    ctx.lineTo(x-3.35,y);
    ctx.closePath();
    if(style.grain==='crown'){
      ctx.moveTo(x,y-6.9);ctx.lineTo(x,y-5.85);
      ctx.moveTo(x,y+5.85);ctx.lineTo(x,y+6.9);
      ctx.moveTo(x-6.9,y);ctx.lineTo(x-5.85,y);
      ctx.moveTo(x+5.85,y);ctx.lineTo(x+6.9,y);
    }
  }
  ctx.stroke();

  ctx.fillStyle='#fff3d2';
  ctx.beginPath();
  ctx.ellipse(x-3.35,y-4.7,1.9,.75,-.55,0,twoPi);
  ctx.fill();
  ctx.restore();
}

import type {planMapActorBadgeLayout} from './mapActorBadgeLayout';

type Layout=ReturnType<typeof planMapActorBadgeLayout>;
type Badge=Layout['badges'][number];
type Bubble=Layout['bubbles'][number];
const tau=Math.PI*2;
const BADGE_OUTLINE='#111827';
const QUOTE_MS=1200;
export const MAP_ACTOR_BUBBLE_FONT='500 12px "Noto Serif SC", "Songti SC", SimSun, serif';

function badge(ctx:CanvasRenderingContext2D,row:Badge,phase:number){
  const {kind,x,y}=row;
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  ctx.save();ctx.translate(x,y);
  const accent=kind==='critical'?'#f16b83':kind==='ready'?'#f5ce75':'#cfb1f6';
  ctx.globalAlpha=.18+.035*Math.sin(phase);
  ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,0,7,0,tau);ctx.fill();
  ctx.globalAlpha=1;ctx.lineWidth=1.1;ctx.strokeStyle=BADGE_OUTLINE;
  ctx.beginPath();
  if(kind==='critical'){
    ctx.moveTo(0,-5.6);ctx.bezierCurveTo(-1.8,-2.8,-4.6,-.4,-4.6,2.1);
    ctx.bezierCurveTo(-4.6,7.1,4.6,7.1,4.6,2.1);
    ctx.bezierCurveTo(4.6,-.4,1.8,-2.8,0,-5.6);ctx.closePath();
    ctx.fillStyle='#f4718b';ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(-2.3,.6);ctx.quadraticCurveTo(-3.3,3.1,-.9,3.9);
    ctx.strokeStyle='#ffe3e8';ctx.lineWidth=1;ctx.stroke();
  }else if(kind==='ready'){
    ctx.arc(0,0,4.4,0,tau);
    ctx.fillStyle='#ffd57a';ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,-4);
    ctx.moveTo(-6,0);ctx.lineTo(-4,0);ctx.moveTo(4,0);ctx.lineTo(6,0);
    ctx.moveTo(0,4);ctx.lineTo(0,6);ctx.strokeStyle='#fff0b8';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(-.9,-.9,1.3,0,tau);ctx.fillStyle='#fff4c3';ctx.fill();
  }else{
    ctx.moveTo(2.4,-4.9);
    ctx.bezierCurveTo(-.5,-6.5,-5.7,-3.8,-5.2,.8);
    ctx.bezierCurveTo(-4.7,4.4,-.8,6.7,3.8,4);
    ctx.bezierCurveTo(-.6,4.4,-2.9,.1,2.4,-4.9);
    ctx.closePath();ctx.fillStyle='#26163f';ctx.fill();
    ctx.strokeStyle='#e1c6ff';ctx.lineWidth=1.15;ctx.stroke();
    ctx.beginPath();ctx.arc(3.3,-.8,1.45,0,tau);ctx.fillStyle='#d9b4ff';ctx.fill();
  }
  ctx.restore();
}

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius:number) {
  ctx.beginPath();ctx.moveTo(x+radius,y);ctx.lineTo(x+width-radius,y);
  ctx.quadraticCurveTo(x+width,y,x+width,y+radius);ctx.lineTo(x+width,y+height-radius);
  ctx.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);ctx.lineTo(x+radius,y+height);
  ctx.quadraticCurveTo(x,y+height,x,y+height-radius);ctx.lineTo(x,y+radius);
  ctx.quadraticCurveTo(x,y,x+radius,y);ctx.closePath();
}

function bubble(ctx:CanvasRenderingContext2D,row:Bubble,opacity:number){
  const {x,y,width,height,lines,anchor}=row;
  if(![x,y,width,height,anchor.x,anchor.y].every(Number.isFinite)||width<18||height<18||lines.length===0)return;
  const bg='#131724',stroke='#d3b77d',radius=6;
  ctx.save();ctx.globalAlpha=opacity;
  const useTop=anchor.y<y+height*.5;
  const atX=Math.min(x+width-radius-5,Math.max(x+radius+5,anchor.x));
  const edge=useTop?y:y+height;
  const nose=useTop?Math.max(y-4,Math.min(y,anchor.y)):Math.min(y+height+4,Math.max(y+height,anchor.y));
  if(width>=28&&nose!==edge){
    ctx.beginPath();ctx.moveTo(atX-4,edge);ctx.lineTo(atX,nose);ctx.lineTo(atX+4,edge);ctx.closePath();
    ctx.fillStyle=bg;ctx.fill();
    ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();
  }
  rounded(ctx,x,y,width,height,radius);
  ctx.fillStyle=bg;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();
  ctx.font=MAP_ACTOR_BUBBLE_FONT;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#fff1d3';
  const permitted=lines.slice(0,2);
  const spacing=15;
  for(let i=0;i<permitted.length;i++){
    const line=permitted[i];
    if(line)ctx.fillText(line,x+width/2,y+height/2+(i-(permitted.length-1)/2)*spacing,width-10);
  }
  ctx.restore();
}

/** All inputs are preprojected accepted CSS-space geometry; this only styles them. */
export function drawMapActorBadges(ctx:CanvasRenderingContext2D,layout:Layout,elapsedMs:number,animate:boolean,phase=0){
  if(!layout.badges.length&&!layout.bubbles.length)return;
  const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):QUOTE_MS;
  const now=animate&&Number.isFinite(phase)?phase:0;
  ctx.save();ctx.setLineDash([]);ctx.shadowBlur=0;ctx.lineCap='round';ctx.lineJoin='round';
  for(const row of layout.badges)badge(ctx,row,now);
  const opacity=animate?Math.max(0,Math.min(1,(QUOTE_MS-elapsed)/320)):1;
  if(opacity>0)for(const row of layout.bubbles)bubble(ctx,row,opacity);
  ctx.restore();
}

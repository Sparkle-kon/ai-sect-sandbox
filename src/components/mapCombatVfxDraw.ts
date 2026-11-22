import type {MapCombatVfxPlan} from './mapCombatVfxView';
import type {MapPoint} from '../types/world';
import {DEFAULT_CAMERA,mapToScreen,screenToMap,type MapCamera} from './mapCamera';
import {MAP_COMBAT_CAPTION_SLOTS,mapCombatCaptionPosition} from './mapCombatLabelLayout';

const duration=1200;
const tau=Math.PI*2;
const bounded=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const valid=(point:MapPoint)=>Number.isFinite(point.x)&&Number.isFinite(point.y);
const stroke=(ctx:CanvasRenderingContext2D,color:string,width:number)=>{
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
};

function clash(ctx:CanvasRenderingContext2D,s:number,p:number){
  const retreat=(1-p)*10;
  ctx.beginPath();ctx.moveTo((-27-retreat)*s,-17*s);ctx.quadraticCurveTo(-22*s,4*s,0,0);
  stroke(ctx,'#115e70',5*s);stroke(ctx,'#88ece6',1.8*s);
  ctx.beginPath();ctx.moveTo((28+retreat)*s,-20*s);ctx.quadraticCurveTo(21*s,4*s,0,0);
  stroke(ctx,'#831843',5*s);stroke(ctx,'#fcb9d3',1.8*s);
  ctx.beginPath();ctx.moveTo(-4*s,0);ctx.lineTo(4*s,0);ctx.moveTo(0,-4*s);ctx.lineTo(0,4*s);
  stroke(ctx,'#fff2ba',1.8*s);
  for(let i=0;i<6;i++){
    const a=i*tau/6+Math.PI/8;
    const d=(4+p*9+(i%2)*2)*s;
    ctx.beginPath();ctx.moveTo(Math.cos(a)*d,Math.sin(a)*d);
    ctx.lineTo(Math.cos(a)*(d+3*s),Math.sin(a)*(d+3*s));stroke(ctx,i%2?'#f7c78b':'#fdf4d0',1.2*s);
  }
}

function storm(ctx:CanvasRenderingContext2D,s:number,phase:number){
  const lift=(2*Math.sin(phase))*s;
  ctx.fillStyle='rgba(77,35,115,.35)';
  ctx.beginPath();ctx.ellipse(0,-24*s+lift,21*s,7*s,-.09,0,tau);ctx.fill();
  for(let i=0;i<3;i++){
    ctx.beginPath();
    ctx.ellipse((i-1)*2*s,(-24-i*2.1)*s+lift,(21-i*4)*s,(7-i)*s,-.09,.12+i*.36,Math.PI*1.60+i*.13);
    stroke(ctx,i===0?'#8055b4':i===1?'#ad81d6':'#d2aaf1',1.3*s);
  }
}
function bolt(ctx:CanvasRenderingContext2D,s:number){
  ctx.beginPath();ctx.moveTo(7*s,-28*s);ctx.lineTo(-3*s,-17*s);ctx.lineTo(3*s,-17*s);
  ctx.lineTo(-1*s,-9*s);ctx.lineTo(3*s,-9*s);ctx.lineTo(0,0);
  stroke(ctx,'#7c3aed',4.2*s);stroke(ctx,'#f7e6ff',1.6*s);
  ctx.beginPath();ctx.moveTo(-1*s,-9*s);ctx.lineTo(-8*s,-6*s);ctx.lineTo(-10*s,-3*s);stroke(ctx,'#c6a3ff',1.2*s);
}

function lotus(ctx:CanvasRenderingContext2D,s:number,p:number){
  ctx.fillStyle='rgba(252,211,77,.13)';
  ctx.beginPath();ctx.moveTo(-15*s,3*s);ctx.lineTo(-4*s,(-36-p*4)*s);ctx.lineTo(4*s,(-36-p*4)*s);
  ctx.lineTo(15*s,3*s);ctx.closePath();ctx.fill();
  for(let i=-2;i<=2;i++){
    const edge=i*6*s,top=(-17+Math.abs(i)*3)*s;
    ctx.beginPath();ctx.moveTo(0,3*s);ctx.quadraticCurveTo(edge-i*s,(-5-Math.abs(i))*s,edge,top);
    ctx.quadraticCurveTo(edge+i*2.5*s,-3*s,0,3*s);stroke(ctx,i%2?'#f0b34e':'#ffe39a',1.35*s);
  }
  ctx.beginPath();ctx.ellipse(0,4*s,14*s,3*s,0,0,tau);stroke(ctx,'#e6a840',1.4*s);
}

function perimeter(ctx:CanvasRenderingContext2D,s:number,impact:boolean,p:number){
  ctx.setLineDash([4*s,3*s]);
  ctx.beginPath();ctx.ellipse(0,0,26*s,14*s,0,0,tau);stroke(ctx,'#f8a8bd',1.4*s);
  ctx.setLineDash([]);
  if(!impact)return;
  ctx.beginPath();ctx.ellipse(0,0,(25+p*10)*s,(14+p*6)*s,0,0,tau);
  stroke(ctx,'#ffdc87',1.4*s);
  for(let i=0;i<4;i++){
    const at=i*Math.PI/2+Math.PI/4;
    const x=Math.cos(at)*26*s,y=Math.sin(at)*14*s;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(at)*6*s,y+Math.sin(at)*6*s);
    stroke(ctx,'#fee6af',1.5*s);
  }
}

export function drawMapCombatVfx(ctx:CanvasRenderingContext2D,plan:MapCombatVfxPlan,
  elapsed:number,animate:boolean,logicalPerCssPixel:number,phase=0,camera:MapCamera=DEFAULT_CAMERA){
  if(!plan.effects.length&&!plan.storms.length&&!plan.sieges.length)return;
  const s=Number.isFinite(logicalPerCssPixel)?bounded(logicalPerCssPixel,.05,16):1;
  const time=Number.isFinite(elapsed)?Math.max(0,elapsed):duration;
  const live=!animate||time<duration;
  const p=animate?bounded(time/duration,0,1):0;
  const ambient=animate&&Number.isFinite(phase)?phase:0;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
  ctx.globalAlpha=1;ctx.shadowBlur=0;
  for(const siege of plan.sieges){
    if(!valid(siege.location))continue;
    ctx.save();ctx.translate(siege.location.x,siege.location.y);
    perimeter(ctx,s,siege.impact&&live,p);
    ctx.restore();
  }
  for(const cloud of plan.storms){
    if(!valid(cloud.location))continue;
    ctx.save();ctx.translate(cloud.location.x,cloud.location.y);storm(ctx,s,ambient);ctx.restore();
  }
  if(live){
    const labels=new Map<string,number>();
    for(const effect of plan.effects){
      if(!valid(effect.location))continue;
      const {x,y}=effect.location;
      ctx.save();ctx.translate(x,y);ctx.globalAlpha=1-p*.68;
      switch(effect.kind){
        case 'clash':clash(ctx,s,p);break;
        case 'lightning':bolt(ctx,s);break;
        case 'breakthrough':
          if(effect.majorAdvance)lotus(ctx,s,p);
          else {ctx.beginPath();ctx.ellipse(0,0,12*s,5*s,0,0,tau);stroke(ctx,'#fde4a0',1.5*s);}
          break;
        case 'damage':
          if(typeof effect.amount!=='number'||!Number.isFinite(effect.amount)||effect.amount<=0)break;
          const tally=labels.get(effect.location.id)??0;
          if(tally>=MAP_COMBAT_CAPTION_SLOTS)break;
          labels.set(effect.location.id,tally+1);
          const label=`−${effect.amount} HP`;
          ctx.font=`700 ${12*s}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
          const projected=mapCombatCaptionPosition(mapToScreen(camera,effect.location),tally,p,
            s*camera.zoom,ctx.measureText(label).width/s);
          if(!projected)break;
          const at=screenToMap(camera,projected);
          ctx.strokeStyle='#120d1a';ctx.lineWidth=3*s;ctx.fillStyle='#ffd0db';
          ctx.strokeText(label,at.x-x,at.y-y);ctx.fillText(label,at.x-x,at.y-y);break;
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

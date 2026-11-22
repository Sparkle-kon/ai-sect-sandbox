import type {ProtectiveArrayDome} from './protectiveArrayDomeView';

const lifetime=1200;
const range=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
const pi=Math.PI;

function rim(ctx:CanvasRenderingContext2D,rx:number,ry:number,start:number,end:number) {
  ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,start,end);
}

function fracture(ctx:CanvasRenderingContext2D,s:number,highlight:boolean) {
  ctx.beginPath();ctx.moveTo(-6*s,-24*s);ctx.lineTo(-3*s,-18*s);
  ctx.lineTo(-6*s,-13*s);ctx.lineTo(-2*s,-9*s);ctx.lineTo(-5*s,-3*s);
  ctx.moveTo(-6*s,-13*s);ctx.lineTo(-12*s,-10*s);ctx.lineTo(-14*s,-5*s);
  ctx.strokeStyle=highlight?'#ffe0aa':'#a6b9d1';ctx.lineWidth=(highlight?1.6:1)*s;ctx.stroke();
}
function remnants(ctx:CanvasRenderingContext2D,s:number){
  ctx.strokeStyle='#9ba4bf';ctx.lineWidth=1.2*s;
  ctx.setLineDash([2.1*s,2.9*s]);
  rim(ctx,29*s,24*s,pi,pi*1.20);ctx.stroke();
  rim(ctx,29*s,24*s,pi*1.79,pi*2);ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(-25*s,-5*s);ctx.lineTo(-21*s,-1*s);
  ctx.moveTo(22*s,-6*s);ctx.lineTo(19*s,-2*s);ctx.stroke();
}

/** The dome is present only when its caller has projected an actual visible lower-plane HQ. */
export function drawProtectiveArrayDomes(ctx:CanvasRenderingContext2D,domes:readonly ProtectiveArrayDome[],
  elapsed:number,animate:boolean,logicalPerCssPixel:number){
  if(domes.length===0)return;
  const s=Number.isFinite(logicalPerCssPixel)?range(logicalPerCssPixel,.05,16):1;
  const age=Number.isFinite(elapsed)?Math.max(0,elapsed):lifetime;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=0;ctx.setLineDash([]);
  for(const dome of domes){
    const {x,y}=dome.location;
    if(![x,y,dome.hp,dome.maxHp,dome.integrity].every(Number.isFinite)||dome.maxHp<=0||
      dome.hp<0||dome.hp>dome.maxHp)continue;
    const hp=range(dome.hp/dome.maxHp,0,1);
    const integrity=Math.min(hp,range(dome.integrity,0,1));
    const impact=dome.impacted&&(!animate||age<lifetime);
    ctx.save();ctx.translate(x,y);
    ctx.globalAlpha=1;
    if(integrity===0){
      remnants(ctx,s);
      if(impact){
        ctx.globalAlpha=animate?Math.max(.15,1-age/lifetime):1;
        ctx.beginPath();ctx.moveTo(-21*s,-7*s);ctx.lineTo(-18*s,-12*s);
        ctx.moveTo(16*s,-11*s);ctx.lineTo(19*s,-8*s);ctx.strokeStyle='#ffce98';ctx.lineWidth=1.5*s;ctx.stroke();
      }
      ctx.restore();continue;
    }
    const radius=29*s, height=24*s;
    const gap=integrity<.63?(1-integrity)*.37:0;
    const floor=ctx.createLinearGradient(0,-height,0,0);
    floor.addColorStop(0,`rgba(125,211,252,${.10+.11*integrity})`);
    floor.addColorStop(.65,`rgba(45,212,191,${.03+.07*integrity})`);
    floor.addColorStop(1,'rgba(49,46,129,.025)');
    if(gap===0){
      rim(ctx,radius,height,pi,pi*2);ctx.closePath();ctx.fillStyle=floor;ctx.fill();
    }else{
      // Two intact lower pieces do not fill in the visible breach.
      rim(ctx,radius,height,pi,pi*(1.5-gap));ctx.lineTo(-radius*.23,0);ctx.closePath();ctx.fillStyle=floor;ctx.fill();
      rim(ctx,radius,height,pi*(1.5+gap),pi*2);ctx.lineTo(radius*.23,0);ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle=dome.besieged?'#8cbfd1':'#64ceca';ctx.lineWidth=(1+.7*integrity)*s;
    ctx.globalAlpha=.42+.42*integrity;
    rim(ctx,radius,height,pi,pi*(1.5-gap));ctx.stroke();
    rim(ctx,radius,height,pi*(1.5+gap),pi*2);ctx.stroke();
    ctx.lineWidth=.8*s;ctx.strokeStyle='#a8bfe5';
    ctx.setLineDash([1.5*s,3*s]);
    rim(ctx,radius-3*s,height-3*s,pi*1.06,pi*(1.46-gap));ctx.stroke();
    rim(ctx,radius-3*s,height-3*s,pi*(1.54+gap),pi*1.94);ctx.stroke();
    ctx.setLineDash([]);
    if(integrity<.67)fracture(ctx,s,false);
    if(impact){
      ctx.globalAlpha=animate?Math.max(.12,1-age/lifetime):.87;
      fracture(ctx,s,true);
    }
    ctx.restore();
  }
  ctx.restore();
}

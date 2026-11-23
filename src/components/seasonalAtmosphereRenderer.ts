import type {AtmosphereFrame,CelestialPhenomenon} from './seasonalAtmosphereModel';

type Pen=CanvasRenderingContext2D;
type Point=readonly [number,number];
export interface SeasonalPaintRect {
  readonly x:number;
  readonly y:number;
  readonly width:number;
  readonly height:number;
}
const tau=Math.PI*2;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const wrap=(n:number)=>n-Math.floor(n);
function sample(seed:number,k:number):number{
  let v=(seed>>>0)^Math.imul(k+383,0x9e3779b1);
  v=Math.imul(v^(v>>>16),0x7feb352d);
  v=Math.imul(v^(v>>>15),0x846ca68b);
  return ((v^(v>>>16))>>>0)/4294967296;
}
function poly(ctx:Pen,fill:string|CanvasGradient,points:readonly Point[]):void{
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
function line(ctx:Pen,stroke:string,width:number,points:readonly Point[]):void{
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();
}
function rectangle(ctx:Pen,fill:string|CanvasGradient,x:number,y:number,w:number,h:number):void{
  ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);
}
function ellipse(ctx:Pen,fill:string|CanvasGradient,x:number,y:number,rx:number,ry:number):void{
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,tau);ctx.fillStyle=fill;ctx.fill();
}
function radial(ctx:Pen,x:number,y:number,r:number,tone:string):CanvasGradient{
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,tone);g.addColorStop(1,'#00000000');return g;
}
function vertical(ctx:Pen,y:number,h:number,top:string,center:string,bottom:string):CanvasGradient{
  const g=ctx.createLinearGradient(0,y,0,y+h);
  g.addColorStop(0,top);g.addColorStop(.56,center);g.addColorStop(1,bottom);return g;
}
function petal(ctx:Pen,size:number,bright:boolean):void{
  const s=size;
  ctx.beginPath();ctx.moveTo(-s*.82,s*.18);
  ctx.quadraticCurveTo(-s*.53,-s*.72,s*.44,-s*.59);
  ctx.quadraticCurveTo(s*.54,-s*.31,s*.89,-s*.25);
  ctx.quadraticCurveTo(s*.33,s*.66,-s*.82,s*.18);
  ctx.fillStyle=bright?'#f3c0c3':'#e7a0b9';ctx.fill();
  line(ctx,'#ffe0d3',Math.max(.55,s*.13),[[-s*.60,s*.13],[-s*.11,-s*.01],[s*.40,-s*.21]]);
}
function leaf(ctx:Pen,size:number,bright:boolean):void{
  const s=size;
  poly(ctx,bright?'#ecb469':'#d88951',[[0,s*.77],[-s*.29,s*.21],[-s*.71,s*.26],[-s*.57,-s*.17],[-s*.99,-s*.59],[-s*.31,-s*.38],[-s*.32,-s*.79],[0,-s], [s*.32,-s*.78],[s*.31,-s*.38],[s*.93,-s*.54],[s*.55,-s*.10],[s*.69,s*.28],[s*.26,s*.20]]);
  line(ctx,'#f4ca86',Math.max(.48,s*.105),[[0,s*.95],[0,-s*.62]]);
}
function flake(ctx:Pen,size:number,sharp:boolean):void{
  if(!sharp){ellipse(ctx,'#f1f6f3',0,0,size*.36,size*.34);return;}
  const s=size;
  for(let i=0;i<3;i++){
    const angle=i*Math.PI/3,c=Math.cos(angle),l=Math.sin(angle);
    line(ctx,'#ecf5f6',Math.max(.48,s*.15),[[-c*s,-l*s],[c*s,l*s]]);
  }
  ellipse(ctx,'#f9ffff',0,0,s*.26,s*.25);
}
function firefly(ctx:Pen,size:number,near:boolean):void{
  if(near)ellipse(ctx,radial(ctx,0,0,size*3.4,'#e7ed9e88'),0,0,size*3.4,size*3.4);
  ellipse(ctx,near?'#fff0b8':'#dbeaa9',0,0,size*.43,size*.34);
}
function qiStreak(ctx:Pen,size:number,strong:boolean):void{
  line(ctx,strong?'#b5e4cc':'#a3d8c9',Math.max(.62,size*.19),[[size*.47,-size*1.18],[-size*.57,size*1.33]]);
  ellipse(ctx,'#eaf4cd',-size*.57,size*1.33,size*.20,size*.23);
}
function cloud(ctx:Pen,x:number,y:number,scale:number,ink:string,edge:string):void{
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.beginPath();ctx.moveTo(-65,11);
  ctx.quadraticCurveTo(-54,-8,-41,-1);
  ctx.quadraticCurveTo(-31,-16,-18,-10);
  ctx.quadraticCurveTo(-8,-28,8,-15);
  ctx.quadraticCurveTo(18,-19,28,-5);
  ctx.quadraticCurveTo(45,-9,57,6);
  ctx.quadraticCurveTo(38,17,14,14);
  ctx.quadraticCurveTo(-14,21,-34,15);
  ctx.quadraticCurveTo(-52,17,-65,11);
  ctx.closePath();ctx.fillStyle=ink;ctx.fill();
  ctx.beginPath();ctx.moveTo(-54,7);
  ctx.quadraticCurveTo(-45,-4,-37,1);
  ctx.quadraticCurveTo(-32,-10,-23,-4);
  ctx.quadraticCurveTo(-16,-9,-11,-4);
  ctx.quadraticCurveTo(-6,-20,2,-16);
  ctx.quadraticCurveTo(11,-12,10,-6);
  ctx.quadraticCurveTo(23,-14,30,-3);
  ctx.quadraticCurveTo(46,-5,52,6);
  ctx.strokeStyle=edge;ctx.lineWidth=1.55;ctx.stroke();
  ctx.restore();
}
function lotus(ctx:Pen,x:number,y:number,scale:number,light:string,shade:string):void{
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ellipse(ctx,'#2521394e',0,8,32,6);
  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const q=side*(11+i*5);
      ctx.beginPath();ctx.moveTo(0,6);
      ctx.quadraticCurveTo(q*.56,-15+i*2,q*1.39,-13+i*7);
      ctx.quadraticCurveTo(q*1.68,7+i*.4,0,6);
      ctx.fillStyle=i%2?light:shade;ctx.fill();
      ctx.beginPath();ctx.moveTo(0,7);
      ctx.quadraticCurveTo(q*.85,0,q*1.36,-13+i*7);
      ctx.strokeStyle=light;ctx.lineWidth=1.04;ctx.stroke();
    }
  }
  ctx.beginPath();ctx.moveTo(-6,5);ctx.quadraticCurveTo(-13,-7,0,-24);
  ctx.quadraticCurveTo(12,-9,6,5);ctx.fillStyle=light;ctx.fill();
  ellipse(ctx,'#ffedb2',0,4,4.2,2.4);
  ctx.restore();
}

type PaintFrame=Pick<AtmosphereFrame,'seed'|'tick'|'season'|'historical'|'kind'|'intensity'|'north'|'phenomena'>;
const seasonalTints={
  spring:['#ecc2b31c','#f3b4bd09','#5f917f1a'],
  summer:['#ffc67623','#ffe9b908','#4f89861b'],
  autumn:['#f8bd8424','#f5b1710d','#734a6921'],
  winter:['#a5d8eb22','#d6e7e80a','#385a8c24'],
} as const;
const ceremonyInk={
  nascent:{key:'#f1cb83',light:'#f9e4b0',shadow:'#dea064',cloud:'#bb8f6a',wash:'#efc17454'},
  soul:{key:'#b5dbcb',light:'#e7efd1',shadow:'#8fbdb5',cloud:'#769a9f',wash:'#bbdbc967'},
  ascension:{key:'#f7d18a',light:'#fff0bc',shadow:'#dca97c',cloud:'#a19bb9',wash:'#ffe0a66b'},
} satisfies Record<CelestialPhenomenon['kind'],{key:string;light:string;shadow:string;cloud:string;wash:string}>;

// A cycle of illustration palettes, never a simulated hour or an advance of game time.
const sceneLight=[
  {top:'#e5ae802a',middle:'#efb78a14',base:'#695b9b13',glow:'#ffd29e34',x:.16,y:.25},
  {top:'#e1eecb1b',middle:'#e8f1d609',base:'#88a2940a',glow:'#faedbf24',x:.70,y:.08},
  {top:'#bd7ba924',middle:'#e2a38c16',base:'#74539322',glow:'#ffc78d36',x:.84,y:.28},
  {top:'#5967ad32',middle:'#6f83c118',base:'#3749762d',glow:'#b3d4fc26',x:.28,y:.13},
] as const;
function lightWash(ctx:Pen,frame:PaintFrame,r:SeasonalPaintRect,small:boolean):void{
  const {x,y,width:w,height:h}=r;
  const phase=sceneLight[((Math.max(0,frame.tick)>>>0)+(frame.seed&3))%sceneLight.length];
  if(small){
    if(frame.kind!=='平息'&&frame.intensity>0){
      const tone=frame.kind==='霜息'?'#b3dcf922':frame.kind==='灵潮'?'#afd6ab24':'#d5bcad23';
      ellipse(ctx,radial(ctx,x+w*.53,y+h*.5,Math.max(w,h)*.68,tone),x+w*.53,y+h*.5,w*.68,h*.68);
    }
    rectangle(ctx,vertical(ctx,y,h,phase.top,phase.middle,phase.base),x,y,w,h);
    return;
  }
  const t=seasonalTints[frame.season];
  rectangle(ctx,vertical(ctx,y,h,t[0],t[1],t[2]),x,y,w,h);
  rectangle(ctx,vertical(ctx,y,h,phase.top,phase.middle,phase.base),x,y,w,h);
  const sx=x+w*phase.x,sy=y+h*phase.y;
  ellipse(ctx,radial(ctx,sx,sy,w*.48,phase.glow),sx,sy,w*.48,h*.52);
}
function particles(ctx:Pen,frame:PaintFrame,r:SeasonalPaintRect,time:number,small:boolean):void{
  const {x,y,width:w,height:h}=r;
  const strength=Number.isFinite(frame.intensity)?clamp(frame.intensity,0,1):0;
  const frosty=frame.season==='winter'&&frame.north;
  const qi=frame.kind==='灵潮'&&frame.season==='summer'&&strength>.25;
  const wind=frame.kind==='罡风'?strength:0;
  const heavy=frame.kind==='霜息'&&frame.season==='winter'?strength:0;
  const count=small?Math.min(7,4+Math.round(2*Math.max(strength,Number(frosty)))):Math.min(22,16+Math.round(5*Math.max(strength,Number(frosty))));
  for(let i=0;i<count;i++){
    const u=sample(frame.seed,i*13),v=sample(frame.seed,i*13+1),deep=sample(frame.seed,i*13+2);
    const sw=sample(frame.seed,i*13+3)*tau;
    const drift=(frame.season==='autumn'?.018:frame.season==='winter'?.007:.009)+(wind*.028);
    const flurry=frame.season==='autumn'?.08:frame.season==='winter'?.053+heavy*.027:
      frame.season==='spring'?.036:qi?.082:-.009;
    const px=x+w*wrap(u+time*drift*(.3+deep)+Math.sin(sw+time*(.6+wind))*deep*.03);
    const py=y+h*wrap(v+time*flurry*(deep+.32)+Math.cos(sw+time*.7)*.012);
    const base=(small?.91:1.8)+deep*(small?.94:2.3);
    ctx.save();ctx.translate(px,py);
    ctx.rotate(sw+time*(frame.season==='autumn'?.95:.31));
    ctx.globalAlpha=small?.32+deep*.19:.35+deep*.47;
    if(frame.season==='spring')petal(ctx,base,deep>.42);
    else if(frame.season==='autumn')leaf(ctx,base,deep>.44);
    else if(frame.season==='winter')flake(ctx,base,deep>.58);
    else if(qi&&i%3!==0){
      ctx.rotate(-sw-time*.31);qiStreak(ctx,base,strength>.6);
    }else{
      ctx.globalAlpha*=.66+(Math.sin(sw+time*1.2)+1)*.17;
      firefly(ctx,base,deep>.78&&!small);
    }
    ctx.restore();
  }
}
function celestial(ctx:Pen,r:SeasonalPaintRect,kind:CelestialPhenomenon['kind'],timeMs:number,small:boolean):void{
  const c=ceremonyInk[kind], {x,y,width:w,height:h}=r;
  const reveal=timeMs===0?1:clamp(timeMs/920,0,1);
  const lingering=timeMs>2750?clamp(1-(timeMs-2750)/1700,.30,1):1;
  const eased=reveal*reveal*(3-2*reveal);
  const art=.84+.16*eased;
  const middle=x+w*.5, cy=y+h*.38;
  const base=y+h*.83;
  ctx.save();
  ctx.globalAlpha=lingering*art*.80;
  const wash=radial(ctx,middle,cy,w*.55,c.wash);
  ellipse(ctx,wash,middle,cy,w*.55,h*.52);
  const ray=vertical(ctx,y,h,c.key+'00',c.key+'58',c.key+'00');
  for(const k of [-2,-1,0,1,2]){
    const offset=w*k*.106;
    const halo=k===0?.078:.048;
    poly(ctx,ray,[[middle+offset*.48-w*halo,y],[middle+offset*.48+w*halo,y],[middle+offset*1.35+w*halo*.57,base],[middle+offset*1.35-w*halo*.57,base]]);
  }
  const size=Math.min(w/540,h/285);
  ctx.globalAlpha=lingering*(small?.67:.76)*art;
  const rise=(eased-1)*h*.06;
  cloud(ctx,middle-w*.25,y+h*.43+rise,size*(small?1.2:1.44),c.cloud+'8f',c.light+'b3');
  cloud(ctx,middle+w*.26,y+h*.34+rise,size*(small?1.13:1.24),c.cloud+'93',c.light+'a8');
  if(!small){
    cloud(ctx,middle+w*.065,y+h*.16+rise,size*.88,c.cloud+'4a',c.light+'87');
    cloud(ctx,middle-w*.32,y+h*.70+rise,size*.86,c.cloud+'64',c.light+'8e');
    cloud(ctx,middle+w*.31,y+h*.73+rise,size*.74,c.cloud+'68',c.light+'8e');
  }
  ctx.globalAlpha=lingering*(small?.80:.84);
  lotus(ctx,middle,base,size*(small?1.44:1.24),c.light,c.shadow);
  if(!small){
    lotus(ctx,middle-w*.21,base-h*.065,size*.61,c.light,c.shadow);
    lotus(ctx,middle+w*.21,base-h*.048,size*.57,c.light,c.shadow);
  }
  // Soft contours are bounded. No full-frame flashes, red exposure, or white luminance jumps.
  ctx.globalAlpha=lingering*.55;
  for(let i=0;i<(small?4:12);i++){
    const a=i*tau/(small?4:12)+timeMs/14000;
    const px=middle+Math.cos(a)*w*(small?.34:.31);
    const py=cy+Math.sin(a)*h*.26;
    const size=small?.64:1.65;
    poly(ctx,c.light,[[px-size,py],[px,py-size*1.4],[px+size,py],[px,py+size*1.4]]);
  }
  ctx.restore();
}

/** Draw the same deterministic, device-independent visual in a pre-admitted bounded area. */
export function drawSeasonalAtmosphere(ctx:Pen,frame:PaintFrame,rect:SeasonalPaintRect,timeMs=0):void{
  const {x,y,width:w,height:h}=rect;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
  const time=frame.historical||!Number.isFinite(timeMs)?0:clamp(timeMs,0,4000);
  const small=Math.min(w,h)<130;
  ctx.save();
  ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  lightWash(ctx,frame,rect,small);
  particles(ctx,frame,rect,time/1000,small);
  const phenomenon=frame.historical?undefined:frame.phenomena[0];
  if(phenomenon)celestial(ctx,rect,phenomenon.kind,time,small);
  ctx.restore();
}

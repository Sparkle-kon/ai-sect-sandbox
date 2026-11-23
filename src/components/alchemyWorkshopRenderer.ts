import { drawCanvasCharacterSprite } from './canvasCharacterSprite';
import type { AlchemyWorkshopFurnace, AlchemyWorkshopGarden } from './alchemyWorkshopVisualModel';

type Pen = CanvasRenderingContext2D;
type Point = readonly [number, number];
type Heat = 'calm' | 'balanced' | 'fierce';
type Growth = 'sown' | 'sprout' | 'leaf' | 'flower' | 'anonymous-growing' | 'anonymous-ready';

const W = 640;
const H = 320;
const TAU = Math.PI * 2;
const embers = {
  calm: ['#126065','#39b9af','#d6fff0'],
  balanced: ['#853a28','#eba038','#fff3ad'],
  fierce: ['#533693','#c17bea','#ffe2f9'],
} satisfies Record<Heat, readonly [string,string,string]>;

function rectangle(ctx:Pen, ink:string | CanvasGradient,x:number,y:number,w:number,h:number):void {
  ctx.fillStyle=ink;ctx.fillRect(x,y,w,h);
}
function polygon(ctx:Pen, ink:string | CanvasGradient, points:readonly Point[]):void {
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(const p of points.slice(1))ctx.lineTo(...p);
  ctx.closePath();ctx.fillStyle=ink;ctx.fill();
}
function stroke(ctx:Pen, ink:string, width:number, points:readonly Point[]):void {
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(const p of points.slice(1))ctx.lineTo(...p);
  ctx.strokeStyle=ink;ctx.lineWidth=width;ctx.stroke();
}
function oval(ctx:Pen, ink:string | CanvasGradient, x:number,y:number,rx:number,ry:number,angle=0):void {
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,TAU);ctx.fillStyle=ink;ctx.fill();
}
function shade(ctx:Pen,y1:number,y2:number,top:string,bottom:string):CanvasGradient{
  const ink=ctx.createLinearGradient(0,y1,0,y2);ink.addColorStop(0,top);ink.addColorStop(1,bottom);return ink;
}
function glow(ctx:Pen,x:number,y:number,r:number,inner:string):CanvasGradient{
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,inner);g.addColorStop(1,'#00000000');return g;
}
function unit(seed:number):number {
  const z=Math.imul(seed+17,0x7feb352d);
  return ((z^(z>>>16))>>>0)/4294967296;
}
function amberLamp(ctx:Pen,x:number,y:number):void {
  oval(ctx,glow(ctx,x,y,56,'#efa75b5b'),x,y,56,56);
  stroke(ctx,'#2a292d',2,[[x,y-38],[x,y-10]]);
  polygon(ctx,'#392d32',[[x-11,y-10],[x+11,y-10],[x+14,y-4],[x+11,y+17],[x-11,y+17],[x-14,y-4]]);
  polygon(ctx,'#da7550',[[x-9,y-7],[x+9,y-7],[x+12,y-2],[x+9,y+13],[x-9,y+13],[x-12,y-2]]);
  polygon(ctx,'#edac69',[[x-5,y-7],[x+5,y-7],[x+7,y-3],[x+5,y+13],[x-5,y+13],[x-7,y-3]]);
  stroke(ctx,'#704148',1,[[x-1,y-7],[x-1,y+13]]);
  stroke(ctx,'#81553a',1.5,[[x,y+16],[x-2,y+25],[x+1,y+28]]);
}
function workshop(ctx:Pen):void{
  rectangle(ctx,shade(ctx,0,222,'#192327','#4c4b47'),0,0,W,H);
  polygon(ctx,'#4b4b43',[[0,63],[640,61],[640,226],[0,254]]);
  polygon(ctx,'#55564a',[[113,62],[516,58],[512,240],[121,238]]);
  rectangle(ctx,shade(ctx,68,214,'#283f44','#76856b'),132,68,368,146);
  ctx.save();ctx.beginPath();ctx.rect(132,68,368,146);ctx.clip();
  oval(ctx,'#d4cf942a',401,82,129,100);
  for(let i=0;i<4;i++){
    const y=144+i*19;
    polygon(ctx,['#829181','#6d8479','#516c63','#3c574f'][i],[
      [125,y+21],[190,y-30],[223,y-6],[285,y-47],[331,y-7],[361,y-26],[399,y+1],[445,y-32],[513,y+8],[515,222],[125,222],
    ]);
  }
  for(let i=0;i<9;i++){
    const x=141+i*27+unit(i)*7, y=204-i%3*7;
    stroke(ctx,'#354c47',2,[[x,y+13],[x+4,y-36-i%3*6],[x+1,y-51]]);
    stroke(ctx,'#657e62',1,[[x+3,y-21],[x-8,y-34],[x-15,y-37]]);
  }
  ctx.restore();
  for(let j=0;j<8;j++){
    const x=129+j*53;
    rectangle(ctx,'#3b3e3a',x,61,6,165);
    rectangle(ctx,'#a5a283',x+1,65,1.4,150);
  }
  for(const y of [71,120,171,224]){
    rectangle(ctx,'#303834',122,y,389,4);
    rectangle(ctx,'#999579',122,y,389,1);
  }
  polygon(ctx,'#242c2b',[[0,0],[640,0],[640,46],[520,49],[505,61],[137,61],[119,50],[0,46]]);
  stroke(ctx,'#686455',3,[[0,44],[121,48],[140,57],[501,57],[519,47],[640,43]]);
  for(let i=0;i<11;i++){
    const x=i*64;
    stroke(ctx,'#49504a',4,[[x-18,0],[x+12,36],[x+14,44]]);
    stroke(ctx,'#65695a',1,[[x-14,0],[x+14,36]]);
  }
  polygon(ctx,shade(ctx,221,320,'#6d6e60','#323b3a'),[[0,219],[640,219],[640,320],[0,320]]);
  for(const y of [223,228,237,250,266,287,310]){
    stroke(ctx,'#343b3a',1.3,[[0,y],[640,y]]);
    stroke(ctx,'#a49d7c68',1,[[0,y-1],[640,y-1]]);
  }
  for(let i=-3;i<15;i++)stroke(ctx,'#42504a',1,[[i*44,219],[319+(i*44-319)*2.1,320]]);
  for(const x of [43,557]){
    polygon(ctx,'#1f2c2b',[[x,51],[x+26,50],[x+28,229],[x+20,251],[x+3,251]]);
    polygon(ctx,'#686052',[[x+2,53],[x+19,53],[x+15,232],[x+7,237]]);
    rectangle(ctx,'#8f8268',x+6,58,2,169);
  }
  amberLamp(ctx,100,108);amberLamp(ctx,541,108);
  oval(ctx,'#212c2bb6',320,286,144,25);
  polygon(ctx,'#3b4843',[[176,266],[220,248],[418,248],[466,266],[449,293],[195,294]]);
  polygon(ctx,'#68766a',[[177,265],[221,248],[418,248],[464,265],[429,280],[213,281]]);
  stroke(ctx,'#a1a294',1.8,[[179,265],[213,279],[430,279],[464,265]]);
}
function lid(ctx:Pen):void{
  polygon(ctx,'#292e32',[[243,153],[250,150],[259,136],[283,116],[305,107],[311,97],[328,97],[335,107],[357,116],[381,135],[389,150],[397,153],[387,167],[253,167]]);
  polygon(ctx,shade(ctx,111,162,'#c79352','#674139'),[[248,151],[266,132],[283,118],[309,108],[328,108],[356,118],[376,132],[392,151],[386,161],[254,161]]);
  for(const side of [-1,1]){
    stroke(ctx,'#704b40',3,[[320,111],[320+side*21,126],[320+side*46,152]]);
    stroke(ctx,'#f6c882a2',1,[[320+side*3,111],[320+side*25,126],[320+side*50,151]]);
  }
  oval(ctx,'#423c33',320,163,72,7);
  oval(ctx,'#d4a269',320,154,72,7);
  oval(ctx,'#72513d',320,155,65,3);
  oval(ctx,'#223336',319,97,12,6);
  oval(ctx,'#9caa89',319,95,10,4);
  stroke(ctx,'#efd199',1.3,[[254,161],[280,167],[359,167],[385,160]]);
}
function furnace(ctx:Pen,heat:Heat|undefined,phase:number,grade:number,committed:boolean):void{
  for(const s of [-1,1]){
    polygon(ctx,'#222b2f',[[320+s*58,217],[320+s*74,224],[320+s*75,249],[320+s*87,263],[320+s*63,264],[320+s*49,252],[320+s*48,230]]);
    polygon(ctx,'#9d7455',[[320+s*62,225],[320+s*71,229],[320+s*71,249],[320+s*80,258],[320+s*70,258],[320+s*60,248]]);
    oval(ctx,'#293438',320+s*81,178,25,17);
    oval(ctx,'#af805a',320+s*82,178,20,12);
    oval(ctx,'#354442',320+s*82,178,15,8);
  }
  polygon(ctx,'#292d33',[[242,160],[397,160],[413,183],[395,231],[365,250],[275,250],[244,231],[227,184]]);
  polygon(ctx,shade(ctx,159,250,'#cb9870','#664839'),[[244,164],[396,164],[407,183],[390,229],[365,245],[275,245],[250,229],[233,184]]);
  polygon(ctx,shade(ctx,160,238,'#a37051','#503c3d'),[[263,165],[377,165],[392,184],[374,233],[266,233],[247,184]]);
  polygon(ctx,'#cf9557',[[263,167],[377,166],[381,176],[257,178]]);
  stroke(ctx,'#eabe81',1.6,[[234,184],[246,183],[263,168],[376,168],[392,184],[406,184]]);
  stroke(ctx,'#bc9466',2,[[251,231],[275,245],[364,245],[388,230]]);
  for(const s of [-1,1]){
    stroke(ctx,'#e1ae71',1.6,[[320+s*65,175],[320+s*73,184],[320+s*58,228]]);
    for(let i=0;i<3;i++){
      const x=320+s*(57+i*4);
      rectangle(ctx,'#493f3c',x,190+i*8,4,3);
      rectangle(ctx,'#d4a67c',x,192+i*8,4,1);
    }
  }
  for(let i=0;i<Math.min(5,Math.max(1,grade));i++)oval(ctx,'#f2ca8c',320+i*8-(Math.min(5,grade)-1)*4,173.5,1.25,1.25);
  const [dark,light,bright]=heat?embers[heat]:['#283533','#446052','#7c8370'];
  polygon(ctx,'#433238',[[274,195],[285,182],[355,182],[366,196],[354,224],[286,224]]);
  polygon(ctx,dark,[[278,197],[289,186],[351,186],[362,197],[351,220],[287,220]]);
  if(heat){
    ctx.save();ctx.beginPath();ctx.moveTo(279,197);ctx.lineTo(289,186);ctx.lineTo(351,186);ctx.lineTo(361,197);ctx.lineTo(351,220);ctx.lineTo(287,220);ctx.closePath();ctx.clip();
    oval(ctx,glow(ctx,320,210,76,light),320,210,80,76);
    for(let i=0;i<6;i++){
      const x=290+12*i, lift=6+unit(i+20)*10+Math.sin(TAU*phase+i)*4;
      ctx.beginPath();ctx.moveTo(x-9,221);ctx.quadraticCurveTo(x-10,207,x+1,217-lift);
      ctx.quadraticCurveTo(x+10,207,x+7,222);ctx.fillStyle=i%2?light:bright;ctx.fill();
    }
    for(let i=0;i<6;i++){
      const x=293+i*11,y=210-unit(i+42)*21-Math.sin(phase*TAU+i)*3;
      oval(ctx,bright,x,y,1.1+i%2,1.1+i%2);
    }
    if(committed){
      oval(ctx,'#273a387e',320,216,25,5);
      oval(ctx,light+'af',320,215,22,3.8);
      oval(ctx,bright+'ca',318,214,17,1.15);
      for(let i=0;i<4;i++){
        const age=(unit(i+220)+phase*.65)%1;
        const x=307+i*8+Math.sin(age*TAU+i)*2;
        const y=213-age*18;
        oval(ctx,bright+'b4',x,y,1.2+age,1.2+age);
      }
    }
    ctx.restore();
    oval(ctx,glow(ctx,318,239,72,light+'4b'),318,239,72,22);
  }else{
    stroke(ctx,'#607469',1.5,[[287,196],[298,188],[349,188]]);
    stroke(ctx,'#55504a',1,[[289,211],[351,211]]);
  }
  stroke(ctx,'#deaa71',2,[[274,195],[285,183],[355,183],[366,196],[354,224],[287,224],[274,195]]);
  stroke(ctx,'#faf0bf65',1,[[285,192],[296,189],[348,189]]);
  lid(ctx);
}

function mist(ctx:Pen,x:number,y:number,ink:string,phase:number):void{
  for(let i=0;i<10;i++){
    const t=(unit(i+620)+phase*.36)%1;
    const dx=Math.sin(t*7+i*.8)*(8+t*24),yy=y-t*80;
    ctx.globalAlpha=(1-t)*.38;
    oval(ctx,glow(ctx,x+dx,yy,25,ink),x+dx,yy,24,14+t*14);
  }
  ctx.globalAlpha=1;
}
function lightning(ctx:Pen,phase:number):void{
  const flash=Math.max(0,1-Math.abs(phase-.62)*5);
  if(!flash)return;
  ctx.save();ctx.globalAlpha=flash;
  oval(ctx,glow(ctx,322,111,104,'#ddcaffd0'),322,109,104,96);
  stroke(ctx,'#aa88ec',9,[[375,2],[365,26],[352,40],[365,51],[337,74],[347,84],[319,95]]);
  stroke(ctx,'#f1defa',2.3,[[375,2],[365,26],[352,40],[365,51],[337,74],[347,84],[319,95]]);
  stroke(ctx,'#ece2ff',1.1,[[353,42],[334,45],[336,55],[315,63]]);
  stroke(ctx,'#ecd3ff',1,[[337,74],[367,65],[374,71],[394,58]]);
  for(let i=0;i<10;i++){
    const a=i*2.4;
    const x=319+Math.cos(a)*(19+i*3),y=103+Math.sin(a)*(11+i*3);
    stroke(ctx,'#f8e0ff',1.3,[[x,y],[x+Math.cos(a)*6,y+Math.sin(a)*7]]);
  }
  ctx.restore();
}

/** A real furnace with an optional legal static demonstration or a real, already paid operation. */
export function drawAlchemyFurnace(ctx:Pen,frame:AlchemyWorkshopFurnace,width:number,height:number,progress?:number):void{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const hasResult=frame.status==='open'&&frame.mode==='receipt'&&frame.result!==undefined;
  const heat=frame.status==='open'&&(frame.mode==='preview'||hasResult)?frame.heat:undefined;
  const phase=hasResult&&progress!==undefined&&Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):.58;
  ctx.save();ctx.scale(width/W,height/H);
  workshop(ctx);
  if(hasResult&&heat){
    const tint=embers[heat][1];
    oval(ctx,glow(ctx,319,192,152,tint+'65'),319,191,151,109);
    mist(ctx,320,103,frame.result?.success?tint+'77':'#b8a79b72',phase);
    if(frame.result?.success){
      const pulse=Math.sin(Math.PI*phase);
      ctx.globalAlpha=.32+pulse*.58;
      for(let i=0;i<9;i++){
        const a=i*TAU/9+phase*.25, r=33+i%3*13;
        const x=320+Math.cos(a)*r,y=114+Math.sin(a)*r*.38;
        polygon(ctx,embers[heat][2],[[x-3,y],[x,y-4],[x+3,y],[x,y+4]]);
      }
      ctx.globalAlpha=1;
    }
  }
  furnace(ctx,heat,phase,frame.grade,hasResult);
  if(frame.operator&&hasResult)drawCanvasCharacterSprite(ctx,456,252,frame.operator,83,phase);
  if(frame.result?.lightning&&hasResult)lightning(ctx,phase);
  if(frame.status!=='open'){
    // A latch or temporary timber stopper is not a second heat state.
    stroke(ctx,'#665044',5,[[282,191],[357,215]]);
    stroke(ctx,'#bd8666',1.4,[[283,189],[355,213]]);
    rectangle(ctx,'#332f36',318,198,10,11);rectangle(ctx,'#ad8666',319,198,8,8);
  }
  ctx.restore();
}

export const alchemyGardenPageSize=8;

function bamboo(ctx:Pen,x:number,y:number,size:number,seed:number):void{
  for(let i=0;i<4;i++){
    const dx=i*size/5-size/3;
    const h=size*(.7+unit(seed+i)*.5);
    const a=dx*.28+(unit(seed+i+7)-.5)*10;
    stroke(ctx,'#344c48',size*.034,[[x+dx,y],[x+dx+a*.54,y-h*.55],[x+dx+a,y-h]]);
    for(let j=1;j<5;j++){
      const px=x+dx+a*j/5, py=y-h*j/5, dir=j%2?1:-1;
      stroke(ctx,'#849a6a',1.1,[[px-1.4,py],[px+1.8,py-.6]]);
      polygon(ctx,'#4c7055',[[px,py],[px+dir*size*.17,py-size*.058],[px+dir*size*.27,py-size*.047],[px+dir*size*.17,py+size*.006]]);
      polygon(ctx,'#7d9868',[[px,py-3],[px-dir*size*.13,py-size*.092],[px-dir*size*.24,py-size*.092],[px-dir*size*.13,py-size*.029]]);
    }
  }
}
function gardenBackdrop(ctx:Pen):void{
  rectangle(ctx,shade(ctx,0,217,'#879e8a','#c5b789'),0,0,W,H);
  oval(ctx,glow(ctx,472,37,108,'#f1d89c9b'),472,41,108,90);
  oval(ctx,'#e8d4a2a2',477,41,23,21);
  for(let i=0;i<3;i++){
    const y=83+i*21;
    polygon(ctx,['#a7b297','#829b86','#667f6b'][i],[[0,y+8],[59,y-39],[94,y-11],[155,y-54],[214,y-18],[272,y-35],[336,y-2],[417,y-35],[477,y-10],[538,y-32],[621,y+2],[640,y-14],[640,177],[0,180]]);
  }
  polygon(ctx,shade(ctx,128,320,'#70865a','#405741'),[[0,129],[640,129],[640,320],[0,320]]);
  for(let i=0;i<235;i++){
    const x=unit(i+350)*636,y=132+unit(i+750)*185;
    stroke(ctx,i%4?'#687e5470':'#bac08370',.9,[[x,y],[x+1,y-3],[x+2,y-2]]);
  }
  bamboo(ctx,63,169,97,691);bamboo(ctx,103,145,60,77);bamboo(ctx,583,171,98,741);bamboo(ctx,541,145,57,454);
  for(const y of [126,143]){
    stroke(ctx,'#53604e',4,[[16,y+5],[169,y+8],[483,y+8],[624,y+5]]);
    stroke(ctx,'#a0a778',1.2,[[16,y+4],[169,y+7],[483,y+7],[624,y+4]]);
  }
  for(let i=0;i<20;i++){
    const x=17+i*32;
    stroke(ctx,'#6e694d',4,[[x,125],[x+1,156]]);
    stroke(ctx,'#c1b283',1,[[x,125],[x+1,155]]);
  }
  polygon(ctx,'#455c4c',[[309,152],[332,152],[384,320],[252,320]]);
  polygon(ctx,shade(ctx,156,320,'#8d8870','#b0a080'),[[314,156],[327,156],[368,320],[271,320]]);
  for(const y of [177,192,214,239,271,305]){
    const d=4+(y-150)*.28;
    stroke(ctx,'#746b5e',1,[[321-d,y],[323+d,y]]);
    stroke(ctx,'#c1ae86',1,[[322-d,y-1],[323+d,y-1]]);
  }
}
function soil(ctx:Pen,x:number,y:number,scale:number,seed:number):void{
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  oval(ctx,'#24392c90',2,11,49,15);
  polygon(ctx,'#5c4f3d',[[-49,-8],[-40,-22],[39,-22],[50,-9],[51,12],[43,20],[-43,20],[-50,11]]);
  polygon(ctx,'#ad8c59',[[-49,-9],[-40,-22],[39,-22],[50,-9],[44,12],[-43,12]]);
  polygon(ctx,shade(ctx,-20,11,'#70533d','#986d4c'),[[-43,-8],[-35,-20],[36,-20],[44,-8],[40,8],[-40,8]]);
  for(let i=0;i<6;i++){
    const q=-34+i*12.5;
    stroke(ctx,'#533e35',1.5,[[q,-17],[q*.95,-9],[q*.94,4]]);
    stroke(ctx,'#bd8b5d',.68,[[q+2,-16],[q+1,-9],[q+1,3]]);
  }
  stroke(ctx,'#d5ac73',1.5,[[-47,-8],[-42,10],[43,10],[48,-8]]);
  stroke(ctx,'#806a4c',2,[[-46,14],[-41,17],[42,17],[48,13]]);
  for(let i=0;i<10;i++){
    const dx=unit(seed+i*13)*71-35,dy=unit(seed+i*8)*23-17;
    oval(ctx,i%3?'#806144':'#ca9563',dx,dy,.9+i%2*.4,.7);
  }
  ctx.restore();
}
function plant(ctx:Pen,x:number,y:number,stage:Growth,seed:number,scale:number):void{
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  const wild=stage==='anonymous-growing'||stage==='anonymous-ready';
  if(wild){
    // Anonymous aggregate specimens intentionally carry no name, owner marker, or individual growth trace.
    oval(ctx,'#4c5945',0,3,14,5);
    polygon(ctx,stage==='anonymous-ready'?'#e4c88c':'#8dab71',[[0,2],[-10,-7],[-12,-15],[-5,-12],[0,-6],[4,-16],[10,-18],[9,-9]]);
  }else if(stage==='sown'){
    oval(ctx,'#694b35',0,2,12,4);
    oval(ctx,'#bc9660',0,1,5,1.9);
    oval(ctx,'#e7bb74',0,-1,.9,.9);
  }else {
    const h=stage==='sprout'?15:stage==='leaf'?26:33;
    const sway=(unit(seed)-.5)*8;
    oval(ctx,'#4c593e',0,3,13,5);
    stroke(ctx,'#365141',2,[[0,3],[sway*.35,-h*.4],[sway,-h]]);
    for(let i=0;i<(stage==='sprout'?2:stage==='leaf'?4:6);i++){
      const d=i%2?1:-1, yy=-h*.19-i*h*.105, leaf=stage==='sprout'?9:14+i%2*4;
      const q=sway*i/7;
      polygon(ctx,i%2?'#7faa62':'#538456',[[q,yy],[q+d*leaf*.34,yy-leaf*.44],[q+d*leaf,yy-leaf*.54],[q+d*leaf*.74,yy-leaf*.13],[q+d*leaf*.41,yy+1]]);
      stroke(ctx,'#a0be79',.7,[[q,yy],[q+d*leaf*.72,yy-leaf*.38]]);
    }
    if(stage==='flower'){
      const petal=['#d39eaa','#e4bdc4','#e0c88b'][Math.floor(unit(seed+40)*3)];
      for(let i=0;i<6;i++){
        const theta=i*TAU/6;
        oval(ctx,petal,sway+Math.cos(theta)*7,-h+Math.sin(theta)*7,5,2.8,theta);
      }
      oval(ctx,'#ffe7a1',sway,-h,3.1,3.1);
      oval(ctx,'#fbf0cf',sway-1,-h-1,1.3,1.3);
    }
  }
  ctx.restore();
}
function gardenCell(frame:AlchemyWorkshopGarden,index:number):{stage:Growth;seed:number}|undefined{
  const plot=frame.plots[index];
  if(plot){
    let seed=0;
    for(const ch of plot.id)seed=Math.imul(seed,31)+(ch.codePointAt(0)??0);
    return {stage:plot.stage,seed};
  }
  const aggregateIndex=index-frame.plots.length;
  if(aggregateIndex<frame.anonymousGrowing)return {stage:'anonymous-growing',seed:index};
  if(aggregateIndex<frame.anonymousGrowing+frame.anonymousReady)return {stage:'anonymous-ready',seed:index};
}

/** Only the selected 8-slot page is painted. No unrecorded plant identities or decoration beds. */
export function drawSeedGarden(ctx:Pen,frame:AlchemyWorkshopGarden,width:number,height:number,page=0):void{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const offset=Number.isSafeInteger(page)&&page>=0?page*alchemyGardenPageSize:0;
  ctx.save();ctx.scale(width/W,height/H);
  gardenBackdrop(ctx);
  const cols=[91,211,427,550];
  for(let i=0;i<alchemyGardenPageSize;i++){
    const visual=gardenCell(frame,offset+i);
    if(!visual)continue;
    const row=Math.floor(i/4),x=cols[i%4],y=row===0?185:257;
    const factor=row===0?.87:1.12;
    soil(ctx,x,y,factor,visual.seed);
    plant(ctx,x,y-3,visual.stage,visual.seed,factor);
  }
  ctx.restore();
}

import { drawSceneStage } from './sceneStageRenderer';
import { drawStageFigure } from './sceneStageSprites';
import type { VisualDuelArenaFrame } from './visualDuelArenaModel';

type Pen = CanvasRenderingContext2D;
type Point = readonly [number,number];
type Theme = VisualDuelArenaFrame['theme'];
type Fighter = VisualDuelArenaFrame['left'];

const stageWidth=640,stageHeight=360;
interface ArenaInk {shade:string;bed:string;edge:string;top:string;lit:string;wing:string}
const inks={
  sword_peak:{shade:'#2b424d',bed:'#56767b',edge:'#94ada0',top:'#748d85',lit:'#d8e4bd',wing:'#455a64'},
  pill_valley:{shade:'#394946',bed:'#6f7056',edge:'#a6ad79',top:'#8b8e6a',lit:'#e6ce95',wing:'#4c6056'},
  market:{shade:'#442d41',bed:'#79565d',edge:'#b3897d',top:'#986e6d',lit:'#edc391',wing:'#6b4555'},
  blood_abyss:{shade:'#2f2337',bed:'#544050',edge:'#955b64',top:'#754e59',lit:'#ea9e83',wing:'#473549'},
  north_vein:{shade:'#344762',bed:'#566c82',edge:'#a6bdc5',top:'#8096a9',lit:'#d8e6dc',wing:'#4f6177'},
  countryside:{shade:'#374b50',bed:'#626f62',edge:'#9eab87',top:'#808b70',lit:'#d4ddab',wing:'#58685f'},
} satisfies Record<Theme,ArenaInk>;

function poly(ctx:Pen,c:string,points:readonly Point[]):void{
  ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
  ctx.closePath();ctx.fill();
}
function stroke(ctx:Pen,c:string,w:number,points:readonly Point[]):void{
  ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
  ctx.stroke();
}
function rect(ctx:Pen,c:string,x:number,y:number,w:number,h:number):void{
  ctx.fillStyle=c;ctx.fillRect(x,y,w,h);
}
function oval(ctx:Pen,c:string,x:number,y:number,r1:number,r2:number):void{
  ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,r1,r2,0,0,Math.PI*2);ctx.fill();
}
function wash(ctx:Pen,x:number,y:number,c:string,r:number,alpha:number):void{
  ctx.save();ctx.globalAlpha=alpha;
  const glow=ctx.createRadialGradient(x,y,0,x,y,r);
  glow.addColorStop(0,c+'d8');glow.addColorStop(.34,c+'73');glow.addColorStop(1,c+'00');
  ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
}
function rune(ctx:Pen,x:number,y:number,k:number,c:string):void{
  stroke(ctx,c,1,[[x-k,y],[x,y-k*.47],[x+k,y],[x,y+k*.47],[x-k,y]]);
  stroke(ctx,c,.65,[[x-k*.63,y],[x,y-k*.30],[x+k*.63,y],[x,y+k*.30],[x-k*.63,y]]);
  rect(ctx,c,x-.75,y-.6,1.5,1.2);
}
function post(ctx:Pen,x:number,c:ArenaInk):void{
  const y=279;
  poly(ctx,c.shade,[[x-13,y+9],[x-5,y+4],[x+6,y+4],[x+13,y+9],[x+10,y+15],[x-10,y+15]]);
  poly(ctx,c.wing,[[x-6,y+8],[x-6,y-30],[x+5,y-30],[x+6,y+8]]);
  poly(ctx,c.edge,[[x-4,y+7],[x-4,y-28],[x+3,y-28],[x+4,y+7],[x+1,y+8]]);
  poly(ctx,c.shade,[[x-9,y-28],[x-5,y-33],[x+4,y-33],[x+9,y-28],[x+6,y-24],[x-7,y-24]]);
  rect(ctx,c.lit,x-4,y-30,8,1.45);
  rect(ctx,c.top,x+1,y-22,2.1,26);
}
function platform(ctx:Pen,c:ArenaInk):void{
  // The horizontal fighting plane is illustrative. It owns no venue/action markers.
  oval(ctx,'#15283980',319,319,272,23);
  poly(ctx,c.shade,[[52,298],[102,250],[134,230],[506,230],[543,250],[588,298],[564,322],[75,322]]);
  poly(ctx,c.bed,[[54,298],[588,298],[562,318],[76,318]]);
  poly(ctx,c.edge,[[57,300],[584,300],[569,306],[69,306]]);
  poly(ctx,c.top,[[53,296],[104,250],[136,232],[503,232],[542,251],[586,296],[555,303],[85,303]]);
  stroke(ctx,c.lit,1.02,[[77,291],[110,259],[139,238],[501,238],[533,258],[563,290]]);
  stroke(ctx,c.shade,.85,[[70,298],[136,243],[506,243],[570,298]]);
  ctx.save();ctx.globalAlpha=.52;
  for(let j=0;j<4;j++){
    const y=251+j*13,r=106-j*13;
    stroke(ctx,c.bed,1,[[r,y],[640-r,y]]);
    for(let i=0;i<8;i++){
      const x= r+16+i*(640-r*2-31)/7+(j%2?5:0);
      stroke(ctx,c.wing,.86,[[x,y],[x+(x-320)*.027,y+11]]);
      rect(ctx,c.lit,x+2,y+1.8,13+((i*23+j*17)%11),.65);
    }
  }
  ctx.restore();
  ctx.strokeStyle=c.lit;ctx.lineWidth=1.1;ctx.globalAlpha=.71;
  ctx.beginPath();ctx.ellipse(320,278,92,20,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle=c.bed;ctx.beginPath();ctx.ellipse(320,278,84,17,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  rune(ctx,320,278,35,c.lit);rune(ctx,241,279,9,c.edge);rune(ctx,399,279,9,c.edge);
  for(const x of [80,560])post(ctx,x,c);
  for(const x of [107,225,343,461,550])rect(ctx,c.shade,x,310,1.65,7);
}

function venueWing(ctx:Pen,kind:VisualDuelArenaFrame['kind'],c:ArenaInk):void{
  if(kind==='dungeon'){
    // Set dressing for a proved Sanctum encounter only, not a route or inventory fixture.
    poly(ctx,'#263343',[[0,0],[640,0],[640,277],[576,257],[544,186],[533,128],[482,105],[451,63],[399,43],
      [336,68],[277,41],[206,64],[181,118],[129,137],[113,194],[66,258],[0,281]]);
    poly(ctx,'#3c4e58',[[0,72],[50,61],[99,81],[150,70],[193,46],[241,25],[281,28],[283,42],[206,66],
      [182,117],[136,133],[111,188],[78,217],[53,249],[0,263]]);
    poly(ctx,'#405361',[[640,58],[596,65],[554,77],[515,63],[468,44],[416,18],[391,29],[400,43],[452,64],
      [482,103],[535,127],[547,186],[570,204],[589,252],[640,264]]);
    poly(ctx,'#4a5d68',[[0,111],[55,89],[82,94],[104,144],[79,129],[55,136],[39,188],[0,213]]);
    poly(ctx,'#536371',[[640,94],[606,96],[569,137],[574,182],[587,166],[613,208],[640,228]]);
    for(const [x,y] of [[42,214],[595,213],[111,155],[534,151]]){
      wash(ctx,x,y,'#9cb4ab',17,.57);
      poly(ctx,'#9bbcb4',[[x,y-8],[x+3,y-1],[x+2,y+4],[x-3,y+3]]);
    }
  }else if(kind==='tournament'||kind==='sect_challenge'){
    for(const [x,d] of [[96,1],[544,-1]]){
      rect(ctx,c.shade,x-2,161,4,75);
      rect(ctx,c.edge,x-1,159,1.1,75);
      stroke(ctx,c.lit,1.2,[[x-11,169],[x+11,169]]);
      poly(ctx,c.wing,[[x-7,169],[x+7,169],[x+9*d,201],[x,197],[x-7,203]]);
      rune(ctx,x,183,5,c.lit);
      rect(ctx,c.edge,x-1,162,2.2,5);
    }
  }
}

function bossSprite(ctx:Pen,x:number,y:number,time:number,facing:number,push:number):void{
  ctx.save();ctx.translate(x,y);ctx.scale(facing,1);
  const f=time===0?0:Math.sin(time*4.8)*1.6;
  oval(ctx,'#0b1a2a72',-4,1,68,11);
  ctx.translate(-push*.16,-f);
  // Original four-legged horned guardian, a symbolic illustration of the admitted guardian,
  // not a claim about an unrecorded animal species, equipment or combat phase.
  poly(ctx,'#2c2b3e',[[-46,-8],[-56,-16],[-59,-37],[-51,-63],[-22,-77],[5,-74],[18,-60],[37,-53],[47,-49],[52,-33],[43,-18],[37,-16],[34,0],[19,1],[9,-11],[-16,-10],[-23,0],[-34,0],[-39,-12]]);
  poly(ctx,'#53485c',[[-43,-13],[-52,-23],[-50,-46],[-35,-61],[-13,-65],[1,-64],[22,-51],[38,-41],[45,-30],[39,-22],[26,-20],[29,-5],[18,-3],[11,-18],[-15,-19],[-27,-4],[-35,-4],[-34,-20]]);
  poly(ctx,'#46566a',[[-53,-42],[-48,-63],[-22,-77],[-5,-78],[8,-64],[-7,-53],[-29,-51],[-37,-38]]);
  poly(ctx,'#869299',[[-48,-59],[-24,-74],[-7,-75],[-17,-68],[-31,-61],[-38,-54]]);
  poly(ctx,'#637481',[[-29,-50],[-18,-63],[-7,-69],[3,-65],[15,-51],[7,-43],[-8,-45],[-15,-38],[-24,-40]]);
  poly(ctx,'#945d67',[[11,-51],[20,-64],[37,-64],[48,-51],[50,-35],[44,-25],[27,-25],[20,-34],[13,-39]]);
  poly(ctx,'#aa746f',[[23,-60],[35,-60],[45,-49],[40,-44],[33,-53],[22,-51],[17,-46]]);
  poly(ctx,'#d8c3a1',[[26,-59],[20,-66],[16,-79],[18,-88],[22,-74],[30,-66],[34,-61]]);
  poly(ctx,'#d8c3a1',[[40,-55],[45,-69],[54,-77],[57,-80],[55,-68],[48,-57],[45,-51]]);
  poly(ctx,'#423249',[[25,-37],[34,-34],[43,-36],[49,-41],[51,-33],[44,-24],[30,-24],[23,-29]]);
  rect(ctx,'#ed966f',35,-45,6,2);
  rect(ctx,'#ffe4ad',39,-45,2,1.2);
  stroke(ctx,'#e0a587',1.1,[[17,-46],[22,-51],[29,-50]]);
  stroke(ctx,'#c8897d',1.8,[[27,-37],[35,-33],[43,-35]]);
  for(const u of [-30,-23,17,26])rect(ctx,'#ab9695',u,-3,3.8,2.8);
  ctx.restore();
}

function fighter(ctx:Pen,entry:Fighter,x:number,y:number,facing:number,engaged:boolean,time:number,push:number):void{
  if(entry.boss){bossSprite(ctx,x,y,time,facing,push);return;}
  if(!entry.sprite)return;
  ctx.save();ctx.translate(x,y);ctx.scale(1.64,1.64);
  drawStageFigure(ctx,{appearance:entry.sprite.appearance,pose:engaged?'fight':'idle'},time,facing,facing===1?0:1.7);
  ctx.restore();
}

const sparks={
  ordinary:{light:'#ffedb7',edge:'#e5ad72',trail:'#edd9a4'},
  school:{light:'#d5f8ef',edge:'#79d0c2',trail:'#9be6d0'},
  forbidden:{light:'#ffc2d4',edge:'#d55686',trail:'#f88aa5'},
  dao:{light:'#dfddff',edge:'#a396e3',trail:'#b2a6ef'},
} as const;

function contractFlash(ctx:Pen,col:(typeof sparks)[keyof typeof sparks],a:number,reach:number):void {
  if(a<=0)return;
  const x=320,y=231;
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.globalAlpha=a;
  ctx.strokeStyle=col.trail;ctx.lineWidth=2.8;
  ctx.beginPath();ctx.moveTo(x-86*reach,y+4);ctx.quadraticCurveTo(x-37*reach,y-36,x+20*reach,y-20);
  ctx.moveTo(x+86*reach,y+13);ctx.quadraticCurveTo(x+41*reach,y-53,x-20*reach,y-16);ctx.stroke();
  ctx.strokeStyle=col.light;ctx.lineWidth=.9;
  ctx.beginPath();ctx.moveTo(x-73*reach,y+4);ctx.quadraticCurveTo(x-25*reach,y-32,x+15*reach,y-19);
  ctx.moveTo(x+77*reach,y+8);ctx.quadraticCurveTo(x+40*reach,y-44,x-7*reach,y-19);ctx.stroke();
  ctx.restore();
  wash(ctx,x,y-12,col.light,51,a*.8);
  ctx.save();ctx.globalAlpha=a;
  poly(ctx,col.light,[[x,y-30],[x+3,y-16],[x+23,y-11],[x+4,y-8],[x,y+5],[x-4,y-8],[x-22,y-11],[x-4,y-15]]);
  for(let i=0;i<11;i++){
    const rad=i*2.39,r=(13+i*2.7)*reach,tr=4+i%3*2;
    const px=x+Math.cos(rad)*r,py=y-13+Math.sin(rad)*r*.85;
    stroke(ctx,i%3?col.trail:col.light,.94,[[px,py],[px+Math.cos(rad)*tr,py+Math.sin(rad)*tr]]);
  }
  ctx.restore();
}

function recoilMark(ctx:Pen,x:number,y:number,side:number,col:(typeof sparks)[keyof typeof sparks],alpha:number):void{
  if(alpha<=0)return;
  wash(ctx,x-side*8,y-43,col.edge,31,alpha*.58);
  ctx.save();ctx.globalAlpha=alpha;
  for(let i=0;i<6;i++){
    const px=x+side*(11+i*4),py=y-53+i*5;
    stroke(ctx,i%3?col.edge:col.light,1,[[px,py],[px+side*(3+i%3*2),py-4+i%3*3]]);
  }
  ctx.restore();
}

const envelope=(p:number,center:number,span:number)=>Math.max(0,1-Math.abs((p-center)/span));

/** Read-only illustration, one aggregate native contact. Undefined progress is a reduced-motion-safe still. */
export function drawVisualDuelArena(ctx:Pen,frame:VisualDuelArenaFrame,width:number,height:number,progress?:number):void{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const moving=progress!==undefined&&Number.isFinite(progress);
  const p=moving?Math.max(0,Math.min(1,progress)):.64;
  const engaged=frame.damages.length>0||frame.outcome!==undefined||frame.accent!==undefined;
  const ink=inks[frame.theme];
  const col=sparks[frame.accent??'ordinary'];
  const phase=engaged&&moving?p*1.15:0;
  const close=engaged?(moving?envelope(p,.47,.47):.69):0;
  const hitLeft=frame.damages.some(row=>row.target==='left'),hitRight=frame.damages.some(row=>row.target==='right');
  const recoil=moving?envelope(p,.67,.25):.44;
  const lpush=hitLeft?recoil*29:0,rpush=hitRight?recoil*29:0;
  const xl=166+close*80-lpush,xr=474-close*80+rpush;
  const y=286;

  ctx.save();ctx.scale(width/stageWidth,height/stageHeight);
  drawSceneStage(ctx,{theme:frame.theme,season:frame.season,historical:frame.historical,cast:[]},stageWidth,stageHeight,0);
  venueWing(ctx,frame.kind,ink);
  platform(ctx,ink);
  if(engaged){
    const glow=moving?envelope(p,.48,.20)*.78:.36;
    if(glow>0)wash(ctx,320,251,col.edge,105,glow*.59);
    if(moving&&close>.2){
      ctx.save();ctx.globalAlpha=close*.44;
      if(frame.left.sprite)stroke(ctx,col.trail,1.9,[[xl-72,y-9],[xl-12,y-15],[xl+7,y-12]]);
      if(frame.right.sprite)stroke(ctx,col.trail,1.9,[[xr+72,y-8],[xr+15,y-14],[xr-6,y-12]]);
      ctx.restore();
    }
  }
  fighter(ctx,frame.left,xl,y,1,engaged,phase,lpush);
  fighter(ctx,frame.right,xr,y,-1,engaged,phase,rpush);
  if(engaged){
    contractFlash(ctx,col,moving?envelope(p,.49,.155):.67,moving?.75+close*.25:1);
    if(hitLeft)recoilMark(ctx,xl,y,-1,col,recoil);
    if(hitRight)recoilMark(ctx,xr,y,1,col,recoil);
  }
  ctx.restore();
}

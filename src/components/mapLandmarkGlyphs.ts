import type {LocationNode} from '../types/world';
import {SPIRIT_ROOT_COLORS} from './SpiritRootBadge';

export const MAP_LANDMARK_MAX_RADIUS=22.5;
export type MapLandmarkMotif='sword-peak'|'pill-cauldron'|'astral-dial'|'blood-moon'|'mountain-gate'|'ancient-portal'|'broken-ravine'|'market-pavilion'|'vein-spring'|'abandoned-quarter';
type Site=Pick<LocationNode,'id'|'type'|'spiritRoot'|'spiritQi'|'x'|'y'>;
type XY=readonly [number,number];
type Glyph={ink:string;wash:string};
const icon:Record<MapLandmarkMotif,Glyph>={
  'sword-peak':{ink:'#d4ead3',wash:'#153437'},'pill-cauldron':{ink:'#e8c793',wash:'#3c2b29'},
  'astral-dial':{ink:'#d1d2ee',wash:'#2a3049'},'blood-moon':{ink:'#ffc1b5',wash:'#482731'},
  'mountain-gate':{ink:'#d7dcc5',wash:'#2d382d'},'ancient-portal':{ink:'#cdd9e9',wash:'#27334e'},
  'broken-ravine':{ink:'#e6b2bf',wash:'#432938'},'market-pavilion':{ink:'#f2d1a2',wash:'#40342c'},
  'abandoned-quarter':{ink:'#b2bab6',wash:'#2b3334'},
  'vein-spring':{ink:'#b5e5de',wash:'#1c3638'},
};
const hex=/^#[0-9a-f]{6}$/iu;
const pi=Math.PI;

export function mapLandmarkMotif(site:Pick<Site,'id'|'type'>):MapLandmarkMotif{
  switch(site.type){
    case 'sect_hq':
      return site.id==='loc-taixu'?'sword-peak':site.id==='loc-danxia'?'pill-cauldron':
        site.id==='loc-tianji'?'astral-dial':'mountain-gate';
    case 'abyss':return site.id==='loc-blood'?'blood-moon':'broken-ravine';
    case 'secret_realm':return 'ancient-portal';
    case 'market':return 'market-pavilion';
    case 'spirit_vein':return 'vein-spring';
  }
}

function path(ctx:CanvasRenderingContext2D,points:readonly XY[],close=false){
  ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
  if(close)ctx.closePath();
}
function ring(ctx:CanvasRenderingContext2D,r:number,start=0,end=2*pi){
  ctx.moveTo(Math.cos(start)*r,Math.sin(start)*r);
  ctx.arc(0,0,r,start,end);
}
function gem(ctx:CanvasRenderingContext2D,x:number,y:number,r:number){
  ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,pi*2);
}
function roof(ctx:CanvasRenderingContext2D,y:number,r:number){
  path(ctx,[[-r,y],[-r*.58,y-.80],[0,y-4],[r*.58,y-.80],[r,y]]);
}
// All silhouettes are local vector ink with no decorative mark beyond the original token.
function drawMotif(ctx:CanvasRenderingContext2D,motif:MapLandmarkMotif){
  ctx.beginPath();
  switch(motif){
    case 'sword-peak':
      path(ctx,[[-11,7],[-7,1],[-4,4],[0,-3],[4,3],[6,1],[11,7]]);
      path(ctx,[[2,-1],[7,-10],[8,-11],[8,-6],[4,1]]);
      path(ctx,[[.5,-2],[5,1.6]]);path(ctx,[[2,0],[.6,3]]);
      break;
    case 'pill-cauldron':
      path(ctx,[[-8,-2],[8,-2],[7,4],[4,7],[-4,7],[-7,4]],true);
      path(ctx,[[-9,1],[-11,1],[-11,-3],[-8,-3]]);path(ctx,[[9,1],[11,1],[11,-3],[8,-3]]);
      path(ctx,[[-5,6],[-6,9]]);path(ctx,[[5,6],[6,9]]);
      ctx.moveTo(-2,-5);ctx.quadraticCurveTo(-6,-8,-2,-10);
      ctx.moveTo(3,-5);ctx.quadraticCurveTo(6,-8,3,-11);
      break;
    case 'astral-dial':
      ring(ctx,8,0,pi*2);
      path(ctx,[[0,-10],[2,-2],[10,0],[2,2],[0,10],[-2,2],[-10,0],[-2,-2]],true);
      break;
    case 'blood-moon':
      ctx.moveTo(3,-10);ctx.bezierCurveTo(-8,-10,-12,-3,-9,3);
      ctx.bezierCurveTo(-6,9,2,11,8,5);
      ctx.bezierCurveTo(0,6,-5,-2,3,-10);
      path(ctx,[[5,-4],[8,-2],[10,-4],[8,-7]],true);
      break;
    case 'mountain-gate':
      roof(ctx,-1,11);roof(ctx,-5,7);
      path(ctx,[[-7,-.4],[-7,7],[7,7],[7,-.4]]);
      path(ctx,[[-2.8,7],[-2.8,2],[2.8,2],[2.8,7]]);
      break;
    case 'ancient-portal':
      path(ctx,[[-8,8],[-8,-4],[-3,-9],[3,-9],[8,-4],[8,8]],true);
      path(ctx,[[-4,7],[-4,-3],[0,-6],[4,-3],[4,7]]);
      gem(ctx,0,1,1.5);
      break;
    case 'broken-ravine':
      path(ctx,[[-10,7],[-5,-7],[-1,-4],[-4,1],[-1,6]]);
      path(ctx,[[3,8],[2,4],[7,1],[4,-5],[9,-8],[10,5]]);
      break;
    case 'market-pavilion':
      roof(ctx,-3,11);roof(ctx,-6,6);
      path(ctx,[[-7,-2],[-7,7],[7,7],[7,-2]]);
      path(ctx,[[-2.5,7],[-2.5,4],[2.5,4],[2.5,7]]);
      break;
    case 'abandoned-quarter':
      path(ctx,[[-10,-.5],[-5,-6],[-1,-4],[2,-6],[10,0]]);
      path(ctx,[[-8,1],[-8,8],[-3,8]]);
      path(ctx,[[8,1],[8,8],[3,8]]);
      path(ctx,[[-2,7],[-.5,3],[2,6]]);
      break;
    case 'vein-spring':
      gem(ctx,0,-6,2.4);
      for(const y of [-.5,4,8]){
        ctx.moveTo(-10,y);
        ctx.bezierCurveTo(-5,y-3,2,y+2,10,y-1.5);
      }
      break;
  }
  ctx.stroke();
  ctx.beginPath();
  if(motif==='astral-dial'){
    gem(ctx,-8,-8,1);gem(ctx,7,7,1);gem(ctx,8,-8,.8);
  }else if(motif==='market-pavilion'){
    gem(ctx,-9,1,1.5);gem(ctx,9,1,1.5);
  }else if(motif==='blood-moon'){
    gem(ctx,-8,-6,.8);gem(ctx,9,3,.8);
  }else{
    gem(ctx,-11,2,1.0);gem(ctx,11,2,1.0);
  }
  ctx.fill();
}

/** Paint an already-authorized present map site at the exact supplied native/display pin. */
export function drawMapLandmarkGlyph(ctx:CanvasRenderingContext2D,site:Site,ownerColor?:string,abandonedQuarter=false):void{
  if(!Number.isFinite(site.x)||!Number.isFinite(site.y))return;
  const motif=abandonedQuarter?'abandoned-quarter':mapLandmarkMotif(site),paint=icon[motif];
  if(!paint)return;
  const root=SPIRIT_ROOT_COLORS[site.spiritRoot];
  const rim=ownerColor&&hex.test(ownerColor)?ownerColor:paint.ink;
  const qi=Number.isFinite(site.spiritQi)?Math.min(1,Math.max(0,site.spiritQi/100)):0;
  ctx.save();
  try{
    ctx.translate(site.x,site.y);ctx.lineCap='round';ctx.lineJoin='round';
    const glow=ctx.createRadialGradient(0,0,8,0,0,MAP_LANDMARK_MAX_RADIUS);
    glow.addColorStop(0,`${rim}${Math.round(25+qi*48).toString(16).padStart(2,'0')}`);
    glow.addColorStop(1,`${rim}00`);
    ctx.fillStyle=glow;
    ctx.beginPath();ring(ctx,MAP_LANDMARK_MAX_RADIUS);ctx.fill();

    ctx.fillStyle='#111b26';ctx.strokeStyle=rim;ctx.lineWidth=1.3;
    ctx.beginPath();ring(ctx,16.5);ctx.fill();ctx.stroke();
    ctx.fillStyle=paint.wash;ctx.beginPath();ring(ctx,14.1);ctx.fill();
    ctx.strokeStyle=paint.ink;ctx.globalAlpha=.42;ctx.lineWidth=.74;
    ctx.beginPath();ring(ctx,14.1,pi*1.11,pi*1.89);ring(ctx,14.1,pi*.11,pi*.89);ctx.stroke();

    ctx.globalAlpha=1;ctx.strokeStyle=ctx.fillStyle=paint.ink;ctx.lineWidth=1.26;
    drawMotif(ctx,motif);
    ctx.fillStyle=root??paint.ink;
    ctx.beginPath();gem(ctx,0,12.6,1.13);ctx.fill();
  }finally{ctx.restore();}
}

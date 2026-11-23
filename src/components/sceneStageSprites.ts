import type { SceneStageActor } from './sceneStageModel';

type Pen = CanvasRenderingContext2D;
type Point = readonly [number, number];

function patch(ctx: Pen,c: string,points: readonly Point[]): void {
  ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i=1;i<points.length;i++) ctx.lineTo(...points[i]);
  ctx.closePath(); ctx.fill();
}
function rect(ctx: Pen,c: string,x: number,y: number,w: number,h: number): void {
  ctx.fillStyle=c; ctx.fillRect(x,y,w,h);
}
function shade(c: string,to: string,pct: number): string {
  return '#' + [1,3,5].map(i => Math.round(Number.parseInt(c.slice(i,i+2),16)*(1-pct) +
    Number.parseInt(to.slice(i,i+2),16)*pct).toString(16).padStart(2,'0')).join('');
}

function blade(ctx: Pen,x: number,y: number,rotation: number,drawn: boolean,trim: string): void {
  ctx.save(); ctx.translate(x,y); ctx.rotate(rotation);
  if(drawn) {
    patch(ctx,'#273c50',[[-2,-31],[0,-37],[2,-31],[2,-3],[-2,-3]]);
    patch(ctx,'#b3c7ca',[[-1,-30],[0,-35],[1,-30],[1,-4],[-1,-4]]);
    rect(ctx,'#ecf7e5',0,-30,1,22);
  } else {
    patch(ctx,'#22283c',[[-2.25,-26],[0,-28],[2.25,-26],[2.25,12],[0,16],[-2.25,12]]);
    rect(ctx,trim,-1,-24,1,33); rect(ctx,'#977855',-2,9,4,2);
  }
  rect(ctx,'#433546',-4,-5,8,3);
  rect(ctx,trim,-3,-5,6,1);
  rect(ctx,'#59424b',-1,-2,2,8);
  rect(ctx,'#b79974',-2,5,4,2);
  ctx.restore();
}

function sleeve(ctx: Pen,x: number,y: number,flip: number,rotation: number,colors: {dark:string;mid:string;light:string;trim:string;skin:string}): void {
  ctx.save(); ctx.translate(x,y); ctx.scale(flip,1); ctx.rotate(rotation);
  patch(ctx,colors.dark,[[-1,-2],[3,-2],[6,4],[6,12],[-1,13],[-3,7]]);
  patch(ctx,colors.mid,[[0,-1],[3,0],[4,4],[4,10],[-1,11],[-1,5]]);
  rect(ctx,colors.light,2,1,1,8);
  rect(ctx,colors.trim,-1,10,6,2);
  rect(ctx,colors.skin,0,12,4,4);
  ctx.restore();
}

export function drawStageFigure(ctx: Pen,actor: Pick<SceneStageActor, 'appearance' | 'pose'>,time: number,facing: number,phase: number): void {
  const {face,palette,attire,ageBand} = actor.appearance;
  const {pose} = actor;
  const ink = shade(face.ink,'#141a26',.44);
  const hair = ageBand === 'elder' ? '#9c9a9d' : face.ink;
  const hairLight = shade(hair,'#b4a58f',ageBand === 'elder' ? .51 : .24);
  const fabric = palette.fabric, shadeRobe = shade(fabric,'#202638',.68), lightRobe = shade(fabric,palette.trim,.38);
  const skinShade = shade(face.skin,'#7f5465',.31);
  const skinLight = shade(face.skin,'#fff2bc',.37);
  const motion = Math.sin(time * (pose === 'fight' ? 5.2 : pose === 'labor' ? 3.4 : 2.3) + phase);
  const seated = pose === 'cultivate';
  const bob = time === 0 ? 0 : motion > .62 ? 1 : 0;
  const lean = pose === 'labor' ? 2.7 + motion*1.15 : pose === 'fight' ? 1 : 0;

  ctx.save();
  ctx.scale(facing,1);
  ctx.fillStyle='rgba(15,24,34,.46)'; ctx.beginPath(); ctx.ellipse(0,.3,18,4.2,0,0,Math.PI*2); ctx.fill();
  ctx.translate(lean,-bob);
  if (seated) ctx.translate(0,9);

  if (pose === 'cultivate') {
    ctx.strokeStyle=palette.spirit;
    ctx.globalAlpha=.46 + motion*.11;
    ctx.lineWidth=.8;
    ctx.beginPath(); ctx.ellipse(0,-8,19,6,0,.25,Math.PI-.28); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,-9,23,8,0,Math.PI+.32,Math.PI*2-.32); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if (pose === 'idle' || pose === 'talk' || pose === 'fight') {
    if (pose !== 'fight') blade(ctx,-10,-24,-.53,false,palette.trim);
  }

  // Boots, under-robe and independently shaded front panels.
  const rightFoot = pose === 'fight' ? 10 : pose === 'labor' ? 7 : 5;
  if (seated) {
    patch(ctx,ink,[[-21,-11],[-15,-17],[-2,-21],[14,-19],[22,-13],[22,-8],[17,-6],[-17,-6],[-22,-8]]);
    patch(ctx,fabric,[[-19,-11],[-12,-16],[0,-18],[13,-16],[20,-11],[17,-8],[-16,-8]]);
    rect(ctx,palette.trim,-12,-10,24,1);
  } else {
    patch(ctx,ink,[[-10,-11],[-3,-11],[-3,-1],[-5,1],[-13,1],[-13,-2],[-10,-4]]);
    patch(ctx,ink,[[3,-11],[rightFoot+3,-11],[rightFoot+4,-4],[rightFoot+7,-2],[rightFoot+6,1],[rightFoot-2,1],[rightFoot-2,-3]]);
    rect(ctx,'#a18169',-11,-2,7,1); rect(ctx,'#a18169',rightFoot,-2,6,1);
  }

  const hem = seated ? -12 : -4;
  const flare = pose === 'fight' ? 6 : 0;
  patch(ctx,ink,[[-3,-35],[-9,-34],[-13,-29],[-10,-24],[-8,-19],[-13-flare,hem-6],[-14-flare,hem-2],[-9,hem],[2,hem+1],[12+flare,hem-3],[10+flare,hem-7],[7,-20],[9,-25],[12,-28],[8,-33],[3,-35]]);
  patch(ctx,shadeRobe,[[-8,-32],[-11,-28],[-7,-20],[-12-flare,hem-3],[-7,hem-1],[1,hem],[11+flare,hem-4],[6,-20],[10,-28],[7,-32]]);
  patch(ctx,fabric,[[-5,-31],[6,-31],[5,-20],[8+flare,hem-5],[0,hem-2],[-9-flare,hem-5],[-5,-20]]);
  patch(ctx,lightRobe,[[-8,-30],[-6,-23],[-3,-20],[-4,hem-5],[-8,hem-4],[-10-flare,hem-5],[-6,-19]]);
  patch(ctx,lightRobe,[[2,-19],[4,-19],[7+flare,hem-6],[3,hem-4],[1,hem-7]]);
  if (attire === 'layered') {
    patch(ctx,palette.trim,[[-7,-19],[-6,-18],[-10-flare,hem-4],[-13-flare,hem-4]]);
    patch(ctx,palette.trim,[[5,-19],[6,-19],[10+flare,hem-5],[8+flare,hem-5]]);
  }
  patch(ctx,palette.trim,[[-9,-31],[-6,-33],[-1,-25],[3,-33],[7,-32],[2,-24],[-1,-22],[-4,-26]]);
  patch(ctx,shadeRobe,[[-7,-21],[7,-21],[8,-18],[-8,-17]]);
  rect(ctx,palette.trim,-7,-20,14,1);
  rect(ctx,palette.spirit,1,-21,2,3);
  if(attire === 'layered' || pose === 'fight') {
    const tail = motion * 1.8;
    patch(ctx,palette.trim,[[2,-20],[3,-20],[8+tail,-11],[6+tail,-9],[4,-15]]);
  }

  const arms = {dark:ink,mid:fabric,light:lightRobe,trim:palette.trim,skin:face.skin};
  if(pose === 'fight') {
    sleeve(ctx,-9,-30,-1,-.48,arms);
    sleeve(ctx,8,-29,1,-1.0 - motion*.28,arms);
    blade(ctx,20+motion*2,-22-motion*2,.83 + motion*.38,true,palette.trim);
  } else if(pose === 'labor') {
    sleeve(ctx,-8,-30,-1,-.4,arms);
    sleeve(ctx,8,-29,1,-.68 + motion*.28,arms);
    ctx.save(); ctx.translate(15,-18); ctx.rotate(-.43 + motion*.23);
    rect(ctx,'#ae885e',0,-11,2,28);
    patch(ctx,'#6b6870',[[-6,12],[7,12],[8,14],[-7,15]]);
    rect(ctx,'#a9a69e',-6,12,12,1);
    ctx.restore();
  } else if(seated) {
    sleeve(ctx,-9,-30,-1,.45,arms);
    sleeve(ctx,9,-30,1,.45,arms);
  } else {
    sleeve(ctx,-9,-30,-1,-.06,arms);
    sleeve(ctx,8,-29,1,pose === 'talk' ? -1.31 - motion*.2 : -.03,arms);
  }

  // Hair silhouette follows the canonical appearance; fabric behind hair remains readable.
  const length = face.hair === 0 ? 1 : face.hair === 1 ? 8 : 14;
  patch(ctx,ink,[[-7,-48],[-4,-52],[2,-54],[7,-50],[9,-45],[9,-37+length*.2],[6,-34+length*.57],[-3,-34+length*.66],[-8,-35+length*.37],[-9,-42]]);
  patch(ctx,hair,[[-7,-46],[-2,-52],[3,-52],[7,-48],[7,-39],[-6,-38+length*.61],[-7,-35+length*.28]]);
  if(face.hair >= 2) {
    patch(ctx,hairLight,[[-6,-46],[-5,-49],[-4,-43],[-5,-29],[-6,-26],[-7,-36]]);
  }
  if(face.hair === 1 || face.hair === 3) {
    patch(ctx,ink,[[-5,-51],[-3,-57],[2,-58],[4,-55],[3,-51]]);
    rect(ctx,hairLight,-2,-56,3,2);
  }
  const jaw = face.jaw >= 2 ? 4 : 3;
  patch(ctx,skinShade,[[-5,-45],[-2,-48],[3,-48],[6,-45],[6,-39],[jaw,-36],[-2,-36],[-5,-39]]);
  patch(ctx,face.skin,[[-3,-45],[0,-47],[4,-46],[5,-43],[5,-39],[3,-37],[-2,-38],[-3,-40]]);
  rect(ctx,skinLight,1,-44,4,4);
  patch(ctx,hair,[[-7,-47],[-4,-51],[1,-52],[6,-50],[7,-47],[6,-42],[4,-45],[3,-47],[0,-45],[-4,-42],[-4,-45],[-6,-41]]);
  patch(ctx,hairLight,[[-6,-47],[-4,-50],[0,-51],[3,-50],[-1,-49],[-4,-47]]);
  const eye = face.eyes === 3 ? -1 : 0;
  rect(ctx,ink,1+eye,-42,2,1); rect(ctx,'#65474e',3,-38.5,1.4,.8);
  if(ageBand === 'elder') rect(ctx,'#c4aaa5',3,-43,2,.6);
  if(face.ornament) {
    rect(ctx,palette.trim,-4,-49,8,1);
    rect(ctx,palette.spirit,0,-49,2,1.5);
    if(face.ornament >= 2) rect(ctx,palette.trim,-3,-42,1,4);
  }
  ctx.restore();
}

export function drawStageCast(ctx: Pen,actors: readonly SceneStageActor[],time: number): void {
  if (!actors.length) return;
  const columns = Math.min(6, actors.length);
  const totalRows = Math.ceil(actors.length / columns);
  const scale = totalRows > 2 ? Math.max(.52, 1.22 - .1 * (totalRows - 1)) : actors.length > 3 ? 1.32 : 1.72;
  const spacing = actors.length <= 2 ? 118 : actors.length === 3 ? 102 : 72;
  const dy = Math.min(28, 64 / totalRows);
  for (let i=0; i<actors.length; i++) {
    const row = Math.floor(i/columns);
    const col = i % columns;
    const rowSize = Math.min(columns, actors.length - row*columns);
    const x = 319 + (col-(rowSize-1)/2)*spacing + (row % 2 ? 15 : 0);
    const y = 322 - (totalRows-1-row)*dy + (Math.abs(col-(rowSize-1)/2)%1 ? -2 : 2);
    ctx.save(); ctx.translate(Math.round(x),Math.round(y)); ctx.scale(scale,scale);
    drawStageFigure(ctx,actors[i],time,col <= (rowSize-1)/2 ? 1 : -1,i*1.61);
    ctx.restore();
  }
}

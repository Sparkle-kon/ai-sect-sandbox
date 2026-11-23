import type { SceneStageFrame } from './sceneStageModel';
import { drawStageCast } from './sceneStageSprites';

type Pen = CanvasRenderingContext2D;
type Point = readonly [number, number];
type Theme = SceneStageFrame['theme'];
export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 360;

interface Colors {
  sky: readonly [string, string]; haze: string; light: string;
  peaks: readonly [string, string, string]; face: string;
  soil: readonly [string, string]; path: readonly [string, string]; leaf: readonly [string, string];
}

const palettes: Record<Theme, Colors> = {
  sword_peak: { sky: ['#233f68', '#bccfc2'], haze:'#d5e1cc', light:'#ffe3a2', peaks:['#7896a8','#4b718a','#345769'], face:'#6a8a92', soil:['#436760','#1c403c'], path:['#91ad9f','#567f76'], leaf:['#173a3c','#529580'] },
  pill_valley: { sky:['#343e6a','#e2ca9b'], haze:'#f5cfac', light:'#ffd194', peaks:['#7b8fa3','#588387','#386863'], face:'#799278', soil:['#4a744e','#223f38'], path:['#c4a37c','#6f774e'], leaf:['#274f45','#78a660'] },
  market: { sky:['#332946','#e39279'], haze:'#ffbc99', light:'#ffd799', peaks:['#8b6277','#685470','#4c4357'], face:'#947585', soil:['#654c52','#372b42'], path:['#ae8b82','#644e56'], leaf:['#382c46','#775d60'] },
  blood_abyss: { sky:['#200f26','#924945'], haze:'#ec7d61', light:'#ffc479', peaks:['#77404e','#57273b','#381f30'], face:'#8c454e', soil:['#47293a','#1f1826'], path:['#805355','#432d3c'], leaf:['#241b2c','#814856'] },
  north_vein: { sky:['#253d63','#a9bfdb'], haze:'#d6e5ed', light:'#fce5ba', peaks:['#6c89a5','#557391','#3c536e'], face:'#9baebf', soil:['#849eae','#49566f'], path:['#c0cad2','#6b818f'], leaf:['#2a445c','#83b1b1'] },
  countryside: { sky:['#2c5270','#d9d5a5'], haze:'#f7e1af', light:'#ffe7a1', peaks:['#839aa1','#607e7d','#46685b'], face:'#7e9b7f', soil:['#657e47','#304b3b'], path:['#c3ad80','#82764d'], leaf:['#2b5141','#8f9f62'] },
};

function stagePolygon(ctx: Pen, color: string, points: readonly Point[]): void {
  if (!points.length) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function stageRect(ctx: Pen, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function oval(ctx: Pen, color: string, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function gradient(ctx: Pen, y: number, end: number, stops: readonly (readonly [number, string])[]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, end);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

function rand(n: number): number {
  const v = Math.imul(n | 0, 1597334677);
  return ((v ^ (v >>> 19)) >>> 0) / 4294967296;
}

function cloud(ctx: Pen, color: string, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(Math.round(x), y);
  ctx.scale(s, s);
  stagePolygon(ctx, color, [[-64,2],[-49,0],[-44,-5],[-34,-5],[-29,-11],[-15,-12],[-12,-17],[4,-18],[9,-12],[24,-11],[30,-6],[40,-6],[45,-2],[62,0],[53,4],[-50,5]]);
  stageRect(ctx, color, -27, 7, 48, 1);
  stageRect(ctx, color, 33, 5, 12, 1);
  ctx.restore();
}

function vista(ctx: Pen, theme: Theme, c: Colors, season: SceneStageFrame['season'], time: number): void {
  ctx.fillStyle = gradient(ctx, 0, 196, [[0,c.sky[0]], [.87,c.sky[1]], [1,c.haze]]);
  ctx.fillRect(0, 0, 640, 207);
  const winter = season === 'winter' || theme === 'north_vein';
  const sunX = theme === 'blood_abyss' ? 470 : 432, sunY = theme === 'market' ? 75 : 64;
  oval(ctx, c.haze, sunX, sunY, 34, 34);
  oval(ctx, theme === 'blood_abyss' ? '#e76d67' : c.light, sunX, sunY, 27, 27);
  ctx.globalAlpha = .24;
  for (let i = 0; i < 7; i++) cloud(ctx, c.haze, (38 + i * 109 + time * (.7 + i / 12)) % 786 - 72, 38 + rand(i + 21) * 100, .44 + rand(i + 17) * 1.12);
  ctx.globalAlpha = 1;
  const kind = theme === 'sword_peak' ? 42 : theme === 'blood_abyss' ? 30 : 12;
  for (let layer = 0; layer < 3; layer++) {
    const ridge: Point[] = [[-8,213]];
    const face: Array<readonly [Point, Point, Point]> = [];
    for (let i = -1; i < 14; i++) {
      const rng = (i + 6) * 31 + layer * 563;
      const x = i * 49 + layer * 18;
      const y = 125 + layer * 15 + rand(rng) * 37 - rand(rng + 7) * kind;
      const tip: Point = [x + 15, y];
      const flank: Point = [x + 48, y + 28 + rand(rng + 3) * 17];
      ridge.push([x,y + 26], [x + 8,y + 9],tip,[x + 22,y + 8],flank);
      face.push([tip,flank,[x + 27,y + 45]]);
    }
    ridge.push([650,213]);
    stagePolygon(ctx, c.peaks[layer], ridge);
    ctx.globalAlpha = layer === 0 ? .18 : .42;
    for (const [[x, y], [rx, ry], [bx, by]] of face) {
      stagePolygon(ctx, c.face, [[x,y],[x + 7,y + 8],[rx,ry],[bx,by],[bx + 1,y + 25],[x + 3,y + 12]]);
      if (winter && layer !== 0) stagePolygon(ctx, c.haze, [[x,y],[x + 7,y + 8],[x + 15,y + 17],[x + 8,y + 14],[x + 5,y + 17],[x + 2,y + 9],[x - 6,y + 12]]);
    }
    ctx.globalAlpha = 1;
    if (theme !== 'blood_abyss') {
      ctx.globalAlpha = layer === 2 ? .57 : .23;
      cloud(ctx,c.haze, 102 + layer * 178 + Math.sin(time * .16) * 11, 149 + layer * 17, 2.55);
      cloud(ctx,c.haze, 466 - layer * 98 - Math.sin(time * .12) * 13, 154 + layer * 18, 1.9);
      ctx.globalAlpha = 1;
    }
  }
}

function terrain(ctx: Pen, theme: Theme, c: Colors): void {
  const rim: readonly Point[] = [[0,211],[24,205],[66,208],[112,192],[155,195],[198,190],[227,200],[261,203],[317,194],[363,198],[407,193],[470,201],[517,187],[571,199],[640,192],[640,360],[0,360]];
  ctx.save(); ctx.beginPath(); ctx.moveTo(0,211);
  for(const [x,y] of rim) ctx.lineTo(x,y);
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = gradient(ctx, 193, 360, [[0,c.soil[0]],[1,c.soil[1]]]);
  ctx.fillRect(0,185,640,175);
  const lane: readonly Point[] = theme === 'market' ? [[273,192],[346,191],[483,360],[126,360]]
    : theme === 'sword_peak' ? [[264,193],[364,191],[408,232],[572,360],[68,360],[200,243]]
      : [[262,200],[328,195],[345,226],[401,246],[465,273],[479,310],[568,360],[203,360],[229,296],[198,269],[223,241]];
  stagePolygon(ctx,c.path[1],lane);
  ctx.save(); ctx.beginPath(); ctx.moveTo(lane[0][0],lane[0][1]); for (const [x,y] of lane) ctx.lineTo(x,y);
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = gradient(ctx, 196, 360, [[0,c.path[0]],[.78,c.path[1]],[1,c.soil[1]]]);
  ctx.fillRect(0,193,640,167);
  if (theme === 'market' || theme === 'sword_peak') {
    for (let row = 0; row < 14; row++) {
      const y = Math.round(198 + row * row * .89);
      const step = 17 + row * 4;
      ctx.globalAlpha = .24;
      stageRect(ctx,c.soil[1],0,y,640,row > 8 ? 2 : 1);
      for(let x = 6 - (row % 2) * step / 2; x < 640; x += step) {
        stageRect(ctx,c.soil[1],x,y,1, Math.ceil(row * 1.8));
        stageRect(ctx,c.path[0],x + 4,y + 2,step * (.29 + rand(row * 667 + x) * .45),1);
      }
    }
  } else {
    for (let i = 0; i < 195; i++) {
      const y = 201 + rand(i * 109 + 17) * 159;
      ctx.globalAlpha = .31;
      stageRect(ctx, i % 3 ? c.path[0] : c.soil[1],rand(i * 59 + 141) * 640,y,1 + rand(i * 47 + 41) * 8,1 + y / 410);
    }
  }
  ctx.restore();
  for(let i = 0; i < 158; i++) {
    const x = rand(i * 107 + 57) * 640, y = 189 + rand(i * 167 + 37) * 171;
    if (x > 200 && x < 480 && y > 222) continue;
    ctx.globalAlpha = .27 + rand(i * 123 + 33) * .28;
    const w = 1 + rand(i * 147 + 25) * 7;
    stageRect(ctx,i % 3 ? c.leaf[1] : c.leaf[0],x,y,w,1);
    if (i % 4 === 0) stageRect(ctx,c.leaf[1],x + w * .67,y - 2,1,2);
  }
  ctx.restore();
}

function pine(ctx: Pen,x:number,y:number,s:number,c:Colors,snow:boolean): void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stagePolygon(ctx,'#343546',[[-4,0],[-1,-74],[2,-75],[6,0]]);
  for(let i = 0; i < 5; i++) {
    const z = -88 + i * 13;
    const w = 7 + i * 5;
    stagePolygon(ctx,c.leaf[0],[[0,z],[-w * .4,z+14],[-w,z+24],[-w + 6,z+24],[-w + 3,z+28],[2,z+24],[w - 3,z+27],[w,z+24],[w * .5,z+17]]);
    stagePolygon(ctx,snow ? '#c0d3db' : c.leaf[1],[[0,z+2],[-w * .24,z+13],[-w * .7,z+21],[-w * .3,z+19],[-w * .28,z+22],[2,z+17],[w * .2,z+18],[w * .36,z+21],[w * .5,z+20],[4,z+9]]);
  }
  ctx.restore();
}

function rock(ctx: Pen,x:number,y:number,s:number,c:Colors,snow:boolean): void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stagePolygon(ctx,c.soil[1],[[-17,0],[-21,-9],[-14,-20],[-2,-26],[12,-23],[23,-10],[20,0],[6,4]]);
  stagePolygon(ctx,c.peaks[2],[[-17,-5],[-17,-10],[-10,-20],[-1,-22],[11,-20],[18,-10],[10,-3],[-4,0]]);
  stagePolygon(ctx,snow ? c.haze : c.face,[[-15,-13],[-10,-20],[-2,-24],[11,-21],[15,-16],[6,-18],[-3,-13]]);
  ctx.restore();
}

function roof(ctx: Pen,x:number,y:number,s:number,market:boolean): void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  const ridge = market ? '#a76157' : '#77a79f', ink = market ? '#452735' : '#263f51';
  stagePolygon(ctx,ink,[[-62,2],[-53,-3],[-41,-6],[-23,-18],[-16,-26],[-19,-30],[-9,-28],[10,-28],[20,-33],[18,-27],[24,-17],[44,-6],[62,-2],[57,4],[31,7],[-35,7]]);
  stagePolygon(ctx,ridge,[[-56,1],[-40,-4],[-24,-15],[-17,-23],[17,-23],[23,-15],[41,-3],[58,0],[36,4],[-42,4]]);
  for(let i = -4; i <= 4; i++) {
    const d = i * 4;
    stagePolygon(ctx,ink,[[d,-22],[d + 1,-22],[i * 9 + 1,3],[i * 9 - 1,3]]);
  }
  stageRect(ctx,ink,-55,5,110,4);
  stageRect(ctx,market ? '#ed9d76' : '#bed0a7',-37,4,74,1);
  stageRect(ctx,ridge,-13,-28,27,2);
  ctx.restore();
}

function lantern(ctx: Pen,x:number,y:number,k:number,time:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(k,k);
  const dx = Math.sin(time * 1.7 + x) * 1.15;
  stageRect(ctx,'#382439',-.6,-11,1.2,10);
  oval(ctx,'rgba(255,130,82,.13)',dx,5,12,12);
  stagePolygon(ctx,'#522537',[[dx-6,1],[dx-4,-3],[dx+4,-3],[dx+7,1],[dx+6,9],[dx+2,12],[dx-3,12],[dx-6,8]]);
  stageRect(ctx,'#c8534c',dx-4,0,9,9);
  stageRect(ctx,'#fd9e61',dx-2,1,4,8);
  stageRect(ctx,'#ffca84',dx,2,1,5);
  stageRect(ctx,'#f0a971',dx-1,12,2,4);
  ctx.restore();
}

function hall(ctx: Pen,x:number,y:number,s:number,market:boolean,time:number):void {
  const ink = market ? '#472d3c' : '#273c49';
  const wood = market ? '#a46256' : '#56786f';
  const lit = market ? '#efb179' : '#ead4a4';
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stagePolygon(ctx,ink,[[-52,0],[-55,-5],[-46,-9],[45,-9],[57,-2],[49,5],[-47,5]]);
  stageRect(ctx,wood,-41,-50,82,43);
  stageRect(ctx,ink,-35,-45,70,29);
  stageRect(ctx,lit,-34,-42,23,19);
  stageRect(ctx,lit,12,-42,22,19);
  for(const x of [-34,-28,-22,-16,12,18,24,30]) stageRect(ctx,wood,x,-43,2,23);
  stageRect(ctx,wood,-33,-34,67,2);
  stageRect(ctx,ink,-7,-40,15,32);
  stageRect(ctx,lit,-.5,-35,1,21);
  for(const x of [-43,-12,9,39]) {
    stageRect(ctx,ink,x,-52,6,47);
    stageRect(ctx,wood,x,-48,2,39);
  }
  stageRect(ctx,lit,-41,-12,82,1);
  stageRect(ctx,wood,-12,-7,25,3);
  stageRect(ctx,wood,-18,-2,36,2);
  roof(ctx,0,-53,1,market);
  if (market) {
    lantern(ctx,-38,-36,.9,time); lantern(ctx,39,-36,.9,time);
  } else {
    roof(ctx,0,-76,.66,false);
    stageRect(ctx,ink,-4,-96,8,6);
    stagePolygon(ctx,lit,[[0,-104],[-4,-96],[4,-96]]);
  }
  ctx.restore();
}

function bamboo(ctx: Pen,x:number,y:number,s:number,time:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  for(let i = 0; i < 7; i++) {
    ctx.save(); ctx.translate(i * 4,0); ctx.rotate((i - 3) * .077 + Math.sin(time * .8 + i) * .022);
    const h = 46 + rand(i * 601 + x) * 37;
    stageRect(ctx,'#244e43',-1,-h,3,h);
    stageRect(ctx,'#819d5d',0,-h,1,h);
    for(let j = 10; j < h-4; j += 10) {
      stageRect(ctx,'#355948',-2,-j,5,1);
      if (j < h / 2) continue;
      const d = (i + j / 10) % 2 ? 1 : -1;
      stagePolygon(ctx,'#38684c',[[0,-j],[d * 11,-j - 7],[d * 20,-j - 9],[d * 11,-j - 3]]);
      stagePolygon(ctx,'#5d8a58',[[0,-j],[d * 9,-j - 2],[d * 17,-j + 1],[d * 5,-j + 2]]);
    }
    ctx.restore();
  }
  ctx.restore();
}

function plot(ctx: Pen,x:number,y:number,s:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stagePolygon(ctx,'#3a4538',[[-41,4],[-32,-17],[29,-17],[48,5],[41,11],[-42,11]]);
  for(let i = 0; i < 4; i++) {
    const y = -14 + i * 5;
    stageRect(ctx,'#856b4d',-27 - i * 2,y,53 + i * 5,2);
    for(let j = 0; j < 8; j++) {
      const x = (j - 3.5) * (7 + i * .7);
      stageRect(ctx,'#59915b',x,y - 3,1,3);
      stagePolygon(ctx,i % 2 ? '#9da867' : '#7ca272',[[x-3,y-5],[x,y-4],[x+2,y-6],[x+2,y-4],[x,y-2]]);
    }
  }
  ctx.restore();
}

function furnace(ctx: Pen,x:number,y:number,s:number,time:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  oval(ctx,'#344a3f',0,2,20,5);
  for(let i = 0; i < 4; i++) {
    const z = (i * 7 + time * 6) % 32;
    ctx.globalAlpha = (1 - z / 32) * .34;
    cloud(ctx,'#e6c7a4',Math.sin(z * .12) * z * .32,-31-z, .105 + z * .009);
  }
  ctx.globalAlpha = 1;
  stagePolygon(ctx,'#5d504c',[[-15,-24],[-20,-19],[-17,-9],[-13,-3],[-12,3],[-9,3],[-7,-1],[8,-1],[11,3],[14,3],[14,-4],[19,-11],[19,-20],[12,-24]]);
  stagePolygon(ctx,'#b49363',[[-18,-21],[-11,-24],[12,-24],[18,-20],[14,-17],[-14,-17]]);
  stagePolygon(ctx,'#7f7257',[[-13,-24],[-9,-28],[9,-28],[14,-24]]);
  stageRect(ctx,'#dbb379',-4,-31,8,3);
  stageRect(ctx,'#d5a670',-16,-16,33,2);
  stageRect(ctx,'#382f34',-6,-9,12,8);
  stageRect(ctx,'#f19050',-5,-7,10,4);
  stageRect(ctx,'#ffee9c',-2,-5,4,2);
  ctx.restore();
}

function well(ctx: Pen,x:number,y:number,s:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  oval(ctx,'#475a75',0,2,28,8);
  stagePolygon(ctx,'#546a81',[[-21,-15],[-19,-2],[-11,3],[13,3],[21,-4],[22,-15]]);
  oval(ctx,'#d4e0e5',0,-15,23,8);
  oval(ctx,'#24384e',0,-15,15,4.5);
  stageRect(ctx,'#8ca7ac',-10,-15,20,1);
  for(const x of [-15,-6,5,14]) stageRect(ctx,'#3a4c62',x,-8,1,7);
  stageRect(ctx,'#405268',-19,-52,4,40); stageRect(ctx,'#405268',15,-52,4,40);
  stageRect(ctx,'#92a6b1',-16,-50,1,36); stageRect(ctx,'#92a6b1',18,-50,1,36);
  stageRect(ctx,'#778b9c',-16,-36,32,3); stageRect(ctx,'#cbb49a',0,-35,1,17);
  roof(ctx,0,-51,.42,false);
  ctx.restore();
}

function pool(ctx: Pen,x:number,y:number,s:number,time:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stagePolygon(ctx,'#342336',[[-58,3],[-50,-7],[-22,-10],[-13,-17],[23,-18],[51,-8],[62,5],[47,15],[19,16],[1,21],[-41,15]]);
  stagePolygon(ctx,'#922f45',[[-50,3],[-44,-5],[-18,-7],[-11,-13],[21,-15],[48,-7],[55,4],[42,10],[16,13],[1,16],[-37,11]]);
  stagePolygon(ctx,'#dc5b53',[[-44,3],[-28,-2],[-15,0],[-3,-8],[15,-10],[28,-6],[13,-4],[5,3],[21,6],[33,-2],[46,0],[37,7],[21,10],[0,11],[-13,5],[-27,6]]);
  for(let i = 0; i < 5; i++) {
    const d = Math.sin(time * .59 + i) * 2;
    stageRect(ctx,i % 2 ? '#f2ac80' : '#f57b62',-31 + i * 14 + d,i % 3 * 5 - 4,7 + i % 4,1);
  }
  ctx.restore();
}

function stall(ctx: Pen,x:number,y:number,s:number,time:number):void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stageRect(ctx,'#382639',-28,-34,4,36);
  stageRect(ctx,'#382639',24,-34,4,36);
  stageRect(ctx,'#714552',-25,-15,53,15);
  stageRect(ctx,'#e4986c',-26,-17,54,3);
  stagePolygon(ctx,'#863b50',[[-31,-33],[-24,-47],[24,-47],[33,-33],[31,-27],[-30,-27]]);
  for(let i=0;i<6;i++) {
    const d = -24 + i * 8;
    stagePolygon(ctx,i % 2 ? '#bc584f' : '#de996e',[[d,-46],[d+5,-46],[d+9,-31],[d+9,-27],[d+1,-27],[d+1,-31]]);
  }
  for(const x of [-20,3,14]) {
    stageRect(ctx,'#6b5148',x,-22,8,5);
    stageRect(ctx,'#a5805f',x+1,-23,5,2);
  }
  lantern(ctx,-28,-22,.6,time); lantern(ctx,29,-22,.6,time);
  ctx.restore();
}

function streamBridge(ctx: Pen,x:number,y:number,s:number,time:number): void {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  stagePolygon(ctx,'#415b59',[[-10,-3],[12,-3],[7,9],[-11,23],[-22,39],[-47,51],[-98,80],[-139,85],[-89,61],[-57,40],[-35,27],[-27,13]]);
  stagePolygon(ctx,'#507f80',[[-7,-2],[9,-2],[3,8],[-15,23],[-27,39],[-48,49],[-100,78],[-127,83],[-84,62],[-54,42],[-36,30],[-22,12]]);
  stagePolygon(ctx,'#78a5a2',[[-6,0],[1,0],[-10,14],[-27,30],[-32,39],[-50,46],[-72,57],[-57,44],[-40,36],[-28,20]]);
  for(let i=0;i<11;i++) {
    const q = (i*7+time*3)%74;
    stageRect(ctx,'#9cbbb0',-q*1.46+Math.sin(i)*5,q,3+i%4,1);
  }
  stagePolygon(ctx,'#3b4f4d',[[-57,34],[-47,21],[-29,15],[-15,15],[1,23],[9,34],[4,38],[-6,37],[-13,29],[-25,26],[-36,28],[-42,35]]);
  stagePolygon(ctx,'#9ba58e',[[-55,33],[-45,22],[-30,17],[-16,17],[-3,23],[6,33],[-4,33],[-13,25],[-29,23],[-42,27]]);
  for(const [x,y] of [[-48,27],[-40,22],[-29,19],[-18,19],[-8,23],[0,28]]) stageRect(ctx,'#596d67',x,y,1,4);
  stageRect(ctx,'#aeb09a',-52,32,8,2); stageRect(ctx,'#aeb09a',-3,32,8,2);
  ctx.restore();
}

function scenery(ctx: Pen,theme: Theme,c: Colors,time:number):void {
  switch(theme) {
    case 'sword_peak':
      pine(ctx,48,206,.94,c,false); pine(ctx,81,212,.55,c,false);
      pine(ctx,560,209,1.13,c,false); pine(ctx,526,213,.72,c,false);
      hall(ctx,317,220,1.09,false,time);
      for(const x of [174,457]) {
        stageRect(ctx,'#59827f',x,184,6,49);
        stageRect(ctx,'#91a694',x,185,2,47);
        stageRect(ctx,'#b6c5a9',x-4,181,13,4);
        stageRect(ctx,'#3f6768',x-3,231,12,4);
      }
      rock(ctx,121,244,.96,c,false); rock(ctx,500,238,.88,c,false);
      break;
    case 'pill_valley':
      streamBridge(ctx,635,251,1.38,time);
      bamboo(ctx,43,230,1.58,time); bamboo(ctx,533,220,1.75,time); bamboo(ctx,577,250,1.6,time);
      hall(ctx,333,220,.81,false,time); furnace(ctx,434,258,1.17,time);
      plot(ctx,139,248,1.24); plot(ctx,134,292,1.36); plot(ctx,511,276,1.14);
      break;
    case 'market':
      hall(ctx,113,217,1.09,true,time); hall(ctx,514,224,1.22,true,time);
      roof(ctx,324,187,.7,true);
      stageRect(ctx,'#694654',294,190,6,29); stageRect(ctx,'#694654',348,190,6,29);
      stall(ctx,159,270,1.04,time); stall(ctx,477,272,1.02,time);
      lantern(ctx,206,207,1.05,time); lantern(ctx,430,207,1.05,time);
      break;
    case 'blood_abyss':
      rock(ctx,84,210,1.35,c,false); rock(ctx,109,214,.8,c,false); rock(ctx,553,206,1.71,c,false);
      for(const [x,y,s] of [[164,226,1.42],[497,231,1.7],[398,205,.86]]) {
        stagePolygon(ctx,c.leaf[0],[[x-22*s,y],[x-20*s,y-24*s],[x-8*s,y-31*s],[x-3*s,y-58*s],[x+7*s,y-51*s],[x+9*s,y-29*s],[x+23*s,y-20*s],[x+19*s,y]]);
        stagePolygon(ctx,c.face,[[x-3*s,y-58*s],[x+7*s,y-51*s],[x+5*s,y-32*s],[x+1*s,y-10*s],[x-4*s,y-27*s]]);
      }
      pool(ctx,107,260,1.17,time); pool(ctx,537,280,1.37,time); pool(ctx,394,217,.56,time);
      break;
    case 'north_vein':
      for(const [x,y,s] of [[44,234,1.62],[87,218,1.16],[136,232,1.05],[503,223,1.16],[547,241,1.57],[597,218,1.35]]) pine(ctx,x,y,s,c,true);
      well(ctx,406,238,1.16);
      rock(ctx,160,255,1.26,c,true); rock(ctx,496,271,1.23,c,true); rock(ctx,225,221,.54,c,true);
      break;
    case 'countryside':
      streamBridge(ctx,613,248,1.48,time);
      pine(ctx,73,224,1.24,c,false); pine(ctx,111,219,.87,c,false); pine(ctx,553,223,1.45,c,false);
      hall(ctx,445,226,.62,false,time);
      plot(ctx,508,261,1.11);
      rock(ctx,139,246,.92,c,false); rock(ctx,90,276,.65,c,false);
      break;
  }
}

function foreground(ctx: Pen,theme: Theme,c: Colors,season:SceneStageFrame['season'],time:number):void {
  const win = season === 'winter' || theme === 'north_vein';
  rock(ctx,-6,347,1.64,c,win); rock(ctx,626,350,1.68,c,win);
  const pollen = win ? '#edf4f6' : theme === 'blood_abyss' ? '#ffa565' : season === 'autumn' ? '#fac776' : season === 'spring' ? '#f0bcc0' : '#d8ec9e';
  if (theme !== 'market') {
    for(let i = 0; i < 55; i++) {
      const x = rand(i * 157 + 31) * 640;
      if (x > 106 && x < 550 && i % 3 !== 0) continue;
      const y = 298 + rand(i * 137 + 37) * 73;
      const h = 4 + rand(i * 127 + 23) * 15;
      const wind = Math.sin(time * 1.3 + x * .065) * h * .12;
      stagePolygon(ctx,c.leaf[0],[[x-4,y],[x-6+wind,y-h*.65],[x-1,y-4],[x+wind,y-h],[x+2,y-5],[x+6+wind,y-h*.7],[x+3,y]]);
      stageRect(ctx,i % 7 ? c.leaf[1] : pollen,x+wind,y-h,2,2);
    }
  }
  for(let i = 0; i < 36; i++) {
    const v = rand(i * 107 + 151);
    const x = (rand(i * 71 + 21) * 640 + Math.sin(time * (.3 + v) + i) * 8 + time * (4 + v)) % 640;
    const speed = (win ? 8 : theme === 'blood_abyss' ? -6 : 2) * (v + .3);
    const y = ((rand(i * 211 + 61) * 360 + time * speed) % 360 + 360) % 360;
    ctx.globalAlpha = .3 + v * .45;
    stageRect(ctx,pollen,Math.round((x + 640) % 640),Math.round(y),v > .78 ? 2 : 1,v > .87 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
  const edge = ctx.createRadialGradient(319,178,100,319,178,365);
  edge.addColorStop(0,'rgba(9,11,29,0)');
  edge.addColorStop(1,'rgba(9,11,29,.45)');
  ctx.fillStyle = edge; ctx.fillRect(0,0,640,360);
}

export function drawSceneStage(ctx: Pen, frame: SceneStageFrame, width: number, height: number, timeMs: number): void {
  if (!(width > 0 && height > 0)) return;
  const c = palettes[frame.theme];
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) / 1000 : 0;
  ctx.save();
  ctx.scale(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  ctx.imageSmoothingEnabled = false;
  vista(ctx,frame.theme,c,frame.season,time);
  terrain(ctx,frame.theme,c);
  scenery(ctx,frame.theme,c,time);
  drawStageCast(ctx,frame.cast,time);
  foreground(ctx,frame.theme,c,frame.season,time);
  ctx.restore();
}

import type { TerrainBiome } from '../types/world';
import type { LushTilemapPlan } from './lushTilemapModel';

type Pen = CanvasRenderingContext2D;
type Point = readonly [number, number];
interface Cell { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const LUSH_TERRAIN_PALETTE = {
  灵山: { base:'#426b50', shade:'#254852', mid:'#558058', sun:'#87a66a', ink:'#b9c880' },
  毒沼: { base:'#366163', shade:'#284956', mid:'#54837b', sun:'#7c9a79', ink:'#b2baa0' },
  剑冢: { base:'#4c6476', shade:'#344858', mid:'#637f8a', sun:'#8da5ac', ink:'#c2c7bd' },
  荒漠: { base:'#88644c', shade:'#634858', mid:'#a67b50', sun:'#c19c63', ink:'#e5b983' },
  魔渊: { base:'#674757', shade:'#442c49', mid:'#865564', sun:'#b47a79', ink:'#d88f82' },
  坊市: { base:'#80615b', shade:'#5b4355', mid:'#98766a', sun:'#baa18a', ink:'#ccb59b' },
} as const satisfies Record<TerrainBiome,Record<'base'|'shade'|'mid'|'sun'|'ink',string>>;
type Ink = typeof LUSH_TERRAIN_PALETTE[TerrainBiome];

function play(seed:number,n:number):number {
  let hash = (seed ^ Math.imul(n + 37, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16),0x7feb352d);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

function poly(ctx:Pen,color:string,points:readonly Point[]):void {
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
  ctx.closePath();ctx.fill();
}

function stroke(ctx:Pen,color:string,width:number,points:readonly Point[]):void {
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
  ctx.stroke();
}

function pine(ctx:Pen,x:number,y:number,h:number,ink:Ink,snow=false):void {
  const w=h*.36;
  poly(ctx,ink.shade,[[x,y-h],[x+w*.57,y-h*.65],[x+w*.42,y-h*.62],[x+w*.86,y-h*.35],[x+w*.64,y-h*.34],
    [x+w,y-h*.08],[x+w*.22,y],[x-w*.62,y-h*.09],[x-w*.43,y-h*.45],[x-w*.22,y-h*.51],[x-w*.4,y-h*.51]]);
  poly(ctx,snow?'#d6e5d5':ink.sun,[[x,y-h],[x+w*.1,y-h*.75],[x+w*.54,y-h*.57],[x-w*.14,y-h*.58],
    [x+w*.57,y-h*.32],[x-w*.25,y-h*.36],[x-w*.44,y-h*.26],[x-w*.3,y-h*.55]]);
}

function peak(ctx:Pen,x:number,y:number,s:number,ink:Ink,frost=false):void {
  poly(ctx,ink.shade,[[x-s*.55,y],[x-s*.33,y-s*.38],[x-s*.19,y-s*.48],[x+s*.02,y-s*.81],[x+s*.18,y-s*.67],[x+s*.55,y-s*.14],[x+s*.39,y+s*.05]]);
  poly(ctx,ink.mid,[[x+s*.02,y-s*.80],[x+s*.18,y-s*.67],[x+s*.51,y-s*.16],[x+s*.15,y-s*.21],[x-s*.05,y-s*.4]]);
  poly(ctx,frost?'#d0e1de':ink.sun,[[x+s*.02,y-s*.79],[x+s*.16,y-s*.65],[x+s*.24,y-s*.51],
    [x+s*.04,y-s*.56],[x-s*.06,y-s*.48],[x-s*.12,y-s*.54]]);
  stroke(ctx,ink.sun,.68,[[x-s*.28,y-s*.38],[x-s*.3,y-s*.29],[x-s*.37,y-s*.22]]);
}

function paintTile(ctx:Pen,cell:Cell,biome:TerrainBiome,seed:number,frost:boolean,moisture:boolean):void {
  const { x,y,width:w,height:h }=cell;
  const c=LUSH_TERRAIN_PALETTE[biome];
  const s=Math.min(w,h);
  ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
  // No shadows, patterns or neighbors beyond a currently authorized tile's own clipping mask.
  ctx.fillStyle=c.base;ctx.fillRect(0,0,w,h);
  const tint=ctx.createRadialGradient(w*(.24+play(seed,5)*.42),h*.37,0,w*.49,h*.46,s*.58);
  tint.addColorStop(0,frost?'#a5bbaf':c.mid);tint.addColorStop(1,frost?'#a5bbaf00':c.mid+'00');
  ctx.fillStyle=tint;ctx.fillRect(0,0,w,h);

  const vx=play(seed,2)*w*.22+w*.29, vy=h*(.45+play(seed,3)*.15);
  if(frost) {
    ctx.globalAlpha=.75;
    poly(ctx,'#b9cbc1',[[w*.08,h*.51],[w*.31,h*.27],[w*.50,h*.32],[w*.73,h*.13],[w*.89,h*.39],
      [w*.78,h*.59],[w*.91,h*.76],[w*.58,h*.88],[w*.29,h*.75]]);
    ctx.globalAlpha=.83;
    for(let i=0;i<7;i++)pine(ctx,w*(.13+play(seed,i+20)*.75),h*(.27+play(seed,i+30)*.60),s*(.14+play(seed,i+50)*.20),c,true);
  }else if(biome==='灵山') {
    ctx.globalAlpha=.85;
    poly(ctx,c.mid,[[0,h*.71],[w*.17,h*.55],[w*.43,h*.64],[w*.58,h*.55],[w*.71,h*.64],[w,h*.54],[w,h*.82],
      [w*.68,h*.88],[w*.52,h*.83],[w*.37,h*.92],[w*.13,h*.86],[0,h*.89]]);
    peak(ctx,vx,vy,s*.39,c);
    peak(ctx,vx+w*.23,vy*.97,s*.47,c);
    for(let i=0;i<5;i++)pine(ctx,w*(.19+play(seed,25+i)*.65),h*(.51+play(seed,39+i)*.40),s*(.12+play(seed,47+i)*.16),c);
  }else if(biome==='毒沼'&&moisture){
    // Decorative water pockets braid within this native wet biome, never draw a navigable named river.
    ctx.globalAlpha=.9;
    poly(ctx,'#326072',[[w*.04,h*.57],[w*.20,h*.50],[w*.30,h*.58],[w*.43,h*.51],[w*.53,h*.34],
      [w*.66,h*.30],[w*.84,h*.39],[w*.91,h*.33],[w*.94,h*.48],[w*.80,h*.56],[w*.73,h*.48],
      [w*.60,h*.52],[w*.48,h*.72],[w*.31,h*.77],[w*.19,h*.64],[w*.07,h*.72]]);
    poly(ctx,'#488994',[[w*.12,h*.60],[w*.23,h*.55],[w*.33,h*.64],[w*.43,h*.60],[w*.58,h*.43],
      [w*.68,h*.38],[w*.83,h*.45],[w*.91,h*.41],[w*.83,h*.50],[w*.70,h*.45],
      [w*.57,h*.53],[w*.42,h*.69],[w*.31,h*.73],[w*.21,h*.61]]);
    for(let i=0;i<5;i++){
      const x=w*(.19+i*.14),y=h*(.57+Math.sin(i*1.2+1)*.13);
      stroke(ctx,'#92bcc3',.62,[[x-2,y],[x+2,y-.7],[x+4,y]]);
      stroke(ctx,c.sun,.82,[[x+4,y+8],[x+3,y+1],[x+5,y+4]]);
    }
  }else if(biome==='剑冢'||biome==='毒沼'){
    ctx.globalAlpha=.82;
    peak(ctx,vx,vy,s*.68,c);peak(ctx,vx+w*.30,vy+h*.10,s*.55,c);
    peak(ctx,vx+w*.17,vy+h*.29,s*.43,c);
  }else if(biome==='荒漠'){
    ctx.globalAlpha=.89;
    for(let k=0;k<3;k++){
      const b=h*(.36+k*.21);
      const bend=play(seed,k+7)*.19;
      poly(ctx,k===1?c.sun:c.mid,[[w*.06,b],[w*.18,b-h*.07],[w*.43,b-h*bend],[w*.62,b-h*.11],
        [w*.87,b-h*.04],[w*.96,b-h*.08],[w*.88,b+h*.049],[w*.63,b+h*.03],[w*.48,b-h*.011],[w*.25,b+h*.06]]);
      stroke(ctx,c.ink,.7,[[w*.18,b-h*.072],[w*.43,b-h*bend],[w*.62,b-h*.111],[w*.87,b-h*.043]]);
    }
  }else if(biome==='魔渊'){
    ctx.globalAlpha=.84;
    poly(ctx,c.shade,[[w*.18,0],[w*.36,h*.16],[w*.35,h*.32],[w*.55,h*.48],[w*.49,h*.61],[w*.76,h*.89],
      [w*.89,h],[w*.68,h],[w*.64,h*.90],[w*.36,h*.64],[w*.43,h*.48],[w*.25,h*.35],[w*.23,h*.14],[w*.09,0]]);
    stroke(ctx,c.sun,1.1,[[w*.16,0],[w*.31,h*.16],[w*.30,h*.32],[w*.5,h*.48],[w*.43,h*.62],[w*.70,h*.92]]);
    peak(ctx,vx+w*.38,vy,s*.34,c);
    peak(ctx,vx-w*.05,vy+h*.29,s*.28,c);
  }else{
    // An irregular stone terrace wash, not a synthetic road graph.
    ctx.globalAlpha=.75;
    poly(ctx,c.mid,[[w*.09,h*.70],[w*.22,h*.30],[w*.61,h*.28],[w*.84,h*.45],[w*.91,h*.67],[w*.71,h*.84],[w*.38,h*.87]]);
    for(let j=0;j<6;j++){
      const t=h*(.34+j*.082);
      stroke(ctx,j%2?c.sun:c.shade,.77,[[w*.28-j*w*.018,t],[w*.48,t-h*.012],[w*.70+j*w*.014,t]]);
      for(let k=0;k<3;k++){
        const x=w*(.35+k*.147+(j%2)*.06);
        stroke(ctx,c.shade,.61,[[x,t],[x-1,t+h*.077]]);
      }
    }
  }

  for(let i=0;i<20;i++){
    const x=play(seed,121+i)*w,y=play(seed,189+i)*h;
    ctx.globalAlpha=.13+play(seed,288+i)*.25;
    ctx.fillStyle=i%5?c.ink:c.shade;
    ctx.fillRect(x,y,.72+play(seed,351+i)*s*.048,.62+play(seed,333+i)*1.2);
  }
  ctx.restore();
}

/** Cached opaque paint for present tiles only. Unexplored and memory-only tiles retain the fog pass. */
export function drawLushTilemap(ctx:Pen,plan:LushTilemapPlan):void {
  ctx.save();
  for(const tile of plan.tiles)paintTile(ctx,tile,tile.biome,tile.grain,tile.frost===true,tile.moisture===true);
  for(const seam of plan.seams){
    const {x,y,width:w,height:h,axis,from,to}=seam;
    const a=LUSH_TERRAIN_PALETTE[from].base, b=LUSH_TERRAIN_PALETTE[to].base;
    const middle='#'+[1,3,5].map(offset=>Math.round((Number.parseInt(a.slice(offset,offset+2),16)+
      Number.parseInt(b.slice(offset,offset+2),16))/2).toString(16).padStart(2,'0')).join('');
    const g=ctx.createLinearGradient(x,y,x+(axis==='x'?w:0),y+(axis==='y'?h:0));
    g.addColorStop(0,a+'00');g.addColorStop(.22,a+'bf');g.addColorStop(.5,middle+'f5');
    g.addColorStop(.78,b+'bf');g.addColorStop(1,b+'00');
    ctx.fillStyle=g;
    ctx.fillRect(x,y,w,h);
  }
  if(plan.roads.length){
    ctx.save();ctx.beginPath();
    for(const tile of plan.tiles)ctx.rect(tile.x,tile.y,tile.width,tile.height);
    ctx.clip();ctx.lineCap='round';ctx.lineJoin='round';
    for(const road of plan.roads){
      const points=road.points.map(({x,y})=>[x,y] as const);
      if(points.length<2)continue;
      stroke(ctx,'#4f4e50',5.6,points);
      stroke(ctx,'#b8a184',3.25,points);
      ctx.setLineDash([1.9,1.2]);
      stroke(ctx,'#d9be95',.7,points);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  ctx.restore();
}

import {terrainTileAt} from '../engine/terrainEngine';
import type {TerrainBiome,WorldState} from '../types/world';
import {MAP_HEIGHT,MAP_WIDTH} from './mapCamera';
import type {createTerrainMapView} from './terrainMapView';

interface ReliefCell {readonly x:number;readonly y:number;readonly width:number;readonly height:number}
export interface CanvasBiomeReliefTile extends ReliefCell {
  readonly tileId:string;readonly biome:TerrainBiome;readonly grain:number;
}

const oldLandmarks={
  'loc-taixu':'peaks','loc-blood':'gorge','loc-danxia':'terraces','loc-tianji':'stars','loc-vein-north':'frost',
} as const;
type Motif=(typeof oldLandmarks)[keyof typeof oldLandmarks];
export interface CanvasBiomeReliefLandmark extends ReliefCell {
  readonly siteId:keyof typeof oldLandmarks;readonly motif:Motif;readonly anchorX:number;readonly anchorY:number;
}
export interface CanvasBiomeReliefPlan {
  readonly tiles:readonly CanvasBiomeReliefTile[];
  readonly landmarks:readonly CanvasBiomeReliefLandmark[];
}

const mix=(seed:number,row:number,col:number)=>{
  const first=(seed^Math.imul(row+31,0x7f4a7c15)^Math.imul(col+59,0x9e3779b1))>>>0;
  const next=Math.imul(first^(first>>>16),0x846ca68b);
  return (next^(next>>>16))>>>0;
};
const finiteCoordinate=(value:number,max:number)=>Number.isFinite(value)&&value>=0&&value<=max;

/** Only today's visible physical terrain furnishes ink; explored-only tiles remain their old flat shade. */
export function buildCanvasBiomeRelief(world:WorldState,view:ReturnType<typeof createTerrainMapView>):CanvasBiomeReliefPlan{
  const {columns,rows,seed}=world.terrain;
  if(!Number.isSafeInteger(columns)||!Number.isSafeInteger(rows)||columns<=0||rows<=0)return {tiles:[],landmarks:[]};
  const width=MAP_WIDTH/columns,height=MAP_HEIGHT/rows;
  const tiles:CanvasBiomeReliefTile[]=[];
  const byTile=new Map<string,CanvasBiomeReliefTile>();
  for(const tile of world.terrain.tiles){
    if(view.tileState(tile)!=='visible')continue;
    const {id:tileId,col,row,biome}=tile;
    if(!Number.isSafeInteger(col)||col<0||col>=columns||!Number.isSafeInteger(row)||row<0||row>=rows||byTile.has(tileId))continue;
    const relief={tileId,biome,grain:mix(seed,row,col),x:col*width,y:row*height,width,height};
    byTile.set(tileId,relief);tiles.push(relief);
  }
  const landmarks:CanvasBiomeReliefLandmark[]=[];
  for(const siteId of Object.keys(oldLandmarks) as Array<keyof typeof oldLandmarks>){
    const sources=world.locations.filter(location=>location.id===siteId);
    const [site]=sources;
    if(sources.length!==1||!site||site.expeditionOmenId!==undefined||!view.seenLocations.includes(site)||
      !view.isCurrentLocation(siteId)||!finiteCoordinate(site.x,MAP_WIDTH)||!finiteCoordinate(site.y,MAP_HEIGHT))continue;
    const tile=terrainTileAt(world,site.x,site.y);
    const relief=tile&&byTile.get(tile.id);
    if(relief)landmarks.push({siteId,motif:oldLandmarks[siteId],anchorX:site.x,anchorY:site.y,
      x:relief.x,y:relief.y,width,height});
  }
  return {tiles,landmarks};
}

const tones:Record<TerrainBiome,{light:string;dark:string}> = {
  灵山:{light:'#b4d9aa',dark:'#102831'}, 毒沼:{light:'#a6c077',dark:'#142426'},
  剑冢:{light:'#adcded',dark:'#121a25'}, 荒漠:{light:'#d6ab6f',dark:'#392638'},
  魔渊:{light:'#db7b92',dark:'#181221'}, 坊市:{light:'#efbc79',dark:'#2f2027'},
};
type Point=readonly [number,number];
function path(ctx:CanvasRenderingContext2D,points:readonly Point[],closed=false){
  const [head,...tail]=points;
  if(!head)return;
  ctx.beginPath();
  ctx.moveTo(...head);
  for(const p of tail)ctx.lineTo(...p);
  if(closed)ctx.closePath();
}
function line(ctx:CanvasRenderingContext2D,points:readonly Point[]){path(ctx,points);ctx.stroke();}
function dot(ctx:CanvasRenderingContext2D,x:number,y:number,r:number){
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}
function clipCell(ctx:CanvasRenderingContext2D,cell:ReliefCell){
  ctx.beginPath();ctx.rect(cell.x,cell.y,cell.width,cell.height);ctx.clip();
}

function mountains(ctx:CanvasRenderingContext2D,skew:number){
  ctx.globalAlpha=.30;
  path(ctx,[[.01,.87],[.29,.42],[.47,.63],[.65,.23+skew],[.99,.86]],true);ctx.fill();
  ctx.globalAlpha=.44;
  line(ctx,[[.06,.83],[.29,.42],[.39,.54],[.47,.63],[.65,.23+skew],[.94,.8]]);
  ctx.globalAlpha=.25;
  line(ctx,[[.33,.83],[.54,.66],[.68,.46+skew],[.78,.54]]);
  line(ctx,[[.05,.93],[.3,.72],[.39,.79],[.61,.65],[.93,.89]]);
}
function marsh(ctx:CanvasRenderingContext2D,skew:number){
  ctx.globalAlpha=.34;
  for(const y of [.44,.65,.84]){
    ctx.beginPath();ctx.moveTo(.05,y);
    ctx.bezierCurveTo(.21,y-.14,.39,y+.12,.57,y-.015);
    ctx.quadraticCurveTo(.73,y-.12+skew,.94,y-.04);ctx.stroke();
  }
  ctx.globalAlpha=.44;
  line(ctx,[[.23,.55],[.19,.27],[.23,.4],[.31,.3]]);
  line(ctx,[[.69,.52],[.68,.18+skew],[.71,.36],[.78,.26]]);
}
function swords(ctx:CanvasRenderingContext2D,skew:number){
  ctx.globalAlpha=.28;
  line(ctx,[[.02,.92],[.28,.77],[.62,.79],[.96,.67]]);
  ctx.globalAlpha=.54;
  path(ctx,[[.27,.71],[.41,.21+skew],[.49,.15+skew],[.51,.3+skew],[.33,.74]],true);ctx.stroke();
  line(ctx,[[.22,.68],[.39,.74],[.34,.84]]);
  ctx.globalAlpha=.32;
  line(ctx,[[.56,.87],[.77,.46],[.85,.36+skew],[.83,.51],[.62,.89]]);
  line(ctx,[[.59,.75],[.72,.81]]);
}
function dunes(ctx:CanvasRenderingContext2D,skew:number){
  ctx.globalAlpha=.45;
  for(const y of [.38,.61,.83]){
    ctx.beginPath();ctx.moveTo(-.12,y+.03);
    ctx.bezierCurveTo(.23,y-.29+skew,.43,y-.16,.61,y-.04);
    ctx.quadraticCurveTo(.77,y+.11,1.07,y-.13);ctx.stroke();
  }
  ctx.globalAlpha=.20;
  line(ctx,[[.23,.9],[.41,.78],[.57,.82],[.67,.88]]);
}
function gorge(ctx:CanvasRenderingContext2D,skew:number){
  ctx.globalAlpha=.57;
  path(ctx,[[.24,-.13],[.43,.29],[.37,.51],[.63,.79],[.68,1.14],[.85,1.15],[.76,.66],[.54,.46],[.58,.25],[.43,-.12]],true);ctx.fill();
  ctx.globalAlpha=.51;
  line(ctx,[[.29,-.03],[.43,.29],[.37,.51],[.63,.79],[.68,1.02]]);
  ctx.globalAlpha=.28;
  line(ctx,[[.64,.04],[.67,.27],[.59,.43],[.79,.6],[.84,.95]]);
  line(ctx,[[.05,.39],[.22,.42+skew],[.36,.49]]);
}
function market(ctx:CanvasRenderingContext2D,skew:number){
  ctx.globalAlpha=.39;
  for(const [x,y] of [[.18,.24+skew],[.51,.4+skew],[.28,.63],[.69,.68]] as const){
    line(ctx,[[x-.08,y+.09],[x+.08,y],[x+.25,y+.1]]);
    line(ctx,[[x-.03,y+.085],[x-.03,y+.23],[x+.18,y+.23],[x+.18,y+.087]]);
    line(ctx,[[x+.08,y+.16],[x+.08,y+.23]]);
  }
}
const brushes:Record<TerrainBiome,(ctx:CanvasRenderingContext2D,skew:number)=>void>={
  灵山:mountains,毒沼:marsh,剑冢:swords,荒漠:dunes,魔渊:gorge,坊市:market,
};

const motifInk:Record<Motif,string>={peaks:'#e7e9c5',gorge:'#fb9b91',terraces:'#f6d48d',stars:'#c0bbff',frost:'#c1eff8'};
function landmarkGlyph(ctx:CanvasRenderingContext2D,motif:Motif){
  switch(motif){
    case 'peaks':
      line(ctx,[[-.47,.25],[-.24,-.11],[-.11,.06],[.08,-.43],[.43,.22]]);
      line(ctx,[[-.07,-.06],[.08,-.43],[.19,-.18],[.08,-.23],[-.07,-.06]]);
      break;
    case 'gorge':
      line(ctx,[[-.41,-.34],[-.13,-.19],[-.25,.04],[.09,.22],[.22,.41]]);
      line(ctx,[[.02,-.4],[.31,-.25],[.11,.05],[.34,.16],[.43,.39]]);
      break;
    case 'terraces':
      for(const z of [-.28,-.08,.12]){
        ctx.beginPath();ctx.moveTo(-.41,z+.05);ctx.quadraticCurveTo(-.06,z-.2,.38,z+.06);ctx.stroke();
      }
      break;
    case 'stars':
      line(ctx,[[-.37,.19],[-.15,-.24],[.06,.02],[.33,-.32],[.36,.26]]);
      for(const [x,y] of [[-.37,.19],[-.15,-.24],[.06,.02],[.33,-.32],[.36,.26]] as const)dot(ctx,x,y,.035);
      break;
    case 'frost':
      for(let i=0;i<6;i++){
        const angle=i*Math.PI/3,x=Math.cos(angle),y=Math.sin(angle);
        line(ctx,[[0,0],[x*.4,y*.4]]);
        line(ctx,[[x*.23-y*.07,y*.23+x*.07],[x*.31,y*.31],[x*.23+y*.07,y*.23-x*.07]]);
      }
      break;
  }
}

/** Transparent static relief for a 1000×600 native surface; call after drawing the base terrain. */
export function drawCanvasBiomeRelief(ctx:CanvasRenderingContext2D,plan:CanvasBiomeReliefPlan):void{
  ctx.save();
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const tile of plan.tiles){
    const ink=tones[tile.biome];
    ctx.save();
    clipCell(ctx,tile);
    ctx.translate(tile.x,tile.y);ctx.scale(tile.width,tile.height);
    ctx.lineWidth=.028;ctx.strokeStyle=ink.light;ctx.fillStyle=ink.dark;
    brushes[tile.biome](ctx,((tile.grain&15)-7.5)/110);
    ctx.globalAlpha=.26;ctx.fillStyle=ink.light;
    for(let i=0;i<4;i++){
      const a=(tile.grain>>>(i*6))&63,b=(tile.grain>>>(i*5+5))&63;
      dot(ctx,.10+.80*a/63,.10+.80*b/63,.012+i*.002);
    }
    ctx.restore();
  }
  for(const landmark of plan.landmarks){
    ctx.save();clipCell(ctx,landmark);
    const size=Math.min(landmark.width,landmark.height)*.80;
    // Keep the decorative stamp clear of the cell edge while the actual map marker remains at its native location.
    const x=Math.max(landmark.x+size*.45,Math.min(landmark.x+landmark.width-size*.45,landmark.anchorX));
    const y=Math.max(landmark.y+size*.45,Math.min(landmark.y+landmark.height-size*.45,landmark.anchorY));
    ctx.translate(x,y);ctx.scale(size,size);
    ctx.globalAlpha=.40;ctx.fillStyle='#15232e';dot(ctx,0,0,.48);
    ctx.globalAlpha=.78;ctx.strokeStyle=ctx.fillStyle=motifInk[landmark.motif];
    ctx.lineWidth=.046;landmarkGlyph(ctx,landmark.motif);
    ctx.restore();
  }
  ctx.restore();
}

import type { LocationNode } from '../types/world';
import type { LushArchitectureKind } from './lushTilemapModel';

type Pen = CanvasRenderingContext2D;
type Point = readonly [number,number];
type Site = Pick<LocationNode,'id'|'type'|'spiritRoot'|'x'|'y'>;
interface FacadeOptions {abandoned?:boolean;village?:boolean;kind?:LushArchitectureKind}
type Facade = 'sword'|'cauldron'|'stars'|'north'|'market'|'farm'|'abyss'|'gate'|'portal'|'well'|'ruin';

interface Timber { ink:string; wood:string; roof:string; ridge:string; light:string }
const jade:Timber={ink:'#263345',wood:'#b8c9ad',roof:'#426e78',ridge:'#8eb5b1',light:'#f3deaf'};
const straw:Timber={ink:'#39413e',wood:'#aa8c67',roof:'#94704d',ridge:'#d7b575',light:'#f2d59a'};
const scarlet:Timber={ink:'#4a3443',wood:'#985b52',roof:'#ad6957',ridge:'#e7a66c',light:'#ffe19c'};
const violet:Timber={ink:'#34334c',wood:'#79749b',roof:'#565488',ridge:'#b1aad2',light:'#f0daac'};
const slate:Timber={ink:'#344250',wood:'#758c85',roof:'#496568',ridge:'#a7bfb1',light:'#e2dbc0'};
const hex=/^#[0-9a-f]{6}$/iu;

function poly(ctx:Pen,color:string,p:readonly Point[]):void {
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...p[0]);
  for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);
  ctx.closePath();ctx.fill();
}
function rect(ctx:Pen,c:string,x:number,y:number,w:number,h:number):void {ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function oval(ctx:Pen,c:string,x:number,y:number,rx:number,ry:number):void {
  ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function line(ctx:Pen,c:string,weight:number,points:readonly Point[]):void{
  ctx.strokeStyle=c;ctx.lineWidth=weight;ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.stroke();
}

function roof(ctx:Pen,x:number,y:number,w:number,h:number,m:Timber):void{
  poly(ctx,m.ink,[[x-w,y],[x-w*.72,y-h*.27],[x-w*.35,y-h*.68],[x-w*.29,y-h],[x+w*.28,y-h],
    [x+w*.34,y-h*.62],[x+w*.7,y-h*.24],[x+w,y-.55],[x+w*.77,y+1.55],[x-w*.78,y+1.55]]);
  poly(ctx,m.roof,[[x-w*.84,y],[x-w*.69,y-h*.27],[x-w*.33,y-h*.72],[x-w*.26,y-h*.91],[x+w*.26,y-h*.91],
    [x+w*.34,y-h*.65],[x+w*.78,y-.55],[x+w*.61,y+.32],[x-w*.61,y+.32]]);
  line(ctx,m.ridge,.75,[[x-w*.84,y],[x-w*.53,y-h*.2],[x-w*.34,y-h*.61],[x-w*.24,y-h*.96],
    [x+w*.25,y-h*.96],[x+w*.37,y-h*.57],[x+w*.77,y-.46]]);
  for(const k of [-.75,-.38,0,.38,.75])line(ctx,m.ink,.4,[[x+k*w*.29,y-h*.84],[x+k*w*.75,y-.05]]);
  rect(ctx,m.ridge,x-w*.55,y+.82,w*1.1,.55);
}

function chamber(ctx:Pen,x:number,y:number,w:number,h:number,m:Timber):void {
  rect(ctx,m.ink,x-w/2-1,y-h-1,w+2,h+1.2);
  rect(ctx,m.wood,x-w/2,y-h,w,h-.55);
  rect(ctx,m.ink,x-1.65,y-h*.81,3.3,h*.81);
  rect(ctx,m.light,x-.2,y-h*.62,.8,h*.43);
  for(const dx of [-w*.32,w*.19]){
    rect(ctx,m.ink,x+dx-.35,y-h*.71,w*.17,h*.40);
    rect(ctx,m.light,x+dx,y-h*.65,w*.1,h*.23);
  }
  rect(ctx,m.ridge,x-w*.48,y-.78,w*.96,.68);
}

function pavilion(ctx:Pen,x:number,y:number,w:number,m:Timber,tier:number):void {
  chamber(ctx,x,y,w*.67,w*.31,m);
  roof(ctx,x,y-w*.31,w*.51,w*.24,m);
  for(let i=1;i<tier;i++){
    const dx=w*(.35-i*.03),dy=y-w*(.53+(i-1)*.21);
    chamber(ctx,x,dy,dx*1.22,w*.17,m);
    roof(ctx,x,dy-w*.14,dx,w*.165,m);
  }
}

function lantern(ctx:Pen,x:number,y:number):void {
  rect(ctx,'#4b3943',x-.35,y-2.3,.7,2.4);
  oval(ctx,'#9b5449',x,y+1.1,1.65,2.1);
  rect(ctx,'#ef8e62',x-.86,y-.28,1.72,2.75);
  rect(ctx,'#fff1a7',x-.31,y+.22,.62,1.68);
  rect(ctx,'#ffc77d',x-.25,y+2.8,.5,1.0);
}

function plots(ctx:Pen,x:number,y:number):void{
  poly(ctx,'#404e46',[[x-5,y-3],[x+4,y-3],[x+6,y+3],[x-6,y+3]]);
  for(let j=0;j<3;j++){
    const dy=j*1.7;
    rect(ctx,'#ad8462',x-3-j*.44,y-2+dy,6+j*.87,.65);
    for(let k=-1;k<2;k++)rect(ctx,'#a2bb72',x+k*2.25,y-2.7+dy,.9,.87);
  }
}

function pot(ctx:Pen,x:number,y:number):void {
  oval(ctx,'#383746',x,y+.7,3.8,1.2);
  poly(ctx,'#674c4b',[[x-3.2,y-4],[x+3.2,y-4],[x+3.7,y-2],[x+2.4,y+.68],[x-2.4,y+.68],[x-3.7,y-2]]);
  rect(ctx,'#c99d68',x-3.4,y-4,6.8,1.1);
  rect(ctx,'#e98a65',x-.84,y-1.8,1.68,1.7);
  line(ctx,'#efd2ac',.68,[[x-.1,y-4.7],[x-1,y-6.3],[x+.8,y-8.2],[x+.5,y-9.4]]);
}

function well(ctx:Pen,x:number,y:number,snow:boolean):void {
  oval(ctx,'#374859',x,y+.75,5.9,2.2);
  poly(ctx,'#657986',[[x-5.5,y-2.5],[x+5.5,y-2.5],[x+4.9,y+.9],[x+3,y+1.6],[x-3,y+1.6],[x-5.1,y+.7]]);
  oval(ctx,snow?'#dce8dc':'#a9bcaf',x,y-2.4,5.7,2.25);
  oval(ctx,'#354e62',x,y-2.45,4.2,1.15);
  line(ctx,'#8bb3b1',.58,[[x-2.8,y-2.4],[x+2.6,y-2.5]]);
  for(const dx of [-4,3])rect(ctx,'#455466',x+dx,y-11,1.15,8.1);
  roof(ctx,x-.1,y-11,6.1,2.5,snow?jade:slate);
  rect(ctx,'#a99779',x-.31,y-9.9,.62,5.88);
}

function layout(ctx:Pen,facade:Facade):void{
  switch(facade){
    case 'sword':
      pavilion(ctx,-3,7,23,jade,3);
      for(let j=0;j<3;j++)rect(ctx,'#b7c4b5',-8-j,7+j*1.15,10+j*2,1);
      poly(ctx,'#59767d',[[10,8],[13,1],[12,-12],[14,-17],[15,-12],[15,6],[17,8]]);
      poly(ctx,'#d9efe0',[[12.6,3],[13,-12],[14.1,-15],[14.2,-11],[14,4]]);
      line(ctx,'#cbd8b0',.83,[[10,-.5],[16,-.8]]);
      break;
    case 'cauldron':
      chamber(ctx,-3,1,16,7,straw);roof(ctx,-3,-5.8,12.3,6.8,straw);
      pot(ctx,11,5);plots(ctx,-8,7);plots(ctx,4,11);
      break;
    case 'market':
      pavilion(ctx,-3,6,22,scarlet,2);
      lantern(ctx,-12,-.1);lantern(ctx,5,-.1);
      for(const x of [6.8,16.5])rect(ctx,'#553848',x,5,1,7);
      poly(ctx,'#b86f61',[[7,2],[15.5,2],[18.7,6],[18,7.5],[5.6,7.5],[5,6]]);
      for(const x of [7,10.8,14.6])rect(ctx,'#edb681',x,5,1.7,2.3);
      rect(ctx,'#c59569',6.4,9,11,1.3);
      break;
    case 'stars':
      poly(ctx,'#4a506e',[[-12,7],[-8,4],[8,4],[12,7],[6,10],[-7,10]]);
      poly(ctx,'#98a3bf',[[-14,4],[-9,2],[9,2],[14,4],[9,6],[-10,6]]);
      pavilion(ctx,0,2,18,violet,3);
      line(ctx,'#d3d9ee',.78,[[-10,-11],[-6,-16],[0,-17],[6,-15],[10,-11]]);
      for(const [x,y] of [[-10,-11],[-6,-16],[0,-17],[6,-15],[10,-11]])oval(ctx,'#f6e1a8',x,y,.82,.82);
      rect(ctx,'#b6b5d6',-2,10,4,1);rect(ctx,'#ccc7e4',-.6,12,1.2,1.2);
      break;
    case 'north':
      poly(ctx,'#c3dade',[[-16,6],[-9,3],[-1,5],[7,3],[15,6],[11,10],[-1,11],[-12,9]]);
      well(ctx,-7,4,true);
      poly(ctx,'#657f8f',[[2,6],[2,-4],[6,-10],[11,-10],[14,-4],[16,5]]);
      poly(ctx,'#314652',[[6,6],[6,-2],[8,-5],[11,-5],[13,-2],[13,6]]);
      line(ctx,'#b6bca6',1.1,[[5,5],[5,-2],[8,-5],[11,-5],[14,-2],[14,5]]);
      line(ctx,'#a0a89b',.65,[[8,2],[7,8],[11,9],[11,2]]);
      break;
    case 'farm':
      chamber(ctx,-5,6,15,8,slate);roof(ctx,-5,-2,10,6,slate);
      oval(ctx,'#3d514c',7,4,4.2,4.2);oval(ctx,'#b59668',7,4,3.8,3.6);
      line(ctx,'#46524d',.75,[[4,1],[10,7]]);
      line(ctx,'#46524d',.75,[[4,7],[10,1]]);
      for(const x of [6,10,14,17])rect(ctx,'#ac8e68',x,7,.85,4);
      rect(ctx,'#b69f7b',5,8,13,1);
      break;
    case 'abyss':
      poly(ctx,'#533849',[[-17,6],[-10,1],[1,1],[15,5],[14,9],[4,12],[-10,11]]);
      poly(ctx,'#bb555c',[[-13,7],[-8,4],[1,4],[12,6],[10,9],[3,10],[-8,9]]);
      line(ctx,'#f19b7f',.9,[[-11,7],[-6,6],[0,8],[4,6],[10,7]]);
      poly(ctx,'#3c344b',[[-14,6],[-13,-8],[-8,-13],[-5,-8],[-5,-1],[-7,6]]);
      poly(ctx,'#785366',[[-13,-8],[-8,-13],[-10,-5],[-11,5]]);
      poly(ctx,'#423448',[[4,3],[7,-4],[8,-13],[13,-10],[16,3],[12,5]]);
      poly(ctx,'#996773',[[8,-13],[13,-10],[12,-7],[10,-8],[8,-4]]);
      break;
    case 'well':
      well(ctx,0,5,false);break;
    case 'gate':
      pavilion(ctx,0,8,26,slate,2);break;
    case 'portal':
      poly(ctx,'#4a536c',[[-8,8],[-9,-4],[-5,-11],[5,-11],[9,-4],[8,8],[4,8],[4,-3],[2,-6],[-2,-6],[-4,-3],[-4,8]]);
      line(ctx,'#a2b0ca',.9,[[-8,7],[-8,-4],[-4,-10],[4,-10],[8,-4],[8,7]]);
      poly(ctx,'#7585a5',[[-3,1],[0,-3],[3,1],[0,5]]);
      break;
    case 'ruin':
      poly(ctx,'#5f585b',[[-11,5],[-10,-4],[-5,-5],[-4,5],[-7,7]]);
      poly(ctx,'#89827b',[[-12,-4],[-5,-9],[-3,-7],[-5,-6],[-3,-2],[-10,0]]);
      poly(ctx,'#716962',[[3,7],[4,-4],[7,-2],[11,-5],[11,6],[7,8]]);
      line(ctx,'#b2a292',.9,[[3,1],[7,3],[11,2]]);
      break;
  }
}

function nativeFacade(site:Site,options?:FacadeOptions):Facade{
  if(options?.abandoned)return 'ruin';
  if(options?.kind==='village')return 'farm';
  if(site.type==='sect_hq'){
    if(site.id==='loc-taixu'&&options?.kind==='gate')return 'sword';
    if(site.id==='loc-danxia'&&options?.kind==='terrace')return 'cauldron';
    if(site.id==='loc-tianji'&&options?.kind==='shrine')return 'stars';
  }
  if(options?.kind==='well'&&site.id==='loc-vein-north')return 'north';
  if(site.type==='market')return 'market';
  if(site.type==='abyss')return 'abyss';
  if(site.type==='secret_realm')return 'portal';
  if(site.type==='sect_hq')return 'gate';
  return 'well';
}

/** Present-only geometry is admitted by the map before invoking this illustrative facade. */
export function drawMapArchitecturalSprite(ctx:Pen,site:Site,ownerColor?:string,
  options?:FacadeOptions):void {
  if(!Number.isFinite(site.x)||!Number.isFinite(site.y))return;
  ctx.save();ctx.translate(site.x,site.y);
  ctx.beginPath();ctx.arc(0,0,22.5,0,Math.PI*2);ctx.clip();
  const g=ctx.createRadialGradient(0,2,6,0,2,21);
  g.addColorStop(0,'#23293696');g.addColorStop(1,'#23293600');
  ctx.fillStyle=g;ctx.fillRect(-22,-22,44,44);
  oval(ctx,'#283443a6',0,8,18,5.9);
  poly(ctx,'#e1d5ad90',[[-13,7],[-7,5],[9,5],[14,8],[9,11],[-9,11]]);
  const facade=nativeFacade(site,options);
  layout(ctx,facade);
  if(options?.village&&facade!=='farm'&&facade!=='ruin'){
    chamber(ctx,-13,10.5,5,2.9,straw);roof(ctx,-13,7.7,4.1,2.7,straw);
  }
  // Retain owner affiliation as an ornament, not a boundary or additional status badge.
  if(ownerColor&&hex.test(ownerColor)){
    rect(ctx,'#2e3c46',-2.15,13.8,4.3,2.8);
    rect(ctx,ownerColor,-1.51,14.4,3.02,1.62);
  }
  ctx.restore();
}

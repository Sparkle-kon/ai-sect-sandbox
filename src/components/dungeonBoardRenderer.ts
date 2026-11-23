import {drawCanvasCharacterSprite} from './canvasCharacterSprite';
import type {DungeonBoardFrame} from './dungeonBoardModel';

type Pen=CanvasRenderingContext2D;
type XY=readonly [number,number];
type Chamber=DungeonBoardFrame['rooms'][number]['id'];
const width=640,height=285,tau=2*Math.PI;
const loci:readonly Chamber[]=['garden','hall','sanctum'];
const axis:Record<Chamber,number>={garden:111,hall:320,sanctum:529};
const inks={
  garden:{bed:'#3c6356',ledge:'#597e67',edge:'#84a17a',wall:'#324f4b',wash:'#7fad8568',line:'#729275'},
  hall:{bed:'#526575',ledge:'#63788a',edge:'#a9ad97',wall:'#3a4858',wash:'#88b4c076',line:'#8497a1'},
  sanctum:{bed:'#574961',ledge:'#72607b',edge:'#a993aa',wall:'#3b364d',wash:'#bb9ec367',line:'#9b87a4'},
} satisfies Record<Chamber,{bed:string;ledge:string;edge:string;wall:string;wash:string;line:string}>;

function poly(ctx:Pen,ink:string|CanvasGradient,ps:readonly XY[]){
  ctx.beginPath();ctx.moveTo(...ps[0]);
  for(let i=1;i<ps.length;i++)ctx.lineTo(...ps[i]);
  ctx.closePath();ctx.fillStyle=ink;ctx.fill();
}
function line(ctx:Pen,ink:string,w:number,ps:readonly XY[]){
  ctx.beginPath();ctx.moveTo(...ps[0]);
  for(let i=1;i<ps.length;i++)ctx.lineTo(...ps[i]);
  ctx.strokeStyle=ink;ctx.lineWidth=w;ctx.stroke();
}
function rect(ctx:Pen,ink:string|CanvasGradient,x:number,y:number,w:number,h:number){
  ctx.fillStyle=ink;ctx.fillRect(x,y,w,h);
}
function oval(ctx:Pen,ink:string|CanvasGradient,x:number,y:number,w:number,h:number,rotation=0){
  ctx.beginPath();ctx.ellipse(x,y,w,h,rotation,0,tau);ctx.fillStyle=ink;ctx.fill();
}
function light(ctx:Pen,x:number,y:number,r:number,ink:string){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,ink);g.addColorStop(1,'#00000000');return g;
}
function wash(ctx:Pen,y:number,h:number,a:string,b:string){
  const g=ctx.createLinearGradient(0,y,0,h);g.addColorStop(0,a);g.addColorStop(1,b);return g;
}
function rnd(i:number) {
  const z=Math.imul(i+7919,0x27d4eb2d);
  return ((z^(z>>>15))>>>0)/4294967296;
}
function backdrop(ctx:Pen){
  rect(ctx,wash(ctx,0,285,'#252f3c','#101c29'),0,0,640,285);
  const rock=['#2b3544','#303d4b','#253644','#263342','#394755','#303c4b'];
  for(let i=0;i<21;i++){
    const x=i*32,y=13+27*rnd(i*91);
    poly(ctx,rock[i%rock.length],[[x-24,0],[x+8,0],[x+27,y-6],[x+20,y+12],[x-5,y+6],[x-25,y-7]]);
    const z=267-rnd(i*73)*22;
    poly(ctx,rock[(i+3)%rock.length],[[x-23,285],[x-24,z+8],[x+3,z-9],[x+32,z],[x+22,285]]);
    if(i%2===0){
      line(ctx,'#67768247',1,[[x-9,y+2],[x+4,y-9],[x+16,y-8]]);
      line(ctx,'#68788735',1,[[x-18,z+12],[x+1,z-5],[x+15,z-2]]);
    }
  }
  for(let i=0;i<145;i++){
    const x=rnd(i*11)*638,y=42+rnd(i*31)*208;
    rect(ctx,i%3?'#72829c18':'#92a9a922',x,y,1+rnd(i*45)*3,1);
  }
}
const ring:readonly XY[]=[[-78,113],[-67,82],[-47,57],[41,57],[69,78],[81,112],[81,186],[63,219],[33,237],[-35,238],[-67,216],[-80,186]];
const inner:readonly XY[]=[[-68,111],[-58,85],[-43,66],[38,66],[60,83],[70,116],[71,184],[54,209],[28,224],[-32,226],[-57,205],[-69,181]];
const shift=(ps:readonly XY[],x:number,dy=0)=>ps.map(([q,y])=>[x+q,y+dy] as const);
function region(ctx:Pen,x:number,id:Chamber){
  const c=inks[id];
  poly(ctx,'#152431',shift(ring,x+4,8));
  poly(ctx,c.wall,shift(ring,x));
  poly(ctx,c.ledge,shift(ring,x,-5));
  poly(ctx,wash(ctx,62,236,c.ledge,c.bed),shift(inner,x));
  strokeBoundary(ctx,c.edge,1.7,shift(inner,x));
  ctx.save();
  ctx.beginPath();ctx.moveTo(...shift(inner,x)[0]);
  for(const p of shift(inner,x).slice(1))ctx.lineTo(...p);
  ctx.closePath();ctx.clip();
  if(id!=='garden'){
    for(let i=0;i<14;i++){
      const y=70+i*12;
      line(ctx,c.wall+'8b',1.3,[[x-83,y],[x+83,y]]);
      for(let j=0;j<9;j++){
        const q=x-74+j*19+(i%2)*7;
        line(ctx,c.wall+'8b',1,[[q,y],[q,y+12]]);
        rect(ctx,c.line+'4f',q+1,y+2,10+rnd(i*14+j)*7,1.3);
      }
    }
  }else for(let i=0;i<92;i++){
    const q=x-79+rnd(i*15)*158,y=66+rnd(i*97)*164;
    rect(ctx,i%3?'#b3c38a47':'#38514b67',q,y,1.4+rnd(i*191)*3,1);
  }
  ctx.restore();
}
function strokeBoundary(ctx:Pen,ink:string,weight:number,ps:readonly XY[]){
  line(ctx,ink,weight,[...ps,ps[0]]);
}
function bridge(ctx:Pen,x:number){
  rect(ctx,'#1c2d3b',x-25,121,51,54);
  rect(ctx,'#5f737c',x-25,126,51,40);
  rect(ctx,'#435763',x-25,132,51,27);
  for(const y of [135,147,159])line(ctx,'#304451',1.4,[[x-26,y],[x+26,y]]);
  for(let j=-2;j<=2;j++){
    line(ctx,'#304451',1,[[x+j*11,132],[x+j*11,156]]);
    rect(ctx,'#89999a',x+j*11+3,133,5,1);
  }
  for(const y of [125,164]){
    rect(ctx,'#92a29c',x-26,y,52,1.5);
    for(const q of [-24,0,23])rect(ctx,'#617780',x+q,y-2,3,5);
  }
}
function obscured(ctx:Pen,x:number){
  poly(ctx,'#171f2d',shift(ring,x));
  poly(ctx,'#202a38',shift(inner,x));
  strokeBoundary(ctx,'#3c4959',1.5,shift(inner,x));
  for(let i=0;i<6;i++){
    const dx=rnd(i*31)*82-41,y=105+rnd(i*89)*85;
    oval(ctx,light(ctx,x+dx,y,32,'#61748a2d'),x+dx,y,32,26);
  }
}
function gate(ctx:Pen,x:number,y:number,open:boolean,neutral=false){
  const frame=neutral?'#607381':open?'#89aea0':'#adbaa7';
  polygonArch(ctx,'#23343f',x,y,32,37);
  polygonArch(ctx,frame,x,y,26,34);
  polygonArch(ctx,'#2a3948',x,y,20,26);
  line(ctx,'#849591',2,[[x-31,y+2],[x+31,y+2]]);
  if(!neutral&&!open){
    const barrier=light(ctx,x,y-14,44,'#92e5d2c6');
    oval(ctx,barrier,x,y-14,44,39);
    for(let i=0;i<5;i++){
      const q=x-15+i*7;
      line(ctx,i%2?'#83ccc9':'#c5eed7',1.35,[[q,y-3],[q+7,y-12],[q-3,y-24]]);
    }
    rune(ctx,x,y-14,9,'#dafee2');
  }else if(open){
    line(ctx,'#c5eccd',1.1,[[x-15,y-21],[x,y-29],[x+15,y-21]]);
  }
}
function polygonArch(ctx:Pen,c:string,x:number,y:number,w:number,h:number){
  poly(ctx,c,[[x-w,y],[x-w,y-h*.54],[x-w*.57,y-h*.89],[x,y-h],[x+w*.57,y-h*.89],[x+w,y-h*.54],[x+w,y]]);
}
function rune(ctx:Pen,x:number,y:number,r:number,c:string){
  strokeBoundary(ctx,c,1.1,[[x,y-r],[x+r,y],[x,y+r],[x-r,y]]);
  strokeBoundary(ctx,c,.9,[[x-r*.51,y-r*.51],[x+r*.51,y-r*.51],[x+r*.51,y+r*.51],[x-r*.51,y+r*.51]]);
  line(ctx,c,1,[[x-r*.26,y],[x+r*.26,y]]);
}
function herbs(ctx:Pen,x:number,y:number,scale:number,seed:number){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  oval(ctx,'#2d544b',0,2,17,4);
  for(let i=0;i<5;i++){
    const q=i*5-11,k=8+rnd(seed*i+3)*10;
    strokeBoundary(ctx,'#587d62',.5,[[q,3],[q*.77,-k],[q+5,0]]);
    poly(ctx,i%2?'#aeb380':'#7aa884',[[q,2],[q-4,-5],[q*.77,-k],[q+4,-4],[q+3,0]]);
  }
  ctx.restore();
}
function mushroom(ctx:Pen,x:number,y:number,s:number){
  rect(ctx,'#cabf9b',x-1,y-7*s,2,8*s);
  oval(ctx,light(ctx,x,y-7*s,18*s,'#d5d4a574'),x,y-8*s,18*s,14*s);
  poly(ctx,'#b9c895',[[x-8*s,y-6*s],[x-4*s,y-11*s],[x+1*s,y-13*s],[x+6*s,y-10*s],[x+9*s,y-6*s]]);
  rect(ctx,'#ede5bb',x-2*s,y-11*s,2*s,1.2*s);
}
function garden(ctx:Pen,x:number){
  poly(ctx,'#335d62',[[x-60,98],[x-45,85],[x-21,89],[x-9,101],[x+16,108],[x+36,120],[x+55,120],[x+65,138],[x+41,151],[x+9,134],[x-16,130],[x-40,118],[x-55,114]]);
  poly(ctx,'#5c8a89',[[x-57,101],[x-43,91],[x-25,94],[x-13,106],[x+16,112],[x+35,123],[x+51,126],[x+59,135],[x+42,143],[x+10,128],[x-20,125],[x-40,112],[x-54,110]]);
  for(let i=0;i<14;i++){
    const dx=-48+i*7,y=103+(dx+48)*.38+(rnd(i*791)-.5)*6;
    line(ctx,i%3?'#8bb1a8':'#a6c6aa',.8,[[x+dx,y],[x+dx+5,y+1]]);
  }
  polygonArch(ctx,'#577b72',x,140,18,14);
  for(let j=-2;j<3;j++)rect(ctx,'#acaa85',x+j*6,130+j*.5,5,11);
  for(const [q,y,s] of [[-48,177,1],[44,175,.81],[-24,206,.65],[34,207,.75],[-16,78,.6],[41,98,.65]])herbs(ctx,x+q,y,s,19+q*y);
  for(const [q,y,s] of [[-45,142,.58],[-58,132,.38],[29,164,.61],[50,152,.53],[-48,206,.58],[46,197,.34]])mushroom(ctx,x+q,y,s);
}
function hall(ctx:Pen,x:number,opened:boolean){
  gate(ctx,x,117,opened);
  oval(ctx,light(ctx,x,147,54,opened?'#a8be9f69':'#89cabe66'),x,151,54,41);
  rune(ctx,x,153,25,opened?'#bdc3ab':'#c0e6da');
  for(const d of [-1,1]){
    const q=x+d*48;
    poly(ctx,'#334758',[[q-11,91],[q+11,91],[q+13,169],[q+9,181],[q-9,182],[q-13,167]]);
    poly(ctx,'#849591',[[q-9,85],[q+8,85],[q+9,165],[q+5,173],[q-8,174]]);
    rectanglePillar(ctx,q);
    for(const y of [142,191]){
      oval(ctx,light(ctx,q+d*6,y,19,'#e7cba369'),q+d*6,y,19,15);
      poly(ctx,'#d6c290',[[q+d*6,y-5],[q+d*6+3,y],[q+d*6,y+4],[q+d*6-3,y]]);
    }
  }
}
function rectanglePillar(ctx:Pen,x:number){
  rect(ctx,'#adbaaa',x-7,88,2.5,79);
  rect(ctx,'#35485a',x+6,88,2.8,79);
  rect(ctx,'#9ca99a',x-10,167,20,5);
  rect(ctx,'#738984',x-9,115,18,2);
}

function altar(ctx:Pen,x:number){
  oval(ctx,'#3b344ac2',x+4,158,55,37);
  poly(ctx,'#393348',[[x-51,131],[x-27,115],[x+26,114],[x+51,131],[x+54,154],[x+31,177],[x-30,177],[x-53,155]]);
  poly(ctx,'#877389',[[x-50,126],[x-26,109],[x+26,109],[x+50,126],[x+51,147],[x+28,163],[x-28,163],[x-50,147]]);
  poly(ctx,'#655973',[[x-44,129],[x-25,114],[x+24,114],[x+44,129],[x+44,145],[x+24,156],[x-25,156],[x-44,146]]);
  strokeBoundary(ctx,'#aa97aa',1.3,[[x-44,129],[x-25,114],[x+24,114],[x+44,129],[x+44,145],[x+24,156],[x-25,156],[x-44,146]]);
  rune(ctx,x,134,19,'#b8a0b9');
  for(const q of [-41,40]){
    poly(ctx,'#3f435b',[[x+q-6,92],[x+q-3,78],[x+q,69],[x+q+5,81],[x+q+7,93]]);
    poly(ctx,'#ad9db9',[[x+q-6,92],[x+q-3,79],[x+q,72],[x+q+2,85],[x+q,91]]);
    oval(ctx,light(ctx,x+q,86,18,'#ceb2e44e'),x+q,86,20,19);
  }
}
function guardian(ctx:Pen,x:number,y:number,live:boolean){
  ctx.save();ctx.translate(x,y);
  oval(ctx,'#211d38b7',1,11,44,9);
  if(!live){
    // A flattened stone silhouette records defeat without rendering a still-living encounter.
    poly(ctx,'#524c65',[[-34,2],[-23,-7],[-6,-9],[19,-5],[34,0],[40,7],[22,13],[-25,12]]);
    poly(ctx,'#877590',[[-26,3],[-12,-5],[9,-6],[23,-2],[6,7],[-17,8]]);
    line(ctx,'#a88f9b',1.2,[[24,8],[30,-3],[39,-6]]);
  }else{
    poly(ctx,'#2d2c46',[[-20,-25],[-30,-22],[-39,-13],[-34,-2],[-39,8],[-26,11],[-19,1],[18,3],[25,12],[38,8],[34,-2],[41,-13],[31,-24],[22,-25]]);
    poly(ctx,'#786987',[[-24,-24],[-14,-31],[15,-31],[28,-24],[34,-15],[27,-4],[12,2],[-12,2],[-26,-6],[-31,-15]]);
    poly(ctx,'#53627a',[[-25,-25],[-14,-31],[15,-31],[27,-25],[17,-18],[-16,-19]]);
    poly(ctx,'#9d879e',[[-22,-26],[-8,-30],[9,-30],[20,-26],[15,-22],[-12,-23]]);
    poly(ctx,'#a47787',[[-16,-8],[-10,-17],[11,-17],[17,-8],[12,6],[7,12],[-8,12],[-14,6]]);
    poly(ctx,'#52415f',[[-14,1],[-8,7],[7,7],[15,1],[12,11],[7,16],[-7,16],[-12,11]]);
    for(const d of [-1,1]){
      poly(ctx,'#e7c797',[[d*9,-12],[d*16,-19],[d*23,-22],[d*21,-13],[d*15,-6]]);
      poly(ctx,'#ffd7a1',[[d*3,-1],[d*10,-4],[d*9,1]]);
      rect(ctx,'#936f89',d*29-2,5,4,3);
      rect(ctx,'#b3919c',d*34-1,7,3,2);
    }
    strokeBoundary(ctx,'#b6a0b6',.85,[[-7,-15],[0,-19],[7,-15],[0,-12]]);
  }
  ctx.restore();
}
function bossBar(ctx:Pen,x:number,y:number,value:number,max:number){
  if(!Number.isFinite(value)||!Number.isFinite(max)||max<=0||value<0||value>max)return;
  rect(ctx,'#34273a',x-29,y,58,6);
  rect(ctx,'#e5c3bb',x-27,y+1,54,4);
  rect(ctx,'#573e58',x-26,y+1.7,52,2.5);
  if(value>0)rect(ctx,'#ef9586',x-26,y+1.7,52*value/max,2.5);
}
function chest(ctx:Pen,x:number,y:number,opened:boolean){
  oval(ctx,'#28273998',x+3,y+9,20,7);
  if(!opened)oval(ctx,light(ctx,x,y,30,'#f4d1848a'),x,y,29,23);
  poly(ctx,'#4a403e',[[x-17,y-3],[x-13,y-8],[x+14,y-8],[x+18,y-3],[x+16,y+10],[x-16,y+10]]);
  poly(ctx,'#a16f58',[[x-15,y-1],[x+15,y-1],[x+14,y+8],[x-14,y+8]]);
  if(opened){
    poly(ctx,'#735545',[[x-17,y-1],[x-16,y-10],[x+12,y-13],[x+16,y-6],[x+15,y-1]]);
    poly(ctx,'#3e343e',[[x-14,y-1],[x-10,y-5],[x+11,y-5],[x+15,y-1],[x+11,y+3],[x-11,y+3]]);
  }else{
    poly(ctx,'#b48961',[[x-16,y-1],[x-13,y-8],[x+12,y-8],[x+16,y-1],[x+14,y+3],[x-14,y+3]]);
    rect(ctx,'#fde1a5',x-2,y,4,4);
  }
  for(const dx of [-10,10])rect(ctx,'#d0ac7d',x+dx-1,y,2,8);
}
function focus(ctx:Pen,x:number){
  strokeBoundary(ctx,'#f2d690',2,shift(ring,x,-5));
  for(const q of [-32,32])rect(ctx,'#f3d995',x+q-2,46,4,1.4);
  poly(ctx,'#f2d896',[[x,40],[x+6,46],[x,52],[x-6,46]]);
}
function marker(ctx:Pen,x:number,actor:DungeonBoardFrame['actor']){
  if(!actor)return;
  oval(ctx,'#253242',x,206,19,7);
  oval(ctx,'#e5cd92',x,205,16,5.7);
  oval(ctx,'#374b54',x,204,13,4.6);
  drawCanvasCharacterSprite(ctx,x,203,{...actor,pose:'idle'},39,0);
}

/** Compact tactical read, not a movement canvas. No undisclosed cell is authored differently. */
export function drawDungeonBoard(ctx:Pen,frame:DungeonBoardFrame,w:number,h:number):void{
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;
  ctx.save();ctx.scale(w/width,h/height);
  backdrop(ctx);
  const state=(id:Chamber)=>{
    const rows=frame.rooms.filter(room=>room.id===id);
    return rows.length===1?rows[0].state:'hidden';
  };
  const known=(id:Chamber)=>state(id)!=='hidden';
  if(known('garden')&&known('hall'))bridge(ctx,(axis.garden+axis.hall)/2);
  if(known('hall')&&known('sanctum'))bridge(ctx,(axis.hall+axis.sanctum)/2);
  for(const id of loci){
    const x=axis[id];
    if(!known(id)){
      obscured(ctx,x);
      if(id==='garden'&&frame.entrance)gate(ctx,x,173,false,true);
      continue;
    }
    region(ctx,x,id);
    if(id==='garden')garden(ctx,x);
    else if(id==='hall')hall(ctx,x,known('sanctum'));
    else{
      altar(ctx,x);
      const body=frame.boss;
      if(body&&Number.isFinite(body.hp)&&Number.isFinite(body.maxHp)&&body.maxHp>0&&body.hp>=0&&body.hp<=body.maxHp){
        guardian(ctx,x,141,body.hp>0);
        bossBar(ctx,x,96,body.hp,body.maxHp);
      }
      if(frame.treasure==='claimable'||frame.treasure==='claimed')chest(ctx,x,170,frame.treasure==='claimed');
    }
    if(frame.at===id&&state(id)==='current'&&!frame.historical){
      focus(ctx,x);marker(ctx,x,frame.actor);
    }
  }
  ctx.restore();
}

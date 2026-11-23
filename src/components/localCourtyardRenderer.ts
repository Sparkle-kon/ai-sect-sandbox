import { drawCanvasCharacterSprite } from './canvasCharacterSprite';
import { courtyardFacilityScale, type LocalCourtyardPlan } from './localCourtyardModel';

type Pen = CanvasRenderingContext2D;
type Pt = readonly [number,number];
type Theme = LocalCourtyardPlan['theme'];
type Ground = LocalCourtyardPlan['tiles'][number]['ground'];
type Facility = LocalCourtyardPlan['facilities'][number];
const CELL = 40;

interface Ink {
  turf: string; light:string; leaf:string; shadow:string; moss:string;
  stone:string; mortar:string; glaze:string; roof:string; trim:string; window:string;
}
const theme = {
 sword_peak:{turf:'#4a755d',light:'#81a679',leaf:'#3a7464',shadow:'#253f48',moss:'#a5b47c',stone:'#91aaa0',mortar:'#5f8180',glaze:'#b8c8a4',roof:'#507c83',trim:'#c2d9c6',window:'#ffe3a8'},
 pill_valley:{turf:'#58805a',light:'#83a368',leaf:'#497a5b',shadow:'#354b47',moss:'#abb471',stone:'#ad9774',mortar:'#796e60',glaze:'#c8ab81',roof:'#987654',trim:'#dcc491',window:'#fff0b1'},
 market:{turf:'#725e61',light:'#a17a78',leaf:'#755264',shadow:'#452f43',moss:'#ac8e70',stone:'#a47d76',mortar:'#785d67',glaze:'#c4a18a',roof:'#b46664',trim:'#e8a57b',window:'#ffdf9d'},
 blood_abyss:{turf:'#674b61',light:'#905b72',leaf:'#6e4b6c',shadow:'#372739',moss:'#b77678',stone:'#825d6f',mortar:'#5d475f',glaze:'#aa7a83',roof:'#815168',trim:'#c58080',window:'#ff9d82'},
 north_vein:{turf:'#7999a2',light:'#9db5be',leaf:'#476c80',shadow:'#364d65',moss:'#b3cacc',stone:'#91a7b5',mortar:'#627c8f',glaze:'#c4d3d2',roof:'#6884a0',trim:'#d4e2e0',window:'#ffe4aa'},
 countryside:{turf:'#68835a',light:'#91a971',leaf:'#547558',shadow:'#364d4a',moss:'#b5ba72',stone:'#9a9275',mortar:'#746e62',glaze:'#c2ad83',roof:'#687d77',trim:'#c9c7a1',window:'#ffe3a3'},
} satisfies Record<Theme, Ink>;

function poly(ctx:Pen, color:string,p:readonly Pt[]):void{
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(...p[0]);
  for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);
  ctx.closePath();ctx.fill();
}
function rect(ctx:Pen,c:string,x:number,y:number,w:number,h:number):void{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function line(ctx:Pen,c:string,w:number,p:readonly Pt[]):void{
  ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(...p[0]);
  for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);
  ctx.stroke();
}
function oval(ctx:Pen,c:string,x:number,y:number,rx:number,ry:number):void{
  ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function rand(seed:number,i:number):number {
  const h=Math.imul(seed^Math.imul(i+17,0x9e3779b9),0x7feb352d);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function grass(ctx:Pen,c:Ink,x:number,y:number,s:number, snow:boolean):void{
  const glow=snow?'#e1ece6':c.light;
  line(ctx,c.shadow,.65,[[x-1,y],[x-.7,y-s],[x+1,y-1],[x+2,y-s*.78],[x+3,y]]);
  rect(ctx,glow,x-.8,y-s-.65,1.05,1.2);
}
function stone(ctx:Pen,x:number,y:number,w:number,h:number,c:Ink,snow:boolean):void{
  poly(ctx,c.shadow,[[x-w,y],[x-w*.7,y-h],[x+w*.15,y-h*1.23],[x+w*.8,y-h*.67],[x+w,y],[x+w*.28,y+1.8]]);
  poly(ctx,snow?'#cbd9da':c.mortar,[[x-w*.91,y-.45],[x-w*.64,y-h],[x+w*.15,y-h*1.13],[x+w*.65,y-h*.64],[x+w*.16,y-.25]]);
  line(ctx,snow?'#e1e9e2':c.glaze,.73,[[x-w*.6,y-h*.96],[x+w*.1,y-h*1.14],[x+w*.51,y-h*.72]]);
}
function bridgeDeck(ctx:Pen,x:number,y:number,c:Ink):void{
  poly(ctx,'#344c55',[[x,y+8],[x+40,y+8],[x+40,y+35],[x,y+35]]);
  rect(ctx,c.mortar,x,y+9,40,24);
  poly(ctx,c.stone,[[x,y+13],[x+40,y+13],[x+40,y+30],[x,y+30]]);
  for(let i=0;i<8;i++){
    const q=x+i*5;
    line(ctx,c.mortar,.65,[[q,y+13.5],[q,y+30.5]]);
    rect(ctx,c.glaze,q+.4,y+14,3.6,.8);
  }
  line(ctx,c.glaze,1.5,[[x,y+10],[x+40,y+10]]);
  line(ctx,c.glaze,1.4,[[x,y+31],[x+40,y+31]]);
  for(const dx of [3,33]){
    rect(ctx,c.shadow,x+dx,y+6,2.1,7);
    rect(ctx,c.trim,x+dx-.5,y+6,3,1.5);
    rect(ctx,c.shadow,x+dx,y+28,2.1,7);
    rect(ctx,c.trim,x+dx-.5,y+28,3,1.5);
  }
}

function surface(ctx:Pen,ground:Ground,c:Ink,x:number,y:number,seed:number,time:number):void{
  const snow=ground==='snow';
  if(ground==='water'||ground==='bridge'){
    rect(ctx,'#477b82',x,y,CELL,CELL);
    for(let j=0;j<4;j++){
      const q=((rand(seed,j+4)*31+time*(j%2?2.1:1.2))%33)+2;
      line(ctx,j%2?'#659fa0':'#76aaa6',.8,[[x+q,y+7+j*8],[x+q+2,y+6.5+j*8],[x+q+4,y+7+j*8]]);
    }
    return;
  }

  const fill=ground==='stone'?c.stone:ground==='soil'?'#8d6f59':ground==='ash'?'#5d465d':snow?'#9eb6bd':c.turf;
  rect(ctx,fill,x,y,CELL,CELL);
  if(ground==='stone'){
    for(let row=0;row<4;row++){
      const dy=y+row*10;
      line(ctx,c.mortar,.61,[[x,dy+.6],[x+CELL,dy+.6]]);
      for(let column=0;column<3;column++){
        const dx=x+column*14+(row%2?6:0);
        if(dx+1>=x+CELL)continue;
        const end=Math.min(x+CELL,dx+6+rand(seed,row*11+column)*5);
        line(ctx,c.glaze,.61,[[dx+.6,dy+2],[end,dy+2]]);
        if(dx>x)line(ctx,c.mortar,.62,[[dx,dy+1],[dx,dy+10]]);
      }
    }
  }else{
    ctx.globalAlpha=.55;
    for(let j=0;j<7;j++){
      const dx=x+1+rand(seed,j+9)*32,dy=y+2+rand(seed,j+35)*35,l=2.2+rand(seed,j+63)*4.8;
      const ink=ground==='soil'?(j%3?'#b09266':'#674e56'):snow?(j%3?'#c8d9d8':'#71919e'):j%3?c.light:c.shadow;
      poly(ctx,ink,[[dx,dy],[dx+l*.35,dy-1.7],[dx+l,dy-1.2],[dx+l*.86,dy+1.4],[dx+l*.22,dy+1.5]]);
    }
    ctx.globalAlpha=1;
  }
}

function waterEdges(ctx:Pen,x:number,y:number,n:readonly boolean[],c:Ink,time:number):void {
  for(let i=0;i<4;i++){
    if(n[i])continue;
    ctx.save();ctx.translate(x+20,y+20);ctx.rotate(i*Math.PI/2);
    poly(ctx,c.mortar,[[-20,-20],[20,-20],[20,-14.8],[13,-15.2],[4,-13.2],[-5,-16.4],[-11,-15.4],[-20,-17.1]]);
    line(ctx,'#91b8ac',.8,[[-20,-16.2],[-12,-14.2],[-5,-15.4],[4,-12.1],[13,-14.1],[20,-13.9]]);
    const bend=Math.sin(time*.75+i)*1.3;
    line(ctx,'#7dada7',.62,[[-10+bend,-10.5],[-5+bend,-11],[4+bend,-9.9]]);
    ctx.restore();
  }
}
function tree(ctx:Pen,c:Ink,x:number,y:number,h:number,seed:number,style:'pine'|'bamboo'|'round',time:number,snow:boolean):void{
  const w=h*.35;
  oval(ctx,'#23344365',x+3,y+1,w+3,3);
  rect(ctx,'#645a4a',x-1,y-h*.62,2,h*.63);
  if(style==='pine'){
    for(let j=0;j<4;j++){
      const q=y-h+j*h*.18,g=w*(.47+j*.24);
      poly(ctx,c.shadow,[[x,q],[x+g*.6,q+h*.28],[x+g,q+h*.35],[x-g,q+h*.35],[x-g*.48,q+h*.24]]);
      poly(ctx,snow?'#d9e9df':c.leaf,[[x,q+.7],[x+g*.68,q+h*.28],[x+g*.09,q+h*.22],[x-g*.54,q+h*.28]]);
    }
  }else if(style==='bamboo'){
    for(let j=0;j<5;j++){
      const f=rand(seed,j+4);
      const lift=h*(.53+f*.44), shift=Math.sin(time*.85+j)*1.25;
      const dx=x+(j-2)*2;
      line(ctx,c.shadow,1.4,[[dx,y],[dx+shift+(j-2)*2,y-lift]]);
      line(ctx,c.moss,.66,[[dx+.64,y-2],[dx+.5+shift+(j-2)*2,y-lift]]);
      for(let k=1;k<4;k++){
        const u=dx+(j-2)*k*.47+shift*k*.23,v=y-lift*(.31+k*.17);
        poly(ctx,k%2?c.leaf:c.light,[[u,v],[u+4,v-3],[u+9,v-4],[u+5,v-1]]);
      }
    }
  }else{
    for(let j=0;j<7;j++){
      const f=rand(seed,j+19),q=rand(seed,j+47);
      const u=x+(f-.5)*w*2.12,v=y-h*(.50+q*.31),r=h*(.18+q*.07);
      poly(ctx,j%3===0?c.shadow:c.leaf,[[u-r,v],[u-r*.55,v-r*.74],[u+r*.48,v-r],[u+r,v-r*.2],
       [u+r*.74,v+r*.47],[u-r*.49,v+r*.59]]);
      line(ctx,c.light,.83,[[u-r*.54,v-.52*r],[u-.18*r,v-.68*r],[u+.24*r,v-.66*r]]);
    }
  }
}

function trimRoof(ctx:Pen,c:Ink,x:number,y:number,w:number,h:number):void{
  poly(ctx,c.shadow,[[x-w,y],[x-w*.75,y-h*.12],[x-w*.45,y-h*.63],[x-w*.29,y-h],[x+w*.29,y-h],[x+w*.49,y-h*.54],
    [x+w*.8,y-h*.13],[x+w,y-.45],[x+w*.75,y+1.8],[x-w*.78,y+1.8]]);
  poly(ctx,c.roof,[[x-w*.83,y],[x-w*.52,y-h*.41],[x-w*.27,y-h*.9],[x+w*.28,y-h*.9],[x+w*.51,y-h*.41],[x+w*.84,y-.36],[x+w*.63,y+.85],[x-w*.62,y+.85]]);
  line(ctx,c.trim,.86,[[x-w*.82,y-.18],[x-w*.47,y-h*.51],[x-w*.28,y-h*.94],[x+w*.28,y-h*.94],[x+w*.49,y-h*.53],[x+w*.77,y-.48]]);
  for(const a of [-.66,-.36,0,.36,.66])line(ctx,c.shadow,.67,[[x+a*w*.47,y-h*.82],[x+a*w,y]]);
}
function hall(ctx:Pen,c:Ink,x:number,y:number,w:number,tiers:number):void{
  rect(ctx,c.shadow,x-w*.4,y-w*.375,w*.81,w*.4);
  rect(ctx,c.roof,x-w*.34,y-w*.33,w*.68,w*.305);
  for(const a of [-.25,.13])rect(ctx,c.window,x+a*w,y-w*.265,w*.12,w*.135);
  rect(ctx,c.shadow,x-w*.074,y-w*.26,w*.148,w*.26);
  line(ctx,c.mortar,.68,[[x-w*.26,y-w*.18],[x+w*.24,y-w*.18]]);
  trimRoof(ctx,c,x,y-w*.34,w*.50,w*.245);
  if(tiers>1)trimRoof(ctx,c,x,y-w*.56,w*.36,w*.17);
  if(tiers>2)trimRoof(ctx,c,x,y-w*.71,w*.24,w*.15);
  rect(ctx,c.trim,x-w*.48,y+.9,w*.96,1.1);
}

function lantern(ctx:Pen,c:Ink,x:number,y:number,time:number):void{
  const t=x+Math.sin(time*1.2+x)*.62;
  oval(ctx,'#f7a45e36',t,y+2,5,5.1);
  line(ctx,c.shadow,.7,[[x,y-4],[t,y-.4]]);
  oval(ctx,'#9f4e4b',t,y+1.35,2.6,3.05);
  rect(ctx,'#ee7863',t-1.62,y-1,3.22,4.7);
  rect(ctx,c.window,t-.45,y-.4,.9,3.05);
  rect(ctx,'#ffc480',t-.46,y+4.3,.85,1.25);
}

function allotment(ctx:Pen,x:number,y:number,c:Ink):void{
  poly(ctx,c.shadow,[[x-15,y+8],[x-12,y-11],[x+13,y-11],[x+16,y+8],[x+13,y+12],[x-14,y+12]]);
  poly(ctx,'#977055',[[x-13,y+7],[x-10,y-9],[x+11,y-9],[x+14,y+8],[x+12,y+10],[x-12,y+10]]);
  for(let j=0;j<4;j++){
    const v=y-7+j*5;
    line(ctx,'#67534e',.87,[[x-10.5-j*.7,v],[x+11+j*.6,v]]);
    for(let k=-1;k<2;k++){
      const u=x+k*(6+j*.35);
      rect(ctx,c.shadow,u,v-3,.8,3.4);
      poly(ctx,k%2?c.moss:c.light,[[u,v-1],[u-2.4,v-3.9],[u,v-3],[u+2.1,v-4.3],[u+2.5,v-2.9]]);
    }
  }
}

function furnace(ctx:Pen,x:number,y:number,c:Ink,time:number):void {
  const a=Math.sin(time*3.7+x)*1.08;
  for(let j=0;j<3;j++){
    const rise=(j*4+time*4.8)%12;
    oval(ctx,'#f7deb246',x+a+Math.sin(rise*.4)*1.3,y-16-rise,2+rise*.24,.8+rise*.13);
  }
  hall(ctx,c,x-4,y+5,25,1);
  oval(ctx,c.shadow,x+8,y+10,7.5,2);
  poly(ctx,'#5a464c',[[x+2,y],[x+5,y-3],[x+12,y-3],[x+15,y],[x+13,y+8],[x+11,y+10],[x+4,y+9]]);
  rect(ctx,'#e1aa70',x+2,y-.2,13.4,1.7);
  rect(ctx,'#4b3243',x+5,y+4,6.8,4.5);
  poly(ctx,'#f49759',[[x+5.2,y+8],[x+6.6,y+5],[x+7.6,y+6],[x+8.7+a,y+3.9],[x+10.9,y+8]]);
  rect(ctx,'#fff3a5',x+7.9,y+7,1.8,1);
}
function market(ctx:Pen,x:number,y:number,c:Ink,time:number):void{
  for(const a of [-12,12])rect(ctx,c.shadow,x+a,y-5,2,16);
  rect(ctx,c.shadow,x-12,y+3,24,8);
  rect(ctx,'#b78961',x-12,y+3,24,1.8);
  for(const a of [-8,-1,6])rect(ctx,c.glaze,x+a,y,4,3.2);
  poly(ctx,'#98495d',[[x-17,y-6],[x-11,y-15],[x+11,y-15],[x+17,y-6],[x+16,y-2],[x-16,y-2]]);
  for(let i=0;i<4;i++){
    const dx=x-10+i*5.6;
    poly(ctx,'#e19d78',[[dx,y-14.7],[dx+2.4,y-14.7],[dx+4.5,y-6],[dx+4.3,y-2.2],[dx+1.1,y-2.2],[dx+.9,y-6]]);
  }
  for(const a of [-14,14])lantern(ctx,c,x+a,y+.8,time);
}
function array(ctx:Pen,x:number,y:number,c:Ink,time:number):void{
  oval(ctx,c.shadow,x,y+3,18,11);
  poly(ctx,c.mortar,[[x-16,y+4],[x-10,y-7],[x+10,y-7],[x+16,y+4],[x+12,y+11],[x-12,y+11]]);
  oval(ctx,c.stone,x,y+1,13,7);
  ctx.strokeStyle=c.trim;ctx.lineWidth=1;
  ctx.beginPath();ctx.ellipse(x,y+1,11,5.5,0,0,Math.PI*2);ctx.stroke();
  line(ctx,c.shadow,1,[[x-9,y+3],[x+7,y-2],[x+2,y+5],[x-6,y-2],[x+9,y+3],[x-9,y+3]]);
  const q= Math.sin(time*1.6)*.78;
  poly(ctx,c.window,[[x,y-10+q],[x+4,y-4+q],[x,y+2+q],[x-4,y-4+q]]);
  poly(ctx,c.trim,[[x,y-10+q],[x,y+2+q],[x-4,y-4+q]]);
  for(const a of [-10,10]){
    rect(ctx,c.shadow,x+a-1.25,y-4,2.5,5.4);
    rect(ctx,c.glaze,x+a-.65,y-4.2,1.3,1.7);
  }
}
function pavilion(ctx:Pen,x:number,y:number,c:Ink):void{
  hall(ctx,c,x,y+8,33,2);
  rect(ctx,c.shadow,x-10,y,20,7);
  for(let j=0;j<2;j++){
    for(let i=0;i<6;i++){
      const u=x-8+i*3.15;
      rect(ctx,i%2?c.trim:j?c.roof:c.glaze,u,y+j*3,1.3,2.2);
    }
    rect(ctx,c.mortar,x-9,y+2.4+j*3,18,.66);
  }
}
function village(ctx:Pen,x:number,y:number,c:Ink):void{
  hall(ctx,c,x-5,y+8,24,1);
  oval(ctx,c.shadow,x+9,y+6,5.9,5.5);
  oval(ctx,'#b39567',x+9,y+6,4.5,4.25);
  line(ctx,c.shadow,.68,[[x+6,y+3],[x+12,y+9]]);
  line(ctx,c.shadow,.68,[[x+6,y+9],[x+12,y+3]]);
  for(const a of [9,12,15,18])rect(ctx,c.shadow,x+a,y+8,1.1,4.85);
  rect(ctx,'#b6a279',x+8,y+9,11,1);
}

function facilityPaint(ctx:Pen,item:Facility,c:Ink,time:number):void{
  const {x,y,kind}=item;
  const scale=courtyardFacilityScale(kind);
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.translate(-x,-y);
  ctx.beginPath();ctx.rect(x-20,y-20,40,40);ctx.clip();
  oval(ctx,'#282c3b65',x,y+9,18,6.4);
  switch(kind){
    case 'gate':
      hall(ctx,c,x,y+9,37,2);
      for(let i=0;i<3;i++)rect(ctx,c.glaze,x-7-i*1.2,y+8+i,14+i*2.4,1.05);
      break;
    case 'pavilion':pavilion(ctx,x,y,c);break;
    case 'furnace':furnace(ctx,x,y,c,time);break;
    case 'herbs':allotment(ctx,x,y,c);break;
    case 'array':array(ctx,x,y,c,time);break;
    case 'market':market(ctx,x,y,c,time);break;
    case 'village':village(ctx,x,y,c);break;
  }
  ctx.restore();
}

function civilian(ctx:Pen, person:LocalCourtyardPlan['villagers'][number], time:number):void {
  const {x,y}=person;
  const {face,palette,attire}=person.sprite.appearance;
  const lean=time===0?0:Math.sin(time*1.65+x)*.62;
  ctx.save();ctx.translate(x,y);
  oval(ctx,'#26363f67',0,12.5,9,2.7);
  poly(ctx,face.ink,[[-4,6],[-.9,6],[-.9,13],[-5,13],[-5,11],[2,6],[5,7],[5,11],[6.2,12],[6.2,13],[1,13],[1,9]]);
  poly(ctx,face.ink,[[-4,-5],[4,-5],[7,-2],[7,5],[9,10],[4,12],[-6,12],[-8,10],[-6,4],[-7,-1]]);
  poly(ctx,palette.fabric,[[-3,-4],[3,-4],[5,-1],[5,4],[7,9],[4,10.6],[-5,10.6],[-6.5,9],[-5,3],[-5,-1]]);
  line(ctx,palette.trim,.82,[[-4,-3],[-.6,1.4],[3,-3]]);
  rect(ctx,palette.trim,-5.1,3,10.4,1.15);
  rect(ctx,face.skin,-6,1.7,2,2.8);
  rect(ctx,face.skin,4.3,1.6,2,2.9);
  if(attire==='layered')line(ctx,palette.trim,.64,[[-4,5],[-5.15,8.6],[1,8.65]]);
  ctx.translate(lean,0);
  poly(ctx,face.ink,[[-5,-14],[-3,-17],[3,-17],[5.2,-14],[5.1,-7],[3,-5],[-4,-5],[-5.5,-8]]);
  poly(ctx,face.skin,[[-3,-13],[3.1,-13],[4,-9],[2,-6],[-2,-6],[-4,-9]]);
  poly(ctx,face.ink,[[-5,-13],[-2,-16],[3,-16],[5,-13],[4,-11],[1,-13],[-3,-11]]);
  if(face.hair%2)rect(ctx,palette.trim,-3.5,-14.85,6.2,.7);
  if(face.hair>=2)poly(ctx,face.ink,[[-2,-16],[-2.4,-19],[.7,-19],[1.4,-16]]);
  rect(ctx,face.ink,1,-10.5,1.1,.9);
  ctx.restore();
}

function backdrop(ctx:Pen,frame:LocalCourtyardPlan,c:Ink,time:number):void{
  const occupied=new Set([...frame.facilities,...frame.actors,...frame.villagers].map(p=>p.col+':'+p.row));
  const ground=new Map(frame.tiles.map(row=>[row.col+':'+row.row,row.ground]));
  const isWater=(col:number,row:number)=>{
    const g=ground.get(col+':'+row);
    return g==='water'||g==='bridge';
  };
  for(const tile of frame.tiles){
    const {col,row,ground}=tile,x=col*CELL,y=row*CELL,seed=(col+7)*971+(row+19)*513+frame.theme.length*113;
    ctx.save();ctx.beginPath();ctx.rect(x,y,CELL,CELL);ctx.clip();
    surface(ctx,ground,c,x,y,seed,time);
    if(ground==='water'||ground==='bridge'){
      waterEdges(ctx,x,y,[isWater(col,row-1),isWater(col+1,row),isWater(col,row+1),isWater(col-1,row)],c,time);
      if(ground==='bridge')bridgeDeck(ctx,x,y,c);
    }else if(ground==='grass'||ground==='soil'||ground==='snow'||ground==='ash') {
      const edge=col<=1||col>=14||row<=1||row>=8;
      const snowy=ground==='snow'||frame.theme==='north_vein'||frame.season==='winter'&&frame.theme!=='blood_abyss';
      if(!occupied.has(col+':'+row)){
        const x0=x+12+rand(seed,7)*16,y0=y+32+rand(seed,17)*5;
        if(ground!=='ash'&&((edge&&rand(seed,21)>.28)||rand(seed,21)>.87)){
          const sv=22+rand(seed,27)*12;
          tree(ctx,c,x0,y0,sv,seed,frame.theme==='pill_valley'?'bamboo':frame.theme==='sword_peak'||snowy?'pine':'round',time,snowy);
        }else if(rand(seed,31)>.54){
          stone(ctx,x0,y0,5+rand(seed,6)*6,2.6+rand(seed,11)*4,c,snowy);
        }
      }
      for(let i=0;i<4;i++){
        const q=x+5+rand(seed,i+63)*28,r=y+8+rand(seed,i+80)*29;
        grass(ctx,c,q,r,2+rand(seed,i+97)*4,snowy);
      }
    }else if(frame.theme==='market'&&col%3===0&&(row===1||row===8)&&!occupied.has(col+':'+row)){
      rect(ctx,c.shadow,x+18,y+7,1.6,22);
      rect(ctx,c.trim,x+17,y+7,10,1.2);
      lantern(ctx,c,x+26,y+14,time);
    }
    ctx.restore();
  }
}

export function drawLocalCourtyard(ctx:Pen,frame:LocalCourtyardPlan,width:number,height:number,timeMs:number):void {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const t=Number.isFinite(timeMs)?Math.max(0,timeMs)/1000:0,c=theme[frame.theme];
  ctx.save();ctx.scale(width/frame.width,height/frame.height);
  rect(ctx,c.shadow,0,0,frame.width,frame.height);
  backdrop(ctx,frame,c,t);
  for(const site of frame.facilities)facilityPaint(ctx,site,c,t);
  for(const person of frame.actors)drawCanvasCharacterSprite(ctx,person.x,person.y,person.sprite,35,t);
  for(const person of frame.villagers)civilian(ctx,person,t);
  ctx.restore();
}

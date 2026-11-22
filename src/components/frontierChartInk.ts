type InkMotif='coast'|'salt'|'ridge'|'lattice'|'snow'|'reed'|'plain';
interface Ink {motif:InkMotif;wash:string;deep:string;edge:string;brush:string}
const palette={
  'chart-east-offshore':{motif:'coast',wash:'#183243',deep:'#0a263a',edge:'#4d8192',brush:'#81c9cb'},
  'chart-western-saltwell':{motif:'salt',wash:'#3d3127',deep:'#221915',edge:'#826a4e',brush:'#eac58a'},
  'chart-plateau-thunderridge':{motif:'ridge',wash:'#282d44',deep:'#141927',edge:'#696b94',brush:'#c7b8f1'},
  'chart-upper-array-field':{motif:'lattice',wash:'#342646',deep:'#1a152c',edge:'#837298',brush:'#d9b9ee'},
  'chart-north-snow':{motif:'snow',wash:'#263b48',deep:'#142536',edge:'#638998',brush:'#c9e5ee'},
  'chart-south-marsh':{motif:'reed',wash:'#263b34',deep:'#142721',edge:'#58765b',brush:'#b6d197'},
} satisfies Record<string,Ink>;
const plain:Ink={motif:'plain',wash:'#19343a',deep:'#11262d',edge:'#477078',brush:'#97bbb7'};
export const frontierChartInk=(chartId:string):Ink=>Object.hasOwn(palette,chartId)?palette[chartId as keyof typeof palette]:plain;

interface CellInkOptions {
  x:number;y:number;size:number;row:number;col:number;active:boolean;sea:boolean;
}
export function paintFrontierCellInk(ctx:CanvasRenderingContext2D,profile:Ink,{x,y,size,row,col,active,sea}:CellInkOptions) {
  if(size<=5)return;
  const seaWash='#164354';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x+2,y+2,size-4,size-4);
  ctx.clip();
  ctx.translate(x,y);
  ctx.scale(size,size);
  const wash=ctx.createLinearGradient(0,0,.92,1);
  wash.addColorStop(0,sea?seaWash:profile.wash);
  wash.addColorStop(1,profile.deep);
  ctx.fillStyle=wash;
  ctx.fillRect(0,0,1,1);
  const seed=(Math.imul(row+17,19349663)^Math.imul(col+29,73856093))>>>0;
  const offset=(seed%13)*.006;
  ctx.strokeStyle=profile.brush;
  ctx.lineWidth=1/size;
  ctx.globalAlpha=active?.35:.27;
  if(sea){
    for(let i=0;i<4;i++){
      const b=.13+i*.21+offset;
      ctx.beginPath();ctx.moveTo(-.16,b);ctx.bezierCurveTo(.17,b-.2,.34,b+.22,.58,b);
      ctx.bezierCurveTo(.78,b-.16,.95,b+.08,1.14,b-.07);ctx.stroke();
    }
  }else if(profile.motif==='coast'){
    for(let i=0;i<3;i++){
      const b=.52+i*.13+offset;
      ctx.beginPath();ctx.moveTo(-.1,b);ctx.bezierCurveTo(.56,b+.04,.49,b-.51,1.08,b-.38);ctx.stroke();
    }
  }else if(profile.motif==='salt'){
    for(let i=0;i<4;i++){
      const b=.40+i*.16+offset;
      ctx.beginPath();ctx.moveTo(-.12,b);ctx.quadraticCurveTo(.19,b-.32,.38,b-.18);
      ctx.quadraticCurveTo(.68,b+.07,1.1,b-.29);ctx.stroke();
    }
  }else if(profile.motif==='ridge'||profile.motif==='snow'){
    for(let i=0;i<3;i++){
      const b=.41+i*.19+offset;
      ctx.beginPath();ctx.moveTo(-.12,b+.23);ctx.lineTo(.16,b+.01);ctx.lineTo(.29,b+.08);
      ctx.lineTo(.55,b-.29);ctx.lineTo(.71,b-.07);ctx.lineTo(.80,b-.15);ctx.lineTo(1.06,b+.03);ctx.stroke();
    }
    if(profile.motif==='snow'){
      ctx.fillStyle=profile.brush;
      for(let i=0;i<6;i++)ctx.fillRect(.08+((seed>>>i*2)%17)*.05,.12+i*.14,.011,.011);
    }
  }else if(profile.motif==='lattice'){
    for(let i=1;i<4;i++){
      const radius=i*.16;
      ctx.beginPath();ctx.moveTo(.50-radius,.50);ctx.lineTo(.50,.50-radius);
      ctx.lineTo(.50+radius,.50);ctx.lineTo(.50,.50+radius);ctx.closePath();ctx.stroke();
    }
    ctx.beginPath();ctx.moveTo(.50,.02);ctx.lineTo(.50,.98);ctx.moveTo(.02,.50);ctx.lineTo(.98,.50);ctx.stroke();
  }else if(profile.motif==='reed'){
    for(let i=0;i<4;i++){
      const a=.07+i*.25+offset;
      ctx.beginPath();ctx.moveTo(a,.98);ctx.quadraticCurveTo(a-.07,.84,a+.06,.59);ctx.stroke();
      ctx.beginPath();ctx.moveTo(a,.88);ctx.quadraticCurveTo(a+.08,.82,a+.15,.81);ctx.stroke();
    }
  }else{
    ctx.beginPath();ctx.moveTo(.02,.72);ctx.lineTo(.33,.59);ctx.lineTo(.57,.68);ctx.lineTo(.9,.52);ctx.stroke();
  }
  ctx.restore();
}

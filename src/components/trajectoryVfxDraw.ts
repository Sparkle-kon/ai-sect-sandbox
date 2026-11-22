import type {MapPoint} from '../types/world';
import type {MapFlyingSword} from './mapFlyingSwordView';
import type {MapTravelTrajectoryMarker} from './mapTravelTrajectory';

const FLIGHT_MS=780;
const ROAD_MS=660;
const stable=(point:MapPoint)=>Number.isFinite(point.x)&&Number.isFinite(point.y);
const same=(left:MapPoint,right:MapPoint)=>left.x===right.x&&left.y===right.y;
const eased=(elapsed:number,limit:number)=>{
  const t=Math.min(1,Math.max(0,elapsed/limit));
  return t*t*(3-2*t);
};

function sample(points:readonly MapPoint[],progress:number) {
  let remaining=0;
  const lengths:number[]=[];
  for(let i=1;i<points.length;i++){
    const span=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
    lengths.push(span);remaining+=span;
  }
  if(remaining===0)return {point:points[0],angle:0,trail:[] as MapPoint[]};
  let distance=remaining*progress;
  for(let i=0;i<lengths.length;i++){
    const a=points[i],b=points[i+1],span=lengths[i];
    if(!span)continue;
    if(distance<=span||i===lengths.length-1){
      const ratio=Math.min(1,Math.max(0,distance/span));
      const point={x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};
      return {point,angle:Math.atan2(b.y-a.y,b.x-a.x),trail:[...points.slice(0,i+1),point]};
    }
    distance-=span;
  }
  return {point:points[points.length-1],angle:0,trail:[...points]};
}
function route(ctx:CanvasRenderingContext2D,points:readonly MapPoint[],color:string,width:number){
  if(points.length<2)return;
  ctx.beginPath();
  ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
}

function sword(ctx:CanvasRenderingContext2D,{x,y}:MapPoint,angle:number,s:number){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle='#fff3bd';ctx.strokeStyle='#6e4a15';ctx.lineWidth=s;
  ctx.beginPath();ctx.moveTo(9*s,0);ctx.lineTo(-1*s,-2.5*s);ctx.lineTo(-4*s,0);ctx.lineTo(-1*s,2.5*s);
  ctx.closePath();ctx.fill();ctx.stroke();
  route(ctx,[{x:-3*s,y:-3.5*s},{x:-3*s,y:3.5*s}],'#fbbf24',1.5*s);
  ctx.fillStyle='#b45309';ctx.fillRect(-7*s,-.8*s,4*s,1.6*s);
  ctx.restore();
}
function envelope(ctx:CanvasRenderingContext2D,{x,y}:MapPoint,s:number){
  ctx.fillStyle='#ead69e';ctx.strokeStyle='#684619';ctx.lineWidth=s;
  ctx.fillRect(x-6*s,y-4*s,12*s,8*s);ctx.strokeRect(x-6*s,y-4*s,12*s,8*s);
  route(ctx,[{x:x-5*s,y:y-3*s},{x,y},{x:x+5*s,y:y-3*s}],'#a27b38',s);
  ctx.fillStyle='#ae4428';ctx.beginPath();ctx.arc(x,y,1.3*s,0,2*Math.PI);ctx.fill();
}
function cart(ctx:CanvasRenderingContext2D,{x,y}:MapPoint,s:number){
  ctx.fillStyle='#d7a86e';ctx.strokeStyle='#352716';ctx.lineWidth=1.1*s;
  ctx.fillRect(x-6*s,y-4*s,11*s,6*s);ctx.strokeRect(x-6*s,y-4*s,11*s,6*s);
  route(ctx,[{x:x+5*s,y:y+s},{x:x+8*s,y:y-1*s}],'#f2c083',1.4*s);
  for(const offset of [-3,3]){
    ctx.beginPath();ctx.arc(x+offset*s,y+3*s,2.15*s,0,Math.PI*2);
    ctx.fillStyle='#493017';ctx.fill();ctx.strokeStyle='#fde8bc';ctx.lineWidth=.8*s;ctx.stroke();
  }
}
function pennant(ctx:CanvasRenderingContext2D,{x,y}:MapPoint,s:number,stride:number){
  route(ctx,[{x:x-2*s,y:y+5*s},{x:x-2*s,y:y-7*s}],'#d7f3dc',1.4*s);
  ctx.beginPath();ctx.moveTo(x-1*s,y-6.5*s);ctx.lineTo(x+7*s,y-4.5*s);ctx.lineTo(x-1*s,y-1.5*s);ctx.closePath();
  ctx.fillStyle='#75c7a1';ctx.fill();ctx.strokeStyle='#123d34';ctx.lineWidth=.8*s;ctx.stroke();
  ctx.fillStyle='#e9ebd1';ctx.beginPath();ctx.arc(x+1*s,y-.2*s,1.3*s,0,Math.PI*2);ctx.fill();
  route(ctx,[{x:x+s,y:y+s},{x:x+s,y:y+3*s},{x:x+(2.2+stride)*s,y:y+5*s}],'#e9ebd1',1.1*s);
  route(ctx,[{x:x+s,y:y+3*s},{x:x+(.1-stride)*s,y:y+5*s}],'#e9ebd1',1.1*s);
}

/** Pure drawing of the current authorized projections. No predicted waypoint, external pixels, or state writes. */
export function drawMapTrajectoryVfx(ctx:CanvasRenderingContext2D,letters:readonly MapFlyingSword[],
  markers:readonly MapTravelTrajectoryMarker[],elapsedMs:number,animate:boolean,logicalPerCssPixel:number) {
  if(!letters.length&&!markers.length)return;
  const s=Number.isFinite(logicalPerCssPixel)?Math.min(16,Math.max(.05,logicalPerCssPixel)):1;
  const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):FLIGHT_MS;
  ctx.save();
  ctx.setLineDash([]);
  for(const letter of letters){
    const {points}=letter;
    if(points.length===0||!points.every(stable))continue;
    if(!animate||elapsed>=FLIGHT_MS||points.length<2){
      envelope(ctx,points[points.length-1],s);
      continue;
    }
    const pose=sample(points,eased(elapsed,FLIGHT_MS));
    if(!pose.point)continue;
    route(ctx,pose.trail,'rgba(252,211,77,.20)',4*s);
    route(ctx,pose.trail,'rgba(253,231,166,.80)',1.25*s);
    sword(ctx,pose.point,pose.angle,s);
  }
  for(const marker of markers){
    if(!stable(marker.point))continue;
    const canMove=animate&&elapsed<ROAD_MS&&marker.walked.length>1&&marker.walked.every(stable)&&
      same(marker.walked[marker.walked.length-1],marker.point);
    const pose=canMove?sample(marker.walked,eased(elapsed,ROAD_MS)):undefined;
    const at=pose?.point??marker.point;
    if(marker.kind==='caravan')cart(ctx,at,s);
    else pennant(ctx,at,s,pose?Math.sin(elapsed*.028)*.8:0);
  }
  ctx.restore();
}

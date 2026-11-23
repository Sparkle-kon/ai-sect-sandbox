import {getCurrentBoundaryCoverage,type BoundaryCoverageView} from '../engine/boundaryReliefEngine';
import type {Cultivator,MapPoint,WorldState} from '../types/world';

export function visibleBoundaryGapCoverage(world:WorldState,viewer:Cultivator|undefined,
  isCurrentLocation:(id:string)=>boolean):Map<string,BoundaryCoverageView>{
  return new Map(getCurrentBoundaryCoverage(world,viewer).filter(row=>row.tick===world.tick&&isCurrentLocation(row.postSiteId))
    .map(row=>[row.postSiteId,row]));
}

/** One nearby flag is a visual witness to a posted guard, not a territorial marker. */
export function drawBoundaryGapFlag(ctx:CanvasRenderingContext2D,point:MapPoint,scale:number,
  state:BoundaryCoverageView['kind']|undefined){
  if(state!=='incumbent'&&state!=='relief')return;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(scale)||scale<=0)return;
  ctx.save();
  try{
    ctx.translate(point.x+17*scale,point.y-16*scale);
    ctx.scale(scale,scale);
    ctx.beginPath();ctx.moveTo(0,11);ctx.lineTo(0,-8);
    ctx.lineWidth=2;ctx.strokeStyle='#cbd5e1';ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(11,-6);ctx.lineTo(7,-3);ctx.lineTo(11,0);ctx.lineTo(0,-1);ctx.closePath();
    ctx.fillStyle=state==='relief'?'#9de0c0':'#b5b1c9';ctx.fill();
    ctx.strokeStyle='#242738';ctx.lineWidth=1;ctx.stroke();
  }finally{ctx.restore();}
}

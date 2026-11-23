import {projectAnomalyRelay,type AnomalyRelayScene} from '../engine/anomalyRelay';
import type {Cultivator,WorldState} from '../types/world';
import type {createTerrainMapView} from './terrainMapView';

type TerrainView=ReturnType<typeof createTerrainMapView>;
export function visibleAnomalyRelayMarks(world:WorldState,view:TerrainView,viewer?:Cultivator):ReadonlyMap<string,AnomalyRelayScene>{
  const story=viewer?projectAnomalyRelay(world,viewer):undefined;
  const marks=new Map<string,AnomalyRelayScene>();
  for(const scene of story?.scenes??[]){
    if(view.isCurrentLocation(scene.siteId)&&view.seenLocations.some(site=>site.id===scene.siteId))marks.set(scene.siteId,scene);
  }
  return marks;
}

const deliveryLabel:Record<AnomalyRelayScene['channel'],string>={
  witness:'当地亲见',conversation:'当面听闻',flying_sword:'飞剑实至',
};

export function formatAnomalyRelayMark(scene:AnomalyRelayScene){
  return `${scene.year}年${scene.month}月 · ${deliveryLabel[scene.channel]}`;
}

/** A small admitted-location seal, not a route, effect radius, or additional label. */
export function drawAnomalyRelaySeal(ctx:CanvasRenderingContext2D,x:number,y:number,scale:number){
  if(!Number.isFinite(scale)||scale<=0)return;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.beginPath();
  ctx.arc(0,0,5,0,2*Math.PI);
  ctx.lineWidth=1.15;
  ctx.fillStyle='#231b14';
  ctx.strokeStyle='#f6d789';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2,-.5);ctx.lineTo(0,-2);ctx.lineTo(2,-.5);ctx.moveTo(-2,1.5);ctx.lineTo(2,1.5);
  ctx.stroke();
  ctx.restore();
}

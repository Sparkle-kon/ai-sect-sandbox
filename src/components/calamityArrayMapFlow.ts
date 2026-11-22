import {projectCalamityArrayFlows} from '../engine/calamityArray';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import type {MapPoint,WorldState} from '../types/world';
import type {createTerrainMapView} from './terrainMapView';

export interface CalamityMapFlow {
  readonly siteId:string;
  readonly center:MapPoint;
  readonly lane:0|1;
  readonly stance:'joint'|'local';
}
type Terrain=ReturnType<typeof createTerrainMapView>;

export function buildCalamityMapFlows(world:WorldState,view:Terrain):readonly CalamityMapFlow[]{
  const bodies=new Set(world.cultivators);
  const physicalSites=new Set(world.locations);
  const visible=new Map(view.liveActors.filter(actor=>bodies.has(actor)).map(actor=>[actor.id,actor]));
  const sites=new Map(view.seenLocations.map(site=>[site.id,site]));
  const bySite=new Map<string,CalamityMapFlow[]>();
  const paidSeats=new Set<string>();
  for(const row of projectCalamityArrayFlows(world)){
    const actor=visible.get(row.actorId),site=sites.get(row.siteId);
    if(!actor||!actor.alive||actor.hp<=0||actor.locationId!==row.siteId||actor.sectId!==row.sectId||
      actor.positionPlane!==undefined||view.trailPositions.has(actor.id)||!site||!physicalSites.has(site)||!view.isCurrentLocation(site.id)||
      isScopedExpeditionGate(site)||!Number.isFinite(site.x)||!Number.isFinite(site.y))continue;
    const seat=JSON.stringify([site.id,row.sectId]);
    if(paidSeats.has(seat))continue;
    paidSeats.add(seat);
    const drawn=bySite.get(site.id)??[];
    if(drawn.length<2)drawn.push({siteId:site.id,center:{x:site.x,y:site.y},lane:drawn.length===0?0:1,stance:row.stance});
    bySite.set(site.id,drawn);
  }
  return [...bySite.values()].flat();
}

/** Two locally centered traces, never a fictitious route between real or hidden people. */
export function drawCalamityMapFlows(ctx:CanvasRenderingContext2D,flows:readonly CalamityMapFlow[],pixel:number):void {
  if(!flows.length)return;
  const s=Number.isFinite(pixel)?Math.max(.05,Math.min(16,pixel)):1;
  ctx.save();
  try{
    ctx.lineCap='round';
    ctx.shadowBlur=0;
    ctx.globalAlpha=.84;
    for(const {center,lane,stance} of flows.slice(0,16)){
      if(!Number.isFinite(center.x)||!Number.isFinite(center.y))continue;
      ctx.beginPath();
      ctx.lineWidth=(lane===0?1.5:1.25)*s;
      ctx.strokeStyle=lane===0?'#83cdb9':'#e6ca82';
      ctx.setLineDash(lane===0?[]:[2.5*s,1.8*s]);
      const start=stance==='joint'?Math.PI*.08:Math.PI*.2;
      const end=stance==='joint'?Math.PI*1.86:Math.PI*1.45;
      ctx.ellipse(center.x,center.y+(10+lane*3)*s,(19+lane*4)*s,(5+lane*2)*s,0,start,end);
      ctx.stroke();
    }
  }finally{ctx.restore();}
}

export function calamityFlowSummary(flows:readonly CalamityMapFlow[]):string|undefined {
  if(flows.length===2&&flows.every(row=>row.stance==='joint'))return '本地实有两股合阵流光';
  return flows.length?'本地实有守阵流光':undefined;
}

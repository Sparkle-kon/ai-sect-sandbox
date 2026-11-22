import {projectSchoolFormStrokes} from '../engine/schoolFormDuel';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import type {MapPoint,WorldState} from '../types/world';
import type {createTerrainMapView} from './terrainMapView';

export interface SchoolFormMapStroke extends MapPoint {readonly siteId:string}
type Terrain=ReturnType<typeof createTerrainMapView>;

/** Only anonymous marks at an actually visible and physically witnessed native hit. */
export function buildSchoolFormMapStrokes(world:WorldState,view:Terrain):SchoolFormMapStroke[]{
  const native=projectSchoolFormStrokes(world);
  if(!native.length)return [];
  const physicalActors=new Set(world.cultivators),physicalSites=new Set(world.locations);
  const visible=new Map(view.liveActors.filter(actor=>physicalActors.has(actor)).map(actor=>[actor.id,actor]));
  const sites=new Map(view.seenLocations.filter(site=>physicalSites.has(site)).map(site=>[site.id,site]));
  const bodies=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const result=new Map<string,SchoolFormMapStroke>();
  for(const row of native){
    const actor=visible.get(row.actorId),opponent=visible.get(row.opponentId),site=sites.get(row.siteId);
    if(!actor||actor.locationId!==row.siteId||actor.positionPlane!==undefined||view.trailPositions.has(actor.id)||
      !site||result.has(site.id)||isScopedExpeditionGate(site)||!view.isCurrentLocation(site.id)||
      !Number.isFinite(site.x)||!Number.isFinite(site.y))continue;
    const other=bodies.get(row.opponentId);
    if(!other||row.opponentId===row.actorId||other.locationId!==site.id||other.positionPlane!==undefined||
      view.trailPositions.has(other.id)||!opponent&&(other.alive||other.hp!==0))continue;
    result.set(site.id,{siteId:site.id,x:site.x,y:site.y});
  }
  return [...result.values()];
}

export function drawSchoolFormMapStrokes(ctx:CanvasRenderingContext2D,marks:readonly SchoolFormMapStroke[],pixel:number):void {
  if(!marks.length)return;
  const s=Number.isFinite(pixel)?Math.max(.05,Math.min(16,pixel)):1;
  ctx.save();
  try{
    ctx.lineCap='round';
    ctx.shadowBlur=0;
    for(const {x,y} of marks.slice(0,16)){
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      ctx.beginPath();
      ctx.moveTo(x-12*s,y+3*s);
      ctx.quadraticCurveTo(x+4*s,y-11*s,x+12*s,y-4*s);
      ctx.globalAlpha=.81;
      ctx.strokeStyle='#352b3c';ctx.lineWidth=3.2*s;ctx.stroke();
      ctx.strokeStyle='#ead7a9';ctx.lineWidth=1.3*s;ctx.stroke();
    }
  }finally{ctx.restore();}
}

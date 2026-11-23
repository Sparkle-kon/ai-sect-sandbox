import {adjacent,matching} from '../engine/furnaceEmergencyProof';
import type {Cultivator,MapPoint,WorldState} from '../types/world';
import type {createTerrainMapView} from './terrainMapView';

type Segment={from:MapPoint;to:MapPoint};
export function visibleFurnaceEmergencyRescueSegments(world:WorldState,view:ReturnType<typeof createTerrainMapView>,viewer?:Cultivator):readonly Segment[]{
  if(!viewer?.alive||viewer.hp<=0||viewer.positionPlane!==undefined||
    world.cultivators.filter(actor=>actor.id===viewer.id).length!==1||!world.cultivators.includes(viewer))return [];
  const results:Segment[]=[];
  for(const row of world.furnaceEmergencies?.cases??[]){
    const decision=row.decision;
    if(decision?.move!=='request_rescue'||decision.crossedTick!==world.tick||decision.acceptedTick!==world.tick-1||
      !decision.refugeId||row.studentId===row.mentorId)continue;
    const originals=world.events.filter(event=>event.id===`evt-${row.id}-crossed-${world.tick}`);
    if(originals.length!==1||!matching(world,row,'crossed',originals[0],world.tick))continue;
    const from=view.seenLocations.filter(site=>site.id===row.siteId),to=view.seenLocations.filter(site=>site.id===decision.refugeId);
    if(from.length!==1||to.length!==1||!view.isCurrentLocation(from[0].id)||!view.isCurrentLocation(to[0].id)||
      !adjacent(world,from[0],to[0]))continue;
    if(![row.studentId,row.mentorId].every(id=>{
      const exact=world.cultivators.filter(actor=>actor.id===id);
      return exact.length===1&&exact[0].alive&&exact[0].hp>0&&exact[0].positionPlane===undefined&&exact[0].locationId===to[0].id;
    }))continue;
    results.push({from:{x:from[0].x,y:from[0].y},to:{x:to[0].x,y:to[0].y}});
  }
  return results;
}

export function drawFurnaceEmergencyRescueSegments(ctx:CanvasRenderingContext2D,segments:readonly Segment[],d:number){
  if(!segments.length||!Number.isFinite(d)||d<=0)return;
  ctx.save();
  ctx.strokeStyle='rgba(180,228,206,.76)';
  ctx.lineCap='round';ctx.lineWidth=1.4*d;
  ctx.setLineDash([2.4*d,3.1*d]);
  for(const {from,to} of segments){
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
  }
  ctx.restore();
}

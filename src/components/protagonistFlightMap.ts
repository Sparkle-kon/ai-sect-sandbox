import {terrainTileAt} from '../engine/terrainEngine';
import type {MapPoint,WorldState} from '../types/world';
import {visibleCheckpointRoute} from './mapConvoyView';
import type {MapTravelTrajectoryMarker} from './mapTravelTrajectory';
import type {createTerrainMapView} from './terrainMapView';

type TerrainView=ReturnType<typeof createTerrainMapView>;
interface FlightMapRound{readonly tick:number;readonly points:readonly MapPoint[]}
export interface FlightPaintedEdge{
  readonly a:MapPoint;
  readonly b:MapPoint;
  readonly tick:number;
  readonly newest:boolean;
}
const same=(a:MapPoint,b:MapPoint)=>a.x===b.x&&a.y===b.y;
const point=({x,y}:MapPoint):MapPoint=>({x,y});

/** Draw only traversed neighboring tiles, never a forecast, hidden gap, or shortcut. */
export function buildProtagonistFlightEdges(world:WorldState,view:TerrainView,
  rounds:readonly FlightMapRound[]):FlightPaintedEdge[]{
  if(!rounds.length)return [];
  const newest=rounds.reduce((at,round)=>Number.isSafeInteger(round.tick)&&round.tick>=1&&round.tick<=world.tick?Math.max(at,round.tick):at,-1);
  const edges:FlightPaintedEdge[]=[];
  for(const round of rounds){
    if(!Number.isSafeInteger(round.tick)||round.tick<1||round.tick>world.tick)continue;
    for(let i=1;i<round.points.length;i++){
      const a=round.points[i-1],b=round.points[i];
      if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||same(a,b))continue;
      const p=terrainTileAt(world,a.x,a.y),q=terrainTileAt(world,b.x,b.y);
      if(!p||!q||Math.abs(p.row-q.row)+Math.abs(p.col-q.col)>1||view.tileState(p)!=='visible'||view.tileState(q)!=='visible')continue;
      const clipped=visibleCheckpointRoute(world,view,[a,b],0)?.route;
      if(clipped?.length===2&&same(clipped[0],a)&&same(clipped[1],b))
        edges.push({a:point(a),b:point(b),tick:round.tick,newest:round.tick===newest});
    }
  }
  return edges;
}

/** Keep other parties and even same-ID non-pilgrimage markers. Hide only a currently drawn flight's duplicate. */
export function withoutReplacedProtagonistFlightTrajectory(plan:{markers:readonly MapTravelTrajectoryMarker[];hasMotion:boolean},
  journeyId:string|undefined,edges:readonly FlightPaintedEdge[],tick:number):
  {markers:readonly MapTravelTrajectoryMarker[];hasMotion:boolean}{
  if(!journeyId||!edges.some(edge=>edge.tick===tick)||
    !plan.markers.some(mark=>mark.kind==='pilgrimage'&&mark.id===journeyId))return plan;
  const markers=plan.markers.filter(mark=>mark.kind!=='pilgrimage'||mark.id!==journeyId);
  return {markers,hasMotion:markers.some(mark=>mark.walked.length>1)};
}

/** Static ink gold; the caller clips even the halo to currently visible cells. */
export function drawProtagonistFlightEdges(ctx:CanvasRenderingContext2D,edges:readonly FlightPaintedEdge[],pixel:number){
  if(!edges.length)return;
  const unit=Number.isFinite(pixel)?Math.max(.2,Math.min(2.8,pixel)):1;
  ctx.save();
  ctx.lineCap='round';
  for(const newest of [false,true]){
    if(!edges.some(edge=>edge.newest===newest))continue;
    ctx.beginPath();
    for(const {a,b,newest:edgeNewest} of edges)if(edgeNewest===newest){
      ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    }
    ctx.lineWidth=6*unit;
    ctx.strokeStyle=newest?'#362413':'#261e17';
    ctx.stroke();
    ctx.lineWidth=(newest?2.4:1.6)*unit;
    ctx.strokeStyle=newest?'#f6cf7f':'#b8864b';
    ctx.stroke();
  }
  ctx.restore();
}

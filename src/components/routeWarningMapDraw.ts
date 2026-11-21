import type { MapPoint,WorldState } from '../types/world';
import type { PublicRouteWarning } from '../engine/routeWarningEngine';
export const ROUTE_WARNING_KIND_LABEL={meteor:'陨星余险',beast_tide:'兽潮',cursed_miasma:'瘴气'} as const;
export type RouteWarningMapMark=Pick<PublicRouteWarning,'id'|'kind'|'corroborated'|'expiresTick'> &
  {start:MapPoint;end:MapPoint;mid:MapPoint};

/** Map placement only translates the already authorized adjacent edge, not the source journey. */
export function paintedRouteWarningGeometry(world:WorldState, rows:readonly PublicRouteWarning[]):RouteWarningMapMark[] {
  if(!rows.length)return [];
  const tiles=new Map(world.terrain.tiles.map((tile)=>[tile.id,tile]));
  return rows.flatMap(({id,kind,corroborated,expiresTick,fromTileId,toTileId})=>{
    const a=tiles.get(fromTileId),b=tiles.get(toTileId);
    if(!a||!b||Math.abs(a.col-b.col)+Math.abs(a.row-b.row)!==1)return [];
    const start={x:(a.col+.5)*1000/world.terrain.columns,y:(a.row+.5)*600/world.terrain.rows};
    const end={x:(b.col+.5)*1000/world.terrain.columns,y:(b.row+.5)*600/world.terrain.rows};
    return [{id,kind,corroborated,expiresTick,start,end,mid:{x:(start.x+end.x)/2,y:(start.y+end.y)/2}}];
  });
}
export function drawRouteWarningMarks(ctx:CanvasRenderingContext2D,marks:readonly RouteWarningMapMark[],zoom:number):void {
  if(!marks.length)return;
  const scale=1/Math.max(1,zoom);
  ctx.save();
  ctx.strokeStyle='#fde68a';ctx.lineWidth=2*scale;
  for(const {start,end,mid,corroborated} of marks) {
    ctx.setLineDash([2*scale,3*scale]);
    ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
    ctx.setLineDash([]);
    const badge=(radius:number)=>{ctx.beginPath();ctx.rect(mid.x-radius,mid.y-radius,radius*2,radius*2);};
    if(corroborated){badge(11*scale);ctx.stroke();}
    badge(8*scale);ctx.fillStyle='#472311';ctx.fill();ctx.stroke();
    ctx.fillStyle='#fef3c7';ctx.font=`bold ${10*scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('警',mid.x,mid.y);
  }
  ctx.restore();
}

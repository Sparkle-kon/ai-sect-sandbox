import type { MapPoint,WorldState } from '../types/world';
import { terrainTileAt } from '../engine/terrainEngine';
import type { getVisibleHazards } from './mapBrushView';
import type { VillageSupplyCheckpoint } from '../engine/villageSupplyEngine';
import { ROUTE_WARNING_KIND_LABEL, type RouteWarningMapMark } from './routeWarningMapDraw';
import { MAP_CONVOY_STYLES } from './mapConvoyView';
import type { VisibleCheckpoint,VisibleConvoy } from './mapConvoyView';
import type { buildMapPresentation } from './mapPresentationView';
import type { createTerrainMapView } from './terrainMapView';

export interface PaintedMapMark {
  id:string;
  kind:'territory'|'hazard'|'route';
  title:string;
  summary:string;
  point:MapPoint;
}

type Terrain=ReturnType<typeof createTerrainMapView>;
type Presentation=ReturnType<typeof buildMapPresentation>;

/** Translate the exact paint inputs; do not search hidden actors, full routes, or remembered hazards. */
export function paintedMapMarks(world:WorldState,view:Terrain,territories:readonly PaintedMapMark[],
  hazards:ReturnType<typeof getVisibleHazards>,convoys:readonly VisibleConvoy[],escort:VisibleCheckpoint|undefined,
  presentation:Presentation,supplies:readonly VillageSupplyCheckpoint[]=[],
  warnings:readonly RouteWarningMapMark[]=[]):PaintedMapMark[] {
  const isVisible=(point:MapPoint)=>{
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
    const tile=terrainTileAt(world,point.x,point.y);
    return !!tile&&view.tileState(tile)==='visible';
  };
  const actors=new Map(view.liveActors.map(({id,name})=>[id,name]));
  const result:PaintedMapMark[]=[];
  for(const mark of territories) if(mark.kind==='territory'&&isVisible(mark.point))result.push(mark);
  for(const {hazard,tile,width,height,label,symbolLabel} of hazards) {
    const point={x:(tile.col+.5)*width,y:(tile.row+.5)*height};
    if(isVisible(point)&&hazard.createdTick<=world.tick&&world.tick<hazard.expiresTick) result.push({
      id:`hazard:${hazard.id}`,kind:'hazard',title:label,
      summary:`${symbolLabel} · 强度 ${hazard.intensity} · 第 ${tile.row+1} 行第 ${tile.col+1} 列`,point,
    });
  }
  for(const convoy of convoys) if(isVisible(convoy.marker)) result.push({
    id:`relocation:${convoy.id}`,kind:'route',title:`${convoy.sectName}迁宗队伍`,
    summary:`${MAP_CONVOY_STYLES.migration.symbolLabel} · 第 ${convoy.row} 行第 ${convoy.col} 列 · 只示可见路段`,point:convoy.marker,
  });
  if(escort&&isVisible(escort.marker)) result.push({
    id:'selected-escort',kind:'route',title:MAP_CONVOY_STYLES.escort.label,
    summary:`${MAP_CONVOY_STYLES.escort.symbolLabel} · 第 ${escort.row} 行第 ${escort.col} 列 · 只示可见路段`,
    point:escort.marker,
  });
  for(const mark of supplies) if(isVisible(mark.marker) && mark.route.every(isVisible)) result.push({
    id:`village-supply:${mark.id}`,kind:'route',title:mark.returning?'可见村镇互助回程':'可见村镇互助运程',
    summary:`菱形${mark.returning?'返':'运'}标 · 第 ${mark.row} 行第 ${mark.col} 列 · 只示可见路段`,point:mark.marker,
  });
  for(const mark of warnings) if(isVisible(mark.start) && isVisible(mark.end) && isVisible(mark.mid)) result.push({
    id:`route-warning:${mark.id}`,kind:'route',title:`驿路警示：${ROUTE_WARNING_KIND_LABEL[mark.kind]}`,
    summary:`${mark.corroborated?'双线警标，已有独立旁证':'单线警标，一队亲历'} · 仅该相邻路段 · 第 ${mark.expiresTick} 轮到期 · 不封路`,
    point:mark.mid,
  });
  for(const [actorId,route] of presentation.routes) {
    const name=actors.get(actorId),point=route.points.at(-1);
    if(!name||!point||!route.points.every(isVisible))continue;
    result.push({id:`flight:${actorId}`,kind:'route',title:`${name}实际飞行`,
      summary:`短虚线灵光 · ${route.fromName}至${route.toName}`,point});
  }
  return result;
}

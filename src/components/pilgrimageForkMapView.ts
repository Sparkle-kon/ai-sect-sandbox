import {projectPilgrimageForkTrace} from '../engine/pilgrimageFork';
import {currentVisibleTileIds,terrainTileAt} from '../engine/terrainEngine';
import type {Cultivator,MapPoint,WorldState} from '../types/world';
import type {createTerrainMapView} from './terrainMapView';

export interface PilgrimageForkMapSegment {
  readonly from:MapPoint;
  readonly to:MapPoint;
  readonly side:'own'|'companion';
}
type Scope=ReturnType<typeof createTerrainMapView>;

export function visiblePilgrimageForkSegments(world:WorldState,map:Scope,viewer?:Cultivator):readonly PilgrimageForkMapSegment[]{
  const forks=world.pilgrimageForks?.forks;
  if(!forks?.length||!viewer?.alive||viewer.hp<=0||viewer.positionPlane!==undefined||
    !world.cultivators.includes(viewer)||world.cultivators.filter(row=>row.id===viewer.id).length!==1)return [];
  const own=projectPilgrimageForkTrace(world,viewer);
  const involved=forks.filter(fork=>fork.actors.includes(viewer.id)&&fork.choices.some(choice=>choice.steps?.length&&
    (choice.status==='traveling'||choice.status==='arrived'&&choice.steps.at(-1)?.tick===world.tick)));
  const peers=new Set(involved.flatMap(fork=>fork.actors.filter(id=>id!==viewer.id)));
  const visible=currentVisibleTileIds(world,viewer);
  const output:PilgrimageForkMapSegment[]=[];
  const line=(points:readonly MapPoint[],side:PilgrimageForkMapSegment['side'])=>{
    for(let index=1;index<points.length;index++){
      const from=points[index-1],to=points[index];
      const start=terrainTileAt(world,from.x,from.y),end=terrainTileAt(world,to.x,to.y);
      if(!start||!end||start.id===end.id&&from.x===to.x&&from.y===to.y)continue;
      // A deliberate full-world map can see both actual trails; personal fog never exposes the unseen companion.
      if(side==='companion'&&map.current&&(!visible.has(start.id)||!visible.has(end.id)))continue;
      if(map.known&&(!map.known.has(start.id)||!map.known.has(end.id)))continue;
      output.push({from,to,side});
    }
  };
  line(own,'own');
  for(const id of peers){
    const matches=world.cultivators.filter(row=>row.id===id);
    if(matches.length===1)line(projectPilgrimageForkTrace(world,matches[0]),'companion');
  }
  return output;
}

/** Break the stroke at each unseen leg instead of drawing a shortcut over it. */
export function drawPilgrimageForkSegments(ctx:CanvasRenderingContext2D,segments:readonly PilgrimageForkMapSegment[],logicalPerCssPixel:number){
  if(!segments.length)return;
  ctx.save();
  ctx.lineWidth=1.7*logicalPerCssPixel;
  ctx.lineCap='round';
  for(const side of ['own','companion'] as const){
    ctx.strokeStyle=side==='own'?'rgba(125,211,252,.78)':'rgba(251,191,36,.78)';
    ctx.beginPath();
    for(const part of segments){
      if(part.side!==side)continue;
      ctx.moveTo(part.from.x, part.from.y);
      ctx.lineTo(part.to.x, part.to.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

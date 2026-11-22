import {memo,useId,useRef} from 'react';
import {ScanLine} from 'lucide-react';
import type {MapPoint,WorldState} from '../types/world';
import {terrainTileAt} from '../engine/terrainEngine';
import {clientToMapViewport,MAP_HEIGHT,MAP_WIDTH,type MapCamera} from './mapCamera';
import {BIOME_PALETTE,type createTerrainMapView} from './terrainMapView';
import {EXPLORED_TERRAIN_SHADE} from './terrainMapDraw';

type ChartView=ReturnType<typeof createTerrainMapView>;
export interface StrategicMinimapProps{
  world:WorldState;
  view:ChartView;
  camera:MapCamera;
  strategic:boolean;
  compact?:boolean;
  onToggle:()=>void;
  onPoint:(point:MapPoint)=>void;
}

const HIDDEN_FILL='#070c19';
const SELECTOR='小地图：点击定位';
const box='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';
const clamped=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function strategicMinimapViewport(camera:MapCamera){
  const zoom=Number.isFinite(camera.zoom)&&camera.zoom>=1?camera.zoom:1;
  const width=MAP_WIDTH/zoom,height=MAP_HEIGHT/zoom;
  const x=clamped(Number.isFinite(camera.x)?-camera.x/zoom:0,0,MAP_WIDTH-width);
  const y=clamped(Number.isFinite(camera.y)?-camera.y/zoom:0,0,MAP_HEIGHT-height);
  return {x,y,width,height};
}

export function strategicMinimapKeyboardPoint(world:WorldState,view:ChartView,camera:MapCamera):MapPoint|undefined{
  const {columns,rows}=world.terrain;
  if(columns<1||rows<1)return undefined;
  const {x,y,width,height}=strategicMinimapViewport(camera);
  const desired={x:x+width/2,y:y+height/2};
  const center=terrainTileAt(world,desired.x,desired.y);
  if(center&&view.tileState(center)==='visible')return desired;
  let closest:MapPoint|undefined,best=Infinity;
  for(const tile of world.terrain.tiles){
    if(view.tileState(tile)!=='visible')continue;
    const point={x:(tile.col+.5)*MAP_WIDTH/columns,y:(tile.row+.5)*MAP_HEIGHT/rows};
    const distance=(point.x-desired.x)**2+(point.y-desired.y)**2;
    if(distance<best){best=distance;closest=point;}
  }
  return closest;
}

export function strategicMinimapPointerPoint(world:WorldState,view:ChartView,
  bounds:Pick<DOMRect,'left'|'top'|'width'|'height'>,clientPoint:MapPoint):MapPoint|undefined{
  const point=clientToMapViewport(bounds,clientPoint);
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||
    point.x<0||point.x>MAP_WIDTH||point.y<0||point.y>MAP_HEIGHT)return undefined;
  const tile=terrainTileAt(world,point.x,point.y);
  return tile&&view.tileState(tile)!=='hidden'?point:undefined;
}

const MiniatureTiles=memo(function MiniatureTiles({world,view}:{world:WorldState;view:ChartView}){
  const {columns,rows,tiles}=world.terrain;
  if(columns<1||rows<1)return null;
  const width=MAP_WIDTH/columns,height=MAP_HEIGHT/rows;
  return <g>
    {tiles.map((tile)=>{
      const state=view.tileState(tile);
      const fill=state==='visible'?BIOME_PALETTE[tile.biome].swatch:state==='explored'?EXPLORED_TERRAIN_SHADE:HIDDEN_FILL;
      return <rect key={tile.id} x={tile.col*width} y={tile.row*height} width={width} height={height} fill={fill}/>;
    })}
  </g>;
});

export function StrategicMinimap({world,view,camera,strategic,compact=false,onToggle,onPoint}:StrategicMinimapProps){
  const svg=useRef<SVGSVGElement>(null),help=useId();
  const viewport=strategicMinimapViewport(camera);
  return <div role="group" aria-label="战略小地图"
    className="absolute bottom-2 right-2 z-10 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1.5">
    <button type="button" aria-label={strategic?'返回本域视图':'切换全景视图'} aria-pressed={strategic}
      onClick={onToggle}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-amber-300/45 bg-slate-950/95 px-2.5 text-xs font-semibold text-amber-100 shadow-md hover:border-amber-200 ${box}`}>
      <ScanLine size={14} aria-hidden="true" className="shrink-0"/>
      {strategic?'本域':'全景'}
    </button>
    <div className={`w-24 rounded-md border border-amber-100/30 bg-slate-950/95 p-1 shadow-md sm:w-36 ${compact?'hidden sm:block':''}`}>
      <p id={help} className="sr-only">显示同一张舆图。亮色为眼下可见，暗灰为旧日探索，未探处不标地貌。用键盘定位时选择当前可见地块。</p>
      <button type="button" aria-label={SELECTOR} aria-describedby={help} title={SELECTOR}
        className={`block w-full overflow-hidden rounded-sm text-left ${box}`}
        onClick={event=>{
          const point=event.detail===0?strategicMinimapKeyboardPoint(world,view,camera):svg.current&&
            strategicMinimapPointerPoint(world,view,svg.current.getBoundingClientRect(),{x:event.clientX,y:event.clientY});
          if(point)onPoint(point);
        }}>
        <svg ref={svg} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" className="block w-full">
          <MiniatureTiles world={world} view={view}/>
          <rect x={viewport.x+4} y={viewport.y+4} width={Math.max(0,viewport.width-8)} height={Math.max(0,viewport.height-8)}
            fill="#fef3c7" fillOpacity={0.09} stroke="#fef08a" strokeWidth={8}/>
        </svg>
      </button>
      <div aria-hidden="true" className="mt-0.5 hidden justify-between gap-1 px-0.5 text-[10px] leading-tight text-slate-300 sm:flex">
        <span>可见</span><span>已探索</span><span>未探</span>
      </div>
    </div>
  </div>;
}

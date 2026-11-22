import {memo,useId,useRef} from 'react';
import {ChevronDown,Compass,ScanLine} from 'lucide-react';
import type {MapPoint,TerrainBiome,WorldState} from '../types/world';
import {terrainTileAt} from '../engine/terrainEngine';
import {clientToMapViewport,MAP_HEIGHT,MAP_WIDTH,type MapCamera} from './mapCamera';
import type {createTerrainMapView} from './terrainMapView';

type ChartView=ReturnType<typeof createTerrainMapView>;
export interface StrategicMinimapProps{
  world:WorldState;
  view:ChartView;
  camera:MapCamera;
  strategic:boolean;
  onToggle:()=>void;
  onPoint:(point:MapPoint)=>void;
}

const HIDDEN_FILL='#0b1016',EXPLORED_FILL='#202833';
export const COMPASS_INK:Readonly<Record<TerrainBiome,string>>={
  灵山:'#2f4038',毒沼:'#363b2b',剑冢:'#2c3944',荒漠:'#443827',魔渊:'#3c2933',坊市:'#493d2c',
};
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
  // Build adjoining horizontal bands, not brightly outlined individual tiles.
  const bands=new Map<string,string>();
  let run:{color:string;row:number;first:number;last:number}|undefined;
  const finish=()=>{
    if(!run)return;
    const x=run.first*width,y=run.row*height,w=(run.last-run.first+1)*width;
    bands.set(run.color,(bands.get(run.color)??'')+`M${x} ${y}h${w}v${height}h-${w}Z`);
  };
  for(const tile of tiles){
    const state=view.tileState(tile);
    const fill=state==='visible'?COMPASS_INK[tile.biome]:state==='explored'?EXPLORED_FILL:HIDDEN_FILL;
    if(run&&tile.row===run.row&&tile.col===run.last+1&&run.color===fill){run.last++;continue;}
    finish();run={color:fill,row:tile.row,first:tile.col,last:tile.col};
  }
  finish();
  return <g shapeRendering="crispEdges">{[...bands].map(([color,shape])=><path key={color} fill={color} d={shape}/>)}</g>;
});

export function StrategicMinimap({world,view,camera,strategic,onToggle,onPoint}:StrategicMinimapProps){
  const svg=useRef<SVGSVGElement>(null),help=useId();
  const viewport=strategicMinimapViewport(camera);
  return <div data-map-navigation-dock="" role="group" aria-label="战略小地图"
    className="flex min-w-0 items-start justify-between gap-2 border-t border-amber-900/50 bg-gradient-to-r from-slate-950 via-slate-950 to-amber-950/35 px-2.5 py-2 sm:px-3">
    <details className="group min-w-0 flex-1">
      <summary className={`flex min-h-11 w-fit max-w-full cursor-pointer list-none items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-950/30 px-2.5 text-sm font-semibold text-amber-100 hover:border-amber-200 [overflow-wrap:anywhere] [&::-webkit-details-marker]:hidden ${box}`}>
        <Compass aria-hidden="true" size={17} className="shrink-0 text-amber-300"/>
        <span>舆图罗盘</span>
        <ChevronDown aria-hidden="true" size={14} className="shrink-0 text-amber-200 group-open:rotate-180"/>
      </summary>
      <div className="mt-2 w-full max-w-[17rem] rounded-lg border border-amber-300/30 bg-slate-950 p-1.5 shadow-inner">
        <p id={help} className="sr-only">显示同一张舆图。亮色为眼下可见，暗灰为旧日探索，未探处不标地貌。用键盘定位时选择当前可见地块。</p>
        <button type="button" aria-label={SELECTOR} aria-describedby={help} title={SELECTOR}
          className={`block min-h-11 w-full overflow-hidden rounded-sm text-left ${box}`}
          onClick={event=>{
            const point=event.detail===0?strategicMinimapKeyboardPoint(world,view,camera):svg.current&&
              strategicMinimapPointerPoint(world,view,svg.current.getBoundingClientRect(),{x:event.clientX,y:event.clientY});
            if(point)onPoint(point);
          }}>
          <svg ref={svg} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" className="block w-full">
            <MiniatureTiles world={world} view={view}/>
            <rect x={viewport.x+4} y={viewport.y+4} width={Math.max(0,viewport.width-8)} height={Math.max(0,viewport.height-8)}
              fill="#edd09a" fillOpacity={0.065} stroke="#d8ac5f" strokeWidth={7}/>
          </svg>
        </button>
        <ul aria-hidden="true" className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 px-0.5 text-[11px] leading-snug text-slate-300">
          <li>● 可见</li><li>◒ 已探索</li><li>○ 未探</li>
        </ul>
      </div>
    </details>
    <button type="button" aria-label={strategic?'返回本域视图':'切换全景视图'} aria-pressed={strategic}
      onClick={onToggle}
      className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300/40 bg-slate-950 px-2.5 text-sm font-semibold text-amber-100 hover:border-amber-200 ${box}`}>
      <ScanLine size={15} aria-hidden="true" className="shrink-0 text-amber-300"/>
      {strategic?'本域':'全景'}
    </button>
  </div>;
}

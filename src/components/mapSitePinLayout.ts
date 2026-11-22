import type {LocationNode,MapPoint} from '../types/world';
import type {MarkerViewport} from './mapActorClusters';
import {MAP_HEIGHT,MAP_WIDTH,mapToScreen,screenToMap,type MapCamera} from './mapCamera';

type Site=Pick<LocationNode,'id'|'x'|'y'>;
const isPoint=(point:MapPoint)=>Number.isFinite(point.x)&&Number.isFinite(point.y);

/** A display-only inset for the close northeast pair. Movement, discovery and persistence keep the original sites. */
export function projectMapSitePins(sites:readonly Site[],isCurrentLocation:(id:string)=>boolean,
  camera:MapCamera,viewport:MarkerViewport):ReadonlyMap<string,MapPoint>{
  const result=new Map<string,MapPoint>();
  const {width,height}=viewport;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return result;
  const towers=sites.filter(row=>row.id==='loc-tianji');
  const markets=sites.filter(row=>row.id==='loc-market-east');
  if(towers.length!==1||markets.length!==1)return result;
  const [tower]=towers,[market]=markets;
  if(!isCurrentLocation(tower.id)||!isCurrentLocation(market.id)||!isPoint(tower)||!isPoint(market))return result;
  const toCss=(point:MapPoint)=>{
    const screen=mapToScreen(camera,point);
    return {x:screen.x*width/MAP_WIDTH,y:screen.y*height/MAP_HEIGHT};
  };
  const a=toCss(tower),b=toCss(market);
  const radius=Math.max(10,Math.min(29,21*camera.zoom*width/MAP_WIDTH));
  const distance=radius*2+10;
  if(Math.hypot(a.x-b.x,a.y-b.y)>=distance||[a,b].some(p=>
    p.x<0||p.y<0||p.x>width||p.y>height))return result;
  const blockers=sites.filter(row=>row!==market&&isPoint(row)).map(toCss);
  const border=radius+1;
  const step=Math.max(27,distance*.86);
  const dx=b.x<=a.x?-1:1,dy=b.y>=a.y?1:-1;
  for(const [sx,sy] of [[dx,dy],[-dx,dy],[dx,-dy],[-dx,-dy]]){
    const p={x:a.x+sx*step,y:a.y+sy*step};
    if(p.x<border||p.y<border||p.x>width-border||p.y>height-border||
      blockers.some(other=>Math.hypot(other.x-p.x,other.y-p.y)<distance))continue;
    const pin=screenToMap(camera,{x:p.x*MAP_WIDTH/width,y:p.y*MAP_HEIGHT/height});
    if(pin.x<0||pin.y<0||pin.x>MAP_WIDTH||pin.y>MAP_HEIGHT)continue;
    result.set(market.id,pin);
    break;
  }
  return result;
}

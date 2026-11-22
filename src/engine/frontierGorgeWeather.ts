import type {WorldState} from '../types/world';
import {FRONTIER_CHARTS} from './frontierTerms';
import {terrainTileAt} from './terrainEngine';
import {localQiWeather,seededWeatherFrontEastward} from './weatherEngine';

export const FRONTIER_GORGE_WIND_INTENSITY=.22;
export const northGorgePass='frontier-north-pass' as const;
export const northGorgeHome='frontier-north-home' as const;

export function frontierGorgeWeather(world:WorldState,tick:number) {
  const chart=FRONTIER_CHARTS['north-snow'];
  const matches=world.locations.filter(site=>site.id===chart.anchorId);
  if(matches.length!==1)return;
  const [site]=matches;
  if((site.type!=='spirit_vein'&&site.type!=='sect_hq')||site.spiritRoot!=='水'||
    terrainTileAt(world,site.x,site.y)?.id!==chart.anchorTileId||
    (site.ownerSectId&&!world.sects.some(sect=>sect.id===site.ownerSectId)))return;
  const weather=localQiWeather(world,site,tick);
  const east=seededWeatherFrontEastward(world);
  if(weather.kind!=='罡风'||weather.intensity<FRONTIER_GORGE_WIND_INTENSITY||Math.abs(east)<.2)return;
  return {kind:weather.kind,intensity:weather.intensity,bearing:east>0?'east':'west'} as const;
}
export function frontierGorgeWindBlocks(world:WorldState,from:string,to:string,tick:number):boolean{
  const crossingEast=from===northGorgePass&&to===northGorgeHome;
  const crossingWest=from===northGorgeHome&&to===northGorgePass;
  if(!crossingEast&&!crossingWest)return false;
  const weather=frontierGorgeWeather(world,tick);
  return !!weather&&(crossingEast?weather.bearing==='west':weather.bearing==='east');
}

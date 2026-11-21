import type {FieldObservatoryStation,LocationNode,WorldState} from '../types/world';
import {terrainTileAt} from './terrainEngine';

/** Sample an actual point within the site's existing tile and station grounds without changing map weather. */
export const OBSERVATORY_STATION_RADIUS=24;
const stationOffsets=[
  [-24,0],[24,0],[0,-24],[0,24],[-16,-16],[16,-16],[-16,16],[16,16],
  [-12,0],[12,0],[0,-12],[0,12],[-8,-8],[8,-8],[-8,8],[8,8],
] as const;

export function observatoryEdgeStation(world:WorldState,site:LocationNode):FieldObservatoryStation|undefined{
  const tile=terrainTileAt(world,site.x,site.y);
  if(!tile)return undefined;
  for(const [dx,dy] of stationOffsets){
    const x=site.x+dx,y=site.y+dy;
    if(terrainTileAt(world,x,y)?.id===tile.id)return {kind:'edge',x,y};
  }
  return undefined;
}
export function observatoryStationValid(world:WorldState,site:LocationNode,station:FieldObservatoryStation):boolean{
  const known=observatoryEdgeStation(world,site);
  return station.kind==='edge'&&known?.x===station.x&&known.y===station.y;
}

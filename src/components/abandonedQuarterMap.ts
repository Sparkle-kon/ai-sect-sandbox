import {projectCivilianRuin} from '../engine/abandonedQuarterProof';
import {currentVisibleTileIds,terrainTileAt} from '../engine/terrainEngine';
import type {Cultivator,WorldState} from '../types/world';
import type {createTerrainMapView} from './terrainMapView';

/** The ruin glyph is about native civilian census, not removing visible visiting actors. */
export function visibleAbandonedQuarterSites(world:WorldState,viewer:Cultivator|undefined,
  view:Pick<ReturnType<typeof createTerrainMapView>,'seenLocations'|'isCurrentLocation'>):ReadonlySet<string>{
  const marks=new Set<string>();
  if(!viewer||!viewer.alive||viewer.hp<=0||viewer.positionPlane!==undefined||
    world.cultivators.filter(row=>row.id===viewer.id).length!==1||!world.cultivators.includes(viewer))return marks;
  const ruins=world.villageEvolution.villages.filter(row=>row.status==='ruin');
  if(!ruins.length)return marks;
  const current=currentVisibleTileIds(world,viewer);
  const visible=new Set(view.seenLocations.filter(site=>{
    const tile=terrainTileAt(world,site.x,site.y);
    return !!tile&&current.has(tile.id)&&view.isCurrentLocation(site.id);
  }).map(site=>site.id));
  for(const ruin of ruins){
    if(!visible.has(ruin.siteId))continue;
    const proof=projectCivilianRuin(world,ruin.settlementId);
    if(proof?.siteId===ruin.siteId)marks.add(proof.siteId);
  }
  return marks;
}

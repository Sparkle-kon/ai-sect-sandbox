import {useMemo} from 'react';
import {projectGrandSiegeTheatres} from '../engine/grandSiegeTheatreEngine';
import type {Cultivator,WorldState} from '../types/world';
import {GrandSiegeTheatreCard} from './GrandSiegeTheatreCard';
import {createTerrainMapView} from './terrainMapView';

/** Uses the map's current terrain scope, never a separate omniscient theatre. */
export function GrandSiegeMapScene({world,viewer,fog,visible}:{world:WorldState;viewer?:Cultivator;fog:boolean;visible:boolean}){
  const theatre=useMemo(()=>{
    if(!visible||!viewer||!world.cultivators.includes(viewer)||!world.sieges.some(siege=>siege.theatre))return undefined;
    const terrain=createTerrainMapView(world,viewer,fog);
    const accounts=projectGrandSiegeTheatres(world,terrain,viewer.id);
    const active=(view:typeof accounts[number])=>view.status==='marching'||view.status==='sieging';
    const last=(view:typeof accounts[number])=>view.terminal?.tick??view.round?.tick??view.arrivedTick??0;
    return accounts.sort((a,b)=>Number(active(b))-Number(active(a))||
      Number(b.siteId===viewer.locationId)-Number(a.siteId===viewer.locationId)||last(b)-last(a))[0];
  },[world,viewer,fog,visible]);
  const site=theatre&&world.locations.find(row=>row.id===theatre.siteId);
  return theatre&&site?<GrandSiegeTheatreCard world={world} view={theatre} siteName={site.name}/>:null;
}

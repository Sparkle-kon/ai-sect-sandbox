import {useMemo} from 'react';
import {projectGrandSiegeTheatres} from '../engine/grandSiegeTheatreEngine';
import type {Cultivator,WorldState} from '../types/world';
import {GrandSiegeTheatreCard} from './GrandSiegeTheatreCard';
import {createTerrainMapView} from './terrainMapView';

/** Uses the map's current terrain scope, never a separate omniscient theatre. */
export function GrandSiegeMapScene({world,viewer,fog,visible,witnessScopeKey,personalOnly=false}:{
  world:WorldState;viewer?:Cultivator;fog:boolean;visible:boolean;witnessScopeKey?:string;personalOnly?:boolean;
}){
  const theatre=useMemo(()=>{
    if(!visible||!viewer||!world.cultivators.includes(viewer)||!world.sieges.some(siege=>siege.theatre))return undefined;
    const terrain=createTerrainMapView(world,viewer,fog);
    const projections=projectGrandSiegeTheatres(world,terrain,viewer.id);
    const accounts=personalOnly?projections.filter(view=>view.witness):projections;
    const active=(view:typeof accounts[number])=>view.status==='marching'||view.status==='sieging';
    const last=(view:typeof accounts[number])=>view.terminal?.tick??view.round?.tick??view.arrivedTick??0;
    return accounts.sort((a,b)=>Number(active(b))-Number(active(a))||
      Number(b.siteId===viewer.locationId)-Number(a.siteId===viewer.locationId)||last(b)-last(a))[0];
  },[world,viewer,fog,visible,personalOnly]);
  const site=theatre&&world.locations.find(row=>row.id===theatre.siteId);
  return theatre&&site?<GrandSiegeTheatreCard world={world} view={theatre} siteName={site.name} witnessScopeKey={witnessScopeKey}/>:null;
}

import {lazy,useMemo} from 'react';
import type {Cultivator,WorldState} from '../types/world';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {projectTianjiGazette} from '../engine/tianjiGazetteEngine';
import {createTerrainMapView} from './terrainMapView';

const TianjiGazetteRead=lazy(async()=>({default:(await import('./TianjiGazetteRead')).TianjiGazetteRead}));

export function TianjiGazetteLauncher({world,viewer,scopeKey,historical}:{
  world:WorldState;viewer?:Cultivator;scopeKey:string;historical:boolean;
}){
  const issues=useMemo(()=>{
    if(!world.tianjiGazette?.issues.length||!viewer?.alive||viewer.positionPlane!==undefined||
      world.cultivators.filter(actor=>actor.id===viewer.id).length!==1||!world.cultivators.includes(viewer))return [];
    const map=createTerrainMapView(world,viewer,true);
    const currentVisibleSiteIds=new Set(map.seenLocations.filter(site=>map.isCurrentLocation(site.id)&&!isScopedExpeditionGate(site)).map(site=>site.id));
    return projectTianjiGazette(world,{currentVisibleSiteIds,viewerId:viewer.id});
  },[world,viewer]);
  return issues.length?<TianjiGazetteRead issues={issues} scopeKey={scopeKey} historical={historical}/>:null;
}

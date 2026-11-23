import {lazy,useMemo} from 'react';
import type {Cultivator,WorldState} from '../types/world';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {projectTianjiTabloid} from '../engine/tianjiTabloid';
import {projectTianjiGazette} from '../engine/tianjiGazetteEngine';
import {knownMapLocations} from '../engine/terrainEngine';
import {createTerrainMapView} from './terrainMapView';

const TianjiGazetteRead=lazy(async()=>({default:(await import('./TianjiGazetteRead')).TianjiGazetteRead}));

const TianjiTabloidRead=lazy(async()=>({default:(await import('./TianjiTabloidRead')).TianjiTabloidRead}));

export function TianjiGazetteLauncher({world,viewer,scopeKey,historical}:{
  world:WorldState;viewer?:Cultivator;scopeKey:string;historical:boolean;
}){
  const {issues,quarterlies}=useMemo(()=>{
    const gazette=world.tianjiGazette;
    if(!gazette?.issues.length&&!gazette?.quarterlies?.length||!viewer?.alive||viewer.hp<=0||viewer.positionPlane!==undefined||
      world.cultivators.filter(actor=>actor.id===viewer.id).length!==1||!world.cultivators.includes(viewer))return {issues:[],quarterlies:[]};
    const map=createTerrainMapView(world,viewer,true);
    const currentVisibleSiteIds=new Set(map.seenLocations.filter(site=>map.isCurrentLocation(site.id)&&!isScopedExpeditionGate(site)).map(site=>site.id));
    const scope={currentVisibleSiteIds,viewerId:viewer.id,throughTick:world.tick};
    // A public paper carries news from familiar venues beyond the reader's current field of view.
    // Legacy field reports retain their original current-visibility rule.
    const quarterSites=new Set(knownMapLocations(world,viewer).filter(site=>!isScopedExpeditionGate(site)).map(site=>site.id));
    return {issues:projectTianjiGazette(world,scope),quarterlies:projectTianjiTabloid(world,{...scope,currentVisibleSiteIds:quarterSites})};
  },[world,viewer]);
  const legacy=issues.length?<TianjiGazetteRead issues={issues} scopeKey={scopeKey} historical={historical}/>:null;
  return quarterlies.length?<TianjiTabloidRead issues={quarterlies} scopeKey={scopeKey} historical={historical} legacyArchive={legacy}/>:legacy;
}

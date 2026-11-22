import {useMemo} from 'react';
import {activeAvatar} from '../engine/avatarEngine';
import {projectDramaticBondArcs,projectPersonalDramaticBonds} from '../engine/dramaticBondEngine';
import type {Cultivator,WorldState} from '../types/world';
import {createTerrainMapView} from './terrainMapView';

export function useDramaticBondRead(world:WorldState,viewer:Cultivator|undefined,fog:boolean,
  {story,dossier,allowPersonal}:{story:boolean;dossier:boolean;allowPersonal:boolean}){
  return useMemo(()=>{
    if(!story&&!dossier||!viewer||!world.cultivators.includes(viewer))return {};
    const personal=dossier&&allowPersonal&&activeAvatar(world)===viewer?projectPersonalDramaticBonds(world,viewer.id,viewer.id):undefined;
    if(!world.dramaticBonds?.facts.length)return {personal};
    const terrain=createTerrainMapView(world,viewer,fog);
    const currentVisibleSiteIds=new Set(terrain.seenLocations.filter(site=>terrain.isCurrentLocation(site.id)).map(site=>site.id));
    const scope={viewerId:viewer.id,throughTick:world.tick,currentVisibleSiteIds};
    return {
      subplot:story?projectDramaticBondArcs(world,scope)[0]:undefined,
      publicArcs:dossier?projectDramaticBondArcs(world,{...scope,subjectId:viewer.id}):undefined,
      personal,
    };
  },[world,viewer,fog,story,dossier,allowPersonal]);
}

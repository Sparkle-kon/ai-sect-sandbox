import {useMemo,useState} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {activeAvatar} from '../engine/avatarEngine';
import {projectGrandSiegeTheatres,queueGrandSiegeHero} from '../engine/grandSiegeTheatreEngine';
import type {GrandSiegeHeroMove} from '../types/grandSiege';
import {GrandSiegeTheatreCard} from './GrandSiegeTheatreCard';
import {createTerrainMapView} from './terrainMapView';

type Simulation=ReturnType<typeof useWorldSimulationController>;
export function useGrandSiegeSpotlight(simulation:Simulation,blocked:boolean){
  const [followed,setFollowed]=useState<{scope:string;siegeId:string;actorId:string;before:number}>();
  const {world,preview,timeline,history,authority,viewScopeKey,saveContextVersion,browsing,stepInFlight,
    fastForwardRun,campaignGuard,isStepping,fastForwardLocked,updateWorld,handleStepTick}=simulation;
  const actor=!preview?activeAvatar(world):undefined;
  const projections=useMemo(()=>{
    if(!actor||!world.sieges.some(siege=>siege.theatre))return [];
    return projectGrandSiegeTheatres(world,createTerrainMapView(world,actor,true),actor.id);
  },[world,actor]);
  const offered=actor&&projections.find(view=>view.queued?.actorId===actor.id||
    view.options.length>0&&!view.queued);
  const receipt=actor&&followed?.scope===viewScopeKey&&followed.actorId===actor.id&&
    projections.find(view=>view.siegeId===followed.siegeId&&view.round?.tick===world.tick&&view.round.tick>followed.before);
  const current=receipt||offered||undefined;
  const site=current&&world.locations.find(place=>place.id===current.siteId);
  const revision=saveContextVersion.current;
  const exact=()=>{
    if(!offered||!actor||blocked||authority.current!==world||history.current!==timeline||saveContextVersion.current!==revision||
      browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||activeAvatar(world)!==actor)return undefined;
    const next=projectGrandSiegeTheatres(world,createTerrainMapView(world,actor,true),actor.id)
      .find(view=>view.siegeId===offered.siegeId&&view.siteId===offered.siteId);
    return next&&next.queued?.actorId===offered.queued?.actorId&&next.queued?.move===offered.queued?.move&&
      next.queued?.queuedTick===offered.queued?.queuedTick?next:undefined;
  };
  const onChoose=(move:GrandSiegeHeroMove)=>{
    const live=exact();
    if(!actor||!live||live.queued||!live.options.some(option=>option.grandSiegeHeroMove===move))return false;
    return updateWorld(other=>other===world?queueGrandSiegeHero(other,actor.id,live.siegeId,move):other)!==world;
  };
  const onAdvance=()=>{
    const live=exact();
    if(!actor||live?.queued?.actorId!==actor.id)return false;
    setFollowed({scope:viewScopeKey,siegeId:live.siegeId,actorId:actor.id,before:world.tick});
    void handleStepTick();
    return true;
  };
  const card=!blocked&&current&&site?<GrandSiegeTheatreCard world={world} view={current} siteName={site.name}
    key={`${viewScopeKey}:${actor?.id}:${current.siegeId}`} witnessScopeKey={viewScopeKey}
    controls={!receipt&&offered?{busy:isStepping||fastForwardLocked,onChoose,onAdvance}:undefined}
    onContinue={receipt?()=>setFollowed(undefined):undefined}/>:undefined;
  return {card,pending:!!offered};
}

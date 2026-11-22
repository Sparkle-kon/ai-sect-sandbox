import type {ComponentProps} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {activeAvatar,canQueueAvatarSalvage,queueAvatarSalvage,queueAvatarWaypostMeal} from '../engine/avatarEngine';
import {availableWaypostMealActions} from '../engine/waypostMealEngine';
import type {Cultivator} from '../types/world';
import type {AgentInspector} from './AgentInspector';
import type {ArtifactSalvageControls} from './ArtifactPanel';
import type {WaypostMealControls} from './WaypostMealRead';
import {useAscensionChime} from './useAscensionChime';
import {useAscensionControls} from './useAscensionControls';
import {useCultivationClanControls} from './useCultivationClanControls';
import {useDaoPathControls} from './useDaoPathControls';
import {useDramaticBondRead} from './useDramaticBondRead';
import {useHeavenlyAlchemyControls} from './useHeavenlyAlchemyControls';

type Simulation=ReturnType<typeof useWorldSimulationController>;
export type CultivatorInspectorPanels=Pick<ComponentProps<typeof AgentInspector>,
  'heavenlyAlchemyControls'|'daoPathControls'|'clanControls'|'ascensionControls'|'onListenAscension'|
  'allowPersonalThought'|'publicBonds'|'personalBonds'|'artifactSalvage'>;

export function useCultivatorGuidancePanels(simulation:Simulation,selected:Cultivator|undefined,{
  fog,story,dossier,showPilgrimage,onClearAvatarNotice,
}:{fog:boolean;story:boolean;dossier:boolean;showPilgrimage:boolean;onClearAvatarNotice:()=>void}){
  const {world,visibleWorld,timeline,preview,viewScopeKey,browsing,authority,history,saveContextVersion,
    stepInFlight,fastForwardRun,campaignGuard,isStepping,fastForwardLocked,updateWorld,setIsRunning}=simulation;
  const heavenlyAlchemyControls=useHeavenlyAlchemyControls(simulation,selected);
  const daoPathControls=useDaoPathControls(simulation,selected);
  const clanControls=useCultivationClanControls(simulation,selected);
  const ascensionControls=useAscensionControls(simulation,selected);
  const onListenAscension=useAscensionChime(simulation,selected);
  const allowPersonalThought=!preview&&visibleWorld===world;
  const bonds=useDramaticBondRead(visibleWorld,selected,fog,{story,dossier,allowPersonal:allowPersonalThought});

  const queueSelectedSalvage:ArtifactSalvageControls['onConfirm']=(command,stamp)=>{
    if(browsing.current||stepInFlight.current||fastForwardRun.current||
      history.current.activeBranchId!==timeline.activeBranchId||stamp.scopeKey!==viewScopeKey||
      stamp.actorId!==(selected?.id??null)||stamp.world!==authority.current)return false;
    const next=updateWorld(current=>{
      const candidate=structuredClone(current);
      return queueAvatarSalvage(candidate,stamp.actorId,command.targetArtifactId,command.targetLocationId)?candidate:current;
    });
    if(next===stamp.world)return false;
    setIsRunning(false);
    onClearAvatarNotice();
    return true;
  };

  const journeyContextVersion=saveContextVersion.current;
  const mealAvatar=!preview&&showPilgrimage&&selected&&activeAvatar(world)?.id===selected.id?selected:undefined;
  const waypostMealControls:WaypostMealControls|undefined=mealAvatar?{
    scopeKey:`${viewScopeKey}:${mealAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,mealAvatar.id)?availableWaypostMealActions(mealAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='WAYPOST_MEAL'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==journeyContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarWaypostMeal(clone,mealAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    },
  }:undefined;

  const inspector:CultivatorInspectorPanels={
    heavenlyAlchemyControls,daoPathControls,clanControls,ascensionControls,onListenAscension,allowPersonalThought,
    publicBonds:bonds.publicArcs,personalBonds:bonds.personal,
    artifactSalvage:{scopeKey:viewScopeKey,busy:isStepping||fastForwardLocked,readOnly:!!preview,onConfirm:queueSelectedSalvage},
  };
  return {inspector,subplot:bonds.subplot,waypostMealControls};
}

import {useEffect,useMemo,useRef} from 'react';
import {playAscensionChime} from './ascensionChime';
import {buildAscensionMapVfx} from './ascensionSceneVfx';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import type {Cultivator} from '../types/world';

export function useAscensionChime(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined):(()=>Promise<boolean>)|undefined{
  const {world,preview,timeline,authority,history,saveContextVersion}=sim;
  const view=useRef({world,viewer,preview});
  view.current={world,viewer,preview};
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const eligible=useMemo(()=>!preview&&!!viewer&&world.cultivators.includes(viewer)&&
    buildAscensionMapVfx(world,()=>true,false).some(mark=>mark.kind==='gate'&&mark.actorId===viewer.id),[world,preview,viewer]);
  if(!eligible)return undefined;
  const revision=saveContextVersion.current;
  const stillCurrent=()=>mounted.current&&view.current.world===world&&view.current.viewer===viewer&&!view.current.preview&&
    authority.current===world&&history.current===timeline&&saveContextVersion.current===revision;
  return async()=>stillCurrent()?playAscensionChime(undefined,stillCurrent):false;
}

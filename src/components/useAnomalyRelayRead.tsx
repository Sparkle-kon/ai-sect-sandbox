import {lazy,Suspense,useMemo} from 'react';
import {projectAnomalyRelay} from '../engine/anomalyRelay';
import type {Cultivator,WorldState} from '../types/world';

const AnomalyRelayStoryCard=lazy(async()=>({default:(await import('./AnomalyRelayStoryCard')).AnomalyRelayStoryCard}));

export function useAnomalyRelayRead(world:WorldState,viewer:Cultivator|undefined,active:boolean,recentOnly=false){
  const view=useMemo(()=>active&&viewer?projectAnomalyRelay(world,viewer):undefined,[world,viewer,active]);
  const latest=view?.scenes.at(-1);
  if(!view||!latest||recentOnly&&world.tick-latest.tick>4)return null;
  return <Suspense fallback={null}><AnomalyRelayStoryCard view={view}/></Suspense>;
}

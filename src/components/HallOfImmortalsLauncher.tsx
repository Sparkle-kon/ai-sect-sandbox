import {lazy,Suspense,useMemo,useState} from 'react';
import type {Cultivator,WorldState} from '../types/world';
import {createTerrainMapView} from './terrainMapView';

const HallOfImmortalsModal=lazy(async()=>({default:(await import('./HallOfImmortalsModal')).HallOfImmortalsModal}));

export function HallOfImmortalsLauncher({world,viewer,scopeKey,historical}:{
  world:WorldState;viewer?:Cultivator;scopeKey:string;historical:boolean;
}){
  const [open,setOpen]=useState(false);
  const scope=useMemo(()=>{
    if(!open)return;
    const map=createTerrainMapView(world,viewer,true);
    return {currentVisibleSiteIds:new Set(map.seenLocations.map(site=>site.id)),
      currentVisibleActorIds:new Set(map.liveActors.map(actor=>actor.id))};
  },[open,viewer,world]);
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}
      className="inline-flex min-h-11 max-w-full items-center rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 text-left text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      天机封神榜 · 历代列传
    </button>
    {open&&scope&&<Suspense fallback={<p role="status">展开封神画卷…</p>}>
      <HallOfImmortalsModal world={world} open onClose={()=>setOpen(false)} scopeKey={scopeKey}
        historical={historical} viewerId={viewer?.id} {...scope}/>
    </Suspense>}
  </>;
}

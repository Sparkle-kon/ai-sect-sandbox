import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { resolveGuidedCampaignAssemblyTurn, type GuidedCampaignAssemblyTurn } from '../controllers/guidedCampaignAssemblyTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { activeAvatar } from '../engine/avatarEngine';
import { availableCampaignAssemblyActions, projectCampaignAssembly, type CampaignAssemblyOption } from '../engine/campaignAssembly';
import { exactCampaignAssemblyDecision } from '../engine/campaignAssemblyCognition';
import { queueGrandSiegeHero } from '../engine/grandSiegeTheatreEngine';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./CampaignAssemblyCard')).CampaignAssemblyCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useCampaignAssemblyStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const { world,timeline }=sim, branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,viewerId:viewer?.id,mark:0});
  if(scope.current.visible!==visible||scope.current.viewerId!==viewer?.id)
    scope.current={visible,viewerId:viewer?.id,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const updating=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectCampaignAssembly(world,viewer):undefined,[world,viewer,visible]);
  if(!visible||!viewer||!view)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const possible=view.options.filter(option=>option.kind!=='guard'||activeAvatar(world)===viewer);
  const choose=(option:CampaignAssemblyOption)=>{
    if(updating.current||busy||!scope.current.visible||scope.current.viewerId!==viewer.id||scope.current.mark!==mark||
       sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||
       sim.campaignGuard.current||sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const same=availableCampaignAssemblyActions(viewer,world).filter(row=>row.kind===option.kind&&row.siegeId===option.siegeId);
    if(!exactCampaignAssemblyDecision(option.command,same))return;
    if(option.kind==='guard'){
      if(activeAvatar(world)!==viewer)return;
      updating.current=true;
      try{
        sim.updateWorld(current=>current===world
          ?queueGrandSiegeHero(current,viewer.id,option.siegeId,option.command.grandSiegeHeroMove):current);
      }finally{
        updating.current=false;
      }
      return;
    }
    const request:GuidedCampaignAssemblyTurn={kind:'campaign-assembly',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedCampaignAssemblyTurn(request,world,branchId,revision))return;
    updating.current=true;
    setPending(true);
    void sim.handleStepTick(request).catch(()=>{
      // A rejected turn changes neither diplomatic consent nor arrival.
    }).finally(()=>{
      updating.current=false;
      setPending(false);
    });
  };
  return <Suspense fallback={null}><Card view={{...view,options:possible}} busy={busy} onChoose={choose}/></Suspense>;
}

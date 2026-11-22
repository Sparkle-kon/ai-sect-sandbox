import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedFarewellLandingTurn,type GuidedFarewellLandingTurn } from '../controllers/guidedFarewellLandingTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectFarewellLanding,type FarewellLandingOption } from '../engine/farewellLanding';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./FarewellLandingStoryCard')).FarewellLandingStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useFarewellLandingStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectFarewellLanding(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:FarewellLandingOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const order:GuidedFarewellLandingTurn={kind:'farewell-landing',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedFarewellLandingTurn(order,world,branchId,revision))return;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // A turn that did not settle cannot create a memorial light.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
  };
  return <Suspense fallback={null}><Card view={view} busy={busy} onChoose={choose}/></Suspense>;
}

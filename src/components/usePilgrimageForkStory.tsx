import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedPilgrimageForkTurn,type GuidedPilgrimageForkTurn } from '../controllers/guidedPilgrimageForkTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectPilgrimageFork,type PilgrimageForkOption } from '../engine/pilgrimageFork';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./PilgrimageForkStoryCard')).PilgrimageForkStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function usePilgrimageForkStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectPilgrimageFork(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:PilgrimageForkOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const order:GuidedPilgrimageForkTurn={kind:'pilgrimage-fork',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedPilgrimageForkTurn(order,world,branchId,revision))return;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An unsettled turn does not charge or move anyone.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
  };
  return <Suspense fallback={null}><Card view={view} busy={busy} onChoose={choose}/></Suspense>;
}

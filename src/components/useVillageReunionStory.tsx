import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedVillageReunionTurn,type GuidedVillageReunionTurn } from '../controllers/guidedVillageReunionTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectVillageReunion,type VillageReunionOption } from '../engine/villageReunion';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./VillageReunionStoryCard')).VillageReunionStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useVillageReunionStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectVillageReunion(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:VillageReunionOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const order:GuidedVillageReunionTurn={kind:'village-reunion',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedVillageReunionTurn(order,world,branchId,revision))return;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An unsettled turn does not create a shared past, consent or payment.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
  };
  return <Suspense fallback={null}><Card view={view} busy={busy} onChoose={choose}/></Suspense>;
}

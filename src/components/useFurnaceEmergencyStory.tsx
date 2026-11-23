import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedFurnaceEmergencyTurn,type GuidedFurnaceEmergencyTurn } from '../controllers/guidedFurnaceEmergencyTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectFurnaceEmergency,type FurnaceEmergencyOption } from '../engine/furnaceEmergency';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./FurnaceEmergencyStoryCard')).FurnaceEmergencyStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useFurnaceEmergencyStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const sceneScope=useMemo(()=>({world,branchId,revision,mark}),[world,branchId,revision,mark]);
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectFurnaceEmergency(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view||(!view.options.length&&!view.receipt))return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:FurnaceEmergencyOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return false;
    const order:GuidedFurnaceEmergencyTurn={kind:'furnace-emergency',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedFurnaceEmergencyTurn(order,world,branchId,revision))return false;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An unsettled turn cannot create an actual rescue, wound or safe arrival.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
    return true;
  };
  return <Suspense fallback={null}><Card view={view} sceneScope={sceneScope} busy={busy} onChoose={choose}/></Suspense>;
}

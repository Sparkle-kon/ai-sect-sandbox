import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedNightDoorTurn,type GuidedNightDoorTurn } from '../controllers/guidedNightDoorTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectNightDoor,type NightDoorOption } from '../engine/nightDoor';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./NightDoorStoryCard')).NightDoorStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useNightDoorStory(sim:Sim,active:boolean,viewer:Cultivator|undefined,surface:string) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,surface,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id||scope.current.surface!==surface)
    scope.current={visible,actorId:viewer?.id,surface,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const sceneScope=useMemo(()=>({world,branchId,revision,mark}),[world,branchId,revision,mark]);
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectNightDoor(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view||(!view.options.length&&!view.receipt))return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:NightDoorOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return false;
    const order:GuidedNightDoorTurn={kind:'night-door',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedNightDoorTurn(order,world,branchId,revision))return false;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An unsettled turn cannot create an actual shelter, gate closure, or arrival.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
    return true;
  };
  return <Suspense fallback={null}><Card view={view} sceneScope={sceneScope} busy={busy} onChoose={choose}/></Suspense>;
}

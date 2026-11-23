import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedAbandonedQuarterTurn,type GuidedAbandonedQuarterTurn } from '../controllers/guidedAbandonedQuarterTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectAbandonedQuarter,type AbandonedQuarterOption } from '../engine/abandonedQuarter';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./AbandonedQuarterStoryCard')).AbandonedQuarterStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useAbandonedQuarterStory(sim:Sim,active:boolean,viewer:Cultivator|undefined,surface:string) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,surface,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id||scope.current.surface!==surface)
    scope.current={visible,actorId:viewer?.id,surface,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const sceneScope=useMemo(()=>({world,branchId,revision,mark}),[world,branchId,revision,mark]);
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectAbandonedQuarter(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view||(!view.options.length&&!view.receipt))return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:AbandonedQuarterOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return false;
    const order:GuidedAbandonedQuarterTurn={kind:'abandoned-quarter',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedAbandonedQuarterTurn(order,world,branchId,revision))return false;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An unsettled turn cannot create an actual survey, stay or arrival.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
    return true;
  };
  return <Suspense fallback={null}><Card view={view} sceneScope={sceneScope} busy={busy} onChoose={choose}/></Suspense>;
}

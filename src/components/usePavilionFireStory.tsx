import {lazy,Suspense,useMemo,useRef,useState} from 'react';
import {resolveGuidedPavilionFireTurn,type GuidedPavilionFireTurn} from '../controllers/guidedPavilionFireTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {projectPavilionFire,type PavilionFireOption} from '../engine/pavilionFire';
import type {Cultivator} from '../types/world';

const Card=lazy(async()=>({default:(await import('./PavilionFireStoryCard')).PavilionFireStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function usePavilionFireStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,epoch:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,epoch:scope.current.epoch+1};
  const epoch=scope.current.epoch;
  const inFlight=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectPavilionFire(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:PavilionFireOption)=>{
    if(busy||inFlight.current||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.epoch!==epoch||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const order:GuidedPavilionFireTurn={kind:'pavilion-fire',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedPavilionFireTurn(order,world,branchId,revision))return;
    inFlight.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An uncommitted turn has no authentic fire receipt.
    }).finally(()=>{
      inFlight.current=false;
      setPending(false);
    });
  };
  const labelOption=(option:PavilionFireOption)=>{
    if(option.targetLocationId){
      const sites=world.locations.filter(row=>row.id===option.targetLocationId);
      return sites.length===1?sites[0].name:undefined;
    }
    if(option.targetCultivatorId){
      const targets=world.cultivators.filter(row=>row.id===option.targetCultivatorId&&row.locationId===viewer.locationId);
      return targets.length===1?targets[0].name:undefined;
    }
    return undefined;
  };
  return <Suspense fallback={null}><Card view={view} busy={busy} onChoose={choose} labelOption={labelOption}/></Suspense>;
}

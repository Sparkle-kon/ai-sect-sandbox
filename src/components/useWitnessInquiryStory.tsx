import {lazy,Suspense,useMemo,useRef,useState} from 'react';
import {resolveGuidedWitnessInquiryTurn,type GuidedWitnessInquiryTurn} from '../controllers/guidedWitnessInquiryTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {projectWitnessInquiry,type WitnessInquiryOption} from '../engine/witnessInquiry';
import type {Cultivator} from '../types/world';

const Card=lazy(async()=>({default:(await import('./WitnessInquiryCard')).WitnessInquiryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useWitnessInquiryStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const {world,timeline}=sim;
  const branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,token:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,token:scope.current.token+1};
  const token=scope.current.token;
  const guard=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectWitnessInquiry(world,viewer):undefined,[world,viewer,visible]);
  if(!visible||!viewer||!view)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:WitnessInquiryOption)=>{
    if(guard.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.token!==token||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const order:GuidedWitnessInquiryTurn={kind:'witness-inquiry',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedWitnessInquiryTurn(order,world,branchId,revision))return;
    guard.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // A non-committed month cannot expose a new reading or reply.
    }).finally(()=>{
      guard.current=false;
      setPending(false);
    });
  };
  return <Suspense fallback={null}><Card view={view} busy={busy} onChoose={choose}/></Suspense>;
}

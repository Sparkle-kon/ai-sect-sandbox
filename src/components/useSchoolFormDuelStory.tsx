import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { resolveGuidedSchoolFormDuelTurn, type GuidedSchoolFormDuelTurn } from '../controllers/guidedSchoolFormDuelTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { schoolFormDuelView, schoolFormStoryReceipt } from '../engine/schoolFormDuel';
import type { SchoolFormDuelChoice } from '../types/schoolFormDuel';
import type { Cultivator, WorldState } from '../types/world';

const Card=lazy(async()=>({default:(await import('./SchoolFormDuelCard')).SchoolFormDuelCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;
type View=NonNullable<ReturnType<typeof schoolFormDuelView>>;
type Followup={world:WorldState;branchId:string;revision:number;token:number;actorId:string;view:View;
  receipt:NonNullable<ReturnType<typeof schoolFormStoryReceipt>>};

export function useSchoolFormDuelStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const [followup, setFollowup]=useState<Followup>();
  const [pending, setPending]=useState(false);
  const [stale, setStale]=useState<WorldState>();
  const guard=useRef(false);
  const {world,timeline}=sim;
  const branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const allowed=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({allowed,viewerId:viewer?.id,token:0});
  if(scope.current.allowed!==allowed||scope.current.viewerId!==viewer?.id)
    scope.current={allowed,viewerId:viewer?.id,token:scope.current.token+1};
  const token=scope.current.token;
  const view=useMemo(()=>allowed&&viewer?schoolFormDuelView(world,viewer):undefined,[allowed,viewer,world]);
  if(!allowed||!viewer)return undefined;
  const result=followup?.world===world&&followup.branchId===branchId&&followup.revision===revision&&
    followup.actorId===viewer.id&&followup.token===token?followup:undefined;
  const scene=view??result?.view;
  if(!scene)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const current=()=>scope.current.allowed&&scope.current.viewerId===viewer.id&&scope.current.token===token&&
    !sim.browsing.current&&sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision;
  const choose=(choice:SchoolFormDuelChoice)=>{
    if(!view||busy||guard.current||!current()||sim.authority.current!==world||sim.stepInFlight.current||
       sim.fastForwardRun.current||sim.campaignGuard.current||sim.history.current!==timeline)return;
    const order:GuidedSchoolFormDuelTurn={kind:'school-form-duel',world,branchId,revision,actorId:viewer.id,contactId:view.contactId,choice};
    if(!resolveGuidedSchoolFormDuelTurn(order,world,branchId,revision)){setStale(world);return;}
    guard.current=true;
    setPending(true);
    void sim.handleStepTick(order).then(()=>{
      const after=sim.authority.current;
      if(!current()||after.tick!==world.tick+1)return;
      const receipt=schoolFormStoryReceipt(after,viewer.id,view.contactId,choice);
      if(receipt)setFollowup({world:after,branchId,revision,token,actorId:viewer.id,view:{...view,options:[]},receipt});
      else setStale(after);
    }).catch(()=>setStale(sim.authority.current)).finally(()=>{
      guard.current=false;
      setPending(false);
    });
  };
  return <Suspense fallback={null}><Card view={scene} receipt={result?.receipt} busy={busy}
    notice={stale===world?'这次交锋的情形已变，没能按原选择落定。':undefined}
    onChoose={view?choose:undefined} onContinue={result?()=>setFollowup(undefined):undefined}/></Suspense>;
}

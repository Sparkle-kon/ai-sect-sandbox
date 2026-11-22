import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { resolveGuidedBattlefieldRevisitTurn, type GuidedBattlefieldRevisitTurn } from '../controllers/guidedBattlefieldRevisitTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectBattlefieldRevisit, type BattlefieldRevisitOption } from '../engine/battlefieldRevisit';
import type { Cultivator, WorldState } from '../types/world';

const Scene=lazy(async()=>({default:(await import('./BattlefieldRevisitScene')).BattlefieldRevisitScene}));
type Sim=ReturnType<typeof useWorldSimulationController>;
type Followup={world:WorldState;branchId:string;revision:number;mark:number;actorId:string;label:string;
  receipt:{title:string;description:string}};

export function useBattlefieldRevisitStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const [followup,setFollowup]=useState<Followup>();
  const [pending,setPending]=useState(false);
  const guard=useRef(false);
  const {world,timeline}=sim, branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const current=useMemo(()=>visible&&viewer?projectBattlefieldRevisit(world,viewer):undefined,[visible,viewer,world]);
  const origin=current&&world.locations.filter(row=>row.id===current.siteId);
  const result=followup?.world===world&&followup.actorId===viewer?.id&&followup.mark===mark&&
    followup.branchId===branchId&&followup.revision===revision?followup:undefined;
  const label=origin?.length===1?origin[0].name:result?.label;
  if(!visible||!viewer||!label||!result&&!current?.options.length)return undefined;

  const onChoose=current?.options.length?async(option:BattlefieldRevisitOption)=>{
    const matchesScope=()=>scope.current.visible&&scope.current.actorId===viewer.id&&scope.current.mark===mark&&
      !sim.browsing.current&&sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision;
    if(guard.current||!matchesScope()||sim.authority.current!==world||sim.stepInFlight.current||
      sim.fastForwardRun.current||sim.campaignGuard.current||sim.isRunning||sim.fastForwardLocked||sim.history.current!==timeline)return;
    const request:GuidedBattlefieldRevisitTurn={kind:'battlefield-revisit',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedBattlefieldRevisitTurn(request,world,branchId,revision))return;
    guard.current=true;
    setPending(true);
    try{
      await sim.handleStepTick(request);
      const after=sim.authority.current;
      if(!matchesScope()||after.tick!==world.tick+1)return;
      const id=`evt-battlefield-revisit-${option.targetBattlefieldSiegeId}-${viewer.id}-${option.battlefieldRevisitMove}-${after.tick}`;
      const receipts=after.events.filter(event=>event.id===id);
      const {siteId}=current;
      const receipt=receipts.length===1?receipts[0]:undefined;
      if(receipt?.tick!==after.tick||receipt.witnessScope!=='participants'||receipt.locationId!==siteId||
         receipt.actorIds[0]!==viewer.id)return;
      setFollowup({world:after,branchId,revision,actorId:viewer.id,mark,label,
        receipt:{title:receipt.title,description:receipt.description}});
    }finally{
      guard.current=false;
      setPending(false);
    }
  }:undefined;
  const seekName=(option:BattlefieldRevisitOption)=>{
    const peers=world.cultivators.filter(row=>row.id===option.targetCultivatorId);
    return peers.length===1?peers[0].name:undefined;
  };
  return <Suspense fallback={null}><Scene label={label} options={current?.options??[]} receipt={result?.receipt}
    busy={pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked} onChoose={onChoose} seekName={seekName}/></Suspense>;
}

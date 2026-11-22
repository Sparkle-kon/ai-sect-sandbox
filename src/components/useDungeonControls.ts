import {useRef} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {resolveGuidedDungeonTurn} from '../controllers/guidedDungeonTurn';
import type {Cultivator} from '../types/world';
import type {DungeonExpeditionControls} from './DungeonExpeditionRead';

export function useDungeonControls(sim:ReturnType<typeof useWorldSimulationController>,active:boolean,viewer:Cultivator|undefined):DungeonExpeditionControls|undefined{
  const pending=useRef(false);
  if(!active||!viewer||sim.preview)return undefined;
  const world=sim.world,branchId=sim.timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const blocked=sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  return {busy:blocked,guide:async option=>{
    const ready=()=>!blocked&&!sim.browsing.current&&!sim.stepInFlight.current&&!sim.fastForwardRun.current&&
      !sim.campaignGuard.current&&sim.authority.current===world&&sim.history.current===sim.timeline&&sim.saveContextVersion.current===revision;
    const request={world,branchId,revision,actorId:viewer.id,option};
    if(pending.current||!ready()||!resolveGuidedDungeonTurn(request,world,branchId,revision))return false;
    pending.current=true;
    try{
      await sim.handleStepTick(request);
      return sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision&&sim.authority.current.tick===world.tick+1;
    }finally{pending.current=false;}
  }};
}

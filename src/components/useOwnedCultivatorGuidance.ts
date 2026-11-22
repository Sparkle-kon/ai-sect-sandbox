import {useRef} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {activeAvatar} from '../engine/avatarEngine';
import type {Cultivator,WorldState} from '../types/world';

type Simulation=ReturnType<typeof useWorldSimulationController>;
type Input=NonNullable<Parameters<Simulation['handleStepTick']>[0]>;
type Frame={world:WorldState;branchId:string;revision:number;actorId:string};

/** One exact live player-controlled frame, not an alternate update path or a pending command. */
export function useOwnedCultivatorGuidance<Option,Request extends Input>(
  sim:Simulation,viewer:Cultivator|undefined,
  command:(frame:Frame,option:Option)=>Request,
  declaredLegal:(request:Request,world:WorldState,branchId:string,revision:number)=>unknown,
):{busy:boolean;guide:(option:Option)=>Promise<boolean>}|undefined{
  const pending=useRef(false);
  if(sim.preview||!viewer||activeAvatar(sim.world)!==viewer)return undefined;
  const world=sim.world,branchId=sim.timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const blocked=sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  return {busy:blocked,guide:async option=>{
    const request=command({world,branchId,revision,actorId:viewer.id},option);
    if(pending.current||blocked||sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
        sim.authority.current!==world||sim.history.current!==sim.timeline||sim.saveContextVersion.current!==revision||
        !declaredLegal(request,world,branchId,revision))return false;
    pending.current=true;
    try{
      await sim.handleStepTick(request);
      return sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision&&sim.authority.current.tick===world.tick+1;
    }finally{pending.current=false;}
  }};
}

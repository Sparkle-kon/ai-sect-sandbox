import {useRef} from 'react';
import {resolveGuidedHeavenlyAlchemyTurn,type GuidedHeavenlyAlchemyTurn} from '../controllers/guidedHeavenlyAlchemyTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {activeAvatar} from '../engine/avatarEngine';
import type {Cultivator} from '../types/world';
import type {HeavenlyAlchemyControls} from './HeavenlyAlchemyRead';

export function useHeavenlyAlchemyControls(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined):
  HeavenlyAlchemyControls|undefined{
  const pending=useRef(false);
  if(sim.preview||!viewer||activeAvatar(sim.world)!==viewer)return undefined;
  const world=sim.world,branchId=sim.timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const blocked=sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  return {busy:blocked,guide:async option=>{
    const request:GuidedHeavenlyAlchemyTurn={kind:'heavenly-alchemy',world,branchId,revision,actorId:viewer.id,option};
    if(pending.current||blocked||sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
        sim.authority.current!==world||sim.history.current!==sim.timeline||sim.saveContextVersion.current!==revision||
        !resolveGuidedHeavenlyAlchemyTurn(request,world,branchId,revision))return false;
    pending.current=true;
    try{
      await sim.handleStepTick(request);
      return sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision&&sim.authority.current.tick===world.tick+1;
    }finally{pending.current=false;}
  }};
}

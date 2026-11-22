import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {hasGuidedHeartDemonRecoveryReceipt,resolveGuidedHeartDemonRecoveryTurn,type GuidedHeartDemonRecoveryTurn} from '../controllers/guidedHeartDemonRecoveryTurn';
import type {HeartDemonRecoveryOption} from '../engine/heartDemonAftermathEngine';
import type {Cultivator} from '../types/world';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

export function useHeartDemonRecoveryControls(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined){
  return useOwnedCultivatorGuidance(sim,viewer,
    (frame,option:HeartDemonRecoveryOption):GuidedHeartDemonRecoveryTurn=>({...frame,kind:'heart-demon-recovery',option}),
    resolveGuidedHeartDemonRecoveryTurn,hasGuidedHeartDemonRecoveryReceipt);
}

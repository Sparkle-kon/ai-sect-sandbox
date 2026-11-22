import {resolveGuidedHeavenlyAlchemyTurn,type GuidedHeavenlyAlchemyTurn} from '../controllers/guidedHeavenlyAlchemyTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import type {HeavenlyAlchemyOption} from '../engine/heavenlyAlchemyEngine';
import type {Cultivator} from '../types/world';
import type {HeavenlyAlchemyControls} from './HeavenlyAlchemyRead';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

export function useHeavenlyAlchemyControls(sim:ReturnType<typeof useWorldSimulationController>,
  viewer:Cultivator|undefined):HeavenlyAlchemyControls|undefined{
  return useOwnedCultivatorGuidance(sim,viewer,(frame,option:HeavenlyAlchemyOption):GuidedHeavenlyAlchemyTurn=>({...frame,kind:'heavenly-alchemy',option}),
    resolveGuidedHeavenlyAlchemyTurn);
}

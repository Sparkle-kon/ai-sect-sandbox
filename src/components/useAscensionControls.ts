import {resolveGuidedAscensionTurn,type GuidedAscensionTurn} from '../controllers/guidedAscensionTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import type {AscensionOption} from '../engine/ascensionEngine';
import type {Cultivator} from '../types/world';
import type {AscensionControls} from './AscensionPanel';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

export function useAscensionControls(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined):
  AscensionControls|undefined{
  return useOwnedCultivatorGuidance(sim,viewer,(frame,option:AscensionOption):GuidedAscensionTurn=>
    ({...frame,kind:'ascension',option}),resolveGuidedAscensionTurn);
}

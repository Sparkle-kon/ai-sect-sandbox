import {resolveGuidedCultivationClanTurn,type GuidedCultivationClanTurn} from '../controllers/guidedCultivationClanTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {cultivationClanActionApplied,type ClanOption} from '../engine/cultivationClanEngine';
import type {Cultivator} from '../types/world';
import type {ClanControls} from './CultivationClanRead';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

export function useCultivationClanControls(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined):
  ClanControls|undefined{
  return useOwnedCultivatorGuidance(sim,viewer,(frame,option:ClanOption):GuidedCultivationClanTurn=>
    ({...frame,kind:'cultivation-clan',option}),resolveGuidedCultivationClanTurn,
    (request,result)=>cultivationClanActionApplied(result,request.actorId,request.option));
}

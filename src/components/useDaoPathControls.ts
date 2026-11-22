import {resolveGuidedDaoPathTurn,type GuidedDaoPathTurn} from '../controllers/guidedDaoPathTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import type {DaoPathOption} from '../engine/daoPathEngine';
import type {Cultivator} from '../types/world';
import type {DaoPathControls} from './DaoPathRead';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

export function useDaoPathControls(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined):DaoPathControls|undefined{
  return useOwnedCultivatorGuidance(sim,viewer,(frame,option:DaoPathOption):GuidedDaoPathTurn=>({...frame,kind:'dao-path',option}),resolveGuidedDaoPathTurn);
}

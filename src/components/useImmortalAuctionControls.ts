import {resolveGuidedImmortalAuctionTurn,type GuidedImmortalAuctionTurn} from '../controllers/guidedImmortalAuctionTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {immortalAuctionActionApplied,type ImmortalAuctionOption} from '../engine/immortalAuctionEngine';
import type {Cultivator} from '../types/world';
import type {ImmortalAuctionControls} from './ImmortalAuctionRead';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

export function useImmortalAuctionControls(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined):
  ImmortalAuctionControls|undefined{
  return useOwnedCultivatorGuidance(sim,viewer,(frame,option:ImmortalAuctionOption):GuidedImmortalAuctionTurn=>
    ({...frame,kind:'immortal-auction',option}),resolveGuidedImmortalAuctionTurn,
    (request,result)=>immortalAuctionActionApplied(result,request.actorId,request.option));
}

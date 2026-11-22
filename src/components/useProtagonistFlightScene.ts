import {useMemo} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {resolveGuidedProtagonistFlightTurn,type GuidedProtagonistFlightTurn} from '../controllers/guidedProtagonistFlightTurn';
import type {PilgrimageOption} from '../engine/pilgrimageEngine';
import {availableProtagonistFlightActions,projectProtagonistFlight} from '../engine/protagonistFlightEngine';
import type {Cultivator,WorldState} from '../types/world';
import {activeAvatar} from '../engine/avatarEngine';
import {useOwnedCultivatorGuidance} from './useOwnedCultivatorGuidance';

/** The workspace selection is not authority to read someone else's flight. */
export function resolveProtagonistFlightViewer(world:WorldState,workspace:boolean,selected?:Cultivator):Cultivator|undefined{
  const owner=activeAvatar(world);
  return !workspace||selected===owner?owner:undefined;
}

export function useProtagonistFlightScene(sim:ReturnType<typeof useWorldSimulationController>,viewer:Cultivator|undefined){
  const {visibleWorld}=sim;
  const view=useMemo(()=>{
    const scene=viewer&&projectProtagonistFlight(visibleWorld,viewer);
    if(!scene||scene.status!=='active'&&visibleWorld.tick-(scene.rounds.at(-1)?.tick??scene.openedTick)>1)return undefined;
    return scene;
  },[visibleWorld,viewer]);
  const round=view?.nextRound;
  const flightId=view?.id;
  const controls=useOwnedCultivatorGuidance(sim,view?.status==='active'&&round&&flightId?viewer:undefined,
    (frame,option:PilgrimageOption):GuidedProtagonistFlightTurn=>({...frame,kind:'protagonist-flight',flightId:flightId!,round:round!,option}),
    resolveGuidedProtagonistFlightTurn,
    (request,result)=>result.protagonistFlights?.some(scene=>scene.id===request.flightId&&scene.actorId===request.actorId&&
      scene.rounds.some(row=>row.round===request.round&&row.tick===result.tick))??false);
  const options=controls&&viewer?availableProtagonistFlightActions(viewer,visibleWorld,visibleWorld.tick+1):[];
  return {view,controls,options};
}

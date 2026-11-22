import {activeAvatar} from '../engine/avatarEngine';
import type {PilgrimageOption} from '../engine/pilgrimageEngine';
import {availableProtagonistFlightActions,projectProtagonistFlight} from '../engine/protagonistFlightEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedProtagonistFlightTurn {
  readonly kind:'protagonist-flight';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly flightId:string;
  readonly round:1|2|3;
  readonly option:PilgrimageOption;
}

export function resolveGuidedProtagonistFlightTurn(request:GuidedProtagonistFlightTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId)return undefined;
  const flight=projectProtagonistFlight(world,actor);
  if(!flight||flight.id!==request.flightId||flight.status!=='active'||flight.nextRound!==request.round)return undefined;
  const selected=request.option;
  const option=availableProtagonistFlightActions(actor,world,world.tick+1).find(row=>
    row.action===selected.action&&row.pilgrimageMove===selected.pilgrimageMove&&row.targetPilgrimageId===selected.targetPilgrimageId&&
    row.targetRoadId===selected.targetRoadId&&row.targetLocationId===selected.targetLocationId&&row.targetCultivatorId===selected.targetCultivatorId&&
    row.targetPilgrimageNextStopId===selected.targetPilgrimageNextStopId);
  if(!option)return undefined;
  const {action,...targets}=option;
  return {actorId:actor.id,decision:{...targets,chosenAction:action,innerMonologue:'只问眼下哪一步能走，不替同路人许下承诺。'}};
}

import {activeAvatar} from '../engine/avatarEngine';
import {availableAscensionActions,type AscensionOption} from '../engine/ascensionEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedAscensionTurn {
  readonly kind:'ascension';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:AscensionOption;
}

function sameAscensionOption(a:AscensionOption,b:AscensionOption){
  if(a.ascensionMove==='start'&&b.ascensionMove==='start')return true;
  return a.ascensionMove!=='start'&&b.ascensionMove!=='start'&&
    a.ascensionMove===b.ascensionMove&&a.targetAscensionTrialId===b.targetAscensionTrialId;
}

export function resolveGuidedAscensionTurn(request:GuidedAscensionTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId||actor.positionPlane!==undefined)return undefined;
  const option=availableAscensionActions(actor,world,world.tick+1).find(row=>sameAscensionOption(row,request.option));
  if(!option)return undefined;
  const base={chosenAction:'ASCENSION' as const,ascensionMove:option.ascensionMove,innerMonologue:'脚下实地，眼前只应这一重。'};
  const decision:LLMDecisionPayload=option.ascensionMove==='start'?base:{...base,targetAscensionTrialId:option.targetAscensionTrialId};
  return {actorId:actor.id,decision};
}

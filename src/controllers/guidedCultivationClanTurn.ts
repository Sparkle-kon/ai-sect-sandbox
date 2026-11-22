import {activeAvatar} from '../engine/avatarEngine';
import {availableCultivationClanActions,type ClanOption} from '../engine/cultivationClanEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedCultivationClanTurn {
  readonly kind:'cultivation-clan';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:ClanOption;
}

function sameClanOption(a:ClanOption,b:ClanOption){
  if(a.clanMove==='propose'&&b.clanMove==='propose')return a.targetCultivatorId===b.targetCultivatorId;
  return a.clanMove!=='propose'&&b.clanMove!=='propose'&&a.clanMove===b.clanMove&&a.targetCultivationUnionId===b.targetCultivationUnionId;
}

export function resolveGuidedCultivationClanTurn(request:GuidedCultivationClanTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId||actor.age<18)return undefined;
  const option=availableCultivationClanActions(actor,world,world.tick+1).find(row=>sameClanOption(row,request.option));
  if(!option)return undefined;
  const base={chosenAction:'CULTIVATION_CLAN' as const,clanMove:option.clanMove,innerMonologue:'只作本人亲选，不代对方许诺。'};
  const decision:LLMDecisionPayload=option.clanMove==='propose'?{...base,targetCultivatorId:option.targetCultivatorId}:
    {...base,targetCultivationUnionId:option.targetCultivationUnionId};
  return {actorId:actor.id,decision};
}

import {activeAvatar} from '../engine/avatarEngine';
import {availableDaoPathActions,type DaoPathOption} from '../engine/daoPathEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedDaoPathTurn {
  readonly kind:'dao-path';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:DaoPathOption;
}

export function resolveGuidedDaoPathTurn(request:GuidedDaoPathTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId)return undefined;
  const chosen=request.option;
  const option=availableDaoPathActions(actor,world,world.tick+1).find(row=>
    row.daoPathMove===chosen.daoPathMove&&row.targetDaoPathId===chosen.targetDaoPathId);
  if(!option)return undefined;
  return {actorId:actor.id,decision:{chosenAction:'DAO_PATH',daoPathMove:option.daoPathMove,
    targetDaoPathId:option.targetDaoPathId,innerMonologue:'亲循本身所修的这条道。'}};
}

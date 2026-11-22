import {activeAvatar} from '../engine/avatarEngine';
import {availableHeavenlyAlchemyActions,type HeavenlyAlchemyOption} from '../engine/heavenlyAlchemyEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedHeavenlyAlchemyTurn {
  readonly kind:'heavenly-alchemy';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:HeavenlyAlchemyOption;
}

export function resolveGuidedHeavenlyAlchemyTurn(request:GuidedHeavenlyAlchemyTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId)return undefined;
  const chosen=request.option;
  const legal=availableHeavenlyAlchemyActions(actor,world,world.tick+1).find(option=>
    option.targetHeavenlyRecipeId===chosen.targetHeavenlyRecipeId&&(
      option.heavenlyAlchemyMove==='brew'&&chosen.heavenlyAlchemyMove==='brew'&&option.heavenlyAlchemyHeat===chosen.heavenlyAlchemyHeat||
      option.heavenlyAlchemyMove==='take'&&chosen.heavenlyAlchemyMove==='take'&&option.heavenlyAlchemyQuality===chosen.heavenlyAlchemyQuality));
  if(!legal)return undefined;
  const base={chosenAction:'HEAVENLY_ALCHEMY' as const,innerMonologue:'当面守炉，将这一次亲选的火候落在实处。'};
  return {actorId:actor.id,decision:{...base,heavenlyAlchemyMove:legal.heavenlyAlchemyMove,
    targetHeavenlyRecipeId:legal.targetHeavenlyRecipeId,...(legal.heavenlyAlchemyMove==='brew'?
      {heavenlyAlchemyHeat:legal.heavenlyAlchemyHeat}:{heavenlyAlchemyQuality:legal.heavenlyAlchemyQuality})}};
}

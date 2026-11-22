import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {availableUpperArrayFieldMovementActions,resolveUpperArrayFieldMovementAction} from './upperArrayFieldMovementEngine';
import type {UpperArrayFieldMovementOption} from './upperArrayFieldTerms';
import {availableUpperArrayFieldLocalActions,resolveUpperArrayFieldLocalAction} from './upperArrayFieldLocalEngine';
import type {UpperArrayFieldLocalOption} from './upperArrayFieldLocalTerms';
import {availableUpperArrayFieldTradeActions,resolveUpperArrayFieldTradeAction,type UpperArrayFieldTradeOption} from './upperArrayFieldTradeEngine';

export type UpperArrayFieldOption=UpperArrayFieldMovementOption|UpperArrayFieldLocalOption|UpperArrayFieldTradeOption;
export const isUpperArrayFieldAction=(action:unknown):action is UpperArrayFieldOption['action']=>
  action==='UPPER_ARRAY_FIELD'||action==='UPPER_ARRAY_FIELD_LOCAL'||action==='UPPER_ARRAY_FIELD_TRADE';
export function availableUpperArrayFieldActions(actor:Cultivator,world:WorldState,tick=world.tick):UpperArrayFieldOption[]{
  return [...availableUpperArrayFieldMovementActions(actor,world,tick),...availableUpperArrayFieldLocalActions(actor,world,tick),
    ...availableUpperArrayFieldTradeActions(actor,world,tick)];
}
type Command=Omit<LLMDecisionPayload,'innerMonologue'|'spokenLine'>;
export function upperArrayFieldCommand(choice:UpperArrayFieldOption):Command{
  if(choice.action==='UPPER_ARRAY_FIELD')return {chosenAction:choice.action,upperArrayFieldMove:choice.upperArrayFieldMove,
    targetUpperArrayFieldSiteId:choice.targetUpperArrayFieldSiteId};
  if(choice.action==='UPPER_ARRAY_FIELD_LOCAL')return {chosenAction:choice.action,upperArrayFieldLocalMove:choice.upperArrayFieldLocalMove,
    targetUpperArrayFieldSiteId:choice.targetUpperArrayFieldSiteId};
  return choice.upperArrayFieldTradeMove==='propose'?
    {chosenAction:choice.action,upperArrayFieldTradeMove:choice.upperArrayFieldTradeMove,targetCultivatorId:choice.targetCultivatorId}:
    {chosenAction:choice.action,upperArrayFieldTradeMove:choice.upperArrayFieldTradeMove,targetUpperArrayFieldTradeId:choice.targetUpperArrayFieldTradeId};
}
export function upperArrayFieldOptionKey(choice:UpperArrayFieldOption):string{return JSON.stringify(upperArrayFieldCommand(choice));}
export function exactUpperArrayFieldDecision(payload:Partial<LLMDecisionPayload>,options:readonly UpperArrayFieldOption[]):LLMDecisionPayload|undefined{
  if(!isUpperArrayFieldAction(payload.chosenAction))return undefined;
  const match=options.find(option=>{
    const cmd=upperArrayFieldCommand(option);
    return Object.entries(cmd).every(([key,value])=>payload[key as keyof LLMDecisionPayload]===value)&&
      Object.keys(payload).every(key=>Object.hasOwn(cmd,key)||key==='innerMonologue'||key==='spokenLine');
  });
  if(!match)return undefined;
  const line=typeof payload.innerMonologue==='string'?payload.innerMonologue.trim().slice(0,160):'';
  return {...upperArrayFieldCommand(match),innerMonologue:line||'只凭脚下实址、本人和原来的阵材行事。'};
}
export function resolveUpperArrayFieldAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  switch(payload.chosenAction){
    case 'UPPER_ARRAY_FIELD':return resolveUpperArrayFieldMovementAction(world,actor,payload);
    case 'UPPER_ARRAY_FIELD_LOCAL':return resolveUpperArrayFieldLocalAction(world,actor,payload);
    case 'UPPER_ARRAY_FIELD_TRADE':return resolveUpperArrayFieldTradeAction(world,actor,payload);
    default:return null;
  }
}

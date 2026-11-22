import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {availableFrontierMovementActions,resolveFrontierMovementAction,type FrontierMovementOption} from './frontierMovementEngine';
import {availableFrontierProductionActions,resolveFrontierProductionAction} from './frontierProductionEngine';
import type {FrontierProductionOption} from './frontierProductionTerms';
import {availableFrontierTradeActions,resolveFrontierTradeAction,type FrontierTradeOption} from './frontierTradeEngine';

export type FrontierOption=FrontierMovementOption|FrontierProductionOption|FrontierTradeOption;
export const isFrontierAction=(action:unknown):action is FrontierOption['action']=>
  action==='FRONTIER'||action==='FRONTIER_PRODUCTION'||action==='FRONTIER_TRADE';
export function availableFrontierActions(actor:Cultivator,world:WorldState,tick=world.tick):FrontierOption[] {
  return [...availableFrontierMovementActions(actor,world,tick),...availableFrontierProductionActions(actor,world,tick),
    ...availableFrontierTradeActions(actor,world,tick)];
}
type Command=Omit<LLMDecisionPayload,'innerMonologue'|'spokenLine'>;
export function frontierCommand(option:FrontierOption):Command {
  if(option.action==='FRONTIER'){
    const {frontierMove,targetFrontierSiteId}=option;
    return {chosenAction:option.action,frontierMove,targetFrontierSiteId};
  }
  if(option.action==='FRONTIER_PRODUCTION'){
    const {frontierProductionMove,targetFrontierSiteId}=option;
    return {chosenAction:option.action,frontierProductionMove,targetFrontierSiteId};
  }
  return option.frontierTradeMove==='propose'?
    {chosenAction:option.action,frontierTradeMove:option.frontierTradeMove,targetCultivatorId:option.targetCultivatorId}:
    {chosenAction:option.action,frontierTradeMove:option.frontierTradeMove,targetFrontierTradeId:option.targetFrontierTradeId};
}
export function frontierOptionKey(option:FrontierOption):string{return JSON.stringify(frontierCommand(option));}
export function exactFrontierDecision(payload:Partial<LLMDecisionPayload>,options:readonly FrontierOption[]):LLMDecisionPayload|undefined {
  if(!isFrontierAction(payload.chosenAction))return undefined;
  const candidate=options.find(option=>{
    const command=frontierCommand(option);
    return Object.entries(command).every(([key,value])=>payload[key as keyof LLMDecisionPayload]===value)&&
      Object.keys(payload).every(key=>Object.hasOwn(command,key)||key==='innerMonologue'||key==='spokenLine');
  });
  if(!candidate)return undefined;
  const inner=typeof payload.innerMonologue==='string'?payload.innerMonologue.trim().slice(0,160):'';
  return {...frontierCommand(candidate),innerMonologue:inner||'只按眼前实有的路、物和当事身份行事。'};
}

export function resolveFrontierAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction==='FRONTIER')return resolveFrontierMovementAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_PRODUCTION')return resolveFrontierProductionAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_TRADE')return resolveFrontierTradeAction(world,actor,payload);
  return null;
}

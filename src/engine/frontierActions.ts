import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {availableFrontierMovementActions,resolveFrontierMovementAction,type FrontierMovementOption,frontierPhysicalSite} from './frontierMovementEngine';
import {availableFrontierProductionActions,resolveFrontierProductionAction} from './frontierProductionEngine';
import type {FrontierProductionOption} from './frontierProductionTerms';
import {availableFrontierTradeActions,resolveFrontierTradeAction,type FrontierTradeOption} from './frontierTradeEngine';

import {availableFrontierPortLocalActions,resolveFrontierPortLocalAction} from './frontierPortLocalEngine';
import type {FrontierPortLocalOption} from './frontierPortTerms';
import {availableFrontierPortTradeActions,resolveFrontierPortTradeAction,type FrontierPortTradeOption} from './frontierPortTradeEngine';
import {availableFrontierDrylandLocalActions,resolveFrontierDrylandLocalAction} from './frontierDrylandLocalEngine';
import {availableFrontierDrylandTradeActions,resolveFrontierDrylandTradeAction,type FrontierDrylandTradeOption} from './frontierDrylandTradeEngine';
import type {FrontierDrylandLocalOption} from './frontierDrylandTerms';
import {resolveOrdinaryBreakthrough} from './ordinaryBreakthroughEngine';

export type FrontierLandOption=FrontierMovementOption|FrontierProductionOption|FrontierTradeOption;
export type FrontierSeaOption=FrontierPortLocalOption|FrontierPortTradeOption;
export type FrontierDrylandOption=FrontierDrylandLocalOption|FrontierDrylandTradeOption;
export type FrontierOption=FrontierLandOption|FrontierSeaOption|FrontierDrylandOption;
export const isFrontierDrylandOption=(option:FrontierOption):option is FrontierDrylandOption=>
  option.action==='FRONTIER_DRYLAND'||option.action==='FRONTIER_DRYLAND_TRADE';
export const isFrontierSeaOption=(option:FrontierOption):option is FrontierSeaOption=>
  option.action==='FRONTIER_PORT'||option.action==='FRONTIER_PORT_TRADE';
export const isFrontierLandOption=(option:FrontierOption):option is FrontierLandOption=>!isFrontierSeaOption(option)&&!isFrontierDrylandOption(option);
export const isFrontierAction=(action:unknown):action is FrontierOption['action']=>
  action==='FRONTIER'||action==='FRONTIER_PRODUCTION'||action==='FRONTIER_TRADE'||action==='FRONTIER_PORT'||action==='FRONTIER_PORT_TRADE'||
  action==='FRONTIER_DRYLAND'||action==='FRONTIER_DRYLAND_TRADE';
export function availableFrontierActions(actor:Cultivator,world:WorldState,tick=world.tick):FrontierOption[] {
  return [...availableFrontierMovementActions(actor,world,tick),...availableFrontierProductionActions(actor,world,tick),
    ...availableFrontierTradeActions(actor,world,tick),...availableFrontierPortLocalActions(actor,world,tick),
    ...availableFrontierPortTradeActions(actor,world,tick),...availableFrontierDrylandLocalActions(actor,world,tick),
    ...availableFrontierDrylandTradeActions(actor,world,tick)];
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
  if(option.action==='FRONTIER_PORT'){
    const {frontierPortMove,targetFrontierSiteId}=option;
    return {chosenAction:option.action,frontierPortMove,targetFrontierSiteId};
  }
  if(option.action==='FRONTIER_PORT_TRADE')return option.frontierPortTradeMove==='propose'?
    {chosenAction:option.action,frontierPortTradeMove:option.frontierPortTradeMove,targetCultivatorId:option.targetCultivatorId}:
    {chosenAction:option.action,frontierPortTradeMove:option.frontierPortTradeMove,targetFrontierPortTradeId:option.targetFrontierPortTradeId};
  if(option.action==='FRONTIER_DRYLAND'){
    const {frontierDrylandMove,targetFrontierSiteId}=option;
    return {chosenAction:option.action,frontierDrylandMove,targetFrontierSiteId,
      ...(frontierDrylandMove==='feed_herd'?{frontierDrylandFeed:option.frontierDrylandFeed}:{})};
  }
  if(option.action==='FRONTIER_DRYLAND_TRADE')return option.frontierDrylandTradeMove==='propose'?
    {chosenAction:option.action,frontierDrylandTradeMove:option.frontierDrylandTradeMove,targetCultivatorId:option.targetCultivatorId}:
    {chosenAction:option.action,frontierDrylandTradeMove:option.frontierDrylandTradeMove,targetFrontierDrylandTradeId:option.targetFrontierDrylandTradeId};
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

export function resolveDrylandNativeLayer(world:WorldState,actor:Cultivator,rng:()=>number):WorldEvent|null {
  const site=frontierPhysicalSite(world,actor);
  if(site?.id!=='frontier-west-trial'||actor.realmStage>=9||actor.qiProgress<90)return null;
  const before=actor.realmStage;
  const event=resolveOrdinaryBreakthrough(world,actor,site.name,rng);
  if(!event)return null;
  return actor.realmStage>before?{...event,witnessScope:'participants'}:{
    ...event,category:'breakthrough',witnessScope:'participants',
    title:`${actor.name}冲层时心魔反噬`,
    description:`【${site.name}】的水汽还未散尽，${actor.name}收息不住。气海反卷，人仍留在原处。`,
  };
}

export function resolveFrontierAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload,rng:()=>number):WorldEvent|null {
  if(payload.chosenAction==='FRONTIER')return resolveFrontierMovementAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_PRODUCTION')return resolveFrontierProductionAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_TRADE')return resolveFrontierTradeAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_PORT')return resolveFrontierPortLocalAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_PORT_TRADE')return resolveFrontierPortTradeAction(world,actor,payload);
  if(payload.chosenAction==='FRONTIER_DRYLAND')return resolveFrontierDrylandLocalAction(world,actor,payload,
    {attemptNativeLayer:(w,a)=>resolveDrylandNativeLayer(w,a,rng)});
  if(payload.chosenAction==='FRONTIER_DRYLAND_TRADE')return resolveFrontierDrylandTradeAction(world,actor,payload);
  return null;
}

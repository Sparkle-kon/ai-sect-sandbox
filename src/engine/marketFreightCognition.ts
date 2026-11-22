import type {Cultivator,LLMDecisionPayload,WorldState} from '../types/world';
import type {MarketFreightOption} from '../types/marketFreight';
import {availableMarketFreightActions} from './escortEngine';

const controlled=(actor:Cultivator,world:WorldState,tick:number)=>
  world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>tick;
const voice={
  offer:'只给这一次实际封货过秤，请眼前这位本人决定。不把余货算进运量。',
  accept:'我看过原货，实有承载和行粮才接。动身前没有运费交割。',
  decline:'这单我本人不接，不把所留费用记作已经付运。',
  withdraw:'只撤还没动身的这一单，退回这笔未用运费，货价不另算。',
} as const;
export function marketFreightTargets(row:MarketFreightOption){
  return row.marketFreightMove==='offer'
    ? {marketFreightMove:row.marketFreightMove,targetShipmentId:row.targetShipmentId,targetCultivatorId:row.targetCultivatorId}
    : {marketFreightMove:row.marketFreightMove,targetEscortId:row.targetEscortId};
}
export function marketFreightProviderOptions(actor:Cultivator,world:WorldState,tick:number):MarketFreightOption[]{
  return controlled(actor,world,tick)?[]:availableMarketFreightActions(actor,world,tick);
}
export function decodeMarketFreightDecision(parsed:Partial<LLMDecisionPayload>,actor:Cultivator,
  options:readonly MarketFreightOption[]):LLMDecisionPayload|undefined{
  if(parsed.chosenAction!=='MARKET_FREIGHT')return undefined;
  const choice=options.find(row=>row.marketFreightMove===parsed.marketFreightMove&&
    row.targetShipmentId===parsed.targetShipmentId&&row.targetCultivatorId===parsed.targetCultivatorId&&
    row.targetEscortId===parsed.targetEscortId);
  if(!choice)return undefined;
  const fields=choice.marketFreightMove==='offer'?['targetShipmentId','targetCultivatorId']:['targetEscortId'];
  if(Object.keys(parsed).some(key=>!['chosenAction','innerMonologue','marketFreightMove',...fields].includes(key)))return undefined;
  const words=(typeof parsed.innerMonologue==='string'?parsed.innerMonologue.trim().slice(0,160):'')||
    actor.innerMonologue||voice[choice.marketFreightMove];
  return {chosenAction:choice.action,...marketFreightTargets(choice),innerMonologue:words};
}
export function utilityMarketFreightDecision(actor:Cultivator,world:WorldState):LLMDecisionPayload|undefined{
  if(actor.guardAssignment||controlled(actor,world,world.tick)||!world.escorts.contracts.some(contract=>
    contract.status==='offered'&&contract.freight&&contract.freight.carrierId===actor.id))return undefined;
  const options=availableMarketFreightActions(actor,world);
  const accept=options.filter(row=>row.marketFreightMove==='accept');
  const decline=options.filter(row=>row.marketFreightMove==='decline');
  const chosen=actor.personality!=='嗜血'&&accept.length===1?accept[0]:decline.length===1?decline[0]:undefined;
  return chosen?{chosenAction:chosen.action,...marketFreightTargets(chosen),innerMonologue:voice[chosen.marketFreightMove]}:undefined;
}

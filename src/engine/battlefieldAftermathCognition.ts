import type { LLMDecisionPayload } from '../types/world';
import type { BattlefieldAftermathOption } from './battlefieldAftermath';

export function battlefieldAftermathCommand(option:BattlefieldAftermathOption){
  return {chosenAction:'BATTLEFIELD_AFTERMATH',battlefieldAftermathMove:option.battlefieldAftermathMove,targetBattlefieldAftermathId:option.targetBattlefieldAftermathId,
    ...(option.battlefieldAftermathMove==='return'?{targetLocationId:option.targetLocationId}:{}),
    ...(option.battlefieldAftermathMove==='offer_care'||option.battlefieldAftermathMove==='accept_care'?
      {targetCultivatorId:option.targetCultivatorId}:{})} as const;
}
export function exactBattlefieldAftermathDecision(raw:unknown,options:readonly BattlefieldAftermathOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=battlefieldAftermathCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...battlefieldAftermathCommand(choice),innerMonologue:'这一夜只做亲身能到、能应下的事。'}:undefined;
}

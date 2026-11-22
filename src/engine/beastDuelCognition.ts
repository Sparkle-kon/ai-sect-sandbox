import type { LLMDecisionPayload } from '../types/world';
import type { BeastDuelChoiceOption } from '../types/beastDuelProtection';

export function beastDuelCommand(contactId:string,option:BeastDuelChoiceOption) {
  return {chosenAction:'BEAST_DUEL_RESPONSE' as const,targetBeastDuelId:contactId,beastDuelChoice:option.choice,
    ...(option.destinationId?{targetLocationId:option.destinationId}:{})};
}
export function exactBeastDuelResponse(raw:unknown,contactId:string,options:readonly BeastDuelChoiceOption[],
  allowThought=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const data=raw as Record<string,unknown>;
  const matching=options.map(option=>beastDuelCommand(contactId,option)).filter(command=>
    Object.entries(command).every(([key,value])=>data[key]===value)&&Object.keys(data).every(key=>
      Object.hasOwn(command,key)||allowThought&&key==='innerMonologue'&&typeof data[key]==='string'));
  if(matching.length!==1)return;
  return {...matching[0],innerMonologue:'只按眼前这一份实有契印来选择。'};
}

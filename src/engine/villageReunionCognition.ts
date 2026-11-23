import type { LLMDecisionPayload } from '../types/world';
import type { VillageReunionOption } from './villageReunion';

export function villageReunionCommand(option:VillageReunionOption){
  return {chosenAction:'VILLAGE_REUNION',villageReunionMove:option.villageReunionMove,targetVillageReunionId:option.targetVillageReunionId} as const;
}
export function exactVillageReunionDecision(raw:unknown,options:readonly VillageReunionOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=villageReunionCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...villageReunionCommand(choice),innerMonologue:'只应眼前这一桩，不替旧人许诺。'}:undefined;
}

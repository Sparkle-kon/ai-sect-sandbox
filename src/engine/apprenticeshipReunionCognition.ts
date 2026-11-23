import type { LLMDecisionPayload } from '../types/world';
import type { ApprenticeshipReunionOption } from './apprenticeshipReunion';

export function apprenticeshipReunionCommand(option:ApprenticeshipReunionOption){
  return {chosenAction:'APPRENTICESHIP_REUNION',apprenticeshipReunionMove:option.apprenticeshipReunionMove,...(option.apprenticeshipReunionMove==='ask'?{targetCultivatorId:option.targetCultivatorId}:
      {targetApprenticeshipReunionId:option.targetApprenticeshipReunionId})} as const;
}
export function exactApprenticeshipReunionDecision(raw:unknown,options:readonly ApprenticeshipReunionOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=apprenticeshipReunionCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...apprenticeshipReunionCommand(choice),innerMonologue:'只对眼前亲自能说的话负责。'}:undefined;
}

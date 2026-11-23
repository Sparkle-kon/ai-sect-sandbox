import type { LLMDecisionPayload } from '../types/world';
import type { PilgrimageForkOption } from './pilgrimageFork';

export function pilgrimageForkCommand(option:PilgrimageForkOption){
  return {chosenAction:'PILGRIMAGE_FORK',pilgrimageForkMove:option.pilgrimageForkMove,targetPilgrimageForkId:option.targetPilgrimageForkId,
    ...(option.pilgrimageForkMove!=='remain'?{targetLocationId:option.targetLocationId}:{})} as const;
}
export function exactPilgrimageForkDecision(raw:unknown,options:readonly PilgrimageForkOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=pilgrimageForkCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...pilgrimageForkCommand(choice),innerMonologue:'只择本人站脚或能走的路，不替同行人许诺。'}:undefined;
}

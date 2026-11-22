import type { LLMDecisionPayload } from '../types/world';
import type { FrontierGorgeOption } from './frontierGorge';

export function frontierGorgeCommand(option:FrontierGorgeOption){
  return {chosenAction:'FRONTIER_GORGE',frontierGorgeMove:option.frontierGorgeMove,targetFrontierSiteId:option.targetFrontierSiteId} as const;
}
export function exactFrontierGorgeDecision(raw:unknown,choices:readonly FrontierGorgeOption[],internal=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const input=raw as Record<string,unknown>;
  const found=choices.find(option=>{
    const command=frontierGorgeCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(input,key)&&input[key]===value)&&
      Object.keys(input).every(key=>Object.hasOwn(command,key)||
        internal&&key==='innerMonologue'&&typeof input[key]==='string');
  });
  return found?{...frontierGorgeCommand(found),innerMonologue:'眼下只走已有的路；风势未定，不把明日当作如今。'}:undefined;
}

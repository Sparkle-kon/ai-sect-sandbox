import type { FrontierNightHuntOption } from '../types/frontierNightHunt';
import type { LLMDecisionPayload } from '../types/world';

export function frontierNightHuntCommand(option:FrontierNightHuntOption) {
  return {chosenAction:'FRONTIER_NIGHT_HUNT',frontierNightHuntMove:option.frontierNightHuntMove,
    targetFrontierSiteId:option.targetFrontierSiteId} as const;
}
export function exactFrontierNightHuntDecision(raw:unknown,options:readonly FrontierNightHuntOption[],
  internal=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const data=raw as Record<string,unknown>;
  const keys=['chosenAction','frontierNightHuntMove','targetFrontierSiteId'] as const;
  if(keys.some(key=>!Object.hasOwn(data,key))||Object.keys(data).some(key=>
    !keys.some(field=>field===key)&&!(internal&&key==='innerMonologue'&&typeof data[key]==='string')))return undefined;
  const exact=options.find(option=>{
    const command=frontierNightHuntCommand(option);
    return keys.every(key=>command[key]===data[key]);
  });
  return exact?{...frontierNightHuntCommand(exact),innerMonologue:'雪痕归雪痕，先只认脚下这一步。'}:undefined;
}

import type { LLMDecisionPayload } from '../types/world';
import type { PavilionFireOption } from '../types/pavilionFire';

export function pavilionFireCommand(option:PavilionFireOption){
  const {action,pavilionFireMove,targetPavilionFireId,targetLocationId,targetCultivatorId}=option;
  return {chosenAction:action,pavilionFireMove,targetPavilionFireId,
    ...(targetLocationId?{targetLocationId}:{}),...(targetCultivatorId?{targetCultivatorId}:{})} as const;
}
export function exactPavilionFireDecision(raw:unknown,choices:readonly PavilionFireOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const body=raw as Record<string,unknown>;
  const selected=choices.find(option=>{
    const command=pavilionFireCommand(option);
    return Object.keys(body).every(key=>Object.hasOwn(command,key)||
      internal&&key==='innerMonologue'&&typeof body[key]==='string')&&
      Object.entries(command).every(([key,value])=>Object.hasOwn(body,key)&&body[key]===value);
  });
  return selected?{...pavilionFireCommand(selected),innerMonologue:'眼前的火不会等人，先只做亲手够得着的事。'}:undefined;
}

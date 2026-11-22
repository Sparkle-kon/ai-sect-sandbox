import type { LLMDecisionPayload } from '../types/world';
import type { FarewellLandingOption } from './farewellLanding';
export function farewellLandingCommand(option:FarewellLandingOption){
  return {chosenAction:'FAREWELL_LANDING',farewellLandingMove:option.farewellLandingMove,
    targetFarewellDeceasedId:option.targetFarewellDeceasedId} as const;
}
export function exactFarewellLandingDecision(raw:unknown,options:readonly FarewellLandingOption[],
  internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=farewellLandingCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...farewellLandingCommand(choice),innerMonologue:'只记自己亲识的那个人，不问黄泉，也不替旁人作别。'}:undefined;
}

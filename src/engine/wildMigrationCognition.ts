import type { LLMDecisionPayload } from '../types/world';
import type { WildMigrationOption } from './wildMigration';

export function wildMigrationCommand(option:WildMigrationOption){
  return {chosenAction:'WILD_MIGRATION',wildMigrationMove:option.wildMigrationMove,targetWildMigrationId:option.targetWildMigrationId,
    ...(option.wildMigrationMove==='drive'?{targetLocationId:option.targetLocationId}:{})} as const;
}
export function exactWildMigrationDecision(raw:unknown,options:readonly WildMigrationOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=wildMigrationCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...wildMigrationCommand(choice),innerMonologue:'只按自己眼前的行踪作答，不替另一地作主。'}:undefined;
}

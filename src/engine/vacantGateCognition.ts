import type { LLMDecisionPayload } from '../types/world';
import type { VacantGateOption } from './vacantGate';

export function vacantGateCommand(option:VacantGateOption){
  return {chosenAction:'VACANT_GATE',vacantGateMove:option.vacantGateMove,targetVacantGateSiegeId:option.targetVacantGateSiegeId,
    ...(option.vacantGateMove==='withdraw'?{targetLocationId:option.targetLocationId}:{})} as const;
}
export function exactVacantGateDecision(raw:unknown,options:readonly VacantGateOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=vacantGateCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...vacantGateCommand(choice),innerMonologue:'只按当下山门实况行事，不替同门作决定。'}:undefined;
}

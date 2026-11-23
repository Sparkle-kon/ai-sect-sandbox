import type {AbandonedQuarterOption} from '../types/abandonedQuarter';
import type {LLMDecisionPayload} from '../types/world';

const voice:Record<AbandonedQuarterOption['abandonedQuarterMove'],string>={
  inspect:'只看看留下的旧痕，不将簿上的旧人当作仍在这里。',
  stay:'今月暂歇在这里，不占旧户的名字。',
  leave:'循自己确知的去处离开，不带走这座旧村的旧账。',
};
export const abandonedQuarterCommand=(option:AbandonedQuarterOption)=>({
  chosenAction:'ABANDONED_QUARTER',abandonedQuarterMove:option.abandonedQuarterMove,
  targetAbandonedQuarterId:option.targetAbandonedQuarterId,
  ...(option.targetLocationId===undefined?{}:{targetLocationId:option.targetLocationId}),
} as const);
export function exactAbandonedQuarterDecision(raw:unknown,menu:readonly AbandonedQuarterOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const fields=raw as Record<string,unknown>;
  const option=menu.find(row=>{
    const command=abandonedQuarterCommand(row);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return option?{...abandonedQuarterCommand(option),innerMonologue:voice[option.abandonedQuarterMove]}:undefined;
}

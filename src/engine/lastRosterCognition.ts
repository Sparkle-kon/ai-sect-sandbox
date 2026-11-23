import type {LastRosterOption} from '../types/lastRoster';
import type {LLMDecisionPayload} from '../types/world';

const voice:Record<LastRosterOption['lastRosterMove'],string>={
  new_gate:'旧门已合。我要亲自去接纳我们的山门，不替谁承嗣。',
  home:'沿自己认得的路回原乡。这里没有新职，也没有新户籍。',
  stay:'我今日留在旧址。原来的宗门已经不会回来。',
};
export const lastRosterCommand=(option:LastRosterOption)=>({
  chosenAction:'LAST_ROSTER',lastRosterMove:option.lastRosterMove,targetLastRosterId:option.targetLastRosterId,
  ...(option.lastRosterMove==='stay'?{}:{targetLocationId:option.targetLocationId}),
} as const);
export function exactLastRosterDecision(raw:unknown,menu:readonly LastRosterOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const fields=raw as Record<string,unknown>;
  const match=menu.find(option=>{
    const command=lastRosterCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return match?{...lastRosterCommand(match),innerMonologue:voice[match.lastRosterMove]}:undefined;
}

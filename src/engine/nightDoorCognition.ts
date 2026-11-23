import type {NightDoorOption} from '../types/nightDoor';
import type {LLMDecisionPayload} from '../types/world';
const voice:Record<NightDoorOption['nightDoorMove'],string>={
  identify:'只报自己的来处，不替那位旧识答话。',
  shelter:'门里确有空位；我肯让他暂歇，住不住由他。',
  close:'我今晚不留客，不替来者择下一站。',
  escort:'我只提议同行一步，不说我们已经走到。',
  accept:'此事由我亲口应下，应下不是已住或已到。',
  cross:'只走自己已认得的那一步，不把另一人的脚步算给我。',
};
export const nightDoorCommand=(option:NightDoorOption)=>({
  chosenAction:'NIGHT_DOOR',nightDoorMove:option.nightDoorMove,targetNightDoorId:option.targetNightDoorId,
  ...(option.targetLocationId===undefined?{}:{targetLocationId:option.targetLocationId}),
} as const);
export function exactNightDoorDecision(raw:unknown,menu:readonly NightDoorOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const fields=raw as Record<string,unknown>;
  const option=menu.find(candidate=>{
    const command=nightDoorCommand(candidate);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return option?{...nightDoorCommand(option),innerMonologue:voice[option.nightDoorMove]}:undefined;
}

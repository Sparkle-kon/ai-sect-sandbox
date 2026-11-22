import type { BattlefieldRevisitOption } from './battlefieldRevisit';
import type { LLMDecisionPayload } from '../types/world';

export function battlefieldRevisitCommand(option:BattlefieldRevisitOption) {
  return {chosenAction:option.action,battlefieldRevisitMove:option.battlefieldRevisitMove,
    targetBattlefieldSiegeId:option.targetBattlefieldSiegeId,
    ...(option.targetCultivatorId ? {targetCultivatorId:option.targetCultivatorId}:{})};
}

export function exactBattlefieldRevisitDecision(raw:unknown,allowed:readonly BattlefieldRevisitOption[],
  allowThought=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const data=raw as Record<string,unknown>;
  const found=allowed.filter(option=>{
    const command=battlefieldRevisitCommand(option);
    const fields=Object.entries(command);
    return fields.every(([key,value])=>data[key]===value)&&Object.keys(data).every(key=>
      Object.hasOwn(command,key)||(allowThought&&key==='innerMonologue'&&typeof data[key]==='string'));
  });
  if(found.length!==1)return;
  return {...battlefieldRevisitCommand(found[0]),innerMonologue:found[0].battlefieldRevisitMove==='repair'?
    '旧阵确曾熄灭。我只补眼前的破口。':'到此亲看故人在不在，不把传闻当消息。'};
}

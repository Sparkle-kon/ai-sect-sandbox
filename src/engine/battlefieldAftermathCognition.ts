import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import { activeAvatar } from './avatarEngine';
import { availableBattlefieldAftermathActions } from './battlefieldAftermath';
import type { BattlefieldAftermathOption } from './battlefieldAftermath';

export function battlefieldAftermathCommand(option:BattlefieldAftermathOption){
  return {chosenAction:'BATTLEFIELD_AFTERMATH',battlefieldAftermathMove:option.battlefieldAftermathMove,targetBattlefieldAftermathId:option.targetBattlefieldAftermathId,
    ...(option.battlefieldAftermathMove==='return'?{targetLocationId:option.targetLocationId}:{}),
    ...(option.battlefieldAftermathMove==='offer_care'||option.battlefieldAftermathMove==='accept_care'?
      {targetCultivatorId:option.targetCultivatorId}:{})} as const;
}
export function exactBattlefieldAftermathDecision(raw:unknown,options:readonly BattlefieldAftermathOption[],internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const field=raw as Record<string,unknown>;
  const choice=options.find(option=>{
    const command=battlefieldAftermathCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(field,key)&&field[key]===value)&&
      Object.keys(field).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof field[key]==='string');
  });
  return choice?{...battlefieldAftermathCommand(choice),innerMonologue:'这一夜只做亲身能到、能应下的事。'}:undefined;
}

// First responses consume the witness's own monthly action, never a partner's consent.
export function utilityBattlefieldAftermathDecision(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  if(activeAvatar(world)===actor||!world.battlefieldAftermath?.cases.length)return;
  const choices=availableBattlefieldAftermathActions(actor,world,world.tick);
  const offered=choices.find(({battlefieldAftermathMove})=>battlefieldAftermathMove==='accept_care');
  if(offered)return exactBattlefieldAftermathDecision(battlefieldAftermathCommand(offered),choices);

  const director=world.storyteller;
  if(!director||director.focusActorId===actor.id||director.style==='still_water')return;
  const current=world.battlefieldAftermath.cases.find(row=>row.id===choices[0]?.targetBattlefieldAftermathId);
  if(!current||world.tick-current.terminalTick>2||actor.hp<actor.maxHp*.4)return;
  const helping=actor.personality==='刚正'||actor.personality==='逍遥';
  const move=helping
    ?choices.find(({battlefieldAftermathMove})=>battlefieldAftermathMove==='offer_care')??choices[0]
    :actor.personality==='苟道'
      ?choices.find(({battlefieldAftermathMove})=>battlefieldAftermathMove==='return')
      :undefined;
  return move&&exactBattlefieldAftermathDecision(battlefieldAftermathCommand(move),choices);
}

import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

export const firstId='npc-3',secondId='npc-4',nearId='npc-7',observerId='npc-8',bondSite='loc-market';
export const bondActor=(world:WorldState,id=firstId)=>world.cultivators.find(row=>row.id===id)!;
export const bondEdge=(world:WorldState)=>world.relationships.find(row=>
  row.fromId===firstId&&row.toId===secondId||row.fromId===secondId&&row.toId===firstId);
export const noAct:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静守本处。'};
export function bondTurn(world:WorldState,decision=noAct){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===firstId?decision:noAct])),()=>.1,'utility');
}

export function actualCommonBond(){
  const initial=createInitialWorld(2031);
  // Controlled starting tableau only. All current affinity, interactions and source stamps come from actual turns.
  for(const [id,power] of [[firstId,100],[secondId,145],[nearId,145]] as const){
    const actor=bondActor(initial,id);
    Object.assign(actor,{locationId:bondSite,hp:500,maxHp:500,combatPower:power,artifacts:[],spiritRoot:'木'});
  }
  bondActor(initial,nearId).name=bondActor(initial,secondId).name;
  let socially=initial;
  for(let i=0;i<3;i++)socially=bondTurn(socially,{chosenAction:'SOCIALIZE',targetCultivatorId:secondId,innerMonologue:'在坊市当面论道。'});
  expect(bondEdge(socially)?.affinity).toBe(1);
  const clash=actualPublicBondDuel(socially,secondId);
  expect(bondEdge(clash)?.affinity).toBe(-39);
  expect(bondActor(clash).alive).toBe(true);
  expect(bondActor(clash,secondId).alive).toBe(true);
  return {initial,socially,clash};
}

export function actualPublicBondDuel(world:WorldState,target=secondId){
  return bondTurn(world,{chosenAction:'DUEL',targetCultivatorId:target,innerMonologue:'与实在眼前之人交招。'});
}

export function actualPrivateBond(world:WorldState){
  return bondTurn(world,{chosenAction:'SCHEMING',targetCultivatorId:secondId,innerMonologue:'私下设局，仅两人知道。'});
}

export function actualDefenderWinsLethally(world:WorldState,target=secondId){
  const damaged=executeGodIntervention(world,{type:'TRIBULATION_STRIKE',targetCultivatorId:firstId});
  const weak=executeGodIntervention(damaged,{type:'TRIBULATION_STRIKE',targetCultivatorId:firstId});
  expect(bondActor(weak).hp).toBe(1);
  const actual=actualPublicBondDuel(weak,target);
  const death=actual.events.find(evt=>evt.id===`evt-${actual.tick}-${firstId}-kill`)!;
  expect(death).toMatchObject({category:'death',duelWinnerId:target,actorIds:[firstId,target],locationId:bondSite});
  expect(bondActor(actual).alive).toBe(false);
  expect(bondActor(actual,target).alive).toBe(true);
  return {world:actual,death};
}

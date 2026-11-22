import { expect } from 'vitest';
import { createInitialWorld, REALM_BASE_POWER, REALM_LIFESPAN } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { CultivationRealm, LLMDecisionPayload, PersonalityTrait, WorldState } from '../src/types/world';

export const destinyActorId='npc-1';
export const destinyActor=(world:WorldState)=>world.cultivators.find(row=>row.id===destinyActorId)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'原地静候。'};
export const nativeBreak:LLMDecisionPayload={chosenAction:'BREAKTHROUGH',innerMonologue:'本月当面尝试破境。'};
export function destinyMonth(world:WorldState,decision=rest,rng=()=>.2){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===destinyActorId?decision:rest])),rng,'utility');
}
function atNativeThreshold(realm:CultivationRealm,seed:number){
  const world=createInitialWorld(seed,'spirit-bloom');
  const actor=destinyActor(world);
  // Controlled initial qualification only: no trial, major result, offer, or custody record is inserted.
  const maxHp=Math.round(REALM_BASE_POWER[realm]*1.72);
  Object.assign(actor,{realm,realmStage:9,qiProgress:100,maxHp,hp:maxHp,lifespan:REALM_LIFESPAN[realm],
    combatPower:Math.round(REALM_BASE_POWER[realm]*1.9)});
  return world;
}

export function actualDestinyTrial(seed=1){
  const initial=atNativeThreshold('筑基',seed);
  const opening=destinyMonth(initial,nativeBreak);
  expect(destinyActor(opening).tribulation).toMatchObject({stage:'lightning',targetRealm:'金丹'});
  expect(destinyActor(opening).destinyTraits).toBeUndefined();
  let last=opening;
  while(destinyActor(last).tribulation?.stage==='lightning'){
    last=destinyMonth(last,{chosenAction:'FACE_TRIBULATION',tribulationStance:'guard',innerMonologue:'护住气海，渡此一重。'});
    expect(last.tick-opening.tick).toBeLessThanOrEqual(3);
    expect(destinyActor(last).destinyTraits).toBeUndefined();
  }
  expect(destinyActor(last).tribulation?.stage).toBe('heart_demon');
  const passed=destinyMonth(last,{chosenAction:'FACE_TRIBULATION',tribulationStance:'focus',innerMonologue:'正视劫心。'});
  expect(destinyActor(passed)).toMatchObject({realm:'金丹',realmStage:1,tribulation:{stage:'passed',resolvedTick:passed.tick}});
  return {initial,opening,last,passed};
}

export function actualDestinyOrdinary(seed=1,guided=true,personality?:PersonalityTrait){
  const initial=atNativeThreshold('化神',seed);
  const actor=destinyActor(initial);
  if(personality)actor.personality=personality; // Controlled alternate initial disposition for an otherwise identical NPC.
  if(guided)expect(possessAvatar(initial,actor.id)).toBe(true);
  const advanced=destinyMonth(initial,nativeBreak);
  expect(destinyActor(advanced)).toMatchObject({realm:'炼虚',realmStage:1});
  return {initial,advanced};
}

import { expect } from 'vitest';
import {createInitialWorld,REALM_BASE_POWER,REALM_LIFESPAN} from '../src/data/initialWorld';
import {activeAvatar,possessAvatar} from '../src/engine/avatarEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const trialActorId='npc-1';
export const trialActor=(world:WorldState)=>world.cultivators.find(row=>row.id===trialActorId)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'原地静候。'};
export const focusTrial:LLMDecisionPayload={chosenAction:'FACE_TRIBULATION',tribulationStance:'focus',innerMonologue:'定住心神。'};
export function trialTurn(world:WorldState,decision=rest){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===trialActorId?decision:rest])),()=>.2,'utility');
}

export function actualNativeHeartFrame(guided=true){
  const initial=createInitialWorld(1,'spirit-bloom');
  const body=trialActor(initial),maxHp=Math.round(REALM_BASE_POWER.筑基*1.72);
  // Controlled initial qualification only: no trial, relationship evidence, or resulting receipt inserted.
  Object.assign(body,{realm:'筑基',realmStage:9,qiProgress:100,maxHp,hp:maxHp,
    lifespan:REALM_LIFESPAN.筑基,combatPower:Math.round(REALM_BASE_POWER.筑基*1.9)});
  if(guided)expect(possessAvatar(initial,body.id)).toBe(true);
  const opening=trialTurn(initial,{chosenAction:'BREAKTHROUGH',innerMonologue:'本月当面引劫。'});
  expect(trialActor(opening).tribulation).toMatchObject({stage:'lightning',targetRealm:'金丹',totalWaves:3});
  expect(trialActor(opening).tribulation?.heartDemon).toBeUndefined();
  let frame=opening,lastLightning=opening;
  for(let wave=1;wave<=3;wave++){
    lastLightning=frame;
    frame=trialTurn(frame,{chosenAction:'FACE_TRIBULATION',tribulationStance:'guard',innerMonologue:'护气渡此一重。'});
    if(wave<3)expect(trialActor(frame).tribulation?.heartDemon).toBeUndefined();
  }
  const trial=trialActor(frame).tribulation!;
  expect(trial).toMatchObject({stage:'heart_demon'});
  expect(trial.heartDemon).toMatchObject({actorId:body.id,openedTick:frame.tick,siteId:body.locationId});
  expect(trialActor(frame).destinyTraits).toBeUndefined();
  expect(activeAvatar(frame)).toBeUndefined();
  return {initial,opening,lastLightning,frame,trial};
}

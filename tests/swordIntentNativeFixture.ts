import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { equippedArtifact } from '../src/engine/artifactEngine';
import { measureNativeDuel } from "../src/engine/nativeDuelRules";
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { DaoPathId, DaoPathMove } from "../src/types/daoPath";
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

export const swordOwner='npc-1';
export const swordOpponent='elder-taixu-1';
export const swordSite='loc-taixu';
export const starterSword='artifact-npc-1-1';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在原处静养。'};
export const intentActor=(world:WorldState,id=swordOwner)=>world.cultivators.find(row=>row.id===id)!;
export const intentTurn=(world:WorldState,orders:Record<string,LLMDecisionPayload>={},roll=.22)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??rest])),()=>roll,'utility');
export function nativeSwordDuel(extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload{
  return {chosenAction:'DUEL',targetCultivatorId:swordOpponent,innerMonologue:'与原地的长老一较高下。',...extra};
}
export function authenticSwordStart(){
  const world=createInitialWorld(1,'spirit-bloom');
  expect(intentActor(world).locationId).toBe(swordSite);
  expect(intentActor(world,swordOpponent).locationId).toBe(swordSite);
  expect(equippedArtifact(intentActor(world))).toMatchObject({id:starterSword,boundTo:swordOwner});
  return world;
}

export const reserveRoot:LLMDecisionPayload={
  chosenAction:'GATHER_HERBS',targetHerbId:'earth_root',innerMonologue:'亲自采集合用的玄土根。',
};
export const cultivateSwordBase:LLMDecisionPayload={chosenAction:'CULTIVATE',innerMonologue:'先以本门经法运转周天。'};
export const bindOtherArtifact:LLMDecisionPayload={
  chosenAction:'BIND_ARTIFACT',targetArtifactId:'artifact-npc-1-2',innerMonologue:'另选原有的九霄护心镜。',
};

export const daoPathOrder=(daoPathMove:DaoPathMove,targetDaoPathId:DaoPathId='sword'):LLMDecisionPayload=>({
  chosenAction:'DAO_PATH',targetDaoPathId,daoPathMove,innerMonologue:'以实物和真元亲历道途。',
});

export function actualAwakenedSwordIntent(matchedOpponent=false){
  let world=authenticSwordStart();
  if(matchedOpponent){
    // Calibrate only initial opponent power: a small ordinary advantage to the
    // original live elder; later HP, material, learning and combat stay native.
    const sword=intentActor(world),elder=intentActor(world,swordOpponent);
    const rolls:[number,number,number,number]=[.22,.22,.22,.22];
    let low=1,high=10_000;
    while(low<high){
      const mid=Math.floor((low+high)/2);
      const winner=measureNativeDuel(world,sword,{...elder,combatPower:mid},rolls).winner;
      if(winner.id===swordOwner)low=mid+1;
      else high=mid;
    }
    elder.combatPower=Math.ceil(low*1.05);
  }
  world=intentTurn(world,{[swordOwner]:reserveRoot});
  expect(intentActor(world).herbs.earth_root).toBeGreaterThan(0);
  while(intentActor(world).herbs.earth_root<2){
    world=intentTurn(world,{[swordOwner]:reserveRoot});
    expect(world.tick).toBeLessThan(5);
  }
  world=intentTurn(world,{[swordOwner]:daoPathOrder('choose')});
  const chosen=intentActor(world).daoPath;
  expect(chosen).toMatchObject({pathId:'sword',bladeId:starterSword,chosenTick:world.tick,chosenSiteId:swordSite,
    practices:[],activations:[]});
  const choice=world;
  world=intentTurn(world,{[swordOwner]:daoPathOrder('practice')});
  const first=world;
  world=intentTurn(world,{[swordOwner]:daoPathOrder('practice')});
  const learned=world;
  world=intentTurn(world,{[swordOwner]:daoPathOrder('ready')});
  return {choice,first,learned,ready:world};
}

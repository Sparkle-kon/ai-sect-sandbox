import {expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableAlchemy} from '../src/engine/alchemyEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {isScopedExpeditionGate} from '../src/engine/expeditionOmenTerms';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {HeavenlyAlchemyHeat,HeavenlyAlchemyQuality,HeavenlyRecipeId} from '../src/types/heavenlyAlchemy';
import type {HerbId,LLMDecisionPayload,WorldState} from '../src/types/world';

export const brewActorId='npc-5',brewSiteId='loc-danxia';
export const brewActor=(world:WorldState,id=brewActorId)=>world.cultivators.find(row=>row.id===id)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在真实岁月中静候。'};
export function brewMonth(world:WorldState,order:LLMDecisionPayload=rest,random=.2,actorId=brewActorId){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===actorId?order:rest])),()=>random,'utility');
}
export function actualHighAlchemyMaterials(extra:readonly HerbId[]=[],actorId=brewActorId){
  let world=createInitialWorld(1,'spirit-bloom');
  if(brewActor(world,actorId).locationId!==brewSiteId){
    world=brewMonth(world,{...rest,chosenAction:'EXPLORE',targetLocationId:brewSiteId},.95,actorId);
  }
  expect(brewActor(world,actorId).locationId).toBe(brewSiteId);
  expect(world.locations.find(row=>row.id===brewSiteId)?.furnaceGrade).toBe(3);
  for(const herb of ['jade_leaf','star_bloom','star_bloom',...extra] as const){
    const actor=brewActor(world,actorId);
    const before=actor.herbs[herb];
    expect(availableAlchemy(actor,world,world.tick+1)).toContainEqual({action:'GATHER_HERBS',targetHerbId:herb});
    world=brewMonth(world,{...rest,chosenAction:'GATHER_HERBS',targetHerbId:herb},.2,actorId);
    expect(brewActor(world,actorId).herbs[herb]).toBeGreaterThan(before);
    expect(world.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({
      mechanism:'alchemy',reason:'herb_harvest',good:herb,
    }));
  }
  return world;
}

export function actualWardAlchemyMaterials(actorId=brewActorId){
  let world=actualHighAlchemyMaterials(['earth_root'],actorId);
  const ruins='loc-secret-1',actor=brewActor(world,actorId),known=knownMapLocations(world,actor);
  const ordinary=world.locations.filter(row=>row.id!==actor.locationId&&!isScopedExpeditionGate(row));
  const unknown=ordinary.filter(row=>!known.includes(row)),nativeCandidates=unknown.length?unknown:ordinary;
  const index=nativeCandidates.findIndex(row=>row.id===ruins),isKnown=known.some(row=>row.id===ruins);
  if(!isKnown)expect(index).toBeGreaterThanOrEqual(0);
  world=brewMonth(world,{...rest,chosenAction:'EXPLORE',targetLocationId:isKnown?ruins:undefined},
    isKnown ? .95 : (index+.4)/nativeCandidates.length,actorId);
  expect(brewActor(world,actorId).locationId).toBe(ruins);
  for(let i=0;i<3&&brewActor(world,actorId).herbs.shadow_moss<2;i++){
    world=brewMonth(world,{...rest,chosenAction:'GATHER_HERBS',targetHerbId:'shadow_moss'},.2,actorId);
  }
  expect(brewActor(world,actorId).herbs.shadow_moss).toBeGreaterThanOrEqual(2);
  world=brewMonth(world,{...rest,chosenAction:'EXPLORE',targetLocationId:brewSiteId},.95,actorId);
  expect(brewActor(world,actorId).locationId).toBe(brewSiteId);
  return world;
}

export const highBrew=(targetHeavenlyRecipeId:HeavenlyRecipeId,heavenlyAlchemyHeat:HeavenlyAlchemyHeat):LLMDecisionPayload=>({
  ...rest,chosenAction:'HEAVENLY_ALCHEMY',heavenlyAlchemyMove:'brew',targetHeavenlyRecipeId,heavenlyAlchemyHeat,
});
export const highTake=(targetHeavenlyRecipeId:HeavenlyRecipeId,heavenlyAlchemyQuality:HeavenlyAlchemyQuality):LLMDecisionPayload=>({
  ...rest,chosenAction:'HEAVENLY_ALCHEMY',heavenlyAlchemyMove:'take',targetHeavenlyRecipeId,heavenlyAlchemyQuality,
});

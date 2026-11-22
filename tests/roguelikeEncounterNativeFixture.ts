import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { isScopedExpeditionGate } from '../src/engine/expeditionOmenTerms';
import { activeRoguelikeEncounter } from '../src/engine/roguelikeEncounterEngine';
import { knownMapLocations } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

export const id='npc-1',other='npc-6',site='loc-secret-1';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候一月。'};
export const actor=(world:WorldState,who=id)=>world.cultivators.find(row=>row.id===who)!;
export function month(world:WorldState,decision=rest,rng=()=>.90){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===id?decision:rest])),
    rng,'utility');
}
function travel(world:WorldState){
  const body=actor(world);
  const known=knownMapLocations(world,body);
  const all=world.locations.filter(row=>row.id!==body.locationId&&!isScopedExpeditionGate(row));
  const unknown=all.filter(row=>!known.includes(row));
  const candidates=unknown.length?unknown:all;
  const index=candidates.findIndex(row=>row.id===site);
  const isKnown=known.some(row=>row.id===site);
  if(!isKnown)expect(index).toBeGreaterThanOrEqual(0);
  // Select only from the native existing route/unknown pool; no fabricated rumor, visit, or location writes.
  return month(world,{chosenAction:'EXPLORE',targetLocationId:isKnown?site:undefined,innerMonologue:'实地探寻古墟。'},
    ()=>isKnown ? .90 : (index+.5)/candidates.length);
}

export function openNativeGuidedEncounter(){
  const initial=createInitialWorld(1,'spirit-bloom');
  expect(possessAvatar(initial,id)).toBe(true);
  const from=actor(initial).locationId;
  const world=travel(initial);
  expect(actor(world).locationId).toBe(site);
  const encounter=activeRoguelikeEncounter(world,actor(world));
  if(!encounter)throw Error('Actual completed EXPLORE did not open a guided encounter');
  expect(encounter).toMatchObject({actorId:id,fromSiteId:from,siteId:site,openedTick:world.tick,status:'offered',guided:true});
  expect(initial.roguelikeEncounters).toBeUndefined();
  return {world,encounter};
}

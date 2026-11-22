import {expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableOccasionJoins} from '../src/engine/occasionEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const tournamentId='occasion-60-tournament';
export const tournamentEntrants=['npc-1','npc-2','npc-3','npc-4','npc-5','npc-6','npc-7','npc-8'] as const;
const wait:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候实际年月与名册。'};
export function tournamentFrame(world:WorldState,plans:Readonly<Record<string,LLMDecisionPayload>>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,plans[row.id]??wait])),undefined,'utility');
}
export const actualTournament=(world:WorldState)=>world.occasions.find(row=>row.id===tournamentId)!;
export const tournamentActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const jointournament:LLMDecisionPayload={chosenAction:'JOIN_OCCASION',targetOccasionId:tournamentId,innerMonologue:'赴本次大比，按实报名。'};
export function actualTournamentOpen(){
  let world=createInitialWorld(1,'spirit-bloom');
  while(world.tick<60)world=tournamentFrame(world);
  expect(actualTournament(world)).toMatchObject({status:'registration',startedTick:60,registrationClosesTick:63,locationId:'loc-market',participantIds:[]});
  expect(world.events).toContainEqual(expect.objectContaining({id:`evt-60-${tournamentId}-open`,actorIds:[]}));
  return world;
}
export function actualTournamentSignup(world=actualTournamentOpen(),entrants:readonly string[]=tournamentEntrants,
  override:Readonly<Record<string,LLMDecisionPayload>>={}){
  expect(new Set(entrants).size).toBe(entrants.length);
  const decisions:Record<string,LLMDecisionPayload>={};
  for(const id of entrants){
    const actor=tournamentActor(world,id);
    expect(actor).toMatchObject({alive:true});
    expect(availableOccasionJoins(actor,world,world.tick+1)).toContainEqual({action:'JOIN_OCCASION',targetOccasionId:tournamentId});
    decisions[id]=override[id]??jointournament;
  }
  const enrolled=tournamentFrame(world,decisions);
  expect(new Set(actualTournament(enrolled).participantIds)).toEqual(new Set(entrants));
  for(const id of entrants)expect(enrolled.events).toContainEqual(expect.objectContaining({
    id:`evt-${enrolled.tick}-${tournamentId}-join-${id}`,actorIds:[id],locationId:tournamentActor(world,id).locationId,
  }));
  return enrolled;
}

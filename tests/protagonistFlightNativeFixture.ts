import {expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availablePilgrimageActions} from '../src/engine/pilgrimageEngine';
import {availableProtagonistFlightActions,projectProtagonistFlight} from '../src/engine/protagonistFlightEngine';
import {projectProtagonistSuccession} from '../src/engine/protagonistSuccession';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const leadId='npc-3',guideId='npc-6',hunterId='npc-1',origin='loc-market';
export const body=(world:WorldState,id=leadId)=>world.cultivators.find(actor=>actor.id===id)!;
export const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'照眼前实情行事。',...fields});
const travel=action('EXPLORE',{targetLocationId:origin});
const duel=(id:string)=>action('DUEL',{targetCultivatorId:id});
export const turn=(world:WorldState,chosen:Record<string,LLMDecisionPayload>={},roll=.1)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(actor=>[actor.id,chosen[actor.id]??action('REST')])),()=>roll);
export const own=(world:WorldState)=>projectProtagonistFlight(world,body(world));

/** Inputs are deliberately controlled, but every location, public proof, pursuit and assent is produced by a real native month. */
export function earnedAcceptedWorld(){
  let world=createInitialWorld(1,'spirit-bloom');
  const victims=['npc-7','npc-8'];
  body(world).combatPower=100_000;
  body(world,hunterId).combatPower=1;
  world=turn(world,Object.fromEntries([leadId,guideId,hunterId,...victims].filter(id=>body(world,id).locationId!==origin).map(id=>[id,travel])));
  expect(body(world).locationId).toBe(origin);
  expect(world.events.some(row=>row.tick===world.tick&&row.id===`evt-${world.tick}-${leadId}-explore`)).toBe(true);
  world=turn(world,{[leadId]:action('SOCIALIZE',{targetCultivatorId:guideId})});
  for(const id of victims){
    body(world,id).hp=1;
    world=turn(world,{[leadId]:duel(id)});
    expect(body(world,id).alive).toBe(false);
  }
  const bounty=world.bounties.find(row=>row.targetCultivatorId===leadId);
  expect(bounty).toMatchObject({status:'open'});
  const choice=availablePilgrimageActions(body(world),world,true,world.tick+1).find(row=>row.targetCultivatorId===guideId);
  expect(choice).toBeDefined();
  world=turn(world,{[leadId]:action('PILGRIMAGE',choice)});
  const journey=world.pilgrimages.journeys.at(-1);
  expect(journey).toMatchObject({organizerId:leadId,companionId:guideId,status:'proposed'});
  expect(projectProtagonistSuccession(world).active?.actorId).toBe(leadId);
  world=turn(world,{[guideId]:action('PILGRIMAGE',{pilgrimageMove:'accept',targetPilgrimageId:journey!.id})});
  expect(world.pilgrimages.journeys.at(-1)).toMatchObject({status:'active',startedTick:world.tick});
  return {world,bountyId:bounty!.id,journeyId:journey!.id};
}
export function actualFlight(){
  const {world,bountyId,journeyId}=earnedAcceptedWorld();
  const pursuit=turn(world,{[hunterId]:action('PURSUE_BOUNTY',{targetBountyId:bountyId})});
  expect(pursuit.events.find(row=>row.id===`evt-${pursuit.tick}-${hunterId}-duel`)).toMatchObject({
    duelWinnerId:leadId,actorIds:[hunterId,leadId],damage:expect.arrayContaining([expect.objectContaining({cultivatorId:leadId})]),
  });
  expect(pursuit.protagonistFlights?.[0]).toMatchObject({actorId:leadId,guideId,
    pursuerId:hunterId,openedTick:pursuit.tick,journeyId,rounds:[]});
  expect(own(pursuit)).toMatchObject({status:'active',nextRound:1});
  return {pursuit,journeyId};
}
export function advance(world:WorldState):WorldState{
  const option=availableProtagonistFlightActions(body(world),world).find(row=>row.pilgrimageMove==='advance'&&!row.targetRoadId);
  return turn(world,option?{[leadId]:action('PILGRIMAGE',option)}:{});
}

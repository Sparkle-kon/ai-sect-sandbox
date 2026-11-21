import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availablePilgrimageActions, pilgrimageCheckpoint } from '../src/engine/pilgrimageEngine';
import { availableRouteWarningActions } from '../src/engine/routeWarningEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-route-warning' };
const reply = (command:object) => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(command)}}]}));
afterEach(()=>vi.unstubAllGlobals());

function fixture(){
  let world=createInitialWorld(455);
  world.tick=20;
  const origin=world.locations.find(({id})=>id==='loc-taixu')!;
  const midpoint=world.locations.find(({id})=>id==='loc-market')!;
  const later=world.locations.find(({id})=>id==='loc-tianji')!;
  origin.x=220;origin.y=220;midpoint.x=380;midpoint.y=220;later.x=500;later.y=220;
  world=applyMapBrush(world,'cursed_miasma',[{x:300,y:220}]);
  const [traveler,companion,outsider]=world.cultivators;
  for(const actor of [traveler,companion]){
    actor.locationId=origin.id;
    actor.spiritStones=100;
    actor.hp=actor.maxHp;
    actor.qiProgress=20;
    actor.exploredTileIds=[];
    actor.rumors=[];
  }
  const act=(actor:Cultivator,decision:LLMDecisionPayload)=>applyCultivatorBrainDecision(world,actor,decision,()=>.99);
  const option=availablePilgrimageActions(traveler,world).find((row)=>row.pilgrimageMove==='propose'&&
    row.targetCultivatorId===companion.id&&row.targetLocationId===midpoint.id)!;
  expect(option).toBeDefined();
  expect(act(traveler,{...option,chosenAction:'PILGRIMAGE',innerMonologue:''})).not.toBeNull();
  const journey=world.pilgrimages.journeys[0];
  const travel=(pilgrimageMove:'accept'|'advance')=>({chosenAction:'PILGRIMAGE',pilgrimageMove,targetPilgrimageId:journey.id,innerMonologue:''} as const);
  expect(act(companion,travel('accept'))).not.toBeNull();
  world.tick++;
  expect(act(traveler,travel('advance'))).not.toBeNull();
  expect(traveler.locationId).toBe(midpoint.id);
  expect(pilgrimageCheckpoint(world,traveler)).toBeUndefined();
  const observation=world.routeWarnings.observations.find(row=>row.actorId===traveler.id)!;
  const firsthand=world.routeWarnings.observations.find(row=>row.actorId===companion.id)!;
  expect(observation).toMatchObject({ observedTick:world.tick,journeyId:journey.id });
  expect(firsthand.journeyId).toBe(journey.id);
  return {world,traveler,companion,outsider,origin,midpoint,observation,firsthand,act};
}

describe('grounded route warnings in both brains',()=>{
  it('allows an exact privately observed post on the next stationary turn, not raw details or copied testimony',async()=>{
    const {world,traveler,companion,outsider,origin,midpoint,observation,firsthand,act}=fixture();
    const post={chosenAction:'ROUTE_WARNING',routeWarningMove:'post',targetRouteObservationId:observation.id,innerMonologue:'只报亲历。'} as const;
    const mocked=vi.fn(async (_endpoint:RequestInfo|URL,_init?:RequestInit)=>reply(post));
    vi.stubGlobal('fetch',mocked);
    expect(availableRouteWarningActions(traveler,world)).toEqual([]);
    await expect(requestCultivatorLLMDecision(traveler,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(companion,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    for(const invalid of [{targetRouteObservationId:undefined},{targetRouteWarningId:'made-up'},{hazard:'miasma'},
      {path:[observation.fromTileId,observation.toTileId]},{location:midpoint.id},{expiresTick:999},{spokenLine:'宣布封路'}]){
      mocked.mockImplementation(async()=>reply({...post,...invalid}));
      await expect(requestCultivatorLLMDecision(traveler,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mocked.mockImplementation(async()=>reply(post));
    const decision=await requestCultivatorLLMDecision(traveler,world,config,world.tick+1);
    expect(decision).toMatchObject(post);
    const prompt=mocked.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain(observation.id);
    expect(prompt).not.toContain(observation.hazard.id);
    expect(prompt).not.toContain(observation.toTileId);
    expect(prompt).not.toContain(firsthand.id);
    world.tick++;
    expect(computeHeuristicDecision(traveler,world,()=>.99)).toMatchObject({
      chosenAction:'ROUTE_WARNING',routeWarningMove:'post',targetRouteObservationId:observation.id,
    });
    traveler.locationId=origin.id;
    const originalType=world.locations.find(({id})=>id===origin.id)!;
    const type=originalType.type;
    originalType.type='spirit_vein';
    expect(act(traveler,decision!)).toBeNull();
    originalType.type=type;
    traveler.locationId=midpoint.id;
    expect(act(traveler,decision!)).not.toBeNull();
    const row=world.routeWarnings.notices[0];
    expect(row.observation.id).toBe(observation.id);
    expect(act(traveler,decision!)).toBeNull();
    const trace=recordDecisionTrace(world,traveler.id,legalTraceCandidates(world,traveler),decision!,'model',true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(observation.id);

    const corroborate={...post,routeWarningMove:'corroborate',targetRouteObservationId:firsthand.id,targetRouteWarningId:row.id};
    mocked.mockImplementation(async()=>reply(corroborate));
    await expect(requestCultivatorLLMDecision(companion,world,config,world.tick+1)).resolves.toBeUndefined();
    const retract={chosenAction:'ROUTE_WARNING',routeWarningMove:'retract',targetRouteWarningId:row.id,innerMonologue:''} as const;
    mocked.mockImplementation(async()=>reply(retract));
    await expect(requestCultivatorLLMDecision(companion,world,config,world.tick+1)).resolves.toBeUndefined();
    const cancellation=await requestCultivatorLLMDecision(traveler,world,config,world.tick+1);
    expect(cancellation).toMatchObject({...retract,innerMonologue:expect.any(String)});
    world.tick++;
    expect(computeHeuristicDecision(traveler,world,()=>.99).routeWarningMove).not.toBe('retract');
    expect(act(traveler,cancellation!)).not.toBeNull();
  });

  it('lets a different genuine pair corroborate the same crossed edge, without revealing their route to the model',async()=>{
    const {world,traveler,companion,origin,midpoint,observation,act}=fixture();
    world.tick++;
    expect(act(traveler,{chosenAction:'ROUTE_WARNING',routeWarningMove:'post',targetRouteObservationId:observation.id,innerMonologue:''})).not.toBeNull();
    const notice=world.routeWarnings.notices[0];
    const [witness,partner]=world.cultivators.filter(actor=>actor!==traveler&&actor!==companion);
    for(const actor of [witness,partner]){
      actor.locationId=origin.id;
      actor.spiritStones=100;
      actor.hp=actor.maxHp;
      actor.qiProgress=20;
      actor.exploredTileIds=[];
      actor.rumors=[];
    }
    const proposal=availablePilgrimageActions(witness,world).find(row=>row.pilgrimageMove==='propose'&&
      row.targetCultivatorId===partner.id&&row.targetLocationId===midpoint.id)!;
    expect(proposal).toBeDefined();
    expect(act(witness,{...proposal,chosenAction:'PILGRIMAGE',innerMonologue:''})).not.toBeNull();
    const journey=world.pilgrimages.journeys.at(-1)!;
    expect(act(partner,{chosenAction:'PILGRIMAGE',pilgrimageMove:'accept',targetPilgrimageId:journey.id,innerMonologue:''})).not.toBeNull();
    world.tick++;
    expect(act(witness,{chosenAction:'PILGRIMAGE',pilgrimageMove:'advance',targetPilgrimageId:journey.id,innerMonologue:''})).not.toBeNull();
    const independent=world.routeWarnings.observations.find(row=>row.actorId===witness.id)!;
    expect(independent.hazard.id).toBe(observation.hazard.id);
    expect(independent.journeyId).not.toBe(observation.journeyId);
    const corroboration={chosenAction:'ROUTE_WARNING',routeWarningMove:'corroborate',targetRouteObservationId:independent.id,
      targetRouteWarningId:notice.id,innerMonologue:'各据亲历。'} as const;
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>reply(corroboration));
    vi.stubGlobal('fetch',mock);
    const choice=await requestCultivatorLLMDecision(witness,world,config,world.tick+1);
    expect(choice).toMatchObject(corroboration);
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(independent.hazard.id);
    world.tick++;
    expect(computeHeuristicDecision(witness,world,()=>.99)).toMatchObject({
      chosenAction:'ROUTE_WARNING',routeWarningMove:'corroborate',targetRouteObservationId:independent.id,targetRouteWarningId:notice.id,
    });
    expect(act(witness,choice!)).not.toBeNull();
    expect(notice.corroboration?.observation.id).toBe(independent.id);
    expect(world.routeWarnings.notices).toHaveLength(1);
  });
});

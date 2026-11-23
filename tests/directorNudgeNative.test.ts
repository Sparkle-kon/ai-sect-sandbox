import { seedEncounterApproach } from '../src/engine/director/encounterSeed';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { directorDungeonOmenViable,directorPrioritizesOmenSurvey } from '../src/engine/expeditionOmenEngine';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { directorTravelPreference,DIRECTOR_TOURNAMENT_TITLE } from '../src/engine/director/nudgeIntegrations';
import { advanceDirectorHighlights,projectDirectorHighlight,resolveDirectorHighlight } from '../src/engine/director/directorHighlights';
import { onLowerPlane } from '../src/engine/upperPassageIsolation';
import { advanceOccasions,availableAutonomousOccasionJoins,availableOccasionJoins,joinOccasion } from '../src/engine/occasionEngine';
import { activeRoguelikeEncounter,resolveDirectorRoguelikeChoice,roguelikeEncounterRoll } from '../src/engine/roguelikeEncounterEngine';
import { configureStoryteller } from '../src/engine/storytellerDirector';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import type { DirectorNudge } from '../src/engine/director/nudge';
import type { LLMConfig,LLMDecisionPayload,WorldState } from '../src/types/world';

const rest: LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且静候一月。'};
function install(world:WorldState,nudge:DirectorNudge){
  configureStoryteller(world,'wandering_jianghu');
  if(!world.storyteller)throw new Error('director unavailable');
  world.storyteller.nudges=[nudge];
}
function routeFixture(){
  const world=createInitialWorld(13071);
  for(const actor of world.cultivators){
    const nudge=seedEncounterApproach(world,actor);
    if(nudge?.kind!=='encounter_ticket'||roguelikeEncounterRoll(world,{actorId:actor.id,fromSiteId:actor.locationId,
      siteId:nudge.targetSiteId,openedTick:world.tick+1},'opening')===0)continue;
    return {world,actor,nudge};
  }
  throw new Error('Fixture has no legal encounter of interest');
}
const reply=(payload:LLMDecisionPayload)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
const config:LLMConfig={enabled:true,apiBaseUrl:'https://director-mock.invalid/v1',apiKey:'fake',model:'director-mock'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('Director future-only nudges',()=>{
  it('uses a ticket only after the exact actor actually arrives on its exact route, once, and saves the unpossessed opportunity',()=>{
    const {world,actor,nudge}=routeFixture();
    install(world,nudge);
    const before=encodeWorldSave(world);
    const phase=world.random.state;
    expect(directorTravelPreference(world,actor)?.site.id).toBe(nudge.targetSiteId);
    expect(encodeWorldSave(world)).toBe(before);
    expect(world.random.state).toBe(phase);
    const decisions=Object.fromEntries(world.cultivators.map(row=>[row.id,row===actor?
      {chosenAction:'EXPLORE',targetLocationId:nudge.targetSiteId,innerMonologue:'亲自前往。'}:rest] satisfies [string,LLMDecisionPayload]));
    const next=advanceWorldTick(world,decisions,()=>.99,'utility');
    const moved=next.cultivators.find(row=>row.id===actor.id)!;
    expect(moved.locationId).toBe(nudge.targetSiteId);
    expect(moved.locationId).not.toBe(actor.locationId);
    expect(next.storyteller?.nudges).not.toContainEqual(nudge);
    expect(activeRoguelikeEncounter(next,moved)).toMatchObject({guided:false,directorTicketUntil:nudge.expiresTick});
    const saved=encodeWorldSave(next),restored=decodeWorldSave(saved);
    expect(encodeWorldSave(restored)).toBe(saved);
    const wrongExpiry=structuredClone(next);
    wrongExpiry.roguelikeEncounters![0].directorTicketUntil=world.tick;
    expect(()=>encodeWorldSave(wrongExpiry)).toThrow('roguelikeEncounters.directorTicket');
    const noMove=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,rest])),()=>.99,'utility');
    expect(noMove.storyteller?.nudges).toContainEqual(nudge);
    expect(noMove.roguelikeEncounters).toBeUndefined();
  });

  it('allows one authenticated current unpossessed selection and keeps exact same-tick proof through save/load',()=>{
    const {world,actor,nudge}=routeFixture();
    install(world,nudge);
    configureStoryteller(world,'great_calamity',actor.id);
    const decisions=Object.fromEntries(world.cultivators.map(row=>[row.id,row===actor?
      {chosenAction:'EXPLORE',targetLocationId:nudge.targetSiteId,innerMonologue:'亲自前往。'}:rest] satisfies [string,LLMDecisionPayload]));
    const next=advanceWorldTick(world,decisions,()=>.99,'utility');
    const moved=next.cultivators.find(row=>row.id===actor.id)!;
    const encounter=activeRoguelikeEncounter(next,moved)!;
    expect(resolveDirectorRoguelikeChoice(world,actor,encounter.id,'cautious')).toBeNull();
    const director=next.storyteller!;
    if(!director.highlightOffer)advanceDirectorHighlights(next,director,moved,1);
    const highlight=projectDirectorHighlight(next)!;
    expect(highlight).toMatchObject({kind:'encounter',sourceId:encounter.id,actorId:moved.id});
    const forged={...highlight.key,siteId:actor.locationId};
    expect(resolveDirectorHighlight(next,forged,'cautious')).toBe(next);
    const settled=resolveDirectorHighlight(next,highlight.key,'cautious');
    expect(settled).not.toBe(next);
    expect(settled.roguelikeEncounters?.find(row=>row.id===encounter.id)).toMatchObject({
      directorChoice:true,resolvedTick:encounter.openedTick,choice:'cautious',status:'resolved'});
    expect(resolveDirectorHighlight(settled,highlight.key,'cautious')).toBe(settled);
    const save=encodeWorldSave(settled);
    expect(encodeWorldSave(decodeWorldSave(save))).toBe(save);
    const invalid=structuredClone(settled);
    invalid.storyteller!.highlights!.find(row=>row.sourceId===encounter.id)!.chosen='bold';
    expect(()=>encodeWorldSave(invalid)).toThrow('roguelikeEncounters.directorChoice');
  });

  it('cannot steer the host, add a hidden direction, or extend a timed ticket',()=>{
    const {world,actor,nudge}=routeFixture();
    install(world,nudge);
    expect(directorTravelPreference(world,actor,nudge.expiresTick+1)).toBeUndefined();
    expect(possessAvatar(world,actor.id)).toBe(true);
    expect(directorTravelPreference(world,actor)).toBeUndefined();
    const other=world.cultivators.find(row=>row!==actor&&onLowerPlane(row))!;
    expect(directorTravelPreference(world,other)).toBeUndefined();
    expect(world.storyteller?.nudges).toContainEqual(nudge);
  });

  it('gives a real current route to Cognitive, still rejects guessed targets, and does not narrate commitments',async()=>{
    const {world,actor,nudge}=routeFixture();
    install(world,nudge);
    const route:LLMDecisionPayload={chosenAction:'EXPLORE',targetLocationId:nudge.targetSiteId,innerMonologue:'且亲自看看那头。'};
    let payload=route;
    const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body)) as {messages:{content:string}[]};
      expect(body.messages.some(({content})=>content.includes('熟路那头或有动静')&&content.includes(nudge.targetSiteId))).toBe(true);
      return reply(payload);
    });
    vi.stubGlobal('fetch',fetcher);
    expect(await requestCultivatorLLMDecision(actor,world,config,world.tick+1)).toMatchObject(route);
    payload={...route,targetLocationId:'guessed-hidden-destination'};
    expect(await requestCultivatorLLMDecision(actor,world,config,world.tick+1)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(world.roguelikeEncounters).toBeUndefined();
  });

  it('opens genuine market registration in a later month without consuming a world roll',()=>{
    const world=createInitialWorld(13071),place=world.locations.find(row=>row.type==='market')!;
    install(world,{kind:'omen_bias',siteId:place.id,reason:'tournament',expiresTick:world.tick+4});
    const rng=vi.fn(()=>.99);
    const oldRng=world.random.state;
    world.tick=world.month=2;
    const events=advanceOccasions(world,rng);
    expect(world.occasions[0]).toMatchObject({title:DIRECTOR_TOURNAMENT_TITLE,locationId:place.id,startedTick:2,status:'registration',participantIds:[]});
    expect(events[0]).toMatchObject({locationId:place.id,tick:2,title:DIRECTOR_TOURNAMENT_TITLE+'开启'});
    expect(availableOccasionJoins(world.cultivators[0],world)).toContainEqual({action:'JOIN_OCCASION',targetOccasionId:world.occasions[0].id});
    expect(world.storyteller?.nudges).toBeUndefined();
    expect(advanceOccasions(world,rng)).toEqual([]);
    expect(rng).not.toHaveBeenCalled();
    expect(world.random.state).toBe(oldRng);
  });

  it('reserves a local tournament for the exact mounted, pinned or personally prompted actor, not the rest of the cast',async()=>{
    const world=createInitialWorld(13071),place=world.locations.find(row=>row.type==='market')!;
    const actor=world.cultivators[0],pinned=world.cultivators[1],answering=world.cultivators[2],outsider=world.cultivators[3];
    install(world,{kind:'omen_bias',siteId:place.id,reason:'tournament',expiresTick:world.tick+4});
    configureStoryteller(world,'wandering_jianghu',pinned.id);
    expect(possessAvatar(world,actor.id)).toBe(true);
    world.tick=world.month=2;
    advanceOccasions(world,()=>.99);
    const sourceId=world.occasions[0].id;
    const decision:LLMDecisionPayload={chosenAction:'JOIN_OCCASION',targetOccasionId:sourceId,innerMonologue:'愿亲自赴会。'};
    for(const reserved of [actor,pinned]){
      expect(availableAutonomousOccasionJoins(reserved,world)).toEqual([]);
      expect(availableOccasionJoins(reserved,world)).toHaveLength(1);
    }
    const state=world.storyteller!;
    state.highlights=[{tick:2,kind:'tournament',sourceId,actorId:answering.id}];
    expect(availableAutonomousOccasionJoins(answering,world)).toEqual([]);
    state.highlights[0].chosen='pass';
    expect(availableAutonomousOccasionJoins(answering,world)).toEqual([]);
    expect(availableAutonomousOccasionJoins(outsider,world)).toHaveLength(1);
    vi.stubGlobal('fetch',vi.fn(async()=>reply(decision)));
    await expect(requestCultivatorLLMDecision(pinned,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(answering,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toMatchObject(decision);
    expect(joinOccasion(world,actor,decision)).not.toBeNull();
    expect(world.occasions[0].participantIds).toEqual([actor.id]);
  });

  it('selects a genuinely favorable future observation and never opens a dungeon without paid measured facts',()=>{
    const world=createInitialWorld(2031),actor=world.cultivators.find(row=>row.id==='npc-2')!;
    const site=world.locations.find(row=>row.id===actor.locationId)!;
    expect(site.id).toBe('loc-vein-north');
    configureStoryteller(world,'wandering_jianghu',actor.id);
    expect(directorDungeonOmenViable(world,site,world.tick)).toBe(true);
    if(!world.storyteller)throw new Error('director unavailable');
    world.storyteller.nudges=[{kind:'omen_bias',siteId:site.id,reason:'dungeon',expiresTick:world.tick+5}];
    expect(directorPrioritizesOmenSurvey(world,actor)).toBe(true);
    expect(advanceOccasions(world,()=>.99)).toEqual([]);
    expect(world.expeditionOmens.rows).toEqual([]);
    const stones=actor.spiritStones;
    const fund:LLMDecisionPayload={chosenAction:'FIELD_OBSERVATORY',observatoryMove:'fund',innerMonologue:'到现场自己看。'};
    expect(resolveObservatoryAction(world,actor,fund)).not.toBeNull();
    expect(actor.spiritStones).toBe(stones-5);
    world.tick=world.month=3;
    expect(resolveObservatoryAction(world,actor,{...fund,observatoryMove:'measure',targetObservatoryTick:1})).not.toBeNull();
    world.tick=world.month=4;
    expect(advanceOccasions(world,()=>.99)[0]?.witnessScope).toBe('participants');
    expect(world.occasions[0]?.anchorSiteId).toBe(site.id);
    expect(world.storyteller.nudges).toBeUndefined();
    expect(world.expeditionOmens.rows[0]?.operatorId).toBe(actor.id);
  });
});

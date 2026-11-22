import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableExpeditionRescueActions,resolveExpeditionRescueAction} from '../src/engine/expeditionRescueEngine';
import {activeHeartDemonAftermath} from '../src/engine/heartDemonAftermathEngine';
import {autonomousExpeditionRescueOptions,canPauseAftermathRescue} from '../src/engine/heartDemonChoicePolicy';
import {queueGuidedHeartDemonChoice} from '../src/engine/heartDemonEngine';
import {sealedHeartDemonMemoryIds} from '../src/engine/heartDemonPrivacy';
import {requestCultivatorLLMDecision,utilityExpeditionRescueDecision,utilityRankedOrdinaryDecision} from '../src/engine/llmBrain';
import {modelOrdinaryIntentOptions,preferredOrdinarySocialIntent,rankOrdinaryIntents} from '../src/engine/ordinaryIntentEngine';
import {joinOccasion} from '../src/engine/occasionEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {HeartDemonChoice} from '../src/types/heartDemon';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualNativeHeartFrame,trialActor,trialActorId,trialTurn} from './heartDemonNativeFixture';
import {restoreLegacyExpeditionFixture} from './fixtures/legacyExpeditionFixture';

const choices=['sever','wrath','face'] as const;
const trusted='npc-2',repair='elder-taixu-1',outreach='npc-7';
const at=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const payload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'以可证实的眼下之事为准。',...fields});
const month=(world:WorldState,orders:Record<string,LLMDecisionPayload>={},model=false)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??payload('REST')])),()=>.8,'utility',undefined,
  model?{modelActors:new Set(Object.keys(orders))}:undefined);
const rescueTarget=(decision:LLMDecisionPayload|undefined)=>decision?.targetExpeditionRescueId;
const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'test',model:'fixture-heart'};
const response=(value:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));

function nativeSiblings():Array<{choice:HeartDemonChoice;world:WorldState}>{
  const {frame,trial}=actualNativeHeartFrame();
  const original=trialActor(frame);
  return choices.map(choice=>{
    const world=trialTurn(queueGuidedHeartDemonChoice(frame,original.id,trial.id,choice));
    expect(trialActor(world).heartDemonAftermath).toMatchObject({choice,outcome:'passed',resolvedTick:world.tick});
    expect(trialActor(world).tribulation?.heartDemon?.result).toMatchObject({choice,outcome:'passed',resolvedTick:world.tick});
    return {choice,world};
  });
}

/** A real present legacy-compatible gate; membership, gate entry and assistance receipts use native calls. */
function attachNativeRescue(world:WorldState){
  const ids=[trusted,'npc-5',outreach];
  const occasion=restoreLegacyExpeditionFixture(world);
  const join=payload('JOIN_OCCASION',{targetOccasionId:occasion.id});
  for(const id of [trialActorId,...ids])expect(joinOccasion(world,at(world,id),join)).not.toBeNull();
  world=month(month(month(world)));
  const running=world.occasions.find(row=>row.id===occasion.id)!;
  expect(running.status).toBe('running');
  const actor=trialActor(world);
  expect(actor.locationId).toBe(occasion.locationId);
  actor.hp=Math.floor(actor.maxHp*.91);
  actor.personality='刚正';
  actor.herbs.jade_leaf=3;
  for(const [index,id] of ids.entries()){
    const explorer=at(world,id);
    explorer.hp=Math.floor(explorer.maxHp*[.53,.62,.39][index]);
    const signal=resolveExpeditionRescueAction(world,explorer,payload('EXPEDITION_RESCUE',{
      rescueMove:'signal',targetOccasionId:occasion.id,
    }));
    expect(signal).toMatchObject({witnessScope:'participants'});
  }
  expect(world.expeditionRescues.requests).toHaveLength(3);
  for(const row of world.expeditionRescues.requests)expect(row.witnessIds).toContain(actor.id);
  return {world,signals:Object.fromEntries(world.expeditionRescues.requests.map(row=>[row.explorerId,row.id]))};
}

function prepareSocial(world:WorldState){
  const site=trialActor(world).locationId;
  const visitor=at(world,outreach);
  expect(visitor.locationId).not.toBe(site);
  const travel=payload('EXPLORE',{targetLocationId:site});
  world=month(world,{[outreach]:travel,[trusted]:travel});
  expect(at(world,outreach).locationId).toBe(site);
  expect(at(world,trusted).locationId).toBe(site);
  expect(at(world,repair).locationId).toBe(site);
  // Add a native modest genuine tie to distinguish a known repair partner from new company.
  world=month(world,{[repair]:payload('SOCIALIZE',{targetCultivatorId:trialActorId})});
  expect(world.events.some(row=>row.tick===world.tick&&row.actorIds[0]===repair&&row.actorIds[1]===trialActorId&&row.id.endsWith('-social'))).toBe(true);
  const actor=trialActor(world);
  actor.personality='痴情';
  actor.hp=actor.maxHp;
  return world;
}

afterEach(()=>vi.unstubAllGlobals());
describe('native heart aftermath only shapes real voluntary rescue and social targets',()=>{
  it('selects three different witnessed rescue targets from the same true native trial and same unchanged legal signals',async()=>{
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>response({}));
    vi.stubGlobal('fetch',mock);
    const favored=[trusted,'npc-5',outreach];
    const ordered:string[]=[];
    for(const [index,branch] of nativeSiblings().entries()){
      const {world,signals}=attachNativeRescue(branch.world);
      const actor=trialActor(world),expected=signals[favored[index]],tick=world.tick+1;
      expect(activeHeartDemonAftermath(world,actor,tick)?.choice).toBe(branch.choice);
      const native=availableExpeditionRescueActions(actor,world,tick);
      expect(native.filter(row=>row.rescueMove==='accept')).toHaveLength(3);
      expect(autonomousExpeditionRescueOptions(actor,world,tick)).toEqual([
        expect.objectContaining({rescueMove:'accept',targetExpeditionRescueId:expected}),
      ]);
      const atExecution=structuredClone(world);atExecution.tick++;
      expect(rescueTarget(utilityExpeditionRescueDecision(trialActor(atExecution),atExecution))).toBe(expected);
      const forbidden=native.find(row=>row.rescueMove==='accept'&&row.targetExpeditionRescueId!==expected)!;
      mock.mockImplementation(async()=>response({chosenAction:'EXPEDITION_RESCUE',rescueMove:'accept',
        targetExpeditionRescueId:forbidden.targetExpeditionRescueId}));
      await expect(requestCultivatorLLMDecision(actor,world,config,tick)).resolves.toBeUndefined();
      mock.mockImplementation(async(_url,init)=>{
        expect(init?.body).toContain(expected);
        expect(init?.body).not.toContain(forbidden.targetExpeditionRescueId!);
        expect(init?.body).not.toMatch(/heartDemonAftermath|幻境|斩断尘缘|以杀止杀|直面愧疚|记忆证词/);
        return response({chosenAction:'EXPEDITION_RESCUE',rescueMove:'accept',targetExpeditionRescueId:expected});
      });
      const choice=await requestCultivatorLLMDecision(actor,world,config,tick);
      expect(rescueTarget(choice)).toBe(expected);
      const accepted=month(world,{[actor.id]:choice!},true);
      expect(accepted.expeditionRescues.requests.find(row=>row.id===expected)).toMatchObject({
        acceptedTick:accepted.tick,rescuerId:actor.id,status:'extracting',supplySpent:1,
      });
      expect(trialActor(accepted).herbs.jade_leaf).toBe(actor.herbs.jade_leaf-1);
      ordered.push(expected);
    }
    expect(new Set(ordered).size).toBe(3);
  });

  it('offers an exact voluntary pause, never an acceptance, heal, or another person’s action',async()=>{
    const {world}=attachNativeRescue(nativeSiblings()[0].world);
    const actor=trialActor(world),tick=world.tick+1;
    expect(canPauseAftermathRescue(actor,world,tick)).toBe(true);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>
      response({chosenAction:'REST',targetCultivatorId:trusted}));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(actor,world,config,tick)).resolves.toBeUndefined();
    mock.mockImplementationOnce(async(_url,init)=>{
      expect(init?.body).toContain('不代签');
      return response({chosenAction:'REST'});
    });
    const wait=await requestCultivatorLLMDecision(actor,world,config,tick);
    expect(wait?.chosenAction).toBe('REST');
    const held=month(world,{[actor.id]:wait!},true);
    expect(held.expeditionRescues.requests.every(row=>row.acceptedTick===undefined)).toBe(true);
    expect(trialActor(held).herbs.jade_leaf).toBe(actor.herbs.jade_leaf);
    expect(trialActor(held).hp).toBe(actor.hp);
  });

  it('only changes the social target, uses the same bounded Civic and Utility target and keeps old choice/source out of both prompt paths',async()=>{
    const preferred=[trusted,repair,outreach];
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>response({}));
    vi.stubGlobal('fetch',mock);
    for(const [index,branch] of nativeSiblings().entries()){
      let world=prepareSocial(branch.world);
      world=month(world); // establish an actual preceding ordinary REST after trial, never a manufactured repetition record
      const actor=trialActor(world),expected=preferred[index],tick=world.tick+1;
      const ranked=rankOrdinaryIntents(world,actor);
      expect(ranked.some(row=>row.action==='SOCIALIZE'&&row.targetCultivatorId===expected)).toBe(true);
      expect(preferredOrdinarySocialIntent(world,actor,tick)).toMatchObject({action:'SOCIALIZE',targetCultivatorId:expected});
      const raw=structuredClone(world);
      const rawActor=trialActor(raw);
      delete rawActor.heartDemonAftermath;
      expect(rankOrdinaryIntents(raw,rawActor)).toEqual(ranked);
      expect(utilityRankedOrdinaryDecision(actor,world)).toMatchObject({chosenAction:'SOCIALIZE',targetCultivatorId:expected});
      expect(modelOrdinaryIntentOptions(world,actor,tick).filter(row=>row.action==='SOCIALIZE')).toEqual([
        expect.objectContaining({targetCultivatorId:expected}),
      ]);
      expect(sealedHeartDemonMemoryIds(actor).size).toBeGreaterThan(0);
      mock.mockImplementationOnce(async()=>response({chosenAction:'SOCIALIZE',targetCultivatorId:preferred[(index+1)%3]}));
      await expect(requestCultivatorLLMDecision(actor,world,config,tick)).resolves.toBeUndefined();
      mock.mockImplementationOnce(async(_url,init)=>{
        expect(init?.body).toContain('合法事务');
        expect(init?.body).not.toMatch(/heartDemonAftermath|幻境之中|斩断尘缘|以杀止杀|直面愧疚|照破心魔/);
        return response({chosenAction:'SOCIALIZE',targetCultivatorId:expected});
      });
      const actual=await requestCultivatorLLMDecision(actor,world,config,tick);
      expect(actual).toMatchObject({chosenAction:'SOCIALIZE',targetCultivatorId:expected});
      const settled=month(world,{[actor.id]:actual!},true);
      expect(settled.events.find(row=>row.id===`evt-${settled.tick}-${actor.id}-social`)?.actorIds).toEqual([actor.id,expected]);
    }
  });

  it('lets recovery and natural expiration rejoin baseline ordinary preference while preserving private old memories',()=>{
    let world=prepareSocial(nativeSiblings()[1].world);
    const older=trialActor(world),expiry=older.heartDemonAftermath!.endsTick;
    expect(preferredOrdinarySocialIntent(world,older,world.tick+1)?.targetCultivatorId).toBe(repair);
    while(world.tick<=expiry)world=month(world);
    const body=trialActor(world),baseline=structuredClone(world),control=trialActor(baseline);
    delete control.heartDemonAftermath;
    expect(preferredOrdinarySocialIntent(world,body,world.tick+1)).toBeUndefined();
    expect(modelOrdinaryIntentOptions(world,body,world.tick+1)).toEqual(modelOrdinaryIntentOptions(baseline,control,baseline.tick+1));
    expect(utilityRankedOrdinaryDecision(body,world)).toEqual(utilityRankedOrdinaryDecision(control,baseline));
    expect(sealedHeartDemonMemoryIds(body).size).toBeGreaterThan(0);
  });
});

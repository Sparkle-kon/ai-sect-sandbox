import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {resolveObservatoryAction} from '../src/engine/fieldObservatoryEngine';
import {advanceOccasions,joinOccasion} from '../src/engine/occasionEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import type {LLMConfig,LLMDecisionPayload} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'mock-only',model:'omen-fixture'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const reply=(payload:LLMDecisionPayload)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
function opened(){
  const world=createInitialWorld(2031),operator=world.cultivators.find(row=>row.id==='npc-2')!,observer=world.cultivators[0];
  const site=world.locations.find(row=>row.id==='loc-vein-north')!;
  expect(operator.locationId).toBe(site.id);
  observer.locationId=site.id;
  const fund:LLMDecisionPayload={chosenAction:'FIELD_OBSERVATORY',observatoryMove:'fund',innerMonologue:'付实物观象。'};
  expect(resolveObservatoryAction(world,operator,fund)).not.toBeNull();
  world.tick=world.month=3;
  expect(resolveObservatoryAction(world,operator,{...fund,observatoryMove:'measure',targetObservatoryTick:1})).not.toBeNull();
  world.tick=world.month=4;
  expect(advanceOccasions(world,()=>.99)[0]?.witnessScope).toBe('participants');
  const occasion=world.occasions[0];
  const choice:LLMDecisionPayload={chosenAction:'JOIN_OCCASION',targetOccasionId:occasion.id,innerMonologue:'只从亲见的门槛进入。'};
  return {world,operator,observer,occasion,choice};
}
function prompt(init:RequestInit){
  const payload=JSON.parse(String(init.body)) as {messages:{role:string;content:string}[]};
  return payload.messages.find(row=>row.role==='user')?.content??'';
}

describe('model and native expedition permission share the real local clue clock',()=>{
  it('forwards only the authorized actually measured local opportunity and admits the exact returned choice',async()=>{
    const {world,operator,occasion,choice}=opened();
    const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
      const text=prompt(init);
      expect(text).toContain(occasion.id);
      expect(text).toContain('"learnedTick":3');
      expect(text).toContain('"measuredTick":3');
      return reply(choice);
    });
    vi.stubGlobal('fetch',fetcher);
    const received=await requestCultivatorLLMDecision(operator,world,config,world.tick+1);
    expect(received).toMatchObject(choice);
    world.tick=world.month=5;
    expect(joinOccasion(world,operator,received!)).not.toBeNull();
    expect(occasion.participantIds).toEqual([operator.id]);
    expect(operator.locationId).toBe(occasion.anchorSiteId);
  });

  it('does not list the scoped gate for a same-place outsider or accept a guessed native join',async()=>{
    const {world,observer,occasion,choice}=opened();
    vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{
      const text=prompt(init);
      expect(text).not.toContain(occasion.id);
      expect(text).not.toContain(occasion.locationId);
      expect(text).not.toContain('"measuredTick":3');
      return reply(choice);
    }));
    expect(await requestCultivatorLLMDecision(observer,world,config,world.tick+1)).toBeUndefined();
    expect(joinOccasion(world,observer,choice)).toBeNull();
    expect(occasion.participantIds).toEqual([]);
  });
});

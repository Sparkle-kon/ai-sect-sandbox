import {afterEach,describe,expect,it,vi} from 'vitest';
import {queueGuidedHeartDemonChoice} from '../src/engine/heartDemonEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {hasOrdinaryIntentHistory,modelOrdinaryIntentOptions,preferredOrdinarySocialIntent} from '../src/engine/ordinaryIntentEngine';
import type {LLMConfig,LLMDecisionPayload} from '../src/types/world';
import {actualNativeHeartFrame,trialActor,trialTurn} from './heartDemonNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'sparse-choice'};
const modelOutput=(value:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
function exactSparseFixture(){
  const {frame,trial}=actualNativeHeartFrame();
  const result=trialTurn(queueGuidedHeartDemonChoice(frame,trialActor(frame).id,trial.id,'sever'));
  const world=trialTurn(trialTurn(result));
  const actor=trialActor(world);
  // Controlled omission of the unneeded recent ordinary-action stamp only. The aftermath is an authentic native result.
  delete actor.ordinaryActionEvidence;
  const executionTick=world.tick+1;
  const option=preferredOrdinarySocialIntent(world,actor,executionTick);
  if(!option?.targetCultivatorId)throw Error('Expected at least one real eligible local after the trial');
  return {world,actor,executionTick,option};
}
afterEach(()=>vi.unstubAllGlobals());

describe('ordinary admission when a surviving actor has no routine history',()=>{
  it('adds only that exact social option; leaves unrelated generic actions on legacy validation',async()=>{
    const {world,actor,executionTick,option}=exactSparseFixture();
    expect(hasOrdinaryIntentHistory(world,actor,executionTick)).toBe(false);
    expect(modelOrdinaryIntentOptions(world,actor,executionTick)).toEqual([option]);
    const mock=vi.fn(async (_url:RequestInfo|URL,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body)) as {messages:{content:string}[]};
      const line=body.messages.flatMap(row=>row.content.split('\n')).find(row=>row.includes('本月若自行选择交谈'));
      expect(line).toContain(JSON.stringify({chosenAction:'SOCIALIZE',targetCultivatorId:option.targetCultivatorId}));
      expect(line).not.toMatch(/CULTIVATE|REST|EXPLORE|GATHER_HERBS|幻境|心魔/);
      expect(body.messages.map(row=>row.content).join('')).not.toContain('可从实际可执行的日常选项');
      return modelOutput({chosenAction:'SOCIALIZE',targetCultivatorId:option.targetCultivatorId});
    });
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(actor,world,config,executionTick)).resolves.toMatchObject({
      chosenAction:'SOCIALIZE',targetCultivatorId:option.targetCultivatorId,
    });
    for(const chosenAction of ['REST','CULTIVATE'] as const){
      mock.mockResolvedValueOnce(modelOutput({chosenAction}));
      await expect(requestCultivatorLLMDecision(actor,world,config,executionTick)).resolves.toMatchObject({chosenAction});
    }
  });

  it('rechecks the exact original preference and currently co-located authority at decode',async()=>{
    const {world,actor,executionTick,option}=exactSparseFixture();
    const invalid:LLMDecisionPayload={chosenAction:'SOCIALIZE',targetCultivatorId:actor.id,innerMonologue:'静候。'};
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>modelOutput(invalid));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(actor,world,config,executionTick)).resolves.toBeUndefined();
    mock.mockResolvedValueOnce(modelOutput({chosenAction:'SOCIALIZE',targetCultivatorId:option.targetCultivatorId,
      targetExpeditionRescueId:'unauthorized-other-lane'}));
    await expect(requestCultivatorLLMDecision(actor,world,config,executionTick)).resolves.toBeUndefined();
    mock.mockImplementationOnce(async()=>{
      const target=world.cultivators.find(row=>row.id===option.targetCultivatorId)!;
      target.locationId=world.locations.find(row=>row.id!==actor.locationId)!.id;
      return modelOutput({chosenAction:'SOCIALIZE',targetCultivatorId:option.targetCultivatorId});
    });
    await expect(requestCultivatorLLMDecision(actor,world,config,executionTick)).resolves.toBeUndefined();
  });
});

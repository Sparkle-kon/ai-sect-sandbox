import {afterEach,describe,expect,it,vi} from 'vitest';
import {resolveGuidedWorldTurn} from '../src/controllers/guidedWorldTurn';
import {availableCampaignAssemblyActions} from '../src/engine/campaignAssembly';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {modelDecisionCandidates} from '../src/engine/modelDecisionTurn';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';
import {actualGrandSiege,commander,siegeActor} from './grandSiegeNativeFixture';

const REST:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'留待本月军情，不作其他承诺。'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('native same-campaign orders are branch-specific, not permission to negotiate for the other sect',()=>{
  it('runs a real field offer through the strict Cognitive menu and keeps the original defensible siege separate',async()=>{
    const {arrived,siege}=actualGrandSiege(1);
    const body=siegeActor(arrived,commander);
    const native=availableCampaignAssemblyActions(body,arrived).find(row=>row.kind==='negotiate'&&row.command.ceasefireMove==='offer')!;
    expect(native?.command).toMatchObject({chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:'sect-bloodmoon'});
    expect(modelDecisionCandidates(arrived)).toContain(body);
    const order={kind:'campaign-assembly',world:arrived,branchId:'march-native',revision:5,actorId:commander,option:native} as const;
    expect(resolveGuidedWorldTurn(order,arrived,'other',5)).toBeUndefined();
    expect(resolveGuidedWorldTurn(order,arrived,'march-native',6)).toBeUndefined();
    expect(resolveGuidedWorldTurn(order,{...arrived},'march-native',5)).toBeUndefined();
    expect(resolveGuidedWorldTurn(order,arrived,'march-native',5)?.decision).toMatchObject({
      ...native.command,targetCampaignAssemblySiegeId:siege.id,
    });
    const read=async(raw:object)=>{
      llmScheduler.resetTickBudget();
      const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]})));
      vi.stubGlobal('fetch',fetch);
      return requestCultivatorLLMDecision(body,arrived,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'test-only',model:'test-only'},arrived.tick+1);
    };
    expect(await read({...native.command,outcome:'victory'})).toBeUndefined();
    expect(await read({...native.command,targetCampaignAssemblySiegeId:siege.id})).toBeUndefined();
    const cognitive=await read(native.command);
    expect(cognitive).toMatchObject({...native.command,targetCampaignAssemblySiegeId:siege.id});
    const supplied=Object.fromEntries(arrived.cultivators.map(who=>[who.id,who.id===commander?cognitive!:REST]));
    const next=advanceWorldTick(arrived,supplied,()=>.5,'deferred',undefined,{modelActors:new Set([commander])});
    expect(next.ceasefires.agreements).toContainEqual(expect.objectContaining({proposerId:commander,status:'offered'}));
    expect(next.ceasefires.agreements.some(row=>row.status==='active')).toBe(false);
    expect(arrived.ceasefires.agreements).toEqual([]);
  });
});

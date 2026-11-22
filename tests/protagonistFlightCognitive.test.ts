import {afterEach,describe,expect,it,vi} from 'vitest';
import {resolveGuidedProtagonistFlightTurn} from '../src/controllers/guidedProtagonistFlightTurn';
import {possessAvatar} from '../src/engine/avatarEngine';
import {llmScheduler} from '../src/engine/llmScheduler';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {modelDecisionCandidates} from '../src/engine/modelDecisionTurn';
import {availableProtagonistFlightActions} from '../src/engine/protagonistFlightEngine';
import {protagonistFlightCommand} from '../src/engine/protagonistFlightCognition';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';
import {action,actualFlight,body,guideId,hunterId,leadId,own} from './protagonistFlightNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://flight.invalid/v1',apiKey:'mock',model:'mock'};
const reply=(content:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));
const advanceOption=(world:WorldState)=>availableProtagonistFlightActions(body(world),world).find(row=>
  row.pilgrimageMove==='advance'&&row.targetRoadId===undefined);
const month=(world:WorldState,decision?:LLMDecisionPayload,applied?: (id:string,value:boolean)=>void)=>{
  const others=Object.fromEntries(world.cultivators.filter(row=>row.id!==leadId).map(row=>[row.id,action('REST')]));
  return advanceWorldTick(world,decision?{...others,[leadId]:decision}:others,()=>.1,decision?'deferred':'utility',
    applied,{modelActors:new Set(decision?[leadId]:[])});
};

afterEach(()=>vi.unstubAllGlobals());

describe('the same native passage in offline Utility and Cognitive JSON',()=>{
  it('settles actual identical monthly route, cost and receipts without sharing participants or geography with the provider',async()=>{
    const {pursuit}=actualFlight();
    let online=pursuit,offline=structuredClone(pursuit);
    const calls:string[]=[];
    const fetch=vi.fn(async (_url:RequestInfo|URL,init?:RequestInit)=>{
      calls.push((JSON.parse(String(init?.body)) as {messages:{content:string}[]}).messages.at(-1)!.content);
      return reply(protagonistFlightCommand(advanceOption(online)!));
    });
    vi.stubGlobal('fetch',fetch);
    for(let i=0;i<2;i++){
      const actor=body(online),candidate=advanceOption(online);
      expect(candidate).toBeDefined();
      expect(modelDecisionCandidates(online)).toContain(actor);
      llmScheduler.resetTickBudget();
      const order=await requestCultivatorLLMDecision(actor,online,config,online.tick+1);
      expect(order).toMatchObject(protagonistFlightCommand(candidate!));
      const applied=vi.fn();
      online=month(online,order,applied);offline=month(offline);
      expect(applied).toHaveBeenCalledWith(leadId,true);
      expect(online.decisionTrace.records.find(row=>row.actorId===leadId&&row.tick===online.tick))
        .toMatchObject({source:'model',chosenAction:'redacted',candidates:[]});
      expect(online.protagonistFlights).toEqual(offline.protagonistFlights);
      expect(online.pilgrimages).toEqual(offline.pilgrimages);
      expect(body(online).spiritStones).toBe(body(offline).spiritStones);
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls.every(prompt=>prompt.includes('真实逃亡')&&[leadId,guideId,hunterId,'loc-danxia','"points"'].every(field=>!prompt.includes(field)))).toBe(true);
    expect(own(month(online))).toMatchObject({status:'reached',rounds:[{round:1},{round:2},{round:3}]});
  });

  it('rejects forged or stale commands and will not reserve a provider turn for the embodied protagonist',async()=>{
    const {pursuit}=actualFlight(),actor=body(pursuit),exact=protagonistFlightCommand(advanceOption(pursuit)!);
    for(const forged of [
      {...exact,points:[{x:10,y:10}]},{...exact,targetRoadId:'fake-paid-road'},{...exact,outcome:'safe'},
      {...exact,targetPilgrimageId:'other'},{...exact,targetCultivatorId:guideId},{chosenAction:'REST'},
    ]){
      vi.stubGlobal('fetch',vi.fn(async()=>reply(forged)));
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(actor,pursuit,config,pursuit.tick+1)).resolves.toBeUndefined();
    }
    vi.stubGlobal('fetch',vi.fn(async()=>{
      expect(possessAvatar(pursuit,leadId)).toBe(true);
      return reply(exact);
    }));
    llmScheduler.resetTickBudget();
    await expect(requestCultivatorLLMDecision(actor,pursuit,config,pursuit.tick+1)).resolves.toBeUndefined();
    expect(modelDecisionCandidates(pursuit)).not.toContain(actor);
    const provider=vi.fn(async()=>reply(exact));
    vi.stubGlobal('fetch',provider);
    await expect(requestCultivatorLLMDecision(actor,pursuit,config,pursuit.tick+1)).resolves.toBeUndefined();
    expect(provider).not.toHaveBeenCalled();
  });

  it('requires a real guided choice to take an embodied step and rejects the same control after its round',()=>{
    const {pursuit}=actualFlight();
    expect(possessAvatar(pursuit,leadId)).toBe(true);
    const view=own(pursuit)!;
    const order={kind:'protagonist-flight' as const,world:pursuit,branchId:'source',revision:4,actorId:leadId,
      flightId:view.id,round:1 as const,option:advanceOption(pursuit)!};
    expect(resolveGuidedProtagonistFlightTurn(order,pursuit,'sibling',4)).toBeUndefined();
    const selected=resolveGuidedProtagonistFlightTurn(order,pursuit,'source',4);
    expect(selected).toBeDefined();
    const quiet=month(pursuit);
    expect(own(quiet)?.rounds[0]).toMatchObject({outcome:'held',points:[]});
    const guided=advanceWorldTick(pursuit,Object.fromEntries(pursuit.cultivators.map(actor=>
      [actor.id,actor.id===selected?.actorId?selected.decision:action('REST')])),()=>.1);
    expect(own(guided)?.rounds[0]?.points.length).toBeGreaterThan(1);
    expect(resolveGuidedProtagonistFlightTurn(order,guided,'source',4)).toBeUndefined();
  });
});

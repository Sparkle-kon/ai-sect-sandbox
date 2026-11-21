import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { OBSERVATORY_COST } from '../src/engine/fieldObservatoryEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';
import { measuredAlignedWeather, offeredAlignedWeather, paidReading, weatherCompare, weatherPayload, weatherPerson, weatherTurn }
  from './fixtures/alignedWeatherFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-aligned-weather'};
const respond=(payload:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('both brains use independently measured observation receipts',()=>{
  it('offers without seeing whether the nominated peer has a report, and refuses forged observed values or dates',async()=>{
    const f=measuredAlignedWeather(false,'absent');
    const {world,siteId,peerId,outsiderId,openedTick}=f;
    const proposer=weatherPerson(world,f.proposerId);
    const peer=weatherPerson(world,peerId);
    const proposal=weatherPayload('ALIGNED_WEATHER',{alignedWeatherMove:'offer',targetLocationId:siteId,
      targetCultivatorId:peerId,targetObservatoryTick:openedTick});
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(proposal));
    vi.stubGlobal('fetch',mock);
    expect(world.fieldObservatories.byActor[peer.id]).toBeUndefined();
    await expect(requestCultivatorLLMDecision(proposer,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(weatherPerson(world,outsiderId),world,config,world.tick+1)).resolves.toBeUndefined();
    for(const extra of [{targetAlignedWeatherId:'invented'},{targetObservatoryTick:openedTick+1},{targetLocationId:'loc-market-east'},
      {observerBReading:{intensity:.8}},{observatoryStation:'edge'},{outcome:'agrees'},{spokenLine:'我已知对面读数'}]){
      mock.mockImplementation(async()=>respond({...proposal,...extra}));
      await expect(requestCultivatorLLMDecision(proposer,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(proposal));
    const approved=await requestCultivatorLLMDecision(proposer,world,config,world.tick+1);
    expect(approved).toEqual(proposal);
    const prompt=mock.mock.calls.at(-1)?.[1]?.body;
    expect(prompt).toContain('同刻异读只复制本人实际许可');
    expect(prompt).not.toContain('observerBReading');
    world.tick++;
    expect(applyCultivatorBrainDecision(world,proposer,approved!,()=>.99)).not.toBeNull();
    const row=world.alignedWeather.comparisons[0];
    expect(row).toMatchObject({status:'offered',observerBId:peer.id});
    expect(row.second).toBeUndefined();
    mock.mockImplementation(async()=>respond(weatherCompare(row.id,openedTick)));
    await expect(requestCultivatorLLMDecision(peer,world,config,world.tick+1)).resolves.toBeUndefined();
  });

  it('uses a real independent site/time pair and marks actual disagreement uncertain without overwriting either reading',async()=>{
    const f=offeredAlignedWeather(true),{world}=f;
    const peer=weatherPerson(world,f.peerId);
    const proposer=weatherPerson(world,f.proposerId);
    const outsider=weatherPerson(world,f.outsiderId);
    peer.qiProgress=20;
    const target=weatherCompare(f.id,f.openedTick);
    const mock=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>respond(target));
    vi.stubGlobal('fetch',mock);
    const original=structuredClone(world.fieldObservatories);
    await expect(requestCultivatorLLMDecision(peer,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(proposer,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain(f.id);
    for(const extra of [{targetLocationId:f.siteId},{targetCultivatorId:proposer.id},{targetAlignedWeatherId:'unknown'},
      {targetObservatoryTick:f.openedTick+2},{amendReading:true},{x:478,y:222}]){
      mock.mockImplementation(async()=>respond({...target,...extra}));
      await expect(requestCultivatorLLMDecision(peer,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async()=>respond(target));
    const actual=await requestCultivatorLLMDecision(peer,world,config,world.tick+1);
    expect(actual).toEqual(target);
    const body=JSON.parse(String(mock.mock.calls.at(-1)?.[1]?.body)) as {messages:Array<{content:string}>};
    const line=body.messages.flatMap(({content})=>content.split('\n')).find(row=>row.startsWith('- 同刻异读'));
    expect(line).toContain(f.id);
    expect(line).not.toContain(proposer.id); // Never sees the first observer's private reading in the comparison menu.
    expect(line).not.toContain('intensity');
    expect(line).not.toContain('reading');
    world.tick++;
    expect(computeHeuristicDecision(peer,world,()=>.99)).toMatchObject({...target,innerMonologue:expect.any(String)});
    peer.locationId='loc-market-east';
    expect(applyCultivatorBrainDecision(world,peer,actual!,()=>.99)).toBeNull();
    peer.locationId=f.siteId;
    expect(applyCultivatorBrainDecision(world,peer,actual!,()=>.99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world,peer,actual!,()=>.99)).toBeNull();
    expect(world.alignedWeather.comparisons[0]).toMatchObject({status:'compared',outcome:'uncertain'});
    expect(world.fieldObservatories).toEqual(original);
    expect(recordDecisionTrace(world,peer.id,legalTraceCandidates(world,peer),actual!,'model',true)).toMatchObject({chosenAction:'redacted'});
  });

  it('limits a shared Utility funding date to two distinct real stations and models edge only on fund',async()=>{
    const world=createInitialWorld(149);
    world.tick=53;world.month=7;
    const siteId='loc-market';
    const candidates=world.cultivators.filter(actor=>/^npc-\d+$/.test(actor.id)&&!world.sects.some(sect=>sect.leaderId===actor.id)).slice(0,3);
    expect(candidates).toHaveLength(3);
    for(const actor of world.cultivators)actor.locationId='loc-market-east';
    for(const actor of candidates){
      actor.locationId=siteId;actor.guardAssignment=undefined;actor.personality='苟道';
      actor.hp=actor.maxHp;actor.qiProgress=20;actor.spiritStones=100;actor.techniqueMastery=0;
      actor.herbs.jade_leaf=3;actor.tribulation=undefined;
    }
    const [first,second,third]=candidates;
    const earlierBystander=weatherPerson(world,'npc-1');
    earlierBystander.locationId=siteId;
    earlierBystander.spiritStones=0; // Physically legitimate peer, but no actual edge instrument.
    const opened=world.tick;
    const edge=weatherPayload('FIELD_OBSERVATORY',{observatoryMove:'fund',targetLocationId:siteId,observatoryStation:'edge'});
    const mock=vi.fn(async()=>respond({...edge,observatoryStation:'center'}));
    vi.stubGlobal('fetch',mock);
    await expect(requestCultivatorLLMDecision(second,world,config,world.tick)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(edge));
    const authorized=await requestCultivatorLLMDecision(second,world,config,world.tick);
    expect(authorized).toMatchObject(edge);
    const c=computeHeuristicDecision(first,world,()=>.99);
    expect(c).toMatchObject({chosenAction:'FIELD_OBSERVATORY',observatoryMove:'fund',targetLocationId:siteId});
    expect(c.observatoryStation).toBeUndefined();
    expect(applyCultivatorBrainDecision(world,first,c,()=>.99)).not.toBeNull();
    const d=computeHeuristicDecision(second,world,()=>.99);
    expect(d).toMatchObject({chosenAction:'FIELD_OBSERVATORY',observatoryMove:'fund',observatoryStation:'edge'});
    expect(applyCultivatorBrainDecision(world,second,authorized!,()=>.99)).not.toBeNull();
    expect(computeHeuristicDecision(third,world,()=>.99).observatoryMove).not.toBe('fund');
    expect(first.spiritStones).toBe(100-OBSERVATORY_COST);
    expect(second.spiritStones).toBe(100-OBSERVATORY_COST);
    expect(third.spiritStones).toBe(100);
    expect(paidReading(world,first.id,world.tick).station).toBeUndefined();
    expect(paidReading(world,second.id,world.tick).station).toMatchObject({kind:'edge', x:expect.any(Number), y:expect.any(Number)});
    world.tick++;
    const measure=weatherPayload('FIELD_OBSERVATORY',{observatoryMove:'measure',targetLocationId:siteId,targetObservatoryTick:world.tick-1});
    mock.mockImplementation(async()=>respond({...measure,observatoryStation:'edge'}));
    await expect(requestCultivatorLLMDecision(second,world,config,world.tick+1)).resolves.toBeUndefined();
    mock.mockImplementation(async()=>respond(measure));
    await expect(requestCultivatorLLMDecision(second,world,config,world.tick+1)).resolves.toMatchObject(measure);
    const read=weatherTurn(world,{[first.id]:measure,[second.id]:measure});
    expect(paidReading(read,first.id,opened).status).toBe('measured');
    expect(paidReading(read,second.id,opened).status).toBe('measured');
    const comparedAt=weatherTurn(read);
    const center=weatherPerson(comparedAt,first.id);
    expect(computeHeuristicDecision(center,comparedAt,()=>.99)).toMatchObject({
      chosenAction:'ALIGNED_WEATHER',alignedWeatherMove:'offer',targetCultivatorId:second.id,targetObservatoryTick:opened,
    });
  });
});

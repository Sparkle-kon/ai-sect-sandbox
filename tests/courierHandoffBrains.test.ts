import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {computeHeuristicDecision, queryCultivatorLLMDecision, requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {modelDecisionCandidates} from '../src/engine/modelDecisionTurn';
import {availableCourierHandoffActions} from '../src/engine/sealedCourierEngine';
import type {LLMConfig, LLMDecisionPayload} from '../src/types/world';
import {arrivedCourierHandoff, handoffPerson, handoffSite, handoffTurn, nativeCourierHandoffRoute, offeredCourierHandoff}
  from './fixtures/courierHandoffFixture';

const config: LLMConfig = {enabled: true, apiBaseUrl:'https://provider.invalid/v1', apiKey:'mock', model:'mock'};
const reply = (decision: object) => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(decision)}}]}));
function mockProvider(decision: object) {
  const transport = vi.fn(async (_url: RequestInfo|URL, _init?: RequestInit) => reply(decision));
  vi.stubGlobal('fetch', transport);
  const sent = () => JSON.parse(String(transport.mock.calls.at(-1)?.[1]?.body)) as
    {messages: {content:string}[]; max_tokens:number};
  return {transport, sent};
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => {vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('two independent AI actors only at an actual sealed courier post', () => {
  it('offers the carrying actor one minimal fair-scheduled request only for the genuine next turn', async () => {
    const enRoute = nativeCourierHandoffRoute();
    const f = arrivedCourierHandoff(), {world} = f, actor = handoffPerson(world,f.originalId);
    const beforeRng = world.random.state;
    expect(modelDecisionCandidates(enRoute.world).map(({id})=>id)).not.toContain(enRoute.originalId);
    expect(modelDecisionCandidates(world).map(({id})=>id)).toContain(actor.id);
    const option = {chosenAction:'COURIER_HANDOFF',courierHandoffMove:'offer',targetDispatchId:f.id,targetCourierId:f.newId} as const;
    const {transport,sent} = mockProvider(option);
    const onStart = vi.fn();
    await expect(requestCultivatorLLMDecision(handoffPerson(enRoute.world,enRoute.originalId),enRoute.world,config,enRoute.world.tick+1,
      {onStart})).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick,{onStart})).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+2,{onStart})).resolves.toBeUndefined();
    expect(onStart).not.toHaveBeenCalled();
    const decision = await requestCultivatorLLMDecision(actor,world,config,world.tick+1,{onStart});
    expect(decision).toMatchObject(option);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(world.random.state).toBe(beforeRng);
    expect(sent().max_tokens).toBe(150);
    const prompt = sent().messages.map(({content})=>content).join('\n');
    expect(prompt).toContain(JSON.stringify({targetDispatchId:f.id,targetCourierId:f.newId}));
    for (const privateValue of [actor.name,handoffPerson(world,f.recipientId).name,handoffSite(world,f.originId).name,
      handoffSite(world,f.postId).name,handoffSite(world,f.destinationId).name,'offer_relief','自身状态','pathIndex']) {
      expect(prompt).not.toContain(privateValue);
    }
    const next = handoffTurn(world,{[actor.id]:decision!});
    expect(next.couriers.dispatches).toHaveLength(1);
    expect(next.couriers.dispatches[0]).toMatchObject({courierId:actor.id,status:'in_transit',
      handoff:{status:'offered',candidateId:f.newId,offeredTick:next.tick}});
    expect(modelDecisionCandidates(next).map(({id})=>id)).not.toContain(actor.id);
  });

  it('rejects an active carrier’s other action, invented choice or attached fields; Utility uses the actual same option', async () => {
    const f = arrivedCourierHandoff(), {world} = f, actor = handoffPerson(world,f.originalId);
    const option = {chosenAction:'COURIER_HANDOFF',courierHandoffMove:'offer',targetDispatchId:f.id,targetCourierId:f.newId};
    const {transport} = mockProvider({chosenAction:'CULTIVATE'});
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toBeUndefined();
    transport.mockResolvedValueOnce(reply({...option,targetCourierId:f.outsiderId}));
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toBeUndefined();
    transport.mockResolvedValueOnce(reply({...option,targetLocationId:f.originId}));
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toBeUndefined();
    const source = vi.fn();
    const planned = await queryCultivatorLLMDecision(actor,world,{...config,enabled:false},source,world.tick+1);
    expect(planned).toMatchObject(option);
    expect(source).toHaveBeenCalledWith('utility');
    expect(computeHeuristicDecision(actor,world)).toMatchObject({chosenAction:'REST'});

    const earlierCursor = world.couriers.dispatches[0].pathIndex;
    const stationary = handoffTurn(world);
    const held = handoffPerson(stationary,actor.id);
    expect(stationary.couriers.dispatches[0].pathIndex).toBe(earlierCursor);
    expect(computeHeuristicDecision(held,stationary)).toMatchObject(option);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('only the distinct invited actor can choose the exact next-date accept; one packet and deadline stay unchanged', async () => {
    const f = offeredCourierHandoff(), {world} = f, invitee = handoffPerson(world,f.newId);
    const outsider = handoffPerson(world,f.outsiderId), row = world.couriers.dispatches[0];
    const option = {chosenAction:'COURIER_HANDOFF',courierHandoffMove:'accept',targetDispatchId:f.id} as const;
    const {transport,sent} = mockProvider(option);
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(invitee,world,config,world.tick)).resolves.toBeUndefined();
    const accepted = await requestCultivatorLLMDecision(invitee,world,config,world.tick+1);
    expect(accepted).toMatchObject(option);
    const promptLine = sent().messages[1].content.split('\n').find(line=>line.includes('驿站转接只复制'))!;
    expect(promptLine).toContain(JSON.stringify({courierHandoffMove:'accept',targetDispatchId:f.id}));
    for (const privateValue of ['offer_relief','targetCourierId','pathIndex',handoffPerson(world,f.recipientId).name])
      expect(promptLine).not.toContain(privateValue);
    transport.mockResolvedValueOnce(reply({...option,targetCourierId:f.newId}));
    await expect(requestCultivatorLLMDecision(invitee,world,config,world.tick+1)).resolves.toBeUndefined();
    expect(availableCourierHandoffActions(invitee,world)).toEqual([]);

    const next = handoffTurn(world,{[invitee.id]:accepted as LLMDecisionPayload});
    expect(next.couriers.dispatches).toHaveLength(1);
    expect(next.couriers.dispatches[0]).toMatchObject({id:f.id,courierId:f.newId,sealed:row.sealed,
      deadlineTick:row.deadlineTick,feePaid:row.feePaid,status:'in_transit',handoff:{status:'transferred'}});
  });
});

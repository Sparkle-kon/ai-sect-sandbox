import { afterEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';
import { mealActor, mealGuest, mealHost, mealMonth, mealOutsider, pairedMealPilgrims } from './waypostMealNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-waypost' };
const response = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
const proposal: LLMDecisionPayload = { chosenAction: 'WAYPOST_MEAL', waypostMealMove: 'offer',
  targetCultivatorId: mealGuest, innerMonologue: '请亲到这里的另一队分茶。' };
afterEach(() => vi.unstubAllGlobals());

describe('waypost actions pass through the existing restricted travelling brain', () => {
  it('uses only the offered exact traveller and original checkpoint, never model-set payment, movement or recovery', async () => {
    const { world } = pairedMealPilgrims();
    const host = mealActor(world, mealHost), guest = mealActor(world, mealGuest);
    const model = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(proposal));
    vi.stubGlobal('fetch', model);
    await expect(requestCultivatorLLMDecision(mealActor(world, mealOutsider), world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const injected of [
      { targetCultivatorId: host.id }, { targetCultivatorId: mealOutsider }, { targetWaypostMealId: 'forged' },
      { recovery: [{ actorId: guest.id, afterHp: 50 }] }, { point: { x: 4, y: 8 } }, { spentLeaves: 0 },
      { targetPilgrimageId: 'false-route' }, { spokenLine: '替另一队答应' },
    ]) {
      model.mockImplementation(async () => response({ ...proposal, ...injected }));
      await expect(requestCultivatorLLMDecision(host, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    model.mockImplementation(async () => response(proposal));
    const offer = await requestCultivatorLLMDecision(host, world, config, world.tick + 1);
    expect(offer).toEqual(proposal);
    expect(model.mock.calls.at(-1)?.[1]?.body).toContain('实到同一个关口才可改选 WAYPOST_MEAL');
    const offered = mealMonth(world, { [mealHost]: offer! });
    expect(offered.waypostMeals?.meals[0]).toMatchObject({ status: 'offered', escrowLeaves: 1 });
    const id = offered.waypostMeals!.meals[0].id;
    const reply: LLMDecisionPayload = { chosenAction: 'WAYPOST_MEAL', waypostMealMove: 'accept', targetWaypostMealId: id,
      innerMonologue: '脚下是真关口。' };
    model.mockImplementation(async () => response(reply));
    await expect(requestCultivatorLLMDecision(mealActor(offered, mealGuest), offered, config, offered.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(mealActor(offered, mealHost), offered, config, offered.tick + 1)).resolves.toBeUndefined();
    const exact = await requestCultivatorLLMDecision(mealActor(offered, mealGuest), offered, config, offered.tick + 1);
    expect(exact).toEqual(reply);
    const ready = mealMonth(offered);
    const responder = mealActor(ready, mealGuest);
    responder.personality = '苟道';
    expect(computeHeuristicDecision(responder, ready, () => .99)).toMatchObject({
      chosenAction: 'WAYPOST_MEAL', waypostMealMove: 'accept', targetWaypostMealId: id,
    });
    expect(applyCultivatorBrainDecision(ready, responder, exact!, () => .99)).not.toBeNull();
    expect(ready.waypostMeals!.meals[0]).toMatchObject({ status: 'served', spentLeaves: 1, returnedLeaves: 0 });
    expect(ready.pilgrimages.journeys).toEqual(offered.pilgrimages.journeys);
  });

  it('does not fill a possessed host’s invitation using Utility or provider JSON', async () => {
    const initial = pairedMealPilgrims().world;
    const world = mealMonth(initial);
    const host = mealActor(world, mealHost);
    host.personality = '逍遥';
    expect(possessAvatar(world, mealHost)).toBeTruthy();
    vi.stubGlobal('fetch', vi.fn(async () => response(proposal)));
    await expect(requestCultivatorLLMDecision(host, world, config, world.tick)).resolves.toBeUndefined();
    expect(computeHeuristicDecision(host, world, () => .99).chosenAction).not.toBe('WAYPOST_MEAL');
    expect(applyCultivatorBrainDecision(world, host, proposal, () => .99)).toBeNull();
    expect(world.waypostMeals).toBeUndefined();
  });
});

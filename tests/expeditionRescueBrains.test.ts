import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableExpeditionRescueActions, EXPEDITION_RESCUE_HERB } from '../src/engine/expeditionRescueEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision, utilityExpeditionRescueDecision } from '../src/engine/llmBrain';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { advanceOccasions, joinOccasion } from '../src/engine/occasionEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-rescue' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(601);
  const [explorer, rescuer, distant] = world.cultivators;
  const market = world.locations.find(({ type }) => type === 'market')!;
  const elsewhere = world.locations.find(({ id }) => id === 'loc-taixu')!;
  for (const actor of world.cultivators) actor.locationId = elsewhere.id;
  rescuer.locationId = market.id;
  rescuer.herbs[EXPEDITION_RESCUE_HERB] = 2;
  rescuer.hp = rescuer.maxHp;
  rescuer.personality = '刚正';
  world.tick = 60;
  advanceOccasions(world, () => .8);
  const occasion = world.occasions[0];
  expect(occasion?.kind).toBe('expedition');
  expect(joinOccasion(world, explorer, { chosenAction: 'JOIN_OCCASION', targetOccasionId: occasion.id, innerMonologue: '' })).not.toBeNull();
  expect(joinOccasion(world, rescuer, { chosenAction: 'JOIN_OCCASION', targetOccasionId: occasion.id, innerMonologue: '' })).not.toBeNull();
  world.tick = occasion.registrationClosesTick;
  advanceOccasions(world, () => .8);
  expect(occasion.status).toBe('running');
  explorer.hp = Math.floor(explorer.maxHp * .5);
  const apply = (actor: Cultivator, payload: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, payload, () => .99);
  return { world, explorer, rescuer, distant, occasion, market, apply };
}

describe('actual expedition rescue choices in both brains', () => {
  it('limits a trapped explorer to witnessed real assistance; rejects invented destinations and ordinary actions in focus', async () => {
    const { world, explorer, rescuer, distant, occasion, apply } = fixture();
    const signal = { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'signal', targetOccasionId: occasion.id, innerMonologue: '请在场者相助。' } as const;
    const rule = utilityExpeditionRescueDecision(explorer, world);
    expect(rule).toMatchObject({ chosenAction: signal.chosenAction, rescueMove: signal.rescueMove, targetOccasionId: occasion.id });
    expect(computeHeuristicDecision(explorer, world, () => .5).chosenAction).toBe('EXPEDITION_RESCUE');
    expect(modelDecisionCandidates(world)).toContain(explorer);
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond({ ...signal, targetOccasionId: 'invented' }));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(explorer, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond({ ...signal, route: [{ x: 5, y: 10 }] }));
    await expect(requestCultivatorLLMDecision(explorer, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond({ chosenAction: 'REST', innerMonologue: '' }));
    await expect(requestCultivatorLLMDecision(explorer, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond(signal));
    const allowed = await requestCultivatorLLMDecision(explorer, world, config, world.tick + 1);
    expect(allowed).toMatchObject(signal);
    expect(mock.mock.calls[3][1]?.body).toContain('你是修仙沙盒中参与秘境求援的修士');
    expect(mock.mock.calls[3][1]?.body).not.toContain('秘密执念');
    world.tick++;
    expect(apply(explorer, allowed!)).not.toBeNull();
    const request = world.expeditionRescues.requests[0];
    expect(request.witnessIds).toContain(rescuer.id);
    expect(request.witnessIds).not.toContain(distant.id);
    expect(availableExpeditionRescueActions(distant, world)).toEqual([]);
    expect(explorer.locationId).toBe(occasion.locationId);
  });

  it('routes only a funded witnessed acceptance, copies no loot, and does not invent a post-acceptance withdrawal', async () => {
    const { world, explorer, rescuer, distant, occasion, market, apply } = fixture();
    const want = utilityExpeditionRescueDecision(explorer, world)!;
    expect(apply(explorer, want)).not.toBeNull();
    const record = world.expeditionRescues.requests[0];
    expect(record.status).toBe('signaled');
    const lootBefore = explorer.artifacts.map(({ id }) => id);
    world.tick++;
    rescuer.herbs[EXPEDITION_RESCUE_HERB] = 0;
    expect(utilityExpeditionRescueDecision(rescuer, world)).toBeUndefined();
    rescuer.herbs[EXPEDITION_RESCUE_HERB] = 2;
    const choice = utilityExpeditionRescueDecision(rescuer, world);
    expect(choice).toMatchObject({ chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'accept', targetExpeditionRescueId: record.id });
    const accept = { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'accept', targetExpeditionRescueId: record.id, innerMonologue: '本人愿意。' } as const;
    const mocked = vi.fn(async () => respond({ ...accept, supplySpent: 0 }));
    vi.stubGlobal('fetch', mocked);
    await expect(requestCultivatorLLMDecision(rescuer, world, config, world.tick)).resolves.toBeUndefined();
    mocked.mockImplementation(async () => respond(accept));
    await expect(requestCultivatorLLMDecision(distant, world, config, world.tick)).resolves.toBeUndefined();
    const actual = await requestCultivatorLLMDecision(rescuer, world, config, world.tick);
    expect(actual).toMatchObject(accept);
    expect(apply(rescuer, actual!)).not.toBeNull();
    expect(record.status).toBe('extracting');
    expect(rescuer.herbs[EXPEDITION_RESCUE_HERB]).toBe(1);
    expect(explorer.locationId).toBe(occasion.locationId);
    expect(explorer.artifacts.map(({ id }) => id)).toEqual(lootBefore);
    expect(record.exitSiteId).toBe(market.id);
    world.tick++;
    rescuer.hp = Math.floor(rescuer.maxHp * .3);
    expect(utilityExpeditionRescueDecision(rescuer, world)).toBeUndefined();
    expect(apply(rescuer, { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'withdraw',
      targetExpeditionRescueId: record.id, innerMonologue: '' })).toBeNull();
    expect(record.status).toBe('extracting');
    expect(rescuer.herbs[EXPEDITION_RESCUE_HERB]).toBe(1);
    expect(explorer.artifacts.map(({ id }) => id)).toEqual(lootBefore);
  });

  it('releases only the original caller’s unaccepted signal after an actual recovery', () => {
    const { world, explorer, rescuer, apply } = fixture();
    expect(apply(explorer, utilityExpeditionRescueDecision(explorer, world)!)).not.toBeNull();
    const record = world.expeditionRescues.requests[0];
    expect(utilityExpeditionRescueDecision(explorer, world)).toBeUndefined();
    const supplies = rescuer.herbs[EXPEDITION_RESCUE_HERB];
    world.tick++;
    explorer.hp = explorer.maxHp;
    const quit = utilityExpeditionRescueDecision(explorer, world);
    expect(quit).toMatchObject({ chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'withdraw', targetExpeditionRescueId: record.id });
    expect(apply(rescuer, quit!)).toBeNull();
    expect(apply(explorer, quit!)).not.toBeNull();
    expect(record.status).toBe('withdrawn');
    expect(rescuer.herbs[EXPEDITION_RESCUE_HERB]).toBe(supplies);
  });
});

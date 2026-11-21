import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceSparring, availableSparringActions, SPARRING_QI_COST } from '../src/engine/sparringEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-sparring' };
const reply = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(601);
  const [leader, partner, outsider] = world.cultivators;
  const hall = world.locations.find(({ id }) => id === 'loc-market')!;
  const far = world.locations.find(({ id }) => id === 'loc-blood')!;
  world.relationships = [];
  world.tick = 22;
  for (const actor of world.cultivators) actor.locationId = far.id;
  for (const actor of [leader, partner]) {
    actor.locationId = hall.id;
    actor.hp = actor.maxHp;
    actor.qiProgress = 20;
    actor.techniqueMastery = 10;
    actor.personality = '刚正';
  }
  const apply = (actor: Cultivator, payload: LLMDecisionPayload) =>
    applyCultivatorBrainDecision(world, actor, payload, () => .5);
  return { world, leader, partner, outsider, apply };
}

describe('Utility and model obey actual mutual practice terms', () => {
  it('copies a real bounded offer and age-correct consent with no invented opponent, rounds or force', async () => {
    const { world, leader, partner, outsider, apply } = fixture();
    const ruleOffer = computeHeuristicDecision(leader, world, () => .99);
    expect(ruleOffer).toMatchObject({ chosenAction: 'SPARRING', sparringMove: 'offer', targetCultivatorId: partner.id, sparringRounds: 1 });
    const offer = { chosenAction: 'SPARRING', sparringMove: 'offer', targetCultivatorId: partner.id,
      sparringRounds: 2, innerMonologue: '仅作自愿切磋。' } as const;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply({ ...offer, targetCultivatorId: outsider.id }));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestCultivatorLLMDecision(leader, world, config, world.tick + 1)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => reply({ ...offer, sparringRounds: 3 }));
    await expect(requestCultivatorLLMDecision(leader, world, config, world.tick + 1)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => reply({ ...offer, forced: true }));
    await expect(requestCultivatorLLMDecision(leader, world, config, world.tick + 1)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => reply(offer));
    const chosen = await requestCultivatorLLMDecision(leader, world, config, world.tick + 1);
    expect(chosen).toMatchObject(offer);
    expect(fetcher.mock.calls[3][1]?.body).toContain('自愿切磋只使用执行回合的许可');
    world.tick++;
    expect(apply(leader, chosen!)).not.toBeNull();
    const agreement = world.sparring.agreements[0];
    expect([leader.qiProgress, partner.qiProgress]).toEqual([20, 20]);
    expect(agreement.status).toBe('offered');
    const accept = { chosenAction: 'SPARRING', sparringMove: 'accept', targetSparringId: agreement.id, innerMonologue: '本人同意。' } as const;
    fetcher.mockImplementation(async () => reply(accept));
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    const accepted = await requestCultivatorLLMDecision(partner, world, config, world.tick + 1);
    expect(accepted).toMatchObject(accept);
    world.tick++;
    expect(apply(partner, accepted!)).not.toBeNull();
    expect(agreement.status).toBe('active');
    expect(agreement.rounds).toEqual([]);
  });

  it('takes separate readiness, applies one actual practice round, then routes low-qi Utility to timely yield', () => {
    const { world, leader, partner, apply } = fixture();
    expect(apply(leader, { chosenAction: 'SPARRING', sparringMove: 'offer', targetCultivatorId: partner.id,
      sparringRounds: 2, innerMonologue: '' })).not.toBeNull();
    world.tick++;
    const accept = computeHeuristicDecision(partner, world, () => .99);
    expect(accept).toMatchObject({ chosenAction: 'SPARRING', sparringMove: 'accept' });
    expect(apply(partner, accept)).not.toBeNull();
    const agreement = world.sparring.agreements[0];
    const stats = leader.spiritStones + partner.spiritStones;
    const injury = [leader.hp, partner.hp];
    const crimes = [leader.transgressions, partner.transgressions];
    world.tick++;
    const first = computeHeuristicDecision(leader, world, () => .99);
    expect(first).toMatchObject({ chosenAction: 'SPARRING', sparringMove: 'ready' });
    expect(apply(leader, first)).not.toBeNull();
    expect(agreement.rounds).toEqual([]);
    const second = computeHeuristicDecision(partner, world, () => .99);
    expect(second).toMatchObject({ chosenAction: 'SPARRING', sparringMove: 'ready' });
    expect(apply(partner, second)).not.toBeNull();
    advanceSparring(world);
    advanceSparring(world);
    expect(agreement.rounds).toHaveLength(1);
    expect([leader.qiProgress, partner.qiProgress]).toEqual([20 - SPARRING_QI_COST, 20 - SPARRING_QI_COST]);
    expect([leader.techniqueMastery, partner.techniqueMastery]).toEqual([11, 11]);
    world.tick++;
    partner.qiProgress = 1;
    const stop = computeHeuristicDecision(partner, world, () => .99);
    expect(stop).toMatchObject({ chosenAction: 'SPARRING', sparringMove: 'yield', targetSparringId: agreement.id });
    expect(apply(partner, stop)).not.toBeNull();
    advanceSparring(world);
    expect(agreement).toMatchObject({ status: 'yielded', closedById: partner.id });
    expect(agreement.rounds).toHaveLength(1);
    expect(availableSparringActions(leader, world, false)).toEqual([]);
    expect([leader.hp, partner.hp]).toEqual(injury);
    expect([leader.transgressions, partner.transgressions]).toEqual(crimes);
    expect(leader.spiritStones + partner.spiritStones).toBe(stats);
    expect(world.competitions.scores).toEqual([]);
  });
});

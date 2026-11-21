import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map((actor) => [actor.id, { chosenAction: 'REST', innerMonologue: '静候大比' }])
);

describe('calendar occasions in both brains', () => {
  it('publishes exactly one occurrence at a 60-tick boundary and lets Utility AI sign up', () => {
    let world = createInitialWorld();
    world.tick = 58;
    world = advanceWorldTick(world, rest(world), () => 0.1);
    expect(world.occasions).toEqual([]);
    world = advanceWorldTick(world, rest(world), () => 0.1);
    expect(world.tick).toBe(60);
    expect(world.occasions).toHaveLength(1);
    const first = world.occasions[0];
    expect(first).toMatchObject({ status: 'registration', startedTick: 60 });
    const actor = world.cultivators[0];
    actor.qiProgress = 10;
    const choice = computeHeuristicDecision(actor, world, () => 0.55);
    expect(choice).toMatchObject({ chosenAction: 'JOIN_OCCASION', targetOccasionId: first.id });
    world = advanceWorldTick(world, { ...rest(world), [actor.id]: choice }, () => 0.2);
    expect(world.occasions[0].participantIds).toContain(actor.id);
    expect(world.occasions).toHaveLength(1);
  });

  it('revalidates a JSON sign-up against the active registration ledger', async () => {
    const initial = createInitialWorld();
    initial.tick = 59;
    let world = advanceWorldTick(initial, rest(initial), () => 0.95);
    const actor = world.cultivators[0];
    let target = 'nonexistent';
    const response = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'JOIN_OCCASION', targetOccasionId: target, innerMonologue: '报名参加',
      }) } }],
    })));
    vi.stubGlobal('fetch', response);
    expect((await queryCultivatorLLMDecision(actor, world, config)).targetOccasionId).not.toBe('nonexistent');
    target = world.occasions[0].id;
    const choice = await queryCultivatorLLMDecision(actor, world, config);
    expect(choice).toMatchObject({ chosenAction: 'JOIN_OCCASION', targetOccasionId: target });
    world = advanceWorldTick(world, { ...rest(world), [actor.id]: choice }, () => 0.2);
    expect(world.occasions[0].participantIds).toContain(actor.id);
    expect(response.mock.calls[1][1].body).toEqual(expect.stringContaining('天下公示的大会与秘境'));
  });
  it('evacuates a real companion with its owner when a temporary expedition gate closes', () => {
    let world = createInitialWorld();
    world.tick = 59;
    world = advanceWorldTick(world, rest(world), () => .95);
    const expedition = world.occasions.find(({ kind }) => kind === 'expedition')!;
    expect(expedition).toBeDefined();
    const ownerId = world.cultivators[0].id;
    const id = world.spiritBeasts[0].id;
    world.cultivators[0].locationId = expedition.locationId;
    Object.assign(world.spiritBeasts[0], { locationId: expedition.locationId, tamedBy: ownerId });
    while (world.locations.some(({ id: siteId }) => siteId === expedition.locationId)) {
      world = advanceWorldTick(world, rest(world), () => .95);
      expect(world.tick).toBeLessThan(68);
    }
    const survivor = world.spiritBeasts.find((beast) => beast.id === id)!;
    expect(survivor).toMatchObject({ alive: true, tamedBy: ownerId,
      locationId: world.cultivators.find(({ id: personId }) => personId === ownerId)?.locationId });
    expect(() => encodeWorldSave(world)).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('alchemy through both brains', () => {
  it('gathers from a nearby finite plant population in offline mode', () => {
    let world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.qiProgress = 10;
    world.cultivators = [actor];
    world.tick = 4;
    const local = world.locations.find((place) => place.id === actor.locationId);
    const before = local?.herbs.jade_leaf;
    const choice = computeHeuristicDecision(actor, { ...world, tick: 5 }, () => 0.3);
    expect(choice.chosenAction).toBe('GATHER_HERBS');
    world = advanceWorldTick(world, undefined, () => 0.3);
    const picked = choice.targetHerbId;
    expect(picked).toBeDefined();
    if (!picked) throw new Error('Utility gather did not choose a herb');
    expect(world.cultivators[0].herbs[picked]).toBeGreaterThan(0);
    if (picked === 'jade_leaf' && before !== undefined) {
      const updated = world.locations.find((place) => place.id === actor.locationId);
      expect(updated?.herbs.jade_leaf).toBeLessThan(before);
    }
  });

  it('validates targets from the provider and falls back on an invalid recipe action', async () => {
    const start = createInitialWorld();
    const actor = start.cultivators[0];
    start.cultivators = [actor];
    let picked = 'star_bloom'; // none at the starting peak
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ chosenAction: 'GATHER_HERBS', innerMonologue: '觅药', targetHerbId: picked }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await queryCultivatorLLMDecision(actor, start, config)).chosenAction).not.toBe('GATHER_HERBS');
    picked = 'jade_leaf';
    const decision = await queryCultivatorLLMDecision(actor, start, config);
    expect(decision).toMatchObject({ chosenAction: 'GATHER_HERBS', targetHerbId: 'jade_leaf' });
    expect(fetchMock.mock.calls[1][1].body).toEqual(expect.stringContaining('允许的炼丹行动'));
    const end = advanceWorldTick(start, { [actor.id]: decision }, () => 0.3);
    expect(end.cultivators[0].herbs.jade_leaf).toBeGreaterThan(0);
    expect(actor.herbs.jade_leaf).toBe(0);
  });

  it('gives an actual rest turn extra detox beyond passive recovery', () => {
    const start = createInitialWorld();
    const actor = start.cultivators[0];
    actor.pillToxicity = 55;
    start.cultivators = [actor];
    const resting = advanceWorldTick(start, { [actor.id]: { chosenAction: 'REST', innerMonologue: '驱除丹毒' } }, () => 0.4);
    const normal = advanceWorldTick(start, { [actor.id]: { chosenAction: 'CULTIVATE', innerMonologue: '磨练' } }, () => 0.4);
    expect(resting.cultivators[0].pillToxicity).toBeLessThan(normal.cultivators[0].pillToxicity);
  });
});

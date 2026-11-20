import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('map events from real mechanics', () => {
  it('uses the same routed scene trail after Utility or validated JSON flight', async () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    world.cultivators = [actor];
    actor.qiProgress = 10;
    actor.rumors.push({
      id: 'map-route', locationId: 'loc-market', lead: true, subject: '万仙坊市有机缘',
      confidence: 100, hops: 0, learnedTick: world.tick, originTick: world.tick, provenance: 'witness',
    });
    const utility = computeHeuristicDecision(actor, world, () => 0.1);
    expect(utility).toMatchObject({ chosenAction: 'EXPLORE', targetLocationId: 'loc-market' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '御剑赴市',
      }) } }],
    })));
    const cognitive = await queryCultivatorLLMDecision(actor, world, config);
    const advance = (choice: typeof utility) => advanceWorldTick(world, { [actor.id]: choice }, () => 0.7);
    const first = advance(utility).mapPresentation;
    const second = advance(cognitive).mapPresentation;
    expect(first).toEqual(second);
    expect(first.trails[0]).toMatchObject({ cultivatorId: actor.id, fromLocationId: actor.locationId, toLocationId: 'loc-market' });
    const start = world.locations.find(({ id }) => id === actor.locationId);
    const end = world.locations.find(({ id }) => id === 'loc-market');
    expect(first.trails[0].points[0]).toEqual({ x: start?.x, y: start?.y });
    expect(first.trails[0].points.at(-1)).toEqual({ x: end?.x, y: end?.y });
  });

  it('animates the applied God Strike and its actual clamped damage, not its nominal damage', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.hp = 10;
    const struck = executeGodIntervention(world, { type: 'TRIBULATION_STRIKE', targetCultivatorId: actor.id });
    expect(struck.cultivators[0].hp).toBe(1);
    expect(struck.events[0].damage).toEqual([{ cultivatorId: actor.id, amount: 9 }]);
    expect(struck.mapPresentation.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'lightning', locationId: actor.locationId }),
      expect.objectContaining({ kind: 'damage', locationId: actor.locationId, text: expect.stringContaining('9') }),
    ]));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('painted terrain and NPC decisions', () => {
  it('applies brush hazards to the real actor and steers the Utility brain off the affected cell', () => {
    const seed = createInitialWorld();
    const actor = seed.cultivators[0];
    seed.cultivators = [actor];
    const site = seed.locations.find((place) => place.id === actor.locationId);
    if (!site) throw new Error('missing home location');
    actor.qiProgress = 20;
    const changed = applyMapBrush(seed, 'cursed_miasma', [{ x: site.x, y: site.y }]);
    const trapped = changed.cultivators[0];
    expect(changed.mapHazards.some(({ kind }) => kind === 'cursed_miasma')).toBe(true);
    const choice = computeHeuristicDecision(trapped, changed, () => 0.5);
    expect(choice.chosenAction).toBe('EXPLORE');
    const fled = advanceWorldTick(changed, { [actor.id]: choice }, () => 0.5);
    expect(fled.cultivators[0].locationId).not.toBe(actor.locationId);
    expect(fled.cultivators[0].hp).toBeLessThan(trapped.hp);
    expect(seed.mapHazards).toEqual([]);
  });

  it('only exposes the nearby disaster to the JSON brain and accepts a valid refuge action', async () => {
    const seed = createInitialWorld();
    const [actor, , distant] = seed.cultivators;
    const site = seed.locations.find((place) => place.id === actor.locationId);
    if (!site) throw new Error('missing home location');
    const changed = applyMapBrush(seed, 'beast_tide', [{ x: site.x, y: site.y }]);
    const request = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '暂避兽潮',
      }) } }],
    })));
    vi.stubGlobal('fetch', request);
    expect(await queryCultivatorLLMDecision(changed.cultivators[0], changed, config)).toMatchObject({
      chosenAction: 'EXPLORE', targetLocationId: 'loc-market',
    });
    const farActor = changed.cultivators.find((item) => item.id === distant.id);
    if (!farActor) throw new Error('missing distant cultivator');
    await queryCultivatorLLMDecision(farActor, changed, config);
    expect(request.mock.calls[0][1].body).toEqual(expect.stringContaining('beast_tide'));
    expect(request.mock.calls[1][1].body).not.toEqual(expect.stringContaining('beast_tide'));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { knownMapLocations, terrainTileAt } from '../src/engine/terrainEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('terrain fog in the simulation and cognition', () => {
  it('does not allow a named unknown destination, but reveals it through actual blind exploration', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    const initialSite = world.locations.find((place) => place.id === actor.locationId);
    const hidden = world.locations.find((place) => place.id === 'loc-secret-1');
    if (!initialSite || !hidden) throw new Error('missing map fixture');
    world.locations = [initialSite, hidden];
    expect(knownMapLocations(world, actor)).not.toContain(hidden);
    applyCultivatorBrainDecision(world, actor, {
      chosenAction: 'EXPLORE', innerMonologue: '指名未知之地', targetLocationId: hidden.id,
    }, () => 0.9);
    expect(actor.locationId).toBe(initialSite.id);
    applyCultivatorBrainDecision(world, actor, { chosenAction: 'EXPLORE', innerMonologue: '循陌路一探' }, () => 0.9);
    const tile = terrainTileAt(world, hidden.x, hidden.y);
    expect(tile).toBeDefined();
    expect(actor.locationId).toBe(hidden.id);
    expect(actor.exploredTileIds).toContain(tile?.id);
    expect(knownMapLocations(world, actor)).toContain(hidden);
  });

  it('only gives a JSON brain discovered geography, but a fresh firsthand clue unlocks a location', async () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    const hidden = world.locations.find((place) => place.id === 'loc-secret-1');
    if (!hidden) throw new Error('missing secret realm');
    const response = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'EXPLORE', targetLocationId: hidden.id, innerMonologue: '循线前往',
      }) } }],
    })));
    vi.stubGlobal('fetch', response);
    const rejected = await queryCultivatorLLMDecision(actor, world, config);
    expect(rejected.targetLocationId).not.toBe(hidden.id);
    expect(response.mock.calls[0][1].body).not.toEqual(expect.stringContaining(hidden.name));
    actor.rumors.push({
      id: 'fresh-location-clue', subject: '同道留下可信的地图注记', locationId: hidden.id,
      originTick: world.tick, learnedTick: world.tick, provenance: 'witness', confidence: 100, hops: 0,
    });
    expect(await queryCultivatorLLMDecision(actor, world, config)).toMatchObject({
      chosenAction: 'EXPLORE', targetLocationId: hidden.id,
    });
    expect(response.mock.calls[1][1].body).toEqual(expect.stringContaining(hidden.name));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy } from '../src/engine/alchemyEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableBeastTames, petCombatBonus } from '../src/engine/spiritBeastEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('beasts in the shared world and cognitive options', () => {
  it('both brains can select a valid nearby beast, and a real tamed animal adds combat support', async () => {
    const start = createInitialWorld();
    const actor = start.cultivators[0];
    start.cultivators = [actor];
    const beast = start.spiritBeasts.find((item) => item.kind === '瑞兽');
    if (!beast) throw new Error('missing friendly native beast');
    start.spiritBeasts = [beast];
    actor.locationId = beast.locationId;
    actor.qiProgress = 15;
    actor.herbs.jade_leaf = 20;
    actor.herbs.star_bloom = 20;
    expect(availableBeastTames(actor, start)).toEqual([{ action: 'TAME_BEAST', targetBeastId: beast.id }]);
    expect(computeHeuristicDecision(actor, start, () => 0.9).chosenAction).toBe('TAME_BEAST');
    let id = 'not-in-world';
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'TAME_BEAST', targetBeastId: id, innerMonologue: '以灵草相邀',
      }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await queryCultivatorLLMDecision(actor, start, config)).targetBeastId).not.toBe('not-in-world');
    id = beast.id;
    const decision = await queryCultivatorLLMDecision(actor, start, config);
    expect(decision).toMatchObject({ chosenAction: 'TAME_BEAST', targetBeastId: beast.id });
    expect(fetchMock.mock.calls[1][1].body).toEqual(expect.stringContaining(beast.name));
    const next = advanceWorldTick(start, { [actor.id]: decision }, () => 0.01);
    expect(next.spiritBeasts[0].tamedBy).toBe(actor.id);
    expect(petCombatBonus(next, next.cultivators[0])).toBeGreaterThan(1);
    expect(start.spiritBeasts[0].tamedBy).toBeUndefined();
  });

  it('makes a hostile den change real herb-gathering eligibility', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    const beast = world.spiritBeasts.find((item) => item.kind === '凶兽');
    const site = world.locations.find((item) => item.id === beast?.homeLocationId);
    if (!beast || !site) throw new Error('missing hostile herb-guarding lair');
    world.spiritBeasts = [beast];
    world.tick = 18;
    actor.locationId = site.id;
    actor.combatPower = 1;
    site.herbs.jade_leaf = 4;
    expect(availableAlchemy(actor, world)).not.toContainEqual({
      action: 'GATHER_HERBS', targetHerbId: 'jade_leaf',
    });
    beast.locationId = 'loc-market';
    expect(availableAlchemy(actor, world)).toContainEqual({
      action: 'GATHER_HERBS', targetHerbId: 'jade_leaf',
    });
  });
});

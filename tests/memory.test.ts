import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { CORE_LIMIT, EPISODIC_LIMIT, maintainMemories, memoryStrength, recallMemories, recordMemory } from '../src/engine/memoryEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());

describe('episodic recall and yearly consolidation', () => {
  it('clamps input, decays weak memories and retains highly charged memories longer', () => {
    const actor = createInitialWorld().cultivators[0];
    actor.memories = [];
    recordMemory(actor, 1, '擦肩而过', -2, 'social', 0);
    recordMemory(actor, 1, '落败', 99, 'combat', -99);
    const [strong, weak] = actor.memories;
    expect([strong.importance, strong.emotionalValence, weak.importance]).toEqual([10, -5, 1]);
    expect(memoryStrength(strong, 1)).toBe(10);
    expect(memoryStrength(strong, 13)).toBeGreaterThan(7);
    expect(memoryStrength(weak, 13)).toBeLessThan(1);
    maintainMemories(actor, 13, false);
    expect(actor.memories.map((m) => m.content)).toEqual(['落败']);
    expect(actor.coreMemories).toEqual([]);
  });

  it('consolidates exactly at the 12-tick year boundary for supplied decisions and does not mutate the past', () => {
    let world = createInitialWorld();
    const original = world;
    const decisions: Record<string, LLMDecisionPayload> = Object.fromEntries(
      world.cultivators.map((c) => [c.id, { chosenAction: 'CULTIVATE', innerMonologue: '静修' }])
    );
    for (let i = 0; i < 11; i++) world = advanceWorldTick(world, decisions, () => 0.5);
    expect(world.cultivators.every((c) => c.coreMemories.length === 0)).toBe(true);
    const next = advanceWorldTick(world, decisions, () => 0.5);
    expect(next.tick).toBe(13);
    const core = next.cultivators[0].coreMemories[0];
    expect(core).toMatchObject({ id: original.cultivators[0].memories[0].id, consolidatedAtTick: 13 });
    expect(next.cultivators[0].memories).not.toContainEqual(expect.objectContaining({ id: core.id }));
    expect(memoryStrength(core, 25)).toBeGreaterThan(memoryStrength(original.cultivators[0].memories[0], 25));
    expect(world.cultivators[0].coreMemories).toEqual([]);
    expect(advanceWorldTick(createInitialWorld(), undefined, () => 0.5)).toEqual(
      advanceWorldTick(createInitialWorld(), undefined, () => 0.5)
    );
  });

  it('keeps bounded distinct core entries and stable identifiers under repeated same-tick pressure', () => {
    const actor = createInitialWorld().cultivators[0];
    actor.memories = [];
    for (let i = 0; i < 60; i++) recordMemory(actor, 1, `修炼 ${i}`, 9, 'cultivation', 3);
    expect(actor.memories).toHaveLength(EPISODIC_LIMIT);
    expect(new Set(actor.memories.map((m) => m.id)).size).toBe(EPISODIC_LIMIT);
    for (let tick = 13; tick < 140; tick += 12) {
      for (let i = 0; i < 4; i++) recordMemory(actor, tick, '同一神谕', 10, 'whisper', 5);
      for (let i = 0; i < 3; i++) recordMemory(actor, tick, `历练 ${tick}/${i}`, 9, 'combat', -5);
      maintainMemories(actor, tick, true);
    }
    expect(actor.coreMemories).toHaveLength(CORE_LIMIT);
    expect(actor.coreMemories.filter((m) => m.content === '同一神谕')).toHaveLength(1);
    expect(recallMemories(actor, 133, 1)[0].content).toBe('同一神谕');
  });

  it('makes the Utility AI more cautious after a strongly recalled defeat', () => {
    const world = createInitialWorld();
    const [actor, enemy] = world.cultivators;
    actor.memories = [];
    enemy.locationId = actor.locationId;
    world.relationships = [{ fromId: actor.id, toId: enemy.id, affinity: -60, type: '血仇', note: '' }];
    expect(computeHeuristicDecision(actor, world, () => 0.5).chosenAction).toBe('DUEL');
    recordMemory(actor, 1, '险死逃生', 9, 'combat', -5);
    expect(computeHeuristicDecision(actor, world, () => 0.5).chosenAction).not.toBe('DUEL');
  });

  it('gives the JSON brain strong episodic/core memories rather than stale history', async () => {
    const world = executeGodIntervention(createInitialWorld(), {
      type: 'WHISPER_MIND', targetCultivatorId: 'npc-1', whisperText: '守护剑冢',
    });
    const actor = world.cultivators[0];
    maintainMemories(actor, 13, true);
    world.tick = 14;
    recordMemory(actor, 1, '过眼云烟', 1, 'social', 0);
    recordMemory(actor, 14, '偶遇遗迹', 6, 'cultivation', 3);
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ chosenAction: 'REST', innerMonologue: '谨遵神谕' }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const decision = await queryCultivatorLLMDecision(actor, world, {
      enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture',
    });
    expect(decision.chosenAction).toBe('REST');
    const body = fetchMock.mock.calls[0][1].body;
    expect(body).toEqual(expect.stringContaining('核心'));
    expect(body).toEqual(expect.stringContaining('偶遇遗迹'));
    expect(body).not.toEqual(expect.stringContaining('过眼云烟'));
  });
});

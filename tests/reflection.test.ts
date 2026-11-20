import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { recordMemory } from '../src/engine/memoryEngine';
import { applyReflectionLanguage, enrichAnnualReflections, synthesizeReflections } from '../src/engine/reflectionEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture' };

function yearEndFixture() {
  const world = createInitialWorld();
  world.tick = 12;
  world.month = 12;
  const actor = world.cultivators[0];
  actor.memories = [];
  world.cultivators = [actor];
  recordMemory(actor, 10, '雷劫重创', 9, 'combat', -5);
  recordMemory(actor, 11, '同门舍身扶我', 9, 'social', 5);
  const decisions: Record<string, LLMDecisionPayload> = { [actor.id]: { chosenAction: 'CULTIVATE', innerMonologue: '静修' } };
  return { world, actor, decisions };
}

describe('yearly reflection', () => {
  it('forms positive beliefs and negative heart demons at rollover, with traceable memories', () => {
    const { world, actor, decisions } = yearEndFixture();
    const before = { ...world, month: 11 };
    expect(advanceWorldTick(before, decisions, () => 0.5).cultivators[0].reflections).toEqual([]);
    const next = advanceWorldTick(world, decisions, () => 0.5);
    const reflected = next.cultivators[0];
    const demon = reflected.reflections.find((r) => r.kind === 'heart_demon');
    expect(demon).toMatchObject({ theme: 'conflict', tick: 13, source: 'utility' });
    expect(reflected.reflections).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'belief', theme: 'community' }),
      expect.objectContaining({ kind: 'obsession', theme: 'conflict' }),
    ]));
    expect(reflected.coreMemories.some((m) => demon?.sourceMemoryIds.includes(m.id))).toBe(true);
    expect(actor.reflections).toEqual([]);
    expect(advanceWorldTick(world, decisions, () => 0.5)).toEqual(next);
  });

  it('weakens and expires old insights without recent source events', () => {
    const { world, decisions } = yearEndFixture();
    const actor = advanceWorldTick(world, decisions, () => 0.5).cultivators[0];
    const demon = actor.reflections.find((r) => r.kind === 'heart_demon');
    expect(demon).toBeDefined();
    for (let year = 1; year <= 5; year++) {
      actor.reflections = synthesizeReflections(actor, 13 + 12 * year);
      if (year === 1) {
        expect(actor.reflections.find((r) => r.id === demon?.id)?.intensity).toBe((demon?.intensity ?? 0) - 2);
      }
    }
    expect(actor.reflections).toEqual([]);
  });

  it('applies an enduring heart demon to Utility AI even without its old episode', () => {
    const { world, decisions } = yearEndFixture();
    const next = advanceWorldTick(world, decisions, () => 0.5);
    const actor = next.cultivators[0];
    const opponent = createInitialWorld().cultivators[1];
    opponent.locationId = actor.locationId;
    actor.qiProgress = 25;
    actor.memories = [];
    actor.coreMemories = [];
    next.cultivators.push(opponent);
    next.relationships = [{ fromId: actor.id, toId: opponent.id, affinity: -80, type: '血仇', note: '' }];
    expect(computeHeuristicDecision({ ...actor, reflections: [] }, next, () => 0.25).chosenAction).toBe('DUEL');
    expect(computeHeuristicDecision(actor, next, () => 0.25).chosenAction).not.toBe('DUEL');
  });

  it('allows JSON narration but does not let the provider change evidence or mechanics', async () => {
    const { world, decisions } = yearEndFixture();
    const next = advanceWorldTick(world, decisions, () => 0.5);
    const actor = next.cultivators[0];
    const reflection = actor.reflections[0];
    const replacement = '旧事不曾远去，我须谨慎行事。';
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        reflections: [{ id: reflection.id, statement: replacement, intensity: 1, sourceMemoryIds: ['fabricated'] }],
      }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await enrichAnnualReflections(world, config)).toBe(world);
    expect(fetchMock).not.toHaveBeenCalled();
    const enriched = await enrichAnnualReflections(next, config);
    expect(enriched.cultivators[0].reflections[0]).toEqual({ ...reflection, statement: replacement, source: 'llm' });
    expect(actor.reflections[0]).toEqual(reflection);
    expect(fetchMock.mock.calls[0][1].body).toEqual(expect.stringContaining('雷劫重创'));
    expect(applyReflectionLanguage(actor.reflections, 13, { reflections: [{ id: 'invented', statement: replacement }] })).toBe(actor.reflections);
    expect(applyReflectionLanguage(actor.reflections, 14, { reflections: [{ id: reflection.id, statement: replacement }] })).toBe(actor.reflections);
    await queryCultivatorLLMDecision(enriched.cultivators[0], enriched, config);
    expect(fetchMock.mock.calls[1][1].body).toEqual(expect.stringContaining(replacement));
  });
});

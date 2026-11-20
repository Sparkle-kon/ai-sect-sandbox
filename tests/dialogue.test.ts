import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyDialogueLanguage, enrichTickDialogues } from '../src/engine/dialogueEngine';
import { ARTIFACT_TRADE_PRICE, availableEncounters } from '../src/engine/encounterEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { ActionType, LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture' };

function meeting() {
  const world = createInitialWorld();
  const [actor, , target] = world.cultivators;
  const market = world.locations.find((place) => place.type === 'market');
  if (!market) throw new Error('fixture has no market');
  actor.locationId = target.locationId = market.id;
  world.cultivators = [actor, target];
  world.relationships = [{ fromId: actor.id, toId: target.id, type: '挚友', affinity: 70, note: '' }];
  const perform = (chosenAction: ActionType) => applyCultivatorBrainDecision(
    world, actor, { chosenAction, targetCultivatorId: target.id, innerMonologue: '观其来意' }, () => 0.1
  );
  return { world, actor, target, perform };
}

describe('dialogues and encounters', () => {
  it('records a combat transcript with the actual winner and two speakers', () => {
    const { actor, target, perform } = meeting();
    actor.combatPower = 10_000;
    const event = perform('DUEL');
    expect(event?.dialogue?.kind).toBe('combat');
    expect(event?.dialogue?.turns.map((turn) => turn.speakerId)).toEqual([actor.id, target.id, actor.id]);
    expect(event?.dialogue?.turns[2].text).toContain(`${actor.name}占得上风`);
  });

  it('executes real trades and conserves stones and artifacts, with deterministic Utility initiation', () => {
    const { world, actor, target, perform } = meeting();
    world.tick = 4;
    const artifact = target.artifacts[1];
    const wealth = actor.spiritStones + target.spiritStones;
    const originalBuyerStones = actor.spiritStones;
    expect(computeHeuristicDecision(actor, world, () => 0.9)).toMatchObject({ chosenAction: 'TRADE', targetCultivatorId: target.id });
    expect(perform('TRADE')?.dialogue?.kind).toBe('trade');
    expect(actor.spiritStones).toBe(originalBuyerStones - ARTIFACT_TRADE_PRICE);
    expect(actor.spiritStones + target.spiritStones).toBe(wealth);
    expect(actor.artifacts.some((item) => item.id === artifact.id)).toBe(true);
    expect(target.artifacts).not.toContain(artifact);
    expect(perform('TRADE')).toBeNull();
  });

  it('allows mutual cultivation only when compatible and pays both sides exactly once per encounter', () => {
    const { world, actor, target, perform } = meeting();
    actor.qiProgress = target.qiProgress = 40;
    world.relationships[0].affinity = 5;
    expect(perform('DUAL_CULTIVATE')).toBeNull();
    world.relationships[0].affinity = 79;
    expect(perform('DUAL_CULTIVATE')?.dialogue?.kind).toBe('dual_cultivation');
    expect([actor.qiProgress, target.qiProgress]).toEqual([52, 52]);
    expect(actor.memories.some((entry) => entry.content.includes('自愿同修'))).toBe(true);
  });

  it('uses local diplomatic meetings to spend each treasury and award reputation without forming an alliance', () => {
    const { world, actor, target, perform } = meeting();
    const first = world.sects.find((sect) => sect.id === actor.sectId);
    const second = world.sects.find((sect) => sect.id === target.sectId);
    if (!first || !second) throw new Error('fixture actors must have sects');
    const oldStones = first.spiritStones + second.spiritStones;
    const oldReputation = first.reputation + second.reputation;
    const result = perform('SECT_DIPLOMACY');
    expect(result?.dialogue?.kind).toBe('sect_diplomacy');
    expect(result?.description).toContain('未签盟约');
    expect(first.spiritStones + second.spiritStones).toBe(oldStones - 60);
    expect(first.reputation + second.reputation).toBe(oldReputation + 4);
    target.locationId = 'loc-secret-1';
    expect(availableEncounters(actor, world)).toHaveLength(0);
    expect(perform('SECT_DIPLOMACY')).toBeNull();
  });

  it('validates the JSON encounter and only rewrites permitted dialogue opening lines', async () => {
    const { world, actor, target } = meeting();
    const mockAction = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'TRADE', targetCultivatorId: target.id, innerMonologue: 42, spokenLine: 123,
      }) } }],
    })));
    vi.stubGlobal('fetch', mockAction);
    const proposed = await queryCultivatorLLMDecision(actor, world, config);
    expect(proposed).toMatchObject({ chosenAction: 'TRADE', spokenLine: undefined });
    const next = advanceWorldTick(world, {
      [actor.id]: proposed,
      [target.id]: { chosenAction: 'REST', innerMonologue: '整衣' },
    }, () => 0.5);
    const event = next.events[0];
    const id = event.id;
    const llm = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        exchanges: [{ id, lines: ['请看这些灵石。', '成交前容我点数。'] }],
      }) } }],
    })));
    vi.stubGlobal('fetch', llm);
    const enriched = await enrichTickDialogues(next, config);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(enriched.events[0]).toMatchObject({ description: event.description, dialogue: { source: 'llm' } });
    expect(enriched.events[0].dialogue?.turns[0].text).toBe('请看这些灵石。');
    expect(enriched.events[0].dialogue?.turns[2]).toEqual(event.dialogue?.turns[2]);
    expect(enriched.cultivators).toBe(next.cultivators);
    expect(applyDialogueLanguage(next.events, [id], {
      exchanges: [{ id: 'other', lines: ['无关之事。', '是。'] }],
    })).toBe(next.events);
  });
});

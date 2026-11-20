import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { cultivationMultiplier, elementalRelation, strikeMultiplier } from '../src/engine/elementalEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision, executeGodIntervention } from '../src/engine/worldEngine';
import type { SpiritRoot } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());

describe('elemental affinity', () => {
  it('implements directional generation, opposition and special-root balance', () => {
    expect(elementalRelation('金', '金')).toBe('matching');
    for (const [from, to] of [['金', '水'], ['水', '木'], ['木', '火'], ['火', '土'], ['土', '金']] as const) {
      expect(elementalRelation(from, to)).toBe('nurturing');
      expect(elementalRelation(to, from)).not.toBe('nurturing');
    }
    for (const [from, to] of [
      ['金', '木'], ['木', '土'], ['土', '水'], ['水', '火'], ['火', '金'], ['雷', '暗'], ['暗', '天灵根'], ['天灵根', '雷'],
    ] as const) {
      expect(elementalRelation(from, to)).toBe('overcoming');
      expect(elementalRelation(to, from)).not.toBe('overcoming');
    }
  });

  it('changes actual cultivation at equal qi density and steers Utility AI toward a resonant place', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    world.cultivators = [actor];
    actor.qiProgress = 0;
    const site = world.locations[0];
    const alternative = world.locations[1];
    world.locations = [site, alternative];
    site.spiritRoot = '火';
    alternative.spiritRoot = '金';
    site.spiritQi = alternative.spiritQi = 50;
    expect(cultivationMultiplier(actor, site)).toBeLessThan(1);
    expect(computeHeuristicDecision(actor, world, () => 0.1)).toMatchObject({
      chosenAction: 'EXPLORE', targetLocationId: alternative.id,
    });
    applyCultivatorBrainDecision(world, actor, { chosenAction: 'CULTIVATE', innerMonologue: '入定' }, () => 0.5);
    const poorGain = actor.qiProgress;
    actor.qiProgress = 0;
    actor.locationId = alternative.id;
    applyCultivatorBrainDecision(world, actor, { chosenAction: 'CULTIVATE', innerMonologue: '入定' }, () => 0.5);
    expect(actor.qiProgress).toBeGreaterThan(poorGain);
  });

  it('attunes the equipped artifact and changes duel damage for otherwise identical opponents', () => {
    const testDamage = (technique: SpiritRoot) => {
      const world = createInitialWorld();
      const [actor, target] = world.cultivators;
      target.locationId = actor.locationId;
      target.spiritRoot = '木';
      actor.technique.spiritRoot = technique;
      actor.combatPower = 100_000;
      const health = target.hp;
      applyCultivatorBrainDecision(world, actor, {
        chosenAction: 'DUEL', targetCultivatorId: target.id, innerMonologue: '问剑',
      }, () => 0.3);
      return health - target.hp;
    };
    expect(testDamage('金')).toBeGreaterThan(testDamage('土'));
    const [actor, target] = createInitialWorld().cultivators;
    const withArtifact = strikeMultiplier(actor, target);
    actor.artifacts = [];
    expect(strikeMultiplier(actor, target)).toBeLessThan(withArtifact);
  });

  it('makes divine artifacts typed and supplies root, technique and local multiplier to the JSON brain', async () => {
    const start = createInitialWorld();
    const actor = start.cultivators[0];
    const world = executeGodIntervention(start, { type: 'SPAWN_TREASURE', targetLocationId: actor.locationId });
    const current = world.cultivators[0];
    expect(current.artifacts).toContainEqual({ name: '天道造化玉碟', spiritRoot: '天灵根' });
    const mock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: '{"chosenAction":"CULTIVATE","innerMonologue":"入定"}' } }],
    })));
    vi.stubGlobal('fetch', mock);
    const result = await queryCultivatorLLMDecision(current, world, {
      enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture',
    });
    expect(result.chosenAction).toBe('CULTIVATE');
    const body = mock.mock.calls[0][1].body;
    expect(body).toEqual(expect.stringContaining('灵根：金'));
    expect(body).toEqual(expect.stringContaining(current.technique.name));
    expect(body).toEqual(expect.stringContaining('修行倍率：1.42'));
  });
});

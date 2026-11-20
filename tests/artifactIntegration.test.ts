import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableArtifactActions, equippedArtifact } from '../src/engine/artifactEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('artifact progression through world ticks', () => {
  it('consumes durability and loots the physical storage ring exactly once on a lethal duel', () => {
    const world = createInitialWorld();
    const [winner, loser] = world.cultivators;
    world.cultivators = [winner, loser];
    loser.locationId = winner.locationId;
    winner.combatPower = 100_000;
    loser.hp = 5;
    loser.herbs.jade_leaf = 3;
    loser.pills.foundation = 2;
    const originalEquipment = equippedArtifact(winner);
    expect(originalEquipment?.durability).toBeDefined();
    const after = advanceWorldTick(world, {
      [winner.id]: { chosenAction: 'DUEL', innerMonologue: '以剑问道', targetCultivatorId: loser.id },
      [loser.id]: { chosenAction: 'REST', innerMonologue: '调息' },
    }, () => 0.5);
    const [survivor, defeated] = after.cultivators;
    expect(defeated.alive).toBe(false);
    expect(defeated.artifacts).toHaveLength(0);
    expect(defeated.spiritStones).toBe(0);
    expect(survivor.spiritStones).toBe(winner.spiritStones + loser.spiritStones);
    expect(survivor.artifacts).toHaveLength(winner.artifacts.length + loser.artifacts.length);
    expect(survivor.herbs.jade_leaf).toBe(3);
    expect(survivor.pills.foundation).toBe(2);
    expect(equippedArtifact(survivor)?.durability).toBeLessThan(originalEquipment?.durability ?? 0);
    expect(after.events[0].description).toContain('储物戒');
  });

  it('lets both brains initiate valid artifact work, not use a fabricated item ID', async () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    world.cultivators = [actor];
    actor.qiProgress = 20;
    const loose = actor.artifacts[1];
    let itemId = 'missing';
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ chosenAction: 'BIND_ARTIFACT', innerMonologue: '以神念认主', targetArtifactId: itemId }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await queryCultivatorLLMDecision(actor, world, config)).chosenAction).not.toBe('BIND_ARTIFACT');
    expect(availableArtifactActions(actor, world)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'BIND_ARTIFACT', targetArtifactId: loose.id }),
    ]));
    world.tick = 7;
    expect(computeHeuristicDecision(actor, world, () => 0.9).chosenAction).toBe('BIND_ARTIFACT');
    itemId = loose.id ?? '';
    const decision = await queryCultivatorLLMDecision(actor, world, config);
    expect(decision).toMatchObject({ chosenAction: 'BIND_ARTIFACT', targetArtifactId: loose.id });
    const after = advanceWorldTick(world, { [actor.id]: decision }, () => 0.5);
    expect(equippedArtifact(after.cultivators[0])).toMatchObject({ id: loose.id, boundTo: actor.id });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SETTLEMENT_RECRUIT_STIPEND } from '../src/engine/settlementEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

describe('settlement recruitment through both engines', () => {
  it('offers a real consenting candidate to each brain, adds one recruit, and waits until next month before their first act', async () => {
    const world = createInitialWorld(9);
    world.tick = 8; world.month = 8;
    const recruiter = world.cultivators[0];
    recruiter.qiProgress = 20;
    const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
    recruiter.locationId = village.locationId;
    const utility = computeHeuristicDecision(recruiter, world, () => .99);
    expect(utility.chosenAction).toBe('RECRUIT_SETTLER');
    const mock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(utility) } }],
    })));
    vi.stubGlobal('fetch', mock);
    const resolved = await queryCultivatorLLMDecision(recruiter, world, config);
    expect(resolved).toMatchObject({ chosenAction: 'RECRUIT_SETTLER',
      targetSettlementId: village.id, targetVolunteerId: utility.targetVolunteerId });
    const id = `recruit-${resolved.targetVolunteerId}`;
    const forced: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map(({ id: actor }) =>
      [actor, { chosenAction: 'REST', innerMonologue: '静待' }]));
    forced[recruiter.id] = resolved;
    forced[id] = { chosenAction: 'CULTIVATE', innerMonologue: '不可在入门当月抢跑' };
    const next = advanceWorldTick(world, forced, () => .99);
    const newActor = next.cultivators.find((actor) => actor.id === id)!;
    expect(newActor).toMatchObject({ spiritStones: SETTLEMENT_RECRUIT_STIPEND, currentAction: 'REST', qiProgress: 0 });
    expect(next.cultivators).toHaveLength(world.cultivators.length + 1);
    expect(next.settlements.villages.find(({ id }) => id === village.id)!.population).toBe(village.population - 1);
    expect(decodeWorldSave(encodeWorldSave(next)).settlements).toEqual(next.settlements);
  });

  it('gives an older snapshot deterministic map-based initial settlements without inventing a recruitment record', () => {
    const world = createInitialWorld(9);
    const { settlements: _previous, ...legacy } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(restored.settlements).toEqual(world.settlements);
  });
});

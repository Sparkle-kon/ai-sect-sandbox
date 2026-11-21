import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeRelicResonance, resolveArtifactAction } from '../src/engine/artifactEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceOccasions } from '../src/engine/occasionEngine';
import { availableRelicActions, heldRelicFragments, RELIC_SETS, resolveRelicAction } from '../src/engine/relicEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldOccasion, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '调息' }]));
afterEach(() => vi.unstubAllGlobals());

describe('antique craft, proven expeditions and persisted custody', () => {
  it('executes recovery through both brains, obtains the missing slot from a real finished expedition, and saves the physical result', async () => {
    const world = createInitialWorld(41);
    world.tick = 5; world.month = 5;
    const actor = world.cultivators[0];
    const cache = world.relics.fragments.find(({ holder }) => holder.kind === 'site')!;
    actor.locationId = cache.holder.id;
    actor.qiProgress = 20;
    actor.hp = actor.maxHp;
    const local = computeHeuristicDecision(actor, world, () => .99);
    expect(local).toMatchObject({ chosenAction: 'RELIC', relicMove: 'recover' });
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(local) } }] })));
    vi.stubGlobal('fetch', request);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'RELIC', relicMove: 'recover', targetRelicFragmentId: local.targetRelicFragmentId });
    const claimed = advanceWorldTick(world, { ...rest(world), [actor.id]: model }, () => .99);
    const adventurer = claimed.cultivators.find(({ id }) => id === actor.id)!;
    expect(heldRelicFragments(claimed, actor.id)).toHaveLength(1);
    expect(heldRelicFragments(claimed, actor.id)[0].source.kind).toBe('wild_cache');

    const gate = { ...structuredClone(claimed.locations.find(({ id }) => id === cache.source.locationId)!), id: 'fixture-expedition-gate',
      name: '试炼星门', type: 'secret_realm' as const };
    claimed.locations.push(gate);
    adventurer.locationId = gate.id;
    const expedition: WorldOccasion = { id: 'fixture-expedition', kind: 'expedition', title: '试炼远征',
      locationId: gate.id, startedTick: 1, registrationClosesTick: 3, expiresTick: 13, status: 'running',
      participantIds: [actor.id], remainingIds: [actor.id], bouts: [], expeditions: [], round: 0 };
    claimed.occasions.push(expedition);
    advanceOccasions(claimed, () => .99);
    expect(expedition.expeditions[0]?.outcome).toBe('loot');
    expect(claimed.locations.some(({ id }) => id === gate.id)).toBe(false);
    const owned = heldRelicFragments(claimed, actor.id);
    expect(owned.map(({ source }) => source.kind).sort()).toEqual(['expedition', 'wild_cache']);
    expect(new Set(owned.map(({ slot }) => slot)).size).toBe(2);
    expect(decodeWorldSave(encodeWorldSave(claimed)).relics).toEqual(claimed.relics);

    const recipe = RELIC_SETS['star-balance'];
    const forge = claimed.locations.find(({ furnaceGrade }) => furnaceGrade >= recipe.furnaceGrade)!;
    adventurer.locationId = forge.id;
    adventurer.herbs.earth_root = recipe.earthCost;
    adventurer.spiritStones = recipe.stoneCost + 50;
    const option = availableRelicActions(adventurer, claimed).find(({ relicMove }) => relicMove === 'assemble')!;
    expect(option).toBeDefined();
    expect(resolveRelicAction(claimed, adventurer, { ...option, chosenAction: 'RELIC', innerMonologue: '依古法重铸' })).not.toBeNull();
    const artifact = adventurer.artifacts.find(({ relicSetId }) => relicSetId === 'star-balance')!;
    expect(artifact.relicFragmentIds).toHaveLength(2);
    expect(adventurer.spiritStones).toBe(50);
    expect(adventurer.herbs.earth_root).toBe(0);
    expect(activeRelicResonance(adventurer)).toBe(0);
    expect(resolveArtifactAction(claimed, adventurer, { chosenAction: 'BIND_ARTIFACT', targetArtifactId: artifact.id,
      innerMonologue: '认主' }, () => .99)).not.toBeNull();
    expect(activeRelicResonance(adventurer)).toBeGreaterThan(0);
    const loaded = decodeWorldSave(encodeWorldSave(claimed));
    expect(loaded.relics).toEqual(claimed.relics);
    const corrupted = structuredClone(claimed);
    const row = corrupted.relics.fragments.find(({ id }) => id === artifact.relicFragmentIds![0])!;
    row.holder = { kind: 'actor', id: actor.id };
    expect(() => encodeWorldSave(corrupted)).toThrow(/relics.artifact.parts/);
  });

  it('migrates a pre-fragment save deterministically, without retroactive possession or forged scrolls', () => {
    const a = createInitialWorld();
    const { relics, ...old } = a;
    const restored = decodeWorldSave(JSON.stringify({ world: old, format: 'ai-sect-sandbox', version: 1 }));
    expect(restored.relics).toEqual(relics);
    expect(restored.relics.fragments.every(({ holder }) => holder.kind === 'site')).toBe(true);
    expect(restored.cultivators).toEqual(a.cultivators);
  });
});

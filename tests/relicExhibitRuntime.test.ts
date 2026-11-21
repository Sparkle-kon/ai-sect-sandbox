import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeRelicResonance, equippedArtifact, RELIC_RESONANCE_BONUS, resolveArtifactAction } from '../src/engine/artifactEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceRelicExhibits, availableRelicExhibitActions, RELIC_EXHIBIT_DURATION } from '../src/engine/relicExhibitEngine';
import { resolveRelicAction } from '../src/engine/relicEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fictional-fixture', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '留在实地。' };
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(11321);
  world.tick = 40;
  world.month = 6;
  const sect = world.sects[0];
  sect.facilities.scripture_pavilion = 2;
  const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
  site.furnaceGrade = 3;
  const host = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const owner = world.cultivators.find((row) => row.sectId === sect.id && row.id !== host.id)!;
  const cache = world.locations.find(({ type }) => type === 'spirit_vein')!;
  owner.spiritStones = 800;
  owner.herbs.earth_root = 20;
  owner.locationId = cache.id;
  for (const slot of ['frame', 'core'] as const) {
    const part = world.relics.fragments.find((row) => row.holder.kind === 'site' && row.holder.id === cache.id && row.slot === slot)!;
    expect(resolveRelicAction(world, owner, { ...rest, chosenAction: 'RELIC', relicMove: 'recover', targetRelicFragmentId: part.id })).not.toBeNull();
  }
  host.locationId = owner.locationId = site.id;
  expect(resolveRelicAction(world, owner, { ...rest, chosenAction: 'RELIC', relicMove: 'assemble', targetRelicSetId: 'star-balance' })).not.toBeNull();
  const artifact = owner.artifacts.find(({ relicSetId }) => relicSetId === 'star-balance')!;
  expect(resolveArtifactAction(world, owner, { ...rest, chosenAction: 'BIND_ARTIFACT', targetArtifactId: artifact.id }, () => .99)).not.toBeNull();
  expect(activeRelicResonance(owner)).toBe(RELIC_RESONANCE_BONUS);
  const proposal = availableRelicExhibitActions(owner, world).find(({ exhibitMove, targetArtifactId }) =>
    exhibitMove === 'offer' && targetArtifactId === artifact.id)!;
  expect(proposal).toBeDefined();
  const offer: LLMDecisionPayload = { ...rest, ...proposal, chosenAction: 'RELIC_EXHIBIT' };
  return { world, owner, host, site, artifact, offer };
}

function step(state: WorldState) {
  return advanceWorldTick(state, Object.fromEntries(state.cultivators.map(({ id }) => [id, rest])), () => .99);
}

describe('real exhibit custody, both brains and live closure paths', () => {
  it('preserves the exact assembled object, removes its bonus, rejects duplicates at save, then returns it once at the real deadline', async () => {
    const { world, owner, host, artifact, offer } = fixture();
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const mocked = vi.fn(async () => reply({ ...offer, targetArtifactId: 'fabricated-or-equipment-other' }));
    vi.stubGlobal('fetch', mocked);
    const source = vi.fn();
    await queryCultivatorLLMDecision(owner, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.relicExhibits.entries).toHaveLength(0);
    mocked.mockImplementation(async () => reply(offer));
    const accepted = await queryCultivatorLLMDecision(owner, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, owner, accepted, () => .99)).not.toBeNull();
    expect(equippedArtifact(owner)).toBe(artifact);
    const utility = computeHeuristicDecision(host, world, () => .99);
    expect(utility).toMatchObject({ chosenAction: 'RELIC_EXHIBIT', exhibitMove: 'accept' });
    expect(applyCultivatorBrainDecision(world, host, utility, () => .99)).not.toBeNull();
    expect(activeRelicResonance(owner)).toBe(0);
    expect(world.relicExhibits.entries[0].custody).toBe(artifact);
    expect(owner.artifacts.find(({ id }) => id === artifact.id)).toBeUndefined();
    const raw = encodeWorldSave(world);
    const forgery = JSON.parse(raw) as { world: typeof world };
    forgery.world.cultivators.find(({ id }) => id === owner.id)!.artifacts.push(structuredClone(artifact));
    expect(() => decodeWorldSave(JSON.stringify(forgery))).toThrow('relicExhibits.custody.unique');
    let current = decodeWorldSave(raw);
    for (let i = 0; i < RELIC_EXHIBIT_DURATION; i++) {
      current = step(current);
      const onDisplay = current.relicExhibits.entries[0];
      expect(onDisplay.status).toBe(i === RELIC_EXHIBIT_DURATION - 1 ? 'closed' : 'on_display');
    }
    const receipt = current.relicExhibits.entries[0];
    expect(receipt).toMatchObject({ status: 'closed', closeReason: 'term_complete', closedTick: current.tick });
    expect(receipt.custody).toBeUndefined();
    const returned = current.cultivators.find(({ id }) => id === owner.id)!;
    expect(returned.artifacts.filter(({ id }) => id === artifact.id)).toEqual([artifact]);
    expect(activeRelicResonance(returned)).toBe(RELIC_RESONANCE_BONUS);
    expect(advanceRelicExhibits(current)).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(current)).relicExhibits).toEqual(current.relicExhibits);
  });

  it('uses actual brush death before probate and never leaves both an artifact and its exhibit custody', () => {
    const { world, owner, host, site, artifact, offer } = fixture();
    expect(applyCultivatorBrainDecision(world, owner, offer, () => .99)).not.toBeNull();
    const utility = computeHeuristicDecision(host, world, () => .99);
    expect(applyCultivatorBrainDecision(world, host, utility, () => .99)).not.toBeNull();
    owner.hp = 1;
    const next = applyMapBrush(world, 'meteor', [site]);
    const afterOwner = next.cultivators.find(({ id }) => id === owner.id)!;
    expect(afterOwner.alive).toBe(false);
    expect(next.relicExhibits.entries[0]).toMatchObject({ status: 'closed', closeReason: 'owner_died' });
    expect(next.relicExhibits.entries[0].custody).toBeUndefined();
    const inherited = next.estates.entries.find(({ deceasedId }) => deceasedId === owner.id);
    expect(inherited?.holdings.artifacts.filter(({ id }) => id === artifact.id)).toHaveLength(1);
    expect(afterOwner.artifacts.some(({ id }) => id === artifact.id)).toBe(false);
    expect(decodeWorldSave(encodeWorldSave(next)).relicExhibits).toEqual(next.relicExhibits);
  });
});

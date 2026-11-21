import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableHabitatActions, habitatCapacity, habitatOccupancy, visibleHabitats } from '../src/engine/habitatEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceSpiritBeasts, availableBeastTames, petCombatBonus } from '../src/engine/spiritBeastEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const action = <T extends Pick<LLMDecisionPayload, 'habitatMove'>>(fields: T): LLMDecisionPayload =>
  ({ ...fields, chosenAction: 'HABITAT', innerMonologue: '只按真实栖地与目击凭证' });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(246813);
  world.tick = 20;
  const sect = world.sects[0];
  const steward = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const watcher = world.cultivators.find(({ id }) => id !== steward.id)!;
  const site = world.locations.find(({ type, id }) => type === 'spirit_vein' && id !== sect.headquartersId)!;
  site.ownerSectId = sect.id;
  const beast = world.spiritBeasts.find(({ kind }) => kind === '瑞兽')!;
  for (const animal of world.spiritBeasts) {
    if (animal.locationId === site.id) animal.locationId = world.locations.find(({ type, id }) => (type === 'secret_realm' || type === 'abyss') && id !== site.id)!.id;
  }
  beast.tamedBy = steward.id;
  beast.locationId = site.id;
  beast.hp = beast.maxHp;
  steward.locationId = watcher.locationId = site.id;
  steward.herbs.earth_root = 5;
  watcher.herbs.jade_leaf = 5;
  sect.spiritStones = 100;
  return { world, sect, site, beast, steward, watcher };
}

describe('habitat restores actual capacity and releases without spawning', () => {
  it('runs a canonically validated model release, then an independent actual Utility survey and save roundtrip', async () => {
    const { world, sect, site, beast, steward, watcher } = fixture();
    const count = world.spiritBeasts.length;
    const rawCapacity = habitatCapacity(world, site.id);
    expect(habitatOccupancy(world, site.id)).toBe(0);
    expect(petCombatBonus(world, steward)).toBeGreaterThan(1);
    const apply = (actor: typeof steward, order: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, order, () => .99);
    expect(apply(steward, action({ habitatMove: 'restore', targetLocationId: site.id }))).not.toBeNull();
    expect(sect.spiritStones).toBe(76);
    expect(steward.herbs.earth_root).toBe(3);
    expect(habitatCapacity(world, site.id)).toBe(rawCapacity + 1);
    world.tick++;
    const release = availableHabitatActions(steward, world).find(({ habitatMove }) => habitatMove === 'release')!;
    expect(release).toMatchObject({ targetBeastId: beast.id });
    const respond = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const fetchMock = vi.fn(async () => respond(action({ ...release, targetBeastId: 'not-a-real-pet' })));
    vi.stubGlobal('fetch', fetchMock);
    const source = vi.fn();
    const rejected = await queryCultivatorLLMDecision(steward, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(rejected.targetBeastId).not.toBe('not-a-real-pet');
    fetchMock.mockImplementation(async () => respond(action(release)));
    const normalized = await queryCultivatorLLMDecision(steward, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(apply(steward, normalized)).not.toBeNull();
    const receipt = world.habitats.releases[0];
    expect(receipt).toMatchObject({ beastId: beast.id, status: 'monitoring', siteId: site.id });
    expect(world.spiritBeasts.length).toBe(count);
    expect(world.spiritBeasts.filter(({ id }) => id === beast.id)).toHaveLength(1);
    expect(beast.tamedBy).toBeUndefined();
    expect(petCombatBonus(world, steward)).toBe(1);
    expect(habitatOccupancy(world, site.id)).toBe(1);
    expect(availableBeastTames(watcher, world).some(({ targetBeastId }) => targetBeastId === beast.id)).toBe(false);
    expect(availableHabitatActions(watcher, world).some(({ habitatMove }) => habitatMove === 'survey')).toBe(false);

    world.tick = receipt.earliestSurveyTick;
    const observed = computeHeuristicDecision(watcher, world, () => .99);
    expect(observed).toMatchObject({ chosenAction: 'HABITAT', habitatMove: 'survey', targetBeastReleaseId: receipt.id });
    expect(apply(watcher, observed)).not.toBeNull();
    expect(visibleHabitats(world, watcher)[0].releases[0]).toMatchObject({ status: 'sighted', observation: { observerId: watcher.id } });
    expect(decodeWorldSave(encodeWorldSave(world)).habitats).toEqual(world.habitats);
    const corrupt = structuredClone(world);
    corrupt.habitats.releases[0].observation!.observerId = steward.id;
    expect(() => encodeWorldSave(corrupt)).toThrow(/habitats.releases.sighting/);
  });

  it('gives natural roaming no entry to full sites, while a wild animal can move into the one real vacancy', () => {
    const { world, beast, site } = fixture();
    world.tick = 32;
    for (const person of world.cultivators) person.locationId = 'loc-market';
    const wilderness = world.locations.filter(({ type }) => type === 'spirit_vein' || type === 'abyss' || type === 'secret_realm');
    const vacancy = wilderness.find(({ id }) => id !== site.id)!;
    delete beast.tamedBy;
    beast.locationId = site.id;
    beast.nextActionTick = world.tick;
    for (const other of wilderness.filter(({ id }) => id !== site.id && id !== vacancy.id)) {
      const amount = habitatCapacity(world, other.id);
      for (let i = habitatOccupancy(world, other.id); i < amount; i++) {
        world.spiritBeasts.push({ ...beast, id: 'fixture-' + other.id + '-' + i, locationId: other.id, homeLocationId: other.id, nextActionTick: 99 });
      }
    }
    for (const other of world.spiritBeasts) {
      if (other.id === beast.id) continue;
      other.nextActionTick = 99;
      if (other.locationId === vacancy.id) other.locationId = site.id;
    }
    const count = world.spiritBeasts.length;
    const oldHabitat = habitatOccupancy(world, site.id);
    const events = advanceSpiritBeasts(world, () => .01);
    expect(events.some(({ id }) => id.includes('roam-' + beast.id))).toBe(true);
    expect(beast.locationId).toBe(vacancy.id);
    expect(habitatOccupancy(world, site.id)).toBe(oldHabitat - 1);
    expect(habitatOccupancy(world, vacancy.id)).toBe(1);
    expect(world.spiritBeasts.length).toBe(count);
  });

  it('migrates legacy worlds without inventing any restoration or release', () => {
    const { world } = fixture();
    const { habitats, ...old } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: old }));
    expect(restored.habitats).toEqual(habitats);
    expect(restored.spiritBeasts).toEqual(world.spiritBeasts);
  });
});

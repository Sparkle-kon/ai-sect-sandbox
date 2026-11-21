import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { householdCensus } from '../src/engine/householdEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { availableVillageWorksActions, VILLAGE_WORK_RULES } from '../src/engine/villageWorksEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '按真实环境先静候' };
const restAll = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, rest]),
);
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(9);
  world.tick = 18; world.month = 6;
  const sponsor = world.cultivators[0];
  const sect = world.sects.find(({ id }) => id === sponsor.sectId)!;
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  const village = world.settlements.villages.find(({ locationId }) => locationId === site.id)!;
  sponsor.locationId = site.id;
  sponsor.herbs.earth_root = 8;
  sponsor.hp = sponsor.maxHp;
  sect.spiritStones = 1_000;
  for (const community of world.settlements.villages) community.stress = 10;
  return { world, site, village, sponsor, sect };
}

describe('sponsored village work in the actual simulation', () => {
  it('runs in both brains, consumes measured adult labor after actual turns, and increases capacity exactly once', async () => {
    const { world, village, sponsor, sect } = fixture();
    const population = village.population;
    const capacity = village.capacity;
    const rosterSize = world.cultivators.length;
    const cost = VILLAGE_WORK_RULES.well;
    const rule = computeHeuristicDecision(sponsor, world, () => .99);
    expect(rule).toMatchObject({ chosenAction: 'VILLAGE_WORKS', villageWorkKind: 'well', targetSettlementId: village.id });
    const respond = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const fetchMock = vi.fn(async () => respond({ ...rule, targetSettlementId: 'imagined-village' }));
    vi.stubGlobal('fetch', fetchMock);
    const source = vi.fn();
    await queryCultivatorLLMDecision(sponsor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    fetchMock.mockImplementation(async () => respond(rule));
    const actual = await queryCultivatorLLMDecision(sponsor, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, sponsor, actual, () => .99)).not.toBeNull();
    expect(sect.spiritStones).toBe(1_000 - cost.stones);
    expect(sponsor.herbs.earth_root).toBe(8 - cost.roots);
    expect(village.capacity).toBe(capacity);
    expect(village.population).toBe(population);
    expect(world.villageWorks.projects[0]).toMatchObject({ status: 'building', laborTotal: 0 });
    expect(availableVillageWorksActions(sponsor, world)).toEqual([]);

    let branch = decodeWorldSave(encodeWorldSave(world));
    for (let remaining = cost.ticks; branch.villageWorks.projects[0].status === 'building' && remaining > 0; remaining--) {
      branch = advanceWorldTick(branch, restAll(branch), () => .99);
    }
    const actualVillage = branch.settlements.villages.find(({ id }) => id === village.id)!;
    const works = branch.villageWorks.projects[0];
    expect(works).toMatchObject({ status: 'completed', laborTotal: cost.labor, capacityBefore: capacity, capacityAfter: capacity + cost.capacityGain });
    expect(works.receipts.every(({ tick, labor, adultsAvailable }) => tick > world.tick && labor > 0 && adultsAvailable >= labor * 6)).toBe(true);
    expect(actualVillage.capacity).toBe(capacity + cost.capacityGain);
    expect(actualVillage.population).toBe(population);
    expect(branch.cultivators).toHaveLength(rosterSize);
    expect(householdCensus(branch, village.id)?.population).toBe(population);
    const later = advanceWorldTick(branch, restAll(branch), () => .99);
    expect(later.settlements.villages.find(({ id }) => id === village.id)?.capacity).toBe(capacity + cost.capacityGain);
    expect(decodeWorldSave(encodeWorldSave(later)).villageWorks).toEqual(later.villageWorks);
    const forged = structuredClone(later);
    forged.villageWorks.projects[0].capacityAfter! += 1;
    expect(() => encodeWorldSave(forged)).toThrow(/villageWorks.projects.capacity/);
  });

  it('prevents a project paused by verified hazards from increasing housing or counting any worker twice', () => {
    const { world, village, site, sponsor } = fixture();
    const beginning = village.capacity;
    const order = computeHeuristicDecision(sponsor, world, () => .99);
    expect(applyCultivatorBrainDecision(world, sponsor, order, () => .99)).not.toBeNull();
    // The engine receives a genuine active map-hazard fixture. Long expiry ensures every construction tick is blocked.
    const col = Math.min(world.terrain.columns - 1, Math.floor(site.x * world.terrain.columns / 1000));
    const row = Math.min(world.terrain.rows - 1, Math.floor(site.y * world.terrain.rows / 600));
    const tile = world.terrain.tiles[row * world.terrain.columns + col];
    world.mapHazards.push({ id: 'fixture-work-hazard', tileId: tile.id, kind: 'cursed_miasma', intensity: 1, createdTick: world.tick,
      expiresTick: world.villageWorks.projects[0].deadlineTick + 1 });
    let paused = world;
    while (paused.tick < world.villageWorks.projects[0].deadlineTick) paused = advanceWorldTick(paused, restAll(paused), () => .99);
    expect(paused.villageWorks.projects[0]).toMatchObject({ status: 'abandoned', endReason: 'deadline', laborTotal: 0, receipts: [] });
    expect(paused.settlements.villages.find(({ id }) => id === village.id)?.capacity).toBe(beginning);
    expect(paused.villageWorks.projects[0].capacityAfter).toBeUndefined();
    expect(decodeWorldSave(encodeWorldSave(paused)).villageWorks).toEqual(paused.villageWorks);
  });
});

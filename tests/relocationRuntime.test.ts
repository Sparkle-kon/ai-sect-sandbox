import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableRelocationActions, resolveRelocationAction } from '../src/engine/relocationEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());
const decisions = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '静候议约。' }]));

function scenario() {
  const world = createInitialWorld(51);
  world.tick = 8;
  world.month = 8;
  const sect = world.sects[0];
  const origin = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const destination = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const targetTile = terrainTileAt(world, destination.x, destination.y)!;
  delete destination.ownerSectId;
  delete targetTile.ownerSectId;
  leader.exploredTileIds.push(targetTile.id);
  leader.locationId = origin.id;
  leader.qiProgress = 20;
  for (const actor of world.cultivators.filter(({ sectId }) => sectId === sect.id)) {
    actor.locationId = origin.id;
    actor.hp = actor.maxHp;
  }
  sect.facilities.defense_array = 2;
  sect.arrayMaxHp = 400;
  sect.arrayHp = 0;
  sect.pavilion.push({ id: "fixture-scroll", name: "保管功法", spiritRoot: "木", authorId: leader.id, createdTick: 1 });
  origin.herbs.earth_root = Math.max(2, origin.herbs.earth_root);
  return { world, sect, leader, origin, destination };
}

describe('relocation through the live turn engines and saved custody', () => {
  it('uses the same verified location in both brains, freezes convoy turns and settles only once after reload', async () => {
    const { world, sect, leader, origin, destination } = scenario();
    const choice = computeHeuristicDecision(leader, world, () => .99);
    expect(choice).toMatchObject({ chosenAction: 'RELOCATE', relocationMove: 'propose', targetLocationId: destination.id });
    const client = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] })));
    vi.stubGlobal('fetch', client);
    const source = vi.fn();
    const resolved = await queryCultivatorLLMDecision(leader, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(resolved).toMatchObject({ chosenAction: 'RELOCATE', relocationMove: 'propose', targetLocationId: destination.id });

    const opening = advanceWorldTick(world, { ...decisions(world), [leader.id]: resolved }, () => .99);
    const pending = opening.relocations.plans[0];
    expect(pending).toMatchObject({ status: 'voting', originId: origin.id, destinationId: destination.id, spent: false });
    for (const voterId of pending.voterIds.filter((id) => id !== leader.id)) {
      const voter = opening.cultivators.find(({ id }) => id === voterId)!;
      const approve = availableRelocationActions(voter, opening).find(({ relocationMove }) => relocationMove === 'approve')!;
      expect(approve).toBeDefined();
      expect(resolveRelocationAction(opening, voter, { ...approve, chosenAction: 'RELOCATE', innerMonologue: '赞成' })).not.toBeNull();
    }
    const departing = advanceWorldTick(opening, decisions(opening), () => .99);
    const transit = departing.relocations.plans[0];
    expect(transit.status).toBe('in_transit');
    expect(transit.custody.stones).toBeGreaterThan(0);
    expect(departing.sects.find(({ id }) => id === sect.id)?.pavilion).toEqual([]);
    for (const id of transit.garrisonIds) expect(departing.cultivators.find((actor) => actor.id === id)?.currentAction).toBe('RELOCATE');
    const convoyLeader = departing.cultivators.find(({ id }) => id === leader.id)!;
    await queryCultivatorLLMDecision(convoyLeader, departing, config);
    expect(client).toHaveBeenCalledTimes(1);

    const restored = decodeWorldSave(encodeWorldSave(departing));
    expect(restored.relocations).toEqual(departing.relocations);
    const roadside = advanceWorldTick(restored, decisions(restored), () => .99);
    const route = roadside.relocations.plans[0];
    const checkpoint = route.path[route.pathIndex];
    expect(terrainTileAt(roadside, checkpoint.x, checkpoint.y)?.id).not.toBe(terrainTileAt(roadside, origin.x, origin.y)?.id);
    const roadHp = roadside.cultivators.find(({ id }) => id === leader.id)!.hp;
    expect(applyMapBrush(roadside, 'meteor', [origin]).cultivators.find(({ id }) => id === leader.id)?.hp).toBe(roadHp);
    expect(applyMapBrush(roadside, 'meteor', [checkpoint]).cultivators.find(({ id }) => id === leader.id)?.hp).toBeLessThan(roadHp);
    const run = (start: WorldState) => {
      let state = start;
      for (let tick = 0; tick < 8 && state.relocations.plans[0].status !== 'settled'; tick++) {
        state = advanceWorldTick(state, decisions(state), () => .99);
      }
      return state;
    };
    const uninterrupted = run(departing);
    const resumed = run(restored);
    expect(resumed.relocations).toEqual(uninterrupted.relocations);
    expect(resumed.relocations.plans[0]).toMatchObject({ status: 'settled', custody: { stones: 0, pavilion: [] } });
    const settledSect = resumed.sects.find(({ id }) => id === sect.id)!;
    expect(settledSect.headquartersId).toBe(destination.id);
    expect(settledSect.pavilion).toEqual(transit.custody.pavilion);
    expect(settledSect.spiritStones).toBe(transit.custody.stones);
    expect(resumed.relocations.abandonedSites).toHaveLength(1);
    expect(decodeWorldSave(encodeWorldSave(resumed)).relocations).toEqual(resumed.relocations);
  });

  it('loads pre-relocation snapshots without creating votes or spending real resources', () => {
    const { world } = scenario();
    const { relocations: original, ...old } = world;
    const restored = decodeWorldSave(JSON.stringify({ world: old, format: 'ai-sect-sandbox', version: 1 }));
    expect(restored.relocations).toEqual(original);
    expect(restored.sects).toEqual(world.sects);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availablePilgrimageActions, PILGRIMAGE_LEG_COST, pilgrimageCheckpoint } from '../src/engine/pilgrimageEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '静候' };
const publish = <T extends Pick<LLMDecisionPayload, 'pilgrimageMove'>>(fields: T): LLMDecisionPayload =>
  ({ ...fields, chosenAction: 'PILGRIMAGE', innerMonologue: '只按实路共行' });
const restAll = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, rest]),
);
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(13071);
  world.tick = 10;
  const origin = world.locations.find(({ id }) => id === 'loc-taixu')!;
  const [leader, partner, outsider] = world.cultivators;
  for (const person of world.cultivators) {
    person.locationId = person === leader || person === partner ? origin.id : 'loc-market-east';
    person.spiritStones = 100;
    person.exploredTileIds = [];
    person.rumors = [];
    person.hp = person.maxHp;
  }
  const proposal = availablePilgrimageActions(leader, world).find(({ pilgrimageMove, targetCultivatorId }) =>
    pilgrimageMove === 'propose' && targetCultivatorId === partner.id)!;
  const apply = (person: typeof leader, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, person, decision, () => .99);
  return { world, leader, partner, outsider, origin, proposal, apply };
}

describe('pilgrimage live integration and resume', () => {
  it('accepts exactly canonical model options and lets the deterministic brain complete a real trip across a save', async () => {
    const { world, leader, partner, proposal, apply } = fixture();
    const source = vi.fn();
    const completions = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const request = vi.fn(async (_, init?: RequestInit) => {
      expect(init?.body).toEqual(expect.stringContaining('朝山巡礼'));
      return completions(publish({ ...proposal, targetPilgrimageNextStopId: 'forged-secret-site' }));
    });
    vi.stubGlobal('fetch', request);
    const invalid = await queryCultivatorLLMDecision(leader, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(invalid.targetPilgrimageNextStopId).not.toBe('forged-secret-site');
    request.mockImplementation(async () => completions(publish(proposal)));
    const proposed = await queryCultivatorLLMDecision(leader, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(apply(leader, proposed)?.witnessScope).toBe('participants');
    const accepted = computeHeuristicDecision(partner, world, () => .99);
    expect(accepted).toMatchObject({ chosenAction: 'PILGRIMAGE', pilgrimageMove: 'accept' });
    expect(apply(partner, accepted)?.witnessScope).toBe('participants');
    const originSave = decodeWorldSave(encodeWorldSave(world));
    let state = originSave;
    for (let remaining = 15; state.pilgrimages.journeys[0].status === 'active' && remaining > 0; remaining--) {
      const orders = restAll(state);
      // The organizer is deliberately left to the real deterministic AI; the companion may not take a second trip.
      delete orders[leader.id];
      orders[partner.id] = { ...rest, chosenAction: 'EXPLORE', targetLocationId: 'loc-market-east' };
      state = advanceWorldTick(state, orders, () => .99);
      if (state.pilgrimages.journeys[0].path.length) state = decodeWorldSave(encodeWorldSave(state));
    }
    const row = state.pilgrimages.journeys[0];
    expect(row).toMatchObject({ status: 'completed', legIndex: 2, spentByEach: 2 * PILGRIMAGE_LEG_COST, path: [] });
    expect(row.stopsVisited.map(({ locationId }) => locationId)).toEqual(row.stopIds);
    for (const id of [leader.id, partner.id]) {
      expect(state.cultivators.find((person) => person.id === id)).toMatchObject({
        locationId: row.stopIds[2], spiritStones: 100 - 2 * PILGRIMAGE_LEG_COST,
      });
      expect(state.mapPresentation.trails.find(({ cultivatorId }) => cultivatorId === id)).toBeUndefined();
    }
    expect(decodeWorldSave(encodeWorldSave(state)).pilgrimages).toEqual(state.pilgrimages);
  });

  it('uses actual underway position for camera and terrain brush, blocks a phantom duel/exploration at the old stop', () => {
    const { world, leader, partner, outsider, origin, proposal, apply } = fixture();
    expect(apply(leader, publish(proposal))).not.toBeNull();
    const { id: targetPilgrimageId } = world.pilgrimages.journeys[0];
    expect(apply(partner, publish({ pilgrimageMove: 'accept', targetPilgrimageId }))).not.toBeNull();
    world.tick++;
    expect(apply(leader, publish({ pilgrimageMove: 'advance', targetPilgrimageId }))).not.toBeNull();
    const checkpoint = pilgrimageCheckpoint(world, partner)!;
    expect(checkpoint).toBeDefined();
    expect(terrainTileAt(world, checkpoint.x, checkpoint.y)?.id).not.toEqual(terrainTileAt(world, origin.x, origin.y)?.id);
    const view = createTerrainMapView(world, leader, true);
    const mapPositions = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
    expect(view.trailPositions.get(partner.id)).toEqual(checkpoint);
    expect(mapPositions.some(({ actor, x, y }) => actor.id === partner.id && Math.hypot(x - checkpoint.x, y - checkpoint.y) <= 11)).toBe(true);
    outsider.locationId = origin.id;
    expect(apply(outsider, { ...rest, chosenAction: 'DUEL', targetCultivatorId: partner.id })).toBeNull();
    expect(apply(partner, { ...rest, chosenAction: 'EXPLORE', targetLocationId: 'loc-market-east' })).toBeNull();
    const missed = applyMapBrush(world, 'meteor', [origin]);
    const hit = applyMapBrush(world, 'meteor', [checkpoint]);
    for (const actor of [leader, partner]) {
      expect(missed.cultivators.find(({ id }) => id === actor.id)?.hp).toBe(actor.hp);
      expect(hit.cultivators.find(({ id }) => id === actor.id)?.hp).toBeLessThan(actor.hp);
    }
    const corrupt = structuredClone(world);
    corrupt.pilgrimages.journeys[0].spentByEach = 0;
    expect(() => encodeWorldSave(corrupt)).toThrow(/pilgrimages.journeys.spend/);
    corrupt.pilgrimages.journeys[0].spentByEach = PILGRIMAGE_LEG_COST;
    corrupt.pilgrimages.journeys[0].path[1] = { x: 999, y: 599 };
    expect(() => encodeWorldSave(corrupt)).toThrow(/pilgrimages.journeys.path_tile/);
  });

  it('loads an older untouched world without manufacturing pilgrims or costs', () => {
    const { world } = fixture();
    const { pilgrimages, ...legacy } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(restored.pilgrimages).toEqual(pilgrimages);
    expect(restored.cultivators.map(({ spiritStones }) => spiritStones)).toEqual(world.cultivators.map(({ spiritStones }) => spiritStones));
  });
});

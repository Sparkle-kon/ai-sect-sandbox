// Keep the native preparation of furnaceEmergencyNative.test.ts, stopping just before T18.
import { expect } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy } from '../src/engine/alchemyEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableMentorshipActions } from '../src/engine/mentorshipEngine';
import { knownMapLocations, terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const mentorId = 'npc-5';
export const apprenticeId = 'npc-6';
export const furnaceId = 'loc-danxia';
const action = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '只依实际丹炉与在场见证。', ...fields });
const rest = action('REST');
export const brew = action('BREW_PILL', { targetPillId: 'foundation' });
const person = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const site = (world: WorldState, id: string) => world.locations.find(row => row.id === id)!;
const turn = (world: WorldState, orders: Readonly<Record<string, LLMDecisionPayload>> = {}, draw = .95) =>
  advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, orders[id] ?? rest])),
    () => draw, 'utility');
export function beforeNativeFurnaceDamage() {
  let world = createInitialWorld(1, 'spirit-bloom');
  if (person(world, apprenticeId).locationId !== furnaceId) {
    world = turn(world, { [apprenticeId]: action('EXPLORE', { targetLocationId: furnaceId }) });
  }
  const canOfferTuition = () => availableMentorshipActions(person(world, mentorId), world)
    .some(row => row.action === 'TEACH' && row.targetCultivatorId === apprenticeId);
  for (let attempts = 0; attempts < 40 && !canOfferTuition(); attempts++) {
    world = turn(world, { [mentorId]: action('CULTIVATE') });
  }
  expect(canOfferTuition()).toBe(true);
  world = turn(world, { [mentorId]: action('TEACH', { targetCultivatorId: apprenticeId }) });
  const offer = world.mentorship.offers.find(row => row.mentorId === mentorId && row.studentId === apprenticeId)!;
  world = turn(world, { [apprenticeId]: action('ACCEPT_TUITION', { targetTuitionId: offer.id }) });
  const lineage = world.mentorship.lineage.find(row => row.mentorId === mentorId && row.studentId === apprenticeId)!;
  expect(lineage.formedTick).toBe(14);
  for (const [herb, count] of [['jade_leaf', 2], ['earth_root', 1]] as const) {
    for (let attempts = 0; attempts < 6 && person(world, apprenticeId).herbs[herb] < count; attempts++) {
      expect(availableAlchemy(person(world, apprenticeId), world, world.tick + 1))
        .toContainEqual(expect.objectContaining({ action: 'GATHER_HERBS', targetHerbId: herb }));
      world = turn(world, { [apprenticeId]: action('GATHER_HERBS', { targetHerbId: herb }) }, .1);
    }
    expect(person(world, apprenticeId).herbs[herb]).toBeGreaterThanOrEqual(count);
  }
  expect(availableAlchemy(person(world, apprenticeId), world, world.tick + 1))
    .toContainEqual(expect.objectContaining({ action: 'BREW_PILL', targetPillId: 'foundation' }));
  const herbStock = { ...person(world, apprenticeId).herbs };
  world = turn(world, { [apprenticeId]: brew }, .05);
  expect(world.tick).toBe(17);
  expect(world.furnaceReservations.uses).toContainEqual({
    siteId: furnaceId, actorId: apprenticeId, tick: 17, slot: 1, kind: 'brew',
  });
  expect(person(world, apprenticeId).herbs.jade_leaf).toBe(herbStock.jade_leaf - 2);
  expect(person(world, apprenticeId).herbs.earth_root).toBe(herbStock.earth_root - 1);
  const furnace = site(world, furnaceId);
  const tile = terrainTileAt(world, furnace.x, furnace.y);
  if (!tile) throw new Error('Expected the actual furnace tile');
  const adjacent = { x: (tile.col + 1.5) * 1000 / world.terrain.columns,
    y: (tile.row + .5) * 600 / world.terrain.rows };
  world = applyMapBrush(world, 'paint_vein', [adjacent]);
  const refuge = world.locations.find(row => row.id.startsWith('brush-vein-') &&
    row.x === adjacent.x && row.y === adjacent.y)!;
  expect(refuge).toBeDefined();
  expect(knownMapLocations(world, person(world, apprenticeId)).some(row => row.id === refuge.id)).toBe(true);
  world = applyMapBrush(world, 'beast_tide', [furnace]);
  const hazard = world.mapHazards.find(row => row.kind === 'beast_tide' && row.tileId === tile.id)!;
  return { world, hazard, refuge };
}

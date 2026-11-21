import { restoreLegacyExpeditionFixture } from './fixtures/legacyExpeditionFixture';
import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { expeditionRescueCheckpoint } from '../src/engine/expeditionRescueCheckpoint';
import { resolveExpeditionRescueAction } from '../src/engine/expeditionRescueEngine';
import { deriveMapPresentation } from '../src/engine/mapMotionEngine';
import { advanceOccasions, joinOccasion } from '../src/engine/occasionEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';

function fixture() {
  const world = createInitialWorld(8278);
  const [explorer, guide, spare, outsider] = world.cultivators;
  world.tick = 60;
  restoreLegacyExpeditionFixture(world);
  const occasion = world.occasions[0];
  // A longer real exit in this map fixture ensures an intermediate committed turn;
  // the gate has already opened and neither endpoint changes after the route is paid.
  const market = world.locations.find(({ id }) => id === 'loc-market')!;
  market.x -= 80;
  for (const actor of [explorer, guide, spare]) {
    actor.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
    actor.herbs.jade_leaf = 4;
    expect(joinOccasion(world, actor, { chosenAction: 'JOIN_OCCASION', targetOccasionId: occasion.id, innerMonologue: '' })).not.toBeNull();
  }
  explorer.hp = Math.max(1, Math.floor(explorer.maxHp / 3));
  world.tick = occasion.registrationClosesTick;
  advanceOccasions(world, () => 0);
  world.tick++;
  expect(resolveExpeditionRescueAction(world, explorer, {
    chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'signal', targetOccasionId: occasion.id, innerMonologue: '',
  })).not.toBeNull();
  const row = world.expeditionRescues.requests[0];
  world.tick++;
  expect(resolveExpeditionRescueAction(world, guide, {
    chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'accept', targetExpeditionRescueId: row.id, innerMonologue: '',
  })).not.toBeNull();
  expect(row.path.length).toBeGreaterThan(3);
  return { world, explorer, guide, outsider, row };
}

describe('route-backed rescue save and current-observer map', () => {
  it('stores the original party and actual proof without making the path public or adding a flight', () => {
    const { world, explorer, guide, outsider, row } = fixture();
    expect(decodeWorldSave(encodeWorldSave(world)).expeditionRescues).toEqual(world.expeditionRescues);
    const wrong = structuredClone(world);
    wrong.expeditionRescues.requests[0].path[1] = { ...row.path[0] };
    expect(() => encodeWorldSave(wrong)).toThrow('expeditionRescues.requests.path_steps');
    world.tick++;
    advanceOccasions(world, () => .6);
    const point = expeditionRescueCheckpoint(world, explorer)!;
    expect(point).toEqual(row.path[row.pathIndex]);
    expect(row.pathIndex).toBeGreaterThan(0);
    expect(createTerrainMapView(world, guide, false).extractionPositions.get(explorer.id)).toEqual(point);
    expect(createTerrainMapView(world, undefined, false).extractionPositions.size).toBe(0);
    outsider.realm = '练气';
    outsider.locationId = [...world.locations].filter(({ type }) => type !== 'secret_realm').sort((a, b) =>
      Math.hypot(b.x - point.x, b.y - point.y) - Math.hypot(a.x - point.x, a.y - point.y))[0].id;
    const explored = terrainTileAt(world, point.x, point.y)!.id;
    outsider.exploredTileIds = [...new Set([...outsider.exploredTileIds, explored])];
    expect(createTerrainMapView(world, outsider, false).extractionPositions.size).toBe(0);
    expect(createTerrainMapView(world, outsider, false).liveActors.some(({ id }) => id === explorer.id)).toBe(false);
    for (let count = 0; count < row.path.length && row.status === 'extracting'; count++) {
      const previous = structuredClone(world);
      world.tick++;
      const emitted = advanceOccasions(world, () => .6);
      expect(deriveMapPresentation(previous, world, emitted).trails.some(({ cultivatorId }) =>
        cultivatorId === explorer.id || cultivatorId === guide.id)).toBe(false);
    }
    expect(row.status).toBe('rescued');
    expect(new Set(row.arrivedIds)).toEqual(new Set([explorer.id, guide.id]));
    expect(decodeWorldSave(encodeWorldSave(world)).expeditionRescues).toEqual(world.expeditionRescues);
    const fakeArrival = structuredClone(world);
    fakeArrival.expeditionRescues.requests[0].arrivedIds = [explorer.id, outsider.id];
    expect(() => encodeWorldSave(fakeArrival)).toThrow('expeditionRescues.requests.source');
  });
});

import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../src/components/mapCamera';
import { projectUsedVillageMigrationSegments } from '../src/components/villageEvolutionMap';
import { createInitialWorld } from '../src/data/initialWorld';
import type { MapTile, VillageEvolutionMigration } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 42;
  const viewer = world.cultivators[0];
  viewer.realm = '筑基';
  viewer.age = 24;
  viewer.exploredTileIds = [];
  viewer.rumors = [];
  const [origin, destination, elsewhere] = world.settlements.villages;
  const a = world.locations.find(row => row.id === origin.locationId)!;
  const b = world.locations.find(row => row.id === destination.locationId)!;
  a.type = b.type = 'market';
  const path = world.terrain.tiles.filter(({ row, col }) => row === 8 && col >= 2 && col <= 7);
  const center = (tile: MapTile) => ({
    x: (tile.col + .5) * MAP_WIDTH / world.terrain.columns,
    y: (tile.row + .5) * MAP_HEIGHT / world.terrain.rows,
  });
  Object.assign(a, center(path[0])); Object.assign(b, center(path.at(-1)!));
  viewer.locationId = a.id;
  const move: VillageEvolutionMigration = {
    id: 'migration-proof', tick: 39, fromSettlementId: origin.id, toSettlementId: destination.id,
    agreementId: 'old-supply', path: path.map(t => t.id), people: 3, fromBefore: 9, fromAfter: 6,
    toBefore: 12, toAfter: 15, leftJuveniles: 2, leftNamed: 2, households: [],
  };
  world.villageEvolution.migrations = [move];
  world.settlements.records.push({ id: move.id, kind: 'migration', tick: move.tick,
    settlementId: origin.id, targetSettlementId: destination.id, people: 3,
    stones: 0, herbs: 0, description: '' });
  return { world, viewer, b, move, path, center, elsewhere };
}

describe('native historical migration path paint', () => {
  it('keeps known adjacent fragments and does not bridge a hidden intermediate tile', () => {
    const {world, viewer, path, center} = fixture();
    // Both endpoint locations are known markets. Tile 5 still is not known, separating the fragments.
    viewer.exploredTileIds = path.slice(-2).map(t => t.id);
    expect(projectUsedVillageMigrationSegments(world, viewer)).toEqual([
      [center(path[0]), center(path[1])],
      [center(path[1]), center(path[2])],
      [center(path[4]), center(path[5])],
    ]);
    viewer.exploredTileIds.push(path[3].id);
    expect(projectUsedVillageMigrationSegments(world, viewer)).toHaveLength(5);
  });

  it('requires a known counterpart, real physical presence and an exact native migration receipt', () => {
    const {world, viewer, b, elsewhere, move, path} = fixture();
    b.type = 'spirit_vein';
    expect(projectUsedVillageMigrationSegments(world, viewer)).toEqual([]);
    viewer.exploredTileIds = path.map(row => row.id);
    expect(projectUsedVillageMigrationSegments(world, viewer)).toHaveLength(5);
    const oldLocation = viewer.locationId;
    viewer.locationId = elsewhere.locationId;
    expect(projectUsedVillageMigrationSegments(world, viewer)).toEqual([]);
    viewer.locationId = oldLocation;
    world.settlements.records.find(row => row.id === move.id)!.people = 1;
    expect(projectUsedVillageMigrationSegments(world, viewer)).toEqual([]);
    expect(projectUsedVillageMigrationSegments(world, { ...viewer })).toEqual([]);
  });

  it('rejects malformed skipped waypoints rather than inferring a usable path', () => {
    const {world, viewer, move, path} = fixture();
    viewer.exploredTileIds = path.map(row => row.id);
    move.path.splice(2, 1);
    expect(projectUsedVillageMigrationSegments(world, viewer)).toEqual([]);
  });
});

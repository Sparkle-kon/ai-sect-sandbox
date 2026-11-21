import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { advanceRoads, availableRoadActions, availableRoadPilgrimageRoutes, beginRoadPilgrimageCrossing, ROAD_FARE,
  resolveRoadAction, roadCrossingForLeg, visibleRoadCrossings, visibleRoads } from '../src/engine/roadEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, MapPoint, PilgrimageJourney, RoadMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(7);
  const sect = world.sects.find(({ id }) => id === 'sect-danxia')!;
  const anchor = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const other = world.locations.find(({ id }) => id === 'loc-market')!;
  const spare = world.locations.find(({ id }) => id === 'loc-market-east')!;
  const founder = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const [companion, stranger] = world.cultivators.filter(({ id, sectId }) => id !== founder.id && sectId !== sect.id);
  for (const actor of [founder, companion]) {
    actor.locationId = anchor.id;
    actor.herbs.earth_root = 12;
    actor.spiritStones = 100;
  }
  stranger.locationId = spare.id;
  // Known realistic surveyed strip; hidden off-strip cells may not affect this charter.
  const from = terrainTileAt(world, anchor.x, anchor.y)!;
  const to = terrainTileAt(world, other.x, other.y)!;
  const surveyed = world.terrain.tiles.filter((tile) => tile.col >= from.col && tile.col <= to.col &&
    tile.row >= from.row && tile.row <= to.row).map(({ id }) => id);
  const freePath: MapPoint[] = [{ x: anchor.x, y: anchor.y }];
  for (let col = from.col + 1; col <= to.col; col++) freePath.push({ x: col * 40 + 20, y: from.row * 40 + 20 });
  for (let row = from.row + 1; row <= to.row; row++) freePath.push({ x: to.col * 40 + 20, y: row * 40 + 20 });
  freePath.push({ x: other.x, y: other.y });
  const act = (actor: Cultivator, roadMove: RoadMove, ref = roadMove === 'charter' ? other.id : 'road-1') =>
    resolveRoadAction(world, actor, { chosenAction: 'ROAD', roadMove, innerMonologue: '',
      ...(roadMove === 'charter' ? { targetLocationId: ref } : { targetRoadId: ref }) });
  const open = () => {
    founder.exploredTileIds.push(...surveyed);
    expect(act(founder, 'charter')).not.toBeNull();
    return world.roads.links[0];
  };
  const journey: PilgrimageJourney = { id: 'pilgrimage-1', organizerId: founder.id, companionId: companion.id,
    stopIds: [anchor.id, other.id, spare.id], stopsVisited: [{ locationId: anchor.id, tick: 1 }],
    status: 'active', proposedTick: 1, offerExpiresTick: 4, startedTick: 1, expiresTick: 17, legIndex: 0,
    path: [], pathIndex: 0, spentByEach: 0, aid: [] };
  return { world, sect, anchor, other, founder, companion, stranger, surveyed, freePath, journey, act, open };
}

describe('lawful road upkeep and optional pilgrim crossing', () => {
  it('charts the actual orthogonal route only with a qualified sect signer and surveyed tiles', () => {
    const { world, sect, anchor, other, founder, companion, stranger, act, open } = fixture();
    const stones = sect.spiritStones, roots = founder.herbs.earth_root;
    expect(availableRoadActions(founder, world)).not.toContainEqual({ action: 'ROAD', roadMove: 'charter', targetLocationId: other.id });
    expect(act(companion, 'charter')).toBeNull();
    const road = open();
    expect(road.path[0]).toEqual({ x: anchor.x, y: anchor.y });
    expect(road.path.at(-1)).toEqual({ x: other.x, y: other.y });
    const tiles = road.path.map((point) => terrainTileAt(world, point.x, point.y)!);
    expect(tiles.slice(1).every((tile, i) => Math.abs(tile.col - tiles[i].col) + Math.abs(tile.row - tiles[i].row) === 1)).toBe(true);
    expect(act(founder, 'charter')).toBeNull();
    expect(sect.spiritStones).toBe(stones - 30);
    expect(founder.herbs.earth_root).toBe(roots - 3);
    expect(world.resourceFlow.months.flatMap(({ entries }) => entries)).toMatchObject([
      { reason: 'road_charter', kind: 'consumption', good: 'stone', amount: 30 },
      { reason: 'road_charter', kind: 'consumption', good: 'earth_root', amount: 3 },
    ]);
    expect(visibleRoads(world, stranger)).toEqual([]);
    expect(visibleRoads(world, companion)[0]).not.toHaveProperty('path');
  });

  it('deteriorates by actual exposure once, repairs from measured stock, and does not close the underlying free graph', () => {
    const { world, sect, anchor, other, founder, act, open } = fixture();
    const road = open();
    world.tick = 3;
    const cell = terrainTileAt(world, road.path[2].x, road.path[2].y)!;
    world.mapHazards.push({ id: 'storm', kind: 'meteor', tileId: cell.id, createdTick: 3, expiresTick: 4, intensity: 3 },
      { id: 'miasma', kind: 'cursed_miasma', tileId: cell.id, createdTick: 3, expiresTick: 4, intensity: 2 });
    advanceRoads(world);
    advanceRoads(world);
    expect(road.condition).toBe(54);
    const bank = sect.spiritStones, roots = founder.herbs.earth_root;
    expect(act(founder, 'maintain')).not.toBeNull();
    expect(road.condition).toBe(78);
    expect(sect.spiritStones).toBe(bank - 12);
    expect(founder.herbs.earth_root).toBe(roots - 2);
    expect(act(founder, 'patrol')).toBeNull();
    world.tick = 4;
    expect(act(founder, 'patrol')).not.toBeNull();
    expect(road.condition).toBe(84);
    expect(act(founder, 'patrol')).toBeNull();
    delete anchor.ownerSectId;
    advanceRoads(world);
    expect(road).toMatchObject({ closedTick: world.tick, closeReason: 'title_lost' });
    expect(findMapPath(world, anchor, other).length).toBeGreaterThan(1);
  });

  it('only charges the consenting organizer once for a provably faster actual paid leg', () => {
    const { world, sect, founder, companion, stranger, surveyed, freePath, journey, open } = fixture();
    const road = open();
    world.tick = 2;
    world.pilgrimages.journeys.push(journey);
    const candidates = () => availableRoadPilgrimageRoutes(world, journey, founder, companion, freePath, 5);
    expect(candidates()).toEqual([]); // Companion did not yet survey the whole optional route.
    companion.exploredTileIds.push(...surveyed);
    expect(availableRoadPilgrimageRoutes(world, journey, founder, companion, freePath, 20)).toEqual([]); // No temporal gain, no fare.
    founder.spiritStones = 11;
    expect(candidates()).toEqual([]);
    founder.spiritStones = 12;
    expect(candidates()).toHaveLength(1);
    const before = sect.spiritStones;
    const paid = beginRoadPilgrimageCrossing(world, journey, founder, companion, road.id, freePath, 5)!;
    expect(paid.path.length - 1).toBe(8);
    expect(freePath.length - 1).toBe(9);
    expect(founder.spiritStones).toBe(8); // Canonical pilgrim engine then collects the unchanged base fee.
    expect(companion.spiritStones).toBe(100);
    expect(sect.spiritStones).toBe(before + ROAD_FARE);
    expect(beginRoadPilgrimageCrossing(world, journey, founder, companion, road.id, freePath, 5)).toBeUndefined();
    journey.path = paid.path;
    expect(roadCrossingForLeg(world, journey)).toMatchObject({ fee: 4, stride: 8, paidSteps: 8, freeSteps: 9 });
    expect(visibleRoadCrossings(world, stranger)).toEqual([]);
    expect(visibleRoadCrossings(world, companion)).toHaveLength(1);
    expect(world.resourceFlow.months.at(-1)?.entries.map(({ reason }) => reason)).toEqual(['road_crossing']);
    road.condition = 0;
    world.tick += 1;
    advanceRoads(world);
    expect(roadCrossingForLeg(world, journey)?.stride).toBe(8); // Already signed payment, no midway change or new charge.
  });
});

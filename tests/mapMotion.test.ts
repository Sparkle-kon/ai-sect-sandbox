import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { deriveMapPresentation, findMapPath } from '../src/engine/mapMotionEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldEvent } from '../src/types/world';

describe('terrain-weighted world motion and effect snapshots', () => {
  it('deterministically avoids a costly path when a slightly longer safe route is cheaper', () => {
    const world = createInitialWorld();
    for (const tile of world.terrain.tiles) tile.biome = '坊市';
    for (const col of [1, 2, 3]) world.terrain.tiles[col].biome = '魔渊';
    const source = { x: 20, y: 20 }; const goal = { x: 180, y: 20 };
    const route = findMapPath(world, source, goal);
    expect(route[0]).toEqual(source); expect(route.at(-1)).toEqual(goal);
    expect(route.some(({ y }) => y === 60)).toBe(true);
    expect(route.every(({ x, y }) => terrainTileAt(world, x, y)?.biome === '坊市')).toBe(true);
    expect(route).toEqual(findMapPath(world, source, goal));
    expect(findMapPath(world, source, source)).toEqual([source]);
    expect(findMapPath(world, source, { x: 21, y: 21 })).toEqual([source, { x: 21, y: 21 }]);
    expect(findMapPath(world, { x: -1, y: 0 }, goal)).toEqual([]);
  });

  it('generates a route for a real movement and actual HP loss and breakthrough effects', () => {
    const before = createInitialWorld();
    const next = structuredClone(before);
    const [actor, other] = next.cultivators;
    next.tick++;
    const oldLocation = actor.locationId;
    const destination = next.locations.find(({ id }) => id !== oldLocation)!;
    actor.locationId = destination.id;
    actor.hp -= 25;
    other.realmStage++;
    const snapshot = deriveMapPresentation(before, next, []);
    expect(snapshot.trails).toHaveLength(1);
    expect(snapshot.trails[0]).toMatchObject({ cultivatorId: actor.id, tick: next.tick, fromLocationId: oldLocation, toLocationId: destination.id });
    expect(snapshot.trails[0].points.at(-1)).toEqual({ x: destination.x, y: destination.y });
    expect(snapshot.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'damage', actorIds: [actor.id], text: '−25 HP', locationId: destination.id }),
      expect.objectContaining({ kind: 'breakthrough', actorIds: [other.id] }),
    ]));
    expect(before.cultivators[0].locationId).toBe(oldLocation);
  });

  it('prefers exact applied damage, saves real clash/lightning effects, and merges same tick interventions', () => {
    const before = createInitialWorld();
    const next = structuredClone(before); next.tick++;
    const [actor, other] = next.cultivators;
    actor.hp -= 37;
    const clash: WorldEvent = { id: 'test-duel', tick: next.tick, year: next.year, month: next.month, title: '斗法',
      description: '斗法', category: 'combat', locationId: actor.locationId, actorIds: [actor.id, other.id],
      duelWinnerId: other.id, damage: [{ cultivatorId: actor.id, amount: 40 }] };
    next.mapPresentation = deriveMapPresentation(before, next, [clash]);
    expect(next.mapPresentation.effects.map(({ kind }) => kind)).toEqual(['clash', 'damage']);
    expect(next.mapPresentation.effects[1].text).toBe('−40 HP');
    const following = structuredClone(next);
    const lightning: WorldEvent = { ...clash, id: 'evt-god-strike-test', duelWinnerId: undefined, damage: undefined, category: 'heavenly', title: '神雷' };
    expect(deriveMapPresentation(next, following, [clash, lightning]).effects.map(({ kind }) => kind)).toEqual(['clash', 'damage', 'lightning']);
    following.tick++;
    expect(deriveMapPresentation(next, following, [clash, lightning])).toEqual({ tick: following.tick, trails: [], effects: [] });
  });
});

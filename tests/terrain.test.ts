import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { currentVisibleTileIds, generateTerrain, knownMapLocations, noteTerrainVisit, terrainTileAt } from '../src/engine/terrainEngine';
import type { LocationNode } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const actor = world.cultivators[0];
  const template = world.locations[0];
  const home: LocationNode = { ...template, id: 'test-hq', type: 'sect_hq', ownerSectId: actor.sectId, x: 160, y: 160, spiritQi: 95 };
  const near: LocationNode = { ...template, id: 'near', type: 'spirit_vein', ownerSectId: undefined, x: 200, y: 160, spiritQi: 90 };
  const hidden: LocationNode = { ...template, id: 'concealed', type: 'secret_realm', ownerSectId: undefined, x: 870, y: 480, spiritRoot: '雷' };
  const market: LocationNode = { ...template, id: 'public-market', type: 'market', ownerSectId: undefined, x: 720, y: 480 };
  world.locations = [home, near, hidden, market];
  world.terrain = generateTerrain(world.locations, 660);
  world.tick = 30;
  actor.locationId = home.id;
  actor.realm = '练气';
  actor.exploredTileIds = [];
  actor.rumors = [];
  return { world, actor, home, near, hidden, market };
}

describe('seeded terrain and per-NPC fog of war', () => {
  it('creates indexed grid tiles deterministically, independent of location insertion order', () => {
    const { world } = fixture();
    const terrain = world.terrain;
    expect(terrain.columns).toBe(25);
    expect(terrain.rows).toBe(15);
    expect(new Set(terrain.tiles.map(({ id }) => id)).size).toBe(375);
    expect(generateTerrain([...world.locations].reverse(), terrain.seed)).toEqual(terrain);
    expect(generateTerrain(world.locations, terrain.seed + 1)).not.toEqual(terrain);
    expect(terrain.tiles.every(({ spiritQi }) => spiritQi >= 5 && spiritQi <= 100)).toBe(true);
  });

  it('anchors market, secret realm and HQ terrain and handles map coordinate edges', () => {
    const { world, actor, home, market, hidden } = fixture();
    expect(terrainTileAt(world, home.x, home.y)).toMatchObject({ biome: '灵山', ownerSectId: actor.sectId });
    expect(terrainTileAt(world, market.x, market.y)?.biome).toBe('坊市');
    expect(terrainTileAt(world, hidden.x, hidden.y)?.biome).toBe('剑冢');
    expect(terrainTileAt(world, 0, 0)?.id).toBe('tile-0-0');
    expect(terrainTileAt(world, 1000, 600)?.id).toBe('tile-24-14');
    expect(terrainTileAt(world, -1, 0)).toBeUndefined();
    expect(terrainTileAt(world, 0, 601)).toBeUndefined();
    expect(terrainTileAt(world, NaN, 0)).toBeUndefined();
  });

  it('limits current visibility, then persists exploration without leaking a hidden site before arrival', () => {
    const { world, actor, near, hidden, market } = fixture();
    const ids = () => knownMapLocations(world, actor).map(({ id }) => id);
    expect(ids()).toContain(market.id);
    expect(ids()).toContain(near.id);
    expect(ids()).not.toContain(hidden.id);
    expect(actor.exploredTileIds).toEqual([]);
    noteTerrainVisit(world, actor);
    const initialCount = actor.exploredTileIds.length;
    expect(initialCount).toBe(13);
    noteTerrainVisit(world, actor);
    expect(actor.exploredTileIds).toHaveLength(initialCount);
    actor.locationId = hidden.id;
    noteTerrainVisit(world, actor);
    actor.locationId = market.id;
    expect(currentVisibleTileIds(world, actor).has(terrainTileAt(world, hidden.x, hidden.y)!.id)).toBe(false);
    expect(ids()).toContain(hidden.id);
    expect(ids()).toContain(near.id);
    actor.alive = false;
    expect(currentVisibleTileIds(world, actor).size).toBe(0);
  });

  it('admits only fresh credible rumor destinations and does not persist them as exploration', () => {
    const { world, actor, hidden } = fixture();
    actor.rumors = [{ id: 'rumor-forged-29-npc', subject: '秘境', originTick: 29, learnedTick: 30,
      provenance: 'conversation', hops: 1, confidence: 65, lead: true, locationId: hidden.id }];
    const revealed = () => knownMapLocations(world, actor).some(({ id }) => id === hidden.id);
    expect(revealed()).toBe(false);
    actor.rumors[0].id = 'real-witness';
    expect(revealed()).toBe(true);
    expect(actor.exploredTileIds).toEqual([]);
    world.tick = 40;
    expect(revealed()).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceMapHazards, applyMapBrush } from '../src/engine/mapBrushEngine';
import { knownMapLocations, terrainTileAt } from '../src/engine/terrainEngine';

describe('world brushes and evolving tile hazards', () => {
  it('deduplicates, bounds strokes, and leaves invalid input unchanged', () => {
    const world = createInitialWorld();
    expect(applyMapBrush(world, 'paint_vein', [{ x: -5, y: 2 }, { x: NaN, y: 10 }])).toBe(world);
    const points = world.terrain.tiles.slice(0, 25).map(({ col, row }) => ({ x: (col + .5) * 40, y: (row + .5) * 40 }));
    const next = applyMapBrush(world, 'meteor', [points[0], ...points]);
    expect(next.mapHazards).toHaveLength(18);
    expect(new Set(next.mapHazards.map(({ tileId }) => tileId)).size).toBe(18);
    expect(world.mapHazards).toEqual([]);
    expect(next.interventionSequence).toBe(world.interventionSequence + 1);
  });

  it('paints a persistent point-of-interest without duplicating it and makes it mechanically discoverable', () => {
    const world = createInitialWorld();
    const point = { x: 20, y: 20 };
    const initial = terrainTileAt(world, point.x, point.y)!.spiritQi;
    const next = applyMapBrush(world, 'paint_vein', [point, point]);
    const vein = next.locations.find(({ id }) => id === 'brush-vein-tile-0-0')!;
    expect(vein).toMatchObject({ type: 'spirit_vein', spiritQi: Math.min(100, initial + 20), ...point });
    expect(next.mapHazards).toHaveLength(0);
    expect(terrainTileAt(next, point.x, point.y)).toMatchObject({ biome: '灵山', spiritQi: vein.spiritQi });
    const nextAgain = applyMapBrush(next, 'paint_vein', [point]);
    expect(nextAgain.locations.filter(({ id }) => id === vein.id)).toHaveLength(1);
    const actor = nextAgain.cultivators[0];
    actor.locationId = vein.id;
    expect(knownMapLocations(nextAgain, actor).map(({ id }) => id)).toContain(vein.id);
  });

  it('meteor drains tile and site qi and emits real applied damage, but never deals recurring harm', () => {
    const world = createInitialWorld();
    const resident = world.cultivators[0];
    const place = world.locations.find(({ id }) => id === resident.locationId)!;
    const initialQi = terrainTileAt(world, place.x, place.y)!.spiritQi;
    const next = applyMapBrush(world, 'meteor', [place, place]);
    const nextResident = next.cultivators[0];
    const hit = next.events[0].damage?.find(({ cultivatorId }) => cultivatorId === resident.id);
    expect(hit?.amount).toBe(resident.hp - nextResident.hp);
    expect(hit!.amount).toBeGreaterThan(0);
    expect(terrainTileAt(next, place.x, place.y)?.spiritQi).toBe(Math.max(5, initialQi - 24));
    expect(next.locations.find(({ id }) => id === place.id)?.spiritQi).toBe(Math.max(5, place.spiritQi - 18));
    expect(next.mapPresentation.effects.some(({ kind }) => kind === 'damage')).toBe(true);
    const hp = nextResident.hp;
    next.tick++;
    expect(advanceMapHazards(next)).toEqual([]);
    expect(nextResident.hp).toBe(hp);
  });

  it('hazards affect new arrivals, beast tide is nonlethal and statuses stop at expiration', () => {
    const world = createInitialWorld();
    const [resident, visitor] = world.cultivators;
    const place = world.locations.find(({ id }) => id === resident.locationId)!;
    visitor.locationId = world.locations.find(({ id }) => id !== place.id)!.id;
    const next = applyMapBrush(world, 'beast_tide', [place]);
    const nextVisitor = next.cultivators[1];
    nextVisitor.hp = 4;
    expect(advanceMapHazards(next)).toEqual([]);
    nextVisitor.locationId = place.id;
    next.tick++;
    const events = advanceMapHazards(next);
    expect(events[0].damage).toContainEqual({ cultivatorId: visitor.id, amount: 3 });
    expect(nextVisitor.hp).toBe(1);
    expect(nextVisitor.alive).toBe(true);
    next.events.unshift(...events);
    expect(advanceMapHazards(next)).toEqual([]);
    next.tick = next.mapHazards[0].expiresTick;
    expect(advanceMapHazards(next)).toEqual([]);
    expect(next.mapHazards).toEqual([]);
  });

  it('miasma can be lethal, aborts the affected trial, and leaves authored inheritance', () => {
    const world = createInitialWorld();
    const resident = world.cultivators[0];
    const place = world.locations.find(({ id }) => id === resident.locationId)!;
    resident.hp = 1;
    resident.authoredTechnique = { id: 'miasma-scroll', name: '遗经', spiritRoot: '土' };
    resident.tribulation = { id: 'trial', targetRealm: '化神', startedTick: 0, stage: 'lightning', nextWave: 1,
      totalWaves: 5, pressure: 0, interruptions: 0 };
    const next = applyMapBrush(world, 'cursed_miasma', [place]);
    next.tick++;
    expect(advanceMapHazards(next)[0].category).toBe('death');
    expect(next.cultivators[0]).toMatchObject({ alive: false, hp: 0, tribulation: { stage: 'failed' } });
    expect(next.locations.find(({ id }) => id === place.id)?.inheritanceScrolls).toContainEqual(resident.authoredTechnique);
  });
});

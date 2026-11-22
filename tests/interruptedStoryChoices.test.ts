import { describe, expect, it } from 'vitest';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { actualDestinyOrdinary, destinyActor } from './destinyTraitNativeFixture';

describe('a same-frame celestial interruption', () => {
  it('leaves a valid save if a native meteor kills the newly broken-through actor before choosing', () => {
    const { advanced } = actualDestinyOrdinary();
    const actor = destinyActor(advanced);
    expect(actor.destinyTraits?.pending).toBeDefined();
    const site = advanced.locations.find(row => row.id === actor.locationId);
    if (!site) throw new Error('Expected the real breakthrough site');
    let world = advanced;
    for (let n = 0; n < 4 && destinyActor(world).alive; n++) {
      world = applyMapBrush(world, 'meteor', [{ x: site.x, y: site.y }]);
    }
    expect(world.tick).toBe(advanced.tick);
    expect(destinyActor(world)).toMatchObject({ alive: false, hp: 0 });
    expect(destinyActor(world).destinyTraits).toBeUndefined();
    expect(world.events.some(event => event.category === 'death' && event.actorIds.includes(actor.id))).toBe(true);
    const saved = encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(saved))).toBe(saved);
  });
});

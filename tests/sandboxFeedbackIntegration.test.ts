import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { closestViewportTarget, viewportPixelDistance } from '../src/components/mapCamera';
import type { Cultivator } from '../src/types/world';

describe('mobile preview and open-ended world feedback', () => {
  it('honors a fingertip-sized target and chooses the nearest visible marker at handset width', () => {
    const size = { width: 328, height: 196.8 };
    const camera = { zoom: 1, x: 0, y: 0 };
    const marks = [{ id: 'farther', x: 150, y: 100 }, { id: 'nearest', x: 173, y: 100 }, { id: 'outside', x: -8, y: 100 }];
    expect(closestViewportTarget(marks, camera, { x: 200, y: 100 }, size, 22)?.id).toBe('nearest');
    expect(closestViewportTarget(marks, camera, { x: 280, y: 100 }, size, 22)).toBeUndefined();
    expect(closestViewportTarget(marks, camera, { x: 0, y: 100 }, size, 22)).toBeUndefined();
    expect(viewportPixelDistance({ x: 100, y: 50 }, { x: 127, y: 50 }, size)).toBeLessThan(9);
  });

  it('round-trips more than 500 characters without a roster-size cutoff', () => {
    const world = createInitialWorld();
    const template = world.cultivators[0];
    const newcomers: Cultivator[] = Array.from({ length: 510 }, (_, index) => ({
      ...structuredClone(template), id: `large-roster-${index}`, name: `多世界修士 ${index}`, artifacts: [], memories: [],
      coreMemories: [], reflections: [], rumors: [],
    }));
    world.cultivators.push(...newcomers);
    const restored = decodeWorldSave(encodeWorldSave(world));
    expect(restored.cultivators).toHaveLength(world.cultivators.length);
    expect(restored.cultivators.at(-1)?.id).toBe('large-roster-509');
  });

  it('loads a previous village snapshot and initializes future cohort generations without resetting population', () => {
    const origin = createInitialWorld(48);
    const oldVillages = origin.settlements.villages.map(({ nextVolunteerSequence: _sequence, juvenileCohorts: _young, ...historical }) => historical);
    const old = { ...origin, settlements: { ...origin.settlements, villages: oldVillages } };
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: old }));
    expect(restored.settlements.villages.map(({ population }) => population)).toEqual(oldVillages.map(({ population }) => population));
    expect(restored.settlements.villages.every(({ nextVolunteerSequence, juvenileCohorts }) =>
      nextVolunteerSequence >= 5 && juvenileCohorts.length === 0)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveAvatarSnapshot } from '../src/engine/avatarRuntime';
import { encodeWorldSave, decodeWorldSave } from '../src/engine/storageEngine';
import { actorFallbackRandom, createWorldRandom, randomFromState } from '../src/engine/worldRandom';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';

const offline = { enabled: false, apiBaseUrl: '', apiKey: '', model: '' };
async function through(world: WorldState, goal: number): Promise<WorldState> {
  while (world.tick < goal) {
    if (world.tick === 9) world = executeGodIntervention(world, { type: 'SPAWN_TREASURE', targetLocationId: 'loc-danxia' });
    if (world.tick === 15) {
      const target = world.cultivators.find(({ alive }) => alive);
      if (target) world = (await resolveAvatarSnapshot(world, {
        mode: 'ring', intent: 'guide', targetCultivatorId: target.id, message: '先稳道心，再续修为。',
      }, offline)).world;
    }
    world = advanceWorldTick(world);
  }
  return world;
}

describe('versioned seeded playback', () => {
  it('replays all 24 months across a fresh tick-12 save and the same intervention stream', async () => {
    const start = createInitialWorld(50421);
    const untouched = JSON.stringify(start);
    const continuous = await through(start, 24);
    const midpoint = await through(createInitialWorld(50421), 12);
    const restored = decodeWorldSave(encodeWorldSave(midpoint));
    expect(restored.random).toEqual(midpoint.random);
    expect(JSON.stringify(await through(restored, 24))).toBe(JSON.stringify(continuous));
    expect(JSON.stringify(start)).toBe(untouched);
    expect(midpoint.random.state).not.toBe(midpoint.random.seed);
    expect(midpoint.events.some(({ id }) => id.startsWith('evt-god-treasure-9-'))).toBe(true);
  });

  it('isolates concurrent per-actor fallbacks and accepts the integer seed range only', () => {
    const a = createInitialWorld(0);
    const b = createInitialWorld(4294967295);
    expect(a.terrain).not.toEqual(b.terrain);
    expect(() => createInitialWorld(-1)).toThrow(RangeError);
    expect(() => createInitialWorld(2.5)).toThrow(RangeError);
    const r = actorFallbackRandom(a, 'npc-1', 2);
    const values = [r(), r()];
    const other = actorFallbackRandom(a, 'npc-2', 2);
    expect(other()).not.toBe(values[0]);
    const parallel = actorFallbackRandom(a, 'npc-1', 2);
    expect([parallel(), parallel()]).toEqual(values);
    expect(a.random.state).toBe(0);
    const state = createWorldRandom(29);
    const first = randomFromState(state);
    first();
    const restored = randomFromState(structuredClone(state));
    expect(restored()).toBe(first());
  });
});

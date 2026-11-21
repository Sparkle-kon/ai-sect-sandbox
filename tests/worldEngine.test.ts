import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceWorldTick,
  executeGodIntervention,
} from '../src/engine/worldEngine';

describe('WorldEngine core simulation loop', () => {
  it('initializes 4 sects, 7 locations, and 8 alive cultivators', () => {
    const world = createInitialWorld();
    expect(world.sects).toHaveLength(4);
    expect(world.locations.length).toBeGreaterThanOrEqual(7);
    expect(world.cultivators).toHaveLength(16);
    expect(world.cultivators.every((c) => c.alive)).toBe(true);
  });

  it('advances tick and calendar months properly across year boundaries', () => {
    let world = createInitialWorld();
    for (let i = 0; i < 12; i++) {
      world = advanceWorldTick(world, undefined, () => 0.5);
    }
    expect(world.tick).toBe(13);
    expect(world.year).toBe(1002);
    expect(world.month).toBe(1);
  });

  it('handles God Console interventions (SPAWN_TREASURE, TRIBULATION_STRIKE, WHISPER_MIND)', () => {
    let world = createInitialWorld();
    const target = world.cultivators[0];

    // 1. Whisper mind
    world = executeGodIntervention(world, {
      type: 'WHISPER_MIND',
      targetCultivatorId: target.id,
      whisperText: '踏平血月魔宗！',
    });
    expect(world.cultivators[0].secretGoal).toBe('踏平血月魔宗！');

    // 2. Tribulation strike reduces HP
    const hpBefore = world.cultivators[0].hp;
    world = executeGodIntervention(world, {
      type: 'TRIBULATION_STRIKE',
      targetCultivatorId: target.id,
    });
    expect(world.cultivators[0].hp).toBeLessThan(hpBefore);

    // 3. Spawn treasure increases location spiritQi
    const locBefore = world.locations[0].spiritQi;
    world = executeGodIntervention(world, {
      type: 'SPAWN_TREASURE',
      targetLocationId: world.locations[0].id,
    });
    expect(world.locations[0].spiritQi).toBeGreaterThan(locBefore);
  });
});

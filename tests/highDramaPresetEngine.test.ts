import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildHighDramaPreset } from '../src/engine/highDramaPresetEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';

describe('native high-drama launch isolation', () => {
  it('opens deterministic independent worlds at their exact authored date, never inheriting the current save or player', () => {
    const plain = createInitialWorld(1, 'spirit-bloom');
    const originalGoal = plain.cultivators.find(row => row.id === 'npc-3')?.secretGoal;
    const [storm, tournament, cold] = (['storm-at-blood-moon', 'tournament-eve', 'cold-jade-disciple'] as const)
      .map(id => buildHighDramaPreset(id)!);
    for (const [opening, id, tick, focalActor, site] of [
      [storm, 'storm-at-blood-moon', 7, 'npc-3', 'loc-blood'],
      [tournament, 'tournament-eve', 62, 'npc-2', 'loc-market'],
      [cold, 'cold-jade-disciple', 3, 'recruit-village-loc-vein-north-vol-1', 'loc-vein-north'],
    ] as const) {
      expect(opening).toMatchObject({ focusActorId: focalActor, focusLocationId: site,
        world: { tick, builtinScenarioOrigin: { version: 1, id, openedTick: tick },
          random: { seed: 1 }, worldgen: { seed: 1, profileId: 'spirit-bloom' }, interventionSequence: 0 } });
      expect(opening.world.authoredEraOrigin).toBeUndefined();
      expect(opening.world.scenarioOrigin).toBeUndefined();
      expect(opening.world.playerAvatar.possessedId).toBeUndefined();
      expect(opening.world.cultivators.find(row => row.id === 'npc-3')?.secretGoal).toBe(originalGoal);
      expect(sameGeneratedWorld(opening.world, plain)).toBe(false);
      const again = buildHighDramaPreset(id)!;
      expect(sameGeneratedWorld(opening.world, again.world)).toBe(true);
      expect(again).toEqual(opening);
      expect(again.world).not.toBe(opening.world);
      expect(again.world.cultivators[0]).not.toBe(opening.world.cultivators[0]);
    }
    expect(sameGeneratedWorld(storm.world, tournament.world)).toBe(false);
    expect(sameGeneratedWorld(storm.world, cold.world)).toBe(false);
    expect(sameGeneratedWorld(cold.world, tournament.world)).toBe(false);
  });

  it('does not parse unregistered labels, inherited keys or supplied save blobs', () => {
    for (const fake of [null, 1, 'constructor', '__proto__', '  tournament-eve',
      { id: 'storm-at-blood-moon', openedTick: 7, world: createInitialWorld() }]) {
      expect(buildHighDramaPreset(fake)).toBeUndefined();
    }
  });
});

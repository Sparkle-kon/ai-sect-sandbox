/// <reference types="vite/client" />
import scenarioGuide from '../docs/scenario-fixtures.md?raw';
import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildWorldAnalytics } from '../src/engine/analyticsEngine';
import { createScenarioFixture, decodeScenarioFixture, replayScenario } from '../src/engine/scenarioEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { currentVisibleTileIds, terrainTileAt } from '../src/engine/terrainEngine';
import { createTimeline, readTimelineHead, recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';

describe('portable scenario world identity', () => {
  it('persists a scenario origin through normal play and separates same-seed, same-profile scripted branches', () => {
    const seed = 32;
    const withGift = replayScenario(createScenarioFixture(seed, 'spirit-bloom', 3, [
      { tick: 1, command: { type: 'SPAWN_TREASURE', targetLocationId: 'loc-taixu' } },
    ]));
    const alternate = replayScenario(createScenarioFixture(seed, 'spirit-bloom', 3, [
      { tick: 1, command: { type: 'DEMONIC_TIDE' } },
    ]));
    expect(withGift.tick).toBe(3);
    expect(withGift.scenarioOrigin).toMatchObject({ endTick: 3, ruleset: 1, version: 1 });
    expect(sameGeneratedWorld(withGift, alternate)).toBe(false);
    expect(sameGeneratedWorld(withGift, createInitialWorld(seed, 'spirit-bloom'))).toBe(false);
    const timeline = createTimeline(withGift);
    expect(recordTimelineWorld(timeline, alternate)).toBe(timeline);
    const later = advanceWorldTick(withGift, {}, undefined, 'utility');
    const advancedTimeline = recordTimelineWorld(timeline, later);
    expect(readTimelineHead(advancedTimeline)?.tick).toBe(4);
    expect(buildWorldAnalytics(later, [{ tick: 3, world: alternate }]).coverage.snapshotCount).toBe(1);
    expect(buildWorldAnalytics(later, [{ tick: 3, world: withGift }]).coverage.snapshotCount).toBe(2);
    expect(decodeWorldSave(encodeWorldSave(later)).scenarioOrigin).toEqual(withGift.scenarioOrigin);
  });

  it('replays the copyable documentation example without importing any extra configuration', () => {
    const example = scenarioGuide.split('```json\n')[1]?.split('\n```')[0];
    expect(example).toBeDefined();
    const fixture = decodeScenarioFixture(example!);
    expect(fixture.commands).toHaveLength(2);
    const replayed = replayScenario(fixture);
    expect(replayed.tick).toBe(4);
    expect(replayed.interventionSequence).toBe(2);
  });

  it('keeps scenario fog and visited-grid order unchanged when scanning only the local neighborhood', () => {
    const world = replayScenario(createScenarioFixture(28, 'fractured-frontier', 2));
    const actor = world.cultivators[0];
    for (const realm of ['练气', '金丹', '炼虚'] as const) {
      actor.realm = realm;
      for (const site of world.locations) {
        actor.locationId = site.id;
        const focus = terrainTileAt(world, site.x, site.y)!;
        const radius = realm === '练气' ? 2 : realm === '金丹' ? 3 : 4;
        const expected = world.terrain.tiles.filter(({ col, row }) =>
          (col - focus.col) ** 2 + (row - focus.row) ** 2 <= radius ** 2).map(({ id }) => id);
        expect([...currentVisibleTileIds(world, actor)]).toEqual(expected);
      }
    }
  });

  it('rejects malformed scenario stamps and permits real legacy worlds without one', () => {
    const basic = createInitialWorld(32);
    expect(decodeWorldSave(encodeWorldSave(basic)).scenarioOrigin).toBeUndefined();
    const replay = replayScenario(createScenarioFixture(32, 'classic', 2));
    replay.scenarioOrigin!.endTick = replay.tick + 1;
    expect(() => encodeWorldSave(replay)).toThrow(/scenarioOrigin.references/);
  });
});

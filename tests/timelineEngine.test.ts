import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld, selectTimelineBranch,
  TIMELINE_MAX_BRANCHES, TIMELINE_MAX_TICKS } from '../src/engine/timelineEngine';

describe('immutable rewind and seeded branching', () => {
  it('keeps only the latest snapshots, replaces the same tick, and never leaks live or read copy mutations', () => {
    const world = createInitialWorld(6);
    let timeline = createTimeline(world);
    const originalQi = world.locations[0].spiritQi;
    world.locations[0].spiritQi = 100;
    expect(readTimelineSnapshot(timeline, 1)?.locations[0].spiritQi).toBe(originalQi);
    expect(Object.isFrozen(timeline.branches[0].snapshots[0].world.locations[0])).toBe(true);
    const preview = readTimelineSnapshot(timeline, 1)!;
    preview.locations[0].spiritQi = 0;
    expect(readTimelineSnapshot(timeline, 1)?.locations[0].spiritQi).toBe(originalQi);
    for (let tick = 2; tick <= 53; tick++) { world.tick = tick; timeline = recordTimelineWorld(timeline, world); }
    expect(timeline.branches[0].snapshots).toHaveLength(TIMELINE_MAX_TICKS);
    expect(readTimelineSnapshot(timeline, 3)).toBeUndefined();
    world.locations[0].spiritQi = 40;
    timeline = recordTimelineWorld(timeline, world);
    expect(readTimelineHead(timeline)?.locations[0].spiritQi).toBe(40);
    expect(timeline.branches[0].snapshots).toHaveLength(TIMELINE_MAX_TICKS);
    world.tick--;
    expect(recordTimelineWorld(timeline, world)).toBe(timeline);
  });

  it('forks only the selected old state, preserves the original head, and replays with the same next RNG sequence', () => {
    const first = createInitialWorld(192);
    const second = advanceWorldTick(first);
    const third = advanceWorldTick(second);
    let timeline = [second, third].reduce((value, world) => recordTimelineWorld(value, world), createTimeline(first));
    const original = timeline;
    const action = { type: 'SPAWN_TREASURE', targetLocationId: first.locations[0].id } as const;
    timeline = forkTimeline(timeline, second.tick, action, '分支试验');
    const branch = timeline.branches.find(({ id }) => id === timeline.activeBranchId)!;
    expect(branch).toMatchObject({ parentBranchId: 'main', forkTick: second.tick, label: '分支试验' });
    expect(branch.snapshots[0]).toBe(original.branches[0].snapshots[0]);
    const branched = readTimelineHead(timeline)!;
    expect(branched.tick).toBe(second.tick);
    expect(branched.interventionSequence).toBe(second.interventionSequence + 1);
    expect(branched.random).toEqual(second.random);
    expect(branched.locations[0].spiritQi).toBe(second.locations[0].spiritQi + 20);
    expect(readTimelineHead(timeline, 'main')).toEqual(third);
    expect(readTimelineSnapshot(timeline, second.tick, 'main')).toEqual(second);
    const repeat = readTimelineHead(forkTimeline(original, second.tick, action))!;
    expect(advanceWorldTick(branched)).toEqual(advanceWorldTick(repeat));
    timeline = recordTimelineWorld(timeline, advanceWorldTick(branched), branch.id);
    timeline = selectTimelineBranch(timeline, 'main');
    expect(recordTimelineWorld(timeline, branched, branch.id)).toBe(timeline);
    expect(readTimelineHead(timeline)).toEqual(third);
    expect(readTimelineHead(timeline, branch.id)?.tick).toBe(third.tick);
  });

  it('refuses unknown/dead targets and expired history; caps branches without any eviction', () => {
    const world = createInitialWorld();
    world.cultivators[0].hp = 0; world.cultivators[0].alive = false;
    let timeline = createTimeline(world);
    const command = { type: 'DEMONIC_TIDE' } as const;
    expect(() => forkTimeline(timeline, 0, command)).toThrow(expect.objectContaining({ code: 'missing_snapshot' }));
    expect(() => forkTimeline(timeline, 1, { type: 'TRIBULATION_STRIKE', targetCultivatorId: world.cultivators[0].id }))
      .toThrow(expect.objectContaining({ code: 'invalid_intervention' }));
    expect(() => forkTimeline(timeline, 1, { type: 'SPAWN_TREASURE', targetLocationId: 'unknown' }))
      .toThrow(expect.objectContaining({ code: 'invalid_intervention' }));
    for (let i = 1; i < TIMELINE_MAX_BRANCHES; i++) timeline = forkTimeline(selectTimelineBranch(timeline, 'main'), 1, command);
    const oldIds = timeline.branches.map(({ id }) => id);
    expect(() => forkTimeline(timeline, 1, command)).toThrow(expect.objectContaining({ code: 'branch_limit' }));
    expect(timeline.branches.map(({ id }) => id)).toEqual(oldIds);
    expect(timeline.branches[0].id).toBe('main');
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { bookmarkableEvent } from '../src/engine/annotationsEngine';
import { cloneWorldWithColdHistory, compactColdHistory } from '../src/engine/coldHistoryEngine';
import { decodeWorldSave, encodeWorldSave, worldSaveByteCount } from '../src/engine/storageEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ChronicleChapter, WorldState } from '../src/types/world';

function fixture(): WorldState {
  const world = createInitialWorld(88);
  world.tick = 170; world.month = 6;
  const groups: ChronicleChapter[] = Array.from({ length: 12 }, (_, index) => {
    const endTick = (index + 1) * 10;
    return { id: 'chapter-' + (endTick - 9) + '-' + endTick, endTick, startTick: endTick - 9, chapterNumber: index + 1,
      title: '甲·远纪' + index, body: '昔年史事，留于长卷。'.repeat(12), source: 'utility', biographies: [],
      anchors: [{ id: 'proof=' + index, tick: endTick, year: 1000, month: 1, category: 'diplomacy',
        title: '已知旧史' + index, description: '当时可公开的见证', actorIds: [world.cultivators[0].id], locationId: 'loc-market' }],
    };
  });
  world.chronicleArchive.chapters = groups.reverse();
  return world;
}

describe('cold chapter migration, branch scope and real save byte budget', () => {
  it('moves only published old chapters, preserves bookmarkable source evidence, and runs the same canonical game tick', () => {
    const before = fixture();
    const compacted = cloneWorldWithColdHistory(before);
    compactColdHistory(compacted);
    expect(before.coldHistory.chapters).toHaveLength(0);
    expect(compacted.chronicleArchive.chapters).toHaveLength(6);
    expect(compacted.coldHistory.chapters).toHaveLength(6);
    expect(bookmarkableEvent(compacted, 'proof=0')).toEqual(bookmarkableEvent(before, 'proof=0'));
    expect(compacted.cultivators).toEqual(before.cultivators);
    expect(compacted.couriers).toEqual(before.couriers);

    const unprepared = advanceWorldTick(before, undefined, () => .99);
    const prepared = advanceWorldTick(compacted, undefined, () => .99);
    expect(prepared).toEqual(unprepared);
    const serialized = encodeWorldSave(prepared);
    expect(new TextEncoder().encode(serialized).byteLength).toBe(worldSaveByteCount(prepared));
    expect(worldSaveByteCount(prepared)).toBeGreaterThan(serialized.length);
    const recovered = decodeWorldSave(serialized);
    expect(recovered.coldHistory).toEqual(prepared.coldHistory);
    expect(Object.isFrozen(recovered.coldHistory.chapters[0].anchors)).toBe(true);

    const forged = structuredClone(prepared);
    forged.chronicleArchive.chapters.push(structuredClone(forged.coldHistory.chapters[0]));
    expect(() => encodeWorldSave(forged)).toThrow(/coldHistory.chapters.id/);
  });

  it('shares only immutable full shelf objects across actual timeline snapshots and keeps earlier branches isolated', () => {
    const initial = fixture();
    const earlyTimeline = createTimeline(initial);
    const later = advanceWorldTick(initial, undefined, () => .99);
    const timeline = recordTimelineWorld(earlyTimeline, later);
    const fork = forkTimeline(timeline, initial.tick, { type: 'DEMONIC_TIDE' });
    const muted = readTimelineHead(fork)!;
    expect(muted.coldHistory.chapters).toEqual([]);
    expect(bookmarkableEvent(muted, 'proof=0')).toBeDefined(); // still in its original hot history, not copied from the later shelf
    expect(readTimelineHead(timeline)!.coldHistory.chapters).toHaveLength(6);
    const shared = readTimelineHead(timeline)!;
    const cloned = cloneWorldWithColdHistory(shared);
    expect(cloned.coldHistory).toBe(shared.coldHistory);
    expect(cloned.cultivators).not.toBe(shared.cultivators);
    expect(() => Object.defineProperty(cloned.coldHistory.chapters[0], 'title', { value: '分支改写' })).toThrow();
    const { coldHistory: _old, ...legacy } = initial;
    expect(decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy })).coldHistory.chapters).toEqual([]);
  });
});

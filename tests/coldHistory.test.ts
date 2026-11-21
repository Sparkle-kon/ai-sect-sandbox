import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeColdHistoryAnchorIds, cloneWorldWithColdHistory, compactColdHistory, createColdHistoryState,
  COLD_HISTORY_MIN_AGE_TICKS, COLD_HISTORY_MIN_HOT_CHAPTERS, COLD_HISTORY_ORDINARY_CHAPTERS, freezeColdHistory, publicChronicleChapters } from '../src/engine/coldHistoryEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ChronicleChapter, WorldState } from '../src/types/world';

function chapter(world: WorldState, n: number): ChronicleChapter {
  const actor = world.cultivators[0];
  const endTick = n * 12, startTick = endTick - 11;
  const id = `ancient-fact-${n}`;
  return {
    id: `chapter-${startTick}-${endTick}`, chapterNumber: n, startTick, endTick,
    title: `第${n}章：旧事`, body: `独立公开史料 ${n}`.repeat(45), source: 'utility',
    anchors: [{ id, tick: endTick - 1, year: n, month: 11, title: '事实', description: '曾经公开记录',
      category: 'heavenly', actorIds: [actor.id], locationId: actor.locationId }],
    biographies: [{ actorId: actor.id, name: actor.name, realm: actor.realm, anchorIds: [id] }],
  };
}

function fixture(count: number, extraAge = 180) {
  const world = createInitialWorld(77018);
  world.coldHistory = createColdHistoryState();
  world.tick = count * 12 + extraAge;
  world.month = 4;
  world.events = [];
  world.chronicleArchive.chapters = Array.from({ length: count }, (_, i) => chapter(world, count - i));
  const get = (number: number) => world.chronicleArchive.chapters.find(({ chapterNumber }) => chapterNumber === number)!;
  return { world, get };
}

describe('cold public chapters as a separately immutable archive', () => {
  it('moves only complete old public chapters, retains six latest and pins an active source without changing causal facts', () => {
    const { world, get } = fixture(12, 0);
    const pinned = get(2);
    const privateId = get(3).anchors[0].id;
    const pendingDeathTick = pinned.anchors[0].tick;
    world.reincarnation.cases.push({ id: 'actual-pinned-rebirth', deceasedId: world.cultivators[0].id, deathEventId: pinned.anchors[0].id,
      deathTick: pendingDeathTick, expiresTick: world.tick + 40, status: 'reserved', settlementId: world.settlements.villages[0].id });
    world.events.push({ ...get(3).anchors[0], witnessScope: 'participants' });
    expect(activeColdHistoryAnchorIds(world).has(pinned.anchors[0].id)).toBe(true);
    const causal = structuredClone({ people: world.cultivators, history: world.events, case: world.reincarnation, rng: world.random,
      sources: world.chronicleArchive.anchors });
    compactColdHistory(world);
    expect(world.chronicleArchive.chapters.slice(0, COLD_HISTORY_MIN_HOT_CHAPTERS).map(({ chapterNumber }) => chapterNumber)).toEqual([12,11,10,9,8,7]);
    expect(world.chronicleArchive.chapters.some(({ id }) => id === pinned.id)).toBe(true);
    expect(world.coldHistory.chapters.some((entry) => entry.anchors.some(({ id }) => id === privateId))).toBe(false);
    expect(publicChronicleChapters(world).some((entry) => entry.anchors.some(({ id }) => id === privateId))).toBe(false);
    expect(world.coldHistory.chapters.every(({ endTick }) => world.tick - endTick >= COLD_HISTORY_MIN_AGE_TICKS)).toBe(true);
    expect({ people: world.cultivators, history: world.events, case: world.reincarnation, rng: world.random,
      sources: world.chronicleArchive.anchors }).toEqual(causal);
  });

  it('bounds old ordinary records but never silently evicts a bookmarked original', () => {
    const { world, get } = fixture(COLD_HISTORY_ORDINARY_CHAPTERS + COLD_HISTORY_MIN_HOT_CHAPTERS + 12);
    const oldest = get(1);
    const anchor = oldest.anchors[0];
    world.annotations.bookmarks.push({ id: 'bookmark-1', eventId: anchor.id, eventTick: anchor.tick, title: anchor.title,
      category: anchor.category, createdTick: world.tick });
    compactColdHistory(world);
    expect(world.coldHistory.chapters).toHaveLength(COLD_HISTORY_ORDINARY_CHAPTERS + 1);
    expect(world.coldHistory.chapters.at(-1)).toEqual(oldest);
    expect(world.coldHistory.droppedChapters).toBe(11);
    expect(publicChronicleChapters(world)).toHaveLength(COLD_HISTORY_MIN_HOT_CHAPTERS + COLD_HISTORY_ORDINARY_CHAPTERS + 1);
    const sameCold = world.coldHistory;
    compactColdHistory(world);
    expect(world.coldHistory).toBe(sameCold);
    world.annotations.bookmarks = [];
    compactColdHistory(world);
    expect(world.coldHistory.chapters).toHaveLength(COLD_HISTORY_ORDINARY_CHAPTERS);
    expect(world.coldHistory.droppedChapters).toBe(12);
  });

  it('shares only trusted deep frozen geography-independent archival data across mutable branch copies', () => {
    const { world } = fixture(8);
    compactColdHistory(world);
    const source = world.coldHistory;
    const a = cloneWorldWithColdHistory(world), b = cloneWorldWithColdHistory(world);
    expect(a.coldHistory).toBe(source);
    expect(b.coldHistory).toBe(source);
    expect(Object.isFrozen(a.coldHistory.chapters[0].anchors[0].actorIds)).toBe(true);
    expect(() => a.coldHistory.chapters[0].anchors[0].actorIds.push('not-allowed')).toThrow();
    a.cultivators[0].spiritStones++;
    a.chronicleArchive.chapters[0].body = '本分支活页编辑';
    expect(b.cultivators[0].spiritStones).toBe(world.cultivators[0].spiritStones);
    expect(b.chronicleArchive.chapters[0].body).not.toBe(a.chronicleArchive.chapters[0].body);
    const unscrutinized = chapter(world, 1);
    const shallow = Object.freeze({ chapters: [unscrutinized], droppedChapters: 0 });
    const owned = freezeColdHistory(shallow);
    expect(owned).not.toBe(shallow);
    expect(Object.isFrozen(owned.chapters[0].anchors[0].actorIds)).toBe(true);
    unscrutinized.anchors[0].actorIds.push('outside');
    expect(owned.chapters[0].anchors[0].actorIds).not.toContain('outside');
  });

  it('promotes an active archived proof safely and produces the same next-tick world ignoring archival layout', () => {
    const { world } = fixture(9, 60);
    const control = structuredClone(world);
    compactColdHistory(world);
    const old = world.coldHistory.chapters.at(-1)!;
    const sourceEvent = old.anchors[0];
    const living = world.cultivators[0];
    const crossRef = { id: 'recently-active-ref', deceasedId: living.id, deathEventId: sourceEvent.id, deathTick: sourceEvent.tick,
      expiresTick: world.tick + 2, status: 'awaiting_birth' as const };
    world.reincarnation.cases.push({ ...crossRef });
    control.reincarnation.cases.push({ ...crossRef });
    compactColdHistory(world);
    const promoted = world.chronicleArchive.chapters.find(({ id }) => id === old.id);
    expect(promoted).toEqual(old);
    expect(promoted).not.toBe(old);
    expect(world.coldHistory.chapters.some(({ id }) => id === old.id)).toBe(false);
    const hotResult = advanceWorldTick(control);
    const coldResult = advanceWorldTick(world);
    const gameplay = ({ coldHistory: _cold, chronicleArchive, ...state }: WorldState) => ({ ...state, anchors: chronicleArchive.anchors });
    expect(gameplay(coldResult)).toEqual(gameplay(hotResult));
    expect(publicChronicleChapters(coldResult).map(({ id }) => id)).toEqual(publicChronicleChapters(hotResult).map(({ id }) => id));
  });
});

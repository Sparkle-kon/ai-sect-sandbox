import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { ANNOTATION_MAX_BOOKMARKS, ANNOTATION_MAX_NOTE_CHARS, ANNOTATION_MAX_NOTES, applyAnnotation, availableAnnotationTargets,
  bookmarkableEvent, bookmarkLocation, createAnnotationState, visibleBookmarks, visibleMapAnnotations } from '../src/engine/annotationsEngine';
import type { AnnotationCommand } from '../src/engine/annotationsEngine';
import { availableChronicleChapter, resolveChronicleChapter } from '../src/engine/novelGenerator';
import { noteTerrainVisit, terrainTileAt } from '../src/engine/terrainEngine';
import { createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld, selectTimelineBranch } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(81);
  world.annotations = createAnnotationState();
  const [known, other] = world.cultivators;
  const market = world.locations.find(({ type }) => type === 'market')!;
  const secret = world.locations.find(({ type }) => type === 'secret_realm')!;
  other.realm = '练气'; other.locationId = market.id; other.exploredTileIds = []; other.rumors = [];
  return { world, known, other, market, secret };
}
function commit(world: WorldState, actorId: string | null | undefined, command: AnnotationCommand): WorldState {
  const result = applyAnnotation(world, actorId, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.world;
}

describe('branch-local public bookmarks and fog-safe map annotation metadata', () => {
  it('bookmarks real current events only with a minimal public schema, rejecting private/future overrides and duplicates', () => {
    const { world, other } = fixture();
    const canon = world.events[0];
    const book = commit(world, other.id, { kind: 'add_bookmark', eventId: canon.id });
    const first = book.annotations.bookmarks[0];
    expect(first).toMatchObject({ id: 'bookmark-1', eventId: canon.id, eventTick: canon.tick, title: canon.title, category: canon.category });
    expect(first).not.toHaveProperty('dialogue');
    expect(first).not.toHaveProperty('description');
    expect(applyAnnotation(book, other.id, { kind: 'add_bookmark', eventId: canon.id })).toEqual({ ok: false, code: 'duplicate', world: book });
    expect(applyAnnotation(book, other.id, { kind: 'add_bookmark', eventId: 'fake-caption' }).ok).toBe(false);
    const privateOverride = { ...book, events: [{ ...canon, witnessScope: 'participants' as const }] };
    expect(bookmarkableEvent(privateOverride, canon.id)).toBeUndefined();
    expect(visibleBookmarks(privateOverride)).toEqual([]);
    const ahead = { ...book, events: [{ ...canon, tick: world.tick + 1 }] };
    expect(bookmarkableEvent(ahead, canon.id)).toBeUndefined();
    expect(visibleBookmarks(ahead)).toEqual([]);
    expect(book.tick).toBe(world.tick);
    expect(book.random).toBe(world.random);
    expect(book.events).toBe(world.events);
    expect(book.interventionSequence).toBe(0);
    expect(world.annotations.bookmarks).toEqual([]);
  });

  it('uses retained real chapter anchors, refuses narrative title and future chapter, and preserves bookmarks after archive pruning', () => {
    const { world, other } = fixture();
    const canon = world.events[0];
    const plan = availableChronicleChapter(world, true)!;
    expect(plan.anchors.some(({ id }) => id === canon.id)).toBe(true);
    const chapter = resolveChronicleChapter(world, plan, { title: '演绎标题不是证据', body: '真实史料之外的文学虚构内容。' })!;
    world.events = [];
    world.chronicleArchive.anchors = [];
    expect(bookmarkableEvent(world, chapter.id)).toBeUndefined();
    expect(bookmarkableEvent(world, canon.id)?.title).toBe(canon.title);
    const olderView = { ...world, tick: 0 };
    expect(bookmarkableEvent(olderView, canon.id)).toBeUndefined();
    const book = commit(world, other.id, { kind: 'add_bookmark', eventId: canon.id });
    const pruned = { ...book, chronicleArchive: { anchors: [], chapters: [] } };
    expect(bookmarkableEvent(pruned, canon.id)).toBeUndefined();
    expect(visibleBookmarks(pruned)[0].title).toBe(canon.title);
    expect(bookmarkLocation(pruned, book.annotations.bookmarks[0].id, other.id)).toBeUndefined();
  });

  it('pins only known sites/tiles, hides pins in another viewpoint, and keeps deleted site marker historical on a known tile', () => {
    const { world, known, other, secret, market } = fixture();
    const hiddenTile = terrainTileAt(world, secret.x, secret.y)!;
    const hidden: AnnotationCommand = { kind: 'add_note', target: { kind: 'site', locationId: secret.id }, text: '观察位置' };
    expect(applyAnnotation(world, other.id, hidden).ok).toBe(false);
    expect(applyAnnotation(world, null, hidden).ok).toBe(false);
    expect(applyAnnotation(world, 'bad-actor', { ...hidden, target: { kind: 'site', locationId: market.id } }).ok).toBe(false);
    expect(availableAnnotationTargets(world).tiles).toEqual([]);
    expect(applyAnnotation(world, other.id, { kind: 'add_note', target: { kind: 'tile', tileId: hiddenTile.id }, text: '未知格' }).ok).toBe(false);

    known.locationId = secret.id;
    noteTerrainVisit(world, known);
    const marked = commit(world, known.id, hidden);
    expect(visibleMapAnnotations(marked, known.id)).toEqual([{ note: marked.annotations.notes[0], point: { x: secret.x, y: secret.y }, historical: false }]);
    expect(visibleMapAnnotations(marked, other.id)).toEqual([]);
    expect(visibleMapAnnotations(marked)).toEqual([]);
    const removed = { ...marked, locations: marked.locations.filter(({ id }) => id !== secret.id) };
    expect(visibleMapAnnotations(removed, known.id)[0]).toMatchObject({ historical: true,
      note: { target: { kind: 'site', locationId: secret.id, tileId: hiddenTile.id, siteName: secret.name } } });
    expect(visibleMapAnnotations(removed, other.id)).toEqual([]);
    expect(bookmarkLocation(removed, 'bookmark-missing', known.id)).toBeUndefined();
  });

  it('forks only annotations present at chosen snapshot and keeps same-tick edits on the selected branch', () => {
    const { world, known, market } = fixture();
    let history = createTimeline(world);
    const next = advanceWorldTick(world);
    history = recordTimelineWorld(history, next);
    const marked = commit(next, known.id, { kind: 'add_note', target: { kind: 'site', locationId: market.id }, text: '本支观察' });
    history = recordTimelineWorld(history, marked);
    expect(history.branches[0].snapshots).toHaveLength(2);
    expect(readTimelineSnapshot(history, next.tick)?.annotations.notes[0].text).toBe('本支观察');
    expect(readTimelineSnapshot(history, world.tick)?.annotations.notes).toEqual([]);
    const command = { type: 'SPAWN_TREASURE' as const, targetLocationId: market.id };
    const oldBranch = forkTimeline(history, world.tick, command);
    expect(readTimelineHead(oldBranch)?.annotations.notes).toEqual([]);
    let sameTick = forkTimeline(selectTimelineBranch(oldBranch, 'main'), next.tick, command);
    const inherited = readTimelineHead(sameTick)!;
    expect(inherited.annotations.notes[0].text).toBe('本支观察');
    const child = commit(inherited, known.id, { kind: 'edit_note', noteId: inherited.annotations.notes[0].id, text: '分支改写' });
    sameTick = recordTimelineWorld(sameTick, child);
    expect(readTimelineHead(sameTick)?.annotations.notes[0].text).toBe('分支改写');
    expect(readTimelineHead(sameTick, 'main')?.annotations.notes[0].text).toBe('本支观察');
    expect(readTimelineHead(sameTick, oldBranch.activeBranchId)?.annotations.notes).toEqual([]);
    expect(inherited.random).toEqual(child.random);
    expect(inherited.tick).toBe(child.tick);
  });

  it('bounds storage, does not silently evict, sanitizes input, and leaves stable IDs untouched by edit or removal', () => {
    const { world, known, market } = fixture();
    const base: AnnotationCommand = { kind: 'add_note', target: { kind: 'site', locationId: market.id }, text: 'xyz' };
    expect(applyAnnotation(world, known.id, { ...base, text: ' ' }).ok).toBe(false);
    expect(applyAnnotation(world, known.id, { ...base, text: 'bad\u0000marker' }).ok).toBe(false);
    expect(applyAnnotation(world, known.id, { ...base, text: 'x'.repeat(ANNOTATION_MAX_NOTE_CHARS + 1) }).ok).toBe(false);
    let capped = world;
    for (let i = 0; i < ANNOTATION_MAX_NOTES; i++) capped = commit(capped, known.id, { ...base, text: `备注 ${i}` });
    expect(applyAnnotation(capped, known.id, base)).toEqual({ ok: false, code: 'limit', world: capped });
    const firstId = capped.annotations.notes[0].id;
    const edited = commit(capped, known.id, { kind: 'edit_note', noteId: firstId, text: '  改写  ' });
    expect(edited.annotations.notes[0]).toMatchObject({ id: firstId, text: '改写' });
    expect(capped.annotations.notes[0].text).toBe('备注 0');
    const removed = commit(edited, known.id, { kind: 'remove_note', noteId: firstId });
    const added = commit(removed, known.id, base);
    expect(added.annotations.notes.at(-1)?.id).not.toBe(firstId);

    const template = world.events[0];
    let books: WorldState = { ...world, events: Array.from({ length: ANNOTATION_MAX_BOOKMARKS + 1 },
      (_, i) => ({ ...template, id: `canon-${i}`, title: `公开记事 ${i}` })) };
    for (let i = 0; i < ANNOTATION_MAX_BOOKMARKS; i++) books = commit(books, null, { kind: 'add_bookmark', eventId: `canon-${i}` });
    expect(applyAnnotation(books, null, { kind: 'add_bookmark', eventId: `canon-${ANNOTATION_MAX_BOOKMARKS}` })).toMatchObject({ ok: false, code: 'limit' });
    const without = commit(books, null, { kind: 'remove_bookmark', bookmarkId: books.annotations.bookmarks[0].id });
    expect(without.annotations.bookmarks).toHaveLength(ANNOTATION_MAX_BOOKMARKS - 1);
  });
});

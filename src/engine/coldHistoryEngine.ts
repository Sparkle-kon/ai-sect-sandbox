import type { ChronicleChapter, ColdHistoryState, WorldState } from '../types/world';

export const COLD_HISTORY_MIN_HOT_CHAPTERS = 6;
export const COLD_HISTORY_MIN_AGE_TICKS = 48;
export const COLD_HISTORY_ORDINARY_CHAPTERS = 64;

const trustedStates = new WeakSet<ColdHistoryState>();
const trustedChapters = new WeakSet<ChronicleChapter>();

/** Only descend into new clones. Object.isFrozen alone does not establish that a graph is trusted. */
function deepFreeze<T extends object>(root: T): T {
  const seen = new Set<object>();
  const visit = (value: object) => {
    if (seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
    Object.freeze(value);
  };
  visit(root);
  return root;
}

function trustedChapter(chapter: ChronicleChapter): ChronicleChapter {
  if (trustedChapters.has(chapter)) return chapter;
  const frozen = deepFreeze(structuredClone(chapter));
  trustedChapters.add(frozen);
  return frozen;
}

function ownColdHistory(chapters: readonly ChronicleChapter[], droppedChapters: number): ColdHistoryState {
  const cold = Object.freeze({ chapters: Object.freeze(chapters.map(trustedChapter)), droppedChapters });
  trustedStates.add(cold);
  return cold;
}

const EMPTY = ownColdHistory([], 0);
export const createColdHistoryState = (): ColdHistoryState => EMPTY;

/** Used after strict persistence decode and at the copy boundary; arbitrary shallow freezes are never shared. */
export function freezeColdHistory(state: ColdHistoryState): ColdHistoryState {
  return trustedStates.has(state) ? state : ownColdHistory(state.chapters, state.droppedChapters);
}

/** Copy every hot/gameplay object, and share only a recursively frozen module-owned archival leaf. */
export function cloneWorldWithColdHistory(world: WorldState): WorldState {
  const { coldHistory, ...hot } = world;
  return { ...structuredClone(hot), coldHistory: freezeColdHistory(coldHistory ?? EMPTY) };
}

const newest = (a: ChronicleChapter, b: ChronicleChapter) =>
  b.chapterNumber - a.chapterNumber || b.endTick - a.endTick || a.id.localeCompare(b.id);

function privateOrFutureAnchorIds(world: WorldState): Set<string> {
  return new Set(world.events.filter((event) => event.witnessScope === 'participants' || event.tick > world.tick).map(({ id }) => id));
}

function publicChapter(world: WorldState, chapter: ChronicleChapter, unavailable: ReadonlySet<string>): boolean {
  return chapter.startTick <= chapter.endTick && chapter.endTick <= world.tick &&
    chapter.anchors.every(({ id, tick }) => !unavailable.has(id) && tick >= chapter.startTick && tick <= chapter.endTick);
}

/** Read the viewed branch only; no inferred new events and no fallback to another branch's shelf. */
export function publicChronicleChapters(world: WorldState): ChronicleChapter[] {
  const unavailable = privateOrFutureAnchorIds(world);
  const unique = new Map<string, ChronicleChapter>();
  for (const chapter of [...world.chronicleArchive.chapters, ...(world.coldHistory?.chapters ?? [])]) {
    if (!unique.has(chapter.id) && publicChapter(world, chapter, unavailable)) unique.set(chapter.id, chapter);
  }
  return [...unique.values()].sort(newest);
}

/** Pin specific known active proofs, not actor rosters or unrelated closed prose. */
export function activeColdHistoryAnchorIds(world: WorldState): ReadonlySet<string> {
  const pinned = new Set<string>();
  for (const claim of world.witnesses.claims) {
    if (claim.settledTick === undefined && claim.filedTick <= world.tick && claim.deadlineTick > world.tick) {
      pinned.add(claim.sourceEventId);
      pinned.add(claim.publicationEventId);
    }
  }
  for (const file of world.couriers.dispatches) {
    if (file.openedTick <= world.tick && (file.status === 'offered' || file.status === 'in_transit' || file.status === 'returning') &&
      file.sealed.kind === 'public_relief') pinned.add(file.sealed.sourceEventId);
  }
  for (const item of world.reincarnation.cases) {
    if (item.deathTick <= world.tick && (item.status === 'awaiting_birth' || item.status === 'reserved' || item.status === 'volunteer')) pinned.add(item.deathEventId);
  }
  const corrected = new Set(world.chronicleErrata.corrections.map(({ sourceEventId }) => sourceEventId));
  for (const fact of world.chronicleErrata.sources) {
    if (fact.tick <= world.tick && world.tick - fact.tick < 24 && !corrected.has(fact.sourceEventId)) pinned.add(fact.sourceEventId);
  }
  const openSeasons = new Set(world.competitions.seasons.filter((season) => season.status === 'open' && season.openedTick <= world.tick)
    .map(({ id }) => id));
  for (const score of world.competitions.scores) {
    if (openSeasons.has(score.seasonId) && score.tick <= world.tick) {
      pinned.add(score.sourceId);
      if (!score.sourceId.startsWith('evt-')) pinned.add(`evt-${score.sourceId}`);
    }
  }
  return pinned;
}

const hasAnchor = (chapter: ChronicleChapter, ids: ReadonlySet<string>) => chapter.anchors.some(({ id }) => ids.has(id));

/**
 * Move complete, older public narrative chapters, never source events, active receipts, people, or RNG.
 * Pin whole referenced chapters; protect bookmarked cold chapters beyond the ordinary shelf quota.
 */
export function compactColdHistory(world: WorldState): void {
  const oldCold = world.coldHistory ?? EMPTY;
  const cold = freezeColdHistory(oldCold);
  if (world.coldHistory !== cold) world.coldHistory = cold;
  const hot = world.chronicleArchive.chapters;
  if (!cold.chapters.length && (hot.length <= COLD_HISTORY_MIN_HOT_CHAPTERS ||
      hot.every((chapter) => world.tick - chapter.endTick < COLD_HISTORY_MIN_AGE_TICKS))) return;

  const unavailable = privateOrFutureAnchorIds(world);
  const pinned = activeColdHistoryAnchorIds(world);
  const bookmarked = new Set(world.annotations.bookmarks.filter((row) => row.createdTick <= world.tick && row.eventTick <= row.createdTick &&
    !unavailable.has(row.eventId)).map(({ eventId }) => eventId));
  const orderedHot = [...hot].sort(newest);
  const keepHot = new Map<string, ChronicleChapter>();
  const shelves = new Map<string, ChronicleChapter>();
  for (const [index, chapter] of orderedHot.entries()) {
    const old = world.tick - chapter.endTick >= COLD_HISTORY_MIN_AGE_TICKS;
    if (index < COLD_HISTORY_MIN_HOT_CHAPTERS || !old || hasAnchor(chapter, pinned) || !publicChapter(world, chapter, unavailable)) {
      keepHot.set(chapter.id, chapter);
    } else shelves.set(chapter.id, chapter);
  }
  for (const chapter of cold.chapters) {
    if (keepHot.has(chapter.id)) continue;
    if (hasAnchor(chapter, pinned)) {
      // Restoring a pinned record to hot state must not give gameplay a mutable reference to shared cold memory.
      keepHot.set(chapter.id, structuredClone(chapter));
      shelves.delete(chapter.id);
    } else if (!shelves.has(chapter.id)) shelves.set(chapter.id, chapter);
  }

  const futureHot = [...keepHot.values()].sort(newest);
  let ordinary = 0, dropped = 0;
  const futureCold = [...shelves.values()].sort(newest).filter((chapter) => {
    if (hasAnchor(chapter, bookmarked)) return true;
    if (ordinary++ < COLD_HISTORY_ORDINARY_CHAPTERS) return true;
    dropped++;
    return false;
  });
  if (futureHot.length !== hot.length || futureHot.some((chapter, index) => chapter !== hot[index])) world.chronicleArchive.chapters = futureHot;
  if (dropped || futureCold.length !== cold.chapters.length || futureCold.some((chapter, index) => chapter !== cold.chapters[index])) {
    world.coldHistory = ownColdHistory(futureCold, cold.droppedChapters + dropped);
  }
}

import { deriveChapterOpening } from '../engine/chapterContinuity';
import { deriveChapterEndHook } from '../engine/chapterEndHooks';
import { isChronicleStoryFact } from '../engine/chronicleLead';
import { publicChronicleExcerpt, writePublicChronicleScene } from '../engine/chroniclePublicProse';
import type { ChronicleReading } from '../engine/novelGenerator';
import { createPublicDialogueResolver, type PublicDialogueProvenance } from '../engine/publicDialogueProvenance';
import type { ChronicleAnchor, ChronicleChapter, WorldState } from '../types/world';

export interface ChronicleBookSource {
  readonly chapterNumber?: number;
  readonly tick: number;
  readonly year: number;
  readonly month: number;
  readonly title: string;
  readonly detail: string;
  readonly dialogue?: PublicDialogueProvenance;
}

interface ChronicleBookSourceScope {
  readonly world: WorldState;
  readonly current: ChronicleChapter;
  readonly reading: ChronicleReading;
  readonly readable: (chapter: ChronicleChapter) => ChronicleChapter;
  readonly resolveDialogue: (chapterId: string, eventId: string) => PublicDialogueProvenance | undefined;
}

const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const unique = <T>(rows: readonly T[]): T | undefined => rows.length === 1 ? rows[0] : undefined;
const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);
const cut = (text: string, limit: number) =>
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(0, limit);
const excerpt = (text: string, limit: number) =>
  Array.from(publicChronicleExcerpt(cut(text, limit)).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim())
    .slice(0, limit).join('');

function sameChapter(a: ChronicleChapter, b: ChronicleChapter): boolean {
  return a.id === b.id && a.chapterNumber === b.chapterNumber && a.startTick === b.startTick && a.endTick === b.endTick;
}
function validChapter(chapter: ChronicleChapter, throughTick: number) {
  return !!chapter.id && positive(chapter.chapterNumber) && positive(chapter.startTick) &&
    positive(chapter.endTick) && chapter.startTick <= chapter.endTick && chapter.endTick <= throughTick;
}
function isPublicAt(anchor: ChronicleAnchor, chapter: ChronicleChapter) {
  return positive(anchor.tick) && positive(anchor.year) && positive(anchor.month) && anchor.month <= 12 &&
    anchor.tick >= chapter.startTick && isChronicleStoryFact(anchor, chapter.endTick);
}
function sameFact(anchor: ChronicleAnchor, other: ChronicleAnchor, actorIds: readonly string[] = other.actorIds) {
  return anchor.id === other.id && anchor.tick === other.tick && anchor.year === other.year && anchor.month === other.month &&
    anchor.category === other.category && anchor.locationId === other.locationId &&
    anchor.title === cut(other.title, 80) && anchor.description === cut(other.description, 220) &&
    sameIds(anchor.actorIds, actorIds);
}

/** Non-persisted evidence lookup for one mounted book, with no search by label or borrowing across branches. */
export function createChronicleBookSourceResolver({ world, current, reading, readable, resolveDialogue }: ChronicleBookSourceScope):
  (ids: readonly string[], priorChapterId?: string) => readonly ChronicleBookSource[] {
  const throughTick = world.tick;
  const chaptersInScope = () => [...world.chronicleArchive.chapters, ...(world.coldHistory?.chapters ?? [])];
  const shelf = chaptersInScope();
  const filedChapter = (chapter: ChronicleChapter) =>
    unique(shelf.filter(other => other.id === chapter.id || other.chapterNumber === chapter.chapterNumber));
  const stored = validChapter(current, throughTick) && filedChapter(current);
  if (!stored || !sameChapter(stored, current)) return () => [];

  function sourceDialogue(chapter: ChronicleChapter, id: string, tick: number): PublicDialogueProvenance | undefined {
    const supplied = resolveDialogue(chapter.id, id);
    if (!supplied || supplied.eventId !== id || supplied.tick !== tick || supplied.surface !== 'chapter') return;
    const original = createPublicDialogueResolver(world, chapter.endTick).chapter(chapter.id, id);
    // The pre-existing resolver owns all quote/fragment/conflict rules. Do not copy a caller's supplied words.
    return original?.status === supplied.status ? original : undefined;
  }

  function source(chapter: ChronicleChapter, original: ChronicleChapter, id: string, prior: boolean): ChronicleBookSource | undefined {
    const anchor = unique(chapter.anchors.filter(row => row.id === id));
    const originalAnchor = unique(original.anchors.filter(row => row.id === id));
    if (!anchor || !originalAnchor || !isPublicAt(anchor, chapter) || !isPublicAt(originalAnchor, chapter) ||
      !sameFact(anchor, originalAnchor) ||
      shelf.some(other => other !== original && other.anchors.some(row => row.id === id))) return;
    const originals = world.events.filter(row => row.id === id);
    const copies = world.chronicleArchive.anchors.filter(row => row.id === id);
    const knownPeople = new Set(world.cultivators.map(actor => actor.id));
    if (originals.length > 1 || copies.length > 1 ||
      originals.some(row => !isPublicAt(row, chapter) || !sameFact(anchor, row, [...new Set(row.actorIds.filter(id => knownPeople.has(id)))].slice(0, 12))) ||
      copies.some(row => !isPublicAt(row, chapter) || !sameFact(anchor, row))) return;
    if (!prior) {
      const section = unique(reading.sections.filter(row => row.eventId === id));
      const expected = writePublicChronicleScene(anchor);
      if (!section || section.title !== expected.title || section.paragraph !== expected.paragraph) return;
    }

    const dialogue = sourceDialogue(chapter, id, anchor.tick);
    return {
      ...(prior ? { chapterNumber: chapter.chapterNumber } : {}),
      tick: anchor.tick, year: anchor.year, month: anchor.month,
      title: excerpt(anchor.title, 80) || '原实录', detail: excerpt(anchor.description, 220),
      ...(dialogue ? { dialogue } : {}),
    };
  }

  return (ids, priorChapterId) => {
    const latest = chaptersInScope();
    if (latest.length !== shelf.length || latest.some((row, index) => row !== shelf[index]) ||
      world.tick !== throughTick || !ids.length || ids.length > 18 || new Set(ids).size !== ids.length) return [];
    if (priorChapterId !== undefined) {
      const claim = reading.continuity?.opening;
      if (!claim || ids.length !== 1 || claim.chapterId !== priorChapterId || claim.eventId !== ids[0]) return [];
      const proven = deriveChapterOpening(world, current, deriveChapterEndHook);
      if (proven?.chapterId !== priorChapterId || proven.eventId !== ids[0] || proven.text !== claim.text) return [];
      const previous = unique(shelf.filter(row => row.id === priorChapterId || row.chapterNumber === current.chapterNumber - 1));
      if (!previous || previous.id !== priorChapterId || previous.chapterNumber !== current.chapterNumber - 1 ||
        !validChapter(previous, current.startTick - 1) || previous.endTick !== current.startTick - 1) return [];
      const previousReadable = readable(previous);
      if (!sameChapter(previousReadable, previous)) return [];
      const row = source(previousReadable, previous, ids[0], true);
      return row ? [row] : [];
    }
    const rows: ChronicleBookSource[] = [];
    for (const id of ids) {
      const row = source(current, stored, id, false);
      if (!row) return []; // A multi-source paragraph is not fully supported if any one required source disappeared.
      rows.push(row);
    }
    return rows;
  };
}

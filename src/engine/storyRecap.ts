import type { ChronicleAnchor, ChronicleChapter, Cultivator, WorldState } from '../types/world';
import { chapterFocalScore, chapterFocalThreadKey } from './chapterFocalScene';
import { isChronicleStoryFact } from './chronicleLead';
import { publicChronicleExcerpt, writePublicChronicleScene } from './chroniclePublicProse';
import { projectChapterTurningPoints } from './chronicleTurningPoints';
import { publicChronicleChapters } from './coldHistoryEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { chapterFocalSources } from './focalLayerEvidence';
import { projectChronicleReading, stampedChronicleLead } from './novelGenerator';

const ROW_LIMIT = 3;
const RECENT_CHAPTER_LIMIT = 8;
export interface StoryRecapRow {
  readonly chapterId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly title: string;
  readonly paragraph: string;
  readonly source: 'original' | 'archived';
  readonly paragraphEventIds: readonly string[];
}
export interface StoryRecapView { readonly rows: readonly StoryRecapRow[] }

const bounded = (text: string, cap: number) =>
  [...text.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ').trim()].slice(0, cap).join('');
const originalCopy = (text: string, cap: number) =>
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(0, cap);
const publiclySourced = (fact: ChronicleAnchor, cutoff: number) =>
  isChronicleStoryFact(fact, cutoff) && (!('witnessScope' in fact) || fact.witnessScope === undefined);
const sameMetadata = (a: ChronicleAnchor, b: ChronicleAnchor) =>
  a.id === b.id && a.tick === b.tick && a.year === b.year && a.month === b.month && a.category === b.category &&
  a.locationId === b.locationId && a.actorIds.length === b.actorIds.length && a.actorIds.every((id, i) => id === b.actorIds[i]) &&
  originalCopy(a.title, 80) === originalCopy(b.title, 80) && originalCopy(a.description, 220) === originalCopy(b.description, 220);

function groups<T>(rows: readonly T[], key: (row: T) => string) {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = index.get(id);
    if (list) list.push(row);
    else index.set(id, [row]);
  }
  return index;
}

type Candidate = StoryRecapRow & { thread: string };
/** One branch's serialized public history only. A recap never opens or executes a simulation turn. */
export function projectStoryRecap(world: WorldState, viewer?: Cultivator, chapterId?: string): StoryRecapView {
  const people = groups(world.cultivators, row => row.id);
  if (viewer && (people.get(viewer.id)?.length !== 1 || people.get(viewer.id)?.[0] !== viewer)) return { rows: [] };
  const sites = groups(world.locations, row => row.id);
  const raw = groups(world.events, row => row.id);
  const anchors = groups(world.chronicleArchive.anchors, row => row.id);
  const allChapters = [...world.chronicleArchive.chapters, ...world.coldHistory.chapters];
  const shelf = groups(allChapters, row => row.id);
  const chapters = publicChronicleChapters(world).filter(row =>
    shelf.get(row.id)?.length === 1 && (chapterId === undefined || row.id === chapterId)).slice(0, RECENT_CHAPTER_LIMIT);
  const copies = groups(allChapters.flatMap(chapter => chapter.anchors), row => row.id);
  const output: Candidate[] = [];
  const threads = new Set<string>();
  function validFact(fact: ChronicleAnchor, chapter: ChronicleChapter): boolean {
    const site = fact.locationId && sites.get(fact.locationId);
    if (!site || site.length !== 1 || site[0].type === 'secret_realm' || isScopedExpeditionGate(site[0]) ||
        fact.tick < chapter.startTick || !publiclySourced(fact, chapter.endTick) ||
        !fact.actorIds.length || !fact.actorIds.every(id => people.get(id)?.length === 1)) return false;
    const originals = raw.get(fact.id) ?? [], retained = anchors.get(fact.id) ?? [];
    return originals.length <= 1 && retained.length <= 1 &&
      [...originals, ...retained, ...(copies.get(fact.id) ?? [])].every(copy =>
        publiclySourced(copy, chapter.endTick) && sameMetadata(fact, copy));
  }
  function append(row: Candidate) {
    if (output.length >= ROW_LIMIT || threads.has(row.thread) || output.some(old => old.eventId === row.eventId)) return;
    if (!row.title || !row.paragraph) return;
    threads.add(row.thread);
    output.push(row);
  }
  for (const chapter of chapters) {
    const chapterAnchors = groups(chapter.anchors, row => row.id);
    const original = chapterFocalSources(world, chapter);
    const focal = projectChronicleReading(chapter, stampedChronicleLead(chapter), true, world).beats.filter(beat => beat.kind === 'focal');
    for (const beat of focal) {
      const id = beat.eventIds.length === 1 ? beat.eventIds[0] : undefined;
      const group = id ? chapterAnchors.get(id) : undefined;
      const fact = group?.length === 1 ? group[0] : undefined;
      if (!fact || !chapterFocalScore(fact) || !validFact(fact, chapter)) continue;
      const thread = chapterFocalThreadKey(fact);
      if (!thread) continue;
      // Prefer the actual resolution sentence anchored to this focal event, not a precursor or narration.
      let selected: { text: string; ids: readonly string[] } | undefined;
      for (const [i, paragraph] of beat.paragraphs.entries()) {
        const ids = beat.paragraphEventIds[i];
        if (!ids?.includes(fact.id) || !ids.every(key => {
          const match = chapterAnchors.get(key);
          return match?.length === 1 && validFact(match[0], chapter) && !!original(key);
        })) continue;
        selected = { text: paragraph, ids };
      }
      const title = bounded(writePublicChronicleScene(fact).title, 80);
      if (selected) {
        append({ thread, chapterId: chapter.id, eventId: fact.id, tick: fact.tick, title,
          paragraph: bounded(selected.text, 280), source: 'original', paragraphEventIds: [...selected.ids] });
      } else if (!raw.has(fact.id)) {
        // Cold readback can show the retained canonical scene, not material that needed a raw proof (e.g. a typed wound).
        // Use the exact reader's single-anchor fallback paragraph so returning can target the original DOM paragraph.
        const basic = beat.paragraphs.find((_, i) => beat.paragraphEventIds[i]?.length === 1 && beat.paragraphEventIds[i][0] === fact.id);
        const paragraph = bounded(publicChronicleExcerpt(basic ?? writePublicChronicleScene(fact).paragraph), 280);
        append({ thread, chapterId: chapter.id, eventId: fact.id, tick: fact.tick, title,
          paragraph, source: 'archived', paragraphEventIds: [fact.id] });
      }
    }
    if (viewer && output.length < ROW_LIMIT) {
      for (const arc of projectChapterTurningPoints(world, chapter.id, viewer.id).arcs) {
        const group = chapterAnchors.get(arc.consequenceEventId);
        const fact = group?.length === 1 ? group[0] : undefined;
        if (!fact || !validFact(fact, chapter)) continue;
        const scene = writePublicChronicleScene(fact);
        append({ thread: `causal:${fact.id}`, chapterId: chapter.id, eventId: fact.id, tick: fact.tick,
          title: bounded(scene.title, 80), paragraph: bounded(scene.paragraph, 280),
          source: original(fact.id) ? 'original' : 'archived', paragraphEventIds: [fact.id] });
      }
    }
    if (output.length >= ROW_LIMIT) break;
  }
  return { rows: output.sort((a, b) => a.tick - b.tick || (a.eventId < b.eventId ? -1 : 1))
    .map(({thread: _thread, ...row}) => row) };
}

import { compactColdHistory } from './coldHistoryEngine';
import { isChronicleStoryFact, projectChronicleLead } from './chronicleLead';
import type { ChronicleLead } from './chronicleLead';
import { writeChronicleScene } from './chronicleScene';
import type { ChronicleAnchor, ChronicleArchive, ChronicleChapter, ChronicleChapterPlan, WorldEvent, WorldState } from '../types/world';

export const CHRONICLE_INTERVAL = 12;
export const CHRONICLE_MAX_CHAPTERS = 24;
const ANCHORS_PER_TICK = 8;
const MAX_ANCHOR_AGE = 48;
const MAX_CHAPTER_ANCHORS = 18;
const MAX_BIOGRAPHIES = 8;
const MAX_TITLE = 80;
const MAX_PROSE = 2600;

export function createChronicleArchive(): ChronicleArchive {
  return { anchors: [], chapters: [] };
}

function cutText(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** Preserve public typed facts independently of the UI's latest-120 feed. */
export function archiveChronicleEvents(world: WorldState, events: WorldEvent[]): void {
  const archive = world.chronicleArchive ??= createChronicleArchive();
  const lower = Math.max(0, world.tick - MAX_ANCHOR_AGE + 1);
  const people = new Set(world.cultivators.map(({ id }) => id));
  const byTick = new Map<number, ChronicleAnchor[]>();
  const seen = new Set<string>();
  for (const anchor of archive.anchors) {
    if (anchor.tick < lower || anchor.tick > world.tick) continue;
    if (!byTick.has(anchor.tick)) byTick.set(anchor.tick, []);
    byTick.get(anchor.tick)!.push(anchor);
    seen.add(anchor.id);
  }
  for (const event of events) {
    if (event.witnessScope === 'participants' || event.tick < lower || event.tick > world.tick || seen.has(event.id)) continue;
    const title = cutText(event.title, MAX_TITLE);
    if (!title || !event.id) continue;
    const rows = byTick.get(event.tick) ?? [];
    const firstCategory = !rows.some((anchor) => anchor.category === event.category);
    if (rows.length >= ANCHORS_PER_TICK) {
      // Keep the earliest anchor in each category, and free a duplicate slot for a new category.
      if (!firstCategory) continue;
      let redundant = -1;
      for (let i = rows.length - 1; i > 0; i--) {
        if (rows.slice(0, i).some((older) => older.category === rows[i].category)) { redundant = i; break; }
      }
      if (redundant < 0) continue;
      rows.splice(redundant, 1);
    }
    const actorIds = [...new Set(event.actorIds.filter((id) => people.has(id)))].slice(0, 12);
    const dialogue = event.dialogue ? {
      kind: event.dialogue.kind, source: event.dialogue.source,
      turns: event.dialogue.turns.filter(({ speakerId }) => actorIds.includes(speakerId)).slice(0, 4)
        .map(({ speakerId, speakerName, text }) => ({ speakerId, speakerName: cutText(speakerName, 45), text: cutText(text, 140) })),
    } : undefined;
    rows.push({ id: event.id, tick: event.tick, year: event.year, month: event.month, title, category: event.category,
      description: cutText(event.description, 220), dialogue: dialogue?.turns.length ? dialogue : undefined, actorIds, locationId: event.locationId });
    seen.add(event.id);
    byTick.set(event.tick, rows);
  }
  archive.anchors = [...byTick.entries()].sort(([a], [b]) => a - b).flatMap(([, anchors]) => anchors);
}

function sampleAnchors(values: ChronicleAnchor[]): ChronicleAnchor[] {
  if (values.length <= MAX_CHAPTER_ANCHORS) return values;
  const indices = new Set<number>();
  const categories = new Set<string>();
  values.forEach((entry, i) => {
    if (!categories.has(entry.category)) { indices.add(i); categories.add(entry.category); }
  });
  // Preserve earliest/latest, then evenly sample the window in stable source order.
  indices.add(0); indices.add(values.length - 1);
  for (let i = 1; i < MAX_CHAPTER_ANCHORS - 1 && indices.size < MAX_CHAPTER_ANCHORS; i++) {
    indices.add(Math.round(i * (values.length - 1) / (MAX_CHAPTER_ANCHORS - 1)));
  }
  for (let i = 0; i < values.length && indices.size < MAX_CHAPTER_ANCHORS; i++) indices.add(i);
  return [...indices].sort((a,b) => a - b).map((i) => values[i]);
}

export function availableChronicleChapter(world: WorldState, force = false, endTick = world.tick): ChronicleChapterPlan | undefined {
  const archive = world.chronicleArchive;
  const previous = archive?.chapters[0];
  if (!archive || endTick < world.tick - 1 || endTick > world.tick || endTick <= (previous?.endTick ?? 0)) return undefined;
  const unrecordedFrom = (previous?.endTick ?? 0) + 1;
  if (!force && endTick - unrecordedFrom + 1 < CHRONICLE_INTERVAL) return undefined;
  const startTick = Math.max(unrecordedFrom, endTick - CHRONICLE_INTERVAL * 2 + 1);
  // A currently retained private/future original overrides an archival display copy with the same ID.
  const unavailable = new Set(world.events.filter((event) => !isChronicleStoryFact(event, endTick)).map(({ id }) => id));
  const anchors = sampleAnchors(archive.anchors.filter((anchor) => anchor.tick >= startTick &&
    isChronicleStoryFact(anchor, endTick) && !unavailable.has(anchor.id)));
  if (!anchors.length) return undefined;
  const mentions = new Map<string, string[]>();
  for (const anchor of anchors) {
    for (const actorId of anchor.actorIds) mentions.set(actorId, [...(mentions.get(actorId) ?? []), anchor.id]);
  }
  const biographies = [...mentions.entries()].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .slice(0, MAX_BIOGRAPHIES).flatMap(([actorId, anchorIds]) => {
      const actor = world.cultivators.find(({ id }) => id === actorId);
      if (!actor) return [];
      return [{ actorId, name: actor.name, realm: actor.realm,
        sectName: world.sects.find(({ id }) => id === actor.sectId)?.name, anchorIds }];
    });
  const chapterNumber = (previous?.chapterNumber ?? 0) + 1;
  const lead = projectChronicleLead(world, anchors, endTick);
  return { id: `chapter-${startTick}-${endTick}`, chapterNumber, startTick, endTick,
    title: chapterReadingTitle(chapterNumber, readScenes(anchors), lead),
    anchors: structuredClone(anchors), biographies };
}

export interface ChronicleReadingSection {
  eventId: string;
  title: string;
  paragraph: string;
  dialogue?: WorldEvent['dialogue'];
}
export interface ChronicleReading { title: string; sections: ChronicleReadingSection[] }

const drama: Record<ChronicleAnchor['category'], number> = {
  death: 5, combat: 4, breakthrough: 3, intrigue: 2, diplomacy: 1, heavenly: 0,
};

type AnchoredScene = { anchor: ChronicleAnchor; section: ChronicleReadingSection };
function readScenes(anchors: readonly ChronicleAnchor[]): AnchoredScene[] {
  return anchors.map((anchor) => {
    const { title, paragraph } = writeChronicleScene(anchor);
    const turns = anchor.dialogue?.turns.filter(({ speakerId, text }) =>
      anchor.actorIds.includes(speakerId) && Boolean(text.trim())).slice(0, 4).map((turn) => ({ ...turn }));
    const dialogue = anchor.dialogue && turns?.length ? { ...anchor.dialogue, turns } : undefined;
    return { anchor, section: { eventId: anchor.id, title, paragraph, ...(dialogue ? { dialogue } : {}) } };
  });
}

function chapterReadingTitle(chapterNumber: number, scenes: readonly AnchoredScene[], lead?: ChronicleLead): string {
  const proved = lead ? new Set(lead.eventIds) : undefined;
  const any = scenes.filter(({ anchor }) => lead && proved?.has(anchor.id) && anchor.actorIds.includes(lead.actorId) &&
    anchor.tick >= lead.firstTick && anchor.tick <= lead.lastTick);
  const selection = any.length ? any : scenes;
  const chosen = selection.reduce<AnchoredScene | undefined>((best, scene) =>
    !best || drama[scene.anchor.category] > drama[best.anchor.category] ? scene : best, undefined);
  const prefix = `第${chapterNumber}章：`;
  return prefix + cutText(chosen?.section.title ?? '山河一页', MAX_TITLE - prefix.length);
}

/** Novel-first view of existing public facts. Saved prose, chronology and proof are left untouched. */
export function projectChronicleReading(chapter: ChronicleChapter, lead?: ChronicleLead): ChronicleReading {
  const scenes = readScenes(chapter.anchors.filter((anchor) =>
    anchor.tick >= chapter.startTick && isChronicleStoryFact(anchor, chapter.endTick)));
  return { title: chapterReadingTitle(chapter.chapterNumber, scenes, lead), sections: scenes.map(({ section }) => section) };
}

const calendricalHeading = /(?:^|\n)\s*(?:[#*]+\s*)?(?:仙历\s*\d+|第[零〇一二三四五六七八九十百千万两\d]+(?:大?纪元|大世纪|(?:至第?[零〇一二三四五六七八九十百千万两\d]+)?轮)|(?:大?纪元|纪年|编年史)[:：])/u;

/** Legacy/enhanced model prose is ancillary. The app, not the model, quotes the recorded dialogue. */
export function isChronicleDraftNovelStyle(title: string, body: string): boolean {
  const bareTitle = title.replace(/^第[0-9一二三四五六七八九十百千万〇零]+章\s*[：:]?\s*/, '');
  return !calendricalHeading.test(bareTitle) && !calendricalHeading.test(body) &&
    !/[「」『』“”"]/u.test(body) && !/(?:曰|问道|答道|说道)[：:]/u.test(body);
}

function deterministicBody(chapter: ChronicleChapterPlan): string {
  return projectChronicleReading({ ...chapter, body: '', source: 'utility' }).sections.map(({ title, paragraph, dialogue }) => {
    const quoted = dialogue?.turns.map(({ speakerName, text }) => `${speakerName}：「${text}」`).join('\n') ?? '';
    return [title, paragraph === title ? '' : paragraph, quoted].filter(Boolean).join('\n');
  }).join('\n\n');
}

export function resolveChronicleChapter(world: WorldState, plan: ChronicleChapterPlan, prose?: { title: string; body: string }, endTick = world.tick): ChronicleChapter | null {
  const current = availableChronicleChapter(world, true, endTick);
  if (!current || current.id !== plan.id || JSON.stringify(current) !== JSON.stringify(plan)) return null;
  const prefix = `第${current.chapterNumber}章：`;
  const titleSuffix = typeof prose?.title === 'string'
    ? cutText(prose.title, MAX_TITLE).replace(/^第[0-9一二三四五六七八九十百千万〇零]+章\s*[：:]?\s*/, '').slice(0, MAX_TITLE - prefix.length)
    : '';
  const body = typeof prose?.body === 'string' ? cutText(prose.body, MAX_PROSE) : '';
  const chapter: ChronicleChapter = titleSuffix && body && isChronicleDraftNovelStyle(titleSuffix, body) ? { ...current, title: prefix + titleSuffix, body: `${body}\n\n公开史料索引（以上为文学演绎）\n${current.anchors.map((anchor) =>
      `第${anchor.tick}轮 · ${anchor.title}`).join('\n')}`, source: 'llm' } :
    { ...current, body: deterministicBody(current), source: 'utility' };
  world.chronicleArchive.chapters = [chapter, ...world.chronicleArchive.chapters];
  compactColdHistory(world);
  return chapter;
}

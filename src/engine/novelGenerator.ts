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
  const anchors = sampleAnchors(archive.anchors.filter(({ tick }) => tick >= startTick && tick <= endTick));
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
  return { id: `chapter-${startTick}-${endTick}`, chapterNumber, startTick, endTick, title: `第${chapterNumber}章：第${startTick}至${endTick}轮 · 山河行纪`,
    anchors: structuredClone(anchors), biographies };
}

function deterministicBody(plan: ChronicleChapterPlan): string {
  const first = plan.anchors[0];
  const last = plan.anchors[plan.anchors.length - 1];
  const record = plan.anchors.map((anchor) => {
    const dialogue = anchor.dialogue?.turns.map(({ speakerName, text }) => `${speakerName}曰：「${text}」`).join(' ') ?? '';
    return `${anchor.year}年${anchor.month}月，天道史牍记曰：「${anchor.title}」。${anchor.description}${dialogue ? `\n${dialogue}` : ''}`;
  });
  const bios = plan.biographies.map(({ name, realm, sectName, anchorIds }) =>
    `${name}，${sectName ? `归属${sectName}，` : ''}编录时修至${realm}。本章公开史料见其名${anchorIds.length}次。`);
  return [`风过山门，卷帙新启。此卷采自${first.year}年${first.month}月至${last.year}年${last.month}月的公开纪闻，未录密会之语。`,
    record.join('\n\n'), ...(bios.length ? [`列传小记\n\n${bios.join('\n')}`] : [])].join('\n\n');
}

export function resolveChronicleChapter(world: WorldState, plan: ChronicleChapterPlan, prose?: { title: string; body: string }, endTick = world.tick): ChronicleChapter | null {
  const current = availableChronicleChapter(world, true, endTick);
  if (!current || current.id !== plan.id || JSON.stringify(current) !== JSON.stringify(plan)) return null;
  const prefix = `第${current.chapterNumber}章：`;
  const titleSuffix = typeof prose?.title === 'string'
    ? cutText(prose.title, MAX_TITLE).replace(/^第[0-9一二三四五六七八九十百千万〇零]+章\s*[：:]?\s*/, '').slice(0, MAX_TITLE - prefix.length)
    : '';
  const body = typeof prose?.body === 'string' ? cutText(prose.body, MAX_PROSE) : '';
  const chapter: ChronicleChapter = titleSuffix && body ? { ...current, title: prefix + titleSuffix, body: `${body}\n\n公开史料索引（以上为文学演绎）\n${current.anchors.map((anchor) =>
      `第${anchor.tick}轮 · ${anchor.title}`).join('\n')}`, source: 'llm' } :
    { ...current, body: deterministicBody(current), source: 'utility' };
  world.chronicleArchive.chapters = [chapter, ...world.chronicleArchive.chapters].slice(0, CHRONICLE_MAX_CHAPTERS);
  return chapter;
}

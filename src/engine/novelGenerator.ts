import { deriveChapterOpening } from './chapterContinuity';
import { deriveChapterEndHook } from './chapterEndHooks';
import { writeMundaneLifeProse } from './mundaneLifeProse';
import { compactColdHistory } from './coldHistoryEngine';
import { isChronicleStoryFact, projectChronicleLead } from './chronicleLead';
import type { ChronicleLead } from './chronicleLead';
import { projectEarnedChronicleLead } from './protagonistSuccession';
import { publicChronicleExcerpt, writePublicChronicleScene } from './chroniclePublicProse';
import { buildSerializedChapterPacing, type ChronicleReadingBeat } from './serializedChapterPacing';
export type { ChronicleReadingBeat } from './serializedChapterPacing';
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

/** Narrative source identity excludes compatible alternate wordings of the same public dialogue. */
function chapterNarrativeDisputes(world:WorldState,cutoff:number):ReadonlySet<string>{
  const known=new Set(world.cultivators.map(actor=>actor.id));
  const fields=new Map<string,string>(),nativeOutcomes=new Map<string,string>(),disputed=new Set<string>();
  for(const event of world.events){
    const outcome=JSON.stringify([event.duelWinnerId,event.damage]);
    const prior=nativeOutcomes.get(event.id);
    if(prior!==undefined&&prior!==outcome)disputed.add(event.id);
    nativeOutcomes.set(event.id,outcome);
  }
  for(const fact of [...world.events,...world.chronicleArchive.anchors]){
    if(!isChronicleStoryFact(fact,cutoff)){disputed.add(fact.id);continue;}
    const signature=JSON.stringify([fact.tick,fact.year,fact.month,fact.category,cutText(fact.title,80),
      cutText(fact.description,220),[...new Set(fact.actorIds.filter(id=>known.has(id)))].slice(0,12),fact.locationId??null]);
    const prior=fields.get(fact.id);
    if(prior!==undefined&&prior!==signature)disputed.add(fact.id);
    fields.set(fact.id,signature);
  }
  return disputed;
}

export function availableChronicleChapter(world: WorldState, force = false, endTick = world.tick): ChronicleChapterPlan | undefined {
  const archive = world.chronicleArchive;
  const previous = archive?.chapters[0];
  if (!archive || endTick < world.tick - 1 || endTick > world.tick || endTick <= (previous?.endTick ?? 0)) return undefined;
  const unrecordedFrom = (previous?.endTick ?? 0) + 1;
  if (!force && endTick - unrecordedFrom + 1 < CHRONICLE_INTERVAL) return undefined;
  const startTick = Math.max(unrecordedFrom, endTick - CHRONICLE_INTERVAL * 2 + 1);
  // The current proof index also rejects contradictory public copies, not just future/private replacements.
  const unavailable = chapterNarrativeDisputes(world,endTick);
  const anchors = sampleAnchors(archive.anchors.filter((anchor) => anchor.tick >= startTick &&
    isChronicleStoryFact(anchor, endTick) && !unavailable.has(anchor.id)));
  if (!anchors.length) return undefined;
  const evaluated = (world.protagonistSuccession.lastEvaluatedTick ?? -1) >= endTick;
  const earned = evaluated ? projectEarnedChronicleLead(world, anchors, endTick) : undefined;
  const mentions = new Map<string, string[]>();
  for (const anchor of anchors) {
    for (const actorId of anchor.actorIds) mentions.set(actorId, [...(mentions.get(actorId) ?? []), anchor.id]);
  }
  const biographies = [...mentions.entries()].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .sort(([a], [b]) => Number(b === earned?.actorId) - Number(a === earned?.actorId))
    .slice(0, MAX_BIOGRAPHIES).flatMap(([actorId, anchorIds]) => {
      const actor = world.cultivators.find(({ id }) => id === actorId);
      if (!actor) return [];
      return [{ actorId, name: actor.name, realm: actor.realm,
        sectName: world.sects.find(({ id }) => id === actor.sectId)?.name, anchorIds }];
    });
  const chapterNumber = (previous?.chapterNumber ?? 0) + 1;
  const lead = evaluated ? earned : projectChronicleLead(world, anchors, endTick);
  const storyFocal = evaluated ? earned
    ? { kind: 'lead' as const, actorId: earned.actorId, arcId: earned.arcId, eventIds: [...earned.eventIds] }
    : { kind: 'ensemble' as const } : undefined;
  return { id: `chapter-${startTick}-${endTick}`, chapterNumber, startTick, endTick,
    title: chapterReadingTitle(chapterNumber, readScenes(anchors), lead),
    anchors: structuredClone(anchors), biographies, ...(storyFocal ? { storyFocal } : {}) };
}

export interface ChronicleReadingSection {
  eventId: string;
  title: string;
  paragraph: string;
  dialogue?: WorldEvent['dialogue'];
}
export interface ChronicleReading {
  title:string;
  sections:ChronicleReadingSection[];
  beats:ChronicleReadingBeat[];
  continuity?:{
    opening?:NonNullable<ReturnType<typeof deriveChapterOpening>>;
    closing?:NonNullable<ReturnType<typeof deriveChapterEndHook>>;
  };
}

const drama: Record<ChronicleAnchor['category'], number> = {
  death: 5, combat: 4, breakthrough: 3, intrigue: 2, diplomacy: 1, heavenly: 0,
};

type AnchoredScene = { anchor: ChronicleAnchor; section: ChronicleReadingSection };
function readScenes(anchors: readonly ChronicleAnchor[], publicAttributionOnly = false): AnchoredScene[] {
  return anchors.map((anchor) => {
    const { title, paragraph } = (publicAttributionOnly ? writePublicChronicleScene : writeChronicleScene)(anchor);
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

export function stampedChronicleLead(chapter: ChronicleChapterPlan): ChronicleLead | undefined {
  const stamp = chapter.storyFocal;
  if (stamp?.kind !== 'lead') return undefined;
  const biography = chapter.biographies.find(({ actorId }) => actorId === stamp.actorId);
  if (!biography) return undefined;
  const sourceIds = new Set(stamp.eventIds);
  const anchors = chapter.anchors.filter((anchor) => sourceIds.has(anchor.id) && biography.anchorIds.includes(anchor.id) &&
    anchor.actorIds.includes(stamp.actorId) && anchor.tick >= chapter.startTick &&
    isChronicleStoryFact(anchor, chapter.endTick));
  if (new Set(anchors.map(({ id }) => id)).size < 2 || new Set(anchors.map(({ tick }) => tick)).size < 2) return undefined;
  return { actorId: stamp.actorId, name: biography.name, eventIds: anchors.map(({ id }) => id),
    firstTick: Math.min(...anchors.map(({ tick }) => tick)), lastTick: Math.max(...anchors.map(({ tick }) => tick)) };
}

/** Novel-first view of existing public facts. Saved prose, chronology and proof are left untouched. */
export function projectChronicleReading(chapter: ChronicleChapter, lead?: ChronicleLead, publicAttributionOnly = false, world?: WorldState): ChronicleReading {
  const counts=new Map<string,number>();
  for(const anchor of chapter.anchors)counts.set(anchor.id,(counts.get(anchor.id)??0)+1);
  const anchors=chapter.anchors.filter(anchor=>counts.get(anchor.id)===1&&
    anchor.tick>=chapter.startTick&&isChronicleStoryFact(anchor,chapter.endTick));
  const scenes=readScenes(anchors,publicAttributionOnly);
  // Manuscript prose and raw attributed dialogue never supply a paced paragraph, even for legacy chapters.
  const sourced=anchors.filter(anchor=>Boolean(publicChronicleExcerpt(anchor.description).trim()||publicChronicleExcerpt(anchor.title).trim()))
    .map(anchor=>({anchor,section:writePublicChronicleScene(anchor),quietParagraph:writeMundaneLifeProse(anchor)}));
  const chapterScope = { ...chapter, anchors };
  const opening = world && anchors.length ? deriveChapterOpening(world, chapterScope, deriveChapterEndHook) : undefined;
  const closing = world && anchors.length ? deriveChapterEndHook(world, chapterScope) : undefined;
  return {title:chapterReadingTitle(chapter.chapterNumber,scenes,lead),sections:scenes.map(({section})=>section),
    beats:buildSerializedChapterPacing(sourced,lead),
    ...(opening || closing ? { continuity: { ...(opening ? { opening } : {}), ...(closing ? { closing } : {}) } } : {}) };
}

const calendricalHeading = /(?:^|\n)\s*(?:[#*]+\s*)?(?:仙历\s*\d+|第[零〇一二三四五六七八九十百千万两\d]+(?:大?纪元|大世纪|(?:至第?[零〇一二三四五六七八九十百千万两\d]+)?轮)|(?:大?纪元|纪年|编年史)[:：])/u;

/** Legacy/enhanced model prose is ancillary. The app, not the model, quotes the recorded dialogue. */
export function isChronicleDraftNovelStyle(title: string, body: string): boolean {
  const bareTitle = title.replace(/^第[0-9一二三四五六七八九十百千万〇零]+章\s*[：:]?\s*/, '');
  return !calendricalHeading.test(bareTitle) && !calendricalHeading.test(body) &&
    !/[「」『』“”"]/u.test(body) && !/(?:曰|问道|答道|说道)[：:]/u.test(body);
}

function deterministicBody(world: WorldState, chapter: ChronicleChapterPlan): string {
  const reading=projectChronicleReading({...chapter,body:'',source:'utility'},stampedChronicleLead(chapter),true,world);
  const sources=new Map(reading.sections.map(section=>[section.eventId,section]));
  const prose = reading.beats.map(beat=>{
    // Exact lines remain in the manuscript and evidence panel; they don't become independent headlines.
    const quoted=beat.eventIds.flatMap(id=>sources.get(id)?.dialogue?.turns.map(
      ({speakerName,text})=>`${speakerName}：「${text}」`)??[]);
    return [beat.title,...beat.paragraphs,...quoted].filter(Boolean).join('\n');
  });
  return [reading.continuity?.opening?.text, ...prose, reading.continuity?.closing?.text].filter(Boolean).join('\n\n');
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
    { ...current, body: deterministicBody(world,current), source: 'utility' };
  world.chronicleArchive.chapters = [chapter, ...world.chronicleArchive.chapters];
  compactColdHistory(world);
  return chapter;
}

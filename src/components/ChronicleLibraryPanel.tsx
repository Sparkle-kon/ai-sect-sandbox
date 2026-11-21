import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { publicChronicleChapters } from '../engine/coldHistoryEngine';
import { projectChronicleReading } from '../engine/novelGenerator';
import { isChronicleStoryFact, projectChronicleLead, publicChronicleSceneEvents, type ChronicleLead } from '../engine/chronicleLead';
import type { ChronicleChapter, Cultivator, WorldEvent, WorldState } from '../types/world';
import { DialogueTranscript } from './DialogueTranscript';
import { ColdChronicleShelf } from './ColdChronicleShelf';
import { ChronicleErrataPanel } from './ChronicleErrataPanel';

const PAGES = ['chapter', 'biography'] as const;
type Page = typeof PAGES[number];
const PAGE_NAMES: Record<Page, string> = { chapter: '故事正文', biography: '人物小传' };

const canonicalExcerpt = (text: string, limit: number) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit);

function chapterForReading(chapter: ChronicleChapter, liveIds: ReadonlySet<string>, publicById: ReadonlyMap<string, WorldEvent>): ChronicleChapter {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const anchor of chapter.anchors) {
    if (seen.has(anchor.id)) duplicate.add(anchor.id);
    seen.add(anchor.id);
  }
  const anchors = chapter.anchors.filter((anchor) => {
    if (anchor.tick < chapter.startTick || !isChronicleStoryFact(anchor, chapter.endTick) || duplicate.has(anchor.id)) return false;
    if (!liveIds.has(anchor.id)) return true; // A genuine older anchor need not still be in the live feed.
    const live = publicById.get(anchor.id);
    return Boolean(live && live.tick === anchor.tick && live.category === anchor.category && live.locationId === anchor.locationId &&
      canonicalExcerpt(live.title, 80) === anchor.title && canonicalExcerpt(live.description, 220) === anchor.description);
  });
  return anchors.length === chapter.anchors.length ? chapter : { ...chapter, anchors, body: '' };
}

function ChapterArchive({ chapter, reading, lead }: {
  chapter: ChronicleChapter; reading: ReturnType<typeof projectChronicleReading>; lead?: ChronicleLead;
}) {
  const [readOriginal, setReadOriginal] = useState(false);
  const scenes = new Map(reading.sections.map((entry) => [entry.eventId, entry]));
  const anchors = chapter.anchors.filter(({ id }) => scenes.has(id));
  const hasLead = lead && new Set(lead.eventIds.filter((id) => scenes.has(id))).size >= 2;
  return (
    <article aria-label="章节正文" className="space-y-3">
      {hasLead && <p className="break-words text-xs text-amber-200">此篇随{lead.name}一路读去。</p>}
      {reading.sections.length > 0 ? reading.sections.map((section) => (
        <section key={section.eventId} className="min-w-0 space-y-1">
          <h5 className="break-words font-serif text-sm font-semibold text-amber-100">{section.title}</h5>
          {section.paragraph && section.paragraph !== section.title &&
            <p className="whitespace-pre-wrap break-words font-serif text-sm leading-7 text-slate-100">{section.paragraph}</p>}
        </section>
      )) : <p className="text-sm text-slate-400">本章没有可写成场景的公开史料。</p>}
      <details className="rounded border border-slate-800 bg-slate-950/70 p-2">
        <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-amber-200">本章公开史料 · {anchors.length} 条</summary>
        <p className="text-xs text-slate-400">记载时段：Tick #{chapter.startTick} 至 #{chapter.endTick}</p>
        {anchors.length ? (
          <ol className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-xs text-slate-300">
            {anchors.map((anchor) => {
              const dialogue = scenes.get(anchor.id)?.dialogue;
              return <li key={anchor.id} className="space-y-1 break-words border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-400">仙历 {anchor.year} 年 {anchor.month} 月 · Tick #{anchor.tick}：</span>
                {anchor.title}
                {anchor.description && <p className="text-slate-300">{anchor.description}</p>}
                {dialogue && <DialogueTranscript dialogue={dialogue} />}
              </li>;
            })}
          </ol>
        ) : <p className="mt-2 text-xs text-slate-400">本章无可列出的公开史料。</p>}
      </details>
      {chapter.body && anchors.length > 0 && anchors.length === chapter.anchors.length && <details
        className="rounded border border-slate-800 bg-slate-950/70 p-2" onToggle={(event) => setReadOriginal(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer break-words py-2 text-xs font-medium text-slate-300">原存档稿</summary>
        {readOriginal && <>
          <p className="break-words text-xs text-amber-200">{chapter.title} · {chapter.source === 'llm' ? '模型润色' : '离线编纂'}。原稿不是事实来源。</p>
          <p className="whitespace-pre-wrap break-words font-serif text-sm leading-7 text-slate-100">{chapter.body}</p>
        </>}
      </details>}
    </article>
  );
}

export function ChapterBiographies({ chapter }: { chapter: ChronicleChapter }) {
  const anchors = new Map(chapter.anchors.filter((anchor) => anchor.tick >= chapter.startTick && isChronicleStoryFact(anchor, chapter.endTick))
    .map((anchor) => [anchor.id, anchor]));
  if (chapter.biographies.length === 0) return <p className="text-sm text-slate-400">本章尚无人物小传。</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="本章人物小传">
      {chapter.biographies.map((entry) => {
        const publicFacts = entry.anchorIds.flatMap((id) => {
          const anchor = anchors.get(id);
          return anchor && anchor.actorIds.includes(entry.actorId) ? [anchor] : [];
        });
        return (
          <li key={entry.actorId} className="min-w-0 space-y-1.5 rounded border border-slate-800 bg-slate-950/70 p-2">
            <h4 className="break-words text-sm font-semibold text-amber-100">{entry.name}</h4>
            <p className="break-words text-xs text-slate-400">{entry.realm}{entry.sectName ? ` · ${entry.sectName}` : ''}</p>
            {publicFacts.length === 0 ? <p className="text-xs text-slate-400">本章未载其公开事迹。</p> : (
              <ul className="space-y-1 text-xs leading-relaxed text-slate-300">
                {publicFacts.map((anchor) => <li key={anchor.id} className="break-words">Tick #{anchor.tick} · {anchor.title}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ChronicleLibraryPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const [page, setPage] = useState<Page>('chapter');
  const [requestedChapter, setRequestedChapter] = useState<string>();
  const paneId = useId();
  const tabs = useRef<Partial<Record<Page, HTMLButtonElement | null>>>({});
  const recentIds = new Set((world.chronicleArchive?.chapters ?? []).map(({ id }) => id));
  const liveIds = new Set(world.events.map(({ id }) => id));
  const publicById = new Map(publicChronicleSceneEvents(world).map((entry) => [entry.id, entry]));
  const readable = (entry: ChronicleChapter) => chapterForReading(entry, liveIds, publicById);
  const chapters = publicChronicleChapters(world).filter(({ id }) => recentIds.has(id)).map(readable);
  const chapter = chapters.find(({ id }) => id === requestedChapter) ?? chapters[0];
  const lead = chapter && projectChronicleLead(world, chapter.anchors, chapter.endTick);
  const reading = chapter && projectChronicleReading(chapter, lead);

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: Page;
    if (event.key === 'Home') next = PAGES[0];
    else if (event.key === 'End') next = PAGES[PAGES.length - 1];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = PAGES[(PAGES.indexOf(page) + 1) % PAGES.length];
    else return;
    event.preventDefault();
    setPage(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className="space-y-3 rounded-xl border border-amber-400/20 bg-slate-900/60 p-3 sm:p-4" aria-label="藏书阁">
      <header>
        <h3 className="text-sm font-semibold tracking-wide text-amber-100">藏书阁</h3>
        <p className="text-xs text-slate-300">叙事视角：仅公开史料。未公开的密议、私语与内心独白不入此卷。</p>
      </header>
      {chapters.length > 0 && (
        <label className="grid gap-1 text-xs text-slate-300">
          近期章目
          <select
            className="min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={chapter?.id ?? ''}
            onChange={(event) => setRequestedChapter(event.currentTarget.value)}
          >
            {chapters.map((entry) => <option key={entry.id} value={entry.id}>{entry === chapter ? reading?.title : projectChronicleReading(entry).title}</option>)}
          </select>
        </label>
      )}
      <div role="tablist" aria-label="藏书阁视图" className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2">
        {PAGES.map((kind) => (
          <button
            ref={(node) => { tabs.current[kind] = node; }}
            key={kind}
            type="button"
            id={`${paneId}-tab-${kind}`}
            role="tab"
            aria-selected={page === kind}
            aria-controls={`${paneId}-panel-${kind}`}
            tabIndex={page === kind ? 0 : -1}
            onClick={() => setPage(kind)}
            onKeyDown={moveTab}
            className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${page === kind
              ? 'border-amber-400/40 bg-amber-950/60 text-amber-100'
              : 'border-slate-800 text-slate-300 hover:bg-slate-800'}`}
          >
            {PAGE_NAMES[kind]}
          </button>
        ))}
      </div>
      {reading && <h4 className="break-words font-serif text-lg font-semibold text-slate-100">{reading.title}</h4>}
      {PAGES.map((kind) => (
        <div
          key={kind}
          id={`${paneId}-panel-${kind}`}
          role="tabpanel"
          aria-labelledby={`${paneId}-tab-${kind}`}
          hidden={page !== kind}
          tabIndex={page === kind ? 0 : -1}
        >
          {page === kind && (!chapter || !reading
            ? <p className="text-sm text-slate-400">尚无已编成的章节。公开史料累积到结集时会出现新篇。</p>
            : kind === 'chapter' ? <ChapterArchive key={chapter.id} chapter={chapter} reading={reading} lead={lead} /> : <ChapterBiographies chapter={chapter} />)}
        </div>
      ))}
      <ChronicleErrataPanel world={world} chapter={chapter} cultivator={cultivator} />
      <ColdChronicleShelf world={world} chapterTitle={(older) => projectChronicleReading(readable(older)).title}
        readChapter={(older) => {
          const safe = readable(older);
          const olderLead = projectChronicleLead(world, safe.anchors, safe.endTick);
          return <ChapterArchive key={safe.id} chapter={safe} reading={projectChronicleReading(safe, olderLead)} lead={olderLead} />;
        }} />
    </section>
  );
}

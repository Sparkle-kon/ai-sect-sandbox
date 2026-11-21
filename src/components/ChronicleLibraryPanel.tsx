import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ChronicleChapter, WorldState } from '../types/world';
import { DialogueTranscript } from './DialogueTranscript';

const PAGES = ['chapter', 'biography'] as const;
type Page = typeof PAGES[number];
const PAGE_NAMES: Record<Page, string> = { chapter: '纪传体史书', biography: '人物小传' };

function ChapterArchive({ chapter }: { chapter: ChronicleChapter }) {
  return (
    <article aria-label="章节正文" className="space-y-3">
      <p className="text-xs text-amber-200">{chapter.source === 'llm' ? '模型润色' : '离线编纂'} · 小说化叙述，事实以所附史料为准。</p>
      <div className="whitespace-pre-wrap break-words font-serif text-sm leading-7 text-slate-100">{chapter.body}</div>
      <details className="rounded border border-slate-800 bg-slate-950/70 p-2">
        <summary className="cursor-pointer text-xs font-medium text-amber-200">本章公开史料 · {chapter.anchors.length} 条</summary>
        {chapter.anchors.length ? (
          <ol className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-xs text-slate-300">
            {chapter.anchors.map((anchor) => (
              <li key={anchor.id} className="space-y-1 break-words border-b border-slate-800/60 pb-1.5">
                <span className="text-slate-400">仙历 {anchor.year} 年 {anchor.month} 月 · Tick #{anchor.tick}：</span>
                {anchor.title}
                {anchor.description && <p className="text-slate-300">{anchor.description}</p>}
                {anchor.dialogue && <DialogueTranscript dialogue={anchor.dialogue} />}
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-xs text-slate-400">本章无可列出的公开史料。</p>}
      </details>
    </article>
  );
}

export function ChapterBiographies({ chapter }: { chapter: ChronicleChapter }) {
  const anchors = new Map(chapter.anchors.map((anchor) => [anchor.id, anchor]));
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

export function ChronicleLibraryPanel({ world }: { world: WorldState }) {
  const [page, setPage] = useState<Page>('chapter');
  const [requestedChapter, setRequestedChapter] = useState<string>();
  const paneId = useId();
  const tabs = useRef<Partial<Record<Page, HTMLButtonElement | null>>>({});
  const chapters = [...(world.chronicleArchive?.chapters ?? [])].sort((a, b) => b.endTick - a.endTick);
  const chapter = chapters.find(({ id }) => id === requestedChapter) ?? chapters[0];

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
          章目
          <select
            className="min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
            value={chapter?.id ?? ''}
            onChange={(event) => setRequestedChapter(event.currentTarget.value)}
          >
            {chapters.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
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
      {chapter && (
        <div className="space-y-0.5">
          <h4 className="break-words font-serif text-lg font-semibold text-slate-100">{chapter.title}</h4>
          <p className="text-xs text-slate-400">记载时段：Tick #{chapter.startTick} 至 #{chapter.endTick}</p>
        </div>
      )}
      {PAGES.map((kind) => (
        <div
          key={kind}
          id={`${paneId}-panel-${kind}`}
          role="tabpanel"
          aria-labelledby={`${paneId}-tab-${kind}`}
          hidden={page !== kind}
          tabIndex={page === kind ? 0 : -1}
        >
          {page === kind && (!chapter
            ? <p className="text-sm text-slate-400">尚无已编成的章节。公开史料累积到结集时会出现新篇。</p>
            : kind === 'chapter' ? <ChapterArchive chapter={chapter} /> : <ChapterBiographies chapter={chapter} />)}
        </div>
      ))}
    </section>
  );
}

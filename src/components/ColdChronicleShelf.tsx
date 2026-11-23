import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { publicChronicleChapters } from '../engine/coldHistoryEngine';
import type { ChronicleChapter, WorldState } from '../types/world';

export const COLD_CHAPTER_PAGE_SIZE = 8;

/** The shelf is a read of the supplied branch snapshot, never a new retention mode. */
export function coldChroniclePage(world: WorldState, requestedPage: number) {
  const active = new Set(world.chronicleArchive.chapters.map(({ id }) => id));
  const chapters = publicChronicleChapters(world).filter(({ id, endTick }) => !active.has(id) && endTick <= world.tick);
  const pages = Math.max(1, Math.ceil(chapters.length / COLD_CHAPTER_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Number.isSafeInteger(requestedPage) ? requestedPage : 0));
  return { chapters, rows: chapters.slice(page * COLD_CHAPTER_PAGE_SIZE, (page + 1) * COLD_CHAPTER_PAGE_SIZE), page, pages };
}

/** The closed shelf reads only dates and identifiers, never provenance, prose or chapter bodies. */
function coldHeaderCount(world: WorldState): number {
  const hot=new Set(world.chronicleArchive.chapters.map(row=>row.id));
  const counted=new Set<string>();
  for(const row of world.coldHistory?.chapters??[]){
    if(row.startTick<=row.endTick&&row.endTick<=world.tick&&!hot.has(row.id))counted.add(row.id);
  }
  return counted.size;
}

const button = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';

export function ColdChronicleShelf({ world, chapterTitle, readChapter }: {
  world: WorldState; chapterTitle: (chapter: ChronicleChapter) => string; readChapter: (chapter: ChronicleChapter) => ReactNode;
}) {
  const [cursor, setCursor] = useState(0);
  const [requested, setRequested] = useState<string>();
  const [opened, setOpened] = useState(false);
  const shelf = useMemo(() => opened ? coldChroniclePage(world, cursor) : undefined, [opened, world, cursor]);
  const selected = shelf && requested ? shelf.rows.find(({ id }) => id === requested) : undefined;
  const headerCount=coldHeaderCount(world);
  const count = shelf?.chapters.length ?? headerCount;
  const dropped = world.coldHistory?.droppedChapters ?? 0;
  if (!headerCount && dropped === 0) return null;

  return (
    <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/65"
      onToggle={(event) => { setOpened(event.currentTarget.open); }}>
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-200">远纪档案 · {count} 章</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>这是此分支、本时点已归档的公开史书，只供阅读。归档章目不是可回到的模拟快照。</p>
        {dropped > 0 && <p className="text-slate-400">保留范围外已淘汰 {dropped} 章；所附现存史料以本分支为准。</p>}
        {shelf && (shelf.rows.length ? <>
          <p className="text-slate-400" role="status">第 {shelf.page + 1}/{shelf.pages} 页 · 每页最多 {COLD_CHAPTER_PAGE_SIZE} 章</p>
          <ol aria-label="本页远纪章目" className="space-y-1">
            {shelf.rows.map((chapter) => <li key={chapter.id} className="min-w-0">
              <button type="button" aria-pressed={selected?.id === chapter.id} className={`${button} w-full break-words py-1 text-left`}
                onClick={() => setRequested((prior) => prior === chapter.id ? undefined : chapter.id)}>
                {chapterTitle(chapter)}
              </button>
            </li>)}
          </ol>
          {shelf.pages > 1 && <div className="grid grid-cols-2 gap-1.5" aria-label="远纪档案分页">
            <button type="button" className={button} disabled={shelf.page === 0} onClick={() => { setRequested(undefined); setCursor(shelf.page - 1); }}>上一页</button>
            <button type="button" className={button} disabled={shelf.page + 1 === shelf.pages} onClick={() => { setRequested(undefined); setCursor(shelf.page + 1); }}>下一页</button>
          </div>}
          {selected && <div className="space-y-2 border-t border-slate-800 pt-2" aria-label="所选远纪章目">
            <h5 className="break-words text-sm font-semibold text-amber-100">{chapterTitle(selected)} · 归档只读</h5>
            {readChapter(selected)}
          </div>}
        </> : <p className="text-slate-400">当前未保留可读的远纪章目。</p>)}
      </div>
    </details>
  );
}

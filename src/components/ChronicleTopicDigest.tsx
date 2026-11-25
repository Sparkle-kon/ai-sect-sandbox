import { useId, useMemo, useState } from 'react';
import { projectChronicleDigest, type ChronicleDigestEntry, type ChronicleDigestTopic, type ChronicleDigestWindow } from '../engine/chronicleDigest';
import type { WorldState } from '../types/world';

const TOPICS: Record<ChronicleDigestTopic, string> = { chapters: '章节事迹', villages: '村镇', market: '商路' };
const WINDOWS: Record<ChronicleDigestWindow, string> = { near: '最近 12 回合', long: '最近 48 回合', retained: '现存实录' };
export const CHRONICLE_DIGEST_PAGE_SIZE = 6;
type ProofSelection = { entryId: string; sourceId: string };

const control = 'min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';

function SourceProof({ entry, id }: { entry: ChronicleDigestEntry; id: string }) {
  const { proof } = entry;
  return <div id={id} aria-label="这一幕的原始凭据" className="space-y-2 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300">
    <h6 className="font-semibold text-amber-100">{proof.label}</h6>
    <p className="text-slate-400">事发回合 #{entry.tick}</p>
    {proof.original && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{proof.original}</p>}
    {!!proof.fields?.length && <dl className="space-y-1">
      {proof.fields.map(({ label, value }, index) => <div key={`${label}:${index}`} className="min-w-0 [overflow-wrap:anywhere]">
        <dt className="inline font-semibold text-slate-200">{label}：</dt><dd className="inline">{value}</dd>
      </div>)}
    </dl>}
    {!!proof.earlier?.length && <section aria-label="可证的前因" className="space-y-1 border-t border-slate-800 pt-2">
      <h6 className="font-semibold text-amber-100">可证的前因</h6>
      <ul className="space-y-1">
        {proof.earlier.map(({ id: earlierId, tick, label, relation }) => <li key={`${earlierId}:${relation}`} className="[overflow-wrap:anywhere]">
          {relation}：{label} · 回合 #{tick}
        </li>)}
      </ul>
    </section>}
    {!!proof.interpretations?.length && <section aria-label="传本与勘误" className="space-y-1 border-t border-slate-800 pt-2">
      <h6 className="font-semibold text-amber-100">另附传本与勘误</h6>
      <p className="text-slate-400">此处列各家传本；原始记录与勘误另卷可查。</p>
      <ul className="space-y-1">
        {proof.interpretations.map(({ id: interpretationId, tick, label, reading }) => <li key={interpretationId} className="[overflow-wrap:anywhere]">
          <span className="font-semibold text-slate-200">{label} · 回合 #{tick}：</span>{reading}
        </li>)}
      </ul>
    </section>}
  </div>;
}

function DigestScene({ entry, shown, toggle }: { entry: ChronicleDigestEntry; shown: boolean; toggle: () => void }) {
  const proofId = useId();
  return <li className="min-w-0 space-y-1.5 rounded border border-slate-800 bg-slate-900/55 p-2.5">
    <h5 className="font-serif text-sm font-semibold leading-snug text-amber-100 [overflow-wrap:anywhere]">{entry.title}</h5>
    {entry.paragraph && entry.paragraph !== entry.title && <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-slate-100 [overflow-wrap:anywhere]">{entry.paragraph}</p>}
    <p className="text-xs text-slate-400 [overflow-wrap:anywhere]">{entry.group}</p>
    <button type="button" className={`${control} text-left text-amber-100`} aria-expanded={shown}
      aria-controls={shown ? proofId : undefined} onClick={toggle}>{shown ? '收起此幕实录' : '查看此幕实录'}</button>
    {shown && <SourceProof entry={entry} id={proofId} />}
  </li>;
}

export function ChronicleDigestPage({ rows, page, selection, onPage, onProof }: {
  rows: readonly ChronicleDigestEntry[];
  page: number;
  selection?: ProofSelection;
  onPage: (page: number) => void;
  onProof: (selection: ProofSelection) => void;
}) {
  if (!rows.length) return <p className="text-xs text-slate-400">在此范围内，暂无可查的故事实录。</p>;
  const pages = Math.ceil(rows.length / CHRONICLE_DIGEST_PAGE_SIZE);
  const current = Math.max(0, Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0));
  return <>
    <ol aria-label="本页主题故事" className="space-y-2">
      {rows.slice(current * CHRONICLE_DIGEST_PAGE_SIZE, (current + 1) * CHRONICLE_DIGEST_PAGE_SIZE).map((entry) => (
        <DigestScene key={entry.id} entry={entry} shown={selection?.entryId === entry.id && selection.sourceId === entry.proof.sourceId}
          toggle={() => onProof({ entryId: entry.id, sourceId: entry.proof.sourceId })} />
      ))}
    </ol>
    {pages > 1 && <nav aria-label="主题故事分页" className="flex min-w-0 flex-wrap items-center gap-1.5">
      <button type="button" className={control} disabled={current === 0} onClick={() => onPage(current - 1)}>上一页</button>
      <span role="status" className="text-xs text-slate-300">第 {current + 1}/{pages} 页</span>
      <button type="button" className={control} disabled={current + 1 === pages} onClick={() => onPage(current + 1)}>下一页</button>
    </nav>}
  </>;
}

function OpenDigest({ world, viewerId }: { world: WorldState; viewerId: string }) {
  const [topic, setTopic] = useState<ChronicleDigestTopic>('chapters');
  const [range, setRange] = useState<ChronicleDigestWindow>('near');
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<ProofSelection>();
  const rows = useMemo(() => projectChronicleDigest(world, viewerId, topic, range), [world, viewerId, topic, range]);
  const selectPage = (next: number) => { setPage(next); setSelection(undefined); };
  return <div className="space-y-2 px-3 pb-3">
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1 text-xs text-slate-300">读什么
        <select className={control} value={topic} onChange={(event) => {
          const chosen = event.currentTarget.value;
          if (!Object.hasOwn(TOPICS, chosen)) return;
          setTopic(chosen as ChronicleDigestTopic); selectPage(0);
        }}>
          {(Object.keys(TOPICS) as ChronicleDigestTopic[]).map((key) => <option key={key} value={key}>{TOPICS[key]}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-300">查阅范围
        <select className={control} value={range} onChange={(event) => {
          const chosen = event.currentTarget.value;
          if (!Object.hasOwn(WINDOWS, chosen)) return;
          setRange(chosen as ChronicleDigestWindow); selectPage(0);
        }}>
          {(Object.keys(WINDOWS) as ChronicleDigestWindow[]).map((key) => <option key={key} value={key}>{WINDOWS[key]}</option>)}
        </select>
      </label>
    </div>
    <p className="text-xs leading-relaxed text-slate-400">只读所选修士在这份世界记录中可查的实录，不为缺失的故事补写情节。</p>
    <ChronicleDigestPage rows={rows} page={page} selection={selection} onPage={selectPage}
      onProof={(target) => setSelection((prior) => prior?.entryId === target.entryId && prior.sourceId === target.sourceId ? undefined : target)} />
  </div>;
}

function ScopedDigest({ world, viewerId }: { world: WorldState; viewerId?: string }) {
  const [open, setOpen] = useState(false);
  return <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/65"
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">按主题读故事</summary>
    {open && (viewerId ? <OpenDigest world={world} viewerId={viewerId} />
      : <p className="px-3 pb-3 text-xs text-slate-400">选中修士后，可按他所在的这一支世界查阅。</p>)}
  </details>;
}

export function ChronicleTopicDigest({ world, viewerId, scopeKey }: {
  world: WorldState; viewerId?: string; scopeKey?: string;
}) {
  return <ScopedDigest key={JSON.stringify([scopeKey, viewerId])} world={world} viewerId={viewerId} />;
}

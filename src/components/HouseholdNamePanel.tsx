import { useId, useState } from 'react';
import { lookupHouseholdNames, projectHouseholdNames } from '../engine/householdNameEngine';
import type { Cultivator, WorldState } from '../types/world';

type Lookup = ReturnType<typeof lookupHouseholdNames>;
type Match = Lookup['matches'][number];
const RESULT_PAGE_SIZE = 8;
const STATUS: Record<Match['status'], string> = {
  resident: '当地在籍居民',
  recruited: '已入门留档',
  deceased: '已故留档',
  visitor: '同名到访，身份未核并',
};
const control = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:opacity-40';

export function HouseholdNamePanel({ world, cultivator, settlementId }: { world: WorldState; cultivator?: Cultivator; settlementId: string }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer || !projectHouseholdNames(world, viewer, settlementId)) return null;
  return <HouseholdNameLookup key={`${viewer.id}:${settlementId}`} world={world} viewer={viewer} settlementId={settlementId} />;
}

function HouseholdNameLookup({ world, viewer, settlementId }: { world: WorldState; viewer: Cultivator; settlementId: string }) {
  const uid = useId();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<{ world: WorldState; result: Lookup }>();
  const query = input.trim();
  const result = submitted?.world === world ? submitted.result : undefined;
  return <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">家户称名与同名核验</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>只查本人当前在场的村镇。可核验姓名或已生效的称名；同名者按各自来历列册，亲缘另有记载。</p>
      <form aria-label="本人在场村镇的称名核验" className="grid min-w-0 gap-1.5 min-[380px]:grid-cols-[minmax(0,1fr)_auto] min-[380px]:items-end" onSubmit={(event) => {
        event.preventDefault();
        if (query) setSubmitted({ world, result: lookupHouseholdNames(world, viewer, settlementId, query) });
      }}>
        <label htmlFor={`${uid}-name`} className="grid min-w-0 gap-0.5">姓名或已核验称名
          <input id={`${uid}-name`} className={control} type="search" autoComplete="off" maxLength={80} value={input}
            onChange={(event) => { setInput(event.currentTarget.value); setSubmitted(undefined); }} />
        </label>
        <button type="submit" className={control} disabled={!query}>核验本地称名</button>
      </form>
      {result ? <HouseholdNameResults result={result} /> : submitted ? <p role="status" className="text-slate-400">
        观察时点已变化，请重新核验。
      </p> : <p className="text-slate-400">提交后才显示与姓名相符的本地记录。</p>}
    </div>
  </details>;
}

export function HouseholdNameResults({ result }: { result: Lookup }) {
  const { status, matches } = result;
  const [cursor, setCursor] = useState(0);
  const pages = Math.max(1, Math.ceil(matches.length / RESULT_PAGE_SIZE));
  const page = Math.min(cursor, pages - 1);
  const offset = page * RESULT_PAGE_SIZE;
  return <div className="min-w-0 space-y-1.5">
    <p role="status" className="font-medium text-emerald-100">{status === 'unique'
      ? '现有一条相符的本地记录。'
      : status === 'ambiguous' ? '有多条独立记录相符，同名身份尚未核并。' : '没有可确认的唯一身份；未核验者不合并。'}</p>
    {matches.length > 0 && <ol aria-label="相符的独立本地记录" className="max-h-48 space-y-1 overflow-y-auto">
      {matches.slice(offset, offset + RESULT_PAGE_SIZE).map((match, index) => <li key={match.id} className="min-w-0 break-words rounded border border-slate-800 p-2">
        <p className="font-semibold text-emerald-100">条目 {offset + index + 1} · {match.name} · {STATUS[match.status]}</p>
        {match.alias && <p>经核验称名：{match.alias}</p>}
        {match.present === true && match.status !== 'deceased' && <p>本次核验可证在本村。</p>}
        {match.status === 'recruited' && match.present !== true && <p>本条不证明现在的居处。</p>}
      </li>)}
    </ol>}
    {pages > 1 && <div aria-label="本地同名结果分页" className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={control} disabled={page === 0} onClick={() => setCursor(page - 1)}>上一页</button>
      <span>第 {page + 1}/{pages} 页 · 共 {matches.length} 条</span>
      <button type="button" className={control} disabled={page + 1 === pages} onClick={() => setCursor(page + 1)}>下一页</button>
    </div>}
  </div>;
}

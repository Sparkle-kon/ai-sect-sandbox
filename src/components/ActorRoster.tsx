import { useId, useState } from 'react';
import type { Cultivator, WorldState } from '../types/world';

export type RosterStatus = 'all' | 'living' | 'fallen';
export const ACTOR_PAGE_SIZE = 8;
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

export function getActorRosterPage(world: WorldState, search: string, status: RosterStatus, requestedPage: number) {
  const names = new Map(world.sects.map(({ id, name }) => [id, name]));
  const needle = normalize(search);
  const filtered = world.cultivators.filter((actor) => (status === 'all' || actor.alive === (status === 'living')) &&
    (!needle || normalize(`${actor.name} ${actor.title} ${names.get(actor.sectId) ?? '散修'} ${actor.realm}`).includes(needle)));
  const pages = Math.max(1, Math.ceil(filtered.length / ACTOR_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, requestedPage));
  return { actors: filtered.slice(page * ACTOR_PAGE_SIZE, (page + 1) * ACTOR_PAGE_SIZE), total: filtered.length, pages, page };
}

export function ActorRoster({ world, selected, onSelect }: { world: WorldState; selected?: Cultivator; onSelect: (id: string) => void }) {
  const uid = useId();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RosterStatus>('all');
  const [cursor, setCursor] = useState(0);
  const { actors, total, pages, page } = getActorRosterPage(world, search, status, cursor);
  const entry = 'min-h-11 rounded border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';
  return (
    <details className="min-w-0 rounded-lg border border-slate-800 bg-slate-900" aria-label="修士名册">
      <summary className="min-h-11 cursor-pointer p-3 text-sm font-semibold text-slate-100">修士名册 · {world.cultivators.length} 位</summary>
      <div className="space-y-2 border-t border-slate-800 p-2.5 sm:p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label htmlFor={`${uid}-search`} className="sr-only">搜索修士</label>
          <input id={`${uid}-search`} type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCursor(0); }}
            className={`${entry} min-w-0`} placeholder="姓名、宗门或境界" />
          <label htmlFor={`${uid}-status`} className="sr-only">生存状态</label>
          <select id={`${uid}-status`} className={entry} value={status} onChange={(event) => { setStatus(event.target.value as RosterStatus); setCursor(0); }}>
            <option value="all">全部</option><option value="living">在世</option><option value="fallen">陨落</option>
          </select>
        </div>
        <p className="text-xs text-slate-400" role="status">匹配 {total} 位{total > 0 ? ` · 第 ${page + 1}/${pages} 页` : ''}</p>
        {actors.length > 0 && <ul className="grid grid-cols-2 gap-1.5">
          {actors.map((actor) => <li key={actor.id} className="min-w-0">
            <button type="button" aria-pressed={selected?.id === actor.id} onClick={() => onSelect(actor.id)}
              className={`${entry} w-full break-words py-1 text-left ${selected?.id === actor.id ? 'border-amber-500/60 text-amber-200' : ''}`}>
              {actor.name}<span className="block text-xs text-slate-400">{actor.alive ? `${actor.realm} ${actor.realmStage}层` : '已陨落'}</span>
            </button>
          </li>)}
        </ul>}
        {pages > 1 && <div className="grid grid-cols-2 gap-2" aria-label="名册分页">
          <button type="button" className={`${entry} disabled:opacity-40`} disabled={page === 0} onClick={() => setCursor(page - 1)}>上一页</button>
          <button type="button" className={`${entry} disabled:opacity-40`} disabled={page + 1 === pages} onClick={() => setCursor(page + 1)}>下一页</button>
        </div>}
      </div>
    </details>
  );
}

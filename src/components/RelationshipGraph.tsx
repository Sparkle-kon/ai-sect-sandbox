import { useId, useMemo, useState } from 'react';
import type { Cultivator, WorldState } from '../types/world';
import { buildRelationshipView, pageRelationshipRecords } from './relationshipView';
import type { RelationFilter, RelationPeer, RelationRecord } from './relationshipView';

interface RelationshipGraphProps {
  world: WorldState;
  selectedCultivatorId: string | null;
  onSelectCultivator: (id: string) => void;
}

const control = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';
const FILTERS: Record<RelationFilter, string> = { all: '全部方向', outbound: '向外', inbound: '指向本人', reciprocal: '互有记录' };
const DIRECTION: Record<RelationRecord['direction'], string> = { outbound: '本人 → 对方', inbound: '对方 → 本人', self: '指向本人自身', other: '有向记录' };
const tone = (affinity: number) => affinity >= 40 ? '#34d399' : affinity <= -40 ? '#fb7185' : '#fbbf24';
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

function Neighborhood({ selected, peers, peerCount, onSelect }: {
  selected: Cultivator; peers: readonly RelationPeer[]; peerCount: number; onSelect: (id: string) => void;
}) {
  const cx = 150, cy = 76;
  const locations = peers.map((peer, i) => {
    // Six fixed slots, chosen first from independent corners to avoid tangles on narrow screens.
    const [x, y] = [[56, 35], [244, 35], [56, 116], [244, 116], [150, 19], [150, 133]][i];
    return { peer, x, y };
  });
  return (
    <section className="space-y-1.5" aria-label="所选修士的直接关系图">
      <h4 className="break-words text-xs font-semibold text-amber-100">{selected.name}{selected.alive ? '' : '（已陨落）'} · 直接关系</h4>
      <p className="text-xs text-slate-400">图示 {peers.length}/{peerCount} 位直接相连的修士，按最强关系排列；完整有向记录见下方。</p>
      {locations.length > 0 && <>
        <svg viewBox="0 0 300 152" className="block max-h-48 w-full rounded bg-slate-950/70" aria-hidden="true">
          {locations.map(({ peer, x, y }, index) => (
            <g key={peer.actor.id} data-relationship-peer="true">
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={tone(peer.strongest)} strokeWidth="2"
                strokeDasharray={peer.outbound && peer.inbound ? undefined : '5 3'} opacity=".7" />
              <circle cx={x} cy={y} r="10" fill={peer.actor.alive ? tone(peer.strongest) : '#64748b'} stroke="#0f172a" strokeWidth="2" />
              <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">{index + 1}</text>
            </g>
          ))}
          <circle cx={cx} cy={cy} r="15" fill="#fbbf24" stroke="#0f172a" strokeWidth="2" />
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">本人</text>
        </svg>
        <ol className="grid grid-cols-2 gap-1.5" aria-label="关系图中的修士">
          {peers.map(({ actor, inbound, outbound }, index) => (
            <li key={actor.id} className="min-w-0">
              <button className={`${control} w-full break-words py-1 text-left`} type="button" onClick={() => onSelect(actor.id)}>
                {index + 1}. {actor.name}{!actor.alive && '（已陨落）'}
                <span className="block text-[11px] text-slate-400">{inbound && outbound ? '双向' : inbound ? '向本人' : '本人向外'} · 向外 {outbound}／指向本人 {inbound}</span>
              </button>
            </li>
          ))}
        </ol>
      </>}
    </section>
  );
}

export function RelationshipGraph({ world, selectedCultivatorId, onSelectCultivator }: RelationshipGraphProps) {
  const uid = useId();
  const overview = useMemo(() => buildRelationshipView(world, selectedCultivatorId), [world, selectedCultivatorId]);
  const [scope, setScope] = useState<'focus' | 'all'>('focus');
  const [filter, setFilter] = useState<RelationFilter>('all');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<{ actor: string | null; page: number }>({ actor: selectedCultivatorId, page: 0 });
  const setPage = (page: number) => setCursor({ actor: selectedCultivatorId, page });
  const all = scope === 'all' || !overview.selected;
  const { rows, page, pages, total } = pageRelationshipRecords(all ? overview.records : overview.direct, query, all ? 'all' : filter,
    cursor.actor === selectedCultivatorId ? cursor.page : 0);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3" aria-label="因果恩怨拓扑图">
      {overview.selected
        ? <Neighborhood selected={overview.selected} peers={overview.peers} peerCount={overview.peerCount} onSelect={onSelectCultivator} />
        : <p className="text-xs text-slate-400">未选中有效修士。可在下方逐页查看有向关系记录。</p>}
      <details className="min-w-0 rounded border border-slate-800 bg-slate-950/55">
        <summary className="min-h-11 cursor-pointer break-words px-2 py-2.5 text-xs font-semibold text-slate-100">完整关系账簿 · {all ? overview.records.length : overview.direct.length} 条</summary>
        <div className="space-y-2 px-2 pb-2">
          <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-xs text-slate-300" htmlFor={`${uid}-scope`}>查看范围
              <select id={`${uid}-scope`} className={control} value={all ? 'all' : 'focus'} onChange={(event) => {
                setScope(event.currentTarget.value === 'all' ? 'all' : 'focus'); setPage(0);
              }}>
                {overview.selected && <option value="focus">所选修士的直接关系</option>}
                <option value="all">全界有向记录（仅文字）</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-300" htmlFor={`${uid}-search`}>搜索关系
              <input id={`${uid}-search`} type="search" className={control} placeholder="双方姓名或关系类别" value={query} onChange={(event) => {
                setQuery(event.currentTarget.value); setPage(0);
              }} />
            </label>
            {!all && <label className="grid min-w-0 gap-1 text-xs text-slate-300" htmlFor={`${uid}-direction`}>关系方向
              <select id={`${uid}-direction`} className={control} value={filter} onChange={(event) => {
                const value = event.currentTarget.value;
                if (Object.hasOwn(FILTERS, value)) { setFilter(value as RelationFilter); setPage(0); }
              }}>
                {Object.entries(FILTERS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>}
          </div>
          <p role="status" className="text-xs text-slate-400">匹配 {total} 条{total > 0 ? ` · 第 ${page + 1}/${pages} 页` : ''}</p>
          {rows.length === 0 ? <p className="text-xs text-slate-400">暂无匹配的关系记录。</p> : (
            <ol aria-label="当前页有向关系记录" className="space-y-1.5">
              {rows.map(({ key, edge, from, to, reciprocal, direction }) => (
                <li key={key} data-relationship-record="true" className="min-w-0 space-y-1 rounded border border-slate-800 p-2 text-xs">
                  <p className="break-words font-semibold text-slate-100">{from?.name ?? '失载修士'}{from && !from.alive && '（已陨落）'} → {to?.name ?? '失载修士'}{to && !to.alive && '（已陨落）'}</p>
                  <p className="break-words text-slate-400">{edge.type} · 好感 {signed(edge.affinity)}{!all && ` · ${DIRECTION[direction]}`}{reciprocal && ' · 有反向记录'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {from && from.id !== overview.selected?.id && <button type="button" aria-label={`查看发起方 ${from.name}`}
                      className={control} onClick={() => onSelectCultivator(from.id)}>查看发起方</button>}
                    {to && to.id !== from?.id && to.id !== overview.selected?.id && <button type="button" aria-label={`查看指向方 ${to.name}`}
                      className={control} onClick={() => onSelectCultivator(to.id)}>查看指向方</button>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {pages > 1 && <div className="grid grid-cols-2 gap-1.5" aria-label="关系记录分页">
            <button type="button" className={`${control} disabled:opacity-40`} disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
            <button type="button" className={`${control} disabled:opacity-40`} disabled={page + 1 === pages} onClick={() => setPage(page + 1)}>下一页</button>
          </div>}
        </div>
      </details>
    </section>
  );
}

import { useMemo, useState } from 'react';
import { projectOwnRouteWarningHistory, projectRouteWarnings, type OwnRouteWarningHistory, type PublicRouteWarning } from '../engine/routeWarningEngine';
import { createRouteWarningDetourProjection, type RouteWarningDetour } from '../engine/routeWarningDetour';
import { currentVisibleTileIds } from '../engine/terrainEngine';
import { ROUTE_WARNING_KIND_LABEL } from './routeWarningMapDraw';
import type { Cultivator, WorldState } from '../types/world';

type LocalWarning = { notice: PublicRouteWarning; alternate?: Pick<RouteWarningDetour, 'steps'> };
const pageSize = 6;
const control = 'min-h-11 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const status: Record<OwnRouteWarningHistory['status'], string> = { active: '仍在告示期', expired: '已过期', retracted: '已由本人撤回' };

export function projectRouteWarningReading(world: WorldState, viewer?: Cultivator, observed?: ReadonlySet<string>) {
  if (!viewer || !world.cultivators.includes(viewer)) return { rows: [] as LocalWarning[], own: [] as OwnRouteWarningHistory[] };
  const current = currentVisibleTileIds(world, viewer);
  const visible = observed ? new Set([...current].filter((id) => observed.has(id))) : current;
  const local = projectRouteWarnings(world, viewer).filter(({ fromTileId, toTileId }) => visible.has(fromTileId) && visible.has(toTileId));
  const detour = local.length ? createRouteWarningDetourProjection(world, visible) : undefined;
  const rows = local.map((notice): LocalWarning => {
    const proof = detour?.({ fromTileId: notice.fromTileId, hazardTileId: notice.toTileId, exitTileId: notice.exitTileId });
    return { notice, ...(proof ? { alternate: { steps: proof.steps } } : {}) };
  });
  rows.sort((a, b) => b.notice.postedTick - a.notice.postedTick || a.notice.id.localeCompare(b.notice.id));
  const own = projectOwnRouteWarningHistory(world, viewer).filter(({ retractedTick, corroboratedTick }) =>
    (retractedTick === undefined || retractedTick <= world.tick) && (corroboratedTick === undefined || corroboratedTick <= world.tick));
  own.sort((a, b) => b.postedTick - a.postedTick || a.id.localeCompare(b.id));
  return { rows, own };
}

function pages(count: number, requested: number) {
  const total = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.max(0, Math.min(total - 1, requested));
  return { page, total, index: page * pageSize };
}

function PageControls({ page, total, onChange, label }: { page: number; total: number; onChange: (page: number) => void; label: string }) {
  if (total < 2) return null;
  return <div aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
    <button type="button" className={control} disabled={page === 0} onClick={() => onChange(page - 1)}>上一页</button>
    <span role="status">第 {page + 1}/{total} 页</span>
    <button type="button" className={control} disabled={page + 1 === total} onClick={() => onChange(page + 1)}>下一页</button>
  </div>;
}

function WarningReadout({ rows, own }: { rows: readonly LocalWarning[]; own: readonly OwnRouteWarningHistory[] }) {
  const [reportedPage, setReported] = useState(0);
  const [ownPage, setOwn] = useState(0);
  const reported = pages(rows.length, reportedPage);
  const history = pages(own.length, ownPage);
  return <section aria-label="驿路警示与旁证" className="min-w-0 space-y-2 border-t border-slate-800 pt-2">
    <h5 className="font-semibold text-amber-100">驿路警示与旁证</h5>
    <p className="text-slate-400">只列两个相邻地格都在当前视野内的有效告示。警示是当时的见闻，不是封路，也不改变普通路线。</p>
    {rows.length > 0 ? <ol aria-label="当前可见的有效警示" className="space-y-1.5">
      {rows.slice(reported.index, reported.index + pageSize).map(({ notice, alternate }, index) => (
        <li key={notice.id} className="min-w-0 space-y-1 rounded border border-amber-400/25 p-2 [overflow-wrap:anywhere]">
          <p className="font-semibold text-amber-100">第 {reported.index + index + 1} 则 · {ROUTE_WARNING_KIND_LABEL[notice.kind]} · 实测强度 {notice.intensity}</p>
          <p>亲历第 {notice.observedTick} 轮 · 第 {notice.postedTick} 轮张贴 · 第 {notice.expiresTick} 轮起失效。</p>
          <p className={notice.corroborated ? 'text-emerald-200' : 'text-slate-400'}>
            {notice.corroborated ? `已有另一支同行队伍独立旁证${notice.corroboratedTick === undefined ? '' : ` · 第 ${notice.corroboratedTick} 轮`}。` : '尚无另一支同行队伍的独立旁证。'}
          </p>
          <p>{alternate ? `当前视野内另证 ${alternate.steps} 步局部绕行。不改变普通路线，不保证下轮安全。`
            : '当前视野不足，绕行路待查。'}</p>
        </li>
      ))}
    </ol> : <p className="text-slate-400">此时没有可查的有效警示；这不表示道路安全。</p>}
    <PageControls page={reported.page} total={reported.total} onChange={setReported} label="公开警示分页" />
    {own.length > 0 && <div className="space-y-1.5 border-t border-slate-800 pt-2">
      <h6 className="font-semibold text-amber-100">本人张贴史</h6>
      <p className="text-slate-400">只记本人的张贴与失效情况；此处不显示旧警示位置。</p>
      <ol aria-label="本人张贴实录" className="space-y-1">
        {own.slice(history.index, history.index + pageSize).map((row) => <li key={row.id} className="min-w-0 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
          {status[row.status]} · 亲历第 {row.observedTick} 轮 · 张贴第 {row.postedTick} 轮 · 原定第 {row.expiresTick} 轮失效
          {row.retractedTick !== undefined && ` · 第 ${row.retractedTick} 轮撤回`}
          {row.corroboratedTick !== undefined && ` · 第 ${row.corroboratedTick} 轮有独立旁证`}
        </li>)}
      </ol>
      <PageControls page={history.page} total={history.total} onChange={setOwn} label="本人张贴分页" />
    </div>}
  </section>;
}

export function RouteWarningPanel({ world, viewer, observed }: { world: WorldState; viewer?: Cultivator; observed?: ReadonlySet<string> }) {
  const selected = world.cultivators.find(({ id }) => id === viewer?.id);
  const { rows, own } = useMemo(() => selected && world.routeWarnings.notices.length
    ? projectRouteWarningReading(world, selected, observed) : { rows: [], own: [] }, [world, selected, observed]);
  if (!rows.length && !own.length) return null;
  return <WarningReadout key={selected?.id} rows={rows} own={own} />;
}

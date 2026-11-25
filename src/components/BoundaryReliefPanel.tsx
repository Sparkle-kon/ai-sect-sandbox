import { getCurrentBoundaryCoverage, visibleBoundaryReliefs } from '../engine/boundaryReliefEngine';
import type { BoundaryCoverageKind, BoundaryRelief, Cultivator, WorldState } from '../types/world';

type BoundaryView = ReturnType<typeof visibleBoundaryReliefs>[number];
const STATUS: Record<BoundaryRelief['status'], string> = {
  offered: '换防邀约待同意',
  travelling: '接防者实际行进中，未交接',
  returning: '已走上回程',
  completed: '已到阵位并完成交接',
  declined: '邀约已拒绝',
  withdrawn: '换防已撤回',
  expired: '换防已到期',
  interrupted: '换防中断',
};
const REASON: Record<NonNullable<BoundaryRelief['closeReason']>, string> = {
  declined: '接防者未同意',
  withdrawn: '当事方退出',
  offer_expired: '回应期限已到',
  title_lost: '阵位的有效管辖已改变',
  conflicting_duty: '有不能并行的实际职责',
  actor_lost: '当事修士无法继续',
  route_blocked: '实际路线未能通过核验',
  late: '未能在期限内完成交接',
};
const COVERAGE: Record<BoundaryCoverageKind, string> = {
  incumbent: '现有守者实际在岗', gap: '实测空岗', relief: '已由接防者实际在岗', other: '另有守者实际在岗',
};

export function BoundaryReliefPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const selected = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!selected) return null;
  const rows = visibleBoundaryReliefs(world, selected).filter(({ offeredTick }) => offeredTick <= world.tick);
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  const live = getCurrentBoundaryCoverage(world, selected).flatMap((row) => {
    const name = sites.get(row.postSiteId);
    return name ? [{ ...row, name }] : [];
  });
  const currentNames = new Map(live.map(({ postSiteId, name }) => [postSiteId, name]));
  if (!rows.length && !live.length) return null;

  return <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">巡界阵位与换防交接</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>到阵位交接后才改记守者。行程中仍由在岗者值守。此页只读。</p>
      {live.length > 0 && <div className="space-y-1">
        <h4 className="font-semibold text-emerald-100">当前可观测阵位</h4>
        <ol className="max-h-40 space-y-1.5 overflow-y-auto" aria-label="阵位已核验覆盖">
          {live.map(({ postSiteId, name, tick, kind }) => <li key={postSiteId} className="min-w-0 break-words rounded border border-slate-800 p-2">
            {name} · Tick #{tick} · {COVERAGE[kind]}
          </li>)}
        </ol>
      </div>}
      {rows.length > 0 && <div className="space-y-1">
        <h4 className="font-semibold text-emerald-100">本人相关换防实录</h4>
        <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人可查的换防与阵位凭证">
          {rows.map((row) => <BoundaryReceipt key={row.id} row={row} tick={world.tick} actorId={selected.id}
            postName={currentNames.get(row.postSiteId)} />)}
        </ol>
      </div>}
    </div>
  </details>;
}

function BoundaryReceipt({ row, tick, actorId, postName }: { row: BoundaryView; tick: number; actorId: string; postName?: string }) {
  const actorRole = actorId === row.incumbentId ? '本人为原守者' : actorId === row.incomingId ? '本人为接防者' : '本人发出换防邀约';
  const accepted = row.acceptedTick !== undefined && row.acceptedTick <= tick;
  const closed = row.closedTick !== undefined && row.closedTick <= tick;
  const underway = row.status === 'travelling' || row.status === 'returning';
  const handoff = closed && accepted && row.status === 'completed';
  const status = closed || underway ? row.status : accepted ? 'travelling' : 'offered';
  const statusLabel = status === 'completed' && !handoff ? '未找到可核验的交接凭证' : STATUS[status];
  return <li className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2">
    <p className="font-semibold text-emerald-100">{actorRole} · {statusLabel}</p>
    <p>{postName ? `阵位：${postName}` : '该阵位当前未观测'} · 邀约 Tick #{row.offeredTick} · 应答截止 Tick #{row.offerExpiresTick} 前</p>
    {accepted && <p>实际同意 Tick #{row.acceptedTick}{row.deadlineTick !== undefined && ` · 交接期限 Tick #${row.deadlineTick} 前`}</p>}
    {accepted && (row.outboundSteps > 0 || row.returnSteps > 0) && <p>去程 {row.outboundSteps} 步 · 退回已走 {row.returnSteps} 步 · 累计实际负担 {row.strainSpent} 点灵气。</p>}
    {row.coverage && row.coverage.tick <= tick && <p>本案覆盖凭证 Tick #{row.coverage.tick} · {COVERAGE[row.coverage.kind]}（记录时点）。</p>}
    {row.firstGapTick !== undefined && row.firstGapTick <= tick && <p>首个已核验空岗 Tick #{row.firstGapTick}。</p>}
    {closed && <p>{handoff ? '实际交接' : '结案'} Tick #{row.closedTick}{row.closeReason && ` · ${REASON[row.closeReason]}`}。</p>}
  </li>;
}

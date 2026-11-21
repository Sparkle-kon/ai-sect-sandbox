import { SHORT_SHIFT_WAGE, visibleShortShifts } from '../engine/shortShiftEngine';
import type { Cultivator, ShortShift, WorldState } from '../types/world';

type ShiftView = ReturnType<typeof visibleShortShifts>[number];

export function ShortShiftPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer) return null;
  const rows = visibleShortShifts(world, viewer).filter(({ offeredTick, hostId, workerId }) => offeredTick <= world.tick &&
    (hostId === viewer.id || workerId === viewer.id));
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  if (rows.length === 0) return null;
  return <details className="min-w-0 rounded border border-teal-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-teal-100">跨宗短聘与双向退出</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>双方自愿，均可在到班前退出。短聘不改变宗属、品阶或永久通行权。本页只读。</p>
      <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人可查的短聘与结算凭证">
        {rows.map((row) => <ShiftReceipt key={row.id} row={row} tick={world.tick}
          hostView={row.hostId === viewer.id} site={sites.get(row.siteId)}
          other={names.get(row.hostId === viewer.id ? row.workerId : row.hostId)} />)}
      </ol>
    </div>
  </details>;
}

const STATUS: Record<ShortShift['status'], string> = {
  offered: '邀约待应答', active: '已同意，尚未实际到班', completed: '已实际到班并结算',
  declined: '已拒绝', withdrawn: '已退出', revoked: '现场资格已失效', expired: '已过期',
};
const REASON: Record<NonNullable<ShortShift['closeReason']>, string> = {
  declined: '受聘者未同意', host_withdrew: '出资者退出', worker_withdrew: '受聘者退出',
  access_revoked: '此地通行资格已失效', party_lost: '至少一方无法继续',
  offer_expired: '未在邀约期内回应', shift_missed: '未在约定回合实际到班',
};
const asPercent = (intensity: number) => String(Math.round(intensity * 1000) / 10);

function ShiftReceipt({ row, tick, hostView, site, other }: { row: ShiftView; tick: number; hostView: boolean; site?: string; other?: string }) {
  const accepted = row.acceptedTick !== undefined && row.acceptedTick <= tick;
  const closed = row.closedTick !== undefined && row.closedTick <= tick;
  const attendance = closed && row.status === 'completed' && row.attendance && row.attendance.tick <= tick && row.attendance.tick === row.shiftTick ? row.attendance : undefined;
  const status = closed ? row.status : accepted ? 'active' : 'offered';
  const statusLabel = status === 'completed' && !attendance ? '缺少可核验的到班实录' : STATUS[status];
  return <li className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2">
    <p className="font-semibold text-teal-100">{hostView ? '本人为出资者' : '本人为受聘者'} · 对方 {other ?? '姓名未详'} · {statusLabel}</p>
    <p>{site ?? '原地点名称已不可查'} · 临时观象站建于 Tick #{row.observatoryOpenedTick}</p>
    <p>邀约 Tick #{row.offeredTick} · 应答截止 Tick #{row.offerExpiresTick} 前 · 约定工钱 {SHORT_SHIFT_WAGE} 灵石</p>
    {accepted && <p>同意 Tick #{row.acceptedTick}{row.shiftTick !== undefined && ` · 约定到班 Tick #${row.shiftTick}（一班）`}</p>}
    <p>出资者个人当前托管 {row.escrowStones} 灵石{attendance && ` · 实际已付工钱 ${row.paidStones} 灵石`}</p>
    {attendance && <p>当班实测 Tick #{attendance.tick}：{attendance.reading.kind} · 强度 {asPercent(attendance.reading.intensity)}%（不是预测）。</p>}
    {closed && <p>结案 Tick #{row.closedTick}{row.closeReason && ` · ${REASON[row.closeReason]}`}
      {row.refundedStones > 0 && ` · 实际已退原出资者 ${row.refundedStones} 灵石`}。</p>}
  </li>;
}

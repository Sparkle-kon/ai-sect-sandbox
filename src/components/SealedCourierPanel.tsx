import { visibleCouriers } from '../engine/sealedCourierEngine';
import type { Cultivator, WorldState } from '../types/world';

type CourierRow = ReturnType<typeof visibleCouriers>[number];
const STATUS: Record<CourierRow['status'], string> = {
  offered: '待信使同意', in_transit: '携函途中', returning: '返程中，仍未退回', delivered: '已确认签收',
  returned: '已退回，收件人未签收', lost: '已失联，未确认签收', declined: '信使已拒绝', expired: '邀约已过期',
};
const ROLES: Record<CourierRow['role'], string> = { sender: '本人寄件', courier: '本人承运', recipient: '本人签收' };
const REASON: Record<NonNullable<CourierRow['reason']>, string> = {
  recipient_absent: '抵达时未遇到收件人', recipient_unavailable: '收件人无法签收', hazard: '途中遇灾',
  courier_death: '信使陨落', route_lost: '原有通路失效', deadline: '递送期满', declined: '未获承运同意', offer_expiry: '邀约未获及时回应',
};
const CUES = { request_audience: '请求会面', offer_relief: '表达赈济意愿' } as const;

export function SealedCourierPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const observer = world.cultivators.find(({ id }) => id === cultivator.id);
  const rows = visibleCouriers(world, observer).filter(({ openedTick, role, status, deliveredTick }) =>
    openedTick <= world.tick && (role !== 'recipient' || (status === 'delivered' && deliveredTick !== undefined && deliveredTick <= world.tick)))
    .sort((a, b) => (b.settledTick ?? b.openedTick) - (a.settledTick ?? a.openedTick));
  if (rows.length === 0) return null;
  return (
    <details className="min-w-0 rounded border border-sky-400/20 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-sky-100">密函递送与消息失联</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>只读的游戏内凭证。信使同意后才收一次承运费，退回或失联不追回已付承运费。签收只证明信息送达，不等于私人意愿已经兑现。</p>
        <ol aria-label="本角色可查的密函凭证" className="max-h-[28rem] space-y-2 overflow-y-auto">
          {rows.map((row) => {
            const payload = row.role !== 'courier' ? row.payload : undefined;
            const pending = row.status === 'offered' && world.tick < row.offerExpiresTick;
            const label = !pending && row.status === 'offered' ? STATUS.expired : STATUS[row.status];
            return (
              <li key={row.id} className="min-w-0 space-y-1 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-sky-100">{ROLES[row.role]} · {label}</h5>
                {row.role !== 'courier' && row.senderName && <p>寄件人：{row.senderName}</p>}
                {row.recipientName && row.role === 'sender' && <p>收件人：{row.recipientName}</p>}
                {row.role !== 'recipient' && (row.originName || row.destinationName) && (
                  <p>已知交接地点：{row.originName ?? '起点未详'} → {row.destinationName ?? '交付地未详'}</p>
                )}
                {row.role !== 'recipient' && (
                  <p>发出邀约 Tick #{row.openedTick}
                    {pending && ` · 应答截止 Tick #${row.offerExpiresTick}`}
                    {row.acceptedTick !== undefined && ` · 承运同意 Tick #${row.acceptedTick}`}
                    {row.deadlineTick !== undefined && ` · 递送截止 Tick #${row.deadlineTick}`}
                  </p>
                )}
                {row.status === 'delivered' && row.deliveredTick !== undefined && <p className="text-emerald-200">明确签收 Tick #{row.deliveredTick}</p>}
                {row.settledTick !== undefined && row.status !== 'delivered' && <p>结案 Tick #{row.settledTick}</p>}
                {row.reason && <p>记录原因：{REASON[row.reason]}</p>}
                {row.role !== 'recipient' && <p>{row.feePaid > 0 ? `承运费已实付 ${row.feePaid} 灵石` : '未实付承运费'}</p>}
                {row.role === 'courier' ? <p className="text-slate-400">密封承运；不可查看载荷。</p> : payload && (
                  <div className="space-y-0.5 border-t border-slate-800 pt-1.5">
                    {payload.kind === 'private_cue' ? <p>私人提示：{CUES[payload.cue]}（意愿信号，不是已完成的行动）。</p>
                      : <p>公开赈济凭证：实记灵石 {payload.stones}、翡翠灵叶 {payload.herbs} 株。</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}

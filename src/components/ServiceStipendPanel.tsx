import { projectSectStipends, SECT_STIPEND_AMOUNT, SECT_STIPEND_PERIODS } from '../engine/sectStipendEngine';
import type { Cultivator, SectStipend, SectStipendPeriod, WorldState } from '../types/world';

const STATUS: Record<SectStipend['status'], string> = {
  offered: '已发邀约，尚未同意', active: '本人已同意，按期核验', completed: '本约各期已结算',
  closed: '本约已终止', declined: '本人谢绝', withdrawn: '本人撤回', expired: '邀约已到期',
};
const CLOSURE: Record<NonNullable<SectStipend['closure']>, string> = {
  recipient_died: '受俸人已故，不再新列应付或转付遗产', returned_to_service: '受俸人已复出', affiliation_changed: '受俸人的宗门归属已改变',
};
const UNPAID: Record<NonNullable<SectStipendPeriod['reason']>, string> = {
  treasury_short: '宗库可动用款额不足', authority_absent: '没有已承接本约并在场的兑付方',
  recipient_absent: '受俸人不在场', title_unavailable: '本约所属宗门场地不可用',
  recipient_capacity: '受俸人当前无法收取此笔灵石',
};

export function ServiceStipendPanel({ world, cultivator }: {
  world: WorldState; cultivator: Cultivator;
}) {
  const rows = projectSectStipends(world, cultivator);
  if (!rows.length) return null;
  return <details className="min-w-0 rounded border border-amber-400/25 bg-slate-950/55">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-100">退居俸养</summary>
    <div className="min-w-0 space-y-2 break-words px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>俸养须另行同意，不随职衔发放。每约最多 {SECT_STIPEND_PERIODS} 期，每期约定 {SECT_STIPEND_AMOUNT} 灵石；未付不滚成欠款。</p>
      <ol aria-label="本人可查的俸养实录" className="max-h-72 space-y-2 overflow-y-auto">
        {rows.map((row) => <li key={row.id} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
          <p className="font-semibold text-amber-100">{row.role === 'recipient' ? '本人所受邀约' : '本人可查的兑付记录'} · {STATUS[row.status]}</p>
          <p>第 {row.earnedServiceTick} 轮有实际值守诊治凭据，第 {row.retiredTick} 轮自愿退居。</p>
          <p>第 {row.offeredTick} 轮提出
            {row.status === 'offered' && ` · 第 ${row.expiresTick} 轮起失效；尚未形成兑付约定，也未付款`}
            {row.acceptedTick !== undefined && ` · 第 ${row.acceptedTick} 轮受俸人同意`}。</p>
          {row.closedTick !== undefined && <p>第 {row.closedTick} 轮结案{row.closure && `：${CLOSURE[row.closure]}`}。</p>}
          {row.acceptedTick !== undefined && <p className="text-slate-400">宗门换任不自动交接此约，继任者须另行承接。</p>}
          {row.handoffs.length > 0 && <ul aria-label="已实际承接的俸养交接" className="space-y-1 border-t border-slate-800 pt-1">
            {row.handoffs.map(({ successionTick, adoptedTick }, index) =>
              <li key={index}>第 {successionTick} 轮换任 · 继任者于第 {adoptedTick} 轮正式承接本约。</li>)}
          </ul>}
          {row.periods.length > 0 && <ol aria-label="各期实际兑付" className="space-y-1 border-t border-slate-800 pt-1">
            {row.periods.map((period) => <li key={period.dueTick} className="rounded bg-slate-900/70 p-1.5">
              <p>第 {period.dueTick} 轮应付 {period.dueAmount} 灵石 · 第 {period.settledTick} 轮核结。</p>
              <p className={period.status === 'paid' ? 'text-emerald-200' : 'text-amber-200'}>
                {period.status === 'paid' ? `已实付 ${period.paidAmount} 灵石`
                  : `未付 ${period.paidAmount} 灵石${period.reason ? `：${UNPAID[period.reason]}` : ''}`}。
              </p>
            </li>)}
          </ol>}
        </li>)}
      </ol>
    </div>
  </details>;
}

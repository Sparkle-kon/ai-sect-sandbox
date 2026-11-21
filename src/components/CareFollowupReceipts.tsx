import type { projectCareFollowups } from '../engine/careFollowupEngine';
import type { CareFollowup, CareFollowupClosure } from '../types/world';

type Appointment = ReturnType<typeof projectCareFollowups>[number];
const STATUS: Record<CareFollowup['status'], string> = {
  scheduled: '已约日期，尚未施治', attended: '本人同意到场，已实际接受复诊', closed: '复诊结束，未施治', withdrawn: '本人已取消，未施治',
};
const CLOSURE: Record<CareFollowupClosure, string> = {
  patient_absent: '受诊者未能到场', patient_ineligible: '已不具复诊资格或原诊台不可用',
  no_need: '已无需复诊', staff_unavailable: '没有可接手的独立值守',
  supplies_unavailable: '实际可用耗材不足', bed_unavailable: '诊台无剩余床位', not_confirmed: '未取得本人确认',
};

export function CareFollowupReceipts({ appointments, tick }: {
  appointments: readonly Appointment[]; tick: number;
}) {
  if (!appointments.length) return null;
  return <section aria-label="静养复诊与到场接力" className="min-w-0 space-y-1.5 break-words border-t border-slate-800 pt-2">
    <h5 className="font-semibold text-teal-100">静养复诊与到场接力</h5>
    <p>前诊已结，复诊另约。须再次核对本人所需、在场值守和实际耗材；不改写前诊。</p>
    <ol className="max-h-72 space-y-1.5 overflow-y-auto">
      {appointments.map((row) => <li key={row.id} className="min-w-0 space-y-1 rounded border border-slate-800 bg-slate-900/65 p-2">
        <p className="font-semibold text-teal-100">{row.role === 'patient' ? '本人复诊' : '本人值守接力'} ·
          {row.role === 'attending_guard' && row.status === 'attended' ? '已实际接手并施治' : STATUS[row.status]}</p>
        <p>第 {row.dischargedTick} 轮前诊已结 · 第 {row.scheduledTick} 轮另约 · 约第 {row.dueTick} 轮到场。
          {row.expiresTick > row.dueTick + 1
            ? `最迟第 ${row.expiresTick - 1} 轮可现场核验，第 ${row.expiresTick} 轮起不可再复诊。`
            : `第 ${row.expiresTick} 轮起不可再复诊。`}</p>
        {row.status === 'scheduled' && !row.receipt && <>
          <p>{tick < row.dueTick ? '尚待约定轮。' : tick === row.dueTick ? '已到约定轮，仍须现场确认。'
            : tick < row.expiresTick ? '原定轮未施治，仍在宽限内，不能视作已到场。' : '预约窗口已过，未见施治凭据。'}</p>
          <p className="text-slate-400">未施治，未扣公库、药材或个人费用。</p>
        </>}
        {(row.status === 'closed' || row.status === 'withdrawn') && !row.receipt && <>
          {row.settledTick !== undefined && <p>第 {row.settledTick} 轮结案{row.closure && `：${CLOSURE[row.closure]}`}。</p>}
          <p className="text-slate-400">未施治，未扣公库、药材或个人费用。</p>
        </>}
        {row.status === 'attended' && row.receipt && <div className="space-y-1 rounded bg-slate-950/75 p-1.5 text-emerald-200">
          <p>第 {row.receipt.tick} 轮实际到场，{row.role === 'patient' ? '由另一位在场值守接手' : '本人替前诊值守接力'}。</p>
          <p>实际耗用宗库 {row.receipt.stonesSpent} 灵石、院中翡翠灵叶 {row.receipt.herbsSpent} 株；
            气血 +{row.receipt.hpRestored} · 丹毒 −{row.receipt.toxicityRemoved}。未向个人收费。</p>
        </div>}
      </li>)}
    </ol>
  </section>;
}

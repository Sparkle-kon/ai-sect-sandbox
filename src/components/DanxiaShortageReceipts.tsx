import type { projectDanxiaShortages } from '../engine/danxiaShortageEngine';

type Receipt = ReturnType<typeof projectDanxiaShortages>[number];
const closure: Record<NonNullable<Receipt['resolution']>['reason'],string> = {
  adequate_stock: '已备足药料，短缺结束。',
  commitment_ended: '所据的救治约定已结束，不能据此认定药已备齐。',
  authority_lost: '原址不再具备核对资格，不能据此认定药已备齐。',
};

export function DanxiaShortageReceipts({rows}: {rows: readonly Receipt[]}) {
  if (!rows.length) return null;
  return (
    <section aria-label="丹荒之年 · 灵叶短缺实录" className="space-y-1.5 border-t border-slate-800 pt-2">
      <h5 className="text-xs font-semibold text-teal-100">丹荒之年 · 灵叶短缺实录</h5>
      <ul className="space-y-1.5 text-xs leading-relaxed text-slate-300">
        {rows.map((row) => <li key={row.id} className="min-w-0 space-y-0.5 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
          <p className="font-medium text-slate-100">
            {row.siteName} · 丹霞弟子 {row.discipleName} · 求药人 {row.patientName}{row.settlementName ? `（坊籍留据：${row.settlementName} · ${row.householdBranch==='first'?'家户甲':'家户乙'}）` : ''}
          </p>
          <p>立册第 {row.openedTick} 轮：本地已登记的待履照护共需翡翠灵叶 {row.requiredLeaves} 株，当时实有 {row.availableLeaves} 株。</p>
          {row.status === 'open' && <p className="text-amber-200">短缺记录仍待结案；开立数字不是当前库存。</p>}
          {row.status === 'closed' && (row.resolution ? <>
            <p>结案第 {row.resolution.tick} 轮：需 {row.resolution.requiredLeaves} 株，实有 {row.resolution.availableLeaves} 株。{closure[row.resolution.reason]}</p>
          </> : <p>这条短缺记录已结，但没有可查的结案明细。</p>)}
        </li>)}
      </ul>
      <p className="text-slate-400">这是备药实录，不是已用药、痊愈或必须送药的凭据。</p>
    </section>
  );
}

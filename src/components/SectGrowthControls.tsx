import type {projectSectGrowth} from '../engine/sectGrowth';
import type {SectFailureReason,SectGrowthCommand} from '../types/sectGrowth';

export type SectGrowthView=NonNullable<ReturnType<typeof projectSectGrowth>>;
const smallButton='min-h-11 rounded-md border border-amber-300/40 px-2.5 text-sm text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50';

export function SectTreasurySummary({view}:{view:SectGrowthView}){
  const debt=view.debt;
  return <div aria-label="宗门钱账" className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-amber-100">
    <span className="font-semibold">{view.rating}</span><span>灵石 {view.treasury} 枚</span>
    <span className={debt?.overdueMonths?'text-rose-200':undefined}>{debt
      ?`欠 ${debt.creditorName} ${debt.principal} 枚 · ${debt.monthsRemaining>0?`余 ${debt.monthsRemaining} 月`:debt.overdueMonths>0?`逾期 ${debt.overdueMonths} 月`:'本月到期'}`
      :'暂无欠款'}</span>
  </div>;
}

export function SectGrowthNotices({view,tick,busy,command}:{
  view:SectGrowthView;tick:number;busy:boolean;command?:(command:SectGrowthCommand)=>void;
}){
  const {debt,review}=view;
  const until=Math.max(0,view.nextReviewTick-tick);
  return <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
    aria-label="山门近况">
    <p aria-label="仙盟考核">
      {review?<>仙盟年考：{review.year} 年 · {review.previousRating===review.rating?review.rating:`${review.previousRating} → ${review.rating}`}
        {review.stipend>0&&` · 补助 ${review.stipend} 枚灵石`}；下回约余 {until} 月。</>:
        <>距首次仙盟年考约 {until} 月 · 本门弟子 {view.livingDisciples} 人</>}
    </p>
    {debt&&<div className="flex flex-wrap items-center gap-2">
      {debt.notice&&debt.monthsRemaining<=2&&<p className="text-amber-200">{debt.notice}</p>}
      {command&&debt.canRepay&&<button type="button" className={smallButton} disabled={busy}
        onClick={()=>command({kind:'repay',amount:debt.maxPayment})}>{debt.maxPayment>=debt.principal?'还清':'偿还'} {debt.maxPayment} 枚灵石</button>}
    </div>}
  </section>;
}

export function SectBuildingUpgrades({view,busy,command}:{view:SectGrowthView;busy:boolean;command?:(command:SectGrowthCommand)=>void}){
  return <details className="mt-2 rounded-md border border-amber-300/25 bg-slate-950/80">
    <summary className="min-h-11 cursor-pointer content-center px-2.5 text-sm text-amber-100 focus-visible:outline focus-visible:outline-amber-300">山门营造</summary>
    {command&&<p className="px-2.5 pb-1 text-xs text-slate-300">营造或还款后，未交的差事单须重新安排。</p>}
    <ul className="space-y-1 px-2.5 pb-2" aria-label="宗门建筑">
      {view.buildings.map(entry=><li key={entry.id} className="flex min-w-0 flex-wrap items-center justify-between gap-1 rounded-md bg-slate-900/70 px-2 py-1.5">
        <p className="min-w-0 text-sm text-amber-100">{entry.name} <span className="text-xs text-slate-300">{entry.level?`${entry.level} 级`:'未建'}</span></p>
        {entry.cost===undefined?<span className="text-xs text-slate-300">{entry.level>=entry.maxLevel?'已到顶':'暂不动工'}</span>:
          command?<button type="button" className={smallButton} aria-label={`${entry.level?'升级':'修建'}${entry.name}，用 ${entry.cost} 枚灵石`}
            disabled={busy||!entry.canUpgrade} onClick={()=>command({kind:'upgrade',building:entry.id})}>
            {entry.level?'升级':'修建'} · {entry.cost} 枚{!entry.canUpgrade&&!view.failure&&(view.treasury<entry.cost?' · 灵石不足':' · 暂不可办')}
          </button>:<span className="text-xs text-slate-300">下阶需 {entry.cost} 枚</span>}
      </li>)}
    </ul>
  </details>;
}
const failureCopy:Readonly<Record<SectFailureReason,string>>={
  bankruptcy:'逾期欠款还没还清，宗门的家底连续三个月填不上这笔窟窿。',
  disciples_gone:'门中已没有弟子，晨会无人可点名。',
  leader_lost:'掌门已经不在，眼下无人继任开晨会。',
};
export function SectFailurePanel({view,busy,onRestart}:{view:SectGrowthView;busy:boolean;onRestart?:()=>void}){
  if(!view.failure)return null;
  return <section data-sect-failure="" className="rounded-xl border border-rose-300/35 bg-slate-950 p-3 text-slate-200"
    aria-label="宗门终局">
    <h2 className="font-serif text-lg text-rose-100">这一回，山门歇了</h2>
    <p className="my-2 text-sm">{failureCopy[view.failure.reason]}</p>
    <p className="mb-2 text-xs">这份旧进度还在，可以从「更多」进去存档。</p>
    {onRestart&&<button type="button" className={smallButton} disabled={busy} onClick={onRestart}>东山再起</button>}
  </section>;
}

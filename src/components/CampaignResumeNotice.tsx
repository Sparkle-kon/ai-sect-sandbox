interface CampaignCalendarDate { year: number; month: number }
export interface CampaignResumeReceipt {
  source: CampaignCalendarDate;
  target: CampaignCalendarDate;
  /** Most recent checkpoint that passed verification and was saved successfully. */
  verified?: CampaignCalendarDate;
  completedMonths: number;
  requestedMonths: number;
}
export interface CampaignResumeNoticeProps {
  receipt: CampaignResumeReceipt;
  scope: 'same_source' | 'different_context';
  confirmingRestore?: boolean;
  confirmedResult?: boolean;
  restoringOnlyOriginal?:boolean;
  onReviewOriginal?:()=>void;
  disabled?: boolean;
  onResume: () => void;
  onReviewRestore: () => void;
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
  onDiscard: () => void;
}
const renderDate = ({ year, month }: CampaignCalendarDate) => `仙历 ${year} 年 ${month} 月`;
const action = 'min-h-11 min-w-0 max-w-full rounded border border-violet-500/40 bg-violet-950/40 px-2 py-1.5 text-left text-xs text-violet-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50';

export function CampaignResumeNotice({
  receipt, scope, confirmingRestore = false, confirmedResult = false, restoringOnlyOriginal = false, onReviewOriginal, disabled = false,
  onResume, onReviewRestore, onConfirmRestore, onCancelRestore, onDiscard,
}: CampaignResumeNoticeProps) {
  const restoringDifferentWorld = confirmingRestore && (scope === 'different_context' || restoringOnlyOriginal);
  return (
    <section aria-label="待续的逐月推演" className="min-w-0 space-y-1.5 rounded border border-violet-500/25 p-2 text-xs leading-relaxed text-slate-300">
      <h4 className="font-semibold text-violet-100">待续的逐月推演</h4>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div><dt className="text-slate-400">源线日期</dt><dd>{renderDate(receipt.source)}</dd></div>
        <div><dt className="text-slate-400">目标日期</dt><dd>{renderDate(receipt.target)}</dd></div>
        <div><dt className="text-slate-400">最近已核验并保存</dt><dd>{receipt.verified ? renderDate(receipt.verified) : '尚无已保存检查点'}</dd></div>
        <div><dt className="text-slate-400">已保存的进度</dt><dd>{receipt.completedMonths} / {receipt.requestedMonths} 个月</dd></div>
      </dl>
      <progress className="h-2 w-full accent-violet-400" aria-label="本机已保存的推演进度"
        value={receipt.completedMonths} max={receipt.requestedMonths} />
      {scope === 'same_source' && !restoringDifferentWorld ? (
        <button type="button" className={action} disabled={disabled} onClick={onResume}>{receipt.verified ? '从已保存进度继续推演' : '从源线继续推演'}</button>
      ) : restoringDifferentWorld ? (
        <div aria-label="确认恢复原时间线" className="space-y-1 rounded border border-amber-400/35 bg-amber-950/40 p-2 text-amber-100">
          <p>恢复会切回原来的时间线及保留的全部分支，{restoringOnlyOriginal?'不会继续候选。':'再继续推演。'}当前未保存的世界进度将被替换；本机普通存档槽不改动。</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={action} disabled={disabled} onClick={onConfirmRestore}>确认恢复源线和完整原分支</button>
            <button type="button" className={action} disabled={disabled} onClick={onCancelRestore}>不恢复，返回核对</button>
          </div>
        </div>
      ) : (
        <>
          <p>{confirmedResult?'这个结果此前已明确确认，可重新打开当时的分支。':'当前世界不是这次推演的源线，不能直接接续。'}</p>
          <button type="button" className={action} disabled={disabled} onClick={onReviewRestore}>恢复源线和完整原分支</button>
        </>
      )}
      {!restoringDifferentWorld && <div className="space-y-1">
        {onReviewOriginal && <button type="button" className={action} disabled={disabled} onClick={onReviewOriginal}>只打开原时间线</button>}
        <button type="button" className={action} disabled={disabled} onClick={onDiscard}>丢弃待续推演</button>
        <p className="text-slate-400">只丢弃待续副本和它的检查点，不改当前运行世界或普通存档。</p>
      </div>}
    </section>
  );
}

import type { projectMentorTransfers } from '../engine/mentorTransferEngine';

type View = ReturnType<typeof projectMentorTransfers>;
type Transfer = View['transfers'][number];

const STATUS: Record<Transfer['status'], string> = {
  offered: '新约待应允',
  accepted: '已应新约，未成实授',
  declined: '新约已谢绝',
  expired: '新约未成',
  held: '实授已记',
};

const REASON: Record<NonNullable<Transfer['reason']>, string> = {
  offer_expired: '邀约到期，未获应允',
  absent_signature: '约定课期未齐实授与到场凭证',
  unavailable: '约定的授艺条件未能满足',
  no_budget: '约定课期的授艺次数已用尽',
};

export function MentorshipRenewalReceipts({ view, viewerId, nameByExactId }: { view: View; viewerId: string; nameByExactId?: (id:string)=>string|undefined }) {
  if (!view.releases.length && !view.transfers.length) return null;
  return (
    <details className="min-w-0 rounded border border-amber-500/25 bg-slate-950/50">
      <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">续结师承</summary>
      <div className="space-y-3 px-2 pb-2 text-xs leading-relaxed text-slate-300">
        <p>旧约结束不改已发生的授艺；新约仍续原功法，不另立谱系。授业时另记所教。</p>
        {view.releases.length > 0 && (
          <ol aria-label="本人旧约留档" className="max-h-48 space-y-1.5 overflow-y-auto">
            {view.releases.map((row) => (
              <li key={row.id} className="rounded bg-slate-900/80 p-2 [overflow-wrap:anywhere]">
                <p className="font-semibold text-slate-100">旧约已结 · {viewerId === row.oldMentorId ? '本人为原师' : '本人曾从师'}</p>
                <p>结缘 Tick #{row.formedTick} · 最近实授 Tick #{row.lastLessonTick} · 结束 Tick #{row.endedTick}</p>
                <p>{viewerId === row.endedById ? '本人提出结束旧约。' : '对方提出结束旧约。'}</p>
              </li>
            ))}
          </ol>
        )}
        {view.transfers.length > 0 && (
          <ol aria-label="本人续传邀约与实授凭证" className="max-h-56 space-y-1.5 overflow-y-auto">
            {view.transfers.map((row) => (
              <li key={row.id} className="rounded bg-slate-900/80 p-2 [overflow-wrap:anywhere]">
                <p className="font-semibold text-slate-100">{viewerId === row.newMentorId ? '本人为续授师' : '本人为续学人'} · {STATUS[row.status]}</p>
                {nameByExactId?.(viewerId === row.newMentorId ? row.studentId : row.newMentorId) && <p>
                  {viewerId === row.newMentorId ? '续学人' : '新授业师'}：{nameByExactId(viewerId === row.newMentorId ? row.studentId : row.newMentorId)}
                </p>}
                <p>发出邀约 Tick #{row.offeredTick} · 应允期限 Tick #{row.expiresTick}</p>
                {row.acceptTick !== undefined && <p>应允 Tick #{row.acceptTick}{row.periodTick !== undefined && <> · 约定课期 Tick #{row.periodTick}</>}</p>}
                {row.teachTick !== undefined && !row.lesson && <p>已有授艺登记，尚未记为实授。</p>}
                {row.attendTick !== undefined && !row.lesson && <p>已有到场登记，尚未记为实授。</p>}
                {row.lesson && (
                  <p className="text-amber-100">实授 Tick #{row.lesson.tick} · 熟练度 {row.lesson.masteryBefore} → {row.lesson.masteryAfter} · 实耗 {row.lesson.instructionSpent} 次授艺机会。</p>
                )}
                {row.closedTick !== undefined && <p>结记 Tick #{row.closedTick}{row.reason && <> · {REASON[row.reason]}</>}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

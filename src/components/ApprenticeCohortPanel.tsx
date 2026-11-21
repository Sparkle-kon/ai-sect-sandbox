import { COHORT_GRADUATION_MASTERY, COHORT_MAX_INVITEES, visibleApprenticeCohorts } from '../engine/apprenticeCohortEngine';
import type { ApprenticeCohort, ApprenticeCohortSeat, Cultivator, WorldState } from '../types/world';

const STATUS: Record<ApprenticeCohort['status'], string> = {
  offered: '课程安排中', held: '已实际开课', cancelled: '课程已取消', expired: '课程已过期',
};
const REASON: Record<NonNullable<ApprenticeCohort['reason']>, string> = {
  mentor_cancelled: '导师主动取消', mentor_unavailable: '导师已无法到课', no_confirmed_attendance: '无已核验的学徒到课',
  missed_lesson: '错过约定课期', no_budget: '当期讲授次数已用尽',
};
const SEAT: Record<ApprenticeCohortSeat['status'], string> = {
  invited: '邀约待应允', accepted: '已同意，未记实际到课', left: '已自愿退出', missed: '未到课', attended: '已实际到课',
};

export function ApprenticeCohortPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  if (!viewer) return null;
  const view = visibleApprenticeCohorts(world, viewer);
  const cohorts = view.cohorts.filter(({ openedTick }) => openedTick <= world.tick);
  const graduations = view.graduations.filter(({ tick }) => tick <= world.tick);
  if (!cohorts.length && !graduations.length) return null;
  return <details className="min-w-0 rounded border border-indigo-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-indigo-200">合班学徒与实绩出师</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p>每班至多 {COHORT_MAX_INVITEES} 席，只限本班，不限制世界人数。应允不等于到课，入席不等于出师；原师承另行留档。本页只读。</p>
      {cohorts.length > 0 && <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="本人可查的合班与到课凭证">
        {cohorts.map((row) => <CohortReceipt key={row.id} row={row} tick={world.tick} viewerId={viewer.id} />)}
      </ol>}
      {graduations.length > 0 && <section aria-label="独立实绩出师凭证" className="space-y-1.5 border-t border-slate-800 pt-2">
        <h4 className="font-semibold text-indigo-100">之后独立实绩出师</h4>
        <p>须在之后独立修行中确有进境，熟练度至少为 {COHORT_GRADUATION_MASTERY}；同一人于同一功法只记一次。</p>
        <ol className="max-h-44 space-y-1 overflow-y-auto">
          {graduations.map((award) => <li key={`${award.cohortId}:${award.studentId}:${award.tick}`} className="min-w-0 break-words rounded border border-slate-800 p-2">
            {award.studentId === viewer.id ? '本人' : '本班学徒'}实绩出师 Tick #{award.tick} · 功法熟练度 {award.masteryBefore} → {award.masteryAfter}。
          </li>)}
        </ol>
      </section>}
    </div>
  </details>;
}

function CohortReceipt({ row, tick, viewerId }: { row: ApprenticeCohort; tick: number; viewerId: string }) {
  const mentor = row.mentorId === viewerId;
  const closed = row.closedTick !== undefined && row.closedTick <= tick;
  const status = closed ? row.status : 'offered';
  const taught = row.instructionSpent === 1 && row.teachingTick !== undefined && row.teachingTick <= tick;
  const seats = mentor ? row.seats : row.seats.filter(({ studentId }) => studentId === viewerId);
  return <li className="min-w-0 space-y-0.5 break-words rounded border border-slate-800 p-2">
    <p className="font-semibold text-indigo-100">{mentor ? '本人任导师' : '本人受邀为学徒'} · {STATUS[status]}</p>
    <p>开班邀约 Tick #{row.openedTick} · 约定课期 Tick #{row.lessonTick}
      {mentor && ` · 本班已发 ${seats.length} 席邀约`}</p>
    {taught && <p>实授 Tick #{row.teachingTick} · 实耗 1 次讲授机会。</p>}
    {closed && <p>结课 Tick #{row.closedTick}{row.reason && ` · ${REASON[row.reason]}`}。</p>}
    <ol className="space-y-0.5" aria-label={mentor ? '导师可核对的合班席位' : '本人席位凭证'}>
      {seats.map((seat, index) => <SeatReceipt key={seat.studentId} seat={seat} label={mentor ? `席位 ${index + 1}` : '本人席位'} tick={tick} courseClosed={closed} />)}
    </ol>
  </li>;
}

function SeatReceipt({ seat, label, tick, courseClosed }: { seat: ApprenticeCohortSeat; label: string; tick: number; courseClosed: boolean }) {
  const accepted = seat.acceptedTick !== undefined && seat.acceptedTick <= tick;
  const attended = seat.attendedTick !== undefined && seat.attendedTick <= tick;
  const left = seat.leftTick !== undefined && seat.leftTick <= tick;
  const missed = courseClosed && seat.status === 'missed' && accepted && !attended;
  const status = left ? 'left' : attended ? 'attended' : missed ? 'missed' : accepted ? 'accepted' : 'invited';
  return <li className="space-y-0.5 rounded bg-slate-900/75 px-2 py-1">
    <p>{label} · {SEAT[status]}{accepted && ` · 应允 Tick #${seat.acceptedTick}`}</p>
    {seat.readyTick === tick && !attended && !left && <p>本回合已登记到课准备，尚无实授成绩。</p>}
    {attended && <p>实到 Tick #{seat.attendedTick}{seat.masteryGained !== undefined && ` · 功法熟练度实增 ${seat.masteryGained} 点`}。</p>}
    {left && <p>自愿退出 Tick #{seat.leftTick}{attended && '；已发生的到课实录仍保留'}。</p>}
  </li>;
}

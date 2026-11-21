import { projectPavilionLoans } from '../engine/pavilionLoanEngine';
import type { Cultivator, WorldState } from '../types/world';

type LendingView = ReturnType<typeof projectPavilionLoans>;
type Shelf = LendingView['shelves'][number];
type Loan = LendingView['ownLoans'][number];

const shelfStatus: Record<Shelf['phase'], string> = {
  shelved: '副本在架', held: '借阅占用', overdue: '逾期占用，仍未归还', unresolved: '借阅未结，未记归还',
};
const loanStatus: Record<Loan['status'], string> = {
  held: '本人借阅持有', overdue: '已逾期，仍处于借阅持有', unresolved: '借阅未结，未记实还', returned: '已实际归还',
};
const ending: Record<NonNullable<Loan['unresolvedReason']>, string> = {
  borrower_lost: '借者无法继续，未见实物归还。', title_closed: '原藏经阁的凭据已关闭，未见实物归还。',
};
const past = (tick: number | undefined, at: number): tick is number => tick !== undefined && tick <= at;

function ShelfCopies({ desk, shelves, tick }: {
  desk: NonNullable<LendingView['desk']>; shelves: readonly Shelf[]; tick: number;
}) {
  return <div className="min-w-0 space-y-1.5">
    <h5 className="font-semibold text-cyan-100">此地柜存与经办</h5>
    <p>{desk.staffed ? '本回合有经办人员；不保证仍有未用的受理名额。' : '本回合未见经办人员，不能据在架库存推定可办理借还。'}</p>
    <p>在架 {desk.availableCopies} 份 · 借阅占用 {desk.heldCopies} 份。</p>
    {shelves.length > 0 ? <ol aria-label="本地匿名藏经副本" className="max-h-44 space-y-1 overflow-y-auto">
      {shelves.map((copy) => <li key={copy.editionId} className="min-w-0 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
        <p>{copy.title} · {shelfStatus[copy.phase]}</p>
        <p className="text-slate-400">第 {copy.shelvedTick} 轮入架
          {past(copy.lastCheckoutTick, tick) && ` · 最近实借第 ${copy.lastCheckoutTick} 轮`}
          {past(copy.lastReturnedTick, tick) && ` · 最近实还第 ${copy.lastReturnedTick} 轮`}。</p>
      </li>)}
    </ol> : <p className="text-slate-400">没有可查的在册副本。</p>}
  </div>;
}

function LoanRecord({ loan, tick }: { loan: Loan; tick: number }) {
  const actuallyReturned = loan.status === 'returned' && past(loan.returnedTick, tick);
  const state = actuallyReturned ? (loan.returnedTick! >= loan.dueTick ? '已实际归还（逾期后）' : loanStatus.returned)
    : loan.status === 'returned' ? '未见此时点的实际归还' : loanStatus[loan.status];
  const read = loan.read && loan.read.tick <= tick ? loan.read : undefined;
  return <li className="min-w-0 space-y-1 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
    <p className="font-semibold text-cyan-100">{loan.title} · {state}</p>
    <p>实际借出第 {loan.checkoutTick} 轮 · 第 {loan.dueTick} 轮起算逾期。</p>
    {read ? <p>第 {read.tick} 轮实际研读 · 熟练度 +{read.masteryGained}。
      {read.credited ? '此部功法的一次性借阅研习已记录。' : '本次未获得新增研习收益。'}</p>
      : <p className="text-slate-400">没有实际研读凭据。</p>}
    {actuallyReturned && <p>第 {loan.returnedTick} 轮已在原柜实还。</p>}
    {loan.status === 'unresolved' && loan.unresolvedReason && <p className="text-amber-200">{ending[loan.unresolvedReason]}</p>}
  </li>;
}

export function ScriptureLendingReadout({ view, tick }: { view: LendingView; tick: number }) {
  const own = view.ownLoans.filter(({ checkoutTick }) => checkoutTick <= tick)
    .slice().sort((a, b) => b.checkoutTick - a.checkoutTick || a.id.localeCompare(b.id));
  const shelves = view.shelves.filter(({ shelvedTick }) => shelvedTick <= tick);
  if (!view.desk && own.length === 0) return null;
  return <details className="min-w-0 rounded border border-cyan-400/25 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-xs font-semibold text-cyan-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">藏经阁借阅</summary>
    <div className="min-w-0 space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p className="text-slate-400">借的是在册副本，不是另创版本或取得经书所有权。归还只认原藏经阁的实际经办凭据。</p>
      {view.desk && <ShelfCopies desk={view.desk} shelves={shelves} tick={tick} />}
      {own.length > 0 && <div className="space-y-1.5 border-t border-slate-800 pt-2">
        <h5 className="font-semibold text-cyan-100">本人借阅凭据</h5>
        <ol aria-label="本人借阅凭据明细" className="max-h-56 space-y-1.5 overflow-y-auto">
          {own.map((loan) => <LoanRecord key={loan.id} loan={loan} tick={tick} />)}
        </ol>
      </div>}
    </div>
  </details>;
}

export function ScriptureLendingPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const canonical = world.cultivators.find(({ id }) => id === cultivator.id);
  if (!canonical) return null;
  return <ScriptureLendingReadout view={projectPavilionLoans(world, canonical)} tick={world.tick} />;
}

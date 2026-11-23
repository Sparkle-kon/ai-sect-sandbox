import { useEffect, useId, useRef, useState } from 'react';
import type { CouncilPlan, CouncilRecord, WorldState } from '../types/world';
import { availableCouncilPlans } from '../engine/councilEngine';
import { COUNCIL_STATUS_LABELS } from './councilLabels';

const VOTE_LABELS: Record<CouncilRecord['ballots'][number]['vote'], string> = {
  support: '赞成', oppose: '反对', abstain: '弃权',
};
const SOURCE_LABELS: Record<CouncilRecord['ballots'][number]['source'], string> = {
  utility: '规则脑', llm: '模型',
};

interface SectCouncilModalProps {
  world: WorldState;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConvene: (plan: CouncilPlan) => void;
  notice?: string | null;
}

function councilOptionKey({ proposal }: CouncilPlan): string {
  switch (proposal.kind) {
    case 'war': return `war:${proposal.targetSectId}`;
    case 'expel': return `expel:${proposal.targetCultivatorId}`;
    case 'allocate_pill': return `allocate:${proposal.donorId}:${proposal.targetCultivatorId}`;
  }
}

function CouncilRecordDetails({ record, names }: { record: CouncilRecord; names: Map<string, string> }) {
  const named = (id: string) => names.get(id) ?? '修士未详';
  return (
    <details className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
      <summary className="cursor-pointer text-sm text-slate-100">
        {record.title} · {COUNCIL_STATUS_LABELS[record.status]} · Tick #{record.tick}
      </summary>
      <div className="mt-3 space-y-3 text-xs text-slate-300">
        <p>{record.summary}</p>
        {record.rounds.map((round) => (
          <section key={round.round} aria-label={`议事第 ${round.round} 轮`} className="space-y-1.5">
            <h4 className="font-medium text-amber-200">第 {round.round} 轮议事</h4>
            <ul className="space-y-1">
              {round.turns.map((turn, index) => (
                <li key={`${turn.voterId}-${index}`} className="rounded bg-slate-900/90 px-2 py-1 break-words">
                  <span className="font-medium text-slate-100">{named(turn.voterId)}</span>
                  <span className="mx-1 text-slate-400">· {SOURCE_LABELS[turn.source]} ·</span>{turn.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section aria-label="表决与结案" className="space-y-1.5 border-t border-slate-800 pt-2">
          <h4 className="font-medium text-amber-200">表决与结案</h4>
          <p>赞成 {record.tally.support} · 反对 {record.tally.oppose} · 弃权 {record.tally.abstain} · 通过需 {record.tally.required} 票</p>
          <ul className="space-y-1">
            {record.ballots.map((ballot) => (
              <li key={ballot.voterId} className="break-words">
                {named(ballot.voterId)} · {VOTE_LABELS[ballot.vote]} · {SOURCE_LABELS[ballot.source]}：{ballot.reason}
              </li>
            ))}
          </ul>
          <p className="rounded bg-slate-900/70 p-2 font-medium text-amber-100 break-words">结果：{record.outcome}</p>
        </section>
      </div>
    </details>
  );
}

export function SectCouncilModal({ world, open, busy, onClose, onConvene, notice }: SectCouncilModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const formHelpId = useId();
  const [requestedSectId, setRequestedSectId] = useState<string>();
  const [requestedPlanId, setRequestedPlanId] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;
  const plans = availableCouncilPlans(world);
  const requestedSect = world.sects.find(({ id }) => id === requestedSectId);
  const selectedSectId = requestedSect?.id ?? plans[0]?.sectId ?? world.sects[0]?.id ?? '';
  const options = plans.filter(({ sectId }) => sectId === selectedSectId);
  const plan = requestedPlanId === undefined ? options[0] : options.find((option) => councilOptionKey(option) === requestedPlanId);
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const history = [...(world.councils ?? [])].filter(({ sectId }) => sectId === selectedSectId)
    .sort((a, b) => b.tick - a.tick).slice(0, 8);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="xianxia-frame xianxia-dialog m-auto max-h-[85vh] w-[min(94vw,44rem)] overflow-y-auto rounded-2xl border border-violet-400/40 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-black/70"
    >
      <div className="space-y-4 p-4 sm:p-5">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-violet-100">宗门长老议事厅</h2>
            <p className="text-xs text-slate-400">先辩后议、表决定策。议程与结算均遵循当前世界规则。</p>
          </div>
          <button type="button" aria-label="关闭长老议事厅" onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200">关闭</button>
        </header>
        <form
          className="space-y-2"
          aria-busy={busy}
          aria-describedby={formHelpId}
          onSubmit={(event) => { event.preventDefault(); if (plan && !busy) onConvene(plan); }}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-300">
              召集宗门
              <select
                value={selectedSectId}
                disabled={busy || world.sects.length === 0}
                onChange={(event) => { setRequestedSectId(event.currentTarget.value); setRequestedPlanId(undefined); }}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
              >
                {world.sects.map((sect) => <option key={sect.id} value={sect.id}>{sect.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-300">
              议程
              <select
                value={plan ? councilOptionKey(plan) : ''}
                onChange={(event) => setRequestedPlanId(event.currentTarget.value || undefined)}
                disabled={busy || options.length === 0}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
              >
                {!plan && <option value="" disabled={options.length > 0}>{options.length === 0 ? '当前无可召开议案' : '原议案不可用，请重新选择'}</option>}
                {options.map((option) => <option key={option.id} value={councilOptionKey(option)}>{option.title}</option>)}
              </select>
            </label>
          </div>
          <p id={formHelpId} className="text-xs text-slate-400">
            {plan ? `${plan.summary} · 出席：${plan.voterIds.map((id) => names.get(id) ?? '修士未详').join('、')}`
              : options.length > 0 ? '世界状态已变化，原议案不再可用。' : '本宗当前没有可召开议案，可切换宗门查看。'}
          </p>
          <button type="submit" disabled={!plan || busy} className="rounded border border-violet-500/60 bg-violet-900/50 px-3 py-1.5 text-xs font-semibold text-violet-100 disabled:opacity-40">
            {busy ? '议事处理中…' : '召开并表决'}
          </button>
          {notice && <p role="status" className="text-xs text-amber-200 break-words">{notice}</p>}
        </form>
        <section aria-label="本宗议事纪要" className="space-y-2 border-t border-slate-800 pt-3">
          <h3 className="text-sm font-semibold text-slate-200">本宗议事纪要</h3>
          {history.length === 0 ? <p className="text-xs text-slate-400">尚无议事记录。</p> :
            history.map((record) => <CouncilRecordDetails key={record.id} record={record} names={names} />)}
        </section>
      </div>
    </dialog>
  );
}

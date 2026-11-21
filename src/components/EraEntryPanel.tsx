import { useId, useMemo, useRef, useState } from 'react';
import type { EraEntryCandidate, EraEntryDecision } from '../engine/eraEntryCandidates';

type EntrySite = { id: string; name: string };
export interface EraEntryPanelProps {
  date: { year: number; month: number; tick: number };
  scopeKey: string;
  /** Exact retained snapshot reference or equivalent revision; review expires when it changes. */
  snapshotKey?: object | string | number;
  sites: readonly EntrySite[];
  readCandidates: (siteId: string) => readonly EraEntryCandidate[];
  disabled?: boolean;
  canPossess?: boolean;
  historical?: boolean;
  notice?: string;
  onObserve: () => void;
  onFollow: (siteId: string, actorId: string) => void;
  onPossess: (siteId: string, actorId: string) => void;
}

const PAGE_SIZE = 8;
const reason: Record<Extract<EraEntryDecision,{kind:'observe_only'}>['reason'],string> = {
  contest:'正在参赛，本节点只可跟随见闻或旁观。',
  tribulation:'正在渡劫，本节点不能附身。',
  avatar_unavailable:'此刻不满足原生附身条件。',
  existing_order:'已有待执行指令，不能在此另行附身。',
  order_essence:'可用神念不足，不能在此附身并下达指令。',
};
const control = 'min-h-11 min-w-0 max-w-full rounded border border-violet-500/35 bg-slate-950 px-2 text-violet-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50';
const action = `${control} py-1.5 text-xs`;

export function EraEntryCandidateCard({ candidate }: { candidate: EraEntryCandidate }) {
  const origin = candidate.origin;
  return (
    <div role="group" aria-label="人物来历与当前选择" className="space-y-0.5 rounded border border-slate-800 p-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
      <p className="font-semibold text-violet-100">{candidate.name}</p>
      {origin.kind === 'founder'
        ? <p>创世在册 · 已可核对第 {origin.tick} 轮的创世凭据。</p>
        : <p>从凡人自愿入门 · 第 {origin.tick} 轮{origin.settlementName && ` · ${origin.settlementName}`}。</p>}
      {candidate.decision.kind === 'rest_or_cultivate'
        ? <p>若另行确认附身，可选择休养或修炼。此处尚未下达指令。</p>
        : <p className="text-amber-200">只可观察：{reason[candidate.decision.reason]}</p>}
    </div>
  );
}

export function EraEntryPossessionReview({ confirmationId, disabled, historical = true, onConfirm, onCancel }: {
  confirmationId?: string; disabled: boolean; historical?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <div id={confirmationId} role="group" aria-label="确认附身" className="space-y-1.5 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-100">
    <p>{historical ? '确认后将在所选年月另开入世分支，原分支和原年代都不改变。' : '在当前分支按实际资格附身，不另开分支。'}此操作不会推进回合，也不会自动选择休养或修炼。</p>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={action} disabled={disabled} onClick={onConfirm}>{historical ? '确认附身并进入新分支' : '确认在当前分支附身'}</button>
      <button type="button" className={action} onClick={onCancel}>取消附身核对</button>
    </div>
  </div>;
}

export function EraEntryPanel({scopeKey, ...props}: EraEntryPanelProps) {
  return <EntryPortal key={scopeKey} {...props} />;
}

function EntryPortal({ date, snapshotKey, sites, readCandidates, disabled = false, canPossess = true, historical = true, notice,
  onObserve, onFollow, onPossess }: Omit<EraEntryPanelProps,'scopeKey'>) {
  const [open,setOpen] = useState(false);
  const [siteId,setSiteId] = useState<string>();
  const [page,setPage] = useState(0);
  const [actorId,setActorId] = useState<string>();
  const [review,setReview] = useState<{siteId:string;actorId:string;snapshotKey?:EraEntryPanelProps['snapshotKey']}>();
  const reviewButton = useRef<HTMLButtonElement>(null);
  const confirmationId = useId();
  const siteMatches = sites.filter((site) => site.id === siteId);
  const site = siteMatches.length === 1 ? siteMatches[0] : undefined;
  const chosenSiteId = site?.id;
  const candidates = useMemo(() => open && chosenSiteId ? readCandidates(chosenSiteId) : [],
    [open, chosenSiteId, readCandidates, snapshotKey]);
  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const listed = candidates.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const actorMatches = listed.filter((candidate) => candidate.actorId === actorId);
  const chosen = actorMatches.length === 1 ? actorMatches[0] : undefined;
  const canReview = canPossess && chosen?.decision.kind === 'rest_or_cultivate';
  const checked = canReview && review && review.siteId === site?.id && review.actorId === chosen?.actorId && review.snapshotKey === snapshotKey;
  const selectPage = (next:number) => {setPage(next);setActorId(undefined);setReview(undefined);};
  const cancelReview = () => {setReview(undefined);reviewButton.current?.focus({preventScroll:true});};
  const sameNames = new Map<string,number>();
  for (const row of candidates) sameNames.set(row.name,(sameNames.get(row.name) ?? 0) + 1);

  return <details className="min-w-0 rounded border border-violet-400/30"
    onToggle={(event) => {setOpen(event.currentTarget.open);if (!event.currentTarget.open) setReview(undefined);}}>
    <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-violet-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">在此年代入世</summary>
    <div className="space-y-2 px-2 pb-2 text-xs leading-relaxed text-slate-300">
      <p>仙历 {date.year} 年 {date.month} 月 · 第 {date.tick} 轮</p>
      <button type="button" className={action} disabled={disabled} onClick={onObserve}>旁观此年代</button>
      <p>旁观或跟随都不会附身，也不会改变已保留的年月。</p>
      {notice && <p role="status" className="[overflow-wrap:anywhere]">{notice}</p>}
      {sites.length > 0 ? (
        <label className="grid min-w-0 gap-1">可观察的地点
          <select className={`${control} w-full text-base`} value={site ? String(sites.indexOf(site)) : ''} disabled={disabled}
            onChange={(event) => {
              const choice = sites.find((_,ordinal) => String(ordinal) === event.currentTarget.value);
              setSiteId(choice?.id);selectPage(0);
            }}>
            <option value="">请选择</option>
            {sites.map((row,ordinal) => <option key={row.id} value={ordinal}>{row.name}</option>)}
          </select>
        </label>
      ) : <p>此处没有当前可观察的地点，仍可选择旁观。</p>}
      {open && site && (listed.length ? <>
        <label className="grid min-w-0 gap-1">当地在世人物
          <select className={`${control} w-full text-base`} disabled={disabled}
            value={chosen ? String(listed.indexOf(chosen)) : ''} onChange={(event) => {
              const item = listed.find((_,ordinal) => String(ordinal) === event.currentTarget.value);
              setActorId(item?.actorId);setReview(undefined);
            }}>
            <option value="">请选择</option>
            {listed.map((row,ordinal) => <option key={row.actorId} value={ordinal}>
              {row.name}{(sameNames.get(row.name) ?? 0) > 1 && `（同名条目 ${pageIndex * PAGE_SIZE + ordinal + 1}）`}
            </option>)}
          </select>
        </label>
        {pageCount > 1 && <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={action} disabled={disabled || pageIndex === 0} onClick={() => selectPage(pageIndex-1)}>上一页人物</button>
          <span>第 {pageIndex+1} / {pageCount} 页</span>
          <button type="button" className={action} disabled={disabled || pageIndex+1 >= pageCount} onClick={() => selectPage(pageIndex+1)}>下一页人物</button>
        </div>}
      </> : <p>此地当前没有可核对来历的在世人物，仍可旁观。</p>)}
      {chosen && site && <>
        <EraEntryCandidateCard candidate={chosen} />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={action} disabled={disabled} onClick={() => onFollow(site.id,chosen.actorId)}>跟随此人</button>
          {canReview && <button type="button" className={action} ref={reviewButton}
            aria-expanded={!!checked} aria-controls={checked ? confirmationId : undefined} disabled={disabled}
            onClick={() => setReview(checked ? undefined : {siteId:site.id,actorId:chosen.actorId,snapshotKey})}>准备附身</button>}
        </div>
        {!canPossess && chosen.decision.kind === 'rest_or_cultivate' && <p>{historical ? '此时不能另开入世分支；仍可跟随见闻。' : '此时不能附身；仍可跟随见闻。'}</p>}
        {checked && <EraEntryPossessionReview confirmationId={confirmationId} disabled={disabled} historical={historical} onCancel={cancelReview}
          onConfirm={() => {if(!disabled){setReview(undefined);onPossess(site.id,chosen.actorId);}}} />}
      </>}
    </div>
  </details>;
}

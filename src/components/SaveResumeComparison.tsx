import type { SaveResumeAddress, SaveResumePairReview } from '../engine/storageEngine';
import { WORLDGEN_PROFILES } from '../engine/worldgenProfiles';

type Side = 'left' | 'right';
type Candidate = SaveResumePairReview['left'];
type Slot = { id: string; label: string };
const SIDE: Record<Side, string> = { left: '甲', right: '乙' };
const POINT: Record<SaveResumeAddress['point'], string> = { current: '当前版', previous: '恢复点' };
const RELATION: Record<SaveResumePairReview['relation'], string> = {
  same_branch: '已核验属于同一时间线的同一分支。',
  same_timeline_other_branch: '已核验同一时间线，但属于不同分支。',
  separate_timelines: '记录属于不同时间线；不能据此认定同源或同支。',
  same_generation_unverified_lineage: '种子与已知生成设定未见冲突；尚不足以确认完整来历或同一分支。',
  different_origins: '已核验的起点设定不同，不能作为同一来历。',
  unavailable: '此组没有足够证据核验沿革。',
};
const UNAVAILABLE: Record<Exclude<Candidate['status'], 'available'>, string> = {
  absent: '这里没有存档', damaged: '此版完整性校验失败', unsupported: '当前存档方式无法核对这一版',
};
const button = 'min-h-11 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-45';
const input = 'min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 text-base text-slate-100 disabled:opacity-45 sm:text-xs';

export interface SaveResumeComparisonProps {
  left?: Partial<SaveResumeAddress>;
  right?: Partial<SaveResumeAddress>;
  slots: readonly Slot[];
  review?: SaveResumePairReview;
  disabled?: boolean;
  readOnly?: boolean;
  onAddress: (side: Side, address: Partial<SaveResumeAddress>) => void;
  onReview: () => void;
  onChoose: (side: Side) => void;
}

const same = (a: Partial<SaveResumeAddress> | undefined, b: Partial<SaveResumeAddress> | undefined) =>
  a?.slotId === b?.slotId && a?.point === b?.point;
function complete(address?: Partial<SaveResumeAddress>): address is SaveResumeAddress {
  return !!address?.slotId && (address.point === 'current' || address.point === 'previous');
}

function Revision({ value }: { value: string }) {
  return <code title={value}><span aria-hidden="true">…{value.slice(-8)}</span><span className="sr-only">{value}</span></code>;
}

function AddressPicker({ side, address, slots, onAddress }: {
  side: Side; address?: Partial<SaveResumeAddress>; slots: readonly Slot[];
  onAddress: SaveResumeComparisonProps['onAddress'];
}) {
  const prefix = SIDE[side];
  return <div className="grid min-w-0 gap-1.5 rounded border border-slate-800 p-2">
    <label className="grid min-w-0 gap-1">{prefix} · 存档槽
      <select className={input} value={address?.slotId ?? ''} onChange={(event) => {
        const slotId = event.currentTarget.value;
        onAddress(side, slots.some(({ id }) => id === slotId) ? { slotId } : {});
      }}>
        <option value="">请选择存档槽</option>
        {slots.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
      </select>
    </label>
    <label className="grid min-w-0 gap-1">{prefix} · 版位
      <select className={input} value={address?.point ?? ''} disabled={!address?.slotId} onChange={(event) => {
        const point = event.currentTarget.value;
        onAddress(side, point === 'current' || point === 'previous' ? { slotId: address?.slotId, point } : { slotId: address?.slotId });
      }}>
        <option value="">请选择版位</option>
        <option value="current">{POINT.current}</option>
        <option value="previous">{POINT.previous}</option>
      </select>
    </label>
  </div>;
}

function CandidateCard({ candidate, side, slotLabel, readOnly, onChoose }: {
  candidate: Candidate; side: Side; slotLabel: string; readOnly?: boolean;
  onChoose: SaveResumeComparisonProps['onChoose'];
}) {
  const prefix = SIDE[side];
  const savedAt = candidate.status === 'available' ? new Date(candidate.info.summary.savedAt) : undefined;
  const timestamp = savedAt && Number.isFinite(savedAt.getTime()) ? savedAt.toISOString() : undefined;
  return <section aria-label={`${prefix}档核验结果`} className="min-w-0 space-y-1 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
    <h5 className="font-semibold text-sky-100">{prefix} · {slotLabel} · {POINT[candidate.address.point]}</h5>
    {candidate.status === 'available' ? <>
      <p className="text-emerald-200">此版已核验 · {candidate.info.summary.label}</p>
      <p>存档刻：Tick #{candidate.info.summary.tick} · 仙历 {candidate.info.summary.year} 年 {candidate.info.summary.month} 月。</p>
      {timestamp && <p>保存时间：<time dateTime={timestamp}>{timestamp}</time>（UTC）。</p>}
      <p>种子 {candidate.ancestry.seed} · 生成谱系 {candidate.ancestry.profileId
        ? WORLDGEN_PROFILES[candidate.ancestry.profileId].label : '未记录'} · 生成器 {candidate.ancestry.algorithm === undefined || candidate.ancestry.algorithm === null
        ? '未记录' : `v${candidate.ancestry.algorithm}`}
         · 出生 {candidate.ancestry.birthTick === undefined ? '未记录' : `Tick #${candidate.ancestry.birthTick}`}。</p>
      {candidate.ancestry.scenarioOrigin && <p>剧本来历：v{candidate.ancestry.scenarioOrigin.version} · 规则 v{candidate.ancestry.scenarioOrigin.ruleset} ·
        终轮 #{candidate.ancestry.scenarioOrigin.endTick} · <code>{candidate.ancestry.scenarioOrigin.id}</code>。</p>}
      {candidate.info.selection.sourceBranch ? <p>来源分支：
        {candidate.info.selection.sourceBranch.label && <>{candidate.info.selection.sourceBranch.label} · </>}
        <code>{candidate.info.selection.sourceBranch.branchId}</code>
        {candidate.info.selection.sourceBranch.timelineId && <> · 时间线 <code>{candidate.info.selection.sourceBranch.timelineId}</code></>}。</p>
        : <p>来源分支未记录，不可凭同名或同刻推断。</p>}
      <p className="text-slate-400">版次 <Revision value={candidate.info.selection.revision} />
        {candidate.info.selection.headRevision === candidate.info.selection.revision ? ' · 与核验时槽头相同'
          : candidate.info.selection.headRevision && <> · 核验时槽头 <Revision value={candidate.info.selection.headRevision} /></>}。</p>
      <button type="button" className={button} disabled={readOnly} onClick={() => onChoose(side)}>选择{prefix}档续局</button>
    </> : <p className="text-amber-200">{UNAVAILABLE[candidate.status]}。</p>}
  </section>;
}

export function SaveResumeComparison({ left, right, slots, review, disabled, readOnly, onAddress, onReview, onChoose }: SaveResumeComparisonProps) {
  const distinct = complete(left) && complete(right) && !same(left, right);
  const exact = distinct && review && same(left, review.left.address) && same(right, review.right.address) ? review : undefined;
  const slotName = (id: string) => slots.find((slot) => slot.id === id)?.label ?? '所选存档槽';
  return <details className="min-w-0 rounded border border-slate-800 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-sky-100">对照续局存档</summary>
    <fieldset disabled={disabled} className="min-w-0 space-y-2 break-words px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <legend className="sr-only">分别选定两份存档点</legend>
      <p>先分别选择甲乙两档的槽与版位。不凭名称、日期或进度自动推荐；对照不会载入存档。</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <AddressPicker side="left" address={left} slots={slots} onAddress={onAddress} />
        <AddressPicker side="right" address={right} slots={slots} onAddress={onAddress} />
      </div>
      {complete(left) && complete(right) && !distinct && <p className="text-amber-200">请选不同的存档点；同槽可选当前版和恢复点。</p>}
      <button type="button" className={button} disabled={!distinct} onClick={onReview}>核验并对照</button>
      {exact && <div aria-label="已核验的续局对照" className="space-y-2 border-t border-slate-800 pt-2">
        <p role="status" className="font-semibold text-sky-100">{RELATION[exact.relation]}</p>
        <p>复核后仍须明确选择一档，再确认替换当前世界；不会自动改读另一档。</p>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <CandidateCard side="left" candidate={exact.left} slotLabel={slotName(exact.left.address.slotId)} readOnly={readOnly} onChoose={onChoose} />
          <CandidateCard side="right" candidate={exact.right} slotLabel={slotName(exact.right.address.slotId)} readOnly={readOnly} onChoose={onChoose} />
        </div>
      </div>}
    </fieldset>
  </details>;
}

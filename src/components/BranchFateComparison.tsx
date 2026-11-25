import { useMemo, useState } from 'react';
import { compareBranchFate, listBranchFateSubjects } from '../engine/branchFateComparison';
import type { BranchFateFact, BranchFateResult, BranchFateSubject } from '../engine/branchFateComparison';
import type { WorldTimeline } from '../engine/timelineEngine';

export type BranchFateOption = BranchFateSubject & { name: string };
type Failure = Extract<BranchFateResult, { ok: false }>['reason'];
const SUBJECT: Record<BranchFateSubject['kind'], string> = { actor: '人物', settlement: '村镇', sect: '宗门' };
const KIND: Record<BranchFateFact['kind'], string> = {
  bestow: '赐宝', realm: '破境', life: '陨落', population: '村镇人口变化', leader: '掌门继任',
};
const FAILURE: Record<Failure, string> = {
  same_branch: '须选两条不同分支。',
  missing_branch: '所选分支已不在此时间线。',
  bad_date: '该轮没有两个可核对的同龄快照。',
  unknown_origin: '共同起点缺少可核对的原件，不能认定分歧先后。',
  subject_unavailable: '两支未都有可供当前视角核对的对象记录。',
  incomplete_before_difference: '分歧之前的快照或凭据不完整，不能认定最早的差别。',
};
const control = 'min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50';

function shownFact(fact: BranchFateFact): string {
  switch (fact.kind) {
    case 'bestow': return '本支有实际赐宝凭据。';
    case 'realm': return `实录破境：${fact.fromRealm}${fact.fromStage} 重 → ${fact.toRealm}${fact.toStage} 重。`;
    case 'life': return '本支有实际陨落凭据。';
    case 'population': return `经核对的人口记录：本村人口由 ${fact.before} 人变为 ${fact.after} 人。`;
    case 'leader': return '本支有实际掌门继任凭据。';
  }
}

function FactSide({ designation, fact }: { designation: '甲' | '乙'; fact?: BranchFateFact }) {
  return <li className="min-w-0 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
    <span className="font-semibold text-violet-100">{designation}：</span>
    {fact ? shownFact(fact) : '该轮没有可呈现的本项凭据，不能据此推认是否发生。'}
  </li>;
}

export function BranchFateReading({ result }: { result: BranchFateResult }) {
  if (!result.ok) return <p role="status" className="text-xs text-amber-200">{FAILURE[result.reason]} 不用邻近记录补填。</p>;
  const first = result.firstDifference;
  return (
    <section aria-label="同一对象的分支命运" className="min-w-0 space-y-1.5 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
      <p className="font-semibold text-violet-100">{SUBJECT[result.subject.kind]} · {result.subject.name}</p>
      <p className="text-slate-400">共同起点第 {result.originTick} 轮；本次核对至第 {result.throughTick} 轮。</p>
      {first ? <>
        <p role="status" className="font-semibold text-violet-100">最早可证分歧：第 {first.tick} 轮 · {KIND[first.kind]}</p>
        <ul aria-label="甲乙各自的分歧凭据" className="grid min-w-0 gap-1 sm:grid-cols-2">
          <FactSide designation="甲" fact={first.left} />
          <FactSide designation="乙" fact={first.right} />
        </ul>
        {result.consequence ? <div className="rounded border border-slate-800 p-2">
          <p className="font-semibold text-violet-100">已核实的后续 · {result.consequence.side === 'left' ? '甲' : '乙'} · 第 {result.consequence.tick} 轮</p>
          <p>{shownFact(result.consequence)}</p>
        </div> : <p>在可核对的范围内，没有找到能呈现的后续凭据。</p>}
      </> : <p role="status">在这些可核对的快照与项目中，未发现可证的分歧。</p>}
      <p className="text-slate-400">
        {result.coverage === 'broken_after_difference'
          ? '分歧后的留档或可核对凭据不连续，不能补推缺失轮次。'
          : '只涵盖所选保留快照中，本对象可以核对的项目。'}
        此处列已核实的后续，起因仍待查。
      </p>
    </section>
  );
}

const sameSubject = (a: BranchFateSubject, b: BranchFateSubject) => a.kind === b.kind && a.id === b.id;
const exactOption = (options: readonly BranchFateOption[], subject?: BranchFateSubject) => {
  const matches = subject && options.filter((row) => sameSubject(row,subject));
  return matches?.length === 1 ? matches[0] : undefined;
};

export function BranchFateSubjectControls({ options, selected, onSelect, onReview }: {
  options: readonly BranchFateOption[];
  selected?: BranchFateSubject;
  onSelect: (option?: BranchFateOption) => void;
  onReview: (option: BranchFateOption) => void;
}) {
  if (!options.length) return <p className="text-xs text-slate-400">尚无可在两支核对的对象；请核对分支和所选轮次。</p>;
  const exact = exactOption(options,selected);
  const nameKey = (item: BranchFateOption) => JSON.stringify([item.kind,item.name]);
  const names = new Map<string,number>();
  for (const item of options) names.set(nameKey(item),(names.get(nameKey(item)) ?? 0)+1);
  const displayName = (item: BranchFateOption, index: number) =>
    `${SUBJECT[item.kind]} · ${item.name}${(names.get(nameKey(item)) ?? 0) > 1 ? `（条目 ${index+1}）` : ''}`;
  return <div className="grid min-w-0 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-end">
    <label className="grid min-w-0 gap-1 text-xs text-slate-300">对照同一对象
      <select className={`${control} w-full text-base`} value={exact ? String(options.indexOf(exact)) : ''}
        onChange={(event) => onSelect(options.find((_,index) => String(index) === event.currentTarget.value))}>
        <option value="">请选择</option>
        {options.map((item, index) => <option key={`${item.kind}:${item.id}`} value={index}>{displayName(item,index)}</option>)}
      </select>
    </label>
    <button type="button" className={`${control} text-xs`} disabled={!exact}
      onClick={() => { if (exact) onReview(exact); }}>查最早分歧</button>
  </div>;
}

interface Props {
  timeline: WorldTimeline;
  leftId: string;
  rightId: string;
  throughTick: number;
  viewerId?: string;
  scopeKey?: string;
}
export function BranchFateComparison(props: Props) {
  const {scopeKey,viewerId,leftId,rightId,throughTick}=props;
  return <ScopedFate key={JSON.stringify([scopeKey,viewerId,leftId,rightId,throughTick])} {...props} />;
}

function ScopedFate(props: Props) {
  const [open,setOpen]=useState(false);
  return <details className="min-w-0 rounded border border-violet-400/25 bg-slate-950/50"
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-violet-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">同一对象的命运</summary>
    {open && <OpenFate {...props} />}
  </details>;
}

function OpenFate({timeline,leftId,rightId,throughTick,viewerId}: Props) {
  const [selected,setSelected]=useState<BranchFateSubject>();
  const [reading,setReading]=useState<{ timeline: WorldTimeline; subject: BranchFateSubject; result: BranchFateResult }>();
  const options=useMemo(()=>listBranchFateSubjects(timeline,leftId,rightId,throughTick,viewerId),
    [timeline,leftId,rightId,throughTick,viewerId]);
  const exact=exactOption(options,selected);
  return <div className="min-w-0 space-y-2 px-2 pb-2">
    <BranchFateSubjectControls options={options} selected={exact}
      onSelect={(item) => {setReading(undefined);setSelected(item ? {kind:item.kind,id:item.id} : undefined);}}
      onReview={(item) => {
        const subject={kind:item.kind,id:item.id};
        setReading({timeline,subject,result:compareBranchFate(timeline,leftId,rightId,throughTick,subject,viewerId)});
      }} />
    {reading?.timeline===timeline && exact && sameSubject(reading.subject,exact) && <BranchFateReading result={reading.result} />}
  </div>;
}

import {DanxiaSeasonBranchComparison,type DanxiaSeasonBranchTarget} from './DanxiaSeasonBranchComparison';
import {readBranchFateOrigin} from '../engine/branchFateComparison';
import {compareDanxiaSeasonReviews} from '../engine/danxiaSeasonReviewEngine';
import {readTimelineSnapshot} from '../engine/timelineEngine';
import { useMemo, useState } from 'react';
import { BranchFateComparison } from './BranchFateComparison';
import { compareAlignedBranches, listAlignedBranchTicks, type BranchComparisonResult } from '../engine/branchComparisonEngine';
import type { CausalChronicleView } from '../engine/chronicleCausalityEngine';
import type { WorldTimeline } from '../engine/timelineEngine';

type Comparison = Extract<BranchComparisonResult, { ok: true }>;
type Side = Comparison['left'];
type Choice = { left: string; right: string; tick: number };

const input = 'min-h-11 w-full min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-base text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40';
const action = 'min-h-11 rounded border border-violet-500/50 bg-violet-950/50 px-2.5 py-1.5 text-xs text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40';
const metrics = { roster: '人物总数', living: '在世人数', fallen: '陨落人数', publicFactsThisTick: '本轮公开纪事' } as const;
const factLabels: Record<CausalChronicleView['entry']['kind'], string> = {
  siege_launched: '发起围攻', truce_signed: '正式停战', sect_vacancy: '掌门出缺', sect_election: '正式选举',
  market_buy_order: '挂出买单', market_sell_order: '挂出卖单', market_shipment: '商队启程', market_settlement: '交易结算',
};
const relations: Record<CausalChronicleView['previous'][number]['relation'], string> = {
  withdrew_siege: '撤回围攻', filled_vacancy: '实际填补空缺',
  matched_buy_order: '实际撮合买单', matched_sell_order: '实际撮合卖单', settled_shipment: '实际结算商队',
};
const outcomes: Record<NonNullable<CausalChronicleView['entry']['outcome']>, string> = {
  truce_with_withdrawal: '停战生效，围攻实际撤回', truce_signed: '停战生效', elected: '已选出掌门',
  local_fill: '当场交割', delivered: '运达交割', route_loss: '途中货损', escort_failed: '护送失败，未交割',
  endpoint_missing: '站点失效，未交割', market_closed: '坊市关闭，未交割',
};
const missing: Record<Extract<BranchComparisonResult, { ok: false }>['reason'], string> = {
  same_branch: '必须选两条不同分支。', missing_branch: '原分支已不在此时间线中，请改选。',
  invalid_tick: '该轮次无效，请从共同保留轮次中重选。',
  left_unretained: '甲已经不保留这一轮。', right_unretained: '乙已经不保留这一轮。',
  both_unretained: '两条分支都不保留这一轮。', genesis_mismatch: '两条分支起源不一致，不能同轮对照。',
};

export function chooseAlignedComparisonTick(exactTicks: readonly number[], requested?: number, preferred?: number | null): number | undefined {
  if (requested !== undefined) return exactTicks.includes(requested) ? requested : undefined;
  if (preferred != null && exactTicks.includes(preferred)) return preferred;
  return exactTicks.length ? Math.max(...exactTicks) : undefined;
}

function ReceiptTrace({ node }: { node: CausalChronicleView }) {
  return <>
    <p className="break-words text-slate-200">{factLabels[node.entry.kind]} · 第 {node.entry.tick} 轮
      {node.entry.outcome && ` · ${outcomes[node.entry.outcome]}`}</p>
    {node.previous.length > 0 && <ul className="space-y-1 border-l border-slate-700 pl-2">
      {node.previous.map(({ relation, node: prior }) => <li key={`${relation}:${prior.entry.eventId}`} className="min-w-0">
        <p className="break-words text-violet-200">前因：{relations[relation]}</p>
        <ReceiptTrace node={prior} />
      </li>)}
    </ul>}
  </>;
}

function EvidenceSide({ side, designation }: { side: Side; designation: '甲' | '乙' }) {
  const { coverage, receipts } = side;
  const visibleGaps = coverage.gaps.slice(0, 4);
  return <section aria-label={`${designation}的独立证据`} className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2 text-xs text-slate-300">
    <h5 className="font-semibold text-violet-100 [overflow-wrap:anywhere]">{designation} · {side.label}</h5>
    <p>实际保留 {coverage.retainedTicks.length} 轮{coverage.firstTick !== null && coverage.lastTick !== null
      && ` · 第 ${coverage.firstTick} 至 ${coverage.lastTick} 轮之间`}。</p>
    {visibleGaps.length > 0 && <p className="[overflow-wrap:anywhere]">其中未保留：
      {visibleGaps.map(({ fromTick, toTick }) => fromTick === toTick ? `第 ${fromTick} 轮` : `第 ${fromTick} 至 ${toTick} 轮`).join('、')}
      {coverage.gaps.length > visibleGaps.length && `，另有 ${coverage.gaps.length - visibleGaps.length} 段`}。</p>}
    {receipts.length > 0 ? <ol aria-label={`${designation}在该轮的可核验凭据`} className="space-y-1">
      {receipts.map((node) => <li key={node.entry.eventId} className="border-t border-slate-800 pt-1.5">
        <ReceiptTrace node={node} />
      </li>)}
    </ol> : <p className="text-slate-400">此轮凭据暂未核实。</p>}
  </section>;
}

export function BranchComparisonReading({ result }: { result: BranchComparisonResult }) {
  if (!result.ok) return <p role="status" className="text-xs text-amber-200">{missing[result.reason]} 未用相邻轮次填补。</p>;
  return <div aria-label="同轮分支对照结果" className="min-w-0 space-y-2">
    <p role="status" className="text-xs text-violet-100">对照第 {result.tick} 轮的两个实际快照。</p>
    <dl className="grid min-w-0 gap-1.5 sm:grid-cols-2" aria-label="乙减甲的数量差">
      {result.metrics.map(({ id, left, right, delta }) => <div key={id} className="min-w-0 rounded border border-slate-800 p-2 text-xs">
        <dt className="font-semibold text-slate-100">{metrics[id]}</dt>
        <dd className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-slate-300"><span>甲 {left}</span><span>乙 {right}</span>
          <span aria-label={`乙减甲为 ${delta}`} className="text-violet-200">乙减甲 {delta > 0 ? `+${delta}` : delta}</span></dd>
      </div>)}
    </dl>
    <p className="text-xs leading-relaxed text-slate-400">以下凭据各按该分支该轮的可见范围列出。数量差不证明哪条事件造成了变化。</p>
    <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
      <EvidenceSide side={result.left} designation="甲" />
      <EvidenceSide side={result.right} designation="乙" />
    </div>
  </div>;
}

function OpenComparison({ timeline, viewerId, preferredTick }: { timeline: WorldTimeline; viewerId?: string; preferredTick?: number | null }) {
  const [requestedLeft, setLeft] = useState<string>();
  const [requestedRight, setRight] = useState<string>();
  const [requestedTick, setTick] = useState<number>();
  const [reading, setReading] = useState<Choice>();
  const branches = timeline.branches;
  const left = requestedLeft ?? branches.find(({ id }) => id === timeline.activeBranchId)?.id ?? branches[0]?.id ?? '';
  const right = requestedRight ?? branches.find(({ id }) => id !== left)?.id ?? '';
  const canAlign = left !== right && branches.some(({ id }) => id === left) && branches.some(({ id }) => id === right);
  const ticks = useMemo(() => canAlign ? listAlignedBranchTicks(timeline, left, right).slice().sort((a, b) => b - a) : [],
    [timeline, left, right, canAlign]);
  const tick = chooseAlignedComparisonTick(ticks, requestedTick, preferredTick);
  const staleTick = requestedTick !== undefined && tick === undefined;
  const reviewed = reading?.left === left && reading.right === right && reading.tick === tick ? reading : undefined;
  const result = useMemo(() => reviewed ? compareAlignedBranches(timeline, reviewed.left, reviewed.right, reviewed.tick, viewerId) : undefined,
    [timeline, reviewed, viewerId]);
  const originalMedicinePairs=useMemo(()=>{
    if(!result?.ok||!reviewed||!viewerId)return [];
    const x=readTimelineSnapshot(timeline,reviewed.tick,reviewed.left),y=readTimelineSnapshot(timeline,reviewed.tick,reviewed.right);
    if(!x?.danxiaReviews.reviews.length||!y?.danxiaReviews.reviews.length)return [];
    const original=readBranchFateOrigin(timeline,reviewed.left,reviewed.right,reviewed.tick);
    if(!original)return [];
    return original.danxiaShortages.cases.flatMap(row=>{
      const pair=compareDanxiaSeasonReviews(original,x,y,row.id,viewerId);
      if(!pair)return [];
      const disciple=original.cultivators.find(actor=>actor.id===row.discipleId);
      const village=original.settlements.villages.find(place=>place.id===row.settlementId);
      return disciple&&village?[{discipleId:row.discipleId,settlementId:row.settlementId,shortageId:row.id,
        label:`${disciple.name} · ${village.name} · 第 ${row.openedTick} 轮原案`,pair}]:[];
    });
  },[result,reviewed,timeline,viewerId]);
  const readOriginalMedicinePair=(target:DanxiaSeasonBranchTarget)=>{
    const match=originalMedicinePairs.find(row=>row.shortageId===target.shortageId&&
      row.discipleId===target.discipleId&&row.settlementId===target.settlementId);
    return match?{kind:'paired' as const,left:match.pair.first,right:match.pair.second}:{kind:'unavailable' as const};
  };
  const changePair = () => { setTick(undefined); setReading(undefined); };

  return <div className="space-y-2 px-3 pb-3">
    <p className="text-xs leading-relaxed text-slate-300">只读比较两条分支共同保留的同一轮。不切换分支，不改动快照，也不复演。</p>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1 text-xs text-slate-300">甲分支
        <select className={input} value={branches.some(({ id }) => id === left) ? left : ''} onChange={(event) => {
          const selected = event.currentTarget.value;
          if (!branches.some(({ id }) => id === selected)) return;
          if (requestedRight === selected) setRight('');
          setLeft(selected); changePair();
        }}>
          {(!left || !branches.some(({ id }) => id === left)) && <option value="">请重选甲分支</option>}
          {branches.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-300">乙分支
        <select className={input} value={canAlign ? right : ''} onChange={(event) => {
          const selected = event.currentTarget.value;
          if (selected === left || !branches.some(({ id }) => id === selected)) return;
          setRight(selected); changePair();
        }}>
          {!canAlign && <option value="">请选择另一条分支</option>}
          {branches.filter(({ id }) => id !== left).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </div>
    <label className="grid min-w-0 gap-1 text-xs text-slate-300">共同保留的轮次
      <select className={input} value={tick ?? ''} disabled={!ticks.length} onChange={(event) => {
        const value = event.currentTarget.value;
        if (!ticks.some((available) => String(available) === value)) return;
        setTick(Number(value)); setReading(undefined);
      }}>
        {tick === undefined && <option value="">{staleTick ? '原轮次已失效，请重选' : '没有共同保留的轮次'}</option>}
        {ticks.map((item) => <option key={item} value={item}>第 {item} 轮</option>)}
      </select>
    </label>
    {staleTick ? <p role="status" className="text-xs text-amber-200">原轮次已不再同时保留，不自动换到其他轮次。</p>
      : canAlign && !ticks.length ? <p role="status" className="text-xs text-slate-400">两条分支没有共同保留的轮次，无法对照。</p> : null}
    <button type="button" className={action} disabled={tick === undefined} onClick={() => {
      if (tick !== undefined && ticks.includes(tick) && canAlign) { setTick(tick); setReading({ left, right, tick }); }
    }}>对照此轮</button>
    {result && <BranchComparisonReading result={result} />}
    {reviewed&&originalMedicinePairs.length>0&&<DanxiaSeasonBranchComparison
      scopeKey={JSON.stringify([reviewed.left,reviewed.right,reviewed.tick,viewerId])} revision={timeline}
      options={originalMedicinePairs} onRead={readOriginalMedicinePair} />}
    {canAlign && tick !== undefined && <BranchFateComparison timeline={timeline} leftId={left} rightId={right}
      throughTick={tick} viewerId={viewerId} />}
  </div>;
}

export function BranchComparisonPanel({ timeline, viewerId, scopeKey, preferredTick }: {
  timeline: WorldTimeline; viewerId?: string; scopeKey?: string; preferredTick?: number | null;
}) {
  if (timeline.branches.length < 2) return null;
  return <ScopedComparison key={JSON.stringify([scopeKey, viewerId])} timeline={timeline} viewerId={viewerId} preferredTick={preferredTick} />;
}

function ScopedComparison(props: { timeline: WorldTimeline; viewerId?: string; preferredTick?: number | null }) {
  const [open, setOpen] = useState(false);
  return <details className="min-w-0 rounded border border-violet-400/25 bg-slate-950/60" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">对照同一轮</summary>
    {open && <OpenComparison {...props} />}
  </details>;
}

import { useEffect, useRef, useState } from 'react';
import type { ReplayReceiptOutcome } from '../engine/replayReceiptEngine';
import type { WorldTimeline } from '../engine/timelineEngine';
import type { ReplayVerificationSource } from './ReplayReceiptPanel';
import type * as Link from './linkedReplayReceipts';

declare const __SECT_UTILITY_RULE_VERSION__: string;
const RULE = typeof __SECT_UTILITY_RULE_VERSION__ === 'string' ? __SECT_UTILITY_RULE_VERSION__ : undefined;
const RUNTIME = { knownRuleVersions: new Set(RULE ? [RULE] : []) };
const CONTROL = 'min-h-11 min-w-0 rounded border border-violet-500/50 bg-slate-950 px-2 text-base sm:text-xs disabled:opacity-40';

type Capture = Awaited<ReturnType<typeof Link.captureLinkedReplayReceipt>>;
type Check = Awaited<ReturnType<typeof Link.verifyLinkedReplayReceipts>>;
type RecordSaved = Extract<Capture, {status:'captured'}>['record'];
export type ReplayReceiptShelf = readonly RecordSaved[];
type Reply = Capture | Check | {status:'local_error'};

export const replayReceiptOrdinals = (shelf: ReplayReceiptShelf, first: string, second: string) => {
  if (!/^[1-9]\d*$/.test(first) || !/^[1-9]\d*$/.test(second) || first === second) return undefined;
  const a = shelf[Number(first) - 1], b = shelf[Number(second) - 1];
  if (!a || !b || a.digest === b.digest) return undefined;
  return [a,b] as const;
};

export function replayReceiptFreshness() {
  let version = 0;
  return { invalidate: () => { version++; }, begin: () => { const stamp = ++version; return () => stamp === version; } };
}

export function linkedReplayMessage(result: Reply): string {
  switch (result.status) {
    case 'captured': return '已留作本次会话的回执。';
    case 'linked': return `衔接通过：第 ${result.startTick} 月起，到第 ${result.junctionTick} 月相接，第 ${result.endTick} 月止。`;
    case 'unavailable':
      switch (result.reason) {
        case 'snapshot_lost': return '所需原始快照未留存或尚未走到，无法核对。';
        case 'rule_build': return '当前构建无法核验这份回执的规则，未得出结论。';
        case 'crypto': return '当前环境无法校验回执，未得出结论。';
      }
      return '所需原件不可用，未得出结论。';
    case 'mismatch':
      switch (result.reason) {
        case 'predecessor': return '两份回执未按所选先后相接。';
        case 'snapshot': return '衔接处的原快照不一致。';
        case 'source': return '两份回执的来源不一致。';
        default: return '回执未能通过核对。';
      }
    case 'local_error': return '本机核对未完成，未得出结论。';
  }
}

export function LinkedReplayReceiptRead({timeline,source,outcome,shelf,onKeep}: {
  timeline: WorldTimeline; source?: ReplayVerificationSource; outcome?: ReplayReceiptOutcome;
  shelf: ReplayReceiptShelf; onKeep: (record:RecordSaved)=>void;
}) {
  const [predecessorChoice,setPredecessorChoice] = useState<{generation:number; ordinal:string}>();
  const [first,setFirst] = useState('');
  const [second,setSecond] = useState('');
  const [pendingGeneration,setPending] = useState<number>();
  const active = useRef<number>();
  const [reply,setReply] = useState<{ generation:number; text:string }>();
  const guard = useRef(replayReceiptFreshness());
  const inputs = useRef({timeline, world:source?.world, branch:source?.branchId, scope:source?.scopeKey, busy:source?.busy, outcome, generation:0});
  const prior = inputs.current;
  const changed = prior.timeline !== timeline || prior.world !== source?.world || prior.branch !== source?.branchId ||
    prior.scope !== source?.scopeKey || prior.busy !== source?.busy || prior.outcome !== outcome;
  if (changed) {
    guard.current.invalidate();
    inputs.current = {timeline,world:source?.world,branch:source?.branchId,scope:source?.scopeKey,busy:source?.busy,outcome,generation:prior.generation+1};
  }
  const generation = inputs.current.generation;
  const pending = pendingGeneration === generation;
  const predecessor = predecessorChoice?.generation === generation ? predecessorChoice.ordinal : '';
  useEffect(() => () => guard.current.invalidate(), []);
  const operate = async (action:(api:typeof Link)=>Promise<Reply>) => {
    if (active.current === generation || !source || source.busy) return;
    active.current = generation;
    const fresh = guard.current.begin();
    setReply(undefined);
    setPending(generation);
    try {
      const api = await import('./linkedReplayReceipts');
      if (!fresh()) return;
      const result = await action(api);
      if (!fresh()) return;
      if (result.status === 'captured') { onKeep(result.record); setPredecessorChoice(undefined); }
      setReply({generation,text:linkedReplayMessage(result)});
    } catch {
      if (fresh()) setReply({generation,text:linkedReplayMessage({status:'local_error'})});
    } finally {
      if (fresh()) { active.current = undefined; setPending(undefined); }
    }
  };
  const allowed = !!source && !source.busy && !pending;
  const current = outcome?.status === 'verified' ? outcome : undefined;
  if (!current && shelf.length === 0) return null;
  const pair = replayReceiptOrdinals(shelf,first,second);
  const edit = (set:(next:string)=>void,value:string) => {
    guard.current.invalidate();
    set(value);
    active.current = undefined;
    setPending(undefined);
    setReply(undefined);
  };
  const entries = shelf.map((row,index) => <option key={index} value={String(index+1)}>
    回执 {index+1} · 第 {row.receipt.sourceCheckpoint.tick} 至 {row.receipt.direct.tick} 月
  </option>);
  return <section aria-label="回执衔接" className="space-y-2 rounded border border-slate-800 p-2">
    <h4 className="font-semibold text-violet-100">回执衔接</h4>
    <p>只留在当前页面会话，不写入存档。核对衔接不会再推进世界。</p>
    {current && source && <div className="space-y-1.5">
      {shelf.length > 0 && <label className="grid gap-1">接在哪一份之后（可不选）
        <select className={CONTROL} value={predecessor} onChange={(e)=>edit((ordinal)=>setPredecessorChoice({generation,ordinal}),e.currentTarget.value)}>
          <option value="">不接前件</option>{entries}
        </select>
      </label>}
      <button type="button" className={CONTROL} disabled={!allowed} onClick={() => {
        const earlier = predecessor ? shelf[Number(predecessor)-1] : undefined;
        if (predecessor && !earlier) return;
        void operate(({captureLinkedReplayReceipt})=>captureLinkedReplayReceipt(timeline,source.branchId,current,RUNTIME,earlier));
      }}>留作回执</button>
    </div>}
    {shelf.length > 0 && <p>本次会话已留 {shelf.length} 份。</p>}
    {shelf.length >= 2 && <div className="grid gap-1.5">
      <label className="grid gap-1">前一份回执
        <select className={CONTROL} value={first} onChange={(e)=>edit(setFirst,e.currentTarget.value)}>
          <option value="">请选择</option>{entries}
        </select>
      </label>
      <label className="grid gap-1">后一份回执
        <select className={CONTROL} value={second} onChange={(e)=>edit(setSecond,e.currentTarget.value)}>
          <option value="">请选择</option>{entries}
        </select>
      </label>
      <button type="button" className={CONTROL} disabled={!allowed || !pair}
        onClick={() => { if (pair) void operate(({verifyLinkedReplayReceipts})=>verifyLinkedReplayReceipts(timeline,pair[0],pair[1],RUNTIME)); }}>核对衔接</button>
    </div>}
    {pending && <button type="button" className={CONTROL} onClick={() => {
      guard.current.invalidate();
      active.current = undefined;
      setPending(undefined);
      setReply({generation,text:'已取消，未得出结论。'});
    }}>取消本次衔接操作</button>}
    {reply?.generation === generation && <p role="status">{reply.text}</p>}
  </section>;
}

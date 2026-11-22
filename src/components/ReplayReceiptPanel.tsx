import { useEffect, useRef, useState } from 'react';
import type {
  ReplayReceipt, ReplayReceiptOutcome, ReplayReceiptRequest, ReplayReceiptResponse, ReplayReceiptSource,
} from '../engine/replayReceiptEngine';
import { LinkedReplayReceiptRead, type ReplayReceiptShelf } from './LinkedReplayReceiptRead';
import type { WorldTimeline } from '../engine/timelineEngine';
import type { WorldState } from '../types/world';

export interface ReplayVerificationSource {
  world: WorldState;
  branchId: string;
  scopeKey: string;
  sessionEpoch?: number;
  busy: boolean;
}

type ReplayChoice = 'branch' | 'short48' | 'long526';
type ReplayWorker = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;
type ReplayRunning = {
  source: ReplayVerificationSource;
  choice: ReplayChoice;
  workerRun: ReturnType<typeof startReplayVerification>;
};
type ReplayDisplay = {
  source: ReplayVerificationSource;
  choice: ReplayChoice;
  outcome: ReplayReceiptOutcome;
};

const ACTION = 'min-h-11 rounded border border-violet-500/50 bg-violet-950/55 px-2.5 py-1.5 text-xs text-violet-100 disabled:opacity-40';
const LABELS: Record<ReplayChoice, string> = {
  branch: '所选分支快照', short48: '短样本（48 人）', long526: '长样本（526 人）',
};
const UNAVAILABLE: Record<Extract<ReplayReceiptOutcome, { status:'unavailable' }>['reason'], string> = {
  rules_version: '当前构建没有可核验的规则指纹。',
  crypto: '当前环境无法计算校验指纹。',
  source: '所选来源或检查点不可用。',
  save_size: '本次回执的存档超过可验证大小。',
  invalid_save: '本次存档未通过校验。',
  execution: '本地运行未完成或未返回可核验结果。',
};
const COVERAGE: Record<ReplayReceiptOutcome['status'], string> = {
  verified: '通过', mismatch: '未通过', unavailable: '无法核验',
};

export function sameReplayVerificationSource(a: ReplayVerificationSource, b?: ReplayVerificationSource) {
  return !!b && !a.busy && !b.busy && a.world === b.world && a.branchId === b.branchId && a.scopeKey === b.scopeKey &&
    a.sessionEpoch === b.sessionEpoch;
}

function sameRequestedReplaySource(a: ReplayReceiptSource, b: ReplayReceiptSource) {
  return a.kind === 'branch' ? b.kind === 'branch' && a.branchId === b.branchId && a.tick === b.tick
    : b.kind === 'fixture' && a.fixtureId === b.fixtureId;
}

function displayableReceipt(receipt?: ReplayReceipt): boolean {
  if (!receipt || receipt.protocolVersion !== 1 || receipt.requestedTicks !== 4) return false;
  const hash = /^[a-f0-9]{64}$/;
  if (!hash.test(receipt.ruleVersion)) return false;
  return [receipt.sourceCheckpoint, receipt.direct, receipt.chunked].every((row) => row &&
    Number.isSafeInteger(row.tick) && Number.isSafeInteger(row.actorCount) && Number.isSafeInteger(row.livingCount) && hash.test(row.sha256)) &&
    [receipt.direct, receipt.chunked].every((row) => row.completedTicks === receipt.requestedTicks &&
      (row.elapsedMs === null || Number.isFinite(row.elapsedMs)));
}

function browserReplayWorker(): ReplayWorker {
  return new Worker(new URL('../engine/fastForward.worker.ts', import.meta.url), { type: 'module' });
}

/** One fresh replay-only Worker. Neither a stale response nor a duplicate terminal event can be installed. */
export function startReplayVerification(request: ReplayReceiptRequest, stillCurrent: () => boolean,
  complete: (outcome: ReplayReceiptOutcome) => void, factory: () => ReplayWorker = browserReplayWorker) {
  const worker = factory();
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
  };
  const finish = (outcome: ReplayReceiptOutcome) => {
    if (!active) return;
    stop();
    if (stillCurrent()) complete(outcome);
  };
  const failure = () => finish({ status: 'unavailable', reason: 'execution' });
  worker.onmessage = (event: MessageEvent<ReplayReceiptResponse>) => {
    const data = event.data;
    if (!data || data.type !== 'replay_receipt' || data.runId !== request.runId ||
        !data.source || !sameRequestedReplaySource(request.source, data.source) ||
        !data.outcome || !['verified', 'mismatch', 'unavailable'].includes(data.outcome.status) ||
        (data.outcome.status !== 'unavailable' && (!displayableReceipt(data.outcome.receipt) ||
          (request.source.kind === 'branch' && data.outcome.receipt.sourceCheckpoint.tick !== request.source.tick)))) {
      failure();
      return;
    }
    finish(data.outcome);
  };
  worker.onerror = (event) => { event.preventDefault(); failure(); };
  worker.onmessageerror = failure;
  try { worker.postMessage(request); } catch (error) { stop(); throw error; }
  return { stop };
}

const elapsed = (ms: number | null) => ms === null ? '暂不可测' : `${ms.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 毫秒`;

function ReplayRunStat({ title, run }: { title: string; run: ReplayReceipt['direct'] }) {
  return <div className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
    <h5 className="font-medium text-violet-100">{title}</h5>
    <p>完成 {run.completedTicks} 轮 · 结束 Tick #{run.tick} · {run.actorCount} 人（在世 {run.livingCount}）</p>
    <p>原有角色：{run.retainedSourceActors ? '全部保留' : '未能全部保留'} · 用时 {elapsed(run.elapsedMs)} · 随机状态 {run.randomState}</p>
    <p>存档指纹：<code className="break-all">{run.sha256}</code></p>
  </div>;
}

export function ReplayReceiptResult({ choice, outcome, branchId }: { choice: ReplayChoice; outcome: ReplayReceiptOutcome; branchId?: string }) {
  const otherCoverage = (Object.keys(LABELS) as ReplayChoice[]).filter((key) => key !== choice).map((key) => LABELS[key]);
  const receipt = outcome.status === 'unavailable' ? undefined : outcome.receipt;
  return <section aria-label="本次复演结果" className="min-w-0 space-y-2 rounded border border-violet-500/30 p-2 text-xs text-slate-300">
    <h4 role="status" className={outcome.status === 'verified' ? 'font-medium text-emerald-200' : 'font-medium text-amber-200'}>
      {LABELS[choice]} · {outcome.status === 'verified' ? '本次核验通过' : outcome.status === 'mismatch' ? '本次核验未通过' : '本次无法核验'}
    </h4>
    {outcome.status === 'unavailable' && <p>{UNAVAILABLE[outcome.reason] ?? UNAVAILABLE.execution} 未取得通过或不一致的结论。</p>}
    {receipt && <>
      <p>种子 {receipt.seed} · 谱系 {receipt.profileId ?? '未记录'} · 随机算法 {receipt.randomAlgorithm} · 协议 v{receipt.protocolVersion}</p>
      <p>规则指纹：<code className="break-all">{receipt.ruleVersion}</code></p>
      <p>{choice === 'branch' && branchId && <><code className="break-all">{branchId}</code> · </>}
        起点 Tick #{receipt.sourceCheckpoint.tick} · {receipt.sourceCheckpoint.actorCount} 人（在世 {receipt.sourceCheckpoint.livingCount}） · 随机状态 {receipt.sourceCheckpoint.randomState}</p>
      <p>起点存档指纹：<code className="break-all">{receipt.sourceCheckpoint.sha256}</code></p>
      <p>目标 {receipt.requestedTicks} 轮 · 校验后的两份完整存档{receipt.identicalVerifiedSave ? '字节完全相同' : '不相同'}。</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ReplayRunStat title="逐轮运行" run={receipt.direct} />
        <ReplayRunStat title="分批运行" run={receipt.chunked} />
      </div>
      <p>{receipt.timingScope === 'browser_worker' ? '用时为本机浏览器 Worker 本次测量，不代表所有设备的速度。' : '用时为本地进程本次测量，不代表所有设备的速度。'}</p>
    </>}
    <p>本回执未覆盖：{otherCoverage.join('、')}。</p>
  </section>;
}

function ReplayReceiptControls({ source, timeline, shelf, onKeep }: { source?: ReplayVerificationSource;
  timeline?: WorldTimeline; shelf: ReplayReceiptShelf; onKeep:(row:ReplayReceiptShelf[number])=>void }) {
  const [choice, setChoice] = useState<ReplayChoice>('branch');
  const [results, setResults] = useState<Partial<Record<ReplayChoice, ReplayDisplay>>>({});
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const active = useRef<ReplayRunning>();
  const current = useRef({ source, choice });
  const serial = useRef(0);
  current.current = { source, choice };

  useEffect(() => () => active.current?.workerRun.stop(), []);
  useEffect(() => {
    const run = active.current;
    if (run && (run.choice !== choice || !sameReplayVerificationSource(run.source, source))) {
      active.current = undefined;
      run.workerRun.stop();
      setRunning(false);
    }
    if (Object.values(results).some((result) => result && !sameReplayVerificationSource(result.source, source))) setResults({});
  }, [source?.world, source?.branchId, source?.scopeKey, source?.busy, choice, results]);

  const stillCurrent = (start: ReplayVerificationSource, kind: ReplayChoice) =>
    kind === current.current.choice && sameReplayVerificationSource(start, current.current.source);
  const available = typeof Worker !== 'undefined';
  const start = () => {
    if (!source || source.busy || !available || active.current) return;
    const stamp = source;
    const runId = `local-replay-${++serial.current}`;
    const request: ReplayReceiptRequest = choice === 'branch'
      ? { type: 'verify_replay', runId, source: { kind: 'branch', branchId: source.branchId, tick: source.world.tick }, base: source.world }
      : { type: 'verify_replay', runId, source: { kind: 'fixture', fixtureId: choice } };
    setResults((prior) => ({ ...prior, [choice]: undefined }));
    setCancelled(false);
    setRunning(true);
    try {
      const workerRun = startReplayVerification(request, () => stillCurrent(stamp, choice), (outcome) => {
        active.current = undefined;
        setRunning(false);
        setResults((prior) => ({ ...prior, [choice]: { source: stamp, choice, outcome } }));
      });
      active.current = { source: stamp, choice, workerRun };
    } catch {
      setRunning(false);
      if (stillCurrent(stamp, choice)) setResults((prior) => ({
        ...prior, [choice]: { source: stamp, choice, outcome: { status: 'unavailable', reason: 'execution' } },
      }));
    }
  };

  const visited = (key: ReplayChoice) => {
    const result = results[key];
    return result && sameReplayVerificationSource(result.source, source) ? result : undefined;
  };
  const visibleResult = visited(choice);
  return <div className="mt-1.5 min-w-0 space-y-2 text-xs leading-relaxed text-slate-300">
    <p>手动在本机用规则脑核验 4 轮。不会调用模型、推进当前世界或建立分支。</p>
    <label className="grid min-w-0 gap-1">核验来源
      <select value={choice} disabled={running} className="min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-base sm:text-xs"
        onChange={(event) => { const next = event.currentTarget.value; if (Object.hasOwn(LABELS, next)) {
          setChoice(next as ReplayChoice); setCancelled(false);
        } }}>
        {(Object.keys(LABELS) as ReplayChoice[]).map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}
      </select>
    </label>
    {choice === 'branch' && source && <p>起点：分支 <code className="break-all">{source.branchId}</code> · Tick #{source.world.tick}，只读取此确切快照。</p>}
    {choice !== 'branch' && <p>固定合成样本，不是当前分支，也不是人数上限。</p>}
    <ul aria-label="当前来源下的核验覆盖" className="grid gap-1 text-slate-400 sm:grid-cols-3">
      {(Object.keys(LABELS) as ReplayChoice[]).map((key) => {
        const tested = visited(key);
        return <li key={key}>{LABELS[key]}：{tested ? COVERAGE[tested.outcome.status] : '未覆盖'}</li>;
      })}
    </ul>
    {!source ? <p>没有可核验的所选快照。</p> : !available ? <p>当前浏览器缺少独立 Worker，无法启动核验。</p>
      : source.busy ? <p>世界正在推进或快进，暂停后才能开始核验。</p> : null}
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={ACTION} onClick={start} disabled={!source || source.busy || !available || running}>开始本地复演核验</button>
      {running && <button type="button" className={ACTION} onClick={() => {
        active.current?.workerRun.stop();
        active.current = undefined;
        setRunning(false);
        setCancelled(true);
      }}>取消本次核验</button>}
    </div>
    {running && <p role="status">正在本地核验；尚未取得回执。</p>}
    {cancelled && <p role="status">已取消；本次没有可用回执。</p>}
    {visibleResult && <ReplayReceiptResult choice={visibleResult.choice} outcome={visibleResult.outcome} branchId={visibleResult.source.branchId} />}
    {timeline && <LinkedReplayReceiptRead timeline={timeline} source={source} outcome={choice === 'branch' ? visibleResult?.outcome : undefined}
      shelf={shelf} onKeep={onKeep} />}
  </div>;
}

export function ReplayReceiptPanel({ source, timeline }: { source?: ReplayVerificationSource; timeline?:WorldTimeline }) {
  const [shelf,setShelf] = useState<ReplayReceiptShelf>([]);
  const [open, setOpen] = useState(false);
  return <details className="min-w-0 rounded border border-slate-800 bg-slate-950/60 px-2"
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-violet-100">本地复演核验回执</summary>
    {open && <div className="pb-2"><ReplayReceiptControls source={source} timeline={timeline} shelf={shelf}
      onKeep={(row)=>setShelf((prior)=>prior.some((existing)=>existing.digest===row.digest) ? prior : [...prior,row])} /></div>}
  </details>;
}

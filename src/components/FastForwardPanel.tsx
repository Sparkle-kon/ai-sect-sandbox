import { useEffect, useRef, useState } from 'react';
import type { TimelineSnapshot, WorldTimeline } from '../engine/timelineEngine';
import type { WorldState } from '../types/world';
import { FAST_FORWARD_MAX_TICKS } from '../engine/fastForwardEngine';
import { measureSaveCapacity } from '../engine/saveCapacityEngine';
import type { FastForwardProgress } from '../engine/fastForwardEngine';

export interface FastForwardCapacitySource { world: WorldState; contextVersion: number; scopeKey: string }
export interface FastForwardPreflightBinding {
  world: WorldState;
  timeline: WorldTimeline;
  branchId: string;
  head: TimelineSnapshot;
  count: number;
  contextVersion?: number;
  scopeKey?: string;
}
interface FastForwardCapacityReport {
  bytes: number;
  limit: number;
  branches: number;
  snapshots: number;
  uniqueSnapshots: number;
  branchSnapshots: number;
}
type Prepare = { phase: 'measuring'; binding: FastForwardPreflightBinding } |
  { phase: 'measured'; binding: FastForwardPreflightBinding; report: FastForwardCapacityReport } |
  { phase: 'unavailable'; binding: FastForwardPreflightBinding };

export function sameFastForwardBinding(a: FastForwardPreflightBinding, b?: FastForwardPreflightBinding): boolean {
  return !!b && a.world === b.world && a.timeline === b.timeline && a.branchId === b.branchId &&
    a.head === b.head && a.count === b.count && a.contextVersion === b.contextVersion && a.scopeKey === b.scopeKey;
}

export interface FastForwardControls {
  available: boolean;
  phase: 'idle' | 'running' | 'pausing' | 'paused' | 'staging' | 'ready' | 'error';
  progress?: FastForwardProgress;
  notice?: string;
  capacitySource?: FastForwardCapacitySource;
  onStart: (count: number, binding: FastForwardPreflightBinding) => void;
  onPause: () => void;
  onResume: () => void;
  onStage: () => void;
  onCancel: () => void;
  onApply: () => void;
}

const phaseLabel: Record<FastForwardControls['phase'], string> = {
  idle: '未开始', running: '正在独立推演', pausing: '等待当前一批回合完整结束后暂停', paused: '已暂停',
  staging: '正在核验检查点', ready: '检查点已核验，等待确认', error: '本次快进未能完成',
};
const choices = () => [...new Set([1, 3, 6, 12, 24, 60, FAST_FORWARD_MAX_TICKS])].filter((count) => count <= FAST_FORWARD_MAX_TICKS);
const action = 'min-h-11 min-w-0 rounded border border-violet-500/50 bg-violet-950/55 px-2.5 text-xs text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40';

export function FastForwardPanel({ controls, timeline, branchLimit, blocked }: {
  controls: FastForwardControls;
  timeline: WorldTimeline;
  branchLimit: boolean;
  blocked: boolean;
}) {
  const [count, setCount] = useState(12);
  const [approval, setApproval] = useState<FastForwardProgress>();
  const [preflight, setPreflight] = useState<Prepare>();
  const { available, phase, progress } = controls;
  const isActive = phase === 'running' || phase === 'pausing' || phase === 'paused' || phase === 'staging' || phase === 'ready';
  const branch = timeline.branches.find(({ id }) => id === timeline.activeBranchId);
  const head = branch?.snapshots.at(-1);
  const source = controls.capacitySource;
  const mayPreview = available && !branchLimit && !blocked && !isActive && !!head && choices().includes(count) &&
    (!source || source.world.tick === head.tick);
  const binding = mayPreview && branch && head ? {
    world: source?.world ?? head.world, timeline, branchId: branch.id, head, count,
    contextVersion: source?.contextVersion, scopeKey: source?.scopeKey,
  } : undefined;
  const activeBinding = useRef(binding);
  activeBinding.current = binding;
  const serial = useRef(0);
  const observedBinding = useRef(binding);
  const alreadyStarted = useRef<Prepare>();
  const validPreflight = preflight && sameFastForwardBinding(preflight.binding, binding) ? preflight : undefined;
  const mayStart = validPreflight?.phase === 'measured';
  useEffect(() => {
    return () => { serial.current++; };
  }, []);
  useEffect(() => {
    const previous = observedBinding.current;
    const next = activeBinding.current;
    observedBinding.current = next;
    if (previous ? !sameFastForwardBinding(previous,next) : !!next) {
      serial.current++;
      setPreflight(undefined);
    }
  }, [timeline, head, source?.world, source?.contextVersion, source?.scopeKey, available, count, blocked, branchLimit, isActive]);
  const measure = async () => {
    const start = activeBinding.current;
    if (!start) return;
    const token = ++serial.current;
    setPreflight({phase:'measuring',binding:start});
    try {
      await Promise.resolve(); // Recheck the exact binding after the preview starts.
      if (token !== serial.current || !sameFastForwardBinding(start,activeBinding.current)) return;
      const capacity = measureSaveCapacity(start.world,start.timeline);
      if (capacity.jsonBytes===null || !capacity.timeline) throw new Error('Capacity measurement unavailable');
      const branchSnapshots = start.timeline.branches.find(({id})=>id===start.branchId)?.snapshots.length ?? 0;
      const report = { bytes:capacity.jsonBytes,limit:capacity.limitBytes,branches:capacity.timeline.branchCount,
        snapshots:capacity.timeline.snapshotReferences,uniqueSnapshots:capacity.timeline.uniqueSnapshots,branchSnapshots };
      if (token === serial.current && sameFastForwardBinding(start,activeBinding.current)) {
        setPreflight({phase:'measured',binding:start,report});
      }
    } catch {
      if (token === serial.current && sameFastForwardBinding(start,activeBinding.current)) {
        setPreflight({phase:'unavailable',binding:start});
      }
    }
  };
  const mayApply = available && !branchLimit && !blocked && phase === 'ready' && !!progress && progress.completedTicks > 0;
  const approved = mayApply && approval !== undefined && approval === progress;
  useEffect(() => { if (phase !== 'ready') setApproval(undefined); }, [phase]);
  return <details className="min-w-0 rounded border border-violet-400/25 bg-slate-950/55">
    <summary className="min-h-11 cursor-pointer break-words px-2.5 py-2.5 text-xs font-semibold text-violet-100">长局快进与可取消回放</summary>
    <div className="space-y-2 px-2.5 pb-2.5 text-xs leading-relaxed text-slate-300">
      <p>从当前实时刻在独立副本推演，最多 {FAST_FORWARD_MAX_TICKS} 个月；用本地规则，不调用模型。原分支不变，不会自动进入新分支。</p>
      {!available && <p className="text-amber-200">当前无法启动独立快进（此上下文不可用或浏览器不支持独立推演所需的工作线程）。</p>}
      {branchLimit && <p className="text-amber-200">分支上限已到，暂不能应用新检查点。</p>}
      {blocked && !isActive && <p className="text-amber-200">先返回实时状态并结束其他待确认操作，再开始快进。</p>}
      {!isActive && <form className="space-y-1.5" onSubmit={(event) => {
        event.preventDefault();
        if (validPreflight?.phase !== 'measured' || alreadyStarted.current === validPreflight ||
          !sameFastForwardBinding(validPreflight.binding,activeBinding.current)) return;
        alreadyStarted.current = validPreflight;
        const checked = validPreflight.binding;
        setPreflight(undefined);
        controls.onStart(checked.count,checked);
      }}>
        <div className="flex min-w-0 flex-wrap items-end gap-1.5">
        <label className="grid min-w-0 gap-1">推演月数
          <select className={action} value={count} disabled={!mayPreview}
            onChange={(event) => { serial.current++; setPreflight(undefined); setCount(Number(event.currentTarget.value)); }}>
            {choices().map((value) => <option key={value} value={value}>{value} 个月</option>)}
          </select>
        </label>
        <button type="button" className={action} disabled={!mayPreview || validPreflight?.phase==='measuring'}
          onClick={() => void measure()}>预检文件与快照</button>
        <button type="submit" className={action} disabled={!mayStart}>开始独立快进</button>
        </div>
        {validPreflight?.phase==='measuring' && <p role="status">正在本机读取当前世界的存档大小，尚未开始推演。</p>}
        {validPreflight?.phase==='unavailable' && <p role="status" className="text-amber-200">本次未能测出当前存档大小；可以重新预检，未开始推演。</p>}
        {validPreflight?.phase==='measured' && <div aria-label="本次快进容量预检" className="space-y-1 rounded border border-slate-800 p-2">
          <p>预检来源：当前分支 Tick #{validPreflight.binding.head.tick}，拟推演 {validPreflight.binding.count} 个月。</p>
          <p>单个世界 JSON 导出：{validPreflight.report.bytes} 字节（UTF-8）。文件上限 {validPreflight.report.limit} 字节（8 MiB）。</p>
          <p>当前时间线：{validPreflight.report.branches} 条分支合计 {validPreflight.report.snapshots} 个快照引用（{validPreflight.report.uniqueSnapshots} 份不同快照），当前分支 {validPreflight.report.branchSnapshots} 份。</p>
          <p>快照份数不是内存用量，也不是人口上限；文件上限本身不阻止独立快进。</p>
          {validPreflight.report.bytes > validPreflight.report.limit && <p role="status" className="text-amber-200">当前 JSON 超过文件上限，不能直接导出并重新导入。你仍可自行决定是否开始快进。</p>}
        </div>}
      </form>}
      {phase !== 'idle' && <p role="status" className="font-medium text-violet-200">{phaseLabel[phase]}{controls.notice && ` · ${controls.notice}`}</p>}
      {phase === 'idle' && controls.notice && <p role="status" className="text-violet-200">{controls.notice}</p>}
      {progress && <div className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
        <p>已完成 {progress.completedTicks} / {progress.requestedTicks} 个月 · Tick #{progress.startTick} → #{progress.currentTick}</p>
        <progress className="h-2 w-full accent-violet-400" aria-label="已经完成的独立推演月份" max={progress.requestedTicks} value={progress.completedTicks} />
        <p>当前副本：在世 {progress.living} 人 · 全部角色记录 {progress.totalActors} 人</p>
      </div>}
      {isActive && <div className="flex flex-wrap gap-1.5">
        {phase === 'running' && <button type="button" className={action} onClick={controls.onPause}>暂停快进</button>}
        {phase === 'paused' && <>
          <button type="button" className={action} onClick={controls.onResume}>继续快进</button>
          <button type="button" className={action} disabled={!progress?.completedTicks || blocked} onClick={controls.onStage}>核验已完成的检查点</button>
        </>}
        {phase === 'ready' && !approved && <button type="button" className={action} disabled={!mayApply} onClick={() => setApproval(progress)}>准备应用到新分支</button>}
        <button type="button" className={action} onClick={() => { setApproval(undefined); controls.onCancel(); }}>取消并丢弃快进结果</button>
      </div>}
      {approved && <section aria-label="确认应用独立检查点" className="space-y-1.5 rounded border border-amber-500/60 bg-amber-950/50 p-2 text-amber-100">
        <p>以已核验的 Tick #{approval.currentTick} 创建并进入新分支？应用前会再次校验，原分支保持不变。</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={action} onClick={() => { if (approved) { setApproval(undefined); controls.onApply(); } }}>确认创建并进入新分支</button>
          <button type="button" className={action} onClick={() => setApproval(undefined)}>返回核对</button>
        </div>
      </section>}
    </div>
  </details>;
}

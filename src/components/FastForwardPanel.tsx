import { useEffect, useState } from 'react';
import { FAST_FORWARD_MAX_TICKS } from '../engine/fastForwardEngine';
import type { FastForwardProgress } from '../engine/fastForwardEngine';

export interface FastForwardControls {
  available: boolean;
  phase: 'idle' | 'running' | 'pausing' | 'paused' | 'staging' | 'ready' | 'error';
  progress?: FastForwardProgress;
  notice?: string;
  onStart: (count: number) => void;
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

export function FastForwardPanel({ controls, branchLimit, blocked }: {
  controls: FastForwardControls;
  branchLimit: boolean;
  blocked: boolean;
}) {
  const [count, setCount] = useState(12);
  const [approval, setApproval] = useState<FastForwardProgress>();
  const { available, phase, progress } = controls;
  const isActive = phase === 'running' || phase === 'pausing' || phase === 'paused' || phase === 'staging' || phase === 'ready';
  const mayStart = available && !branchLimit && !blocked && !isActive;
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
      {!isActive && <form className="flex min-w-0 flex-wrap items-end gap-1.5" onSubmit={(event) => {
        event.preventDefault();
        if (mayStart && choices().includes(count)) controls.onStart(count);
      }}>
        <label className="grid min-w-0 gap-1">推演月数
          <select className={action} value={count} disabled={!mayStart} onChange={(event) => setCount(Number(event.currentTarget.value))}>
            {choices().map((value) => <option key={value} value={value}>{value} 个月</option>)}
          </select>
        </label>
        <button type="submit" className={action} disabled={!mayStart}>开始独立快进</button>
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

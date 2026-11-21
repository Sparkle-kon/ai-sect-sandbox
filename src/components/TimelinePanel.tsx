import { useState } from 'react';
import { TIMELINE_MAX_BRANCHES, TIMELINE_MAX_TICKS } from '../engine/timelineEngine';
import type { WorldTimeline } from '../engine/timelineEngine';
import type { GodInterventionCommand } from '../engine/worldEngine';
import type { WorldState } from '../types/world';
import { FastForwardPanel } from './FastForwardPanel';
import type { FastForwardControls } from './FastForwardPanel';

type Intervention = 'SPAWN_TREASURE' | 'TRIBULATION_STRIKE' | 'DEMONIC_TIDE';
const INTERVENTIONS: Record<Intervention, { title: string; target: 'location' | 'cultivator' | 'world' }> = {
  SPAWN_TREASURE: { title: '赐下天材地宝', target: 'location' },
  TRIBULATION_STRIKE: { title: '降下天雷', target: 'cultivator' },
  DEMONIC_TIDE: { title: '血月天魔潮', target: 'world' },
};

function choicesFor(world: WorldState, type: Intervention) {
  switch (INTERVENTIONS[type].target) {
    case 'location': return world.locations.map(({ id, name }) => ({ id, name }));
    case 'cultivator': return world.cultivators.filter(({ alive, hp }) => alive && hp > 0).map(({ id, name }) => ({ id, name }));
    case 'world': return [];
  }
}

export function buildBranchIntervention(world: WorldState, type: Intervention, targetId: string): GodInterventionCommand | undefined {
  if (!Object.hasOwn(INTERVENTIONS, type)) return undefined;
  if (type === 'DEMONIC_TIDE') return world.cultivators.some(({ alive, hp }) => alive && hp > 0) ? { type } : undefined;
  if (!choicesFor(world, type).some(({ id }) => id === targetId)) return undefined;
  return type === 'SPAWN_TREASURE' ? { type, targetLocationId: targetId } : { type, targetCultivatorId: targetId };
}

interface PendingBranch {
  branchId: string;
  tick: number;
  baseline: WorldState;
  command: GodInterventionCommand;
  summary: string;
}

export interface TimelinePanelProps {
  timeline: WorldTimeline;
  previewTick: number | null;
  busy: boolean;
  onPreview: (tick: number | null) => void;
  onSelectBranch: (branchId: string) => void;
  onFork: (sourceBranchId: string, tick: number, command: GodInterventionCommand) => void;
  notice?: string | null;
  fastForward?: FastForwardControls;
}

const control = 'rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40';
const button = 'rounded border border-violet-500/50 bg-violet-950/50 px-2 py-1.5 text-xs text-violet-100 disabled:opacity-40';

export function TimelinePanel({ timeline, previewTick, busy, onPreview, onSelectBranch, onFork, notice, fastForward }: TimelinePanelProps) {
  const [requestedBranch, setRequestedBranch] = useState<string>();
  const [intervention, setIntervention] = useState<Intervention>('SPAWN_TREASURE');
  const [target, setTarget] = useState<string>();
  const [pending, setPending] = useState<PendingBranch>();
  const current = timeline.branches.find(({ id }) => id === timeline.activeBranchId);
  const snapshots = current?.snapshots ?? [];
  const selectedIndex = previewTick === null ? snapshots.length - 1 : snapshots.findIndex(({ tick }) => tick === previewTick);
  const preview = previewTick === null ? undefined : snapshots[selectedIndex];
  const branchId = timeline.branches.some(({ id }) => id === requestedBranch) ? requestedBranch : current?.id;
  const timelineLocked = busy || Boolean(fastForward && fastForward.phase !== 'idle' && fastForward.phase !== 'error');
  const canFork = timeline.branches.length < TIMELINE_MAX_BRANCHES;
  const targets = preview ? choicesFor(preview.world, intervention) : [];
  const selectedTarget = target === undefined ? targets[0] : targets.find(({ id }) => id === target);
  const command = preview ? buildBranchIntervention(preview.world, intervention, selectedTarget?.id ?? '') : undefined;
  const pendingStillCurrent = pending && current?.id === pending.branchId && preview?.tick === pending.tick && preview.world === pending.baseline;
  const sourceName = current?.parentBranchId ? timeline.branches.find(({ id }) => id === current.parentBranchId)?.label : undefined;

  return (
    <section aria-label="时光回溯与分支" className="min-w-0 space-y-3 rounded-xl border border-violet-500/30 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-violet-100">时光回溯与分支</h3>
        <p className="text-xs text-slate-300">每条分支最多 {TIMELINE_MAX_TICKS} 个 Tick · 分支 {timeline.branches.length}/{TIMELINE_MAX_BRANCHES}（含原线）。时间线只保留在当前运行，本机存档保存的是单个世界。</p>
        <p className={`break-words text-xs ${previewTick === null ? 'text-emerald-200' : 'text-amber-200'}`}>
          {previewTick === null
            ? `当前分支：${current?.label ?? '无'} · 实时状态`
            : preview ? `历史只读：${current?.label ?? '无'} · Tick #${preview.tick} · 仙历 ${preview.world.year} 年 ${preview.world.month} 月`
              : '所选快照已不在保存窗口，请返回当前。'}
        </p>
        {sourceName && current?.forkTick !== undefined && (
          <p className="break-words text-xs text-slate-400">从「{sourceName}」的 Tick #{current.forkTick} 分出</p>
        )}
      </header>
      <div className="flex flex-wrap items-end gap-2 rounded border border-slate-800 bg-slate-950/60 p-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs text-slate-300">已保留分支
          <select value={branchId ?? ''} disabled={timelineLocked || timeline.branches.length === 0} className={control}
            onChange={(event) => { setRequestedBranch(event.currentTarget.value); setPending(undefined); }}>
            {timeline.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.label}{branch.id === current?.id ? '（当前）' : ''}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={timelineLocked || !branchId || branchId === current?.id} className={button} onClick={() => {
          if (!branchId) return;
          setPending(undefined);
          setTarget(undefined);
          setRequestedBranch(undefined);
          onSelectBranch(branchId);
        }}>切换至此分支</button>
      </div>
      <div className="space-y-1.5 rounded border border-slate-800 bg-slate-950/60 p-2">
        <label className="grid gap-1 text-xs text-slate-300">历史刻度
          <input type="range" min={0} max={Math.max(0, snapshots.length - 1)} step={1}
            value={Math.max(0, selectedIndex)} disabled={timelineLocked || snapshots.length < 2}
            aria-valuetext={selectedIndex < 0 ? '未选到快照' : `Tick #${snapshots[selectedIndex]?.tick}`}
            onChange={(event) => {
              const frame = snapshots[Number(event.currentTarget.value)];
              if (!frame) return;
              setPending(undefined);
              setTarget(undefined);
              onPreview(frame.tick);
            }}
            className="w-full accent-violet-400" />
        </label>
        {snapshots.length > 0 && (
          <div className="flex justify-between gap-2 text-[11px] text-slate-400">
            <span>最早 Tick #{snapshots[0].tick}</span>
            <span>最新 Tick #{snapshots[snapshots.length - 1].tick}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={button} disabled={timelineLocked || previewTick !== null || snapshots.length === 0}
            onClick={() => { const latest = snapshots.at(-1); if (latest) onPreview(latest.tick); }}>查看最新快照</button>
          <button type="button" className={button} disabled={timelineLocked || previewTick === null}
            onClick={() => { setPending(undefined); setTarget(undefined); onPreview(null); }}>返回实时状态</button>
        </div>
      </div>
      {preview && (
        <form className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2" aria-label="历史分支干预"
          onSubmit={(event) => {
            event.preventDefault();
            if (!current || !command || !canFork || timelineLocked) return;
            setPending({ branchId: current.id, tick: preview.tick, baseline: preview.world, command,
              summary: `${INTERVENTIONS[intervention].title} → ${selectedTarget?.name ?? '该分支世界'}` });
          }}>
          <p className="text-xs text-slate-300">从查看中的历史刻分出新世界。干预只施于新分支，原时间线保持不变。</p>
          {!canFork && <p className="text-xs text-amber-200">分支上限已到，仍可查看或切换已有分支。</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-xs text-slate-300">天道干预
              <select className={control} value={intervention} disabled={timelineLocked || !canFork || !!pending}
                onChange={(event) => {
                  const type = event.currentTarget.value;
                  if (Object.hasOwn(INTERVENTIONS, type)) { setIntervention(type as Intervention); setTarget(undefined); }
                }}>
                {(Object.keys(INTERVENTIONS) as Intervention[]).map((type) => <option key={type} value={type}>{INTERVENTIONS[type].title}</option>)}
              </select>
            </label>
            {INTERVENTIONS[intervention].target === 'world' ? <p className="self-center text-xs text-slate-400">范围：仅新分支世界，不需指定对象。</p> : (
              <label className="grid min-w-0 gap-1 text-xs text-slate-300">此刻的有效对象
                <select className={control} value={selectedTarget?.id ?? ''} disabled={timelineLocked || !canFork || !!pending || targets.length === 0}
                  onChange={(event) => setTarget(event.currentTarget.value)}>
                  {!selectedTarget && <option value="">请选择历史对象</option>}
                  {targets.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            )}
          </div>
          <button type="submit" className={button} disabled={timelineLocked || !command || !canFork || !!pending}>准备创建分支</button>
        </form>
      )}
      {pending && (
        <section aria-label="确认创建时间分支" className="space-y-1.5 rounded border border-amber-500/60 bg-amber-950/50 p-2 text-xs text-amber-100">
          {pendingStillCurrent
            ? <p>从「{current?.label}」Tick #{pending.tick} 分叉：{pending.summary}。原线不受影响。</p>
            : <p>当前分支或快照已变化，本次不会执行。</p>}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={button} disabled={timelineLocked || !pendingStillCurrent || !canFork} onClick={() => {
              if (!pendingStillCurrent || timelineLocked || !canFork) return;
              setPending(undefined);
              onFork(pending.branchId, pending.tick, pending.command);
            }}>确认并进入新分支</button>
            <button type="button" className={control} onClick={() => setPending(undefined)}>取消</button>
          </div>
        </section>
      )}
      {fastForward && <FastForwardPanel controls={fastForward} timeline={timeline} branchLimit={!canFork} blocked={busy || previewTick !== null || !!pending} />}
      {notice && <p role="status" className="break-words text-xs text-violet-200">{notice}</p>}
    </section>
  );
}

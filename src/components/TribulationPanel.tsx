import type { Cultivator } from '../types/world';

type Trial = NonNullable<Cultivator['tribulation']>;

export const TRIAL_STAGE: Record<Trial['stage'], { label: string; color: string }> = {
  lightning: { label: '雷劫', color: 'text-sky-300' },
  heart_demon: { label: '心魔劫', color: 'text-violet-300' },
  passed: { label: '已渡过', color: 'text-emerald-300' },
  failed: { label: '渡劫失败', color: 'text-rose-300' },
};

export function isActiveTrial(trial: Trial | undefined): boolean {
  return trial?.stage === 'lightning' || trial?.stage === 'heart_demon';
}

export function TribulationPanel({ cultivator }: { cultivator: Cultivator }) {
  const trial = cultivator.tribulation;
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="天劫与心魔劫">
      <h4 className="text-xs font-semibold text-slate-200">天劫与心魔劫</h4>
      {!trial ? (
        <p className="rounded border border-dashed border-slate-700 p-2 text-xs text-slate-400">尚无渡劫记录。</p>
      ) : (
        <article className="rounded border border-slate-800/80 bg-slate-950/70 p-2 space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-200">冲击{trial.targetRealm}</span>
            <span className={TRIAL_STAGE[trial.stage].color}>{TRIAL_STAGE[trial.stage].label}</span>
            {!cultivator.alive && <span className="text-slate-400">陨落留档</span>}
          </div>
          {cultivator.alive && trial.stage === 'lightning' && (
            <p className="text-sky-200">下一道雷劫：{trial.nextWave}/{trial.totalWaves}</p>
          )}
          {cultivator.alive && trial.stage === 'heart_demon' && (
            <p className="text-violet-200">当前考验：心魔 · 已历 {trial.totalWaves} 道雷劫</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              {isActiveTrial(trial) && cultivator.alive ? '当前劫压' : '记录劫压'} {trial.pressure}/100
              <meter aria-label="劫压" className="h-2 w-14" min={0} max={100} value={trial.pressure} />
            </span>
            <span>受扰 {trial.interruptions} 次</span>
            <span>始于 Tick #{trial.startedTick}</span>
            {trial.resolvedTick !== undefined && <span>结于 Tick #{trial.resolvedTick}</span>}
          </div>
          {trial.lastOutcome && (
            <p className="text-[11px] text-slate-300 break-words">最近结果：{trial.lastOutcome}</p>
          )}
        </article>
      )}
    </section>
  );
}

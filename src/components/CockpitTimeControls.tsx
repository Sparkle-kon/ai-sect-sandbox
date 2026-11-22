import {ArrowRight,Clock3,History,Pause,Play,Undo2} from 'lucide-react';

export interface CockpitTimeControlsProps {
  date:{year:number;month:number};
  historical:boolean;
  running:boolean;
  busy:boolean;
  onStep:()=>void;
  onToggleAutoplay:()=>void;
  onReturnLive:()=>void;
  onOpenTimeline:()=>void;
}

const button='inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-50';
const secondary='border-slate-700/90 bg-slate-950/70 text-slate-200 enabled:hover:border-cyan-700 enabled:hover:bg-slate-800';
const icon='h-4 w-4 shrink-0';

/** The cockpit exposes the existing clock commands; all simulation remains in the parent. */
export function CockpitTimeControls({
  date,historical,running,busy,onStep,onToggleAutoplay,onReturnLive,onOpenTimeline,
}:CockpitTimeControlsProps){
  return <section aria-label="天道推演" className="min-w-0 space-y-2 rounded-xl border border-cyan-900/75 bg-slate-950/80 p-2.5">
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5 text-cyan-100">
        <Clock3 aria-hidden="true" className={icon}/>
        <p className="break-words text-sm font-semibold tabular-nums">仙历 {date.year}年{date.month}月</p>
      </div>
      <p role="status" className={historical
        ? 'rounded border border-amber-700/60 bg-amber-950/60 px-1.5 py-0.5 text-xs text-amber-200'
        : 'rounded border border-emerald-800/70 bg-emerald-950/60 px-1.5 py-0.5 text-xs text-emerald-200'}>
        {historical?'历史回看 · 只读':'当前月'}{busy?' · 处理中':''}
      </p>
    </div>
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {historical?
        <button type="button" className={`${button} grow border-amber-500/60 bg-amber-950/70 text-amber-100 enabled:hover:bg-amber-900/70`}
          disabled={busy} onClick={onReturnLive}>
          <Undo2 aria-hidden="true" className={icon}/>回到当前
        </button>:
        <>
          <button type="button" disabled={busy||running} onClick={onStep}
            className={`${button} grow border-cyan-200 bg-cyan-200 text-slate-950 enabled:hover:bg-cyan-100`}>
            <ArrowRight aria-hidden="true" className={icon}/>推演一月
          </button>
          <button type="button" disabled={busy&&!running} onClick={onToggleAutoplay} aria-pressed={running}
            className={`${button} ${running?'border-amber-500/60 bg-amber-950/70 text-amber-100 enabled:hover:bg-amber-900/70':secondary}`}>
            {running?<Pause aria-hidden="true" className={icon}/>:<Play aria-hidden="true" className={icon}/>}
            {running?'暂停推演':'自动推演'}
          </button>
        </>}
      <button type="button" disabled={busy} onClick={onOpenTimeline} className={`${button} ${secondary}`}>
        <History aria-hidden="true" className={icon}/>时间线与快进
      </button>
    </div>
  </section>;
}

import { useId, type Ref } from 'react';

interface StoryFirstScene {
  title: string;
  paragraph: string;
  earlier?: boolean;
  /** Only set when the viewed native scene and earned lead have an exact checked relationship. */
  followsLead?: boolean;
}

interface StoryFirstHomeProps {
  scene?: StoryFirstScene;
  leadName?: string;
  playerName?: string;
  busy?: boolean;
  notice?: string;
  outcome?: string;
  calendar?: {year:number;month:number};
  moreRef?: Ref<HTMLButtonElement>;
  onContinue: () => void;
  onMore: () => void;
}

export function StoryFirstHome({ scene, leadName, playerName, busy = false, notice, outcome, calendar, moreRef, onContinue, onMore }: StoryFirstHomeProps) {
  const nextDescription = useId();
  return (
    <section aria-label="故事主页" className="mx-auto w-full min-w-0 max-w-xl px-4 pb-8 pt-4 text-slate-100 sm:px-6 sm:pt-8">
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="min-w-0">
          <h1 className="font-serif text-lg font-semibold tracking-wide text-amber-50">天道沙盒</h1>
          {calendar&&<p className="text-xs text-slate-400">仙历 {calendar.year} 年 {calendar.month} 月</p>}
        </div>
        <button ref={moreRef} type="button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onMore(); }}
          className="min-h-11 shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          更多
        </button>
      </header>
      <div aria-live="polite" aria-atomic="true" className="mt-4 space-y-3">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="text-sm font-semibold text-amber-200">{leadName ? `主角：${leadName}` : '主角未定'}</p>
          {!leadName && <p className="mt-0.5 text-sm leading-relaxed text-slate-300">先看群像。故事真正有了主线，这里才会写出主角。</p>}
        </div>
        <article aria-label={scene?.earlier ? '上一幕' : '当前故事'}
          className="min-w-0 space-y-2 rounded-2xl border border-amber-300/25 bg-slate-900/80 px-4 py-4 [overflow-wrap:anywhere] sm:px-6 sm:py-6">
          <p className="text-xs font-medium text-amber-200">{scene?.earlier ? '本月没有可读的新见闻 · 上一幕' : scene ? '眼下发生的事' : '本月见闻'}</p>
          <h2 className="font-serif text-2xl font-semibold leading-snug text-amber-50 sm:text-3xl">{scene?.title ?? '暂无新的公开见闻'}</h2>
          {scene ?
            scene.paragraph !== scene.title && <p className="font-serif text-base leading-7 text-slate-200 sm:text-lg">{scene.paragraph}</p>
            : <p className="font-serif text-base leading-7 text-slate-300">可以继续看下个月。</p>}
          {leadName && scene?.followsLead === false && <p className="text-xs text-slate-400">这一幕说的是别人，主线尚未换人。</p>}
        </article>
      </div>
      {playerName ? <p className="mt-3 text-sm leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
        你正在引导：<strong className="text-amber-100">{playerName}</strong>。从「更多」安排下月行动。
      </p> : <p className="mt-3 text-sm leading-relaxed text-slate-300">{leadName?'你在旁观。想替主角做一次决定，点「更多」。':'你在旁观，先看这群人的故事。'}</p>}
      {outcome&&<p role="status" className="mt-3 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-100 [overflow-wrap:anywhere]">{outcome}</p>}
      <div className="mx-auto mt-4 w-full min-w-0 max-w-xs text-center">
        <p id={nextDescription} className="mb-1.5 text-sm font-medium text-amber-200">看下个月 · 每次只过一月</p>
        <button type="button" aria-describedby={nextDescription} aria-disabled={busy || undefined}
          onClick={(event) => { if (!busy && event.detail <= 1) onContinue(); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); }}
          className="min-h-12 w-full rounded-lg bg-amber-300 px-4 py-2 text-base font-semibold text-amber-950 hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 aria-disabled:cursor-wait aria-disabled:opacity-60">继续</button>
        {(busy || notice) && <p role="status" className="mt-2 text-sm text-slate-300 [overflow-wrap:anywhere]">{busy ? '正在走到下个月…' : notice}</p>}
      </div>
    </section>
  );
}

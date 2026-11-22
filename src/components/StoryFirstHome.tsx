import { lazy, Suspense, useRef } from 'react';
import type { Cultivator, WorldState } from '../types/world';
import {PublicBondAside,type PublicBondArc} from './DramaticBondRead';
import { useId, type ReactNode, type Ref } from 'react';

const StoryHomeRecap=lazy(()=>import('./StoryHomeRecap'));

interface StoryFirstScene {
  title: string;
  paragraph: string;
  earlier?: boolean;
  /** Only set when the viewed native scene and earned lead have an exact checked relationship. */
  followsLead?: boolean;
}

interface StoryFirstHomeProps {
  scene?: StoryFirstScene;
  subplot?:PublicBondArc;
  branchScene?:ReactNode;
  recapContext?:{world:WorldState;scopeKey:string;viewer?:Cultivator};
  leadName?: string;
  playerName?: string;
  busy?: boolean;
  notice?: string;
  outcome?: string;
  calendar?: {year:number;month:number};
  moreRef?: Ref<HTMLButtonElement>;
  opening?:{title:string;intent?:string};
  onContinue: () => void;
  onMore: () => void;
}

export function StoryFirstHome({ scene, subplot, branchScene, recapContext, leadName, playerName, busy = false, notice, outcome, calendar, moreRef, opening, onContinue, onMore }: StoryFirstHomeProps) {
  const nextDescription = useId();
  const storyReader=useRef<HTMLElement>(null);
  const leadHeading=useId();
  return (
    <section ref={storyReader} aria-label="故事主页" className="mx-auto w-full min-w-0 max-w-lg px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-4 text-slate-100 sm:px-6 sm:pb-8 sm:pt-8">
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <h1 className="font-serif text-base font-semibold tracking-wide text-slate-100">天道沙盒</h1>
          {calendar&&<p className="mt-0.5 text-xs text-slate-400">仙历 {calendar.year} 年 {calendar.month} 月</p>}
        </div>
        <button ref={moreRef} type="button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onMore(); }}
          className="min-h-11 shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          走进故事
        </button>
      </header>
      {opening&&<div className="mt-3 border-l border-amber-400/55 pl-3 text-sm [overflow-wrap:anywhere]">
        <p className="font-semibold text-amber-100">{opening.title}</p>
        {opening.intent&&<p className="text-slate-300">{opening.intent}</p>}
      </div>}
      <div aria-live="polite" aria-atomic="true" className="mt-4 space-y-4">
        <section aria-labelledby={leadHeading} className="min-w-0 [overflow-wrap:anywhere]">
          <h2 id={leadHeading} className="font-serif text-2xl font-semibold leading-tight text-amber-100">
            {leadName ? `主角：${leadName}` : '主角未定'}
          </h2>
          {!leadName && !playerName && <p className="mt-1 text-sm leading-relaxed text-slate-300">你在旁观。故事暂由多位修士展开。</p>}
          {playerName ? <p className="mt-1 text-sm leading-relaxed text-slate-300">
            你正在引导：<strong className="text-amber-100">{playerName}</strong>。可在「走进故事」安排下月行动。
          </p> : leadName && <p className="mt-1 text-sm leading-relaxed text-slate-300">你在旁观。点「走进故事」查看能否以主角行动。</p>}
        </section>
        <article aria-label={scene?.earlier ? '上一幕' : '当前故事'}
          className="min-w-0 space-y-2 rounded-xl border border-slate-800 bg-slate-900/65 px-3.5 py-3.5 [overflow-wrap:anywhere] sm:px-5 sm:py-5">
          <p className="text-xs font-medium text-amber-200">{scene?.earlier ? '本月暂无新见闻 · 上一幕' : '本月见闻'}</p>
          <h2 data-chronicle-reader-heading className="font-serif text-xl font-semibold leading-snug text-amber-50 sm:text-2xl">{scene?.title ?? '暂无新的公开见闻'}</h2>
          {scene && scene.paragraph !== scene.title && <p className="font-serif text-base leading-7 text-slate-200"><span data-chronicle-paragraph-text>{scene.paragraph}</span></p>}
          {leadName && scene?.followsLead === false && <p className="text-xs leading-relaxed text-slate-400">这一幕说的是别人，主线尚未换人。</p>}
        </article>
      </div>
      {recapContext&&<Suspense fallback={null}><StoryHomeRecap {...recapContext} readerRef={storyReader}/></Suspense>}
      {branchScene&&<div className="mt-3 empty:hidden">{branchScene}</div>}
      {subplot&&<div className="mt-3"><PublicBondAside arc={subplot}/></div>}
      {outcome&&<p role="status" className="mt-3 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-100 [overflow-wrap:anywhere]">{outcome}</p>}
      <div data-story-next className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-950 px-[max(1rem,env(safe-area-inset-left))] pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-2.5 sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto w-full max-w-lg text-center">
          <button type="button" aria-describedby={nextDescription} aria-disabled={busy || undefined}
            onClick={(event) => { if (!busy && event.detail <= 1) onContinue(); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); }}
            className="min-h-12 w-full rounded-lg bg-amber-300 px-4 py-2 text-base font-semibold text-amber-950 hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 aria-disabled:cursor-wait aria-disabled:opacity-60">看下个月</button>
          <p id={nextDescription} className="mt-1 text-xs text-slate-300">每次只过一月</p>
          {(busy || notice) && <p role="status" className="mt-1 max-h-16 overflow-auto text-sm text-slate-300 [overflow-wrap:anywhere]">{busy ? '正在走到下个月…' : notice}</p>}
        </div>
      </div>
    </section>
  );
}

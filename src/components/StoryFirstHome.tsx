import type { Ref } from 'react';

interface StoryFirstScene {
  title: string;
  paragraph: string;
  earlier?: boolean;
}

interface StoryFirstHomeProps {
  scene?: StoryFirstScene;
  leadName?: string;
  busy?: boolean;
  notice?: string;
  moreRef?: Ref<HTMLButtonElement>;
  onContinue: () => void;
  onMore: () => void;
}

export function StoryFirstHome({ scene, leadName, busy = false, notice, moreRef, onContinue, onMore }: StoryFirstHomeProps) {
  return (
    <section aria-label="故事主页" className="mx-auto w-full min-w-0 max-w-xl px-4 pb-8 pt-4 text-slate-100 sm:px-6 sm:pt-8">
      <header className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="min-w-0 font-serif text-base font-semibold tracking-widest text-slate-300">天道沙盒</h1>
        <button ref={moreRef} type="button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onMore(); }}
          className="min-h-11 shrink-0 rounded-md border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          更多
        </button>
      </header>
      <div aria-live="polite" aria-atomic="true" className="mt-5 space-y-3">
        <p className="min-w-0 text-sm font-semibold text-amber-200 [overflow-wrap:anywhere]">
          {leadName ? `主角：${leadName}` : '主角未定'}
        </p>
        <article aria-label={scene?.earlier ? '上一幕' : '当前故事'}
          className="min-w-0 space-y-2 rounded-2xl border border-amber-300/20 bg-slate-900/80 px-4 py-4 [overflow-wrap:anywhere] sm:px-6 sm:py-6">
          {scene?.earlier && <p className="text-sm text-slate-300">这一回没有新见闻。上一幕：</p>}
          <h2 className="font-serif text-xl font-semibold leading-snug text-amber-50 sm:text-2xl">{scene?.title ?? '山中暂静'}</h2>
          {scene ?
            scene.paragraph !== scene.title && <p className="font-serif text-base leading-7 text-slate-200 sm:text-lg">{scene.paragraph}</p>
            : <p className="font-serif text-base leading-7 text-slate-300">这一回没有新的公开见闻。</p>}
        </article>
      </div>
      <div className="mx-auto mt-4 w-full min-w-0 max-w-xs text-center">
        <button type="button" aria-disabled={busy || undefined} onClick={(event) => { if (!busy && event.detail <= 1) onContinue(); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); }}
          className="min-h-12 w-full rounded-lg bg-amber-300 px-4 py-2 text-base font-semibold text-amber-950 hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 aria-disabled:cursor-wait aria-disabled:opacity-60">继续</button>
        {(busy || notice) && <p role="status" className="mt-2 text-sm text-slate-300 [overflow-wrap:anywhere]">{busy ? '正在翻页…' : notice}</p>}
      </div>
    </section>
  );
}

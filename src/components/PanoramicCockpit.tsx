import {useId,type ReactNode} from 'react';
import {Compass,Hourglass,Network,ScrollText,Sparkles,UserRound} from 'lucide-react';

export interface PanoramicCockpitProps {
  map:ReactNode;
  timeControls:ReactNode;
  stage:ReactNode;
  inspector:ReactNode;
  relationships:ReactNode;
  chronicle:ReactNode;
}

const surface='xianxia-frame min-w-0 rounded-2xl border border-amber-200/15 bg-[#121720]/95 shadow-[0_12px_48px_#05070b80]';
const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';
const detailBody='min-w-0 rounded-sm xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]';
const detailSlot='min-w-0 space-y-2 p-2 sm:p-3 xl:flex xl:min-h-0 xl:flex-col';
const panelTitle='min-w-0 text-sm font-semibold tracking-[0.12em] text-amber-100';

export function PanoramicCockpit({map,timeControls,stage,inspector,relationships,chronicle}:PanoramicCockpitProps){
  const id=useId();
  return <section aria-labelledby={`${id}-title`}
    className="xianxia-frame relative isolate mx-auto w-full min-w-0 max-w-[192rem] rounded-[1.5rem] border border-amber-200/20 bg-[#0b1019] p-2 text-slate-100 sm:p-4 2xl:p-6">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[radial-gradient(ellipse_at_15%_0%,#41443350,transparent_49%),radial-gradient(ellipse_at_75%_8%,#27244b65,transparent_44%)]"/>
    <header className="relative mb-3 flex min-w-0 flex-wrap items-end justify-between gap-x-5 gap-y-2 border-b border-amber-100/15 px-2 pb-3 sm:mb-4 sm:px-3">
      <div className="min-w-0">
        <p aria-hidden="true" className="mb-1 text-[0.65rem] font-semibold tracking-[0.36em] text-amber-200/75">天道观世</p>
        <h2 id={`${id}-title`} className="font-serif text-2xl font-semibold tracking-[0.13em] text-amber-50 sm:text-3xl">全息大盘</h2>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-slate-300">看九州局势，追眼前一幕，再看人物为何走到这一步。</p>
    </header>

    <div data-cockpit-layout className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,57fr)_minmax(0,43fr)] xl:grid-cols-[minmax(0,47fr)_minmax(0,28fr)_minmax(0,25fr)] xl:gap-4 2xl:gap-5">
      <section aria-labelledby={`${id}-map`} className={`${surface} overflow-hidden`}>
        <header className="flex min-w-0 items-center gap-2.5 border-b border-teal-200/15 bg-gradient-to-r from-teal-400/15 to-transparent px-3 py-3 sm:px-4">
          <Compass size={17} aria-hidden="true" className="shrink-0 text-teal-200"/>
          <h3 id={`${id}-map`} className={panelTitle}>九州山河</h3>
        </header>
        <div role="group" aria-labelledby={`${id}-time`}
          className="min-w-0 space-y-2 border-b border-teal-200/15 bg-[#12201f] px-2 py-2 sm:px-3">
          <h4 id={`${id}-time`} className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-teal-100">
            <Hourglass size={13} aria-hidden="true" className="shrink-0"/>时间推演
          </h4>
          <div className="min-w-0 [&>div]:min-w-0">{timeControls}</div>
        </div>
        <div className="min-w-0 py-1 sm:p-2 [&>div]:min-w-0">{map}</div>
      </section>

      <section aria-labelledby={`${id}-stage`} className={`${surface} border-rose-200/20`}>
        <header className="flex min-w-0 items-center gap-2.5 rounded-t-2xl border-b border-rose-200/15 bg-gradient-to-r from-rose-500/15 to-transparent px-3 py-3 sm:px-4">
          <Sparkles size={17} aria-hidden="true" className="shrink-0 text-rose-200"/>
          <h3 id={`${id}-stage`} className={panelTitle}>戏剧舞台</h3>
        </header>
        <div className="min-w-0 p-2 [overflow-wrap:anywhere] sm:p-3 [&>div]:min-w-0">{stage}</div>
      </section>

      <aside aria-labelledby={`${id}-detail`} className={`${surface} border-indigo-200/20 lg:col-span-2 xl:col-span-1`}>
        <header className="flex min-w-0 items-center gap-2.5 rounded-t-2xl border-b border-indigo-200/15 bg-gradient-to-r from-indigo-500/15 to-transparent px-3 py-3 sm:px-4">
          <UserRound size={17} aria-hidden="true" className="shrink-0 text-indigo-200"/>
          <h3 id={`${id}-detail`} className={panelTitle}>人物与因果</h3>
        </header>
        <div role="group" aria-label="人物详情、关系与纪事"
          className={`min-w-0 divide-y divide-indigo-100/10 rounded-b-xl [overflow-wrap:anywhere] lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0 xl:grid-cols-1 xl:divide-x-0 xl:divide-y xl:h-[max(37rem,calc(100dvh-13rem))] xl:grid-rows-[minmax(0,1fr)_minmax(0,1.12fr)_minmax(0,1fr)]`}>
          <section aria-labelledby={`${id}-inspector`} className={detailSlot}>
            <h4 id={`${id}-inspector`} className="text-xs font-semibold tracking-widest text-indigo-100">修士识海</h4>
            <div role="region" aria-labelledby={`${id}-inspector`} tabIndex={0} className={`${detailBody} ${focus}`}>{inspector}</div>
          </section>
          <section aria-labelledby={`${id}-relationships`} className={detailSlot}>
            <h4 id={`${id}-relationships`} className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-indigo-100">
              <Network size={13} aria-hidden="true" className="shrink-0"/>因果关系
            </h4>
            <div role="region" aria-labelledby={`${id}-relationships`} tabIndex={0} className={`${detailBody} ${focus}`}>{relationships}</div>
          </section>
          <section aria-labelledby={`${id}-chronicle`} className={detailSlot}>
            <h4 id={`${id}-chronicle`} className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-indigo-100">
              <ScrollText size={13} aria-hidden="true" className="shrink-0"/>实时纪事
            </h4>
            <div role="region" aria-labelledby={`${id}-chronicle`} tabIndex={0} className={`${detailBody} ${focus}`}>{chronicle}</div>
          </section>
        </div>
      </aside>
    </div>
  </section>;
}

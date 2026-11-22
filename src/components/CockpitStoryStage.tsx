import {PublicBondAside,type PublicBondArc} from './DramaticBondRead';
import {useId, useMemo,type ReactNode} from 'react';
import {publicChronicleSceneEvents} from '../engine/chronicleLead';
import {writePublicChronicleScene} from '../engine/chroniclePublicProse';
import {projectStoryHomepage} from '../engine/storyHomepage';
import type {WorldEvent,WorldState} from '../types/world';

const highlights={
  combat:{label:'交锋',rank:6}, intrigue:{label:'波澜',rank:3}, diplomacy:{label:'相逢与往来',rank:2},
  breakthrough:{label:'破境',rank:5}, death:{label:'离别',rank:7}, heavenly:{label:'天象',rank:1},
} satisfies Record<WorldEvent['category'],{label:string;rank:number}>;

function excerpt(text:string,limit:number){
  const clean=text.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim();
  const glyphs=[...clean];
  if(glyphs.length<=limit)return clean;
  const prefix=glyphs.slice(0,limit-1).join('');
  const end=Math.max(prefix.lastIndexOf('。'),prefix.lastIndexOf('！'),prefix.lastIndexOf('？'));
  return end>=prefix.length*.58?prefix.slice(0,end+1):prefix.trimEnd()+'…';
}

export function projectCockpitStoryStage(world:WorldState) {
  const home=projectStoryHomepage(world);
  const counts=new Map<string,number>();
  for(const fact of world.events)counts.set(fact.id,(counts.get(fact.id)??0)+1);
  const current=publicChronicleSceneEvents(world).filter(fact=>counts.get(fact.id)===1&&
    fact.tick===world.tick&&fact.year===world.year&&fact.month===world.month);
  const currentScene=current.find(event=>event.id===home.scene?.eventId);
  const others=current.flatMap((fact,index)=>{
    if(fact===currentScene)return [];
    const story=writePublicChronicleScene(fact);
    const title=excerpt(story.title,42),paragraph=excerpt(story.paragraph,105);
    return title&&paragraph&&title!==home.scene?.title?
      [{eventId:fact.id,category:fact.category,title,paragraph,index}]:[];
  }).sort((a,b)=>highlights[b.category].rank-highlights[a.category].rank||a.index-b.index);
  const visited=new Set<string>();
  const focus=others.filter(story=>{
    if(visited.has(story.title))return false;
    visited.add(story.title);return true;
  }).slice(0,3);
  return {...home,...(currentScene?{currentLabel:highlights[currentScene.category].label}:{}),focus};
}

export function CockpitStoryStage({world,onFocus,subplot,branchScene}:{
  world:WorldState;
  subplot?:PublicBondArc;
  branchScene?:ReactNode;
  /** The parent rechecks the current frame and opens this exact public event if still authorized. */
  onFocus?:(eventId:string)=>void;
}){
  const view=useMemo(()=>projectCockpitStoryStage(world),[world]);
  const stage=useId(),focus=useId();
  const scene=view.scene;
  const eventTitle='min-h-11 w-full rounded-lg text-left font-serif font-semibold text-amber-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 [overflow-wrap:anywhere]';
  return <section aria-labelledby={stage} className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={stage} className="font-serif text-lg font-semibold text-amber-50">今月戏台</h2>
      <p className="text-xs text-slate-400">仙历 {view.calendar.year} 年 {view.calendar.month} 月</p>
    </header>
    <article aria-label={scene?.earlier?'上一幕':'本月公开一幕'}
      className="relative isolate min-w-0 space-y-4 overflow-hidden rounded-2xl border border-amber-600/40 bg-gradient-to-br from-amber-950/60 via-slate-950 to-slate-950 p-4 xl:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 -z-10 h-36 w-36 rounded-full border border-amber-400/15 shadow-[0_0_4rem_rgba(251,191,36,.12)]" />
      <div className="space-y-1 border-b border-amber-200/20 pb-3">
        <p className="text-xs font-medium tracking-widest text-amber-200">主线人物</p>
        <h3 className="font-serif text-2xl font-semibold leading-tight text-amber-50">{view.lead?`主角：${view.lead.name}`:'主角未定'}</h3>
        {!view.lead&&<p className="text-sm leading-relaxed text-slate-300">此时仍是群像，尚无人走成主角。</p>}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-amber-200">{scene?.earlier?'本月暂无新见闻 · 上一幕':view.currentLabel?`本月公开一幕 · ${view.currentLabel}`:'本月公开一幕'}</p>
        <h4 className="font-serif text-xl font-semibold leading-snug text-amber-50">
          {scene&&!scene.earlier&&view.currentLabel&&onFocus?
            <button type="button" className={eventTitle} aria-label={`读本月一幕：${scene.title}`} onClick={()=>onFocus(scene.eventId)}>{scene.title}</button>:
            scene?.title??'帷幕未开'}
        </h4>
        {scene&&scene.paragraph!==scene.title?
          <p className="font-serif text-base leading-7 text-slate-200">{scene.paragraph}</p>:!scene?
            <p className="text-sm leading-relaxed text-slate-300">尚无可公开讲述的新进展。</p>:null}
        {view.lead&&scene?.followsLead===false&&<p className="text-xs leading-relaxed text-slate-400">这一幕另有人登场，主线并未换人。</p>}
      </div>
    </article>
    {branchScene}
    <PublicBondAside arc={subplot}/>
    <section aria-labelledby={focus} className="space-y-2">
      <h3 id={focus} className="font-serif text-base font-semibold text-amber-50">本月波澜</h3>
      {view.focus.length===0?
        <p className="rounded-lg border border-slate-800 px-3 py-2 text-sm leading-relaxed text-slate-400">没有别的公开奇遇或冲突可读。</p>:
        <ol className="space-y-2">
          {view.focus.map(story=><li key={story.eventId} className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
            <p className="text-xs font-medium text-amber-200">{highlights[story.category].label}</p>
            <h4 className="font-serif font-semibold text-amber-100">
              {onFocus?<button type="button" className={eventTitle} aria-label={`读本月波澜：${story.title}`} onClick={()=>onFocus(story.eventId)}>{story.title}</button>:story.title}
            </h4>
            {story.paragraph!==story.title&&<p className="font-serif text-sm leading-6 text-slate-300">{story.paragraph}</p>}
          </li>)}
        </ol>}
    </section>
  </section>;
}

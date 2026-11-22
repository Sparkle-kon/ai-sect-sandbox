import {useId} from 'react';
import type {FrontierNightHuntOption,FrontierNightHuntOutcome,FrontierNightHuntView} from '../types/frontierNightHunt';

const words={
  trace:['查迹','看清脚下留下了什么，再辨来路。'],
  wait:['守候','留在此处等一等，不预断会遇见什么。'],
  return:['安返','转身寻归路，是否走脱要看这一程。'],
} as const;

const aftermath:Record<FrontierNightHuntOutcome,string>={
  found:'这回看清了足印。',
  obscured:'这回未能辨清足印。',
  quiet:'等了一回，终未接敌。',
  contact:'这一回确实撞上了。',
};

export function FrontierNightHuntCard({view,siteName,busy=false,notice,onChoose}:{
  view:FrontierNightHuntView;
  siteName?:string;
  busy?:boolean;
  notice?:string;
  onChoose?:(option:FrontierNightHuntOption)=>void;
}) {
  const heading=useId();
  const hasScene=Boolean(view.options.length||view.last||view.observed);
  if(!hasScene&&!notice)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-cyan-200/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-cyan-200">{siteName&&`${siteName} · `}{view.weather.kind}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-cyan-50">雪谷夜行</h3>
    </header>
    {hasScene&&(view.observed?<p className="font-serif text-sm leading-relaxed text-cyan-100">此处确曾辨得妖兽足迹。脚印仍只是脚印，不等于见了真身。</p>:
      <p className="font-serif text-sm leading-relaxed text-slate-200">天色已晚，这一步该如何走？</p>)}
    {view.last&&<section aria-label="夜行实录" className="space-y-1 text-sm text-slate-200">
      <p>{words[view.last.move][0]}：{aftermath[view.last.outcome]}</p>
      {view.last.paidQi>0&&<p>耗去 {view.last.paidQi} 点真气。</p>}
      {view.last.damage>0&&<p>自身受伤 {view.last.damage} 点。</p>}
      {view.last.beastDamage>0&&view.observed&&<p>实伤妖兽 {view.last.beastDamage} 点。</p>}
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="如何夜行" className="grid gap-1.5 sm:grid-cols-3">
      {view.options.map(option=><button key={option.frontierNightHuntMove} type="button" disabled={busy}
        className="min-h-11 w-full rounded-md border border-cyan-200/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-cyan-50 hover:bg-cyan-950/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
        {words[option.frontierNightHuntMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.frontierNightHuntMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一程尚未落定。</p>}
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}

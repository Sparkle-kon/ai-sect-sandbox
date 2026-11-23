import {useId} from 'react';
import type {WildMigrationOption,WildMigrationView} from '../engine/wildMigration';

const words={
  let_pass:['让行','不挡眼前的去路；是否经过，还要看实际行踪。'],
  track:['察迹','只查眼前的痕迹，不据此断言另一地有什么。'],
  drive:['驱离','试着从眼前驱走，不预断它会退往何处。'],
} as const;

export function WildMigrationStoryCard({view,busy=false,onChoose}:{
  view:WildMigrationView;
  busy?:boolean;
  onChoose?:(option:WildMigrationOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-emerald-300/25 bg-gradient-to-br from-emerald-950/35 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-emerald-200">{view.siteName}{view.weather&&` · ${view.weather.season} · ${view.weather.kind}`}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-emerald-50">山野过客</h3>
    </header>
    {!view.receipt&&(view.localKind?<p className="font-serif text-sm leading-relaxed text-slate-200">眼前见得{view.localKind}。至于它往哪处去，只认已经走过的路。</p>:
      <p className="font-serif text-sm leading-relaxed text-slate-200">此地尚未亲见。能知道的，只在脚边。</p>)}
    {view.receipt&&<section aria-label="迁行实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-emerald-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="眼前如何应对" className="grid gap-1.5 sm:grid-cols-3">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-emerald-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-emerald-50 hover:bg-emerald-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.wildMigrationMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.wildMigrationMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

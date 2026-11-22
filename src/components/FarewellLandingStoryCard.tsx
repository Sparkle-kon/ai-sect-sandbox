import {useId} from 'react';
import type {FarewellLandingOption,FarewellLandingView} from '../engine/farewellLanding';

const words={
  keep_light:['守灯','花一块灵石，在岸上守一盏灯。'],
  farewell:['作别','在此向故人作别，不点灯，也不离开脚下这方岸。'],
} as const;

export function FarewellLandingStoryCard({view,busy=false,onChoose}:{
  view:FarewellLandingView;
  busy?:boolean;
  onChoose?:(option:FarewellLandingOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-indigo-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">夜泊，向故人作别</h3>
    </header>
    {!view.receipt&&<p className="font-serif text-sm leading-relaxed text-slate-200">到了水岸，想起曾亲识的{view.deceasedName}。这一声作别，只需自己听见。</p>}
    {view.receipt&&<section aria-label="泊岸实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="如何向故人作别" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map(option=><button key={option.farewellLandingMove} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.farewellLandingMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.farewellLandingMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕尚未落定。</p>}
  </section>;
}

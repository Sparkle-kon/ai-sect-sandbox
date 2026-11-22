import {useId} from 'react';
import type {FrontierGorgeOption,FrontierGorgeView} from '../engine/frontierGorge';

const words={
  wait:['等风','先在此歇脚。风势何时转弱，还要看后来。'],
  detour:['绕行','试走当前可踏的一步，不预断整条路都通。'],
} as const;

export function FrontierGorgeStoryCard({view,busy=false,onChoose}:{
  view:FrontierGorgeView;
  busy?:boolean;
  onChoose?:(option:FrontierGorgeOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-cyan-200/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-cyan-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-cyan-50">峡口这一步</h3>
    </header>
    {view.weather&&<p className="font-serif text-sm leading-relaxed text-slate-200">此刻峡口起了罡风，风向{view.weather.bearing==='east'?'东':'西'}。</p>}
    {view.receipt&&<section aria-label="峡路实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-cyan-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="此刻如何过峡" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map(option=><button key={option.frontierGorgeMove} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-cyan-200/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-cyan-50 hover:bg-cyan-950/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.frontierGorgeMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.frontierGorgeMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">此步尚未落定。</p>}
  </section>;
}

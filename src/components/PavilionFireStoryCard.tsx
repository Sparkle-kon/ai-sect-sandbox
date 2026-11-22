import {useId} from 'react';
import type {PavilionFireOption,PavilionFireView} from '../engine/pavilionFire';

const words={
  salvage:['救卷','抢出这一册，须沿可行之路离开火场。'],
  ward:['护人','留在火中，用真气护住一个确在场的人。此举不替人撤离。'],
  leave:['撤走','循可行之路离开。是否到了安全处，以实际行止为准。'],
  secure:['安置救出的卷册','把实际带出的这一册交到可收存处。'],
} as const;

export function PavilionFireStoryCard({view,busy=false,labelOption,onChoose}:{
  view:PavilionFireView;
  busy?:boolean;
  onChoose?:(option:PavilionFireOption)=>void;
  labelOption?:(option:PavilionFireOption)=>string|undefined;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-100">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">藏经阁起火</h3>
    </header>
    {view.receipt?<section aria-label="火场实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">火已到了阁里。此刻能顾住什么，只看在场的人与眼前的路。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="火场中如何行动" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.pavilionFireMove][0]}
        {labelOption&&<span className="pl-1 text-xs text-amber-200">{labelOption(option)}</span>}
        <span className="block text-xs leading-relaxed text-slate-300">{words[option.pavilionFireMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

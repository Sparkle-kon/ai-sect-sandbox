import {useId} from 'react';
import type {MercyReunionOption,MercyReunionView} from '../engine/mercyReunion';

const words={
  stand_down:['这次且不拔剑','只收自己的兵刃，不替对方答应和解。'],
  aid:['提议同行','只提议同走安全的一步。对方须另作答复，眼下并未同行。'],
  accept_aid:['答应同走这一步','只应下眼前这一程，不等于尽释旧怨。'],
  challenge:['当面再战','按眼前情形发起斗法，不预断输赢。'],
} as const;

const button='min-h-[44px] w-full min-w-0 rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

export function MercyReunionStoryCard({view,busy=false,onChoose}:{
  view:MercyReunionView;
  busy?:boolean;
  onChoose?:(option:MercyReunionOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">旧剑未落，今朝再逢</h3>
    </header>
    {!view.receipt&&<p className="font-serif text-sm leading-relaxed text-slate-200">又见{view.otherName}。那一回剑下收住了手，这一回的话还没说出口。</p>}
    {view.receipt&&<section aria-label="重逢实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="重逢时如何应对" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy} className={button}
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.mercyReunionMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.mercyReunionMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕尚未落定。</p>}
  </section>;
}

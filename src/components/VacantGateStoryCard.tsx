import {useId} from 'react';
import type {VacantGateOption,VacantGateView} from '../engine/vacantGate';

const choices={
  guard:['守住山门','若敌军确已压阵，此举能挡下一击时，才耗八点真气。'],
  withdraw:['请撤，自己先走','请在场同门退往眼下准许的邻地。你只替自己决定，旁人未必应下。'],
} as const;

export function VacantGateStoryCard({view,busy=false,onChoose}:{
  view:VacantGateView;
  busy?:boolean;
  onChoose?:(option:VacantGateOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt&&!view.notice)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">山门前，缺了一席</h3>
    </header>
    {view.notice&&<p aria-label="山门撤离请求" className="border-l border-amber-300/35 pl-2 font-serif text-sm leading-relaxed text-amber-100">{view.notice}</p>}
    {view.receipt?<section aria-label="本人的山门实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:view.options.length>0&&<p className="font-serif text-sm leading-relaxed text-slate-200">
      {view.lostRole==='leader'?'掌门已不在了':'原守阵人已不在了'}。眼下只须决定自己留守，还是寻路撤去。
    </p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="山门前如何行动" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {choices[option.vacantGateMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{choices[option.vacantGateMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">此步尚未落定。</p>}
  </section>;
}

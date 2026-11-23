import {useId} from 'react';
import type {PilgrimageForkOption,PilgrimageForkView} from '../engine/pilgrimageFork';

const copy={
  escort:['愿同走一步','只应下自己这一程。两人都实走同一段，才算同行。'],
  detour:['独走岔路','只试自己知道且眼下能走的岔路。是否走成，以实走为准。'],
  remain:['留在此处','只定自己的去留，不替同路人做决定。'],
} as const;

export function PilgrimageForkStoryCard({view,busy=false,onChoose}:{
  view:PilgrimageForkView;
  busy?:boolean;
  onChoose?:(option:PilgrimageForkOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt&&!view.sharedWalk)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-teal-300/25 bg-gradient-to-br from-teal-950/25 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-teal-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-teal-50">同路一夜，各望一山</h3>
    </header>
    {view.receipt?<section aria-label="行路实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-teal-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">在这段路上，两人确已照面。下一步是并肩还是分开，仍得各自作答。</p>}
    {view.sharedWalk&&<p className="font-serif text-sm leading-relaxed text-teal-100">这一轮，两人的脚印确实并在一段路上。下一程仍各自作数。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="这段路如何走" className="grid gap-1.5 sm:grid-cols-3">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-teal-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-teal-50 hover:bg-teal-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {copy[option.pilgrimageForkMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{copy[option.pilgrimageForkMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

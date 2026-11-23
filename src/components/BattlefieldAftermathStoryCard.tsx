import {useId} from 'react';
import type {BattlefieldAftermathOption,BattlefieldAftermathView} from '../engine/battlefieldAftermath';

const copy={
  remain:['留在此地','只作自己的打算，不替旁人定下去留。'],
  return:['循旧路回去','回往曾亲自到过的地方；能否成行，以此刻的路和实付代价为准。'],
  offer_care:['提议照料','先问对方愿不愿意。眼下还没施治。'],
  accept_care:['应下照料','答应这一次照料，不预断伤势会如何。'],
} as const;

export function BattlefieldAftermathStoryCard({view,busy=false,onChoose}:{
  view:BattlefieldAftermathView;
  busy?:boolean;
  onChoose?:(option:BattlefieldAftermathOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">战后拾愿</h3>
    </header>
    {view.receipt?<section aria-label="战后实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">战事过去了，来日仍要一步一步过。且从眼前能做的一件事起。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="战后如何自处" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {copy[option.battlefieldAftermathMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{copy[option.battlefieldAftermathMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

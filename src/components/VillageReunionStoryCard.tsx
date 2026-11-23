import {useId} from 'react';
import type {VillageReunionOption,VillageReunionView} from '../engine/villageReunion';

const copy={
  remember:['说起旧村','只叙确曾在同一村中住过的往事，不替对方说那时如何。'],
  part:['各走各的路','此处作别，不替彼此定下恩怨。'],
  offer:['提议结伴','先以一枚灵石作押，待对方另作答复；此刻尚未结伴，也没有动身。'],
  accept:['应下这番同行之约','只应眼前这一约，并不立刻动身，也不改变彼此的关系。'],
} as const;

export function VillageReunionStoryCard({view,busy=false,onChoose}:{
  view:VillageReunionView;
  busy?:boolean;
  onChoose?:(option:VillageReunionOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-teal-300/25 bg-gradient-to-br from-teal-950/30 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-teal-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-teal-50">旧村异途</h3>
    </header>
    {view.receipt?<section aria-label="旧村重逢实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-teal-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">两人都曾在{view.villageName}住过。如今在此照面，旧地可叙，往后的路却还由各人自己走。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="旧村重逢时如何应对" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-teal-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-teal-50 hover:bg-teal-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {copy[option.villageReunionMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{copy[option.villageReunionMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕尚未落定。</p>}
  </section>;
}

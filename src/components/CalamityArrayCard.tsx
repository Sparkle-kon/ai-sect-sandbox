import {useId,useState} from 'react';
import type {CalamityArrayOption} from '../engine/calamityArray';

export interface CalamityArrayCardView {
  siteName:string;
  options:readonly CalamityArrayOption[];
  queued?:CalamityArrayOption['calamityArrayStance'];
}
interface Props {
  view:CalamityArrayCardView;
  receipt?:{title:string;description:string};
  busy?:boolean;
  onChoose?:(option:CalamityArrayOption)=>boolean;
  onAdvance?:()=>boolean;
  onContinue?:()=>void;
}
const names={joint:'合守阵眼',local:'各守山门'} as const;
const focus='min-h-11 w-full min-w-0 rounded-md border border-amber-200/30 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

export function CalamityArrayCard({view,receipt,busy=false,onChoose,onAdvance,onContinue}:Props) {
  const id=useId();
  const [stale,setStale]=useState(false);
  const invoke=(attempt:()=>boolean)=>{if(!busy)setStale(!attempt());};
  if(!receipt&&!view.queued&&!view.options.length)return null;
  return <section aria-labelledby={id} className="min-w-0 space-y-2 rounded-lg border border-amber-200/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName}</p>
      <h3 id={id} className="font-serif text-lg font-semibold text-amber-50">瘴起，阵眼同望</h3>
    </header>
    {receipt?<div aria-label="守望实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{receipt.title}</p>
      <p className="text-slate-200">{receipt.description}</p>
    </div>:<>
      <p className="font-serif text-sm leading-relaxed text-slate-200">瘴气已经逼到本地。眼下要定的，是同守一处阵眼，还是照看原有山门。</p>
      {!view.queued&&onChoose&&<div role="group" aria-label="如何应对这场瘴灾" className="grid gap-1.5 sm:grid-cols-2">
        {view.options.map(option=><button key={option.calamityArrayStance} type="button" disabled={busy} className={focus}
          onClick={event=>{if(event.detail<=1)invoke(()=>onChoose(option));}}
          onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
          {names[option.calamityArrayStance]}
          <span className="block text-xs leading-relaxed text-slate-300">{option.calamityArrayStance==='joint'?
            '两边都须亲自应下并实到阵眼，才算合阵。':'不把本门的阵势交给合阵；本地能护住多少，要看实况。'}</span>
        </button>)}
      </div>}
      {view.queued&&<p className="text-xs text-amber-100">已记下「{names[view.queued]}」。瘴灾尚未结算，不能说已救下谁。</p>}
      {view.queued&&onAdvance&&<button type="button" disabled={busy} className={focus}
        onClick={event=>{if(event.detail<=1)invoke(onAdvance);}}>推进一月，守望此地</button>}
    </>}
    {receipt&&onContinue&&<button type="button" disabled={busy} className={focus} onClick={onContinue}>收起这一幕</button>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕正在落定。</p>}
    {stale&&!receipt&&<p role="status" className="text-xs text-amber-200">眼下情形已变，此步未成。</p>}
  </section>;
}

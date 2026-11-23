import {useId} from 'react';
import type {WitnessInquiryOption,WitnessInquiryView} from '../engine/witnessInquiry';

const button='min-h-11 w-full rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

export function WitnessInquiryCard({view,busy=false,onChoose}:{
  view:WitnessInquiryView;
  busy?:boolean;
  onChoose?:(option:WitnessInquiryOption)=>void;
}) {
  const heading=useId();
  const inspect=view.options.find(option=>option.witnessInquiryMove==='inspect');
  const witness=inspect?undefined:view.witness;
  const ask=witness?.canAsk&&!witness.reply
    ?view.options.find(option=>option.witnessInquiryMove==='ask'):undefined;
  const reply=witness?.reply;
  const renderButton=(option:WitnessInquiryOption,label:string)=>onChoose&&
    <button type="button" disabled={busy} className={button}
      onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
      onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>{label}</button>;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.venueName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">一纸指证，两处落眼</h3>
    </header>
    <section aria-label="公开指证" className="space-y-1 border-l border-amber-400/35 pl-2 text-sm leading-relaxed">
      <h4 className="font-semibold text-amber-100">一纸指证 <span className="font-normal text-slate-300">· {view.claim.reviewSettled?'已结案':'未经证实'}</span></h4>
      <p className="font-serif text-slate-200">{view.claim.text}</p>
      {inspect&&renderButton(inspect,'上前细看告示')}
    </section>
    {(ask||reply)&&witness?<section aria-label="原场所见" className="space-y-1 border-l border-cyan-300/30 pl-2 text-sm leading-relaxed">
      <h4 className="font-semibold text-cyan-100">原场所见</h4>
      {reply?<p className="font-serif text-slate-200">{reply.text}</p>:
        <p className="font-serif text-slate-200">{witness.name}亲历其场，此刻可当面相问。</p>}
      {ask&&renderButton(ask,'上前问其亲眼所见')}
    </section>:<p className="text-xs text-slate-300">{inspect?'先看告示，再谈相问。':'此刻没有可当面追问的见证。'}</p>}
    {reply&&<p className="text-xs text-slate-300">只记交手所见，不判谁有过。</p>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕尚未落定。</p>}
  </section>;
}

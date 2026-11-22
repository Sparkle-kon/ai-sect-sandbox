import { useEffect, useId, useRef, useState } from 'react';
import type { TournamentBanquetView } from '../engine/tournamentBanquet';

interface BanquetProps {
  view:TournamentBanquetView;
  scopeKey?:string;
  revision?:object;
}

interface DisclosureScope {
  scopeKey?:string;
  revision?:object;
  hallId:string;
  hallTick:number;
  content:string;
}
const same=(a:DisclosureScope,b:DisclosureScope)=>a.scopeKey===b.scopeKey&&a.revision===b.revision&&
  a.hallId===b.hallId&&a.hallTick===b.hallTick&&a.content===b.content;

function PrivateScene({label,text,scope}:{label:string;text:string;scope:DisclosureScope}){
  const area=useId(),button=useRef<HTMLButtonElement>(null),reading=useRef<HTMLParagraphElement>(null);
  const [revealed,setRevealed]=useState<DisclosureScope>();
  const open=!!revealed&&same(revealed,scope);
  useEffect(()=>{
    setRevealed(previous=>previous&&!same(previous,scope)?undefined:previous);
  },[scope]);
  useEffect(()=>{if(open)reading.current?.focus();},[open]);
  const close=()=>{setRevealed(undefined);button.current?.focus();};
  return <section className="min-w-0 border-t border-amber-200/15">
    <button ref={button} aria-controls={area} aria-expanded={open} type="button"
      className="min-h-11 w-full rounded px-1 text-left text-sm font-medium text-amber-100 hover:bg-amber-100/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
      onClick={()=>open?close():setRevealed(scope)}>{label}</button>
    <div hidden={!open} id={area} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
      {open&&<p ref={reading} tabIndex={-1} className="pb-2 pl-1 font-serif text-sm leading-relaxed text-slate-200 outline-none">{text}</p>}
    </div>
  </section>;
}

/** Public words at the feast are separate from either authorized private scene. */
export function TournamentBanquetCard({view,scopeKey,revision}:BanquetProps){
  const heading=useId();
  const {hall,thought,after}=view;
  const scopeFor=(content:string):DisclosureScope=>({scopeKey,revision,hallId:hall.id,hallTick:hall.tick,content});
  return <article aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-200/25 bg-gradient-to-br from-amber-950/40 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere] sm:p-4">
    <header className="space-y-1">
      <p className="text-xs tracking-wide text-amber-200">夜宴前厅 · {hall.siteName}</p>
      <h3 id={heading} className="font-serif text-base font-semibold text-amber-50">大比散场，灯下开席</h3>
    </header>
    <blockquote className="border-l border-amber-100/30 pl-2.5 font-serif text-sm leading-relaxed text-slate-100">{hall.speech}</blockquote>
    {thought?.text&&<PrivateScene label="席间心绪" scope={scopeFor(thought.text)} text={thought.text}/>}
    {after?.text&&after.tick>hall.tick&&<PrivateScene label="散席后"
      scope={scopeFor(JSON.stringify([after.tick,after.otherName,after.text]))}
      text={after.otherName?`与${after.otherName}的会后对谈：${after.text}`:after.text}/>}
  </article>;
}

import {useId,useRef} from 'react';
import type {LastRosterOption,LastRosterView} from '../engine/lastRoster';

const words={
  new_gate:['往新山门','循走得通的路到新门前；到了也不就此入宗，更不承旧职。'],
  home:['归旧村','回自己原来的村子。实到才算归去，不因此改动户籍。'],
  stay:['暂留旧址','只记这一人留下，不续旧宗，也不替同门定去处。'],
} as const;

export function LastRosterStoryCard({view,busy=false,sceneScope,onChoose}:{
  view:LastRosterView;
  busy?:boolean;
  sceneScope?:object|string|number;
  onChoose?:(option:LastRosterOption)=>boolean;
}){
  const heading=useId();
  const attempt=useRef({scope:sceneScope,accepted:false});
  if(attempt.current.scope!==sceneScope)attempt.current={scope:sceneScope,accepted:false};
  const lease=attempt.current;
  const choose=(option:LastRosterOption,detail:number)=>{
    if(!onChoose||busy||detail>1||attempt.current!==lease||lease.accepted)return;
    lease.accepted=true;
    let acquired=false;
    try {acquired=onChoose(option);} finally {if(!acquired)lease.accepted=false;}
  };
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-slate-400/35 bg-gradient-to-br from-slate-800/50 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-slate-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-slate-50">宗门终章之后的空页</h3>
    </header>
    {view.receipt?<section aria-label="散宗后亲历" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-slate-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">{view.closedSectName}已散去。再过旧门，该去哪里，仍由这一人自己定。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="旧宗散去后如何自处" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-slate-50 hover:bg-slate-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200 disabled:opacity-50"
        onClick={event=>choose(option,event.detail)}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.lastRosterMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.lastRosterMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

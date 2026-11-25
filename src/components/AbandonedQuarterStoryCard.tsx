import {useId,useRef} from 'react';
import type {AbandonedQuarterOption,AbandonedQuarterView} from '../engine/abandonedQuarter';

const words={
  inspect:['探查遗址','只查看眼下亲见的遗址，不把旧事当作今日发生。'],
  stay:['暂住片刻','只记自己在此停留，不登记为旧城居民。'],
  leave:['离开旧址','循眼下走得通的路离开，实际到达后才记一笔。'],
} as const;

export function AbandonedQuarterStoryCard({view,busy=false,sceneScope,onChoose}:{
  view:AbandonedQuarterView;
  busy?:boolean;
  sceneScope?:object|string|number;
  onChoose?:(option:AbandonedQuarterOption)=>boolean;
}){
  const heading=useId();
  const attempt=useRef({scope:sceneScope,accepted:false});
  if(attempt.current.scope!==sceneScope)attempt.current={scope:sceneScope,accepted:false};
  const lease=attempt.current;
  const choose=(option:AbandonedQuarterOption,detail:number)=>{
    if(!onChoose||busy||detail>1||attempt.current!==lease||lease.accepted)return;
    lease.accepted=true;
    let acquired=false;
    try {acquired=onChoose(option);} finally {if(!acquired)lease.accepted=false;}
  };
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-slate-400/35 bg-gradient-to-br from-slate-800/50 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-slate-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-slate-50">剑鸣穿过空城</h3>
    </header>
    {view.receipt?<section aria-label="旧址亲历" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-slate-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">{view.standing==='former_resident'?`从前住过${view.villageName}，而今又踏回了旧地。`:`今到${view.villageName}的遗址，旧章里的炊烟不在眼前。`}如今来往的多是过客，另有籍册可查。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="旧址前如何行动" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-slate-50 hover:bg-slate-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200 disabled:opacity-50"
        onClick={event=>choose(option,event.detail)}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.abandonedQuarterMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.abandonedQuarterMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

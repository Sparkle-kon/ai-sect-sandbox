import {useId,useRef} from 'react';
import type {BoundaryGapOption,BoundaryGapView} from '../engine/boundaryGap';

const words={
  cover:['掩护身边人','只护眼下确在险处的人。这一步不是接任守关。'],
  refuse:['不接这次援手','只说自己的决定，不替旧守或候补决定去留。'],
  stay:['留在关边','只是本人留下，不因此领到驻守之职。'],
} as const;
const statusCopy={
  gap:'这一次旧守已撤，新守尚未到。只这一处岗口空着，并非全州失陷。',
  relieved:'接替者确实到了岗点，换守才在这一次落定。',
  returned:'候补确已循路折返，并未到岗。',
} as const;

export function BoundaryGapStoryCard({view,busy=false,sceneScope,onChoose}:{
  view:BoundaryGapView;
  busy?:boolean;
  sceneScope?:object|string|number;
  onChoose?:(option:BoundaryGapOption)=>boolean;
}){
  const heading=useId();
  const attempt=useRef({scope:sceneScope,accepted:false});
  if(attempt.current.scope!==sceneScope)attempt.current={scope:sceneScope,accepted:false};
  const lease=attempt.current;
  const choose=(option:BoundaryGapOption,detail:number)=>{
    if(!onChoose||busy||detail>1||attempt.current!==lease||lease.accepted)return;
    lease.accepted=true;
    let acquired=false;
    try {acquired=onChoose(option);} finally {if(!acquired)lease.accepted=false;}
  };
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-slate-400/35 bg-gradient-to-br from-slate-800/50 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-slate-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-slate-50">关外两面旗</h3>
    </header>
    {view.receipt?<section aria-label="关口亲历" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-slate-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">{statusCopy[view.status]}</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="这次如何应对" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-slate-50 hover:bg-slate-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200 disabled:opacity-50"
        onClick={event=>choose(option,event.detail)}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.boundaryGapMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.boundaryGapMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

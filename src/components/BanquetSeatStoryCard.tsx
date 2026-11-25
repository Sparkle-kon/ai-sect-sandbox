import {useId,useRef} from 'react';
import type {BanquetSeatOption,BanquetSeatView} from '../engine/banquetSeats';

const words={
  attend:['赴席','到席前亲自入座后才留名。'],
  decline:['辞席','只谢绝这回邀约。暂未回话者另列。'],
  late:['迟来一见','席已散，再到场只记散席后的相见，不补坐旧席。'],
} as const;

export function BanquetSeatStoryCard({view,busy=false,sceneScope,onChoose,embedded=false}:{
  view:BanquetSeatView;
  busy?:boolean;
  embedded?:boolean;
  sceneScope?:object|string|number;
  onChoose?:(option:BanquetSeatOption)=>boolean;
}){
  const heading=useId();
  const attempt=useRef({scope:sceneScope,accepted:false});
  if(attempt.current.scope!==sceneScope)attempt.current={scope:sceneScope,accepted:false};
  const lease=attempt.current;
  const choose=(option:BanquetSeatOption,detail:number)=>{
    if(!onChoose||busy||detail>1||attempt.current!==lease||lease.accepted)return;
    lease.accepted=true;
    let acquired=false;
    try {acquired=onChoose(option);} finally {if(!acquired)lease.accepted=false;}
  };
  if(!view.options.length&&!view.receipt&&view.presentCount===undefined)return null;
  const details=<>
    <p className="font-serif text-sm leading-relaxed text-slate-200">{view.tableLine}</p>
    {view.presentCount!==undefined&&<p className="text-xs text-slate-300">正式开席时，实到 {view.presentCount} 位。</p>}
    {view.receipt&&<section aria-label="赴席实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-slate-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="此席如何应对" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-slate-50 hover:bg-slate-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200 disabled:opacity-50"
        onClick={event=>choose(option,event.detail)}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.banquetSeatMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.banquetSeatMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </>;
  if(embedded)return <section aria-label="席前与席后" className="space-y-2 border-t border-amber-200/15 pt-2">{details}</section>;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-slate-400/35 bg-gradient-to-br from-slate-800/50 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-slate-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-slate-50">席前与席后</h3>
    </header>
    {details}
  </section>;
}

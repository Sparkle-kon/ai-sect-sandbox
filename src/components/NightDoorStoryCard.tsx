import {useId,useRef} from 'react';
import type {NightDoorOption,NightDoorView} from '../engine/nightDoor';

const words={
  identify:['亲自报上姓名','由来客自己说。门内人且听他亲口回话。'],
  shelter:['请进暂避','只开口留宿，须来客自己应下并真正住下，才算安顿。'],
  close:['今夜关门','只闭自己这道门，不替来客定下去处。'],
  escort:['提议护送一步','只问来客愿不愿同行，尚未走出这里。'],
  accept:['应下这次相助','由来客亲自答应；是否动身，仍以各自实走为准。'],
  cross:['走实这一段','只走自己眼下认得的一步。另一个人是否走成，不由此推定。'],
} as const;

export function NightDoorStoryCard({view,busy=false,sceneScope,onChoose}:{
  view:NightDoorView;
  busy?:boolean;
  sceneScope?:object|string|number;
  onChoose?:(option:NightDoorOption)=>boolean;
}){
  const heading=useId();
  const attempt=useRef({scope:sceneScope,accepted:false});
  if(attempt.current.scope!==sceneScope)attempt.current={scope:sceneScope,accepted:false};
  const lease=attempt.current;
  const choose=(option:NightDoorOption,detail:number)=>{
    if(!onChoose||busy||detail>1||attempt.current!==lease||lease.accepted)return;
    lease.accepted=true;
    let acquired=false;
    try {acquired=onChoose(option);} finally {if(!acquired)lease.accepted=false;}
  };
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-slate-400/35 bg-gradient-to-br from-slate-800/50 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-slate-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-slate-50">夜半有人叩门</h3>
    </header>
    {view.receipt?<section aria-label="此夜实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-slate-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">{view.role==='host'?'人已到了门前。':'这一程已走到门前。'}{view.identifiedGuestName?`来客自报姓名：${view.identifiedGuestName}。`:view.role==='host'&&view.uncertain?'隔着门看，像先前见过的人，可一时辨不真切。':'各自肯如何，尚待当面说。'}</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="门前如何应对" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-slate-50 hover:bg-slate-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-200 disabled:opacity-50"
        onClick={event=>choose(option,event.detail)}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.nightDoorMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.nightDoorMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

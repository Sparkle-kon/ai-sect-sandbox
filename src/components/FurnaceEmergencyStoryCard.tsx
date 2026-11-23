import {useId,useRef} from 'react';
import type {FurnaceEmergencyOption,FurnaceEmergencyView} from '../engine/furnaceEmergency';

const words={
  brace:['留下护炉','在原处应付这一轮险情。只有确实挡下伤害才耗八点真气；并不等于丹炉修好了。'],
  retreat:['先撤到近处','只走眼下已知可行的一步。到了才算撤出，先前受的伤不会因此抹去。'],
  request_rescue:['向在场人求援','只是递出求援，对方须亲自答复；此刻还无人因此得救。'],
  accept_rescue:['应下求援','这一步只应下求援。两人后来确实越过这一段，才算一同撤离。'],
} as const;

export function FurnaceEmergencyStoryCard({view,busy=false,sceneScope,onChoose}:{
  view:FurnaceEmergencyView;
  busy?:boolean;
  sceneScope?:object|string|number;
  onChoose?:(option:FurnaceEmergencyOption)=>boolean;
}){
  const heading=useId();
  const attempt=useRef({scope:sceneScope,accepted:false});
  if(attempt.current.scope!==sceneScope)attempt.current={scope:sceneScope,accepted:false};
  const lease=attempt.current;
  const choose=(option:FurnaceEmergencyOption,detail:number)=>{
    if(!onChoose||busy||detail>1||attempt.current!==lease||lease.accepted)return;
    lease.accepted=true;
    let acquired=false;
    try {acquired=onChoose(option);} finally {if(!acquired)lease.accepted=false;}
  };
  if(!view.options.length&&!view.receipt)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-orange-300/25 bg-gradient-to-br from-orange-950/30 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-orange-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-orange-50">丹火将熄</h3>
    </header>
    {view.receipt?<section aria-label="炉前实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-orange-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">险情已到了炉前。这一步怎么办，只看自己眼下还来得及做什么。</p>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="炉前如何行动" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-orange-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-orange-50 hover:bg-orange-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-200 disabled:opacity-50"
        onClick={event=>choose(option,event.detail)}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.furnaceEmergencyMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.furnaceEmergencyMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

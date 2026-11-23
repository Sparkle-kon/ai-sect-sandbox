import {useId} from 'react';
import type {ApprenticeshipReunionOption,ApprenticeshipReunionView} from '../engine/apprenticeshipReunion';

const words={
  ask:['叩门请教','只向眼前这人请教，未得答复，便还没有师徒之约。'],
  refuse:['婉拒收徒','只答复这次求教，不替来人定下去处。'],
  teach:['愿私下指点','这一回只提出指点，对方须另作答复。'],
  accept_teaching:['应下这次指点','只应下当面这番指点，不预断能否学成。'],
  public_spar:['邀作公开切磋','只作邀约。须另一人另行应下，且确有比试，才算交手。'],
  accept_spar:['应下切磋之邀','只答应赴试。两人都备妥并真正交手，才有场上结果。'],
  part:['在此作别','此行只到这里，不替后来的人事下断语。'],
} as const;

export function ApprenticeshipReunionStoryCard({view,busy=false,onChoose}:{
  view:ApprenticeshipReunionView;
  busy?:boolean;
  onChoose?:(option:ApprenticeshipReunionOption)=>void;
}){
  const heading=useId();
  if(!view.options.length&&!view.receipt&&!view.past)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-teal-300/25 bg-gradient-to-br from-teal-950/25 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-teal-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-teal-50">一身所学，一面作答</h3>
    </header>
    {view.receipt?<section aria-label="此番请教实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-teal-100">{view.receipt.title}</p>
      <p className="text-slate-200">{view.receipt.description}</p>
    </section>:<p className="font-serif text-sm leading-relaxed text-slate-200">人已在眼前。该说什么、肯走哪一步，各自作答便是。</p>}
    {view.past&&<section aria-label="本人实际经历的旧拒" className="border-l border-amber-300/35 pl-2 font-serif text-sm leading-relaxed text-slate-200">
      <p className="font-semibold text-amber-100">{view.past.title}</p><p>{view.past.description}</p>
    </section>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="此番如何应对" className="grid gap-1.5 sm:grid-cols-2">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-[44px] w-full min-w-0 rounded-md border border-teal-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-teal-50 hover:bg-teal-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
        {words[option.apprenticeshipReunionMove][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[option.apprenticeshipReunionMove][1]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一步尚未落定。</p>}
  </section>;
}

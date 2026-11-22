import {useId} from 'react';

export type SchoolFormDuelChoice='counter'|'stop';
export interface SchoolFormDuelCardView {
  readonly contactId:string;
  readonly actorName:string;
  readonly opponentName:string;
  readonly siteName:string;
  readonly options:readonly SchoolFormDuelChoice[];
}
const words={
  counter:['以旧式还招','还招须付出真气；能否接住，不在这一刻预断。'],
  stop:['只收自己的剑','不再继续这次挑战，但不替对手决定，也不离开原地。'],
} as const;
const button='min-h-11 w-full rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';
export function SchoolFormDuelCard({view,receipt,busy=false,notice,onChoose,onContinue}:{
  view:SchoolFormDuelCardView;receipt?:{title:string;description:string};busy?:boolean;notice?:string;
  onChoose?:(choice:SchoolFormDuelChoice)=>void;onContinue?:()=>void;
}){
  const label=useId();
  if(!receipt&&!view.options.length)return null;
  return <section aria-labelledby={label} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName} · {view.actorName}与{view.opponentName}</p>
      <h3 id={label} className="font-serif text-lg font-semibold text-amber-50">剑锋里的一式旧招</h3>
    </header>
    {receipt?<section aria-label="还招实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{receipt.title}</p>
      <p className="text-slate-200">{receipt.description}</p>
    </section>:<>
      <p className="font-serif text-sm leading-relaxed text-slate-200">认得这一式，却不等于接得住。还招，还是就此收剑？</p>
      {onChoose&&<div role="group" aria-label="如何回应旧剑式" className="grid gap-1.5 sm:grid-cols-2">
        {[...new Set(view.options)].map(choice=><button key={choice} type="button" disabled={busy} className={button}
          onClick={event=>{if(!busy&&event.detail<=1)onChoose(choice);}}
          onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
          {words[choice][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[choice][1]}</span>
        </button>)}
      </div>}
    </>}
    {receipt&&onContinue&&<button type="button" disabled={busy} className={button} onClick={onContinue}>收起这一幕</button>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕正在落定。</p>}
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}

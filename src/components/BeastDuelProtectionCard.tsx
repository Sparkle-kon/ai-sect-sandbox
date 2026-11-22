import {useEffect,useId,useRef,useState} from 'react';

export type BeastDuelChoice='guard'|'withdraw'|'decline';
export interface BeastDuelProtectionCardView {
  ownerName:string;
  beastName:string;
  siteName:string;
  options:readonly {choice:BeastDuelChoice;refugeName?:string}[];
  queued?:BeastDuelChoice;
}
interface Props {
  view:BeastDuelProtectionCardView;
  receipt?:{title:string;description:string};
  busy?:boolean;
  onChoose?:(choice:BeastDuelChoice)=>boolean;
  onAdvance?:()=>boolean;
  onContinue?:()=>void;
}
const labels={guard:'请灵兽护我',withdraw:'让灵兽先退',decline:'不动契印，照常应战'} as const;
const action='min-h-11 w-full rounded-md border border-amber-200/35 bg-slate-950/60 px-2.5 py-1.5 text-left text-sm font-medium text-amber-50 hover:bg-amber-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

export function BeastDuelProtectionCard({view,receipt,busy=false,onChoose,onAdvance,onContinue}:Props){
  const id=useId(),heading=useRef<HTMLHeadingElement>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    setFailed(false);
    heading.current?.focus({preventScroll:true});
  },[view.ownerName,view.beastName,view.siteName,view.queued,!!receipt]);
  const invoke=(change:()=>boolean)=>{
    if(!busy)setFailed(!change());
  };
  return <section aria-labelledby={id} className="min-w-0 space-y-2 rounded-lg border border-amber-300/30 bg-gradient-to-br from-amber-950/45 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header className="space-y-0.5">
      <p className="text-xs tracking-wide text-amber-200">{view.siteName} · {view.ownerName}与{view.beastName}</p>
      <h3 ref={heading} tabIndex={-1} id={id} className="font-serif text-lg font-semibold text-amber-50 outline-none">生死关头，灵兽在侧</h3>
    </header>
    {receipt?<div aria-label="此战实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{receipt.title}</p>
      <p className="text-slate-200">{receipt.description}</p>
    </div>:<>
      <p className="font-serif text-sm leading-relaxed text-slate-200">对手已经到了眼前。{view.beastName}就在身侧，这一场还没有结果。</p>
      {!view.queued&&onChoose&&view.options.length>0&&<div role="group" aria-label="此刻如何对待灵兽" className="grid gap-1.5 sm:grid-cols-2">
        {view.options.map(option=><button type="button" key={option.choice} className={option.choice==='decline'?`${action} border-slate-700/60 text-slate-300 sm:col-span-2`:action} disabled={busy}
          onClick={event=>{if(event.detail<=1)invoke(()=>onChoose(option.choice));}}
          onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
          <span>{labels[option.choice]}</span>
          <span className="block text-xs leading-relaxed text-slate-300">
            {option.choice==='guard'?'请它同你留在这一战中；交手的伤势，要等实际落定。':
              option.choice==='decline'?'不请它替你挡招，也不解开原有契约。':
              `若能依原路离开，它会去${option.refugeName??'眼下可到的避处'}，也将解开与你的契约。你的安危，仍要看这场交手。`}
          </span>
        </button>)}
      </div>}
      {view.queued&&<p className="text-xs leading-relaxed text-amber-100">已记下「{labels[view.queued]}」。尚未交手，未见伤势或离散。</p>}
      {view.queued&&onAdvance&&<button type="button" disabled={busy} className={action}
        onClick={event=>{if(event.detail<=1)invoke(onAdvance);}}
        onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>推进一月，面对这场交锋</button>}
    </>}
    {receipt&&onContinue&&<button type="button" className={action} disabled={busy} onClick={onContinue}>收起这一幕</button>}
    {failed&&<p role="status" className="text-xs text-amber-200">眼下的情形已变，未执行这一步。</p>}
  </section>;
}

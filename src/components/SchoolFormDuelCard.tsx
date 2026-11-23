import {VisualDuelArena} from './VisualDuelArena';
import type {VisualDuelArenaFrame} from './visualDuelArenaModel';
import {useEffect,useId,useRef} from 'react';

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
const button='min-h-[44px] w-full min-w-0 rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';
export function SchoolFormDuelCard({view,receipt,busy=false,notice,onChoose,onContinue,historical=false,sceneScope,receiptFocus=false,arena}:{
  view:SchoolFormDuelCardView;receipt?:{title:string;description:string};busy?:boolean;notice?:string;
  onChoose?:(choice:SchoolFormDuelChoice)=>boolean;onContinue?:()=>void;
  historical?:boolean;sceneScope?:object|string|number;receiptFocus?:boolean;arena?:VisualDuelArenaFrame;
}){
  const label=useId();
  const scene=useRef<HTMLElement>(null),resultTitle=useRef<HTMLParagraphElement>(null);
  const activation=useRef<SchoolFormActivation>({scope:sceneScope,contact:view.contactId,accepted:false});
  if(activation.current.scope!==sceneScope||activation.current.contact!==view.contactId)
    activation.current={scope:sceneScope,contact:view.contactId,accepted:false};
  const lease=activation.current;
  const focusedLease=useRef<SchoolFormActivation>();
  useEffect(()=>{
    const target=resultTitle.current,card=scene.current;
    if(historical||!receiptFocus||!receipt||!target?.isConnected||!card||focusedLease.current===lease)return;
    focusedLease.current=lease;
    const active=card.ownerDocument.activeElement;
    if(card.contains(active)||active===card.ownerDocument.body)target.focus({preventScroll:true});
  },[historical,receipt,receiptFocus,lease]);
  if(!receipt&&!view.options.length)return null;
  const choices=[...new Set(view.options)];
  return <section ref={scene} data-school-form-scene aria-labelledby={label} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName} · {view.actorName}与{view.opponentName}</p>
      <h3 id={label} className="font-serif text-lg font-semibold text-amber-50">剑锋里的一式旧招</h3>
    </header>
    {historical&&<p className="text-xs text-amber-200">历史回看 · 只读</p>}
    {!historical&&!receipt&&arena&&<VisualDuelArena frame={arena}/>}
    {receipt?<section aria-label="还招实录" className="space-y-1 font-serif text-sm leading-relaxed">
      <p ref={resultTitle} tabIndex={receiptFocus&&!historical?-1:undefined} className="font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-200">{receipt.title}</p>
      <p className="text-slate-200">{receipt.description}</p>
    </section>:<>
      <p className="font-serif text-sm leading-relaxed text-slate-200">认得这一式，却不等于接得住。还招，还是就此收剑？</p>
      {historical&&<ul aria-label="当时的选择" className="grid gap-1.5 sm:grid-cols-2">
        {choices.map(choice=><li key={choice} className="min-w-0 text-sm text-amber-50">
          {words[choice][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[choice][1]}</span>
        </li>)}
      </ul>}
      {!historical&&onChoose&&<div role="group" aria-label="如何回应旧剑式" className="grid gap-1.5 sm:grid-cols-2">
        {choices.map(choice=><button key={choice} type="button" disabled={busy} className={button}
          onClick={event=>activateSchoolFormChoice(lease,activation.current,busy,event.detail,()=>onChoose(choice))}
          onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>
          {words[choice][0]}<span className="block text-xs leading-relaxed text-slate-300">{words[choice][1]}</span>
        </button>)}
      </div>}
    </>}
    {receipt&&!historical&&onContinue&&<button type="button" disabled={busy} className={button} onClick={onContinue}>收起这一幕</button>}
    {busy&&!historical&&<p role="status" className="text-xs text-slate-400">这一幕正在落定。</p>}
    {notice&&!historical&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}

/** A native button click is the only activation path. Blur doesn't create a new lease. */
interface SchoolFormActivation {
  scope:object|string|number|undefined;
  contact:string;
  accepted:boolean;
}
export function activateSchoolFormChoice(
  proposed:SchoolFormActivation,current:SchoolFormActivation,busy:boolean,clickCount:number,choose:()=>boolean,
):void {
  if(busy||clickCount>1||proposed!==current||current.accepted)return;
  current.accepted=true;
  let accepted=false;
  try {accepted=choose();} finally {if(!accepted)current.accepted=false;}
}

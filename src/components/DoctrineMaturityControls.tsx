import { useId, useRef, useState } from 'react';
import { AVATAR_ORDER_COST } from '../engine/avatarEngine';
import type { DoctrineMaturityOption } from '../engine/doctrineMaturityEngine';

export interface DoctrineMaturityChoice {
  option:DoctrineMaturityOption;
  label?:string;
  proof?:{kind:'sustained_hazard'|'title_lost';observedTick:number};
}
export interface DoctrineMaturityControlsProps {
  scopeKey:string;
  revisionKey?: object|string|number;
  choices:readonly DoctrineMaturityChoice[];
  disabled?:boolean;
  onQueue?:(option:DoctrineMaturityOption)=>boolean;
}
type Move=DoctrineMaturityOption['doctrineMaturityMove'];
const ACTION:Record<Move,string> = {
  offer_merge:'提出自愿并宗', accept_merge:'以接纳方掌门身份同意', approve_member:'同意更改本人宗籍',
  decline_merge:'明确拒绝并宗提议', withdraw_merge:'撤回本人并宗提议', finalize_merge:'核签并实际交割',
};
const TERMS:Record<Move,string> = {
  offer_merge:'只有真实失地或实际连续三个月严重灾势才可提出。仅登记提议，不划款、不改宗籍。',
  accept_merge:'接纳方掌门须到自己的山门单独签字；不会代替对方每位成员，不会立即交割。',
  approve_member:'此项只代表你同意更改本人宗籍。未完成交割前，宗籍、库银和人员位置均不改变。',
  decline_merge:'当事人明确拒绝使此项筹议停止，不改原有归属或旧账。',
  withdraw_merge:'这一步只撤回本人提出的筹议，不划款、不改宗籍。',
  finalize_merge:'须接纳方与每位在世同门均已分别同意，并逐一核对当时人、地与旧账。只交割约定钱款和传承抄本，实际改宗籍，不替人迁地。',
};
const action='min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50';
const key=(p:DoctrineMaturityOption)=>JSON.stringify([p.doctrineMaturityMove,p.targetDoctrineFoundingId]);
const title=({option,label}:DoctrineMaturityChoice)=>ACTION[option.doctrineMaturityMove]+(label?.trim()?` · ${label}`:'');

export function DoctrineMaturityConfirmation({choice,groupId,disabled,onConfirm,onCancel}:{
  choice:DoctrineMaturityChoice;groupId?:string;disabled?:boolean;onConfirm:()=>void;onCancel:()=>void;
}) {
  return <div id={groupId} role="group" aria-label="核对并宗选择" className="space-y-1.5 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs leading-relaxed text-slate-300">
    <p className="font-semibold text-amber-100">{title(choice)}</p>
    {choice.option.doctrineMaturityMove==='offer_merge'&&choice.proof&&<p>
      原始依据：第 {choice.proof.observedTick} 轮实记{choice.proof.kind==='sustained_hazard'?'连续三个月的严重灾势':'失去在册地权'}。
    </p>}
    <p>{TERMS[choice.option.doctrineMaturityMove]}</p>
    <p>成功排入消耗 {AVATAR_ORDER_COST} 神识，不推进月份；下月按当时条件再次核对。签字与并宗须届时亲自办成。</p>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={`${action} py-1.5 text-xs`} disabled={disabled} onClick={onConfirm}>确认排入：{ACTION[choice.option.doctrineMaturityMove]}</button>
      <button type="button" className={`${action} py-1.5 text-xs`} onClick={onCancel}>返回核对</button>
    </div>
  </div>;
}

export function DoctrineMaturityControls({scopeKey,...props}:DoctrineMaturityControlsProps) {
  if(!props.onQueue||!props.choices.length)return null;
  return <ScopedReview key={scopeKey} {...props}/>;
}

function ScopedReview({revisionKey,choices,disabled=false,onQueue}:Omit<DoctrineMaturityControlsProps,'scopeKey'>) {
  const [picked,setPicked]=useState<string>();
  const [review,setReview]=useState<{key:string;revisionKey?:DoctrineMaturityControlsProps['revisionKey']}>();
  const [notice,setNotice]=useState<string>();
  const attempted=useRef<typeof review>();
  const focus=useRef<HTMLButtonElement>(null);
  const groupId=useId();
  const counts=new Map<string,number>();
  for(const row of choices)counts.set(key(row.option),(counts.get(key(row.option))??0)+1);
  const options=choices.filter(row=>counts.get(key(row.option))===1);
  const chosen=options.find(row=>key(row.option)===picked);
  const exact=chosen&&review?.key===picked&&review?.revisionKey===revisionKey?review:undefined;
  if(!options.length)return null;
  return <section aria-label="并宗筹议的选择" className="min-w-0 space-y-1.5 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
    <div className="grid min-w-0 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid min-w-0 gap-1">你当前可作的并宗选择
        <select className={`${action} w-full text-base`} value={chosen?String(options.indexOf(chosen)):''} disabled={disabled}
          onChange={(event)=>{
            const next=options.find((_,i)=>String(i)===event.currentTarget.value);
            setPicked(next?key(next.option):undefined);setReview(undefined);setNotice(undefined);
          }}>
          <option value="">请选择</option>
          {options.map((item,i)=><option key={key(item.option)} value={i}>{title(item)}</option>)}
        </select>
      </label>
      <button ref={focus} type="button" className={`${action} py-1.5 text-xs`} disabled={disabled||!chosen}
        aria-expanded={!!exact} aria-controls={exact?groupId:undefined}
        onClick={()=>{if(picked){setReview(exact?undefined:{key:picked,revisionKey});setNotice(undefined);}}}>核对这项选择</button>
    </div>
    {chosen&&exact&&<DoctrineMaturityConfirmation choice={chosen} groupId={groupId} disabled={disabled}
      onCancel={()=>{setReview(undefined);focus.current?.focus({preventScroll:true});}}
      onConfirm={()=>{
        if(disabled||!onQueue||attempted.current===exact)return;attempted.current=exact;
        const queued=onQueue(chosen.option);
        setReview(undefined);
        if(queued){setPicked(undefined);setNotice('已排入下一轮，尚未执行。');}
        else setNotice('选择已不适用，尚未排入指令。');
      }}/>}
    {notice&&<p role="status" className="text-xs text-teal-100">{notice}</p>}
  </section>;
}

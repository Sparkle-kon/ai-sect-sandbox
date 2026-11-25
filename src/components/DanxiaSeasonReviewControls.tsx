import { useId, useRef, useState } from 'react';
import { AVATAR_ORDER_COST } from '../engine/avatarEngine';
import type { DanxiaReviewOption } from '../engine/danxiaSeasonReviewEngine';

export interface DanxiaSeasonReviewChoice { option:DanxiaReviewOption; label?:string }
export interface DanxiaSeasonReviewControlsProps {
  scopeKey:string;
  revisionKey?: object|string|number;
  choices:readonly DanxiaSeasonReviewChoice[];
  disabled?:boolean;
  onQueue?:(option:DanxiaReviewOption)=>boolean;
}
type Move=DanxiaReviewOption['danxiaReviewMove'];
const ACTION:Record<Move,string> = {
  propose_renew:'提议续约', propose_switch:'提议改约', refuse:'拒绝下季合作',
  accept:'同意这项提议', decline:'谢绝这项提议',
};
const TERMS:Record<Move,string> = {
  propose_renew:'这一步只提出继续合作；仍须对方另行同意，不会支出或送达新药。',
  propose_switch:'所据赈济确已发生；可提改约，随后等对方另签；双方仍各归原宗。',
  refuse:'这一步只代表原定求药人明确拒绝此项合作，不替全村表态，也不改动原案交付。',
  accept:'实际生效须下月双方仍具资格，并由本人当场同意。这不会自动开新药账或施治。',
  decline:'拒绝现有提议只会使这项新约未能达成，不会取消原案实交。',
};
const action='min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50';
const key=(p:DanxiaReviewOption)=>JSON.stringify([p.danxiaReviewMove,p.targetDanxiaReviewId,p.targetSettlementRecordId]);
const title=({option,label}:DanxiaSeasonReviewChoice)=>ACTION[option.danxiaReviewMove]+(label?.trim()?` · ${label}`:'');

export function DanxiaSeasonReviewConfirmation({choice,groupId,disabled,onConfirm,onCancel}:{
  choice:DanxiaSeasonReviewChoice;groupId?:string;disabled?:boolean;onConfirm:()=>void;onCancel:()=>void;
}) {
  return <div id={groupId} role="group" aria-label="核对次季选择" className="space-y-1.5 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs leading-relaxed text-slate-300">
    <p className="font-semibold text-amber-100">{title(choice)}</p>
    <p>{TERMS[choice.option.danxiaReviewMove]}</p>
    <p>成功排入消耗 {AVATAR_ORDER_COST} 神识，不推进月份；下月按当时条件再次核对。签约仍须当月双方应允。</p>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={`${action} py-1.5 text-xs`} disabled={disabled} onClick={onConfirm}>确认排入：{ACTION[choice.option.danxiaReviewMove]}</button>
      <button type="button" className={`${action} py-1.5 text-xs`} onClick={onCancel}>返回核对</button>
    </div>
  </div>;
}

export function DanxiaSeasonReviewControls({scopeKey,...props}:DanxiaSeasonReviewControlsProps) {
  if(!props.onQueue||!props.choices.length)return null;
  return <ScopedReview key={scopeKey} {...props}/>;
}

function ScopedReview({revisionKey,choices,disabled=false,onQueue}:Omit<DanxiaSeasonReviewControlsProps,'scopeKey'>) {
  const [picked,setPicked]=useState<string>();
  const [review,setReview]=useState<{key:string;revisionKey?:DanxiaSeasonReviewControlsProps['revisionKey']}>();
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
  return <section aria-label="次季合作选择" className="min-w-0 space-y-1.5 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
    <div className="grid min-w-0 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid min-w-0 gap-1">当前可作的次季选择
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
    {chosen&&exact&&<DanxiaSeasonReviewConfirmation choice={chosen} groupId={groupId} disabled={disabled}
      onCancel={()=>{setReview(undefined);focus.current?.focus({preventScroll:true});}}
      onConfirm={()=>{
        if(disabled||!onQueue||attempted.current===exact)return;attempted.current=exact;
        const queued=onQueue(chosen.option);
        setReview(undefined);
        if(queued){setPicked(undefined);setNotice('已排入下一轮，尚未签定。');}
        else setNotice('选择已不适用，尚未排入指令。');
      }}/>}
    {notice&&<p role="status" className="text-xs text-teal-100">{notice}</p>}
  </section>;
}

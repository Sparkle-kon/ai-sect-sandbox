import { useId, useRef, useState } from 'react';
import { AVATAR_ORDER_COST } from '../engine/avatarEngine';
import type { DoctrineFoundingOption } from '../engine/doctrineFoundingEngine';

export interface DoctrineFoundingChoice { option:DoctrineFoundingOption; label?:string }
export interface DoctrineFoundingControlsProps {
  scopeKey:string;
  revisionKey?: object|string|number;
  choices:readonly DoctrineFoundingChoice[];
  disabled?:boolean;
  onQueue?:(option:DoctrineFoundingOption)=>boolean;
}
type Move=DoctrineFoundingOption['doctrineFoundingMove'];
const ACTION:Record<Move,string> = {
  propose:'提议另立宗门', join:'签下本人入宗意愿', authorize:'以原宗掌门身份允议',
  decline:'不允另立', withdraw:'撤回本人提议或同意', establish:'正式另立宗门',
};
const TERMS:Record<Move,string> = {
  propose:'只提出以已登记的原宗旧址为据点，不会立即改宗、占地或动用学舍钱库。',
  join:'只为你本人留下同意，不能替同门表态；只有正式另立且届时仍合资格，才实际改宗。',
  authorize:'此项允议须由原宗掌门亲自在原宗迁后的山门作出。允议本身不动原宗土地与债务，也不等于已另立。',
  decline:'这一步记录原宗掌门拒绝该项提议，不占地、不改宗籍。',
  withdraw:'这里只撤回你的原提议或本人同意，其他人的意愿不由此更改。',
  establish:'下月须再核对原宗实地允议、至少三名合格实地成员、供养地和真实传承；仅将学舍实有钱库和授权抄本记入新宗，原宗旧债与器物不随转。',
};
const action='min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50';
const key=(p:DoctrineFoundingOption)=>JSON.stringify([p.doctrineFoundingMove,p.targetDoctrineFoundingId,p.targetDoctrineSchoolId,p.targetRelocationId]);
const title=({option,label}:DoctrineFoundingChoice)=>ACTION[option.doctrineFoundingMove]+(label?.trim()?` · ${label}`:'');

export function DoctrineFoundingConfirmation({choice,groupId,disabled,onConfirm,onCancel}:{
  choice:DoctrineFoundingChoice;groupId?:string;disabled?:boolean;onConfirm:()=>void;onCancel:()=>void;
}) {
  return <div id={groupId} role="group" aria-label="核对立宗选择" className="space-y-1.5 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-xs leading-relaxed text-slate-300">
    <p className="font-semibold text-amber-100">{title(choice)}</p>
    <p>{TERMS[choice.option.doctrineFoundingMove]}</p>
    <p>成功排入消耗 {AVATAR_ORDER_COST} 神识，不推进月份；下月按当时条件再次核对。排入指令本身不算签字，也不算另立宗门。</p>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={`${action} py-1.5 text-xs`} disabled={disabled} onClick={onConfirm}>确认排入：{ACTION[choice.option.doctrineFoundingMove]}</button>
      <button type="button" className={`${action} py-1.5 text-xs`} onClick={onCancel}>返回核对</button>
    </div>
  </div>;
}

export function DoctrineFoundingControls({scopeKey,...props}:DoctrineFoundingControlsProps) {
  if(!props.onQueue||!props.choices.length)return null;
  return <ScopedReview key={scopeKey} {...props}/>;
}

function ScopedReview({revisionKey,choices,disabled=false,onQueue}:Omit<DoctrineFoundingControlsProps,'scopeKey'>) {
  const [picked,setPicked]=useState<string>();
  const [review,setReview]=useState<{key:string;revisionKey?:DoctrineFoundingControlsProps['revisionKey']}>();
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
  return <section aria-label="另立宗门的选择" className="min-w-0 space-y-1.5 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
    <div className="grid min-w-0 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid min-w-0 gap-1">你当前可作的立宗选择
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
    {chosen&&exact&&<DoctrineFoundingConfirmation choice={chosen} groupId={groupId} disabled={disabled}
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

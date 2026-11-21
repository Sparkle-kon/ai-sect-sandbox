import { useId, useRef, useState } from 'react';
import { AVATAR_ORDER_COST } from '../engine/avatarEngine';
import { DANXIA_MEDICINE_LEAVES } from '../engine/danxiaMedicineTerms';
import type { DanxiaMedicineOption } from '../engine/danxiaMedicineEngine';

type Move = Exclude<DanxiaMedicineOption['danxiaMedicineMove'], 'observe'>;
export interface DanxiaMedicineChoice {
  option: DanxiaMedicineOption;
  /** Canonical current eligible local carrier name; omitted for actions without a named target. */
  label?: string;
}
export interface DanxiaMedicineControlsProps {
  choices: readonly DanxiaMedicineChoice[];
  scopeKey: string;
  revisionKey?: object | string | number;
  disabled?: boolean;
  onQueue?: (command: DanxiaMedicineOption) => boolean;
}
const ACTION: Record<Move,string> = {
  retain:'留下开炉', offer_ship:'请护送', brew:'实际开炉', accept:'同意护送',
  decline:'谢绝这笔备药安排', receive:'实际签收', recover:'原主领回',
};
const TERMS: Record<Move,string> = {
  retain:`执行成功后，从本人药囊封存翡翠灵叶 ${DANXIA_MEDICINE_LEAVES} 株，留待另行开炉。此步不炼丹，也不施治。`,
  offer_ship:`执行成功后，从本人药囊封存翡翠灵叶 ${DANXIA_MEDICINE_LEAVES} 株，再向所选修士发出护送邀约。须对方另行同意，此步不算启程或交货。`,
  brew:'须届时仍有可用炉位及其他耗材。实际开炉才消耗封存灵叶，可能炼制失败；出丹也不是已用药。',
  accept:'须届时仍符合本地护送条件。同意只登记承接，不算已经启程或抵达。',
  decline:'拒绝不算实际收到药材，也不等于封存药材已经退回。',
  receive:'须届时仍能实地签收。成功时，封存药叶才转入本人药囊；不等于服用或完成复诊。',
  recover:'只有原出资人实地领回成功，才从封存转回本人药囊。',
};
const control='min-h-11 min-w-0 max-w-full rounded border border-teal-500/40 bg-slate-950 px-2 text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50';

const optionKey=(o:DanxiaMedicineOption)=>JSON.stringify([o.danxiaMedicineMove,
  'targetDanxiaShortageId'in o?o.targetDanxiaShortageId:o.targetDanxiaMedicineId,
  'targetCultivatorId'in o?o.targetCultivatorId:undefined]);
function allowedChoices(rows: readonly DanxiaMedicineChoice[]) {
  const seen=new Map<string,number>();
  for(const row of rows)seen.set(optionKey(row.option),(seen.get(optionKey(row.option))??0)+1);
  return rows.filter(({option,label})=>option.danxiaMedicineMove!=='observe'&&
    (option.danxiaMedicineMove!=='offer_ship'||Boolean(label?.trim()))&&seen.get(optionKey(option))===1);
}
const labelFor=({option,label}:DanxiaMedicineChoice)=>{
  const move=option.danxiaMedicineMove;
  return move==='observe'?'旁观':ACTION[move]+(move==='offer_ship'&&label?` · ${label}`:'');
};

export function DanxiaMedicineConfirmation({choice, groupId, disabled=false, onConfirm,onCancel}: {
  choice: DanxiaMedicineChoice; groupId?: string; disabled?: boolean; onConfirm:()=>void;onCancel:()=>void;
}) {
  const move=choice.option.danxiaMedicineMove;
  if(move==='observe')return null;
  return <div id={groupId} role="group" aria-label="核对备药选择" className="space-y-1.5 rounded border border-amber-500/40 bg-amber-950/30 p-2">
    <p className="font-semibold text-amber-100">{labelFor(choice)}</p>
    <p>{TERMS[move]}</p>
    <p>成功排入指令即扣 {AVATAR_ORDER_COST} 神识，不移动药叶、不推进回合。下月按当时条件再次核对，可能不执行。</p>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={`${control} py-1.5 text-xs`} disabled={disabled} onClick={onConfirm}>确认排入：{ACTION[move]}</button>
      <button type="button" className={`${control} py-1.5 text-xs`} onClick={onCancel}>返回核对</button>
    </div>
  </div>;
}

export function DanxiaMedicineControls({scopeKey,...props}:DanxiaMedicineControlsProps) {
  return <ScopedChoices key={scopeKey} {...props}/>;
}

function ScopedChoices({choices,revisionKey,disabled=false,onQueue}:Omit<DanxiaMedicineControlsProps,'scopeKey'>) {
  const [selected,setSelected]=useState<string>();
  const [review,setReview]=useState<{key:string;revisionKey?:DanxiaMedicineControlsProps['revisionKey']}>();
  const [status,setStatus]=useState<string>();
  const attempted=useRef<typeof review>();
  const reviewButton=useRef<HTMLButtonElement>(null);
  const groupId=useId();
  const eligible=onQueue?allowedChoices(choices):[];
  const chosen=eligible.find(({option})=>optionKey(option)===selected);
  const exact=chosen&&review?.key===selected&&review?.revisionKey===revisionKey ? review : undefined;
  const cancel=()=>{setReview(undefined);reviewButton.current?.focus({preventScroll:true});};
  return <section aria-label="备药选择" className="min-w-0 space-y-1.5 border-t border-slate-800 pt-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
    <button type="button" className={`${control} py-1.5 text-xs`} onClick={()=>{
      setReview(undefined);setSelected(undefined);setStatus('仅旁观，没有下令，也没有移动药材。');
    }}>旁观</button>
    {eligible.length>0&&<div className="grid min-w-0 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid min-w-0 gap-1">当前可用的备药事务
        <select className={`${control} w-full text-base`} value={chosen?String(eligible.indexOf(chosen)):''} disabled={disabled}
          onChange={(event)=>{
            const next=eligible.find((_,ordinal)=>String(ordinal)===event.currentTarget.value);
            setStatus(undefined);setReview(undefined);setSelected(next?optionKey(next.option):undefined);
          }}>
          <option value="">请选择</option>
          {eligible.map((item,ordinal)=><option key={optionKey(item.option)} value={ordinal}>{labelFor(item)}</option>)}
        </select>
      </label>
      <button type="button" className={`${control} py-1.5 text-xs`} ref={reviewButton} disabled={disabled||!chosen}
        aria-expanded={!!exact} aria-controls={exact?groupId:undefined}
        onClick={()=>{if(selected){setStatus(undefined);setReview(exact?undefined:{key:selected,revisionKey});}}}>核对选择</button>
    </div>}
    {chosen&&exact&&<DanxiaMedicineConfirmation choice={chosen} groupId={groupId} disabled={disabled} onCancel={cancel}
      onConfirm={()=>{
        if(disabled||!onQueue||attempted.current===exact)return;
        attempted.current=exact;
        setReview(undefined);
        if(onQueue(chosen.option)){
          setSelected(undefined);setStatus('已排入下一轮，尚未移动药材。');
        }else setStatus('这项选择已不适用，未排入指令。');
      }}/>}
    {status&&<p role="status" className="text-teal-100">{status}</p>}
  </section>;
}

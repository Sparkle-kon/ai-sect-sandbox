import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {WorkshopReleaseOption} from '../engine/workshopEngine';
import type {WorkshopOrder,WorkshopReleaseNegotiation} from '../types/world';

export interface WorkshopReleaseControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly WorkshopReleaseOption[];
  pending?:WorkshopReleaseOption;
  disabled?:boolean;
  onQueue:(choice:WorkshopReleaseOption,revision:object)=>boolean;
}
const button='min-h-11 min-w-0 max-w-full rounded border border-amber-500/35 bg-slate-950 px-2 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const labels:Record<WorkshopReleaseOption['workshopReleaseMove'],string>={
  propose:'提议停作余件',accept:'同意停作余件',decline:'谢绝，照原约走',
};
const optionKey=(option:WorkshopReleaseOption)=>JSON.stringify([option.action,option.targetWorkshopId,
  option.workshopReleaseMove,option.targetWorkshopReleaseId??null]);
type Stage={choice:WorkshopReleaseOption;revision:object};
export function reviewedWorkshopRelease(stage:Stage|undefined,revision:object,menu:readonly WorkshopReleaseOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const exact=menu.filter(option=>optionKey(option)===optionKey(stage.choice));
  return exact.length===1?exact[0]:undefined;
}
export function workshopReleaseMenu(order:WorkshopOrder,actorId:string,tick:number,choices:readonly WorkshopReleaseOption[]){
  if(order.status!=='active'||order.acceptedTick===undefined||order.acceptedTick>tick||
      (order.patronId!==actorId&&order.makerId!==actorId))return [];
  const rows=choices.filter(choice=>choice.action==='WORKSHOP_RELEASE'&&choice.targetWorkshopId===order.id&&
    (choice.workshopReleaseMove==='propose'||order.releaseNegotiations?.some(row=>row.id===choice.targetWorkshopReleaseId&&
      row.status==='offered'&&row.offeredTick<=tick&&row.expiresTick>tick+1&&row.proposerId!==actorId)));
  return rows.filter(row=>rows.filter(other=>optionKey(other)===optionKey(row)).length===1);
}
function Outcome({row,author,patron,tick}:{row:WorkshopReleaseNegotiation;author:boolean;patron:boolean;tick:number}){
  if(row.offeredTick>tick)return null;
  const status=row.closedTick!==undefined&&row.closedTick<=tick?row.status:'offered';
  switch(status){
    case 'offered':return <p>{author?'本人已提议':'对方已提议'}停作余件，最迟第 {row.expiresTick} 轮前回应。只提议，托管没动，工序未停。</p>;
    case 'accepted':return <p>双方已同意停作。{patron?'退回本人':'退给原委托人'} {row.returnedStones} 灵石、{row.returnedHerbs} 株玄土根，只退未耗余料。</p>;
    case 'declined':return <p>对方谢绝释约。没有据这次议约退款，原约不因拒绝而停止。</p>;
    case 'expired':return <p>释约提议到期，未获同意。没有据此退款，这不是原工期的结案。</p>;
    case 'superseded':return <p>{row.supersededBy==='work_changed'?'原工序已有变化':'原委托另行结案'}，这次释约提议作废，没有据此退款。</p>;
  }
}
export function WorkshopReleaseRead({order,actorId,tick,controls}:{order:WorkshopOrder;actorId:string;tick:number;controls?:WorkshopReleaseControls}){
  const [stage,setStage]=useState<Stage>();
  const [notice,setNotice]=useState('');
  const label=useId();
  if(order.patronId!==actorId&&order.makerId!==actorId||(order.acceptedTick??Infinity)>tick)return null;
  const notices=(order.releaseNegotiations??[]).filter(row=>row.offeredTick<=tick);
  const row=notices.at(-1);
  const menu=workshopReleaseMenu(order,actorId,tick,controls?.choices??[]);
  const pending=controls?.pending;
  const herePending=pending?.targetWorkshopId===order.id?pending:undefined;
  const choice=controls&&reviewedWorkshopRelease(stage,controls.revisionKey,menu);
  if(!row&&!menu.length&&!herePending)return null;
  const first=order.work.find(entry=>entry.stage==='finish'&&entry.piece===1&&entry.tick<=tick);
  const delivered=first?.artifactId!==undefined&&first.feePaid!==undefined;
  return <section className="min-w-0 space-y-1.5 rounded border border-amber-500/25 p-2 [overflow-wrap:anywhere]" aria-label="停作余件与双方释约">
    <p className="font-semibold text-amber-100">停作余件</p>
    {first&&<p>{delivered?'首件已交，实发工钱不重算。':'首件已耗料，但没有达标器物交付，也没付工钱。'}</p>}
    {row&&<Outcome row={row} author={row.proposerId===actorId} patron={order.patronId===actorId} tick={tick}/>}
    {herePending&&<p role="status">已候下月：{labels[herePending.workshopReleaseMove]}。还没落印或退款。</p>}
    {controls&&!pending&&menu.length>0&&<div className="flex flex-wrap gap-1">
      {menu.map(option=><button key={optionKey(option)} type="button" className={button} disabled={controls.disabled}
        aria-pressed={choice===option} onClick={()=>{setStage({choice:option,revision:controls.revisionKey});setNotice('');}}>{labels[option.workshopReleaseMove]}</button>)}
    </div>}
    {choice&&controls&&!pending&&!controls.disabled&&<div role="group" className="space-y-1" aria-labelledby={label}>
      <p id={label}>{choice.workshopReleaseMove==='accept'?
        '实际同意时只退仍在原托管中的余料，旧交割照旧。':choice.workshopReleaseMove==='propose'?
        '先提出停作。下月核准后仍要等另一原签人应允。':'只回应本次提议，不改原工序或托管。'}
        排入只耗 {AVATAR_ORDER_COST} 神识，下月还要核对本人和原约。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，余料还未动。':'本人、时机或原约已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={button} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

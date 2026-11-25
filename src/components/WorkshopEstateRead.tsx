import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {WorkshopEstateOption} from '../engine/workshopEngine';
import type {WorkshopEstateReleaseReason,WorkshopOrder} from '../types/world';

export interface WorkshopEstateControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly WorkshopEstateOption[];
  pending?:WorkshopEstateOption;
  disabled?:boolean;
  onQueue:(choice:WorkshopEstateOption,revision:object)=>boolean;
}
const labels:Record<WorkshopEstateOption['workshopEstateMove'],string>={
  offer:'持原据请续制',accept:'同意原坯续制',decline:'谢绝续制',
};
const terms:Record<WorkshopEstateOption['workshopEstateMove'],string>={
  offer:'按已核的继承权，在旧工坊请原工匠续作。只是提出，不另收钱，不起炉。',
  accept:'认原来的坯和未耗托管。核准后从旧坯接着做，验质完工再交器。',
  decline:'不再续这方旧坯。原工序照录，只按实有未耗托管结案。',
};
const close:Record<WorkshopEstateReleaseReason,string>={
  unclaimed:'未有合资格的续制请求',declined:'原工匠谢绝续制',lapsed:'续制期限已过',
  maker_unavailable:'原工匠不能再承作',heir_unavailable:'原受益人已不能接续',site_unavailable:'原工坊不能再用',
};
const button='min-h-11 min-w-0 max-w-full rounded border border-amber-500/35 bg-slate-950 px-2 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const key=(row:WorkshopEstateOption)=>JSON.stringify([row.action,row.workshopEstateMove,row.targetWorkshopId]);
type Stage={choice:WorkshopEstateOption;revision:object};
export function reviewedWorkshopEstate(stage:Stage|undefined,revision:object,menu:readonly WorkshopEstateOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const exact=menu.filter(row=>key(row)===key(stage.choice));
  return exact.length===1?exact[0]:undefined;
}
/** Native exact viewer/next-month menu is the authority. The private order view is already scoped. */
function availableEstateMenu(order:WorkshopOrder,actorId:string,tick:number,choices:readonly WorkshopEstateOption[]){
  const record=order.estateContinuation;
  if(!record||order.status!=='probate_hold'||record.heldTick>tick)return [];
  const rows=choices.filter(row=>row.action==='WORKSHOP_ESTATE'&&row.targetWorkshopId===order.id&&
    (row.workshopEstateMove==='offer'?record.phase==='held'&&actorId!==order.patronId&&actorId!==order.makerId:
      record.phase==='offered'&&actorId===order.makerId&&(record.offeredTick??Infinity)<=tick&&(record.replyUntilTick??-1)>tick+1));
  return rows.filter(row=>rows.filter(other=>key(other)===key(row)).length===1);
}
export function WorkshopEstateRead({order,actorId,tick,controls}:{
  order:WorkshopOrder;actorId:string;tick:number;controls?:WorkshopEstateControls;
}){
  const [stage,setStage]=useState<Stage>(),[notice,setNotice]=useState('');
  const label=useId();
  const record=order.estateContinuation;
  const blank=order.work.find(step=>step.stage==='blank'&&step.piece===1&&step.tick<=tick);
  if(!record||record.heldTick>tick||!blank)return null;
  const menu=availableEstateMenu(order,actorId,tick,controls?.choices??[]);
  const choice=controls&&reviewedWorkshopEstate(stage,controls.revisionKey,menu);
  const herePending=controls?.pending?.targetWorkshopId===order.id?controls.pending:undefined;
  const finished=order.work.find(step=>step.stage==='finish'&&step.piece===1&&step.tick<=tick);
  return <section aria-label="遗下原坯与续制" className="min-w-0 space-y-1.5 rounded border border-amber-500/25 p-2 [overflow-wrap:anywhere]">
    <h6 className="font-semibold text-amber-100">承接旧坯</h6>
    <p>原工匠已经制成这一方坯，实耗照旧记在原单。先封护这方坯和尚未用的托管，不能再收一份。</p>
    {record.phase==='held'&&<p>旧坯仍封存。只有承接权已经核定的人，才能到原工坊请续作。此处尚未复工。</p>}
    {record.phase==='offered'&&<p>核定的受益人已请续制，等原工匠亲自答复。没有重新出资，也未复工。{record.replyUntilTick!==undefined&&<> 原工匠须在第 {record.replyUntilTick} 轮前答复。</>}</p>}
    {record.phase==='resumed'&&<p>原工匠已同意，从旧坯接着做。完工验质后再交器。</p>}
    {record.phase==='completed'&&<p>{finished?.artifactId&&finished.feePaid!==undefined?
      '同一方坯已续制验收。器物已实际交给核定的受益人，工钱只在这次交割时付。':
      '同一方坯已续作验质，未达原约门槛。无器物交割，也未付工钱。'}
      {(order.refundedStones>0||order.refundedHerbs>0)&&<> 已实退未耗余料：{order.refundedStones} 灵石、{order.refundedHerbs} 株玄土根。</>}</p>}
    {record.phase==='released'&&<p>{record.releaseReason?close[record.releaseReason]:'原单已经结案'}，没有续制交割。
      {order.refundedStones>0||order.refundedHerbs>0?<>只实退未耗的 {order.refundedStones} 灵石、{order.refundedHerbs} 株玄土根回原遗产账。</>:'没有实退余料。'}</p>}
    {herePending&&<p role="status">已候下月：{labels[herePending.workshopEstateMove]}。原坯和托管此刻未动。</p>}
    {controls&&!controls.pending&&menu.length>0&&<div className="flex flex-wrap gap-1">
      {menu.map(option=><button key={key(option)} type="button" className={button} disabled={controls.disabled}
        aria-pressed={choice===option} onClick={()=>{setStage({choice:option,revision:controls.revisionKey});setNotice('');}}>{labels[option.workshopEstateMove]}</button>)}
    </div>}
    {choice&&controls&&!controls.pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-1">
      <p id={label}>{terms[choice.workshopEstateMove]}排入只耗 {AVATAR_ORDER_COST} 神识，下月还要核对原人、原址和原单。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，原坯和托管未动。':'原人、时机或凭据已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={button} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

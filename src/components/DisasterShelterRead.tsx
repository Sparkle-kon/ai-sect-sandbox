import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {DisasterShelter,DisasterShelterOption} from '../types/disasterShelter';
import type {Cultivator,WorldState} from '../types/world';

export interface DisasterShelterControls {
  scopeKey:string;revisionKey:object;
  choices:readonly DisasterShelterOption[];
  pending?:DisasterShelterOption;disabled?:boolean;
  onQueue:(choice:DisasterShelterOption,revision:object)=>boolean;
}
type Stage={choice:DisasterShelterOption;revision:object};
const entry='min-h-11 min-w-0 max-w-full rounded border border-emerald-500/40 bg-slate-950 px-2 text-emerald-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const summary='flex min-h-11 cursor-pointer items-center font-semibold text-emerald-100 focus-visible:outline focus-visible:outline-amber-300';
const names:Record<DisasterShelterOption['disasterShelterMove'],string>={
  offer:'邀来避一避',accept:'应下暂借住处',decline:'谢绝借住',withdraw:'撤下邀约',return:'请沿原路归家',
};
const terms:Record<DisasterShelterOption['disasterShelterMove'],string>={
  offer:'只向真能赴约的原户代表留话。此时尚未借出住处，也没人启程。',
  accept:'应约才留住处，但仍要沿可走的原路实到，才算住下。不改户籍。',
  decline:'谢绝这次借住，不补写启程或入住。',
  withdraw:'收回尚未动身的借住约；已经留的住处会空出，不改原户籍。',
  return:'只请沿原路回去。实际离开后才空出住处，实到原地才记归家，不替亲属落名。',
};
const key=(choice:DisasterShelterOption)=>JSON.stringify(choice.disasterShelterMove==='offer'?
  [choice.action,choice.disasterShelterMove,choice.targetCultivatorId]:[choice.action,choice.disasterShelterMove,choice.targetDisasterShelterId]);
const nameOf=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)?.name
  .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').trim().slice(0,50);
function active(row:DisasterShelter){return row.status==='offered'||row.status==='reserved'||row.status==='outbound'||
  row.status==='occupied'||row.status==='returning';}
function belongs(row:DisasterShelter,id:string){return row.host.actorId===id||row.guest.actorId===id;}
export function reviewedDisasterShelter(stage:Stage|undefined,revision:object,menu:readonly DisasterShelterOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const match=menu.filter(choice=>key(choice)===key(stage.choice));
  return match.length===1?match[0]:undefined;
}
function uniqueMenu(choices:readonly DisasterShelterOption[]){
  const counts=new Map<string,number>();
  for(const row of choices)counts.set(key(row),(counts.get(key(row))??0)+1);
  return choices.filter(row=>counts.get(key(row))===1);
}
function raised(row:DisasterShelter,id:string,choice:DisasterShelterOption,tick:number){
  if(choice.disasterShelterMove==='offer'||choice.targetDisasterShelterId!==row.id||!belongs(row,id))return false;
  if(choice.disasterShelterMove==='return')return row.guest.actorId===id&&row.status==='occupied'&&
    row.arrivedTick!==undefined&&row.arrivedTick<=tick&&!row.returnRequestedTick;
  if(choice.disasterShelterMove==='withdraw'&&row.status==='reserved')return row.acceptedTick!==undefined&&row.acceptedTick<=tick;
  if(row.status!=='offered'||row.offeredTick>tick||row.expiresTick<=tick+1)return false;
  return choice.disasterShelterMove==='withdraw'?row.host.actorId===id:row.guest.actorId===id;
}
function moveName(choice:DisasterShelterOption,world:WorldState){
  return choice.disasterShelterMove==='offer'?'请'+(nameOf(world,choice.targetCultivatorId)??'原户代表')+'来避灾':names[choice.disasterShelterMove];
}
function shelterStory(row:DisasterShelter,tick:number){
  const has=(when:number|undefined)=>when!==undefined&&when<=tick;
  switch(row.status){
    case 'offered':return '有一封借住邀约，尚未应允。没人启程，住处也没有被占用。';
    case 'reserved':return '原户代表已应约，留有一处可借住；尚未启程，也没有入住。';
    case 'outbound':return has(row.departedTick)?
      '赴避客已在去路上，仍未到借住处。借住的席位仍留着。':'尚无启程凭据，也没有入住。';
    case 'occupied':return has(row.arrivedTick)?
      '赴避客确已到原订住处，正在借住。只有这位实际到场的代表占一处。':'有借住约，但眼下不能核实已经入住。';
    case 'returning':return has(row.returnDepartedTick)?
      '赴避客确已离开借住处，正在原路返家。住处已空出，人还没到家。':
      '已请归家，还未实际离开借住处。人仍借住，住处未空出。';
    case 'returned':return has(row.returnedTick)?'原代表确已归到原地，借住已结束。':'借住已结束，但眼下不能核实已经归家。';
    case 'declined':return '赴避客已谢绝，没启程，也没占住处。';
    case 'withdrawn':return has(row.acceptedTick)?'尚未动身的借住约已撤下，留的住处已经空出。':'邀约已撤下，没有因此启程或入住。';
    case 'expired':return '未应允的邀约已到期，没有因此入住。';
    case 'stranded':return '原约不能继续。尚未看到后续实际到达，不把中断写成入住或归家。';
    case 'lost':return '此段避灾已中断，现已不能核对代表的去处。不补记入住或归家。';
  }
}
export function DisasterShelterReceipt({world,row,actorId}:{world:WorldState;row:DisasterShelter;actorId:string}){
  const host=nameOf(world,row.host.actorId)??'留宿人',guest=nameOf(world,row.guest.actorId)??'赴避客';
  return <div className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
    <p className="font-medium text-emerald-100">{row.host.actorId===actorId?'本人留下住处':host+'留住处'} ·
      {row.guest.actorId===actorId?'本人赴避':guest+'赴避'}</p>
    <p>{shelterStory(row,world.tick)}</p>
    <p className="text-slate-400">两户原籍和登记住处照旧。这张约只记两名原户代表，不把别的家人算成同行、入住或归家。</p>
  </div>;
}
export function DisasterShelterRead({world,viewer,rows,controls}:{
  world:WorldState;viewer:Cultivator;rows:readonly DisasterShelter[];controls?:DisasterShelterControls;
}){
  const [stage,setStage]=useState<Stage>(),[notice,setNotice]=useState('');
  const heading=useId();
  const cases=rows.filter(row=>belongs(row,viewer.id)&&row.offeredTick<=world.tick)
    .sort((a,b)=>b.offeredTick-a.offeredTick);
  const read=cases.find(active)??cases[0],past=cases.filter(row=>row!==read);
  const menu=uniqueMenu(controls?.choices??[]).filter(choice=>choice.action==='DISASTER_SHELTER'&&
    (choice.disasterShelterMove==='offer'?choice.targetCultivatorId!==viewer.id&&!!nameOf(world,choice.targetCultivatorId):
      cases.some(row=>raised(row,viewer.id,choice,world.tick))));
  const pending=controls?.pending;
  if(!cases.length&&!menu.length&&!pending)return null;
  const choice=controls&&reviewedDisasterShelter(stage,controls.revisionKey,menu);
  return <details className="min-w-0 space-y-2 rounded border border-emerald-500/30 bg-slate-950 px-2 pb-2 text-sm [overflow-wrap:anywhere]">
    <summary className={summary}>借一处避灾</summary>
    {read&&<DisasterShelterReceipt world={world} row={read} actorId={viewer.id}/>}
    {pending&&<p role="status">已候下月：{moveName(pending,world)}。人还没动，户籍与住处实况不因排令改变。</p>}
    {controls&&!pending&&menu.length>0&&<div className="flex flex-wrap gap-1">
      {menu.map(option=><button key={key(option)} type="button" disabled={controls.disabled} className={entry}
        aria-pressed={choice===option} onClick={()=>{setStage({choice:option,revision:controls.revisionKey});setNotice('');}}>
        {moveName(option,world)}</button>)}
    </div>}
    {choice&&controls&&!pending&&!controls.disabled&&<div className="space-y-1 rounded border border-slate-800 p-2" role="group" aria-labelledby={heading}>
      <p id={heading}>{terms[choice.disasterShelterMove]} 排入只耗 {AVATAR_ORDER_COST} 神识，下月才核对本人、留宿处和实路。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={entry} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，尚未启程、入住或归家。':'人、路或时机已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={entry} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
    {past.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className={summary}>看往日借住凭据</summary>
      <div className="space-y-1 pb-2">{past.map(row=><DisasterShelterReceipt key={row.id} world={world} row={row} actorId={viewer.id}/>)}</div>
    </details>}
  </details>;
}

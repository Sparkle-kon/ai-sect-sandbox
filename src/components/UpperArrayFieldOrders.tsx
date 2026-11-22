import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';

export interface ArrayFieldControls<Order> {
  scopeKey:string;
  revisionKey:object;
  choices:readonly Order[];
  pending?:Order;
  disabled?:boolean;
  onQueue:(order:Order,revision:object)=>boolean;
}
interface Stage<Order> {order:Order;revision:object}
export function reviewedArrayFieldOrder<Order>(stage:Stage<Order>|undefined,revision:object,menu:readonly Order[],key:(order:Order)=>string){
  if(!stage||stage.revision!==revision)return undefined;
  const matches=menu.filter(order=>key(order)===key(stage.order));
  return matches.length===1?matches[0]:undefined;
}
export function uniqueArrayFieldOrders<Order>(menu:readonly Order[],key:(order:Order)=>string){
  const counts=new Map<string,number>();
  for(const order of menu){const id=key(order);counts.set(id,(counts.get(id)??0)+1);}
  return menu.filter(order=>counts.get(key(order))===1);
}
export const arrayFieldButton='min-h-11 min-w-0 rounded border border-amber-800 bg-slate-950 px-2.5 py-1 text-sm text-slate-100 focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50 [overflow-wrap:anywhere]';
export const arrayFieldFold='min-w-0 space-y-2 rounded border border-amber-900/70 bg-slate-950 px-3 pb-3 text-sm text-slate-100 [overflow-wrap:anywhere]';
export const arrayFieldSummary='flex min-h-11 cursor-pointer items-center font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300';
export function UpperArrayFieldOrders<Order>({controls,menu,pending,orderKey,name,terms}:{
  controls?:ArrayFieldControls<Order>;menu:readonly Order[];pending?:Order;
  orderKey:(order:Order)=>string;name:(order:Order)=>string;terms:(order:Order)=>string;
}){
  const [stage,setStage]=useState<Stage<Order>>();
  const [notice,setNotice]=useState('');
  const id=useId();
  if(!controls||(!menu.length&&!pending&&!notice))return null;
  const choice=reviewedArrayFieldOrder(stage,controls.revisionKey,menu,orderKey);
  return <div className="space-y-2">
    {pending&&<p role="status">已候下月：{name(pending)}。人身、材料与货物还未动。</p>}
    {!controls.pending&&menu.length>0&&<div className="flex flex-wrap gap-1.5">
      {menu.map(order=><button type="button" key={orderKey(order)} className={arrayFieldButton} aria-pressed={choice===order}
        disabled={controls.disabled} onClick={()=>{setNotice('');setStage({order,revision:controls.revisionKey});}}>{name(order)}</button>)}
    </div>}
    {choice&&!controls.pending&&!controls.disabled&&<div className="space-y-2 rounded border border-slate-700 p-2" role="group" aria-labelledby={id}>
      <p id={id}>{terms(choice)} 排令只耗 {AVATAR_ORDER_COST} 神识，下月才复核执行。</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={arrayFieldButton} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，尚未支料、落笔或起身。':'所在处、人身或时机已变，未记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={arrayFieldButton} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

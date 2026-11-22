import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {CivicMemorialOption,CivicPlaqueView} from '../engine/civicMemorialEngine';
import type {WorldState} from '../types/world';

export type CivicMemorialAppendOption=Extract<CivicMemorialOption,{civicMemorialMove:'append_relief'}>;
export interface CivicMemorialAppendControls {
  scopeKey:string;revisionKey:object;
  choices:readonly CivicMemorialAppendOption[];
  pending?:CivicMemorialAppendOption;disabled?:boolean;
  onQueue:(choice:CivicMemorialAppendOption,revision:object)=>boolean;
}
type Stage={choice:CivicMemorialAppendOption;revision:object};
const action='min-h-11 min-w-0 max-w-full rounded border border-amber-500/40 bg-slate-950 px-2 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const key=(choice:CivicMemorialAppendOption)=>JSON.stringify([choice.action,choice.civicMemorialMove,
  choice.targetCivicMemorialId,choice.targetCivicDeedId]);
export function reviewedCivicMemorialAppend(stage:Stage|undefined,revision:object,menu:readonly CivicMemorialAppendOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const exact=menu.filter(row=>key(row)===key(stage.choice));
  return exact.length===1?exact[0]:undefined;
}
function source(world:WorldState,id:string,siteId:string,after:number){
  const rows=world.civicMemorials.deeds.filter(deed=>deed.id===id&&deed.settlementId===siteId&&deed.tick>after&&deed.tick<=world.tick);
  return rows.length===1?rows[0]:undefined;
}
export function CivicMemorialAppendRead({world,plaque,settlementId,controls}:{
  world:WorldState;plaque:CivicPlaqueView;settlementId:string;controls?:CivicMemorialAppendControls;
}){
  const [stage,setStage]=useState<Stage>(),[notice,setNotice]=useState('');
  const label=useId();
  const later=(plaque.additions??[]).filter(row=>row.appendedTick<=world.tick&&row.deedTick>plaque.deedTick);
  const pending=controls?.pending;
  const own=pending?.targetCivicMemorialId===plaque.id;
  const offered=(controls?.choices??[]).filter(row=>row.action==='CIVIC_MEMORIAL'&&row.civicMemorialMove==='append_relief'&&
    row.targetCivicMemorialId===plaque.id&&!!source(world,row.targetCivicDeedId,settlementId,plaque.deedTick));
  const menu=offered.filter(row=>offered.filter(other=>key(other)===key(row)).length===1);
  const choice=controls&&reviewedCivicMemorialAppend(stage,controls.revisionKey,menu);
  const deed=choice&&source(world,choice.targetCivicDeedId,settlementId,plaque.deedTick);
  if(!later.length&&!menu.length&&!own)return null;
  return <section aria-label="乡祠原册的后来凭据" className="mt-2 min-w-0 space-y-1.5 rounded border border-amber-500/25 p-2 [overflow-wrap:anywhere]">
    <h5 className="font-semibold text-amber-100">后来附记</h5>
    {later.length>0&&<ul aria-label="实赈以后另附的凭据" className="space-y-1">
      {later.map(row=><li key={row.id} className="rounded bg-slate-900/70 p-2">
        <p>另一次实赈：第 {row.deedTick} 轮，本村实收 {row.stones} 灵石、{row.herbs} 份翡翠灵叶。</p>
        <p className="text-slate-300">第 {row.appendedTick} 轮据原凭另附。原册、人名与立册时的记载照旧。</p>
      </li>)}
    </ul>}
    {own&&<p role="status">已候下月：另附实赈凭据。原册尚未添写；不再收物，也不重付赈济。</p>}
    {controls&&!pending&&menu.length>0&&<div className="flex flex-wrap gap-1">
      {menu.map(option=>{
        const target=source(world,option.targetCivicDeedId,settlementId,plaque.deedTick);
        if(!target)return null;
        return <button key={key(option)} type="button" disabled={controls.disabled} className={action}
          aria-pressed={choice===option} onClick={()=>{setStage({choice:option,revision:controls.revisionKey});setNotice('');}}>
          核对第 {target.tick} 轮后记
        </button>;
      })}
    </div>}
    {choice&&deed&&controls&&!pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-1 rounded border border-slate-800 p-2">
      <p id={label}>这份附记只核第 {deed.tick} 轮另一次实赈：{deed.stones} 灵石、{deed.herbs} 份翡翠灵叶。
        排入只耗 {AVATAR_ORDER_COST} 神识，下月仍须核本人见证、原册及实凭。此刻不改原册、不另拨赈济。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={action} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，原册还没添写。':'原册、时机或见证已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={action} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}

import { useState } from 'react';
import { DanxiaSeasonBranchReading, type DanxiaSeasonBranchResult } from './DanxiaSeasonReviewReceipts';

export interface DanxiaSeasonBranchTarget { discipleId:string; settlementId:string; shortageId:string }
type Target=DanxiaSeasonBranchTarget;
export interface DanxiaSeasonBranchComparisonProps {
  scopeKey:string;
  revision:object;
  options:readonly (Target & {label:string})[];
  onRead:(target:Target)=>DanxiaSeasonBranchResult;
}
const choiceKey=({discipleId,settlementId,shortageId}:Target)=>JSON.stringify([discipleId,settlementId,shortageId]);
const action='min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50';

export function DanxiaSeasonBranchComparison({scopeKey,...props}:DanxiaSeasonBranchComparisonProps) {
  if(!props.options.length)return null;
  return <ScopedSeasonComparison key={scopeKey} {...props}/>;
}

function ScopedSeasonComparison({revision,options,onRead}:Omit<DanxiaSeasonBranchComparisonProps,'scopeKey'>) {
  const [open,setOpen]=useState(false);
  const [picked,setPicked]=useState<string>();
  const [reading,setReading]=useState<{key:string;revision:object;result:DanxiaSeasonBranchResult}>();
  const matches=picked?options.filter(row=>choiceKey(row)===picked):[];
  const exact=matches.length===1?matches[0]:undefined;
  return <details className="min-w-0 rounded border border-teal-500/25 bg-slate-950/55"
    onToggle={(event)=>setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-teal-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">丹荒旧案对读</summary>
    {open&&<div className="min-w-0 space-y-1.5 px-2 pb-2">
      <label className="grid min-w-0 gap-1 text-xs text-slate-300">两支均可核对的备药人和村镇
        <select className={`${action} w-full text-base`} value={exact?String(options.indexOf(exact)):''}
          onChange={(event)=>{
            const selected=options.find((_,i)=>String(i)===event.currentTarget.value);
            setPicked(selected?choiceKey(selected):undefined);setReading(undefined);
          }}>
          <option value="">请选择</option>
          {options.map((row,i)=><option key={choiceKey(row)} value={i}>{row.label}</option>)}
        </select>
      </label>
      <button type="button" className={`${action} py-1.5 text-xs`} disabled={!exact} onClick={()=>{
        if(!exact)return;
        setReading({revision,key:choiceKey(exact),result:onRead({discipleId:exact.discipleId,settlementId:exact.settlementId,shortageId:exact.shortageId})});
      }}>对读这笔原案</button>
      {exact&&reading?.revision===revision&&reading.key===choiceKey(exact)&&<DanxiaSeasonBranchReading result={reading.result}/>}
    </div>}
  </details>;
}

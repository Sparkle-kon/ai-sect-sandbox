import {useEffect,useId,useRef,useState} from 'react';
import type {DaoPathOption,DaoPathView} from '../engine/daoPathEngine';
import {DAO_INTENT_QI,DAO_PATH_MAX_PRACTICES,DAO_PATH_RANK_COUNTS,DAO_PATHS} from '../engine/daoPathTerms';

import {HERB_LABELS} from '../engine/alchemyEngine';

const touch='min-h-11 min-w-0 rounded-md border border-violet-300/35 px-3 py-1.5 text-left text-sm text-violet-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50';

function DaoInk(){
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 42 34" className="h-8 w-10 shrink-0 text-violet-300">
    <path d="m14 27 13-18 7-4-2 7-14 18-4-3Zm-2-4 9 7m-4-9-8 6-1 4 4-1 6-7M8 17c0-6 5-10 10-11m11 22c5-2 8-6 8-11"
      fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export interface DaoPathControls {
  busy?:boolean;
  guide?:(option:DaoPathOption)=>Promise<boolean>;
}

const rankName=['未领悟','初窥','入微','圆成'] as const;

function DaoProgress({view,tick}:{view:DaoPathView;tick:number}){
  if(!view.pathId)return null;
  const path=DAO_PATHS[view.pathId];
  return <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/65 p-2.5">
    <p className="text-sm leading-relaxed text-slate-200">{path.description}</p>
    <p className="text-sm font-semibold text-violet-100">{view.rank?path.intent+' · '+rankName[view.rank]:'尚未领悟道意'}</p>
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
      <meter aria-label="功课进境" min={0} max={DAO_PATH_MAX_PRACTICES} value={view.practiceCount} className="h-2 w-24 accent-violet-300"/>
      <span>实修 {view.practiceCount} 次{view.nextRankAt!==undefined?` · 到 ${view.nextRankAt} 次再进一阶`:''}</span>
    </div>
    <ol aria-label="道途进阶" className="grid grid-cols-3 gap-1 text-xs">
      {DAO_PATH_RANK_COUNTS.map((required,index)=><li key={required}
        className={`rounded px-1.5 py-1 ${view.practiceCount>=required?'bg-violet-950/80 text-violet-100':'bg-slate-950 text-slate-400'}`}>
        {rankName[index+1]} · {required} 次
      </li>)}
    </ol>
    {view.artifactName&&<p className="text-xs text-slate-300 [overflow-wrap:anywhere]">所系本命之器：{view.artifactName}</p>}
    {view.ready&&<p className="text-sm text-violet-100">
      已蓄意，未出手 · 余 {Math.max(0,view.ready.expiresTick-tick)} 月。须在实际合规的交手中才会施展并耗 {DAO_INTENT_QI} 真气。
    </p>}
  </div>;
}

function DaoPaidReceipts({activations}:{activations:DaoPathView['activations']}){
  if(!activations.length)return null;
  return <ul aria-label="道意出手实录" className="space-y-1 text-xs text-slate-300">
    {activations.map(row=><li key={row.eventId} className="rounded border border-slate-800 bg-slate-950 p-2">
      已在交手中施展{DAO_PATHS[row.pathId].intent} · {rankName[row.rank]} · 实耗 {row.qiPaid} 真气
    </li>)}
  </ul>;
}

function DaoChoice({option,busy,onChoose}:{option:DaoPathOption;busy:boolean;onChoose:()=>void}){
  const path=DAO_PATHS[option.targetDaoPathId];
  const practicePrice=[`${path.qi} 真气`,path.herb?`1 株${HERB_LABELS[path.herb]}`:undefined,
    path.stones?`${path.stones} 灵石`:undefined,path.hp?`${path.hp} 气血`:undefined].filter(Boolean).join('、');
  const label={
    choose:`入${path.name}`,practice:'行一轮功课',ready:`蓄意：${path.intent}`,cancel:'收回蓄意',
  }[option.daoPathMove];
  const note={
    choose:path.description,practice:`本轮消耗 ${practicePrice}。`,
    ready:`此刻先蓄意，出手另有时机。实际出手时才耗 ${DAO_INTENT_QI} 真气。`,cancel:'只收回蓄意，不会施展道意。',
  }[option.daoPathMove];
  return <button type="button" className={touch} disabled={busy} onClick={onChoose}>
    <span className="block font-semibold">{label}</span>
    <span className="block text-xs leading-relaxed text-slate-300">{note}</span>
  </button>;
}

export function DaoPathRead({view,tick,controls}:{
  view:DaoPathView;tick:number;controls?:DaoPathControls;
}){
  const title=useId();
  const [guiding,setGuiding]=useState(false);
  const [failed,setFailed]=useState(false);
  const inFlight=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const busy=guiding||!!controls?.busy;
  const live=!!controls?.guide;
  const guide=async(option:DaoPathOption)=>{
    if(!controls?.guide||busy||inFlight.current||!view.options.includes(option))return;
    inFlight.current=true;
    setGuiding(true);
    setFailed(false);
    try {
      const advanced=await controls.guide(option);
      if(mounted.current)setFailed(!advanced);
    } catch {if(mounted.current)setFailed(true);}
    finally {inFlight.current=false;if(mounted.current)setGuiding(false);}
  };
  const path=view.pathId===undefined?undefined:DAO_PATHS[view.pathId];
  if(!path&&!(live&&view.options.length))return null;
  return <details aria-labelledby={title} className="min-w-0 rounded-lg border border-violet-300/25 bg-gradient-to-b from-violet-950/25 to-slate-950/80 px-3">
    <summary id={title} className="flex min-h-11 cursor-pointer items-center gap-2 font-serif text-base font-semibold text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
      <DaoInk/>{path?`道途 · ${path.name}`:'择一条道途'}
    </summary>
    <div className="min-w-0 space-y-3 pb-3" aria-busy={busy}>
      {path&&<DaoProgress view={view} tick={tick}/>}
      <DaoPaidReceipts activations={view.activations}/>
      {live&&view.options.length>0&&<>
        <p className="text-xs text-slate-300">{guiding?'正在行过这一月…':'选一项，行过一月。'}</p>
        <div role="group" aria-label="可行道途选择" className="grid min-w-0 gap-1.5 sm:grid-cols-2">
          {view.options.map(option=><DaoChoice key={`${option.daoPathMove}:${option.targetDaoPathId}`}
            option={option} busy={busy} onChoose={()=>void guide(option)}/>)}
        </div>
      </>}
      {failed&&<p role="status" className="text-xs text-amber-200">此令未成。请核对此刻修士所在与余力。</p>}
    </div>
  </details>;
}

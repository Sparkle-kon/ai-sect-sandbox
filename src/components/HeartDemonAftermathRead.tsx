import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {activeAvatar} from '../engine/avatarEngine';
import {projectHeartDemonAftermath,type HeartDemonRecoveryOption} from '../engine/heartDemonAftermathEngine';
import type {Cultivator,WorldState} from '../types/world';

export interface HeartDemonRecoveryControls {
  busy:boolean;
  guide:(option:HeartDemonRecoveryOption)=>Promise<boolean>;
}

export function projectOwnedHeartDemonAftermath(world:WorldState,actor:Cultivator|undefined){
  if(!actor||activeAvatar(world)!==actor||world.cultivators.filter(row=>row.id===actor.id).length!==1)return undefined;
  return projectHeartDemonAftermath(world,actor);
}

export function HeartDemonAftermathRead({world,actor,live,controls}:{
  world:WorldState;actor:Cultivator;live:boolean;controls?:HeartDemonRecoveryControls;
}){
  const title=useId();
  const view=useMemo(()=>projectOwnedHeartDemonAftermath(world,actor),[world,actor]);
  const [working,setWorking]=useState(false);
  const [failed,setFailed]=useState(false);
  const mounted=useRef(false);
  const pending=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false};},[]);
  if(!view)return null;
  const option=live&&view.status==='active'?view.recovery:undefined;
  const recover=async()=>{
    if(!option||!controls||controls.busy||pending.current)return;
    pending.current=true;
    setWorking(true);setFailed(false);
    try {const success=await controls.guide(option);if(mounted.current)setFailed(!success);}
    catch {if(mounted.current)setFailed(true);}
    finally {pending.current=false;if(mounted.current)setWorking(false);}
  };
  return <article aria-labelledby={title} className="min-w-0 space-y-2 rounded-lg border border-indigo-400/30 bg-gradient-to-br from-indigo-950/50 to-slate-950 p-3 [overflow-wrap:anywhere]">
    <p className="text-xs font-semibold tracking-wide text-indigo-200">心魔余波 · {live?'仅本人可见':'本人旧卷'}</p>
    <h4 id={title} className="font-serif text-base font-semibold text-indigo-50">{view.title}</h4>
    <p className="font-serif text-sm leading-6 text-slate-100">{view.scene}</p>
    {view.status==='recovered'&&<p className="text-xs leading-relaxed text-indigo-200">已在静室收心。往后，再不任余波替自己作主。</p>}
    {view.status==='elapsed'&&<p className="text-xs leading-relaxed text-slate-300">余波已经散去，没有留下静室收心的实录。</p>}
    {option&&controls&&<div aria-busy={working} className="space-y-1">
      <p className="text-xs leading-relaxed text-slate-300">此事行过一月，成时实耗 {view.qiCost} 真气。</p>
      <button type="button" disabled={controls.busy||working} onClick={()=>void recover()}
        className="min-h-11 rounded-md border border-indigo-300/40 bg-indigo-950/60 px-3 text-sm font-semibold text-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-200 disabled:opacity-50">
        {working?'正在静室收心…':'静室收心'}
      </button>
    </div>}
    {failed&&<p role="status" className="text-xs text-amber-200">此月未见收心实录，请核对所处之地与余下真气。</p>}
  </article>;
}

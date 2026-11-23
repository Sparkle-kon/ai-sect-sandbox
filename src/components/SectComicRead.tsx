import type {WorldState} from '../types/world';
import {SectRecurringRead,type SectRecurringViews} from './SectRecurringRead';
import type {projectSectComicMoment} from '../engine/sectComedy';
import type {SectComicAppliedEffect} from '../types/sectComedy';
import type {SectJobReport,SectJobReportRow} from '../types/sectJobs';

export type SectComicView=NonNullable<ReturnType<typeof projectSectComicMoment>>;

export function associatedComicRow(comic:SectComicView|undefined,report:SectJobReport|undefined):SectJobReportRow|undefined {
  const source=comic?.moment.source;
  if(!comic||!report||!source||source.phase==='ambient'||comic.moment.tick!==report.settledTick)return undefined;
  const rows=report.rows.filter(row=>row.discipleId===comic.speakerId&&row.jobId===source.jobId&&row.phase===source.phase&&
    row.sourceEventId===source.reportEventId&&(source.phase!=='performed'||row.tier===source.tier));
  return rows.length===1?rows[0]:undefined;
}

function signedEffect(effect:SectComicAppliedEffect){
  if(effect.kind==='kitchen_damage')return '饭堂等级 −1';
  const sign=effect.amount>=0?'+':'−';
  return `真气进度 ${sign}${Math.abs(effect.amount).toLocaleString('zh-CN',{maximumFractionDigits:3})} 个百分点`;
}

export function SectComicEffects({effects}:{effects:readonly SectComicAppliedEffect[]}){
  if(!effects.length)return null;
  return <ul aria-label="小插曲的得失" className="flex flex-wrap gap-1.5 text-xs">
    {effects.map((effect,index)=><li key={`${effect.kind}:${index}`}
      className={`rounded bg-stone-950/80 px-1.5 py-1 ${effect.amount<0?'text-rose-200':'text-emerald-200'}`}>{signedEffect(effect)}</li>)}
  </ul>;
}

export function SectComicAside({world,comic,speaks,visits}:{world:WorldState;comic?:SectComicView;speaks:boolean;visits:SectRecurringViews}){
  return <details data-sect-comic-aside="" className="rounded-lg border border-amber-300/25 bg-stone-950/80 px-3">
    <summary className="min-h-11 cursor-pointer content-center font-serif text-sm text-amber-100 focus-visible:outline focus-visible:outline-amber-300">
      本月小插曲
    </summary>
    {comic&&<div className="min-w-0 space-y-2 pb-2 text-sm text-stone-200 [overflow-wrap:anywhere]">
      <p>{comic.report}</p>
      {speaks&&<blockquote className="border-l border-amber-400/40 pl-2 font-serif leading-6">{comic.speakerName}：「{comic.quote}」</blockquote>}
      <SectComicEffects effects={comic.effects}/>
    </div>}
    <SectRecurringRead world={world} visits={visits}/>
  </details>;
}

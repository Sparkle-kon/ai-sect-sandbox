import type {SectPairDramaView} from '../engine/sectPairDrama';
import {SECT_JOB_DEFINITIONS} from '../engine/sectJobs';
import type {SectJobReport,SectJobReportRow} from '../types/sectJobs';

/** Place the scene once, on the first eligible card in the stage's actual viewing order. */
export function associatedPairDramaRow(
  drama:SectPairDramaView|undefined,report:SectJobReport|undefined,
  stageOrder:readonly SectJobReportRow[]=report?.rows??[],
):SectJobReportRow|undefined{
  if(!drama||!report||report.settledTick!==drama.tick||report.sectId!==drama.sectId||drama.pair[0]===drama.pair[1])return undefined;
  const rows=drama.pair.map(id=>report.rows.filter(row=>row.discipleId===id));
  if(rows.some(matches=>matches.length!==1||matches[0].jobId!==drama.jobId))return undefined;
  const [first,second]=rows.map(([row])=>row);
  if(drama.outcome==='aborted'){
    if([first,second].some(row=>row.phase!=='unavailable'||row.tier!==undefined||row.effects.length>0||
      (row.siteId!==undefined&&row.siteId!==drama.siteId)||row.sourceEventId!==undefined))return undefined;
  }else if([first,second].some(row=>row.phase!=='performed'||row.siteId!==drama.siteId||!row.sourceEventId)||
    first.sourceEventId===second.sourceEventId)return undefined;
  return stageOrder.find(row=>rows.some(([match])=>match===row));
}

function signed(value:number):string{
  return `${value<0?'−':'+'}${Math.abs(value).toLocaleString('zh-CN',{maximumFractionDigits:3})}`;
}

export function SectPairDramaRead({drama}:{drama:SectPairDramaView}){
  return <section aria-label="同门搭档" data-sect-pair-drama=""
    className="min-w-0 space-y-2 rounded-md border border-amber-300/20 bg-stone-950/60 p-2.5 text-sm text-stone-200 [overflow-wrap:anywhere]">
    <p className="font-serif font-semibold text-amber-100">{drama.title}</p>
    <p className="leading-6">{drama.facts}</p>
    <div aria-label="两人各说一句" className="grid gap-1.5">
      {drama.voices.map(voice=><figure key={voice.actorId} className="min-w-0 rounded border-l border-amber-400/40 bg-amber-950/25 px-2 py-1">
        <figcaption className="text-xs font-semibold text-amber-200">{voice.name}说：</figcaption>
        <blockquote className="font-serif leading-6 text-stone-100">「{voice.text}」</blockquote>
      </figure>)}
    </div>
    <ul aria-label="同办得失" className="flex flex-wrap gap-1.5 text-xs">
      <li className={drama.outcome==='aborted'?'text-rose-200':'text-stone-200'}>
        {SECT_JOB_DEFINITIONS[drama.jobId].label}：{drama.outcome==='aborted'?'同办未成':'同办完成'}
      </li>
      <li className={drama.affinityChange<0?'text-rose-200':drama.affinityChange>0?'text-emerald-200':'text-stone-200'}>
        {drama.affinityChange===0?'交情未变':`交情 ${signed(drama.affinityChange)}`}
      </li>
    </ul>
  </section>;
}

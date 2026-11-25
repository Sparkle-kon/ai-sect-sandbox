import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {projectSectReportReaction} from '../engine/sectReaction';
import type {SectReactionCue} from '../types/sectReaction';
import {SectReactionGlyph,useSectReactionShake} from './SectReactionGlyph';
import {SECT_JOB_DEFINITIONS} from '../engine/sectJobs';
import type {SectPairDramaView} from '../engine/sectPairDrama';
import {associatedPairDramaRow,SectPairDramaRead} from './SectPairDramaRead';
import type {SectJobReport,SectJobReportRow} from '../types/sectJobs';
import type {Cultivator,LLMConfig,WorldState} from '../types/world';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {associatedComicRow,SectComicEffects,type SectComicView} from './SectComicRead';
import {useSectBriefingVoices} from './useSectBriefingVoices';
import {sectQuirkLabels} from './sectQuirkLabels';
import {describeSectComicEffect} from './SectComicRead';
import {reportEffectLine,reportExpression,reportTier,reportVoice} from './sectJobReportPresentation';

const tile='min-w-0 rounded-lg border border-amber-300/25 bg-stone-950/60 p-2.5 [overflow-wrap:anywhere]';
const button='min-h-11 rounded-md border border-amber-300/45 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';
const sceneFact=(world:WorldState,report:SectJobReport,row:SectJobReportRow,name:string)=>{
  const event=world.events.find(event=>event.id===row.sourceEventId&&event.tick===report.settledTick&&
    event.locationId===row.siteId&&event.actorIds[0]===row.discipleId);
  const site=world.locations.find(site=>site.id===row.siteId)?.name;
  if(event&&row.errand)return event.description;
  if(row.errand)return `${name}从${site??'差事地点'}回到山门。`;
  const job=SECT_JOB_DEFINITIONS[row.jobId].label;
  if(row.phase==='unavailable')return `${name}没接上本月的「${job}」。`;
  if(row.phase==='on_route')return `${name}${site?`已到${site}`:'动身赶路'}，「${job}」尚有后程。`;
  if(row.effects.some(effect=>effect.kind==='hp'&&effect.amount<0))
    return `${name}${site?`在${site}`:''}办「${job}」时受了伤。`;
  if(row.effects.length)return `${name}${site?`在${site}`:''}交了「${job}」这份差：${row.effects.map(reportEffectLine).join('、')}。`;
  return `${name}${site?`在${site}`:''}交了「${job}」这份差。`;
};
function RowEffects({row}:{row:SectJobReportRow}){
  return row.effects.length>0?<ul className="flex flex-wrap gap-1.5">
    {row.effects.map((effect,step)=><li key={step} className={`rounded bg-stone-950/80 px-1.5 py-1 ${effect.amount<0?'text-rose-200':'text-emerald-200'}`}>
      {reportEffectLine(effect)}
    </li>)}
  </ul>:null;
}
const canSpeak=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
export function SectJobReportStage({world,report,present,comic,drama,onDismiss,onReaction,onDramaVisibility,continuations,model}:{
  world:WorldState;report:SectJobReport;present?:ReadonlySet<string>;comic?:SectComicView;drama?:SectPairDramaView;onDismiss:(report:SectJobReport)=>void;onReaction?:(cue:SectReactionCue|undefined)=>void;
  onDramaVisibility?:(visible:boolean)=>void;continuations?:ReactNode;model?:LLMConfig;
}){
  const title=useId(),heading=useRef<HTMLHeadingElement>(null),visual=useRef<HTMLDivElement>(null);
  const [focus,setFocus]=useState<{report:SectJobReport;id:string}>();
  const finished=useRef<SectJobReport>();
  const cast=useMemo(()=>new Map(world.cultivators.map(actor=>[actor.id,actor])),[world.cultivators]);
  const comicRow=associatedComicRow(comic,report);
  const rows=useMemo(()=>[...report.rows].sort((a,b)=>reportTier(a).order-reportTier(b).order),[report]);
  const dramaRow=associatedPairDramaRow(drama,report,rows);
  const spotlights=[...new Set([comicRow,dramaRow,...rows.filter(row=>row.tier==='disaster'||row.tier==='windfall'||row.tier==='mishap'),rows[0]])]
    .filter((row):row is SectJobReportRow=>!!row).slice(0,2);
  const selected=(focus?.report===report?rows.find(row=>row.discipleId===focus.id):undefined)??spotlights[0];
  const actor=selected&&cast.get(selected.discipleId);
  const portrait=actor&&projectCultivatorPortrait(world,actor);
  const sceneComic=selected&&selected===comicRow?comic:undefined;
  const reaction=useMemo(()=>selected?projectSectReportReaction(world,report,selected):undefined,[world,report,selected]);
  const slots=rows.flatMap(row=>{
    const person=cast.get(row.discipleId);
    if(!canSpeak(person))return [];
    const scene=row===comicRow?comic:undefined;
    const site=world.locations.find(site=>site.id===row.siteId)?.name;
    const effects=[...row.effects.map(reportEffectLine),...(scene?.effects.map(effect=>describeSectComicEffect(effect,world))??[])];
    const facts=[scene?.report??sceneFact(world,report,row,person.name),
      ...(effects.length?[`这一趟的得失：${effects.join('、')}。`]:[])];
    return [{id:row.discipleId,name:person.name,job:SECT_JOB_DEFINITIONS[row.jobId].label,
      site,quirks:sectQuirkLabels(person.quirks),tier:row.tier,realm:person.realm,facts}];
  });
  const modelLines=useSectBriefingVoices(slots,report.settledTick,model);
  useSectReactionShake(visual,reaction);
  useLayoutEffect(()=>{onDramaVisibility?.(!!dramaRow);},[dramaRow,onDramaVisibility]);
  useEffect(()=>{
    onReaction?.(reaction);
    return ()=>onReaction?.(undefined);
  },[onReaction,reaction]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[report]);
  if(!selected)return null;
  const modelLine=modelLines?.get(selected.discipleId);
  const name=actor?.name??'姓名未详的弟子',tier=reportTier(selected);
  return <section aria-labelledby={title} data-sect-report="" className="order-first min-w-0 space-y-3 rounded-xl border border-amber-300/30 bg-stone-950/80 p-3 lg:order-none">
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={title} ref={heading} tabIndex={-1} className="font-serif text-lg font-semibold text-amber-100">月末回山简报</h2>
      <p className="text-xs text-stone-300">{rows.length} 位弟子交差</p>
    </header>
    <section aria-label="本月焦点奇遇" className="space-y-2">
      {spotlights.length>1&&<div className="flex flex-wrap gap-1.5" aria-label="焦点人物">
        {spotlights.map(row=><button type="button" key={row.discipleId} aria-pressed={row===selected}
          className={`${button} text-amber-100 aria-pressed:bg-amber-900/60`}
          onClick={()=>setFocus({report,id:row.discipleId})}>{cast.get(row.discipleId)?.name} · {reportTier(row).label}</button>)}
      </div>}
      <article className={`${tile} space-y-3 bg-amber-950/20`}>
        <div className="flex min-w-0 items-center gap-3">
          {portrait&&<div ref={visual} className="relative shrink-0" data-sect-report-art="">
            <CultivatorPortrait portrait={{...portrait,expression:reportExpression(selected)}}
              className="h-24 w-[5.25rem] sm:h-32 sm:w-28" presentation="stage"/>
            {reaction&&<SectReactionGlyph key={reaction.id} kind={reaction.kind}
              className={reaction.kind==='sparkle'?'absolute left-1/2 top-[29%] h-8 w-10 -translate-x-1/2':
                'absolute -right-2 -top-2 h-9 w-9 sm:h-11 sm:w-11'}/>}
          </div>}
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-semibold text-amber-50">{name}</h3>
            <p className="text-sm text-stone-200">{SECT_JOB_DEFINITIONS[selected.jobId].label} · <strong className={tier.ink}>{tier.label}</strong></p>
            {present?.has(selected.discipleId)&&<p className="text-xs text-stone-300">已回山门</p>}
          </div>
        </div>
        {(!sceneComic||selected.errand)&&!modelLine&&<p className="text-sm leading-6 text-stone-200">{sceneFact(world,report,selected,name)}</p>}
        {(sceneComic||modelLine)&&<p data-sect-comic-report="" className="text-sm leading-6 text-stone-200" data-sect-report-voice={modelLine?'model':undefined}>{modelLine?.report??sceneComic?.report}</p>}
        {canSpeak(actor)&&<blockquote className="border-l border-amber-400/40 pl-2 font-serif text-sm leading-6 text-stone-100">「{modelLine?.quote??sceneComic?.quote??reportVoice(selected,actor)}」</blockquote>}
        <section aria-label="所得与折损" className="space-y-1 text-xs text-stone-300">
          <RowEffects row={selected}/>{!selected.effects.length&&!sceneComic?.effects.length&&<p>这一回账册空着。</p>}{sceneComic&&<SectComicEffects effects={sceneComic.effects} world={world}/>}
        </section>
      </article>
    </section>
    {drama&&dramaRow&&<SectPairDramaRead drama={drama}/>}
    {continuations}
    <section aria-labelledby={`${title}-roster`} className="space-y-1.5">
      <h3 id={`${title}-roster`} className="font-serif text-sm font-semibold text-amber-100">同门差事一览</h3>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {rows.map(row=>{
          const person=cast.get(row.discipleId),label=person?.name??'未署名的弟子',status=reportTier(row);
          const linked=row===comicRow?comic:undefined;
          const generated=modelLines?.get(row.discipleId);
          return <li key={row.discipleId} className={`${tile} text-xs leading-5 text-stone-200`}>
            <button type="button" className="min-h-11 w-full text-left font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300"
              aria-pressed={row===selected} aria-label={`查看${label}的回报`} onClick={()=>setFocus({report,id:row.discipleId})}>
              {label} · {SECT_JOB_DEFINITIONS[row.jobId].label} · <span className={status.ink}>{status.label}</span>
            </button>
            <p>{row===selected?sceneFact(world,report,row,label):generated?.report??linked?.report??sceneFact(world,report,row,label)}</p>
            {canSpeak(person)&&row!==selected&&<p className="text-stone-300">「{generated?.quote??linked?.quote??reportVoice(row,person)}」</p>}
          </li>;
        })}
      </ul>
    </section>
    <button type="button" className={`${button} w-full bg-amber-200 font-semibold text-stone-950`} onClick={()=>{
      if(finished.current===report)return;
      finished.current=report;onDismiss(report);
    }}>知道了，回晨会</button>
  </section>;
}

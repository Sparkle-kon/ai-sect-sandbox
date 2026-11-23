import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {projectSectReportReaction} from '../engine/sectReaction';
import type {SectReactionCue} from '../types/sectReaction';
import {SectReactionGlyph,useSectReactionShake} from './SectReactionGlyph';
import {SECT_JOB_DEFINITIONS} from '../engine/sectJobs';
import type {SectPairDramaView} from '../engine/sectPairDrama';
import {associatedPairDramaRow,SectPairDramaRead} from './SectPairDramaRead';
import type {SectJobReport} from '../types/sectJobs';
import type {WorldState} from '../types/world';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {associatedComicRow,SectComicEffects,type SectComicView} from './SectComicRead';
import {reportEffectLine,reportExpression,reportTier,reportVoice} from './sectJobReportPresentation';

const control='min-h-11 min-w-0 rounded-md border border-amber-300/45 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';

export function SectJobReportStage({world,report,present,comic,drama,onDismiss,onReaction,onDramaVisibility}:{
  world:WorldState;report:SectJobReport;present?:ReadonlySet<string>;comic?:SectComicView;drama?:SectPairDramaView;onDismiss:(report:SectJobReport)=>void;onReaction?:(cue:SectReactionCue|undefined)=>void;
  onDramaVisibility?:(visible:boolean)=>void;
}){
  const title=useId();
  const heading=useRef<HTMLHeadingElement>(null),scene=useRef<HTMLElement>(null);
  const visual=useRef<HTMLDivElement>(null);
  const [cursor,setCursor]=useState<{report:SectJobReport;index:number}>();
  const progress=useRef<{report:SectJobReport;index:number;done?:true}>();
  const index=cursor?.report===report?cursor.index:0;
  const comicRow=associatedComicRow(comic,report);
  const rows=useMemo(()=>[...report.rows].sort((a,b)=>reportTier(a).order-reportTier(b).order),[report]);
  const row=rows[index];
  const dramaVisible=!!row&&row===associatedPairDramaRow(drama,report,rows);
  useLayoutEffect(()=>{onDramaVisibility?.(dramaVisible);},[dramaVisible,onDramaVisibility]);
  const reaction=useMemo(()=>row?projectSectReportReaction(world,report,row):undefined,[world,report,row]);
  useSectReactionShake(visual,reaction);
  useEffect(()=>{
    onReaction?.(reaction);
    return ()=>onReaction?.(undefined);
  },[onReaction,reaction]);

  useEffect(()=>{
    const element=scene.current,titleNode=heading.current;
    if(!element||!titleNode)return;
    titleNode.focus({preventScroll:index>0});
    const win=element.ownerDocument.defaultView;
    if(!win||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof element.animate!=='function')return;
    const animation=element.animate([{opacity:.72},{opacity:1}],{duration:200,easing:'ease-out'});
    return ()=>animation.cancel();
  },[report,index]);

  if(!row)return null;
  const sceneComic=row===comicRow?comic:undefined;
  const matches=world.cultivators.filter(item=>item.id===row.discipleId);
  const actor=matches.length===1?matches[0]:undefined;
  const name=actor?.name??'姓名未详的弟子';
  const atHome=!!actor&&present?.has(actor.id);
  const speaks=!!actor&&actor.alive&&actor.hp>0;
  const portrait=actor&&projectCultivatorPortrait(world,actor);
  const tier=reportTier(row);
  const final=index===rows.length-1;
  const finish=()=>{
    if(progress.current?.report===report&&progress.current.done)return;
    progress.current={report,index,done:true};onDismiss(report);
  };
  const next=()=>{
    if(progress.current?.report===report&&(progress.current.done||progress.current.index>index))return;
    if(final){finish();return;}
    progress.current={report,index:index+1};setCursor({report,index:index+1});
  };

  return <section aria-labelledby={title} data-sect-report="" className="order-first min-w-0 space-y-3 rounded-xl border border-amber-300/30 bg-stone-950/80 p-3 [overflow-wrap:anywhere] lg:order-none">
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={title} className="font-serif text-lg font-semibold text-amber-100">月末回话</h2>
      <p className="text-xs text-stone-300">第 {index+1} / {rows.length} 位</p>
    </header>
    <article ref={scene} className="min-w-0 space-y-3 rounded-lg bg-amber-950/20 p-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {portrait&&<div ref={visual} className="relative shrink-0" data-sect-report-art="">
          <CultivatorPortrait portrait={{...portrait,expression:reportExpression(row)}}
            className="h-[4.5rem] w-16 sm:h-[6.5rem] sm:w-[5.75rem]" presentation="stage"/>
          {reaction&&<SectReactionGlyph key={reaction.id} kind={reaction.kind} className={reaction.kind==='sparkle'
            ?'absolute left-1/2 top-[29%] h-8 w-9 -translate-x-1/2 sm:h-11 sm:w-12'
            :'absolute -right-2 -top-2 h-9 w-9 sm:h-11 sm:w-11'}/>}
        </div>}
        <div className="min-w-0">
          <h3 ref={heading} tabIndex={-1} className="font-serif text-lg font-semibold text-amber-50">{name}</h3>
          <p className="text-sm text-stone-200">{SECT_JOB_DEFINITIONS[row.jobId].label} · <strong className={tier.ink}>{tier.label}</strong></p>
          <p className="text-xs text-stone-300">{!speaks?'差事留档':atHome?'人在山门':'人未在庭院露面，读其回话'}</p>
        </div>
      </div>
      {sceneComic&&<p data-sect-comic-report="" className="text-sm leading-6 text-stone-200">{sceneComic.report}</p>}
      {speaks&&<blockquote className="border-l border-amber-400/40 pl-2 font-serif text-sm leading-6 text-stone-100">「{sceneComic?.quote??reportVoice(row,actor)}」</blockquote>}
      <section aria-label="所得与折损" className="space-y-1 text-xs text-stone-300">
        <h4 className="font-semibold text-amber-100">所得与折损</h4>
        {row.effects.length>0?<ul className="flex flex-wrap gap-1.5">
          {row.effects.map((effect,step)=><li key={step} className={`rounded bg-stone-950/80 px-1.5 py-1 ${effect.amount<0?'text-rose-200':'text-emerald-200'}`}>
            <span className="text-stone-400">{effect.stage==='native'?'办差：':'后续：'}</span>{reportEffectLine(effect)}
          </li>)}
        </ul>:!sceneComic?.effects.length&&<p>这一单没有可记的收获或折损。</p>}
        {sceneComic&&<SectComicEffects effects={sceneComic.effects}/>}
      </section>
      {drama&&dramaVisible&&<SectPairDramaRead drama={drama}/>}
    </article>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={`${control} bg-amber-200 font-semibold text-stone-950`} onClick={next}>{final?'听完，回晨会':'下一位'}</button>
      <button type="button" className={`${control} text-amber-100`} onClick={finish}>跳过汇报</button>
    </div>
  </section>;
}

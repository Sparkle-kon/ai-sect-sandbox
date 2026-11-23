import {AlchemyWorkshopCanvas} from './AlchemyWorkshopCanvas';
import type {AlchemyWorkshopFrame} from './alchemyWorkshopVisualModel';
import {useEffect,useId,useRef,useState} from 'react';
import type {HeavenlyAlchemyOption,HeavenlyAlchemyView} from '../engine/heavenlyAlchemyEngine';

import {HEAVENLY_ALCHEMY_HEAT,HEAVENLY_ALCHEMY_QUALITY,HEAVENLY_ALCHEMY_RECIPES} from '../engine/heavenlyAlchemyTerms';
import {HERB_LABELS} from '../engine/alchemyEngine';
import type {HeavenlyRecipeId} from '../types/heavenlyAlchemy';
import type {HerbId} from '../types/world';

export interface HeavenlyAlchemyControls {
  busy?:boolean;
  guide?:(option:HeavenlyAlchemyOption)=>Promise<boolean>;
}

const control='min-h-11 min-w-0 rounded-md border border-amber-300/35 px-3 py-2 text-left text-sm text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50';

function FurnaceSeal(){
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 44 36" className="h-9 w-11 shrink-0 text-amber-300">
    <path d="M6 14h32M8 14c-1 7 2 12 8 13h12c6-1 9-6 8-13M15 27l-2 4m16-4 2 4M9 11l5-4h16l5 4M21 7V5h3v2M20 23c-3-2-2-4 1-6-1 3 3 2 2 5"
      fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

type Guide=(option:HeavenlyAlchemyOption)=>Promise<void>;
type BrewOption=Extract<HeavenlyAlchemyOption,{heavenlyAlchemyMove:'brew'}>;
const swatch={
  calm:['青焰','bg-emerald-300'],balanced:['金焰','bg-amber-300'],fierce:['紫焰','bg-violet-300'],
} as const;

function FurnaceChoices({recipeId,options,disabled,guide,onPreview,onEndPreview}:{
  recipeId:HeavenlyRecipeId;options:readonly HeavenlyAlchemyOption[];disabled:boolean;guide:Guide;
  onPreview?:(option:BrewOption)=>void;onEndPreview?:(option:BrewOption)=>void;
}){
  const label=useId();
  const recipe=HEAVENLY_ALCHEMY_RECIPES[recipeId];
  const herbs=(Object.keys(recipe.herbs) as HerbId[]).flatMap(id=>{
    const amount=recipe.herbs[id];
    return amount?[`${HERB_LABELS[id]} ${amount} 株`]:[];
  });
  return <section aria-labelledby={label} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/55 p-2.5">
    <h5 id={label} className="font-serif text-base font-semibold text-amber-100">{recipe.name}</h5>
    <p className="text-xs text-slate-300">三阶丹炉 · 耗 {recipe.stones} 灵石 · {herbs.join('、')}</p>
    <div className="grid gap-1.5 sm:grid-cols-3">
      {options.map(option=>{
        if(option.heavenlyAlchemyMove!=='brew'||option.targetHeavenlyRecipeId!==recipeId)return null;
        const heat=HEAVENLY_ALCHEMY_HEAT[option.heavenlyAlchemyHeat];
        const [color,swatchClass]=swatch[option.heavenlyAlchemyHeat];
        return <button key={option.heavenlyAlchemyHeat} type="button" className={control} disabled={disabled}
          onMouseEnter={()=>onPreview?.(option)} onMouseLeave={()=>onEndPreview?.(option)}
          onFocus={()=>onPreview?.(option)} onBlur={()=>onEndPreview?.(option)}
          onClick={()=>{onEndPreview?.(option);void guide(option);}}>
          <span className="block font-semibold">{heat.name}</span>
          {onPreview&&<span className="flex flex-wrap items-center gap-1 text-xs text-slate-200">
            <span aria-hidden="true" className={`size-2 rounded-full ${swatchClass}`}/>{color}示意
          </span>}
          <span className="block text-xs leading-relaxed text-slate-300">{heat.description}</span>
        </button>;
      })}
    </div>
  </section>;
}

function HeavenlyAlchemyReceipts({view}:{view:HeavenlyAlchemyView}){
  if(!view.attempts.length)return null;
  return <ul aria-label="本人成丹实录" className="space-y-1.5 text-sm text-slate-200">
    {view.attempts.map(attempt=>{
      const quality=attempt.quality;
      return <li key={attempt.id} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/55 p-2 [overflow-wrap:anywhere]">
        <p>{HEAVENLY_ALCHEMY_RECIPES[attempt.recipeId].name} · {HEAVENLY_ALCHEMY_HEAT[attempt.heat].name} · <strong className="text-amber-100">
          {quality?HEAVENLY_ALCHEMY_QUALITY[quality].name:'此炉未成丹'}
        </strong></p>
        {(quality==='immortal'||quality==='peerless')&&<p className="text-xs text-amber-300">成丹之时，丹雷伴丹香而起。</p>}
        {attempt.use&&<p className="mt-1 text-xs text-slate-300">此丹已服{attempt.use.wardSpentTick!==undefined?'，所得护持已在渡劫时消耗':''}。</p>}
      </li>;
    })}
  </ul>;
}

function HeavenlyAlchemyStock({view,live,disabled,guide}:{
  view:HeavenlyAlchemyView;live:boolean;disabled:boolean;guide:Guide;
}){
  if(!view.stock.length)return null;
  return <section aria-label="本人所持高阶丹药" className="space-y-1.5">
    <h5 className="text-sm font-semibold text-amber-100">所持高阶丹药</h5>
    <ul className="space-y-1.5">
      {view.stock.map(row=>{
        const option=live?view.options.find(candidate=>candidate.heavenlyAlchemyMove==='take'&&
          candidate.targetHeavenlyRecipeId===row.recipeId&&candidate.heavenlyAlchemyQuality===row.quality):undefined;
        const recipe=HEAVENLY_ALCHEMY_RECIPES[row.recipeId],quality=HEAVENLY_ALCHEMY_QUALITY[row.quality];
        return <li key={`${row.recipeId}:${row.quality}`} className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 rounded-md border border-slate-800 p-2">
          <p className="min-w-0 text-sm text-slate-200 [overflow-wrap:anywhere]">{recipe.name} · {quality.name} · {row.count} 枚</p>
          {option&&<button type="button" className={control} disabled={disabled} onClick={()=>void guide(option)}>服用一枚{quality.name}{recipe.name}</button>}
        </li>;
      })}
    </ul>
  </section>;
}

export function HeavenlyAlchemyRead({view,controls,tick,workshop,previewWorkshop}:{
  view:HeavenlyAlchemyView;tick?:number;controls?:HeavenlyAlchemyControls;workshop?:AlchemyWorkshopFrame;
  previewWorkshop?:(option:BrewOption)=>AlchemyWorkshopFrame|undefined;
}){
  const title=useId();
  const [open,setOpen]=useState(false);
  const [preview,setPreview]=useState<{view:HeavenlyAlchemyView;option:BrewOption}>();
  const [guiding,setGuiding]=useState(false);
  const [failed,setFailed]=useState(false);
  const inFlight=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const disabled=guiding||!!controls?.busy;
  const guide=async(option:HeavenlyAlchemyOption)=>{
    if(!controls?.guide||disabled||inFlight.current||!view.options.includes(option))return;
    inFlight.current=true;
    setGuiding(true);
    setFailed(false);
    try {
      const accepted=await controls.guide(option);
      if(mounted.current)setFailed(!accepted);
    } catch {if(mounted.current)setFailed(true);}
    finally {inFlight.current=false;if(mounted.current)setGuiding(false);}
  };
  const live=!!controls?.guide;
  const canPreview=live&&!disabled&&workshop?.furnace?.status==='open'&&!!previewWorkshop;
  const previewed=canPreview&&preview?.view===view&&view.options.includes(preview.option)?previewWorkshop(preview.option):undefined;
  const stage=previewed?.furnace?.mode==='preview'?previewed:workshop;
  const beginPreview=canPreview?(option:BrewOption)=>setPreview({view,option}):undefined;
  const endPreview=canPreview?(option:BrewOption)=>setPreview(previous=>previous?.option===option?undefined:previous):undefined;
  const recipes=[...new Set(view.options.filter(option=>option.heavenlyAlchemyMove==='brew').map(option=>option.targetHeavenlyRecipeId))];
  if(!workshop?.furnace&&!view.attempts.length&&!view.stock.length&&!(live&&recipes.length))return null;
  return <details aria-labelledby={title} onToggle={event=>{setOpen(event.currentTarget.open);if(!event.currentTarget.open)setPreview(undefined);}} className="min-w-0 rounded-lg border border-amber-300/30 bg-gradient-to-b from-amber-950/25 to-slate-950/75 px-3">
    <summary id={title} className="flex min-h-11 cursor-pointer items-center gap-2 font-serif text-base font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <FurnaceSeal/>高阶火候 · 炉边听雷
    </summary>
    <div className="min-w-0 space-y-3 pb-3" aria-busy={disabled}>
      {stage?.furnace&&<AlchemyWorkshopCanvas frame={stage} kind="furnace" active={open}/>}
      {live&&view.options.length>0&&<p className="text-xs text-slate-300">{guiding?'正在行过这一月…':'选一项，行过一月。火候不同，成色仍待出炉。'}</p>}
      {view.ward&&<p className="rounded-md border border-amber-300/25 px-2 py-1.5 text-xs text-amber-100">
        渡劫护持尚在{tick!==undefined?` · 余 ${Math.max(0,view.ward.expiresTick-tick)} 月`:''}。
      </p>}
      <HeavenlyAlchemyReceipts view={view}/>
      {live&&recipes.map(recipeId=><FurnaceChoices key={recipeId} recipeId={recipeId} options={view.options}
        disabled={disabled} guide={guide} onPreview={beginPreview} onEndPreview={endPreview}/>)}
      <HeavenlyAlchemyStock view={view} live={live} disabled={disabled} guide={guide}/>
      {failed&&<p role="status" className="text-xs text-amber-200">此事未成，请核对当前炉位、灵草与灵石。</p>}
    </div>
  </details>;
}

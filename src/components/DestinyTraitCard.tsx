import {useEffect,useId,useRef} from 'react';
import {Sparkles} from 'lucide-react';
import {DESTINY_TRAIT_CATALOG} from '../engine/destinyTraitCatalog';
import type {DestinyTraitAwakening,DestinyTraitId,DestinyTraitOffer} from '../types/destinyTrait';
import type {Cultivator,WorldState} from '../types/world';

const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';

type DestinyTraitCardProps={
  actorName:string;busy:boolean;
} & (
  | {offer:DestinyTraitOffer;awakening?:never;onChoose:(trait:DestinyTraitId)=>void;onContinue?:never}
  | {offer?:never;awakening:DestinyTraitAwakening;onChoose?:never;onContinue:()=>void}
);
export function DestinyTraitCard(props:DestinyTraitCardProps){
  const headingId=useId(),heading=useRef<HTMLHeadingElement>(null);
  const {actorName,busy,offer,awakening}=props;
  const source=offer??awakening;
  const trait=awakening&&DESTINY_TRAIT_CATALOG[awakening.traitId];
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[source.id,awakening?.traitId]);
  return <section aria-labelledby={headingId} className="relative isolate min-w-0 space-y-2.5 overflow-hidden rounded-2xl border border-violet-400/35
    bg-gradient-to-br from-indigo-950/75 via-slate-950 to-slate-950 p-3.5 text-slate-100 [overflow-wrap:anywhere] sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 -z-10 h-36 w-36 rounded-full border border-violet-200/20 shadow-[0_0_3rem_rgba(167,139,250,.18)]"/>
    <header className="space-y-1">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-violet-200">
        <Sparkles size={15} aria-hidden="true" className="shrink-0"/>{actorName} · 已踏入{source.realm}
      </p>
      <h2 id={headingId} ref={heading} tabIndex={-1} className={`font-serif text-xl font-semibold text-amber-50 sm:text-2xl ${focus}`}>
        {offer?'破境后，命格初显':'这一念已入命格'}
      </h2>
    </header>
    {offer&&<><p className="font-serif text-base leading-7 text-slate-200">
      这一重关已经越过。三道命格从破境的余息中浮现，此番只能留下一道。
    </p>
      <div role="group" aria-label="只择一道命格" className="grid gap-1.5">
        {offer.options.map(id=>{
          const option=DESTINY_TRAIT_CATALOG[id];
          return <button type="button" key={id} disabled={busy}
            className={`flex min-h-12 w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-violet-400/30
              bg-slate-950/70 px-3 py-2 text-left text-slate-100 hover:bg-indigo-950/60 disabled:opacity-50 ${focus}`}
            onClick={e=>{if(!busy&&e.detail<=1)props.onChoose(id);}}
            onKeyDown={e=>{if(e.key==='Enter'&&e.repeat)e.preventDefault();}}>
            <span className="font-serif font-semibold text-violet-100">{option.name}</span><span className="text-xs text-slate-400">{option.artName}</span>
            <span className="basis-full text-xs leading-relaxed text-slate-300">{option.description}</span>
          </button>;
        })}
      </div>
      {busy&&<p role="status" className="text-xs text-slate-400">这一念尚在落定。</p>}
    </>}
    {awakening&&trait&&<>
      <div className="rounded-lg border border-violet-400/30 bg-slate-950/65 p-3">
        <p className="font-serif text-lg text-amber-100">{trait.name}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{trait.description}</p>
      </div>
      <button type="button" disabled={busy} onClick={e=>{if(!busy&&e.detail<=1)props.onContinue();}}
        className={`min-h-11 w-full rounded-lg border border-violet-400/40 px-3 text-sm font-medium text-violet-100 hover:bg-indigo-950/60 disabled:opacity-50 ${focus}`}>收起这一幕</button>
    </>}
  </section>;
}

export function EarnedDestinyTraits({world,actor}:{world:WorldState;actor:Cultivator}){
  if(world.cultivators.filter(person=>person.id===actor.id).length!==1||!world.cultivators.includes(actor))return null;
  const earned=actor.destinyTraits?.earned.filter(row=>row.actorId===actor.id&&row.chosenTick<=world.tick&&
    row.chosenTick>=row.openedTick&&row.options.includes(row.traitId)&&Object.hasOwn(DESTINY_TRAIT_CATALOG,row.traitId));
  if(!earned?.length)return null;
  return <ul aria-label="已觉醒命格" className="flex min-w-0 flex-wrap gap-1.5 text-xs">
    {earned.map(row=>{
      const option=DESTINY_TRAIT_CATALOG[row.traitId];
      return <li key={row.id} className="min-w-0 max-w-full rounded-lg border border-violet-400/30 bg-slate-950/65 px-2 py-1 [overflow-wrap:anywhere]">
        <span className="font-semibold text-violet-100">{option.name}</span> <span className="text-slate-400">· {option.artName}</span>
      </li>;
    })}
  </ul>;
}

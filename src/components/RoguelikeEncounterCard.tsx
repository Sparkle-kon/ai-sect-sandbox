import {useEffect,useId,useRef} from 'react';
import {BookOpen,Flame,HandHeart,Mountain} from 'lucide-react';
import {ROGUELIKE_ENCOUNTER_CATALOG} from '../engine/roguelikeEncounterCatalog';
import type {RoguelikeEncounterChoice,RoguelikeEncounterOutcome,RoguelikeEncounterRecord} from '../types/roguelikeEncounter';

const icons={ 'sword-cave':Mountain,'wounded-traveler':HandHeart,'sealed-scroll':BookOpen,'sect-gate':Mountain } as const;
const optionTone={
  cautious:'border-teal-500/25 text-teal-100 hover:bg-teal-950/55',
  bold:'border-rose-400/30 text-rose-100 hover:bg-rose-950/55',
  leave:'border-slate-700 text-slate-200 hover:bg-slate-800',
} as const;
const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';
const risk={cautious:'稳妥',bold:'冒险',leave:'收手'} as const;

export function encounterOutcomeText(outcome:RoguelikeEncounterOutcome,witnessName?:string):string {
  const {qiDelta,hpDelta,karmaDelta,lifespanDelta,affinityDelta}=outcome;
  const facts=[
    qiDelta>0?'灵气有所精进':qiDelta<0?'耗去一些灵气':undefined,
    hpDelta>0?'气血渐复':hpDelta<0?'气血受创':undefined,
    karmaDelta>0?'因这一念添了几分气运':karmaDelta<0?'气运受损':undefined,
    lifespanDelta>0?'寿元有所增长':lifespanDelta<0?'这一下折了些寿元':undefined,
    affinityDelta>0?`与${witnessName??'同路人'}多了一份交情`:
      affinityDelta<0?`与${witnessName??'同路人'}渐生嫌隙`:undefined,
  ].filter((fact):fact is string=>!!fact);
  return facts.length?`${facts.join('；')}。`:'此行到此为止，未留下新的得失。';
}

export interface RoguelikeEncounterCardProps {
  encounter:RoguelikeEncounterRecord;
  actorName:string;
  siteName:string;
  witnessName?:string;
  busy:boolean;
  onChoose:(choice:RoguelikeEncounterChoice)=>void;
  onContinue:()=>void;
}

export function RoguelikeEncounterCard({encounter,actorName,siteName,witnessName,busy,onChoose,onContinue}:RoguelikeEncounterCardProps){
  const title=useId(),intro=useId();
  const heading=useRef<HTMLHeadingElement>(null);
  const gate=encounter.kind==='sect-gate';
  const scene=ROGUELIKE_ENCOUNTER_CATALOG[encounter.kind];
  const Icon=icons[encounter.kind];
  const offered=encounter.status==='offered';
  const outcome=encounter.status==='resolved'&&encounter.choice&&encounter.outcome?
    {result:encounter.outcome,choice:scene.choices.find(row=>row.choice===encounter.choice)}:undefined;
  useEffect(()=>{
    heading.current?.focus({preventScroll:true});
  },[encounter.id,encounter.status]);
  if(gate&&(!encounter.guided||!encounter.sectGate))return null;
  const reputation=outcome?.result.sectReputationDelta;
  return <section aria-labelledby={title} className="relative isolate min-w-0 overflow-hidden rounded-2xl border border-amber-500/35
    bg-gradient-to-br from-amber-950/55 via-slate-950 to-slate-950 p-3.5 text-slate-100 [overflow-wrap:anywhere] sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-9 -top-14 -z-10 h-44 w-44 rounded-full border border-amber-200/15 shadow-[0_0_3rem_rgba(251,191,36,.13)]"/>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="flex items-center gap-1.5 font-medium tracking-widest text-amber-200">
        <Icon size={15} aria-hidden="true" className="shrink-0"/>{gate?(offered?'山门问心':'问心余音'):(offered?'半途奇遇':'奇遇余音')}
      </span>
      <span className="text-slate-400">{siteName} · {actorName}</span>
    </div>
    <h2 id={title} ref={heading} tabIndex={-1} className={`mt-1.5 rounded-sm font-serif text-xl font-semibold text-amber-50 sm:text-2xl ${focus}`}>{scene.title}</h2>
    {offered?<>
      <p id={intro} className="mt-2 font-serif text-base leading-7 text-slate-200">{scene.scene}{encounter.kind==='wounded-traveler'&&witnessName&&<span className="block text-xs text-amber-100">伤者：{witnessName}</span>}</p>
      <div role="group" aria-label="这一步如何走" aria-describedby={intro} className="mt-3 grid gap-1.5">
        {scene.choices.map(({choice,label,risk:hint})=>{
          return <button type="button" key={choice} disabled={busy}
            onClick={event=>{if(!busy&&event.detail<=1)onChoose(choice);}}
            onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}
            className={`flex min-h-12 min-w-0 w-full flex-wrap items-start gap-x-2 gap-y-0.5 rounded-lg border bg-slate-950/70 px-3 py-2 text-left disabled:opacity-50 ${focus} ${optionTone[choice]}`}>
            <span className="font-semibold">{label}</span>
            {!gate&&<span className="ml-auto rounded border border-current/25 px-1.5 text-[11px]">{risk[choice]}</span>}
            <span className="basis-full text-xs leading-relaxed text-slate-300">{hint}</span>
          </button>;
        })}
      </div>
      {busy&&<p role="status" className="mt-2 text-xs text-slate-400">这一幕尚在落定。</p>}
    </>:<>
      {outcome?.choice?<div className="mt-2 rounded-lg border border-amber-300/25 bg-slate-950/55 p-3">
        <p className="flex items-center gap-1.5 text-xs text-amber-200"><Flame size={13} aria-hidden="true"/>
          {outcome.choice.choice==='leave'?(gate?'到此作别':'就此收手'):outcome.result.success?'此念已定':'未能如愿'} · {outcome.choice.label}</p>
        {(!gate||outcome.result.qiDelta!==0||outcome.result.hpDelta!==0||outcome.result.karmaDelta!==0||
          outcome.result.lifespanDelta!==0||outcome.result.affinityDelta!==0)&&
          <p className="mt-1 font-serif text-base leading-relaxed text-slate-200">{encounterOutcomeText(outcome.result,witnessName)}</p>}
        {gate&&typeof reputation==='number'&&Number.isSafeInteger(reputation)&&(reputation!==0
          ? <p className="mt-1 text-sm text-amber-100">本门声望{reputation>0?'增':'减'} {Math.abs(reputation)}。</p>
          : <p className="mt-1 font-serif text-sm leading-relaxed text-slate-300">此番问心，本门声望未改。</p>)}
      </div>:<p className="mt-2 text-sm text-slate-300">这一幕已经错过，没有新的结果可读。</p>}
      <button type="button" disabled={busy} className={`mt-3 min-h-11 w-full rounded-lg border border-amber-400/40 bg-slate-950/70 px-3
        text-sm font-semibold text-amber-100 hover:bg-amber-950/70 disabled:opacity-50 ${focus}`}
        onClick={event=>{if(!busy&&event.detail<=1)onContinue();}}>收起这一幕</button>
    </>}
  </section>;
}

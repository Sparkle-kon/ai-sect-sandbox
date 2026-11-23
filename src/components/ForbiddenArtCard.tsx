import {VisualDuelArena} from './VisualDuelArena';
import type {VisualDuelArenaFrame} from './visualDuelArenaModel';
import {useEffect,useId,useRef,useState} from 'react';
import {Flame} from 'lucide-react';
import {FORBIDDEN_ART_CATALOG} from '../engine/forbiddenArtCatalog';
import type {projectGuidedForbiddenDuel} from '../engine/forbiddenArtEngine';
import type {ForbiddenArtChoice,ForbiddenArtCost,ForbiddenArtScar} from '../types/forbiddenArt';
import type {Cultivator,WorldState} from '../types/world';

type View=NonNullable<ReturnType<typeof projectGuidedForbiddenDuel>>;
const button='min-h-12 w-full min-w-0 rounded-lg border border-rose-400/30 bg-slate-950/70 px-3 py-2 text-left text-sm text-rose-100 hover:bg-rose-950/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-200 disabled:opacity-50';
const results={
  reversal:'反败为胜',escape:'截断了这场交手',survived:'保住性命，未能反败为胜',fallen:'付了代价，仍然身陨',
} satisfies Record<ForbiddenArtScar['result'],string>;
export function forbiddenCostText(cost:ForbiddenArtCost){
  return [cost.hp>0?`${cost.hp} 点气血`:undefined,cost.lifespan>0?`${cost.lifespan} 载寿元`:undefined,
    cost.durability>0?`原器 ${cost.durability} 点耐久`:undefined].filter(Boolean).join('、')||'无禁术代价';
}

type Props={busy:boolean}&(
  | {view:View;scar?:never;arena?:VisualDuelArenaFrame;onChoose:(choice:ForbiddenArtChoice)=>boolean;onAdvance:()=>boolean;onContinue?:never}
  | {view?:never;scar:ForbiddenArtScar;arena?:never;onChoose?:never;onAdvance?:never;onContinue:()=>void}
);
export function ForbiddenArtCard(props:Props){
  const title=useId(),heading=useRef<HTMLHeadingElement>(null);
  const [notice,setNotice]=useState('');
  const {view,scar,busy}=props;
  const key=view?.contact.id??scar?.contactId;
  const queued=view?.contact.queued;
  const options=view?[...view.options.filter(option=>option.choice!=='decline'),...view.options.filter(option=>option.choice==='decline')]:[];
  useEffect(()=>{
    setNotice('');
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView?.({block:'nearest',behavior:'instant'});
  },[key,queued?.choice,scar]);
  const invoke=(callback:()=>boolean)=>{if(!busy&&!callback())setNotice('交手、原器或时机已变，没有执行。');};
  return <section aria-labelledby={title} className="relative isolate min-w-0 space-y-2.5 overflow-hidden rounded-2xl border border-rose-400/35
    bg-gradient-to-br from-rose-950/70 via-slate-950 to-slate-950 p-3.5 text-slate-100 [overflow-wrap:anywhere] sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-9 -top-14 -z-10 h-44 w-44 rounded-full border border-rose-200/20 shadow-[0_0_3rem_rgba(244,63,94,.15)]"/>
    <header className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-rose-200"><Flame size={15} aria-hidden="true"/>
        {view?`${view.ownerName}对阵${view.opponentName} · ${view.artifactName}`:'交手已结'} </p>
      <h2 ref={heading} tabIndex={-1} id={title} className="font-serif text-xl font-semibold text-amber-50 sm:text-2xl">
        {view?'绝境一息，禁术可发':'禁术留下的痕迹'}</h2>
    </header>
    {view&&props.arena&&<VisualDuelArena frame={props.arena}/>}
    {view&&!queued&&<>
      <p className="font-serif text-base leading-relaxed text-slate-200">锋芒已到身前，连一口气都难续。掌中法宝低鸣；这一步若要借它，便得用自己的东西去换。</p>
      <div role="group" aria-label="这一场交手的抉择" className="grid gap-1.5">
        {options.map(option=><button type="button" key={option.choice} disabled={busy}
          className={`${button} ${option.choice==='decline'?'border-slate-600 text-slate-200 hover:bg-slate-800':''}`}
          onClick={event=>{if(event.detail<=1)invoke(()=>props.onChoose?.(option.choice)??false);}}
          onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
          <span className="font-serif font-semibold">{option.choice==='decline'?'不动禁术':option.name}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-300">{option.choice==='decline'?
            '不付禁术代价，仍要照原势与对方真实交手。':option.description}</span>
          {option.choice!=='decline'&&<span className="block text-xs text-rose-200">若实际施术，将付 {forbiddenCostText(option.cost)}。</span>}
        </button>)}
      </div>
    </>}
    {view&&queued&&<>
      <p role="status" className="rounded-lg border border-rose-400/30 p-2 text-sm text-rose-100">
        已记下：{queued.choice==='decline'?'不动禁术':FORBIDDEN_ART_CATALOG[queued.choice].name}。此刻未扣代价，也未分胜负。
      </p>
      <button type="button" disabled={busy} className={`${button} text-center font-semibold`}
        onClick={event=>{if(event.detail<=1)invoke(()=>props.onAdvance?.()??false);}}
        onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>推进一月，继续交手</button>
    </>}
    {scar&&<>
      <div className="space-y-1 rounded-lg border border-rose-400/25 bg-slate-950/65 p-3">
        <p className="font-serif text-lg text-amber-100">{FORBIDDEN_ART_CATALOG[scar.artId].name} · {results[scar.result]}</p>
        <p className="text-sm text-slate-200">实付 {forbiddenCostText(scar.paid)}。</p>
      </div>
      <button type="button" disabled={busy} onClick={props.onContinue} className={`${button} text-center`}>收起这一幕</button>
    </>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕尚在落定。</p>}
    {notice&&<p role="status" className="text-xs text-rose-100">{notice}</p>}
  </section>;
}
export function ForbiddenArtScarsRead({world,actor,artifactId}:{world:WorldState;actor:Cultivator;artifactId?:string}){
  if(world.cultivators.filter(person=>person.id===actor.id).length!==1||!world.cultivators.includes(actor))return null;
  const records=actor.forbiddenScars?.filter(row=>row.ownerId===actor.id&&row.openedTick<=row.tick&&row.tick<=world.tick&&
    (artifactId===undefined||row.artifactId===artifactId)&&Object.hasOwn(FORBIDDEN_ART_CATALOG,row.artId));
  if(!records?.length)return null;
  return <ul aria-label={artifactId?'此原器的禁术旧痕':'本人禁术旧痕'} className="flex flex-wrap gap-1.5 text-xs">
    {records.map(row=><li key={row.id} className="min-w-0 max-w-full rounded border border-rose-400/25 bg-slate-950/65 px-2 py-1 [overflow-wrap:anywhere]">
      <span className="font-medium text-rose-100">{FORBIDDEN_ART_CATALOG[row.artId].name}</span> <span className="text-slate-300">· {results[row.result]}，当时实付 {forbiddenCostText(row.paid)}</span>
    </li>)}
  </ul>;
}

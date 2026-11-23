import {lazy,Suspense,useId,useMemo,useRef,useState,type RefObject} from 'react';
import {previewStarterSect} from '../engine/starterSectWorld';
import {MANAGEMENT_BUILDING_IDS,STARTER_SECT_IDS,
  type ManagementBuildings,type StarterDraw,type StarterSectId} from '../types/sectManagement';
import type {WorldState} from '../types/world';
import type {SectJobObservation,SectJobReport} from '../types/sectJobs';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {LocalCourtyardCanvas} from './LocalCourtyardCanvas';
import {buildLocalCourtyard} from './localCourtyardModel';
import {createTerrainMapView} from './terrainMapView';
import {mapTransitActorIds} from './mapConvoyView';

import {SectQuirkBadges} from './SectQuirkBadges';
import {sectQuirkLabels} from './sectQuirkLabels';
import type {ConfirmSectJobs} from './SectMorningBoard';

const SectJobReportStage=lazy(async()=>({default:(await import('./SectJobReportStage')).SectJobReportStage}));
const SectMorningBoard=lazy(async()=>({default:(await import('./SectMorningBoard')).SectMorningBoard}));

type HomeView='story'|'cockpit'|'sandbox'|'saves';
export interface SectManagementHomeProps {
  world:WorldState;
  busy?:boolean;
  onStart:(starterId:StarterSectId,draw:StarterDraw)=>boolean;
  onOpen:(view:HomeView)=>void;
  onTick?:()=>void;
  onConfirmJobs?:ConfirmSectJobs;
  observations?:readonly SectJobObservation[];
  report?:SectJobReport;
  onDismissReport?:(report:SectJobReport)=>void;
  titleRef?:RefObject<HTMLHeadingElement>;
}

const destinations:Readonly<Record<HomeView,string>>={
  story:'故事书卷',cockpit:'全息大盘',sandbox:'九州沙盒',saves:'读档',
};
const names:Record<typeof MANAGEMENT_BUILDING_IDS[number],string>={
  hall:'大殿',kitchen:'饭堂',furnace:'丹房',trainingGround:'演武场',gate:'山门',library:'藏经阁',
};
const button='xianxia-control min-h-[44px] min-w-0 rounded-md border border-amber-300/40 px-3 py-1 text-sm text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50';
const card='xianxia-frame min-w-0 rounded-xl border border-amber-300/25 bg-slate-950/75 px-3 py-3 [overflow-wrap:anywhere]';

function More({busy,onOpen}:{busy:boolean;onOpen:SectManagementHomeProps['onOpen']}){
  const disclosure=useRef<HTMLDetailsElement>(null);
  return <details ref={disclosure} className="relative min-w-24 rounded-lg border border-slate-600 bg-slate-950">
    <summary className="min-h-[44px] cursor-pointer rounded-lg px-3 py-2 text-sm text-amber-100 focus-visible:outline focus-visible:outline-amber-300">更多</summary>
    <nav aria-label="更多去处" className="absolute right-0 z-20 grid w-36 gap-1 rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-lg">
      {(Object.keys(destinations) as HomeView[]).map(view=><button key={view} type="button" disabled={busy}
        className={button} onClick={()=>{if(disclosure.current)disclosure.current.open=false;onOpen(view);}}>{destinations[view]}</button>)}
    </nav>
  </details>;
}

function BuildingList({levels}:{levels:ManagementBuildings}){
  return <ul aria-label="宗门建筑" className="flex flex-wrap gap-1.5 text-xs text-slate-200">
    {MANAGEMENT_BUILDING_IDS.map(id=><li key={id} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5">
      {names[id]} {levels[id]>0?`${levels[id]}级`:'未建'}
    </li>)}
  </ul>;
}

function StarterSelection({world,busy,onStart}:Omit<SectManagementHomeProps,'onOpen'>){
  const group=useId();
  const [starter,setStarter]=useState<StarterSectId>(STARTER_SECT_IDS[0]);
  const [draw,setDraw]=useState<StarterDraw>(0);
  const used=useRef(false);
  const committed=useRef(false);
  const [error,setError]=useState(false);
  const roster=useMemo(()=>STARTER_SECT_IDS.flatMap(id=>{
    const row=previewStarterSect(world.random.seed,id,draw);
    return row?[row]:[];
  }),[world.random.seed,draw]);
  const current=roster.find(row=>row.id===starter);
  const start=()=>{
    if(!current||busy||committed.current)return;
    committed.current=true;
    let applied=false;
    try{applied=onStart(starter,draw);}
    finally{if(!applied){committed.current=false;setError(true);}}
  };
  return <>
    <p className="text-sm leading-6 text-slate-200">两家小宗都缺个掌门。你挑一家，弟子已经在山门等着了。</p>
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-amber-100">哪一家交给你</legend>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        {roster.map(row=><label key={row.id} className={`${card} block cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-amber-300 ${starter===row.id?'border-amber-300/75':''}`}>
          <span className="flex min-h-[44px] items-center gap-2 text-base font-semibold text-amber-50">
            <input type="radio" name={group} checked={starter===row.id} disabled={busy}
              onChange={()=>{setStarter(row.id);setError(false);}}/>{row.name}
          </span>
          <span className="block text-sm leading-6 text-slate-200">{row.pitch}</span>
          <span className="mt-2 block text-xs text-amber-100">
            {row.disciples.length} 名弟子 · {row.stones} 枚灵石{row.debt?` · 欠 ${row.debt.creditorName} ${row.debt.principal} 枚，余 ${row.debt.dueMonths} 月`:' · 暂无欠款'}
          </span>
        </label>)}
      </div>
    </fieldset>
    {current&&<section className={card} aria-label="即将入门的弟子">
      <header className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-amber-100">{current.name}的弟子</h2>
        <button type="button" className={button} disabled={busy||draw===1} onClick={()=>{
          if(used.current||busy||committed.current)return;
          used.current=true;setDraw(1);setError(false);
        }}>{draw===1?'已重抽一次':'重抽一次'}</button>
      </header>
      <ul aria-label="开局弟子" className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
        {current.disciples.map(row=><li key={row.id} className="min-w-0 rounded bg-slate-900/80 px-2 py-1.5">
          <p className="font-medium text-slate-100">{row.name}</p><SectQuirkBadges labels={sectQuirkLabels(row.quirks)}/>
        </li>)}
      </ul>
      <div className="mt-2"><BuildingList levels={current.buildings}/></div>
      {error&&<p role="status" className="mt-2 text-sm text-amber-200">这一回没接成，眼下的进度还在。</p>}
      <p className="mt-3 text-xs leading-5 text-slate-300">接任会开启新局。若想留下旧进度，先从「更多」进去存档。</p>
      <button type="button" className={`${button} mt-2 bg-amber-300 font-semibold text-slate-950`} disabled={busy} onClick={start}>
        确认接掌{current.name}
      </button>
    </section>}
  </>;
}

function ManagedCourtyard({world,busy,onTick,onConfirmJobs,observations,report,onDismissReport}:Pick<SectManagementHomeProps,'world'|'onTick'|'onConfirmJobs'|'observations'|'report'|'onDismissReport'>&{busy:boolean}){
  const state=world.sectManagement;
  const sect=world.sects.find(row=>row.id===state?.sectId);
  const leader=world.cultivators.find(row=>row.id===state?.leaderId);
  const siteId=state?.homeSiteId;
  const courtyard=useMemo(()=>{
    if(!siteId)return undefined;
    const view=createTerrainMapView(world,undefined,false),moving=mapTransitActorIds(world);
    for(const id of view.trailPositions.keys())moving.add(id);
    return {plan:buildLocalCourtyard(world,view,siteId),moving};
  },[world,siteId]);
  const plan=courtyard?.plan;
  const [dismissedReport,setDismissedReport]=useState<SectJobReport>();
  const presentIds=useMemo(()=>new Set(plan?.actors.map(actor=>actor.id)),[plan]);
  const reportIsCurrent=report!==undefined&&report===state?.latestReport&&report!==dismissedReport&&report.rows.length>0&&
    report.settledTick===world.tick&&report.sectId===state.sectId&&report.leaderId===state.leaderId;
  if(!state||!sect)return null;
  const roster=world.cultivators.filter(row=>row.alive&&row.id!==state.leaderId&&row.sectId===state.sectId);
  const creditor=state.debt&&world.cultivators.find(row=>row.id===state.debt?.creditorId)?.name;
  const due=state.debt&&Math.max(0,state.debt.dueTick-world.tick);
  return <>
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-amber-100">
      {leader?.alive&&<span>掌门：{leader.name}</span>}
      <span>灵石 {sect.spiritStones} 枚</span>
      <span>{state.debt&&state.debt.principal>0
        ?`欠${creditor??'债主'} ${state.debt.principal} 枚 · ${due?`余 ${due} 月`:'还款日已到'}`:'暂无欠款'}</span>
    </p>
    {reportIsCurrent?<div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className={card} aria-label="宗门庭院">
        {plan?<LocalCourtyardCanvas plan={plan} embedded/>:<p className="text-sm text-slate-300">此刻未见山门内的景象。</p>}
        <BuildingList levels={state.buildings}/>
      </section>
      <Suspense fallback={<p role="status" className="order-first text-sm text-slate-300 lg:order-none">弟子们正在整理回话…</p>}>
        <SectJobReportStage world={world} report={report} present={presentIds} onDismiss={closing=>{
          if(closing!==report)return;
          setDismissedReport(closing);onDismissReport?.(closing);
        }}/>
      </Suspense>
    </div>:onConfirmJobs?<Suspense fallback={<p role="status" className="text-sm text-slate-300">正在摆放晨会差事牌…</p>}>
      <SectMorningBoard world={world} busy={busy} plan={plan} moving={courtyard?.moving} onConfirmJobs={onConfirmJobs} observations={observations}
        buildings={<BuildingList levels={state.buildings}/>}/>
    </Suspense>:<>
    <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className={card} aria-label="宗门庭院">
        {plan?<LocalCourtyardCanvas plan={plan} embedded/>:<p className="text-sm text-slate-300">此刻未见山门内的景象。</p>}
        <BuildingList levels={state.buildings}/>
      </section>
      <section className={card} aria-label="宗门弟子">
        <h2 className="mb-2 font-serif text-lg font-semibold text-amber-100">本宗弟子 · {roster.length} 人</h2>
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
          {roster.map(row=>{
            const portrait=projectCultivatorPortrait(world,row);
            return <li key={row.id} className="flex min-w-0 items-center gap-1.5 rounded bg-slate-900/85 p-1.5">
              {portrait&&<CultivatorPortrait portrait={portrait} className="h-11 w-10 shrink-0"/>}
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.name}</p><p className="mb-0.5 text-xs text-slate-300">{row.realm}{row.realmStage}层</p>
                <SectQuirkBadges labels={sectQuirkLabels(row.quirks)}/>
              </div>
            </li>;
          })}
        </ul>
      </section>
    </div>
    {onTick&&<button type="button" className={button} disabled={busy} onClick={onTick}>过一个月</button>}
    </>}
  </>;
}

export function SectManagementHome({world,busy=false,onStart,onOpen,onTick,onConfirmJobs,observations,report,onDismissReport,titleRef}:SectManagementHomeProps){
  const sect=world.sects.find(row=>row.id===world.sectManagement?.sectId);
  return <main className="xianxia-shell min-h-dvh bg-slate-950 px-3 pb-8 pt-[max(.75rem,env(safe-area-inset-top))] text-slate-100 sm:px-6">
    <div className="mx-auto max-w-6xl space-y-3">
      <header className="xianxia-header flex min-w-0 items-start justify-between gap-2 border-b border-amber-400/30 pb-2">
        <div className="min-w-0">
          <p className="text-xs text-amber-200">天道沙盒 · 仙历 {world.year} 年 {world.month} 月</p>
          <h1 ref={titleRef} tabIndex={-1} className="break-words font-serif text-2xl font-semibold text-amber-100">{sect?.name??'接手一间小宗门'}</h1>
        </div>
        <More busy={busy} onOpen={onOpen}/>
      </header>
      {sect?<ManagedCourtyard world={world} busy={busy} onTick={onTick} onConfirmJobs={onConfirmJobs} observations={observations} report={report} onDismissReport={onDismissReport}/>:
        <StarterSelection key={world.random.seed} world={world} busy={busy} onStart={onStart}/>}
    </div>
  </main>;
}

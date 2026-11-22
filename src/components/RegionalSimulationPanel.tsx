import {useId,useRef,useState} from 'react';

export type RegionalFocusRegion='west'|'center'|'east';
const REGION:Record<RegionalFocusRegion,string>={west:'西境',center:'中州',east:'东境'};
export type RegionalFocusOption={siteId:string;name:string;region:RegionalFocusRegion};
export type RegionalSimulationChange={kind:'set_focus';siteId:string}|{kind:'disable'};
export interface RegionalAnnualReading {
  year:number;tick:number;regionId:RegionalFocusRegion;actorMonths:number;waivedActorMonths?:number;actors:number;qiAdded:number;hpAdded:number;
}
type RegionalOpeningClock={tick:number;year:number;month:number};
export interface RegionalPromotionNotice {
  kind:'courier_crossed'|'escort_crossed'|'siege_arrived'|'actor_returned';
  observedTick:number;startsTick:number;throughTick:number;
  fromRegionId:RegionalFocusRegion;toRegionId:RegionalFocusRegion;active:boolean;
}
export interface RegionalRecentOpenings {
  clock:RegionalOpeningClock;
  /** Only supply the exact native projection for the currently authorized observer. */
  rows:readonly RegionalPromotionNotice[];
}
export interface RegionalModeReading {
  enabled:boolean;
  version?:number;
  focus?:RegionalFocusOption;
  effective?:{region:RegionalFocusRegion;avatarDriven?:boolean};
  registeredRegions?:number;
  annual?:readonly RegionalAnnualReading[];
  recentOpenings?:RegionalRecentOpenings;
}
export interface RegionalComparisonReading {
  seed:number;profileLabel:string;months:number;
  nativeLabel?:string;approximateLabel?:string;
  metrics:readonly {label:string;monthly:number;regional:number;unit?:string}[];
}
export interface RegionalSimulationControls {
  scopeKey:string;
  revisionKey:object|string|number;
  availableSites:readonly RegionalFocusOption[];
  mode:RegionalModeReading;
  comparison?:RegionalComparisonReading;
  disabled?:boolean;
  disabledReason?:string;
  /** Only when the native engine exposes a safe, branch-local opt-out. */
  supportsDisabling?:boolean;
  onChange:(change:RegionalSimulationChange)=>boolean;
}

const button='min-h-11 max-w-full rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 [overflow-wrap:anywhere] disabled:opacity-40';
const field='min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 text-base text-slate-100 disabled:opacity-40';

const OPENING_KIND:Record<RegionalPromotionNotice['kind'],string>={
  courier_crossed:'信使实际越境',
  escort_crossed:'护送中的商队实际越境',
  siege_arrived:'联军实际抵达',
  actor_returned:'修士实际归返',
};

function regionalDate(clock:RegionalOpeningClock,tick:number):string {
  const position=clock.month-1+(tick-clock.tick);
  const year=clock.year+Math.floor(position/12);
  if(!Number.isSafeInteger(position)||!Number.isSafeInteger(year)||year<1)return `第 ${tick} 轮`;
  return `${year} 年 ${(position%12+12)%12+1} 月`;
}

export function RegionalRecentOpeningStatus({reading}:{reading:RegionalRecentOpenings}) {
  const {clock}=reading;
  const eligible=reading.rows.filter(row=>row.observedTick<=clock.tick&&row.observedTick<=row.startsTick&&row.startsTick<=row.throughTick);
  const priority=(row:RegionalPromotionNotice)=>row.active&&row.startsTick<=clock.tick&&clock.tick<=row.throughTick?0:
    clock.tick<row.startsTick?1:2;
  eligible.sort((a,b)=>priority(a)-priority(b)||b.observedTick-a.observedTick);
  const shownRegions=new Set<RegionalFocusRegion>();
  const rows=eligible.filter(row=>{
    if(shownRegions.has(row.toRegionId))return false;
    shownRegions.add(row.toRegionId);return true;
  });
  if(!rows.length)return null;
  return <section aria-label="视角内的地域近事" className="min-w-0 space-y-1 rounded border border-slate-800 bg-slate-950/45 p-2 [overflow-wrap:anywhere]">
    <h6 className="font-semibold text-emerald-100">地域近事</h6>
    <ul className="space-y-1">
      {rows.map(row=><li key={row.toRegionId}>
        <p>{regionalDate(clock,row.observedTick)} · {REGION[row.toRegionId]} · {OPENING_KIND[row.kind]}。</p>
        <p className="text-slate-400">{clock.tick<row.startsTick
          ? `自 ${regionalDate(clock,row.startsTick)} 起展开当地逐月行动；接境月不会重跑。`
          : row.active&&clock.tick<=row.throughTick
            ? `当地按原月规运行（${regionalDate(clock,row.startsTick)} 至 ${regionalDate(clock,row.throughTick)}）。`
            : clock.tick>row.throughTick
              ? `本次逐月展开截至 ${regionalDate(clock,row.throughTick)}，窗口已结束。`
              : '目前未记为正在逐月展开。'}</p>
      </li>)}
    </ul>
    <p className="text-slate-400">原有在途或到期义务仍走原账，不因地域展开重复结算。</p>
  </section>;
}

export function RegionalSimulationSummary({mode,comparison}:{mode:RegionalModeReading;comparison?:RegionalComparisonReading}) {
  const annual=mode.annual??[];
  const rows=annual.slice(-6).reverse();
  return <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
    <p>{mode.enabled?'本分支已启用远地年算':'本分支未启用远地年算，仍按原规则逐月推演。'}
      {mode.enabled&&mode.version!==undefined&&` · 年算规则 v${mode.version}`}
      {mode.enabled&&mode.registeredRegions!==undefined&&` · 已登记 ${mode.registeredRegions} 个地域`}
    </p>
    {mode.focus?<p>关注点：{mode.focus.name}（{REGION[mode.focus.region]}）。</p>
      :mode.enabled&&<p className="text-slate-400">已保存关注点；本视角没有可显示的地名。</p>}
    {mode.enabled&&mode.effective&&<p>
      实际逐月关注区：{REGION[mode.effective.region]}{mode.effective.avatarDriven?'（当前附身者所在地域优先）':''}。
    </p>}
    <p className="text-slate-400">近域和原有逐月义务照原规则运行，包括实际在途的交接与到期。聚落、钱物、地权、灾害和人物寿元不改用年算。仅对满足条件的远地修士，用年末近似结算部分灵气与体力，不等同于给他们逐月安排原行动。</p>
    {mode.enabled&&mode.recentOpenings&&<RegionalRecentOpeningStatus reading={mode.recentOpenings}/>}
    {rows.length>0&&<div className="space-y-1">
      <h6 className="font-semibold text-emerald-100">已经实际结算的年度记录</h6>
      <p className="text-slate-400">人月：一人有一个月计入记账，即为 1 人月。不代表未结算的月均会补领。</p>
      <ul className="space-y-1">
        {rows.map(row=><li className="rounded bg-slate-950/50 p-1.5" key={`${row.tick}:${row.regionId}`}>
          {row.year} 年 · {REGION[row.regionId]} · 第 {row.tick} 轮：实结 {row.actors} 人、{row.actorMonths} 人月；灵气 +{row.qiAdded}、体力 +{row.hpAdded}。{row.waivedActorMonths?` 因回到逐月或不再符合条件，有 ${row.waivedActorMonths} 人月未补算。`:null}
        </li>)}
      </ul>
      {annual.length>rows.length&&<p className="text-slate-400">这里只列最近 {rows.length} 条已结算记录。</p>}
    </div>}
    {comparison?<div aria-label="逐月参照与远地年算的实测对照" className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2">
      <h6 className="font-semibold text-emerald-100">试验对照，不是未来保证</h6>
      <p>同一种子 {comparison.seed} · {comparison.profileLabel} · 两线实跑 {comparison.months} 个月。本例的对齐或偏差不能外推；即使仍用原逐月规则，交互结果也可能变化。</p>
      <ul className="space-y-1">
        {comparison.metrics.map(({label,monthly,regional,unit},index)=>{
          const delta=regional-monthly;
          return <li key={index} className="space-y-0.5 rounded bg-slate-950/45 p-1.5">
            <p className="font-medium">{label}</p>
            <p>{comparison.nativeLabel??'逐月参照'} {monthly}{unit??''} · {comparison.approximateLabel??'远地年算'} {regional}{unit??''}</p>
            <p className="text-slate-400">{delta===0?'此样本数值一致':`此样本相差 ${delta>0?'+':''}${delta}${unit??''}（年算减参照）`}</p>
          </li>;
        })}
      </ul>
    </div>:<p className="text-slate-400">这份面板没有同种逐月参照的实测。已结算记录不保证与逐月结果一致。</p>}
  </div>;
}

type Review={change:RegionalSimulationChange;revision:RegionalSimulationControls['revisionKey']};
export function RegionalSimulationPanel(controls:RegionalSimulationControls) {
  const [open,setOpen]=useState(false);
  return <details className="min-w-0 space-y-2 rounded border border-slate-800 bg-slate-950/45 p-2 text-xs leading-relaxed text-slate-300"
    onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-emerald-100">远地年算（可选试验）</summary>
    {open&&<RegionalSimulationOptions key={controls.scopeKey} {...controls}/>}
  </details>;
}
export function RegionalSimulationOptions({revisionKey,availableSites,mode,comparison,disabled,disabledReason,supportsDisabling,onChange}:RegionalSimulationControls) {
  const [chosen,setChosen]=useState('');
  const [review,setReview]=useState<Review>();
  const [notice,setNotice]=useState('');
  const attempted=useRef<Review>();
  const openReview=useRef<HTMLButtonElement>(null);
  const groupId=useId();
  const counts=new Map<string,number>();
  for(const row of availableSites)counts.set(row.siteId,(counts.get(row.siteId)??0)+1);
  const sites=availableSites.filter(row=>counts.get(row.siteId)===1);
  const selected=sites.find(row=>row.siteId===chosen);
  const reviewedChange=review?.change;
  const reviewSite=reviewedChange?.kind==='set_focus'?sites.find(row=>row.siteId===reviewedChange.siteId):undefined;
  const exact=review?.revision===revisionKey&&(review.change.kind==='disable'?supportsDisabling&&mode.enabled:!!reviewSite)?review:undefined;
  const noChange=selected&&selected.siteId===mode.focus?.siteId&&mode.enabled;
  const blocked=Boolean(disabled||disabledReason);
  const stage=(change:RegionalSimulationChange)=>{setReview({change,revision:revisionKey});setNotice('');};
  return <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
    <RegionalSimulationSummary mode={mode} comparison={comparison}/>
    <p>只有核对并确认才改变这个分支的设置；不会推进月份，也不会替其他分支开启。</p>
    {disabledReason&&<p className="text-amber-200">{disabledReason}</p>}
    {sites.length?<div className="grid min-w-0 gap-1.5 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="grid min-w-0 gap-1">选一个已知的关注地点
        <select className={field} disabled={blocked} value={selected?String(sites.indexOf(selected)):''} onChange={event=>{
          setChosen(sites.find((_,index)=>String(index)===event.currentTarget.value)?.siteId??'');setReview(undefined);setNotice('');
        }}>
          <option value="">请选择地点</option>
          {sites.map((row,index)=><option key={row.siteId} value={index}>{row.name} · {REGION[row.region]}</option>)}
        </select>
      </label>
      <button type="button" className={button} ref={openReview} disabled={blocked||!selected||!!noChange}
        aria-expanded={!!exact&&exact.change.kind==='set_focus'} aria-controls={exact?.change.kind==='set_focus'?groupId:undefined}
        onClick={()=>{if(selected)stage({kind:'set_focus',siteId:selected.siteId});}}>
        {mode.enabled?'核对新关注点':'核对启用年算'}
      </button>
    </div>:<p className="text-slate-400">当前没有可用的已知关注地点。</p>}
    {!!supportsDisabling&&mode.enabled&&<button type="button" className={button} disabled={blocked}
      aria-expanded={exact?.change.kind==='disable'} aria-controls={exact?.change.kind==='disable'?groupId:undefined}
      onClick={()=>stage({kind:'disable'})}>核对切回逐月</button>}
    {exact&&<div id={groupId} role="group" aria-label="核对本分支的推演模式" className="space-y-1.5 rounded border border-amber-700 bg-amber-950/35 p-2 text-amber-100">
      {exact.change.kind==='disable'?<p>确认在本分支切回逐月？不会把之前近似推演的月份改写成逐月实录。</p>
        :reviewSite&&<p>{mode.enabled?'把关注点改到':'启用试验，以'}{reviewSite.name}（{REGION[reviewSite.region]}）{mode.enabled?'。':'为关注点。'}部分合格的远地修士改用年末近似恢复，结果可能与逐月不同。</p>}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} disabled={blocked} onClick={()=>{
          if(blocked||attempted.current===exact)return;
          attempted.current=exact;setReview(undefined);
          if(onChange(exact.change)){setChosen('');setNotice('已保存本分支设置，没有推进月份。');}
          else setNotice('当前分支、地点或条件已变化，未更改设置。');
        }}>确认应用到此分支</button>
        <button type="button" className={button} onClick={()=>{setReview(undefined);openReview.current?.focus({preventScroll:true});}}>返回核对</button>
      </div>
    </div>}
    {review&&!exact&&<p className="text-amber-200">设定对象或分支现况已变化，请重新核对。</p>}
    {!!notice&&<p role="status" className="text-emerald-100">{notice}</p>}
  </div>;
}

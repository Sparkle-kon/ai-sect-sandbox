import {useId,useRef,useState} from 'react';
import {encodeEraDesignDraft,type EraDesignDraft} from '../engine/eraDesignDraft';

type DateLabel={year:number;month:number};
export interface AuthoredEraLaunchProgress {
  current:DateLabel&{tick:number};
  target:DateLabel;
  completedMonths:number;
  requestedMonths:number;
  phase:'simulating'|'verifying';
}
export interface AuthoredEraPreparedSummary extends DateLabel {
  receiptKey:string;
  tick:number;
  baselineMonths:number;
  livingCount:number;
  effects:readonly {label:string;change:string}[];
  candidates:readonly {name:string;sectName?:string;siteName?:string}[];
  totalCandidates?:number;
}
export type AuthoredEraLaunchState=
  | {phase:'idle'}
  | {phase:'preparing';progress?:AuthoredEraLaunchProgress}
  | {phase:'failed';message:string;details?:readonly string[]}
  | {phase:'prepared';summary:AuthoredEraPreparedSummary};
export interface AuthoredEraLaunchController {
  scopeKey:string;
  disabled?:boolean;
  unavailable?:string;
  state:AuthoredEraLaunchState;
  onPrepare:(draft:EraDesignDraft)=>void;
  onCancel:()=>void;
  onCreate:(receiptKey:string)=>boolean;
}

const button='min-h-11 max-w-full rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 [overflow-wrap:anywhere] disabled:opacity-45';
const date=({year,month}:DateLabel)=>`${year} 年 ${month} 月`;

export function canPrepareAuthoredEra(draft:EraDesignDraft|undefined,current:DateLabel,report?:{
  preview:{ready:boolean;draft:EraDesignDraft};year:number;month:number;
}):boolean {
  if(!draft||!report?.preview.ready||report.year!==current.year||report.month!==current.month||
    !(draft.target.year>current.year||draft.target.year===current.year&&draft.target.month>current.month))return false;
  try { return encodeEraDesignDraft(draft)===encodeEraDesignDraft(report.preview.draft); }
  catch { return false; }
}

export function AuthoredEraOpeningSummary({summary}:{summary:AuthoredEraPreparedSummary}) {
  const visible=summary.candidates;
  return <div className="space-y-2 min-w-0 [overflow-wrap:anywhere]">
    <p className="font-semibold text-cyan-100">已核验的开局快照 · {date(summary)}，尚未创建分支</p>
    <div className="rounded bg-slate-950/50 p-2">
      <h6 className="font-semibold text-slate-200">已有实录</h6>
      <p>从种子离线实推了 {summary.baselineMonths} 个月，到第 {summary.tick} 轮。保留仍在快照内的演算实录，不把作者设定写成过去发生的事件。</p>
      <p>开局当代在世修士 {summary.livingCount} 人。</p>
    </div>
    {!!summary.effects.length&&<div className="rounded bg-slate-950/50 p-2">
      <h6 className="font-semibold text-teal-100">作者设定 · 开局时生效</h6>
      <ul className="list-inside list-disc space-y-0.5">{summary.effects.map(({label,change},index)=><li key={index}>{label}：{change}</li>)}</ul>
    </div>}
    <div className="rounded bg-slate-950/50 p-2">
      <h6 className="font-semibold text-slate-200">当代可入世人物</h6>
      {visible.length
        ? <ul className="max-h-52 list-inside list-disc space-y-0.5 overflow-y-auto">{visible.map(({name,sectName,siteName},index)=><li key={index}>
          {name}{sectName?` · ${sectName}`:''}{siteName?` · ${siteName}`:''}
        </li>)}</ul>
        : <p>此核验未列出可入世人物。</p>}
      {summary.totalCandidates!==undefined&&summary.totalCandidates>visible.length&&
        <p>此处先列 {visible.length} 位；实际合资格的有 {summary.totalCandidates} 位，可到人物名册查看。</p>}
      <p className="text-slate-400">新分支从旁观开始，不替你决定入世人物。当地条件允许时，可在人物的「化身临世与古戒」安排下月调息或修炼。</p>
    </div>
    <p className="text-slate-400">从此刻之后：只有在新分支里实际发生的事才记为新纪事。</p>
  </div>;
}

export function AuthoredEraLaunch({draft,controller}:{draft:EraDesignDraft;controller:AuthoredEraLaunchController}) {
  return <ScopedLaunch key={controller.scopeKey} draft={draft} controller={controller}/>;
}
function ScopedLaunch({draft,controller}:{draft:EraDesignDraft;controller:AuthoredEraLaunchController}) {
  const {state,disabled,unavailable}=controller;
  const [reviewed,setReviewed]=useState<string>();
  const [notice,setNotice]=useState('');
  const once=useRef<string>();
  const reviewButton=useRef<HTMLButtonElement>(null);
  const reviewId=useId();
  const progress=state.phase==='preparing'?state.progress:undefined;
  const ready=state.phase==='prepared'?state.summary:undefined;
  const confirming=Boolean(ready&&reviewed===ready.receiptKey);
  const blocked=Boolean(disabled||unavailable);
  const discard=()=>{setReviewed(undefined);setNotice('暂存已取消，草案与原分支未改动。');controller.onCancel();};
  return <section aria-label="预备独立纪元分支" className="min-w-0 space-y-2 rounded border border-cyan-800 bg-slate-950/45 p-2 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
    <h5 className="font-semibold text-cyan-100">按此草案预备新纪元</h5>
    <p>在后台按草案种子与预设，从创世离线实推至 {date(draft.target)}，再校验设定。不会运行外部模型，也不会把当前分支当成草案起点。只有确认才创建独立分支。</p>
    {unavailable&&<p className="text-amber-200">{unavailable}</p>}
    {(state.phase==='idle'||state.phase==='failed')&&<button type="button" className={button} disabled={blocked}
      onClick={()=>{setReviewed(undefined);setNotice('');controller.onPrepare(draft);}}>{state.phase==='failed'?'重新离线预备':'开始离线预备'}</button>}
    {state.phase==='failed'&&<div role="alert" className="rounded border border-rose-800 p-2 text-rose-200">
      <p>{state.message} 草案仍可修改；未创建分支，也未改动原分支。</p>
      {!!state.details?.length&&<ul className="list-inside list-disc">{state.details.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
    </div>}
    {state.phase==='preparing'&&<div className="space-y-1" role="status">
      {progress?<>
        <p>{progress.phase==='verifying'?'正在整体验证':'正在离线演算'}：已实推 {progress.completedMonths} / {progress.requestedMonths} 月 · 演算中的日期 {date(progress.current)}。原分支没有推进。</p>
        <progress className="w-full accent-cyan-500" aria-label="离线预备月数" value={progress.completedMonths} max={progress.requestedMonths}/>
      </>:<p>正在启动离线预备…</p>}
      <button type="button" className={button} onClick={discard}>取消预备，保留草案</button>
    </div>}
    {ready&&<>
      <AuthoredEraOpeningSummary summary={ready}/>
      <div className="flex flex-wrap gap-1.5">
        <button ref={reviewButton} type="button" className={button} disabled={blocked}
          aria-expanded={confirming} aria-controls={confirming?reviewId:undefined}
          onClick={()=>{once.current=undefined;setReviewed(confirming?undefined:ready.receiptKey);setNotice('');}}>
          {confirming?'收起创建核对':'核对并准备创建'}</button>
        <button type="button" className={button} onClick={discard}>丢弃暂存结果</button>
      </div>
      {confirming&&<div id={reviewId} role="group" aria-label="核对独立分支创建" className="space-y-1.5 rounded border border-amber-700 bg-amber-950/35 p-2 text-amber-100">
        <p>创建 {date(ready)} 的新分支并切换过去。原分支与它的进度不会被覆盖，可从原分支列表切回。不会自动附身。</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={button} disabled={blocked} onClick={()=>{
            if(blocked||reviewed!==ready.receiptKey||once.current===ready.receiptKey)return;
            once.current=ready.receiptKey;
            if(!controller.onCreate(ready.receiptKey)){setReviewed(undefined);setNotice('暂存已失效或创建未通过校验，原分支没有改变。');}
          }}>确认创建独立分支</button>
          <button type="button" className={button} onClick={()=>{setReviewed(undefined);reviewButton.current?.focus({preventScroll:true});}}>返回核对</button>
        </div>
      </div>}
    </>}
    {!!notice&&<p role="status" className="text-amber-200">{notice}</p>}
  </section>;
}

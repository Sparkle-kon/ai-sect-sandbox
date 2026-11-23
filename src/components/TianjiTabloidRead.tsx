import {useId,useState,type ReactNode} from 'react';
import type {TianjiTabloidIssueView} from '../engine/tianjiTabloid';

const sections=[
  {kind:'headline',label:'头条',quiet:'这期的头条暂且留白。'},
  {kind:'embarrassment',label:'丢人榜',quiet:'本季没有适合登报的糗事，给诸位留些体面。'},
  {kind:'dark_horse',label:'黑马',quiet:'还没见到谁出人意料地拔头筹。'},
  {kind:'rivalry',label:'恩怨',quiet:'没有新旧两笔可相照的恩怨。'},
  {kind:'advertisement',label:'广告位',quiet:'这块地方还空着，等道友递上告示。'},
] as const;
const flip='min-h-11 min-w-0 flex-1 rounded-md border border-amber-300/35 px-2.5 py-1 text-sm text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';

function InkSeal(){
  return <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false" className="size-10 shrink-0 -rotate-6 text-red-900/85">
    <rect x="3" y="3" width="38" height="38" rx="5" fill="none" stroke="currentColor" strokeWidth="2.5"/>
    <path d="M10 13h10m-8-3h5m-2 3v8m-4 0 4-5 4 5m6-10h7v9h-7zm0 4h7M11 26h9v6h-9zm0 9h9m5-9h10m-8 0v9m6-9v9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export function TianjiTabloidPaper({issue,historical=false}:{issue:TianjiTabloidIssueView;historical?:boolean}){
  const title=useId();
  return <article aria-labelledby={title}
    className="min-w-0 rounded-lg border border-amber-700/45 bg-gradient-to-br from-[#f5e7c7] via-[#f7edda] to-[#f0dcb6] p-3 text-[#392b23] shadow-inner sm:p-4">
    <header className="flex min-w-0 items-center justify-between gap-2 border-b-4 border-double border-amber-900/45 pb-2">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-xs font-semibold tracking-wider text-amber-900">{historical?'旧卷 · ':''}天机阁季刊</p>
        <h3 id={title} className="font-serif text-2xl font-bold leading-tight text-amber-950">江湖小报</h3>
        <p className="mt-1 text-xs font-medium text-[#5d432f]">仙历 {issue.year} 年 {issue.month} 月刊</p>
      </div>
      <InkSeal/>
    </header>
    {issue.quiet&&<p className="pt-2 text-xs text-[#604630]">本期薄薄一张，且慢慢翻。
    </p>}
    <div className="grid min-w-0 grid-cols-1 gap-y-2 py-2 sm:grid-cols-2 sm:gap-x-4">
      {sections.map(({kind,label,quiet},index)=>{
        const entry=issue.columns.find(row=>row.kind===kind);
        return <section key={kind} aria-label={label}
          className={`min-w-0 space-y-0.5 border-b border-amber-900/25 pb-2 [overflow-wrap:anywhere] ${index===0?'sm:col-span-2':''}`}>
          <h4 className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs font-semibold tracking-wider text-amber-950">
            {label}{entry?.siteName&&<span className="font-normal tracking-normal text-[#5d432f]">· {entry.siteName}</span>}
          </h4>
          {entry&&!entry.empty?<>{entry.title!==label&&<p className={`font-serif font-bold leading-snug ${index===0?'text-lg':'text-base'}`}>{entry.title}</p>}
            <p className="text-sm leading-6">{entry.text}</p></>:<p className="text-xs leading-5 text-[#604630]">{entry?.text??quiet}</p>}
        </section>;
      })}
    </div>
    {issue.hotspot&&<aside aria-label="群聊风向" className="min-w-0 rounded-md border border-amber-900/20 bg-amber-100/45 p-2 [overflow-wrap:anywhere]">
      <p className="text-xs font-semibold text-amber-950">群聊风向 · 编者摘记</p>
      <p className="mt-0.5 font-serif text-sm font-semibold">{issue.hotspot.title}</p>
      <p className="text-sm leading-6">{issue.hotspot.text}</p>
      <p className="text-xs text-[#604630]">只是道友的议论，不作判词。</p>
    </aside>}
  </article>;
}

function ScopedTabloid({issues,historical,legacyArchive}:{issues:readonly TianjiTabloidIssueView[];historical?:boolean;legacyArchive?:ReactNode}){
  const label=useId();
  const [opened,setOpened]=useState(false);
  const [requested,setRequested]=useState<string>();
  const index=Math.max(0,issues.findIndex(row=>row.id===requested));
  const issue=issues[index];
  if(!issue)return null;
  return <details aria-labelledby={label} className="min-w-0 rounded-lg border border-amber-300/25 bg-slate-950/65 px-2.5"
    onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary id={label} className="min-h-11 cursor-pointer content-center rounded-md font-serif text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      江湖小报
    </summary>
    {opened&&<div className="space-y-2 pb-2.5">
      {issues.length>1&&<nav aria-label="翻阅江湖小报期次" className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button type="button" className={flip} disabled={index===0} onClick={()=>setRequested(issues[index-1]?.id)}>较新一期</button>
        <span role="status" className="px-1 text-center text-xs text-stone-300">{index+1} / {issues.length}</span>
        <button type="button" className={flip} disabled={index>=issues.length-1} onClick={()=>setRequested(issues[index+1]?.id)}>更早一期</button>
      </nav>}
      <TianjiTabloidPaper issue={issue} historical={historical}/>
      {legacyArchive}
    </div>}
  </details>;
}

export function TianjiTabloidRead({scopeKey,...props}:{
  readonly scopeKey:string;
  readonly issues:readonly TianjiTabloidIssueView[];
  readonly historical?:boolean;
  readonly legacyArchive?:ReactNode;
}){
  return <ScopedTabloid key={scopeKey} {...props}/>;
}

import {useId,useState} from 'react';
import type {TianjiGazetteIssueView} from '../engine/tianjiGazetteEngine';

export interface TianjiGazetteReadProps {
  issues:readonly TianjiGazetteIssueView[];
  scopeKey:string;
  historical?:boolean;
}

const flip='min-h-11 min-w-0 flex-1 rounded-md border border-amber-950/25 bg-amber-100/50 px-2.5 py-1 text-sm font-medium text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-40';

function GazetteInk(){
  return <svg viewBox="0 0 56 42" width="56" height="42" aria-hidden="true" focusable="false" className="h-10 w-14 shrink-0 text-amber-900/70">
    <path d="M4 34 14 24l6 3L34 9l15 18 5 7Z" fill="currentColor" opacity=".13"/>
    <path d="M4 34 14 24l6 3L34 9l15 18 5 7M4 36h50m-31-9 11-15 4 7m-33 1c4-7 13-9 19-4m-8-9a6 6 0 1 0-9 8m34 6 7-3 6 7"
      fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

const labels:Record<TianjiGazetteIssueView['entries'][number]['kind'],string>={
  headline:'头版头条',dark_horse:'崭露锋芒',rivalry:'江湖恩怨',bounty:'坊间悬赏',
};
const dateTag:Record<TianjiGazetteIssueView['trigger'],string>={
  year_turn:'岁首刊',battle:'战讯特刊',finale:'此役终卷',
};

export function TianjiGazettePaper({issue,historical=false}:{issue:TianjiGazetteIssueView;historical?:boolean}){
  const heading=useId();
  const head=issue.entries.find(entry=>entry.kind==='headline');
  const columns=issue.entries.filter(entry=>entry.kind!=='headline');
  const sourceDate=(entry:TianjiGazetteIssueView['entries'][number])=>entry.year!==issue.year||entry.month!==issue.month?
    ` · ${entry.year} 年 ${entry.month} 月见闻`:'';

  return <article aria-labelledby={heading} className="min-w-0 rounded-lg border border-amber-700/45 bg-gradient-to-br from-[#f5e7c7] via-[#f7edda] to-[#f0dcb6] p-3 text-[#392b23] shadow-inner sm:p-4">
    <div className="flex items-center justify-between gap-2 border-b-4 border-double border-amber-900/50 pb-2.5">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-xs font-semibold tracking-wider text-amber-950">{historical?'旧卷 · ':''}{dateTag[issue.trigger]}</p>
        <h3 id={heading} className="font-serif text-2xl font-bold leading-tight text-amber-950 sm:text-3xl">天机风云报</h3>
        <p className="mt-1 text-xs font-medium text-[#5d432f]">仙历 {issue.year} 年 {issue.month} 月刊</p>
      </div>
      <GazetteInk/>
    </div>
    {head&&<section aria-label={labels.headline} className="space-y-1.5 py-3 [overflow-wrap:anywhere]">
      <p className="text-xs font-semibold tracking-wider text-amber-900">{labels.headline} · {head.siteName}{sourceDate(head)}</p>
      <h4 className="font-serif text-xl font-bold leading-snug text-[#35241c] sm:text-2xl">{head.title}</h4>
      <p className="whitespace-pre-wrap font-serif text-base leading-7">{head.text}</p>
    </section>}
    {!!columns.length&&<div className="grid min-w-0 grid-cols-1 gap-y-2 border-t border-amber-900/25 pt-2 sm:grid-cols-2 sm:gap-x-4">
      {columns.map(entry=><section key={entry.kind} aria-label={labels[entry.kind]} className="min-w-0 space-y-1.5 border-b border-amber-900/20 pb-2.5 [overflow-wrap:anywhere]">
        <p className="text-xs font-semibold text-amber-900">{labels[entry.kind]} · {entry.siteName}{sourceDate(entry)}</p>
        <h4 className="font-serif text-base font-bold leading-snug text-[#35241c]">{entry.title}</h4>
        <p className="whitespace-pre-wrap text-sm leading-6">{entry.text}</p>
      </section>)}
    </div>}
    <p className="mt-2 text-xs leading-relaxed text-[#604630]">各条仅记当期可核的见闻，不作来日断语。</p>
  </article>;
}

function ScopedGazette({issues,historical}:Omit<TianjiGazetteReadProps,'scopeKey'>){
  const label=useId();
  const [opened,setOpened]=useState(false);
  const [requested,setRequested]=useState<string>();
  const index=Math.max(0,issues.findIndex(issue=>issue.id===requested));
  const issue=issues[index];
  if(!issue)return null;
  return <details aria-labelledby={label} className="min-w-0 rounded-lg border border-amber-300/25 bg-slate-950/65 px-2.5"
    onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary id={label} className="min-h-11 cursor-pointer content-center rounded-md font-serif text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      天机风云报
    </summary>
    {opened&&<div className="space-y-2 pb-2.5">
      {issues.length>1&&<nav aria-label="翻阅风云报期次" className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button type="button" className={flip} disabled={index===0} onClick={()=>setRequested(issues[index-1]?.id)}>较新一期</button>
        <span role="status" className="px-1 text-center text-xs text-slate-300">{index+1} / {issues.length}</span>
        <button type="button" className={flip} disabled={index>=issues.length-1} onClick={()=>setRequested(issues[index+1]?.id)}>更早一期</button>
      </nav>}
      <TianjiGazettePaper issue={issue} historical={historical}/>
    </div>}
  </details>;
}

export function TianjiGazetteRead({scopeKey,...props}:TianjiGazetteReadProps){
  return <ScopedGazette key={scopeKey} {...props}/>;
}

import {useId} from 'react';
import type {CampaignAssemblyOption,CampaignAssemblyView} from '../engine/campaignAssembly';

const phaseCopy={
  arrived:{title:'山门前的誓师',text:'人既到阵前，这一程才真正有了分量。'},
  engaged:{title:'两军在阵',text:'阵前只记实到之人，不凭出征名册论胜负。'},
  withdrawn:{title:'阵前收兵',text:'兵已收。这一幕只记到阵与收兵，不替各宗分高下。'},
} as const;

const optionNotes={
  guard:'选择守阵，不等于人人留阵，也不保证守住。',
  negotiate:'提出议和，不等于对方应允。',
  join:'动身赴阵，须真正抵达才算在阵前。',
} as const;

export function CampaignAssemblyCard({view,busy=false,onChoose}:{
  view:CampaignAssemblyView;
  busy?:boolean;
  onChoose?:(option:CampaignAssemblyOption)=>void;
}){
  const heading=useId();
  const {title,text}=phaseCopy[view.phase];
  const local=view.cohorts.length>0||view.phase==='withdrawn';
  if(!local&&!view.options.length)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header>
      <p className="text-xs text-amber-200">{view.siteName}</p>
      <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">{local?title:'赴阵前'}</h3>
    </header>
    <p className="font-serif text-sm leading-relaxed text-slate-200">{local?text:'眼下只知阵地所在，阵前人马未能亲见。'}</p>
    {view.cohorts.length>0&&<ul aria-label="亲见到阵人马" className="grid gap-x-3 gap-y-1 text-sm text-slate-200 sm:grid-cols-2">
      {view.cohorts.map(({sectName,side,count,commanderName},index)=><li key={index} className="min-w-0 border-l border-amber-300/30 pl-2">
        <p><span className="text-xs text-amber-200">{side==='attacker'?'攻方':'守方'} · </span>{sectName} · {count} 人</p>
        {commanderName&&<p className="text-xs text-slate-300">带队：{commanderName}</p>}
      </li>)}
    </ul>}
    {onChoose&&view.options.length>0&&<div role="group" aria-label="此刻如何应阵" className="grid gap-1.5 sm:grid-cols-3">
      {view.options.map((option,index)=><button key={index} type="button" disabled={busy}
        className="min-h-11 w-full rounded-md border border-amber-300/35 bg-slate-950/65 px-2.5 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50"
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}
        onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
        {option.label}<span className="block text-xs leading-relaxed text-slate-300">{option.kind==='negotiate'&&option.command.ceasefireMove==='accept'?
          '只签已有的这一纸议约，须重新核实双方资格。':optionNotes[option.kind]}</span>
      </button>)}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一令还未落定。</p>}
  </section>;
}

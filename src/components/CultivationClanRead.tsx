import {useEffect,useId,useRef,useState} from 'react';
import type {ClanOption,CultivationClanView} from '../engine/cultivationClanEngine';

import {CLAN_BIRTH_EARNED_MONTHS,CLAN_CEREMONY_QI,CLAN_INNATE_NAMES} from '../engine/cultivationClanTerms';
import type {CultivationUnion} from '../types/cultivationClan';

export interface ClanControls {
  busy?:boolean;
  guide?:(option:ClanOption)=>Promise<boolean>;
}

const touch='min-h-11 min-w-0 rounded-md border border-teal-300/30 px-3 py-1.5 text-left text-sm text-teal-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50';

function ClanInk(){
  return <svg viewBox="0 0 44 36" aria-hidden="true" focusable="false" className="h-9 w-11 shrink-0 text-teal-300">
    <path d="M22 30c0-7-2-15 1-24m-1 18q-10-1-14-8 10-2 14 8m0-5q8 0 14-9-11 0-14 9m-1-4Q12 10 15 4q8 5 6 11m1 11q9 1 14-5-10-1-14 5M9 31h26"
      fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

type Named=(id:string)=>string;

const unionStatus:Record<CultivationUnion['status'],string>={
  proposed:'已有提议，尚待另一个人答复',accepted:'两人已同意，尚未举行结契大典',bonded:'大典已成，双方已结为道侣',
  refused:'提议未获同意',expired:'此议时机已过，未结契',
};

function clanChoice(option:ClanOption,view:CultivationClanView,named:Named){
  if(option.clanMove==='propose')return {title:`邀${named(option.targetCultivatorId)}议结道侣`,text:'只递出提议，不替对方答允。'};
  const union=view.unions.find(row=>row.id===option.targetCultivationUnionId);
  const peer=union?.parents.findIndex(actorId=>actorId!==view.actorId)??-1;
  const name=peer>=0?union?.names[peer]??'对方':'对方';
  return {
    accept:{title:`同意${name}的邀约`,text:'记下本人答允；尚未举行大典。'},
    refuse:{title:`婉拒${name}的邀约`,text:'只结束这次提议。'},
    ceremony_offer:{title:'提议同办结契大典',text:`须由${name}另行确认，此刻不耗真气。`},
    ceremony:{title:'同意举行结契大典',text:`双方在场才能成礼；礼成各实耗 ${CLAN_CEREMONY_QI} 真气。`},
    family_offer:{title:'提议筹备家传',text:`须由${name}另行应允，这不是出生实录。`},
    family_accept:{title:'同意筹备家传',text:'此为双方意愿，还没有出生实录。'},
    family_refuse:{title:'暂不筹备家传',text:'结束这次筹备提议，不改两人的道侣身份。'},
  }[option.clanMove];
}

function hasClanRead(view:CultivationClanView){return view.unions.some(union=>union.own||union.status==='bonded');}

function ClanRecords({view,tick,named}:{view:CultivationClanView;tick:number;named:Named}){
  const children=[...new Map(view.unions.filter(union=>union.own).flatMap(union=>union.children).map(child=>[child.id,child])).values()];
  return <>
    {view.unions.filter(union=>union.own||union.status==='bonded').map(union=><section key={union.id} aria-label="当事人的道侣实录" className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/65 p-2.5 [overflow-wrap:anywhere]">
      <h5 className="font-serif text-sm font-semibold text-teal-100">{union.names.join(' 与 ')}</h5>
      <p className="text-sm text-slate-200">{unionStatus[union.status]}。</p>
      {union.siteName&&<p className="text-xs text-slate-300">{union.siteName}</p>}
      {union.own&&union.status==='accepted'&&union.ceremonyOffer&&<p className="text-xs text-slate-300">{named(union.ceremonyOffer.actorId)}已提议大典，尚未成礼。</p>}
      {union.ceremony&&<p className="text-xs text-slate-300">大典实录：两人各耗 {union.ceremony.qiPaidEach} 真气。</p>}
      {union.own&&union.plan?.status==='offered'&&<p className="text-xs text-slate-300">已有筹备家传的提议，尚待同意。没有出生实录。</p>}
      {union.own&&union.plan?.status==='declined'&&<p className="text-xs text-slate-300">这次家传提议未获同意。</p>}
      {union.own&&union.plan?.status==='expecting'&&<p className="text-xs text-slate-300">双方已同意，家传进展 {union.plan.earnedTicks.length}/{CLAN_BIRTH_EARNED_MONTHS} 月。没有出生实录。</p>}
      {union.own&&union.plan?.status==='lost'&&<p className="text-xs text-slate-300">这次筹备已经中止，没有出生实录。</p>}
    </section>)}
    {children.length>0&&<section aria-label="已经出生的家传成员" className="space-y-1.5">
      <h5 className="text-sm font-semibold text-teal-100">已出生 · 家传实录</h5>
      <ul className="space-y-1.5">
        {children.map(child=><li key={child.id} className="space-y-0.5 rounded-md border border-slate-800 p-2 [overflow-wrap:anywhere]">
          <p className="text-sm text-slate-200"><strong>{child.name}</strong>{child.maturedTick!==undefined?' · 已成年':' · 尚未成年'}</p>
          <p className="text-xs text-slate-300">灵根：{child.roots.join('、')} · 先天：{CLAN_INNATE_NAMES[child.innateTrait]}</p>
          {child.birthTick===tick&&<p className="text-xs text-teal-200">本月新生。</p>}
        </li>)}
      </ul>
    </section>}
  </>;
}

export function CultivationClanRead({view,tick,named,controls}:{
  view:CultivationClanView;tick:number;named:Named;controls?:ClanControls;
}){
  const id=useId();
  const [working,setWorking]=useState(false);
  const [failed,setFailed]=useState(false);
  const inFlight=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const busy=working||!!controls?.busy;
  const guide=async(option:ClanOption)=>{
    if(!controls?.guide||busy||inFlight.current||!view.options.includes(option))return;
    inFlight.current=true;
    setWorking(true);
    setFailed(false);
    try {
      const advanced=await controls.guide(option);
      if(mounted.current)setFailed(!advanced);
    } catch {if(mounted.current)setFailed(true);}
    finally {inFlight.current=false;if(mounted.current)setWorking(false);}
  };
  const live=!!controls?.guide;
  if(!hasClanRead(view)&&!(live&&view.options.length))return null;
  return <details aria-labelledby={id} className="min-w-0 rounded-lg border border-teal-300/25 bg-gradient-to-b from-teal-950/25 to-slate-950/80 px-3">
    <summary id={id} className="flex min-h-11 cursor-pointer items-center gap-2 font-serif text-base font-semibold text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
      <ClanInk/>道侣与家传
    </summary>
    <div className="min-w-0 space-y-3 pb-3" aria-busy={busy}>
      <ClanRecords view={view} tick={tick} named={named}/>
      {live&&view.options.length>0&&<>
        <p className="text-xs text-slate-300">{working?'正在行过这一月…':'选一项，行过一月。对方的选择仍由本人作出。'}</p>
        <div role="group" aria-label="此刻可办" className="grid min-w-0 gap-1.5 sm:grid-cols-2">
          {view.options.map(option=>{
            const copy=clanChoice(option,view,named);
            return <button key={JSON.stringify(option)} type="button" className={touch} disabled={busy} onClick={()=>void guide(option)}>
              <span className="block font-semibold">{copy.title}</span>
              <span className="block text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">{copy.text}</span>
            </button>;
          })}
        </div>
      </>}
      {failed&&<p role="status" className="text-xs text-amber-200">此事未成。请核对当事人此刻的选择与所在。</p>}
    </div>
  </details>;
}

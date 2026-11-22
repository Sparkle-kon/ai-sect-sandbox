import {useId,useRef,useState} from 'react';
import type {NorthWellReviewOption} from '../engine/northWellRevisitEngine';
import {NORTH_WELL_REVIEW_FEE,NORTH_WELL_SURVEY_RECENCY} from '../engine/northWellRevisitTerms';
import {WATER_VEIN_SURVEY_STONES} from '../engine/waterVeinTerms';

export type RevisitDate={year:number;month:number};
export type RevisitMove='keep'|'permit';
export interface NorthWellEvidenceView {
  scope:'local'|'personal';
  siteName:string;wellName?:string;
  original?:{date:RevisitDate;stance:'seal'|'continue'|'detour';verifiedPassage?:boolean};
  current?:{date:RevisitDate;population:number;status:'village'|'town'|'ruin';hereReader?:string};
  law?:{date:RevisitDate;retainedPopulation:number};
  recentPaidSurvey?:boolean;
  ownSurvey?:{date:RevisitDate;paidStones:number;depth?:number};
  ownReview?:{date:RevisitDate;move:RevisitMove;paidStones:number;expires?:RevisitDate;permitState?:'waiting'|'valid'|'spent'|'expired'};
}
export interface NorthWellRevisitControls<T=NorthWellReviewOption> {
  scopeKey:string;revisionKey:object;disabled?:boolean;pending?:RevisitMove;
  choices:readonly {key:string;move:RevisitMove;order:T}[];
  onQueue:(order:T,source:object)=>boolean;
}
export interface NorthWellRevisitAuthorReview {
  proposalKey:string;date:RevisitDate;siteName:string;population:number;
}
export interface NorthWellRevisitAuthorControls {
  scopeKey:string;revisionKey:object;disabled?:boolean;
  onPrepare:(source:object)=>Promise<NorthWellRevisitAuthorReview|undefined>;
  onConfirm:(review:NorthWellRevisitAuthorReview,source:object)=>Promise<boolean>|boolean;
}
const btn='min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 disabled:opacity-50';
const when=({year,month}:RevisitDate)=>`仙历 ${year} 年 ${month} 月`;
const stance={seal:'封矿保水',continue:'照旧采矿',detour:'出资改道'} as const;
const state={village:'村',town:'镇',ruin:'遗址'} as const;
const moveLabel:Record<RevisitMove,string>={keep:'按现行规矩办理',permit:'为本人核一次下矿许可'};

export function NorthWellRevisitFacts({view}:{view:NorthWellEvidenceView}) {
  const facts=view.original,current=view.scope==='local'?view.current:undefined;
  return <div className="space-y-1 rounded border border-slate-800 p-2">
    {facts&&<p>旧卷 · {when(facts.date)}：{facts.verifiedPassage?'原采契、原井和确曾走过的路都可核。':'原采契与原井可核，不据此断言旧路走过。'}旧文议的是「{stance[facts.stance]}」。</p>}
    {current&&<p>此刻 · {when(current.date)}：仍是{view.siteName}的{view.wellName??'原井'}；现地为{state[current.status]}，有 {current.population} 位实住居民。{current.hereReader&&`可到井边的是${current.hereReader}本人。`}</p>}
    {view.scope==='local'&&view.law&&<p>作者线 · {when(view.law.date)}新立禁牌，所禁是本井新引灵和未经许可的开采。立法时这里仍有 {view.law.retainedPopulation} 位实住居民；没有把住民、旧井或原路抹掉，也不说此法自然延续了三百年。</p>}
    {!current&&<p>这是你有权核读的旧卷，不是亲到该处的当月现况。</p>}
  </div>;
}

export function NorthWellRevisitPanel({view,controls,author}:{view:NorthWellEvidenceView;controls?:NorthWellRevisitControls;author?:NorthWellRevisitAuthorControls}) {
  if(!view.original&&!view.current&&!view.law&&!view.ownSurvey&&!view.ownReview&&!author)return null;
  return <details className="min-w-0 rounded border border-sky-900 bg-slate-950/40 p-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-sky-100">重访旧井</summary>
    <div className="space-y-2">
      <NorthWellRevisitFacts view={view}/>
      {view.ownSurvey&&<p>自己的井尺 · {when(view.ownSurvey.date)}原账付 {view.ownSurvey.paidStones} 灵石。{view.ownSurvey.depth!==undefined&&`实测 ${view.ownSurvey.depth} 寸。`}只记在场那一日。</p>}
      {view.scope==='local'&&view.recentPaidSurvey===false&&!view.ownReview&&<p>要复议，须在井边先实付 {WATER_VEIN_SURVEY_STONES} 灵石定尺，再于 {NORTH_WELL_SURVEY_RECENCY} 月内凭自己的井尺办理。</p>}
      {view.ownReview&&<p>自己的复议 · {when(view.ownReview.date)}原账付 {view.ownReview.paidStones} 灵石，选择「{moveLabel[view.ownReview.move]}」。{view.ownReview.permitState==='spent'?'这次许可已经用过。':view.ownReview.permitState==='expired'?'这次许可已经到期。':view.ownReview.expires&&`许可最后可用月为${when(view.ownReview.expires)}，且限本人一次；还要照实际矿情办理。`}</p>}
      {view.scope==='local'&&controls&&<RevisitOrders key={controls.scopeKey} {...controls}/>}
      {view.scope==='local'&&author&&<AuthorLawReview key={author.scopeKey} {...author}/>}
    </div>
  </details>;
}
export function reviewedRevisitOrder<T>(staged:{choice:NorthWellRevisitControls<T>['choices'][number];revision:object}|undefined,
  revision:object,choices:NorthWellRevisitControls<T>['choices']) {
  if(!staged||staged.revision!==revision)return undefined;
  const matching=choices.filter(row=>row.key===staged.choice.key);
  return matching.length===1?matching[0]:undefined;
}
function RevisitOrders<T>({revisionKey,choices,disabled,pending,onQueue}:NorthWellRevisitControls<T>) {
  const [staged,setStaged]=useState<{choice:NorthWellRevisitControls<T>['choices'][number];revision:object}>();
  const [notice,setNotice]=useState('');
  const reviewId=useId(),offer=reviewedRevisitOrder(staged,revisionKey,choices);
  return <>
    {pending&&<p role="status">已候下月：{moveLabel[pending]}。此刻没有落复议账。</p>}
    {!pending&&choices.length>0&&<details className="min-w-0 space-y-1">
      <summary className="flex min-h-11 cursor-pointer items-center text-sky-100">按本人的资格复议</summary>
      <div className="flex flex-wrap gap-1">
        {choices.map(choice=><button type="button" className={btn} key={choice.key} disabled={disabled}
          aria-pressed={offer?.key===choice.key} onClick={()=>{setStaged({choice,revision:revisionKey});setNotice('');}}>{moveLabel[choice.move]}</button>)}
      </div>
      {offer&&!disabled&&<div role="group" aria-labelledby={reviewId} className="space-y-1">
        <p id={reviewId}>{moveLabel[offer.move]}：现仅记打算。下月人、井、旧契和本人井尺都重新核验，实际办成才自付 {NORTH_WELL_REVIEW_FEE} 灵石。{offer.move==='permit'?'不是开启天门，也不废掉其他人的旧约。':''}</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={btn} onClick={()=>{setNotice(onQueue(offer.order,revisionKey)?
            '已记下打算，尚未付款。':'此人或原卷已变，没有记下。');setStaged(undefined);}}>记作下月打算</button>
          <button type="button" className={btn} onClick={()=>setStaged(undefined)}>先不做</button>
        </div>
      </div>}
    </details>}
    {notice&&<p role="status">{notice}</p>}
  </>;
}

export function reviewedNorthWellAuthor(staged:{proposal:NorthWellRevisitAuthorReview;revision:object}|undefined,source:object) {
  return staged?.revision===source?staged.proposal:undefined;
}
function AuthorLawReview({revisionKey,disabled,onPrepare,onConfirm}:NorthWellRevisitAuthorControls) {
  const [staged,setStaged]=useState<{proposal:NorthWellRevisitAuthorReview;revision:object}>();
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const inFlight=useRef(false),latest=useRef(revisionKey);
  latest.current=revisionKey;
  const reviewId=useId(),proposal=reviewedNorthWellAuthor(staged,revisionKey);
  const prepare=async()=>{
    if(inFlight.current||disabled)return;
    inFlight.current=true;setBusy(true);setNotice('');setStaged(undefined);
    try{const next=await onPrepare(revisionKey);
      if(latest.current===revisionKey){
        if(next)setStaged({proposal:next,revision:revisionKey});else setNotice('眼下母本或旧卷核不上，未开旁线。');
      }
    }catch{if(latest.current===revisionKey)setNotice('眼下核验未完成，未开旁线。');}
    finally{inFlight.current=false;setBusy(false);}
  };
  const confirm=async()=>{
    if(!proposal||inFlight.current||disabled||latest.current!==revisionKey)return;
    inFlight.current=true;setBusy(true);
    try{
      const ok=await onConfirm(proposal,revisionKey);
      if(latest.current===revisionKey)setNotice(ok?'另开同日作者旁线，原线仍在。':'已换母本或分支无位，原线与现账未动。');
    }catch{if(latest.current===revisionKey)setNotice('旁线未打开，原线与现账未动。');}
    finally{inFlight.current=false;setBusy(false);setStaged(undefined);}
  };
  return <details className="min-w-0 space-y-1 border-t border-slate-800 pt-1">
    <summary className="flex min-h-11 cursor-pointer items-center text-sky-100">另读作者法禁</summary>
    <p>只从已核清的自然母本同一日另开旁线。不改本线，不添写过去三百年。</p>
    {!proposal&&<button type="button" className={btn} disabled={disabled||busy} onClick={()=>void prepare()}>核对旁线母本</button>}
    {proposal&&<div role="group" aria-labelledby={reviewId} className="space-y-1">
      <p id={reviewId}>{when(proposal.date)}，{proposal.siteName}仍住 {proposal.population} 人。仅让这条作者旁线在本日新立禁牌，保留原井、居民与真旧约；不是已开始执行。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} disabled={disabled||busy} onClick={()=>void confirm()}>另开作者旁线</button>
        <button type="button" className={btn} disabled={busy} onClick={()=>setStaged(undefined)}>仍只看自然线</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </details>;
}

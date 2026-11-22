import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import {projectScribeCommissionManuscript,scribeCommissionFact,visibleScribeCommissions,type ScribeCommissionOption} from '../engine/scribeCommissionEngine';
import {SCRIBE_COMMISSION_DEPOSIT,SCRIBE_COMMISSION_INK,SCRIBE_COMMISSION_WAGE,type ScribeCommission} from '../types/scribeCommission';
import type {Cultivator,WorldState} from '../types/world';

export interface ScribeCommissionControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly ScribeCommissionOption[];
  pending?:ScribeCommissionOption;
  disabled?:boolean;
  onQueue:(choice:ScribeCommissionOption,revision:object)=>boolean;
}
type Props={world:WorldState;viewer?:Cultivator;controls?:ScribeCommissionControls};
type Offer=Extract<ScribeCommissionOption,{scribeCommissionMove:'offer'}>;
type Stage={choice:ScribeCommissionOption;revision:object};
const labels:Record<ScribeCommissionOption['scribeCommissionMove'],string>={
  offer:'请掌卷人编写',accept:'当面接下稿约',decline:'谢绝此约',withdraw:'撤下这份稿约',
  verify:'研墨核对原卷',deliver:'将核过的原稿交付',
};
const terms:Record<ScribeCommissionOption['scribeCommissionMove'],string>={
  offer:'只许邀请当面可核原卷的掌卷人。发出邀约不扣托管。',
  accept:'只有对方实接稿约，才从原委托人实扣 '+SCRIBE_COMMISSION_DEPOSIT+' 灵石托管。',
  decline:'未应允时谢绝，不扣托管；已应允则只实退尚存的余款，不退已付墨钱。',
  withdraw:'依现有账退还未耗托管，已经实付的墨钱不退。',
  verify:'实核原卷时才从本单托管中支 '+SCRIBE_COMMISSION_INK+' 灵石购墨，不算交付。',
  deliver:'两人实到才交付核过的原稿，同时从本单托管实付 '+SCRIBE_COMMISSION_WAGE+' 灵石稿酬。',
};
const button='min-h-11 min-w-0 max-w-full rounded border border-amber-500/35 bg-slate-950 px-2 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const summary='flex min-h-11 cursor-pointer items-center text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300';
const key=(choice:ScribeCommissionOption)=>JSON.stringify(choice.scribeCommissionMove==='offer'?
  [choice.action,choice.scribeCommissionMove,choice.targetChronicleSourceId,choice.targetCultivatorId]:
  [choice.action,choice.scribeCommissionMove,choice.targetScribeCommissionId]);
const isOffer=(choice:ScribeCommissionOption):choice is Offer=>choice.scribeCommissionMove==='offer';
const isOpen=(row:ScribeCommission)=>row.status==='offered'||row.status==='accepted'||row.status==='verified';
const safeLabel=(name:string)=>name.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').trim().slice(0,64);
const subject=(kind:'duel'|'relief')=>kind==='duel'?'斗法原据':'赈济原据';
const date=(fact:{year:number;month:number})=>'仙历 '+fact.year+' 年 '+fact.month+' 月';
function uniqueMenu(choices:readonly ScribeCommissionOption[]){
  const counts=new Map<string,number>();
  for(const choice of choices){const id=key(choice);counts.set(id,(counts.get(id)??0)+1);}
  return choices.filter(choice=>counts.get(key(choice))===1);
}
export function reviewedScribeCommission(stage:Stage|undefined,revision:object,choices:readonly ScribeCommissionOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const exact=choices.filter(row=>key(row)===key(stage.choice));
  return exact.length===1?exact[0]:undefined;
}
function stateText(row:ScribeCommission,viewer:Cultivator){
  const isPatron=row.patronId===viewer.id;
  switch(row.status){
    case 'offered':return '邀约已递，尚未应允，没有实扣托管。';
    case 'accepted':return '两人已当面应约。原委托人实付 '+row.escrowStones+' 灵石托管，尚未核卷。';
    case 'verified':return '原卷已经实核，已耗 '+row.verification?.inkPaid+' 灵石购墨；稿子还未交。';
    case 'delivered':return '原稿已经当面交手，掌卷人实收 '+row.manuscript?.wagePaid+' 灵石。';
    case 'declined':return row.acceptedTick===undefined?'掌卷人已谢绝，未立稿约。':
      '掌卷人谢绝继续，未交原稿。'+(row.refundedStones>0?
        (isPatron?'已退回本人 ':'已退给委托人 ')+row.refundedStones+' 灵石，只退托管余款。':'无托管可退。');
    case 'withdrawn':return '委托人撤下稿约。'+(row.refundedStones>0?
      (isPatron?'已退回本人 ':'已退给委托人 ')+row.refundedStones+' 灵石，只退托管余款。':'无托管可退。');
    case 'unavailable':return '另一原订人已不在世，未交原稿。'+(row.refundedStones>0?
      (isPatron?'退回本人 ':'退回原委托方账户 ')+row.refundedStones+' 灵石，只退未耗托管。':'无托管可退。');
    case 'expired':return '稿约已到期，未交原稿。'+(row.refundedStones>0?
      (isPatron?'已退回本人 ':'已退给委托人 ')+row.refundedStones+' 灵石，只退托管余款。':'无托管可退。');
  }
}
function orderAllowed(row:ScribeCommission,viewer:Cultivator,choice:ScribeCommissionOption){
  if(isOffer(choice)||choice.targetScribeCommissionId!==row.id)return false;
  switch(choice.scribeCommissionMove){
    case 'accept':return row.status==='offered'&&row.scribeId===viewer.id;
    case 'decline':return isOpen(row)&&row.scribeId===viewer.id;
    case 'withdraw':return isOpen(row)&&row.patronId===viewer.id;
    case 'verify':return row.status==='accepted'&&row.scribeId===viewer.id;
    case 'deliver':return row.status==='verified'&&row.scribeId===viewer.id;
  }
}
function Commission({world,viewer,row}:{world:WorldState;viewer:Cultivator;row:ScribeCommission}){
  const manuscript=projectScribeCommissionManuscript(world,viewer,row.id);
  const evidence=scribeCommissionFact(world,row.sourceEventId,row.siteId,row.offeredTick);
  const counterpart=safeLabel(world.cultivators.find(person=>person.id===(row.patronId===viewer.id?row.scribeId:row.patronId))?.name??'');
  return <section className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
    <p>{row.patronId===viewer.id?'本人委写':'本人承写'}{counterpart&&<> · 对方 {counterpart}</>}{evidence&&<> · {subject(evidence.source.kind)}</>}。</p>
    <p>{stateText(row,viewer)}</p>
    {manuscript&&<article className="space-y-2" aria-label="本人可读的交付原稿">
      <h4 className="font-serif text-base text-amber-100">{manuscript.title}</h4>
      <p className="whitespace-pre-wrap font-serif leading-7">{manuscript.body}</p>
      <details className="min-w-0 rounded border border-slate-800 px-2">
        <summary className={summary}>看原稿所据与异文</summary>
        <p>已核史料：{manuscript.sourceTitle}{evidence&&<> · {date(evidence)}</>}。</p>
        {manuscript.disagreement&&<div className="space-y-1 py-1">
          <p>两则署名传本说法不同，以下保留所述，均不等于已核史实：</p>
          <ul className="list-inside list-disc">
            <li>{manuscript.disagreement.witnessA}</li>
            <li>{manuscript.disagreement.witnessB}</li>
          </ul>
        </div>}
        {manuscript.correction&&<p className="pb-1">{manuscript.correction}</p>}
      </details>
    </article>}
  </section>;
}
function Offers({world,viewer,choices,onChoose,disabled}:{world:WorldState;viewer:Cultivator;choices:readonly Offer[];onChoose:(choice:Offer)=>void;disabled?:boolean}){
  const [chosenSource,setSource]=useState<string>();
  const sources=[...new Set(choices.map(row=>row.targetChronicleSourceId))];
  const source=chosenSource&&sources.includes(chosenSource)?chosenSource:undefined;
  const offers=source?choices.filter(row=>row.targetChronicleSourceId===source):[];
  const actorLabel=(id:string)=>safeLabel(world.cultivators.find(row=>row.id===id)?.name??'');
  const sourceLabel=(id:string)=>{
    const evidence=scribeCommissionFact(world,id,viewer.locationId,world.tick+1);
    if(!evidence)return undefined;
    const fact=evidence.source;
    const named= (fact.kind==='duel'?fact.participantIds:[fact.actorId]).map(actorLabel).filter(Boolean).join('、');
    return [named,subject(fact.kind),date(evidence)].filter(Boolean).join(' · ');
  };
  const named=offers.filter(row=>actorLabel(row.targetCultivatorId));
  const count=(label:string)=>named.filter(row=>actorLabel(row.targetCultivatorId)===label).length;
  const visibleSources=sources.filter(id=>sourceLabel(id));
  if(!visibleSources.length)return null;
  return <div className="space-y-2">
    <label className="grid min-w-0 gap-1">选一则此地可核的旧事
      <select className={button+' w-full'} disabled={disabled} value={source?String(visibleSources.indexOf(source)):''}
        onChange={event=>setSource(visibleSources.find((_,index)=>String(index)===event.currentTarget.value))}>
        <option value="">请选择</option>
        {visibleSources.map((id,i)=>{
          const label=sourceLabel(id);
          const repeated=visibleSources.filter(other=>sourceLabel(other)===label).length>1;
          return <option key={id} value={i}>{label}{repeated&&'（同月原件 '+(i+1)+'）'}</option>;
        })}
      </select>
    </label>
    {named.length>0&&<div className="flex flex-wrap gap-1">
      {named.map((option,i)=>{
        const name=actorLabel(option.targetCultivatorId)!;
        return <button key={key(option)} type="button" disabled={disabled} className={button} onClick={()=>onChoose(option)}>
          请{name}{count(name)>1&&'（同名 '+(i+1)+'）'}编写
        </button>;
      })}
    </div>}
  </div>;
}
export function ScribeCommissionRead({world,viewer,controls}:Props){
  const [stage,setStage]=useState<Stage>();
  const [notice,setNotice]=useState('');
  const label=useId();
  if(!viewer||!world.cultivators.includes(viewer))return null;
  const rows=[...visibleScribeCommissions(world,viewer)].sort((a,b)=>(b.closedTick??b.offeredTick)-(a.closedTick??a.offeredTick)||b.offeredTick-a.offeredTick);
  const menu=uniqueMenu(controls?.choices??[]).filter(choice=>choice.action==='SCRIBE_COMMISSION'&&
    (isOffer(choice)||rows.some(row=>orderAllowed(row,viewer,choice))));
  if(!rows.length&&!menu.length&&!controls?.pending)return null;
  const focus=rows.find(isOpen)??rows[0];
  const rest=rows.filter(row=>row!==focus);
  const choice=controls&&reviewedScribeCommission(stage,controls.revisionKey,menu);
  const pending=controls?.pending;
  const choose=(picked:ScribeCommissionOption)=>{if(controls){setStage({choice:picked,revision:controls.revisionKey});setNotice('');}};
  const actionable=(row:ScribeCommission)=>!pending&&menu.filter(option=>orderAllowed(row,viewer,option)).map(option=>
    <button key={key(option)} type="button" disabled={controls?.disabled} className={button}
      aria-pressed={choice===option} onClick={()=>choose(option)}>{labels[option.scribeCommissionMove]}</button>);
  return <details className="min-w-0 space-y-2 rounded border border-amber-500/30 bg-slate-950 px-2 pb-2 text-sm text-slate-100 [overflow-wrap:anywhere]">
    <summary className={summary}>看本人掌卷稿约</summary>
    {focus&&<div className="space-y-1"><Commission world={world} viewer={viewer} row={focus}/><div className="flex flex-wrap gap-1">{actionable(focus)}</div></div>}
    {!pending&&<Offers key={controls?.scopeKey} world={world} viewer={viewer} choices={menu.filter(isOffer)} disabled={controls?.disabled} onChoose={choose}/>}
    {pending&&<p role="status">已候下月：{labels[pending.scribeCommissionMove]}。托管、墨钱和稿子还未动。</p>}
    {choice&&controls&&!pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-1 rounded border border-slate-700 p-2">
      <p id={label}>{terms[choice.scribeCommissionMove]} 排入只耗 {AVATAR_ORDER_COST} 神识。下月才复核本人、在场与原卷凭据；此刻不付钱，不交稿。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，未开始结算。':'本人、时机或凭据已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={button} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
    {rest.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className={summary}>本人其余稿约</summary>
      <div className="space-y-1 pb-2">{rest.map(row=><div key={row.id} className="space-y-1"><Commission world={world} viewer={viewer} row={row}/><div className="flex flex-wrap gap-1">{actionable(row)}</div></div>)}</div>
    </details>}
  </details>;
}

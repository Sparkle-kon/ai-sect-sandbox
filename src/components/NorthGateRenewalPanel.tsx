import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {NorthGateRenewalOption,NorthGateRenewalView} from '../engine/northGateRenewalEngine';
import {WATER_VEIN_OPEN_STONES,WATER_VEIN_RENEWAL_FUNDING} from '../engine/waterVeinTerms';

type Move=NorthGateRenewalOption['northGateRenewalMove'];
type Stamp={year:number;month:number};

export interface NorthGateRenewalControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly NorthGateRenewalOption[];
  pending?:NorthGateRenewalOption;
  disabled?:boolean;
  onQueue:(choice:NorthGateRenewalOption,revision:object)=>boolean;
}

type Review={choice:NorthGateRenewalOption;revision:object};

const labels:Record<Move,string>={
  reuse:'循旧阵开门',
  sect:'由宗门担费',
  endorse:'由乡里具押',
  accord:'合签开门',
};
const funding=WATER_VEIN_RENEWAL_FUNDING;
const stones=(stance:keyof typeof funding)=>WATER_VEIN_OPEN_STONES+funding[stance].extraStones;
const terms:Record<Move,string>={
  reuse:`实启才从宗库支出 ${stones('reuse')} 灵石，向下界水脉借 ${funding.reuse.borrowedUnits} 份灵压。`,
  sect:`实启才从宗库支出 ${stones('sect')} 灵石，不向下界水脉借灵压，也不取乡仓灵根。`,
  endorse:`乡里先记具押，不取灵根、不启门。待不同的合资格宗门掌事合签，才由乡仓出 ${funding.accord.roots} 份灵根。`,
  accord:`实启须重核两方署押及库存，宗库付 ${stones('accord')} 灵石，乡仓出 ${funding.accord.roots} 份灵根，借下界水脉灵压 ${funding.accord.borrowedUnits} 份。`,
};
const button='min-h-11 rounded border border-sky-800 bg-slate-900 px-2.5 text-xs text-slate-100 disabled:opacity-50';
const stamp=({year,month}:Stamp)=>`仙历 ${year} 年 ${month} 月`;

export function reviewedNorthGateRenewalOrder(review:Review|undefined,revision:object,choices:readonly NorthGateRenewalOption[],hearingId:string) {
  if(!review||review.revision!==revision||review.choice.targetNorthGateRenewalId!==hearingId)return undefined;
  const matching=choices.filter(choice=>choice.targetNorthGateRenewalId===hearingId&&
    choice.northGateRenewalMove===review.choice.northGateRenewalMove);
  return matching.length===1?matching[0]:undefined;
}

const blockedLines:Record<NonNullable<NorthGateRenewalView['blocked']>,string>={
  eligibility:'依眼下的门规，此身没有可署的卷。',
  funds:'账上现有灵石不够开门；这里不会先扣欠账。',
  'awaits-consent':'此项仍待今日乡里另署一押。',
  'already-endorsed':'你已经具押，不能再押一次。',
};

export function NorthGateRenewalPanel({view,nowTick,now,controls}:{view:NorthGateRenewalView;nowTick:number;now:Stamp;controls?:NorthGateRenewalControls}) {
  const dateAt=(tick:number):Stamp=>{
    const moon=now.year*12+now.month-1+(tick-nowTick);
    return {year:Math.floor(moon/12),month:((moon%12)+12)%12+1};
  };
  const upper=view.scope==='upper';
  const outcome=view.outcome;
  if(upper&&outcome?.kind!=='reopened')return null;
  const hearing=view.status==='hearing'&&!upper;
  return <details className="min-w-0 rounded border border-sky-800/80 bg-slate-900 p-2 text-sm text-slate-100 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-sky-100">{upper?'观阵抄录：再启实账':'天门再议'}</summary>
    <div className="space-y-2 pb-1">
      {hearing&&<>
        <p>旧阵仍在，开门须问今日人。此议至{stamp(dateAt(view.expiresTick))}收卷；旧账不作新押。</p>
        {view.ownEndorsed?<p>你已具押。灵根还在乡仓，仍待另一方落笔。</p>:
          view.hasEndorsement?<p>乡里已具押，尚未合签，也未支取乡仓。</p>:<p>合签须由今日乡人与宗门掌事各署一押。乡里尚未具押。</p>}
        {controls?<NorthGateRenewalOrders key={controls.scopeKey} view={view} {...controls}/>:
          <p>此处只看议卷，没有替人落笔的权柄。</p>}
      </>}
      {outcome?.kind==='failed'&&<p>{stamp(dateAt(outcome.closedTick))}议卷到期，未能开门。此议未支宗库，也未取乡仓灵根。</p>}
      {outcome?.kind==='reopened'&&<>
        <p>{stamp(dateAt(outcome.openedTick))}，已依「{labels[outcome.stance]}」实开天门。宗库实付 {outcome.paidStones} 灵石；{
          outcome.granaryRoots?`乡仓实出 ${outcome.granaryRoots} 份灵根`:'未取乡仓灵根'
        }；{outcome.borrowedUnits?`实借下界水脉灵压 ${outcome.borrowedUnits} 份`:'未借下界水脉灵压'}。</p>
        <p>{upper?'这是本人在上界核到的旧门账，不能据此断定眼下井水或乡仓。':'过门仍须验人、验时；开门不等于已经过门。'}</p>
      </>}
    </div>
  </details>;
}

function NorthGateRenewalOrders({view,revisionKey,choices,pending,disabled,onQueue}:NorthGateRenewalControls&{view:NorthGateRenewalView}) {
  const [review,setReview]=useState<Review>();
  const [notice,setNotice]=useState('');
  const title=useId();
  const exact=choices.filter(choice=>reviewedNorthGateRenewalOrder({choice,revision:revisionKey},revisionKey,choices,view.id)===choice);
  const queued=pending?.targetNorthGateRenewalId===view.id?pending:undefined;
  const offer=reviewedNorthGateRenewalOrder(review,revisionKey,exact,view.id);
  return <>
    {queued&&<p role="status">已候下月：{labels[queued.northGateRenewalMove]}。并未落笔、支账或开门。</p>}
    {!queued&&exact.length===0&&<p>{view.blocked?blockedLines[view.blocked]:'眼下没有可交给下月的文书。'}这一页不会代签或扣费。</p>}
    {!queued&&exact.length>0&&<div className="flex flex-wrap gap-1">
      {exact.map(choice=><button className={button} type="button" key={choice.northGateRenewalMove} disabled={disabled}
        aria-pressed={offer?.northGateRenewalMove===choice.northGateRenewalMove}
        onClick={()=>{setReview({choice,revision:revisionKey});setNotice('');}}>{labels[choice.northGateRenewalMove]}</button>)}
    </div>}
    {offer&&!queued&&!disabled&&<div role="group" aria-labelledby={title} className="space-y-2 border-t border-slate-700 pt-2">
      <p id={title}>{terms[offer.northGateRenewalMove]}排入耗 {AVATAR_ORDER_COST} 神识，不先动宗库或乡仓；下月还须重核。</p>
      <div className="flex flex-wrap gap-1">
        <button className={button} type="button" onClick={()=>{
          setNotice(onQueue(offer,revisionKey)?'已记下打算，宗库与乡仓未落账。':'地点、人或时机已变，打算未记下。');
          setReview(undefined);
        }}>记作下月打算</button>
        <button className={button} type="button" onClick={()=>setReview(undefined)}>先不落笔</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </>;
}

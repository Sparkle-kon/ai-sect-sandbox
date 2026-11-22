import {useId,useState} from 'react';
import type {NorthMiningOption,NorthMiningCharterView} from '../engine/northMiningCharterEngine';
import {NORTH_MINING_DETOUR_COST} from '../engine/northMiningCharterTerms';

type CharterRow=NorthMiningCharterView['rows'][number];
type MiningStance=CharterRow['stance'];
type MiningRole=CharterRow['signedRoles'][number];
interface MiningCharterChoice {key:string;label:string;review:string;order:NorthMiningOption}
export interface MiningCharterControls {
  scopeKey:string;revisionKey:object;choices:readonly NorthMiningOption[];
  disabled?:boolean;pending?:boolean;
  onQueue:(order:NorthMiningOption,revision:object)=>boolean;
}

export const MINING_STANCE_LABELS:Record<MiningStance,string>={seal:'封矿保水',continue:'照旧采矿',detour:'出资改道'};
const roles:Record<MiningRole,string>={household:'村户',miner:'矿工',sect:'宗门'};
const signers=['household','miner','sect'] as const satisfies readonly MiningRole[];
const stateText:Record<CharterRow['status'],string>={proposed:'待核签，未生效',ratified:'原契已签',expired:'旧案已逾期'};
const terms:Record<MiningStance,string>={
  seal:'只禁这座矿的新采与新借，旧借灵仍按原期偿还；已得灵石不收回。',
  continue:'仍依实况采收和核减矿存，不把悬而未决的损失写成欠账。',
  detour:`须三席核签并复验道路，由宗库实支 ${NORTH_MINING_DETOUR_COST} 灵石才可换道；已上路的货不倒回。`,
};
const tap='min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 disabled:opacity-50';
const when=({year,month}:Pick<CharterRow,'year'|'month'>)=>`仙历 ${year} 年 ${month} 月`;

export function MiningCharterEvidence({row,local}:{row:CharterRow;local:boolean}) {
  const missing=signers.filter(role=>!row.signedRoles.includes(role));
  const signed=signers.filter(role=>row.signedRoles.includes(role));
  return <div className="space-y-1 rounded border border-slate-800 p-2">
    <p>{when(row)}留存。<span className="ml-1">{MINING_STANCE_LABELS[row.stance]}：{terms[row.stance]}</span></p>
    <p>{row.fieldWasReduced?'原案记有可核的实际田产受损。':'此卷未见可核的田产损失，不能从水亏直接推算。'}</p>
    {signed.length>0&&<p>原卷核到{signed.map(role=>`「${roles[role]}」`).join('、')}落笔。</p>}
    {local&&missing.length>0&&row.status==='proposed'&&<p>尚缺{missing.map(role=>`「${roles[role]}」`).join('、')}落笔。</p>}
    {row.status==='ratified'&&row.stance==='detour'&&row.paidStones!==undefined&&<p>改道原账实付 {row.paidStones} 灵石。</p>}
    {local&&row.status==='ratified'&&row.stance==='detour'&&row.hasVerifiedPassage===true&&<p>已有真实通行凭据。</p>}
    {local&&row.status==='ratified'&&row.stance==='detour'&&row.hasVerifiedPassage===false&&<p>新路契已立，尚未核到实际通行。</p>}
    {!local&&<p>这是你确可查到的旧卷，不据此判断眼下路况或契约是否仍有效。</p>}
  </div>;
}

export function NorthMiningCharterPanel({view,controls}:{view:NorthMiningCharterView;controls?:MiningCharterControls}) {
  const [selected,setSelected]=useState<string>(),[reading,setReading]=useState(false);
  const local=view.scope==='local';
  const row=view.rows.find(item=>item.id===selected)??view.rows.at(-1);
  if(!row&&!controls?.choices.length&&!controls?.pending)return null;
  return <details className="min-w-0 rounded border border-amber-900/70 bg-slate-950/40 p-2 [overflow-wrap:anywhere]"
    onToggle={event=>{if(!event.currentTarget.open)setReading(false);}}>
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-amber-100">翻看采契</summary>
    <div className="space-y-2">
      {view.rows.length>1&&<label className="grid gap-1">案卷
        <select className="min-h-11 rounded border border-slate-700 bg-slate-900 px-2 text-base" value={row?.id}
          onChange={event=>{setSelected(event.currentTarget.value);setReading(false);}}>
          {view.rows.map(item=><option key={item.id} value={item.id}>{when(item)} · {MINING_STANCE_LABELS[item.stance]}</option>)}
        </select>
      </label>}
      {row?<p>{stateText[row.status]}。{local&&row.status==='ratified'?(row.active?'此刻仍按该契行事。':'眼下不再按这份旧契行事。'):''}议的是「{MINING_STANCE_LABELS[row.stance]}」。</p>:
        <p>原井还在。手上暂无已经签成的采契。</p>}
      {row&&<button type="button" className={tap} onClick={()=>setReading(value=>!value)} aria-expanded={reading}>
        {reading?'收起凭据':'核看本案凭据'}
      </button>}
      {row&&reading&&<MiningCharterEvidence row={row} local={local}/>}
      {local&&controls&&<MiningOrders key={controls.scopeKey} {...controls} rows={view.rows}/>}
    </div>
  </details>;
}

function describeChoice(order:NorthMiningOption,rows:readonly CharterRow[]):MiningCharterChoice|undefined {
  if(order.northMiningMove==='propose') {
    const stance=order.northMiningStance;
    return {key:`propose:${stance}`,label:MINING_STANCE_LABELS[stance],review:`拟议「${MINING_STANCE_LABELS[stance]}」。${terms[stance]}`,order};
  }
  const original=rows.find(item=>item.id===order.targetNorthMiningCharterId&&item.status==='proposed');
  if(!original)return;
  return {key:`sign:${original.id}`,label:`核签「${MINING_STANCE_LABELS[original.stance]}」`,
    review:`只以本人的资格核对并尝试落笔。条款：「${MINING_STANCE_LABELS[original.stance]}」。${terms[original.stance]}`,order};
}

export function reviewedMiningOrder(staged:{choice:MiningCharterChoice;revision:object}|undefined,
  revision:object,choices:readonly MiningCharterChoice[]):MiningCharterChoice|undefined {
  if(!staged||staged.revision!==revision)return undefined;
  const matching=choices.filter(row=>row.key===staged.choice.key);
  return matching.length===1?matching[0]:undefined;
}

function MiningOrders({revisionKey,choices,disabled,pending,onQueue,rows}:MiningCharterControls&{rows:readonly CharterRow[]}) {
  const [staged,setStaged]=useState<{choice:MiningCharterChoice;revision:object}>();
  const [notice,setNotice]=useState('');
  const reviewId=useId(),actual=choices.flatMap(choice=>describeChoice(choice,rows)??[]);
  const offer=reviewedMiningOrder(staged,revisionKey,actual);
  return <>
    {pending&&<p role="status">打算已候下月；尚未落笔或落账。</p>}
    {!pending&&actual.length>0&&<details className="min-w-0 space-y-1">
      <summary className="flex min-h-11 cursor-pointer items-center text-amber-100">参与此事</summary>
      <div className="flex flex-wrap gap-1">
        {actual.map(choice=><button type="button" className={tap} key={choice.key} disabled={disabled}
          aria-pressed={offer?.key===choice.key} onClick={()=>{setStaged({choice,revision:revisionKey});setNotice('');}}>{choice.label}</button>)}
      </div>
      {offer&&!disabled&&<div role="group" aria-labelledby={reviewId} className="space-y-1">
        <p id={reviewId}>{offer.review} 这里仅记打算，不替任何人签约，也不即刻支钱。下月仍要当场核验。</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={tap} onClick={()=>{setNotice(onQueue(offer.order,revisionKey)?
            '已经记下打算，尚未落笔。':'此案或当事人已变，没有记下。');setStaged(undefined);}}>记作下月打算</button>
          <button type="button" className={tap} onClick={()=>setStaged(undefined)}>先不做</button>
        </div>
      </div>}
    </details>}
    {notice&&<p role="status">{notice}</p>}
  </>;
}

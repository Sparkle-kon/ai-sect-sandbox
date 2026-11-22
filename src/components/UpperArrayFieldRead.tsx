import type {ReactNode} from 'react';
import type {UpperArrayFieldLocalView} from '../engine/upperArrayFieldLocalTerms';
import {UPPER_ARRAY_TRADE_ROOTS as tradeRoots} from '../engine/upperArrayFieldTradeTerms';
import type {UpperArrayFieldTradeView} from '../engine/upperArrayFieldTradeEngine';
import {arrayFieldFold,arrayFieldSummary} from './UpperArrayFieldOrders';

export function UpperArrayFieldLocalRead({local,children}:{local:UpperArrayFieldLocalView;children?:ReactNode}){
  if(local.siteId!=='array-field-source'&&local.siteId!=='array-field-practice')return null;
  return <details className={arrayFieldFold}>
    <summary className={arrayFieldSummary}>{local.siteId==='array-field-source'?'凝纹墩的活计':'晨修阵的一课'}</summary>
    {local.resident?<p>本人此处可用阵片：{local.stock} 枚。</p>:<p>尚未结庐，此处不领活计，也不查阵片存量。</p>}
    {children}
  </details>;
}
const stages:Record<UpperArrayFieldTradeView['status'],string>={
  offered:'已提约，尚未同签。',accepted:'已经同签，尚未装片。',carrying:'阵片已封，尚未交手。',
  settled:'原签两人在北井完成交割。',restocked:'原封阵片已经返还。',expired:'货约已过期。'
};
function Receipt({record}:{record:UpperArrayFieldTradeView}){
  const cargo=record.cargo;
  return <li className="space-y-1 rounded border border-slate-800 p-2">
    <p>本人为{record.yourRole==='seller'?'阵片交付人':'玄土根交付人'}。{stages[record.status]}</p>
    {cargo?.phase==='field'&&<p>实封 {cargo.quantity} 枚，仍在阵原，未到井。</p>}
    {cargo?.phase==='in_transit'&&<p>{record.yourRole==='seller'?'原封随本人行，尚未兑根。':'阵片已封，尚未在井边交手。'}{record.yourRole==='seller'&&cargo.atClosedThroat&&'这一步阶口未开，货留本人手上。'}</p>}
    {cargo?.phase==='at_well'&&<p>原签人与封片已到北井，还没交手。</p>}
    {cargo?.phase==='delivered'&&<p>实兑 {cargo.quantity} 枚阵片与 {tradeRoots} 株玄土根。</p>}
    {cargo?.phase==='restocked'&&<p>阵片已实际返还原处，不是北井成交。</p>}
    <p className="text-xs text-slate-300">第 {record.offeredTick} 轮落提约{record.acceptedTick!==undefined&&<> · 第 {record.acceptedTick} 轮同签</>}{record.closedTick!==undefined&&<> · 第 {record.closedTick} 轮闭约</>}</p>
  </li>;
}
export function UpperArrayFieldTradeRead({trades,children}:{trades:readonly UpperArrayFieldTradeView[];children?:ReactNode}){
  const ranked=[...trades].sort((a,b)=>b.offeredTick-a.offeredTick||a.id.localeCompare(b.id));
  const active=ranked.filter(row=>row.status==='offered'||row.status==='accepted'||row.status==='carrying');
  const closed=ranked.filter(row=>!active.includes(row));
  return <details className={arrayFieldFold}>
    <summary className={arrayFieldSummary}>看北井互印货约</summary>
    {active.length>0&&<ul className="space-y-1" aria-label="本人未闭货约">{active.map(r=><Receipt key={r.id} record={r}/>)}</ul>}
    {children}
    {closed.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className={arrayFieldSummary}>本人已闭货约</summary>
      <ul className="space-y-1 pb-2">{closed.map(r=><Receipt key={r.id} record={r}/>)}</ul>
    </details>}
  </details>;
}

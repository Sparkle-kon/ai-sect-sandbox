import type {ReactNode} from 'react';
import type {FrontierPortTradeView} from '../engine/frontierPortTradeEngine';
import {PORT_TRADE_ROOTS,PORT_TRADE_SALT} from '../engine/frontierPortTradeTerms';

type Cargo=NonNullable<FrontierPortTradeView['cargo']>;
type Custody=NonNullable<FrontierPortTradeView['roots']>;
const status:Record<FrontierPortTradeView['status'],string>={
  offered:'已当面提约，尚未应约',signed:'当事人已应约，货尚未启航',shipping:'原货已封存，按实到点记录',
  fulfilled:'本约已实结',unfulfilled:'本约未能交割，照实际返存账核对',expired:'此约已过期',
};
const places:Record<Cargo['position'],string>={
  dock:'外港登验泊位',sea:'外海水路',east_anchor:'旧松灯坊市交接点',land:'旧图陆路',inland:'旧中坊验货点',
};
const direction:Record<Cargo['direction'],string>={
  outbound:'潮晶去程',return_roots:'地根返港',return_salt:'原潮晶退返',
};
const hulls:Record<Cargo['hullLocation'],string>={
  berthed:'实际靠港',reserved:'占定泊位，尚未离泊',sea:'在外海',east_anchor:'泊在旧东口等陆上接力',
};
const roots:Record<Custody,string>={
  inland_escrow:'地根已经实交中坊托管，尚未到港',
  returning_to_port:'原地根仍在返港托管，不在港仓',
  landed_at_port:'原地根已实际到港，尚待港方本人验领',
  collected_at_port:'港方已按原约实收返港地根',
  refundable_inland:'原地根可在中坊按约领回，尚未实退',
  refunded_inland:'原地根已经实退中坊买方',
};

function CargoTrace({cargo}:{cargo:Cargo}){
  const waiting=cargo.waiting==='wind_closed'?'本段因风季关闭停候，货没有越过关口。':
    cargo.waiting==='tide_closed'?'本段在等开潮窗，货没有越过关口。':undefined;
  return <div className="space-y-1 text-sm" aria-label="本单实际航陆进度">
    <p>{direction[cargo.direction]} · 原货当前位置：{places[cargo.position]}（第 {cargo.stepsCompleted} / {cargo.pathLength} 步）。</p>
    <p>船的实际位置：{hulls[cargo.hullLocation]}。这是货运，不是此人的位置。</p>
    {waiting&&<p className="text-amber-200">{waiting}</p>}
    {cargo.delayed&&<p className="text-amber-200">这单已经超过原定到期，仍以实际落点为准。</p>}
    {cargo.departedTick===undefined&&cargo.returnedTick===undefined&&<p>已装实货仍在港，不能算已航行。</p>}
    {cargo.inlandArrivedTick!==undefined&&cargo.receivedTick===undefined&&cargo.direction==='outbound'&&
      <p>货实际到中坊，尚待本人验收；还未交给买方。</p>}
    {cargo.receivedTick!==undefined&&<p>买方已实际验收潮晶；返港地根另核。</p>}
    {cargo.returnedTick!==undefined&&<p>第 {cargo.returnedTick} 轮已有实际返港记录；是否入库看本约实账。</p>}
  </div>;
}
function Receipt({trade}:{trade:FrontierPortTradeView}){
  return <section className="space-y-1.5 rounded border border-slate-800 p-2 text-sm text-slate-100" aria-label="本人的海陆货约">
    <p className="font-medium text-cyan-100">{status[trade.status]}。</p>
    <p>本方为{trade.yourRole==='seller'?'港方':'中坊买方'}；约换潮晶 {PORT_TRADE_SALT} 份与玄土根 {PORT_TRADE_ROOTS} 株。</p>
    {trade.signedTick!==undefined&&<p>第 {trade.signedTick} 轮双方实签。{trade.closedTick!==undefined&&`第 ${trade.closedTick} 轮结卷。`}</p>}
    {trade.roots&&<p>{roots[trade.roots]}。</p>}
    {trade.cargo&&<CargoTrace cargo={trade.cargo}/>}
  </section>;
}
export function FrontierPortTradeRead({trades,children}:{trades:readonly FrontierPortTradeView[];children?:ReactNode}){
  const current=trades[0],past=trades.slice(1);
  return <details className="min-w-0 rounded border border-cyan-900/80 bg-slate-900/65 px-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-amber-300">海陆货约</summary>
    <div className="space-y-2 pb-2 text-sm">
      {current&&<Receipt trade={current}/>}
      {past.length>0&&<details className="min-w-0 rounded border border-slate-800 px-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-slate-200">本人的旧货约</summary>
        <div className="space-y-2 pb-2">{past.map(trade=><Receipt key={trade.id} trade={trade}/>)}</div>
      </details>}
      {children}
    </div>
  </details>;
}

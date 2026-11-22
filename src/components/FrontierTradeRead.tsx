import type {ReactNode} from 'react';
import type {FrontierTradeView} from '../engine/frontierTradeEngine';
import {FRONTIER_TRADE_AMOUNT} from '../engine/frontierTradeTerms';

type Cargo=NonNullable<FrontierTradeView['north']>;
const state:Record<FrontierTradeView['status'],string>={
  offered:'已当面提约，尚未签成',accepted:'两方实签，交割尚未完成',returning:'已转入原路退回',
  exchanged:'已抵齐并交割',expired:'提约到期，未签未扣货',returned:'实物已经退还原地',
};
const cargoState:Record<Cargo['status'],string>={
  in_transit:'实货在途',arrived:'已到对方关区，尚在托管',returning:'原路退回中',
  home_wait:'已回原地，正待入原仓',returned:'实物已退还',delivered:'已结算入对方仓',
};

function CargoRead({cargo,label}:{cargo?:Cargo;label:string}){
  return <li className="min-w-0">
    <span className="font-medium text-emerald-100">{label}：</span>
    {cargo?<>
      {cargo.quantity} 份，{cargoState[cargo.status]}。
      {cargo.status!=='returned'&&cargo.status!=='delivered'&&` 所在路径步 ${cargo.stepsCompleted} / ${cargo.pathLength}。`}
      {cargo.winterDetour&&' 这批实装走背风旁路。'}
      {cargo.waitedWinter>0&&` 累计受冬封候路 ${cargo.waitedWinter} 月。`}
    </>:'尚未装入托管。'}
  </li>;
}

function Receipt({receipt}:{receipt:FrontierTradeView}){
  const ownNorth=receipt.yourSide==='north-snow';
  return <div className="space-y-1 rounded border border-slate-800 p-2">
    <p className="font-medium text-emerald-100">{state[receipt.status]}。</p>
    <p>本方约出{ownNorth?'霜药':'御寒芦'} {FRONTIER_TRADE_AMOUNT} 份。{receipt.acceptedTick!==undefined&&`第 ${receipt.acceptedTick} 轮实签。`}{receipt.closesTick!==undefined&&`第 ${receipt.closesTick} 轮结案。`}</p>
    {(receipt.north||receipt.south)&&<ul className="space-y-1 text-xs text-slate-300" aria-label="本约实货进度">
      <CargoRead cargo={receipt.north} label={ownNorth?'本方霜药':'对方霜药'}/>
      <CargoRead cargo={receipt.south} label={ownNorth?'对方御寒芦':'本方御寒芦'}/>
    </ul>}
  </div>;
}

export function FrontierTradeRead({receipts,children}:{receipts:readonly FrontierTradeView[];children?:ReactNode}){
  const latest=receipts[0],history=receipts.slice(1);
  return <details className="min-w-0 rounded border border-emerald-900/80 bg-slate-900/65 px-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-emerald-100 focus-visible:outline focus-visible:outline-amber-300">两地货约</summary>
    <div className="space-y-2 pb-2 text-sm">
      {latest&&<Receipt receipt={latest}/>}
      {history.length>0&&<details className="min-w-0 rounded border border-slate-800 px-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-slate-300">本人的旧约</summary>
        <div className="space-y-2 pb-2">{history.map(receipt=><Receipt key={receipt.id} receipt={receipt}/>)}</div>
      </details>}
      {children}
    </div>
  </details>;
}

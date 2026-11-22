import type {ReactNode} from 'react';
import type {FrontierDrylandTradeView} from '../engine/frontierDrylandTradeEngine';

type Cargo=NonNullable<FrontierDrylandTradeView['west']>;
const agreement:Record<FrontierDrylandTradeView['status'],string>={
  offered:'已当面提约，尚未应约',accepted:'两人已实签，尚未交割',returning:'本约未能交割，原货正退回',
  exchanged:'双方实货到齐，已交割入仓',expired:'提约已过期，没有扣货',returned:'已装的原货已逐格实退',
};
const stages:Record<Cargo['status'],string>={
  in_transit:'实货在路上',arrived:'实到对方交接点，仍待交割',returning:'循实际走过的原路退回',
  home_wait:'已到原仓，尚待腾位入账',returned:'原批已实退入本方仓',delivered:'已真正交割入对方仓',
};
const label:Record<Cargo['good'],string>={rift_salt:'井盐',stormstone:'雷石'};

function CargoRead({cargo,own,good}:{cargo?:Cargo;own:boolean;good:Cargo['good']}){
  return <li className="min-w-0 space-y-1">
    <p><span className="font-medium text-amber-100">{own?'本方':'对方'}{label[good]}：</span>
      {cargo?`${cargo.quantity} 份，${stages[cargo.status]}。`:'尚未实装托管。'}
    </p>
    {cargo&&(cargo.status==='in_transit'||cargo.status==='returning')&&<p>货的实到路位：第 {cargo.stepsCompleted} / {cargo.pathLength} 步。{cargo.status==='returning'?'此数是当前原路位置，不是去程完成率。':''}</p>}
    {cargo?.waiting==='thunder_closed'&&<p className="text-amber-200">该段因实雷窗停等，原货没有越过这一格。</p>}
    {!!cargo&&cargo.waitedThunder>0&&<p>本单累计受雷阻 {cargo.waitedThunder} 月。</p>}
  </li>;
}

function RecordRead({row}:{row:FrontierDrylandTradeView}){
  const west=row.yourSide==='western-saltwell';
  return <section aria-label="本人的盐雷货约" className="space-y-1.5 rounded border border-slate-800 p-2">
    <p className="font-medium text-amber-100">{agreement[row.status]}。</p>
    {row.acceptedTick!==undefined&&<p>第 {row.acceptedTick} 轮实签。{row.closedTick!==undefined&&`第 ${row.closedTick} 轮结卷。`}</p>}
    {(row.west||row.ridge)&&<ul aria-label="实际货物去向" className="space-y-2 text-xs text-slate-200">
      <CargoRead cargo={row.west} own={west} good="rift_salt"/>
      <CargoRead cargo={row.ridge} own={!west} good="stormstone"/>
    </ul>}
    {(row.west||row.ridge)&&<p className="text-xs text-slate-300">这是原货的实到处，不是此人的位置。</p>}
  </section>;
}

export function FrontierDrylandTradeRead({trades,children}:{trades:readonly FrontierDrylandTradeView[];children?:ReactNode}){
  const newest=trades[0],older=trades.slice(1);
  return <details className="min-w-0 rounded border border-amber-900/75 bg-slate-900/65 px-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300">盐雷货约</summary>
    <div className="space-y-2 pb-2 text-sm text-slate-100">
      {newest&&<RecordRead row={newest}/>}
      {older.length>0&&<details className="min-w-0 rounded border border-slate-800 px-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-slate-200">本人的旧约</summary>
        <div className="space-y-2 pb-2">{older.map(row=><RecordRead key={row.id} row={row}/>)}</div>
      </details>}
      {children}
    </div>
  </details>;
}

import type {ReactNode} from 'react';
import {FRONTIER_PORT_HULL_MAX,type FrontierPortView} from '../engine/frontierPortTerms';

const tides:Record<FrontierPortView['tide'],string>={
  open:'眼下潮窗已开。',low:'当前是低潮，作业仍凭所在处和实际潮窗。',
  wind_closed:'眼下风季关停；不得把等候写成已经离岸或到港。',
};

export function FrontierPortLocalRead({view,children}:{view:FrontierPortView;children?:ReactNode}){
  const canSeeHull=view.siteId==='frontier-east-dock'||view.siteId==='frontier-east-boatyard';
  const canSeeStock=view.siteId==='frontier-east-warehouse';
  const hull=canSeeHull&&view.resident?view.hull:undefined,stock=canSeeStock&&view.resident?view.stock:undefined;
  return <details className="min-w-0 rounded border border-cyan-900/80 bg-slate-900/65 px-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-amber-300">眼下港务</summary>
    <div className="space-y-1.5 pb-2 text-sm text-slate-100">
      <p>{tides[view.tide]}</p>
      {canSeeHull&&view.resident&&<p>{hull?.status==='away'?'本港的船不在泊位，不能在这里修船或借船练式。你仍在岸边。':
        hull?.status==='reserved'?'实船仍在泊位，已经给本次货运占用；不是已经出海，也不能腾去修船练式。':
        hull?.status==='berthed'?`实船在泊，耐久 ${hull.condition} / ${FRONTIER_PORT_HULL_MAX}。`:'眼下没有实船可用。'}</p>}
      {stock&&<p>验货仓当前可见：潮晶 {stock.reef_salt} 份，船具 {stock.port_rigging} 份。不含尚在航路的货。</p>}
      {!view.resident&&<p>还未在本港登记驻住，不能排居民作业。</p>}
      {children}
    </div>
  </details>;
}

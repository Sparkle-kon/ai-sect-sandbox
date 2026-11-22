import type {ReactNode} from 'react';
import type {FrontierProductionView} from '../engine/frontierProductionTerms';

export function FrontierProductionRead({view,children}:{view:FrontierProductionView;children?:ReactNode}){
  const north=view.regionId==='north-snow';
  const plot=view.localPlot;
  return <details className="min-w-0 rounded border border-emerald-900/80 bg-slate-900/65 px-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-emerald-100 focus-visible:outline focus-visible:outline-amber-300">本地生计</summary>
    <div className="space-y-1.5 pb-2 text-sm text-slate-100">
      <p>此处{north?'泉槽':'潮池'}：{view.water} / {view.waterCapacity} 份水。{north&&view.isWinter?'正值寒月。':!north&&!view.canDrawTide?'眼下不在引潮窗。':''}</p>
      {plot&&<div className="space-y-1">
        {plot.soil!==undefined&&<p>此田地力：{plot.soil}。</p>}
        {plot.plantedTick!==undefined&&<p>在田中有一批实种，{plot.readyTick!==undefined?`最早第 ${plot.readyTick} 轮可复查`:'还不能定收'}。这不是已收成品。</p>}
        {plot.needIrrigation&&<p>这批作物尚待补水。</p>}
        {plot.protected&&<p>这批作物已有实用药护。</p>}
      </div>}
      {view.stock&&<p>此处库中可见：霜药 {view.stock.frost_dose} 份，御寒芦 {view.stock.ward_reed} 份。不是另一地或在途的存货。</p>}
      {children}
    </div>
  </details>;
}

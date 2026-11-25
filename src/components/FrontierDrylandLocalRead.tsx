import type {ReactNode} from 'react';
import {FRONTIER_DRYLAND_LOCATIONS as places,type FrontierDrylandLocalView} from '../engine/frontierDrylandTerms';

const western='western-saltwell';
const waterPlaces=new Set<string>([places.well,places.saltbed,places.trial,places.westStore]);
const herdPlaces=new Set<string>([places.pasture,places.quarry,places.ridgeStore]);
const wardPlaces=new Set<string>([places.ward,places.quarry,places.ridgeStore]);

export function FrontierDrylandLocalRead({view,nowTick,children}:{
  view:FrontierDrylandLocalView;nowTick:number;children?:ReactNode;
}){
  const west=view.regionId===western;
  const well=west&&waterPlaces.has(view.siteId)?view.well:undefined;
  const herd=!west&&herdPlaces.has(view.siteId)?view.herd:undefined;
  const ward=!west&&wardPlaces.has(view.siteId)?view.ward:undefined;
  const stock=view.resident&&(west?view.siteId===places.westStore:view.siteId===places.ridgeStore)?view.stock:undefined;
  const last=west?view.lastLayer:undefined;
  return <details className="min-w-0 rounded border border-amber-900/75 bg-slate-900/65 px-2 [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300">
      {west?'井水与盐事':'牧地与雷窗'}
    </summary>
    <div className="space-y-1.5 pb-2 text-sm text-slate-100">
      {view.window==='dry'&&west&&<p className="text-amber-200">旱月井绳放得再长，每次也只能少汲；没有在替人加水。</p>}
      {view.window==='thunder'&&!west&&<p className="text-amber-200">当月有雷窗。遇雷时消耗阵储挡险。</p>}
      {well?(well.readyTick>nowTick?<p>井工已经开，槽未成。第 {well.readyTick} 轮才可按实况汲水。</p>:
        <p>此处共用井槽：{well.water} / {well.capacity} 份水。采盐、冲层和西端运货都取同一井槽。</p>):
        view.resident&&view.siteId===places.well&&<p>井还没有开成，尚无水可汲。</p>}
      {herd&&<p>本地实有小牧群 {herd.count} 头，现可用牧工 {herd.work} 份。{herd.work>0&&`牧工第 ${herd.expiresTick} 轮失效。`}</p>}
      {ward&&<p>此处可核阵储 {ward.charges} 份。{ward.charges>0&&`阵储第 ${ward.expiresTick} 轮失效；未遇险不写作已抵。`}</p>}
      {stock&&<p>本地仓实存：井盐 {stock.rift_salt} 份，雷石 {stock.stormstone} 份。在途和待交的货另列。</p>}
      {last&&<p>{last.result==='advanced'?`本人第 ${last.tick} 轮实冲同境一层：${last.fromStage} 层至 ${last.toStage} 层。`:
        `本人第 ${last.tick} 轮实冲遇反噬，层数仍是 ${last.toStage}。`}这次不是渡天劫。</p>}
      {!view.resident&&<p>还未在此地实缴驻住，不能排当地住民作业。</p>}
      {children}
    </div>
  </details>;
}

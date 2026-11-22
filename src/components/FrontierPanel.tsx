import {useId,useState,type ReactNode} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {FrontierMovementOption,FrontierMovementView} from '../engine/frontierMovementEngine';
import {FRONTIER_SOUTH_PRACTICE_WATER,type FrontierProductionOption,type FrontierProductionView} from '../engine/frontierProductionTerms';
import type {FrontierTradeOption,FrontierTradeView} from '../engine/frontierTradeEngine';
import {FRONTIER_CHARTS,FRONTIER_ENTER_ROOTS,FRONTIER_ENTER_STONES,FRONTIER_SETTLE_ROOTS,FRONTIER_SETTLE_STONES,
  frontierSite} from '../engine/frontierTerms';
import {FRONTIER_TRADE_AMOUNT,FRONTIER_TRADE_WINTER_REEDS} from '../engine/frontierTradeTerms';
import {FrontierChart,type FrontierChartTrail} from './FrontierChart';
import {FrontierProductionRead} from './FrontierProductionRead';
import {FrontierTradeRead} from './FrontierTradeRead';

export type FrontierOrder=FrontierMovementOption|FrontierProductionOption|FrontierTradeOption;
export interface FrontierControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly FrontierOrder[];
  pending?:FrontierOrder;
  disabled?:boolean;
  onQueue:(option:FrontierOrder,revision:object)=>boolean;
}
export interface FrontierHostControls {
  scopeKey:string;
  revisionKey:object;
  actorName:string;
  essenceCost:number;
  disabled?:boolean;
  onConfirm:(revision:object)=>boolean;
}
interface Props {
  nightTrail?:FrontierChartTrail;
  view?:FrontierMovementView;
  production?:FrontierProductionView;
  trade?:readonly FrontierTradeView[];
  tradeCandidates?:Readonly<Record<string,string>>;
  controls?:FrontierControls;
  host?:FrontierHostControls;
  portPanel?:ReactNode;
  drylandPanel?:ReactNode;
}
type Review={choice:FrontierOrder;revision:object};
type OrderGroup='FRONTIER'|'FRONTIER_PRODUCTION'|'FRONTIER_TRADE';

const button='min-h-11 min-w-0 rounded border border-emerald-800/80 bg-slate-950 px-2.5 py-1 text-sm text-slate-100 focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50 [overflow-wrap:anywhere]';
const orderLabels:Record<FrontierProductionOption['frontierProductionMove'],string>={
  tend_spring:'实加固泉眼',draw_tide:'开闸引潮',sow:'下母根播种',irrigate:'补灌本田',harvest:'收本格成品',
  rest_field:'休养这块田',cultivate:'按本地法修炼',protect_crop:'用霜药护苗',
};
const tradeNames:Record<FrontierTradeOption['frontierTradeMove'],string>={
  propose:'当面提约',accept:'当面应约',load:'实装托运',load_winter:'加芦走背风路'
};

function orderKey(order:FrontierOrder):string{
  if(order.action==='FRONTIER')return JSON.stringify([order.action,order.frontierMove,order.targetFrontierSiteId]);
  if(order.action==='FRONTIER_PRODUCTION')return JSON.stringify([order.action,order.frontierProductionMove,order.targetFrontierSiteId]);
  return JSON.stringify([order.action,order.frontierTradeMove,order.targetFrontierTradeId??null,order.targetCultivatorId??null]);
}
export function reviewedFrontierOrder(review:Review|undefined,revision:object,menu:readonly FrontierOrder[]){
  if(!review||review.revision!==revision)return undefined;
  const key=orderKey(review.choice),rows=menu.filter(row=>orderKey(row)===key);
  return rows.length===1?rows[0]:undefined;
}

const knownCandidate=(options:Props,actorId:string|undefined)=>
  actorId&&options.tradeCandidates&&Object.hasOwn(options.tradeCandidates,actorId)?options.tradeCandidates[actorId]:undefined;

/** Only exact native menus and the current local projector can put a control on the screen. */
export function frontierScopedOrders(props:Props):FrontierOrder[]{
  const {controls,view,production,trade=[]}=props;
  if(!controls)return [];
  const exact=(option:FrontierOrder)=>{
    if(option.action==='FRONTIER'){
      if(!view||!view.options.some(row=>orderKey(row)===orderKey(option)))return false;
      if(view.scope==='anchor')return option.frontierMove==='enter'&&option.targetFrontierSiteId===view.gateId;
      if(!view.site)return false;
      if(option.frontierMove==='travel')return view.visibleSites.some(site=>site.id===option.targetFrontierSiteId&&site.chartId===view.chartId&&site.role!=='sea');
      if(option.frontierMove==='exit')return view.site.id===view.gateId&&option.targetFrontierSiteId===view.anchorId;
      return option.frontierMove==='settle'&&option.targetFrontierSiteId===view.site.id;
    }
    if(option.action==='FRONTIER_PRODUCTION')return view?.scope==='frontier'&&!!view.site&&production?.regionId===view.regionId&&
      production.siteId===view.site.id&&option.targetFrontierSiteId===view.site.id&&
      production.options.some(row=>orderKey(row)===orderKey(option));
    if(option.frontierTradeMove==='propose'){
      return view?.scope==='anchor'&&view.anchorId==='loc-market'&&!!knownCandidate(props,option.targetCultivatorId);
    }
    const receipt=trade.find(row=>row.id===option.targetFrontierTradeId);
    return option.frontierTradeMove==='accept'?view?.scope==='anchor'&&view.anchorId==='loc-market'&&receipt?.status==='offered':
      view?.scope==='frontier'&&receipt?.status==='accepted'&&receipt.yourSide===view.regionId;
  };
  const counts=new Map<string,number>();
  for(const option of controls.choices){const key=orderKey(option);counts.set(key,(counts.get(key)??0)+1);}
  return controls.choices.filter(option=>counts.get(orderKey(option))===1&&exact(option));
}

function scopedPending(props:Props):FrontierOrder|undefined {
  const pending=props.controls?.pending,view=props.view;
  if(!pending||!view)return undefined;
  if(pending.action==='FRONTIER'){
    if(view.scope==='anchor')return pending.frontierMove==='enter'&&pending.targetFrontierSiteId===view.gateId?pending:undefined;
    if(pending.frontierMove==='travel')return view.visibleSites.some(site=>site.chartId===view.chartId&&site.id===pending.targetFrontierSiteId&&site.role!=='sea')?pending:undefined;
    if(pending.frontierMove==='exit')return view.site?.id===view.gateId&&pending.targetFrontierSiteId===view.anchorId?pending:undefined;
    return pending.frontierMove==='settle'&&pending.targetFrontierSiteId===view.site?.id?pending:undefined;
  }
  if(pending.action==='FRONTIER_PRODUCTION')return view.scope==='frontier'&&pending.targetFrontierSiteId===view.site?.id?pending:undefined;
  if(pending.frontierTradeMove==='propose')return view.scope==='anchor'&&view.anchorId==='loc-market'?pending:undefined;
  return props.trade?.some(row=>row.id===pending.targetFrontierTradeId)?pending:undefined;
}

function nameOf(option:FrontierOrder,props:Props){
  const view=props.view;
  if(option.action==='FRONTIER_PRODUCTION')return orderLabels[option.frontierProductionMove];
  if(option.action==='FRONTIER_TRADE')return option.frontierTradeMove==='propose'?
    `与${knownCandidate(props,option.targetCultivatorId)??'当面之人'}提约`:tradeNames[option.frontierTradeMove];
  if(option.frontierMove==='enter')return `入${view?FRONTIER_CHARTS[view.regionId].name:'此地'}`;
  if(option.frontierMove==='exit')return '由原关返回';
  if(option.frontierMove==='settle')return '在这处登记驻住';
  const site=view?.visibleSites.find(row=>row.id===option.targetFrontierSiteId&&row.chartId===view.chartId);
  return site?`走到${site.name}`:'走向所选相邻处';
}

function terms(option:FrontierOrder,north:boolean):string{
  if(option.action==='FRONTIER'){
    if(option.frontierMove==='enter')return `真正过关才由本人实付 ${FRONTIER_ENTER_STONES} 灵石和 ${FRONTIER_ENTER_ROOTS} 份地根；这时人还在旧图锚点。`;
    if(option.frontierMove==='settle')return `实际登记才付 ${FRONTIER_SETTLE_STONES} 灵石和 ${FRONTIER_SETTLE_ROOTS} 份地根；仍是同一个人，不自动耕作。`;
    if(option.frontierMove==='exit')return '实际由此关返回才落脚原锚，不因打开地图换域。';
    return '只能一步走到相邻实格；下月的时令、路况和所在处都要复核。';
  }
  if(option.action==='FRONTIER_TRADE'){
    if(option.frontierTradeMove==='propose'||option.frontierTradeMove==='accept')
      return `货约拟各换 ${FRONTIER_TRADE_AMOUNT} 份；当面落笔不扣实货，不算装运。`;
    if(option.frontierTradeMove==='load_winter')return `实装扣本方 ${FRONTIER_TRADE_AMOUNT} 份货与 ${FRONTIER_TRADE_WINTER_REEDS} 份随行御寒芦；旁路确有格程，不立刻到货。`;
    return `实装托管本方 ${FRONTIER_TRADE_AMOUNT} 份成品；遇封闭仍可能等待或退回，装货不等于交割。`;
  }
  switch(option.frontierProductionMove){
    case 'tend_spring':return '实际加固才耗本人 1 份地根。此刻不添水；下月按本地泉路复核。';
    case 'draw_tide':return '实际到闸才能引水；只引本月潮窗许可的水，潮池满则不再收。';
    case 'sow':return '实际下种才用本人 1 份地根及本地水；未到熟期不算收成。';
    case 'irrigate':return '实际补灌才耗本地有限的水，与当月其他用水同算。';
    case 'harvest':return '实际成熟且有库位才收；同一批不能再收一次。';
    case 'rest_field':return '实际休养的是眼下这块田，不会凭空生出芦草。';
    case 'cultivate':return north?'实修才耗 1 份实际入库的御寒芦，不凭在途货物增长修为。':
      `实修占当月一次劳动，并实耗 ${FRONTIER_SOUTH_PRACTICE_WATER} 份潮池水；同月不能又用这份水灌田。`;
    case 'protect_crop':return '实际动用 1 份已入本地库的霜药才护苗；未到货不算。';
  }
}

function Orders({props,choices,group}:{props:Props;choices:readonly FrontierOrder[];group:OrderGroup}){
  const controls=props.controls;
  const [review,setReview]=useState<Review>();
  const [notice,setNotice]=useState('');
  const label=useId();
  if(!controls)return null;
  const menu=choices.filter(row=>row.action===group);
  const option=reviewedFrontierOrder(review,controls.revisionKey,menu);
  // A pending intent can legitimately disappear from the next menu after time/qualification changes.
  // The App supplies that intent only for this currently authorized body and scope.
  const intent=scopedPending(props);
  const pending=intent?.action===group?intent:undefined;
  if(!menu.length&&!pending&&!notice)return null;
  return <div className="space-y-1.5">
    {pending&&<p role="status">已候下月：{nameOf(pending,props)}。还没有走动、落笔或支取实物。</p>}
    {!controls.pending&&menu.length>0&&<div className="flex flex-wrap gap-1.5">
      {menu.map(choice=><button key={orderKey(choice)} type="button" className={button} disabled={controls.disabled}
        aria-pressed={option===choice} onClick={()=>{setNotice('');setReview({choice,revision:controls.revisionKey});}}>{nameOf(choice,props)}</button>)}
    </div>}
    {option&&!controls.pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-2 rounded border border-slate-700 p-2">
      <p id={label}>{terms(option,props.view?.regionId==='north-snow')}排入只耗 {AVATAR_ORDER_COST} 神识，下月才复核并实际办。</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} onClick={()=>{setNotice(controls.onQueue(option,controls.revisionKey)?
          '已记下打算，实物还未动。':'所在处、时令或人身已变，未记下。');setReview(undefined);}}>记作下月打算</button>
        <button type="button" className={button} onClick={()=>setReview(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

function Host({host}: {host:FrontierHostControls}){
  const [revision,setRevision]=useState<object>();
  const [notice,setNotice]=useState('');
  const label=useId();
  const staged=revision===host.revisionKey;
  return <div className="space-y-2 border-t border-emerald-900/60 pt-2">
    {!staged&&<button type="button" disabled={host.disabled} className={button}
      onClick={()=>{setNotice('');setRevision(host.revisionKey);}}>核对重新入身</button>}
    {staged&&!host.disabled&&<div role="group" aria-labelledby={label} className="space-y-2">
      <p id={label}>重新入在此地的{host.actorName}本人。成功才耗 {host.essenceCost} 神识；不挪此人的位置，也不再收过关费。</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} onClick={()=>{setNotice(host.onConfirm(host.revisionKey)?
          '已入同一人身。':'人身或时机已变，不能入身。');setRevision(undefined);}}>确认入此身</button>
        <button type="button" className={button} onClick={()=>setRevision(undefined)}>先只看</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

const shell='min-w-0 space-y-2 rounded border border-emerald-800/70 bg-slate-950 px-2 pb-2 text-sm text-slate-100 [overflow-wrap:anywhere]';
export function FrontierPanel(props:Props){
  const {view,host,controls,production,trade=[],portPanel,drylandPanel}=props;
  const choices=frontierScopedOrders(props);
  const movement=<Orders key={`walk:${controls?.scopeKey}`} props={props} choices={choices} group="FRONTIER"/>;
  const workshop=<Orders key={`work:${controls?.scopeKey}`} props={props} choices={choices} group="FRONTIER_PRODUCTION"/>;
  const exchange=<Orders key={`trade:${controls?.scopeKey}`} props={props} choices={choices} group="FRONTIER_TRADE"/>;
  const signed=trade.length>0||choices.some(choice=>choice.action==='FRONTIER_TRADE')||scopedPending(props)?.action==='FRONTIER_TRADE';
  if(!view)return null;
  const tradePanel=signed?<FrontierTradeRead receipts={trade}>{exchange}</FrontierTradeRead>:null;
  if(view.scope==='anchor'){
    const chart=FRONTIER_CHARTS[view.regionId],gate=frontierSite(view.gateId);
    const blocked=view.blocked==='fee'?`眼下不能实付 ${FRONTIER_ENTER_STONES} 灵石和 ${FRONTIER_ENTER_ROOTS} 份地根，尚未过关。`:
      view.blocked==='title'?'现时锚点归属不允此人过关，人仍在原处。':view.blocked==='duty'?
      '眼下尚未有此人可执行的下月过关文书，人仍在原处。':undefined;
    return <details className={shell}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-emerald-100 focus-visible:outline focus-visible:outline-amber-300">看此地的关口</summary>
      {gate&&<p>{gate.name}在这处旧图锚点之外。人仍在旧图，只能核关口，不能看未到的{chart.name}地图或库存。</p>}
      {blocked&&<p role="status" className="text-amber-200">{blocked}</p>}
      {movement}
      {tradePanel}
      {portPanel}
      {drylandPanel}
    </details>;
  }
  const chart=FRONTIER_CHARTS[view.regionId],place=view.site;
  if(!place||place.chartId!==view.chartId||chart.id!==view.chartId)return null;
  const chartData={chartId:view.chartId,name:chart.name,rows:chart.rows,cols:chart.columns,currentTileId:place.id,
    tiles:view.visibleSites.map(site=>({chartId:site.chartId,tileId:site.id,col:site.col,row:site.row,name:site.name,
      ...(site.role==='sea'?{surface:'sea' as const,heading:'水格不可步行'}:{})}))};
  const localProduction=production?.regionId===view.regionId&&production.siteId===place.id?production:undefined;
  return <section className={`${shell} p-3`} aria-label={chart.name}>
    <h2 className="text-base font-semibold text-emerald-100">{chart.name}</h2>
    <FrontierChart chart={chartData} trail={props.nightTrail}/>
    <p className="text-xs text-slate-300">格子靠近不等于眼下路通；按此人此月能走的路复核。</p>
    <p>{view.residence?'已在本地实缴并登记驻住。':'此人是访客，尚未驻住。'}</p>
    {view.visit&&<p className="text-xs text-slate-300">入关实账：第 {view.visit.enteredTick} 轮实付 {view.visit.paidStones} 灵石、{view.visit.paidRoots} 份地根。</p>}
    {movement}
    {host&&<Host key={host.scopeKey} host={host}/>}
    {localProduction&&<FrontierProductionRead view={localProduction}>{workshop}</FrontierProductionRead>}
    {tradePanel}
    {portPanel}
    {drylandPanel}
  </section>;
}

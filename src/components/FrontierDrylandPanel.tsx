import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {FrontierMovementView} from '../engine/frontierMovementEngine';
import {FRONTIER_DRYLAND_COSTS as cost,FRONTIER_DRYLAND_LOCATIONS as places,
  type FrontierDrylandLocalOption,type FrontierDrylandLocalView} from '../engine/frontierDrylandTerms';
import {DRYLAND_TRADE_AMOUNT,DRYLAND_TRADE_MARKET} from '../engine/frontierDrylandTradeTerms';
import type {FrontierDrylandTradeOption,FrontierDrylandTradeView} from '../engine/frontierDrylandTradeEngine';
import {FrontierDrylandLocalRead} from './FrontierDrylandLocalRead';
import {FrontierDrylandTradeRead} from './FrontierDrylandTradeRead';

export type FrontierDrylandOrder=FrontierDrylandLocalOption|FrontierDrylandTradeOption;
export interface FrontierDrylandControls {
  scopeKey:string;revisionKey:object;choices:readonly FrontierDrylandOrder[];
  pending?:FrontierDrylandOrder;disabled?:boolean;
  onQueue:(order:FrontierDrylandOrder,revision:object)=>boolean;
}
export interface FrontierDrylandPanelProps {
  movement?:FrontierMovementView;
  local?:FrontierDrylandLocalView;
  trades?:readonly FrontierDrylandTradeView[];
  controls?:FrontierDrylandControls;
  tradeCandidates?:Readonly<Record<string,string>>;
  nowTick:number;
}
type Stage={order:FrontierDrylandOrder;revision:object};
type OrderFamily=FrontierDrylandOrder['action'];

const west='western-saltwell',ridge='plateau-thunderridge';
const button='min-h-11 min-w-0 rounded border border-amber-800 bg-slate-950 px-2.5 py-1 text-sm text-slate-100 focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50 [overflow-wrap:anywhere]';
const localNames:Record<FrontierDrylandLocalOption['frontierDrylandMove'],string>={
  open_well:'实付材料开井',draw_water:'按井绳实汲',gather_salt:'取井水采盐',attempt_layer:'试冲同境一层',
  tend_herd:'缚栏初养牧群',feed_herd:'给小群投实料',quarry_stone:'凭牧工采雷石',charge_ward:'填料补避雷桩',
};
const keys=(order:FrontierDrylandOrder)=>order.action==='FRONTIER_DRYLAND'?
  JSON.stringify([order.action,order.frontierDrylandMove,order.targetFrontierSiteId,order.frontierDrylandFeed??null]):
  JSON.stringify([order.action,order.frontierDrylandTradeMove,order.targetFrontierDrylandTradeId??null,order.targetCultivatorId??null]);
export function reviewedFrontierDrylandOrder(stage:Stage|undefined,revision:object,menu:readonly FrontierDrylandOrder[]){
  if(!stage||stage.revision!==revision)return undefined;
  const matching=menu.filter(row=>keys(row)===keys(stage.order));
  return matching.length===1?matching[0]:undefined;
}

function actualDryland(m:FrontierMovementView|undefined){
  if(m?.scope!=='frontier'||!m.site||m.site.chartId!==m.chartId||m.site.regionId!==m.regionId)return false;
  return m.regionId===west&&m.chartId==='chart-western-saltwell'||m.regionId===ridge&&m.chartId==='chart-plateau-thunderridge';
}
const trueMeeting=(m:FrontierMovementView|undefined)=>m?.scope==='anchor'&&m.anchorId===DRYLAND_TRADE_MARKET&&
  m.regionId==='south-marsh'&&m.chartId==='chart-south-marsh';
const oldDrylandAnchor=(m:FrontierMovementView|undefined)=>m?.scope==='anchor'&&(
  m.anchorId==='loc-taixu'&&m.regionId===west&&m.chartId==='chart-western-saltwell'||
  m.anchorId==='loc-tianji'&&m.regionId===ridge&&m.chartId==='chart-plateau-thunderridge'
);
const canReadTrade=(m:FrontierMovementView|undefined)=>actualDryland(m)||trueMeeting(m)||oldDrylandAnchor(m);
function localView(props:FrontierDrylandPanelProps){
  const m=props.movement,view=props.local;
  return actualDryland(m)&&view?.regionId===m?.regionId&&view?.siteId===m?.site?.id?view:undefined;
}
function namedCandidate(props:FrontierDrylandPanelProps,id:string|undefined){
  return id&&props.tradeCandidates&&Object.hasOwn(props.tradeCandidates,id)?props.tradeCandidates[id]?.trim():undefined;
}
function tradeScope(option:FrontierDrylandTradeOption,props:FrontierDrylandPanelProps){
  const m=props.movement;
  if(option.frontierDrylandTradeMove==='propose')return trueMeeting(m)&&!!namedCandidate(props,option.targetCultivatorId);
  const receipt=props.trades?.find(row=>row.id===option.targetFrontierDrylandTradeId);
  if(!receipt)return false;
  if(option.frontierDrylandTradeMove==='accept')return trueMeeting(m)&&receipt.status==='offered'&&receipt.yourSide===ridge;
  if(!actualDryland(m)||m?.regionId!==receipt.yourSide||receipt.status!=='accepted'||localView(props)?.resident!==true)return false;
  return receipt.yourSide===west?m.site?.id===places.westStore&&receipt.west===undefined:
    m.site?.id===places.ridgeStore&&receipt.ridge===undefined;
}

export function frontierDrylandScopedOrders(props:FrontierDrylandPanelProps):FrontierDrylandOrder[]{
  const menu=props.controls?.choices??[],view=localView(props),counts=new Map<string,number>();
  for(const order of menu){const key=keys(order);counts.set(key,(counts.get(key)??0)+1);}
  return menu.filter(order=>{
    const key=keys(order);
    if(counts.get(key)!==1)return false;
    if(order.action==='FRONTIER_DRYLAND_TRADE')return tradeScope(order,props);
    return view?.resident===true&&view.siteId===order.targetFrontierSiteId&&
      view.options.some(row=>keys(row)===key);
  });
}
function scopedPending(props:FrontierDrylandPanelProps){
  const pending=props.controls?.pending;
  if(!pending)return undefined;
  return (pending.action==='FRONTIER_DRYLAND'?localView(props)?.siteId===pending.targetFrontierSiteId:
    tradeScope(pending,props))?pending:undefined;
}

function name(option:FrontierDrylandOrder,props:FrontierDrylandPanelProps){
  if(option.action==='FRONTIER_DRYLAND'){
    if(option.frontierDrylandMove==='feed_herd')return option.frontierDrylandFeed==='salt'?'喂已到仓的井盐':'喂本人玄土根';
    return localNames[option.frontierDrylandMove];
  }
  if(option.frontierDrylandTradeMove==='propose')return `与${namedCandidate(props,option.targetCultivatorId)??'当面之人'}提盐雷货约`;
  return option.frontierDrylandTradeMove==='accept'?'当面应盐雷货约':'把本方真货装运';
}

function terms(option:FrontierDrylandOrder,props:FrontierDrylandPanelProps){
  if(option.action==='FRONTIER_DRYLAND_TRADE'){
    if(option.frontierDrylandTradeMove==='propose'||option.frontierDrylandTradeMove==='accept')
      return `实在中坊当面才落笔，提约方供井盐，应约方供雷石，各 ${DRYLAND_TRADE_AMOUNT} 份。此步留下提议，住籍、库存和装运维持原状。`;
    return localView(props)?.regionId===west?
      `实际装运才托管 ${DRYLAND_TRADE_AMOUNT} 份本仓原批，并实耗 ${cost.haulWater} 份井水，井里仍须留 ${cost.waterReserve} 份。实耗的水不随退货退回。`:
      `实际装运才托管 ${DRYLAND_TRADE_AMOUNT} 份本仓原批，并实耗 ${cost.haulWork} 份本期牧工。实耗的牧工不随退货退回。`;
  }
  switch(option.frontierDrylandMove){
    case 'open_well':return `只在实际井边，付本人 ${cost.wellStones} 灵石、${cost.wellRoots} 株玄土根开工；完工前不产水。`;
    case 'draw_water':return '井成后才可实汲；按当地月份和槽中余位，不因查看就加水。';
    case 'gather_salt':return `实际采作才耗同一井槽 ${cost.saltWater} 份水和本人 ${cost.gatherHp} 气血，槽里仍须留水；有仓位才产 ${cost.batchYield} 份真盐。`;
    case 'attempt_layer':return `实际耗同一井槽 ${cost.layerWater} 份水和 1 块已经到仓的雷石，仍须留水。可能进层，也可能遭反噬；不是渡天劫。`;
    case 'tend_herd':return `实际用本人 ${cost.herdStones} 灵石和 ${cost.herdRoots} 株玄土根照料当地小牧群，不凭空生出盐或石。`;
    case 'feed_herd':return option.frontierDrylandFeed==='salt'?'只用已经到这处库中的 1 份井盐，不扣在途货。':
      '只付本人真有的 1 株玄土根作饲料，留下一笔实际牧工。';
    case 'quarry_stone':return `实际采石才用 ${cost.quarryWork} 份牧工和本人 ${cost.gatherHp} 气血；真逢雷窗时还要实扣阵储，不把近旁阵桩当已抵雷。`;
    case 'charge_ward':return `真正补阵才用本地已实到的 1 块雷石和本人 ${cost.wardRoots} 株玄土根；备下一回挡雷的用量。`;
  }
}

function Orders({props,options,family}:{props:FrontierDrylandPanelProps;options:readonly FrontierDrylandOrder[];family:OrderFamily}){
  const controls=props.controls;
  const [stage,setStage]=useState<Stage>();
  const [notice,setNotice]=useState('');
  const label=useId();
  if(!controls)return null;
  const menu=options.filter(option=>option.action===family);
  const intent=scopedPending(props),pending=intent?.action===family?intent:undefined;
  const choice=reviewedFrontierDrylandOrder(stage,controls.revisionKey,menu);
  if(!pending&&!menu.length&&!notice)return null;
  return <div className="space-y-2">
    {pending&&<p role="status">已候下月：{name(pending,props)}。还没支料、落笔或发货。</p>}
    {!controls.pending&&menu.length>0&&<div className="flex flex-wrap gap-1.5">
      {menu.map(order=><button key={keys(order)} type="button" className={button} disabled={controls.disabled}
        aria-pressed={choice===order} onClick={()=>{setNotice('');setStage({order,revision:controls.revisionKey});}}>{name(order,props)}</button>)}
    </div>}
    {choice&&!controls.pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-2 rounded border border-slate-700 p-2">
      <p id={label}>{terms(choice,props)}排入只耗 {AVATAR_ORDER_COST} 神识，下月须重新核验实地和资粮。</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，原货和资粮还未动。':'所在处、时机或人身已变，未记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={button} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

export function FrontierDrylandPanel(props:FrontierDrylandPanelProps){
  const local=localView(props),trades=canReadTrade(props.movement)?props.trades??[]:[];
  const orders=frontierDrylandScopedOrders(props),pending=scopedPending(props);
  const showTrade=trades.length>0||orders.some(row=>row.action==='FRONTIER_DRYLAND_TRADE')||pending?.action==='FRONTIER_DRYLAND_TRADE';
  if(!local&&!showTrade)return null;
  const scope=props.controls?.scopeKey;
  return <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
    {local&&<FrontierDrylandLocalRead view={local} nowTick={props.nowTick}>
      <Orders key={`work:${scope}`} family="FRONTIER_DRYLAND" options={orders} props={props}/>
    </FrontierDrylandLocalRead>}
    {showTrade&&<FrontierDrylandTradeRead trades={trades}>
      <Orders key={`cargo:${scope}`} family="FRONTIER_DRYLAND_TRADE" options={orders} props={props}/>
    </FrontierDrylandTradeRead>}
  </div>;
}

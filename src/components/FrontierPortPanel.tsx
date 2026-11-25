import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {FrontierMovementView} from '../engine/frontierMovementEngine';
import {FRONTIER_PORT_COMMISSION_ROOTS,FRONTIER_PORT_COMMISSION_STONES,FRONTIER_PORT_GATHER_HP,FRONTIER_PORT_PRACTICE_HP,
  FRONTIER_PORT_REPAIR_ROOTS,FRONTIER_PORT_REPAIR_STONES,type FrontierPortLocalOption,type FrontierPortView} from '../engine/frontierPortTerms';
import type {FrontierPortTradeOption,FrontierPortTradeView} from '../engine/frontierPortTradeEngine';
import {PORT_TRADE_DOCK_SITE,PORT_TRADE_FEE_STONES,PORT_TRADE_HULL_WEAR,PORT_TRADE_INLAND_SITE,PORT_TRADE_RIGGING,
  PORT_TRADE_ROOTS,PORT_TRADE_SALT,PORT_TRADE_WAREHOUSE_SITE} from '../engine/frontierPortTradeTerms';
import {FrontierPortLocalRead} from './FrontierPortLocalRead';
import {FrontierPortTradeRead} from './FrontierPortTradeRead';

export type FrontierPortOrder=FrontierPortLocalOption|FrontierPortTradeOption;
export interface FrontierPortControls {
  scopeKey:string;revisionKey:object;choices:readonly FrontierPortOrder[];
  pending?:FrontierPortOrder;disabled?:boolean;
  onQueue:(order:FrontierPortOrder,revision:object)=>boolean;
}

export interface FrontierPortPanelProps {
  movement?:FrontierMovementView;
  local?:FrontierPortView;
  trades?:readonly FrontierPortTradeView[];
  tradeCandidates?:Readonly<Record<string,string>>;
  controls?:FrontierPortControls;
}

type Stage={order:FrontierPortOrder;revision:object};
type OrderFamily=FrontierPortOrder['action'];
const button='min-h-11 min-w-0 rounded border border-cyan-800 bg-slate-950 px-2.5 py-1 text-sm text-slate-100 focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50 [overflow-wrap:anywhere]';
const namesLocal:Record<FrontierPortLocalOption['frontierPortMove'],string>={
  commission:'筹料造船',repair:'实修在泊船',weave_rigging:'织一份船具',gather:'趁潮采晶',practice:'借在泊船练式',
};
const namesTrade:Record<FrontierPortTradeOption['frontierPortTradeMove'],string>={
  propose:'当面提海陆货约',accept:'本人应约并押根',load:'把实货装入船舱',receive:'实到中坊验货',
  recover_roots:'在中坊验领退根',collect_roots:'在外港验领返根',
};

function portOrderKey(order:FrontierPortOrder){
  return order.action==='FRONTIER_PORT'?
    JSON.stringify([order.action,order.frontierPortMove,order.targetFrontierSiteId]):
    JSON.stringify([order.action,order.frontierPortTradeMove,order.targetFrontierPortTradeId??null,order.targetCultivatorId??null]);
}
export function reviewedFrontierPortOrder(stage:Stage|undefined,revision:object,menu:readonly FrontierPortOrder[]){
  if(!stage||stage.revision!==revision)return undefined;
  const key=portOrderKey(stage.order),matching=menu.filter(row=>portOrderKey(row)===key);
  return matching.length===1?matching[0]:undefined;
}

function candidate(props:FrontierPortPanelProps,id:string|undefined){
  return id&&props.tradeCandidates&&Object.hasOwn(props.tradeCandidates,id)?props.tradeCandidates[id]?.trim():undefined;
}

function localPort(props:FrontierPortPanelProps){
  const movement=props.movement;
  return movement?.scope==='frontier'&&movement.regionId==='east-offshore'&&movement.chartId==='chart-east-offshore'&&
    movement.site?.chartId===movement.chartId&&props.local?.siteId===movement.site.id?props.local:undefined;
}

const atSigningMarket=(m:FrontierMovementView|undefined)=>m?.scope==='anchor'&&m.anchorId===PORT_TRADE_INLAND_SITE&&
  m.regionId==='south-marsh'&&m.chartId==='chart-south-marsh';
const atEastShore=(m:FrontierMovementView|undefined)=>m?.scope==='frontier'&&m.regionId==='east-offshore'&&
  m.chartId==='chart-east-offshore'&&m.site?.chartId===m.chartId;
const atReceiptPlace=(m:FrontierMovementView|undefined)=>atSigningMarket(m)||atEastShore(m)||
  m?.scope==='anchor'&&m.anchorId==='loc-market-east'&&m.regionId==='east-offshore'&&m.chartId==='chart-east-offshore';

function scopedTradeOrder(option:FrontierPortTradeOption,props:FrontierPortPanelProps,
  site:FrontierMovementView|undefined=props.movement){
  if(option.frontierPortTradeMove==='propose')return atSigningMarket(site)&&!!candidate(props,option.targetCultivatorId);
  const receipt=props.trades?.find(row=>row.id===option.targetFrontierPortTradeId);
  if(!receipt)return false;
  if(option.frontierPortTradeMove==='load')return atEastShore(site)&&site?.site?.id===PORT_TRADE_DOCK_SITE&&receipt.yourRole==='seller'&&receipt.status==='signed'&&receipt.cargo===undefined&&
    localPort(props)?.hull?.status==='berthed';
  if(option.frontierPortTradeMove==='collect_roots')return atEastShore(site)&&
    (site?.site?.id===PORT_TRADE_DOCK_SITE||site?.site?.id===PORT_TRADE_WAREHOUSE_SITE)&&receipt.yourRole==='seller'&&
    receipt.roots==='landed_at_port';
  if(!atSigningMarket(site)||receipt.yourRole!=='buyer')return false;
  if(option.frontierPortTradeMove==='accept')return receipt.status==='offered';
  if(option.frontierPortTradeMove==='recover_roots')return receipt.roots==='refundable_inland';
  return receipt.status==='shipping'&&receipt.roots==='inland_escrow'&&receipt.cargo?.position==='inland'&&
    receipt.cargo.direction==='outbound'&&receipt.cargo.inlandArrivedTick!==undefined&&receipt.cargo.receivedTick===undefined;
}

export function frontierPortScopedOrders(props:FrontierPortPanelProps){
  const menu=props.controls?.choices??[],local=localPort(props);
  const counts=new Map<string,number>();
  for(const order of menu){const key=portOrderKey(order);counts.set(key,(counts.get(key)??0)+1);}
  return menu.filter(order=>{
    const key=portOrderKey(order);
    if(counts.get(key)!==1)return false;
    if(order.action!=='FRONTIER_PORT')return scopedTradeOrder(order,props);
    if(local?.resident!==true||local.siteId!==order.targetFrontierSiteId||
      !local.options.some(row=>portOrderKey(row)===key))return false;
    return order.frontierPortMove!=='practice'&&order.frontierPortMove!=='repair'||local.hull?.status==='berthed';
  });
}

function pendingOrder(props:FrontierPortPanelProps){
  const pending=props.controls?.pending;
  if(!pending)return undefined;
  if(pending.action==='FRONTIER_PORT')return localPort(props)?.siteId===pending.targetFrontierSiteId?pending:undefined;
  return scopedTradeOrder(pending,props)?pending:undefined;
}

function optionName(order:FrontierPortOrder,props:FrontierPortPanelProps){
  if(order.action==='FRONTIER_PORT')return namesLocal[order.frontierPortMove];
  return order.frontierPortTradeMove==='propose'?`与${candidate(props,order.targetCultivatorId)??'当面之人'}提货约`:namesTrade[order.frontierPortTradeMove];
}

function terms(order:FrontierPortOrder){
  if(order.action==='FRONTIER_PORT'){
    switch(order.frontierPortMove){
      case 'commission':return `在船工坞实际造船，才由本人付 ${FRONTIER_PORT_COMMISSION_STONES} 灵石和 ${FRONTIER_PORT_COMMISSION_ROOTS} 株玄土根。不是立刻得船。`;
      case 'repair':return `本港真有船在泊才可修。实修由本人付 ${FRONTIER_PORT_REPAIR_STONES} 灵石、${FRONTIER_PORT_REPAIR_ROOTS} 株玄土根；船不在泊位则不得动账。`;
      case 'weave_rigging':return '实际织造才耗本人 1 株玄土根；库存确有余位，才得一份船具。';
      case 'gather':return `实际到滩采作才用本人 1 株玄土根与 ${FRONTIER_PORT_GATHER_HP} 气血；得出的潮晶直接入真实港仓。`;
      case 'practice':return `借实船在泊才可实练，用本港 1 份船具与本人 ${FRONTIER_PORT_PRACTICE_HP} 气血，不用在途物资。`;
    }
  }
  switch(order.frontierPortTradeMove){
    case 'propose':return `只向眼下同在中坊的当事人提约；约换 ${PORT_TRADE_SALT} 份实潮晶、${PORT_TRADE_ROOTS} 株实玄土根。此刻无押物。`;
    case 'accept':return `实际在中坊应约才由买方拿 ${PORT_TRADE_ROOTS} 株本人玄土根入托管；并不收到潮晶。`;
    case 'load':return `实际装船才收港方 ${PORT_TRADE_FEE_STONES} 灵石、${PORT_TRADE_RIGGING} 份实船具，用 ${PORT_TRADE_SALT} 份潮晶作本单实货；船实际出航另耗 ${PORT_TRADE_HULL_WEAR} 耐久。不带你本人离岸。`;
    case 'receive':return '中坊确有原货、本人实际在场才验收，随后才走地根返港手续。';
    case 'recover_roots':return '按本约已经可退的原根，到中坊由原买方本人实领；不预添包。';
    case 'collect_roots':return '原根真实靠港后，港方本人到登验泊位或验货仓才实领；仍在途中者另列。';
  }
}

function Orders({props,orders,family}:{props:FrontierPortPanelProps;orders:readonly FrontierPortOrder[];family:OrderFamily}){
  const controls=props.controls;
  const [stage,setStage]=useState<Stage>();
  const [notice,setNotice]=useState('');
  const label=useId();
  if(!controls)return null;
  const menu=orders.filter(order=>order.action===family);
  const intent=pendingOrder(props),pending=intent?.action===family?intent:undefined;
  const choice=reviewedFrontierPortOrder(stage,controls.revisionKey,menu);
  if(!menu.length&&!pending&&!notice)return null;
  return <div className="space-y-2">
    {pending&&<p role="status">已候下月：{optionName(pending,props)}。未走船、未落笔、未支取实际资材。</p>}
    {!controls.pending&&menu.length>0&&<div className="flex flex-wrap gap-1.5">
      {menu.map(order=><button key={portOrderKey(order)} type="button" className={button} disabled={controls.disabled}
        aria-pressed={choice===order} onClick={()=>{setNotice('');setStage({order,revision:controls.revisionKey});}}>{optionName(order,props)}</button>)}
    </div>}
    {choice&&!controls.pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-2 rounded border border-slate-700 p-2">
      <p id={label}>{terms(choice)}排入只耗 {AVATAR_ORDER_COST} 神识，执行要按下月实况重新核验。</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，实物和船位还未动。':'人身、所在处或时机已变，未记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={button} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}

export function FrontierPortPanel(props:FrontierPortPanelProps){
  const local=localPort(props),trades=atReceiptPlace(props.movement)?props.trades??[]:[];
  const pending=pendingOrder(props),orders=frontierPortScopedOrders(props);
  const showTrade=trades.length>0||orders.some(order=>order.action==='FRONTIER_PORT_TRADE')||pending?.action==='FRONTIER_PORT_TRADE';
  if(!local&&!showTrade)return null;
  const scope=props.controls?.scopeKey;
  return <div className="min-w-0 space-y-2 text-slate-100 [overflow-wrap:anywhere]">
    {local&&<FrontierPortLocalRead view={local}>
      <Orders key={`port:${scope}`} props={props} orders={orders} family="FRONTIER_PORT"/>
    </FrontierPortLocalRead>}
    {showTrade&&<FrontierPortTradeRead trades={trades}>
      <Orders key={`cargo:${scope}`} props={props} orders={orders} family="FRONTIER_PORT_TRADE"/>
    </FrontierPortTradeRead>}
  </div>;
}

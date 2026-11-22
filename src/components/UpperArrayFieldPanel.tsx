import {FrontierChart} from './FrontierChart';
import {UpperPassageHost,type UpperPassageHostControls} from './UpperPassagePanel';
import {
  UPPER_ARRAY_FIELD_CHART,UPPER_ARRAY_FIELD_COUNCIL,UPPER_ARRAY_FIELD_ENTRY_STONES,UPPER_ARRAY_FIELD_GATE,
  UPPER_ARRAY_FIELD_HOME,UPPER_ARRAY_FIELD_HOME_ROOTS,UPPER_ARRAY_FIELD_HOME_STONES,UPPER_ARRAY_FIELD_REGION,
  upperArrayFieldEdge,upperArrayFieldSite,type UpperArrayFieldMovementOption,type UpperArrayFieldSite,
} from '../engine/upperArrayFieldTerms';
import type {UpperArrayFieldMovementView} from '../engine/upperArrayFieldMovementEngine';
import {UPPER_ARRAY_FIELD_LOCAL_COST as cost,type UpperArrayFieldLocalOption,type UpperArrayFieldLocalView}
  from '../engine/upperArrayFieldLocalTerms';
import {UPPER_ARRAY_TRADE_LATTICE as tradeLattice,UPPER_ARRAY_TRADE_ROOTS as tradeRoots} from '../engine/upperArrayFieldTradeTerms';
import type {UpperArrayFieldTradeOption,UpperArrayFieldTradeView} from '../engine/upperArrayFieldTradeEngine';
import {UpperArrayFieldLocalRead,UpperArrayFieldTradeRead} from './UpperArrayFieldRead';
import {arrayFieldFold,arrayFieldSummary,UpperArrayFieldOrders,uniqueArrayFieldOrders,type ArrayFieldControls} from './UpperArrayFieldOrders';

export type UpperArrayFieldOrder=UpperArrayFieldMovementOption|UpperArrayFieldLocalOption|UpperArrayFieldTradeOption;
export type UpperArrayFieldControls=ArrayFieldControls<UpperArrayFieldOrder>;
interface TradeProps {
  trades?:readonly UpperArrayFieldTradeView[];
  controls?:UpperArrayFieldControls;
  tradeCandidates?:Readonly<Record<string,string>>;
  nowTick:number;
}
export interface UpperArrayFieldPanelProps extends TradeProps {
  movement?:UpperArrayFieldMovementView;
  local?:UpperArrayFieldLocalView;
  host?:UpperPassageHostControls;
}
type Place='well'|UpperArrayFieldSite['id'];
export const arrayFieldOrderKey=(order:UpperArrayFieldOrder)=>JSON.stringify(
  order.action==='UPPER_ARRAY_FIELD'?[order.action,order.upperArrayFieldMove,order.targetUpperArrayFieldSiteId]:
  order.action==='UPPER_ARRAY_FIELD_LOCAL'?[order.action,order.upperArrayFieldLocalMove,order.targetUpperArrayFieldSiteId]:
  [order.action,order.upperArrayFieldTradeMove,order.targetUpperArrayFieldTradeId??null,order.targetCultivatorId??null]
);
function eligibleMovement(view:UpperArrayFieldMovementView|undefined){
  return view?.regionId===UPPER_ARRAY_FIELD_REGION&&view.chartId===UPPER_ARRAY_FIELD_CHART?view:undefined;
}
function exactSite(candidate:UpperArrayFieldSite|undefined){
  const expected=candidate&&upperArrayFieldSite(candidate.id);
  return expected&&expected.col===candidate?.col&&expected.row===candidate.row&&expected.chartId===candidate.chartId&&
    expected.regionId===candidate.regionId?expected:undefined;
}
const named=(props:TradeProps,id:string|undefined)=>id&&props.tradeCandidates&&Object.hasOwn(props.tradeCandidates,id)?
  props.tradeCandidates[id]?.trim():undefined;
function tradeLegal(option:UpperArrayFieldTradeOption,place:Place,props:TradeProps){
  if(option.upperArrayFieldTradeMove==='propose')return place==='well'&&!!named(props,option.targetCultivatorId);
  const record=props.trades?.find(row=>row.id===option.targetUpperArrayFieldTradeId);
  if(!record)return false;
  switch(option.upperArrayFieldTradeMove){
    case 'accept':return place==='well'&&record.yourRole==='buyer'&&record.status==='offered';
    case 'settle':return place==='well'&&record.yourRole==='buyer'&&record.status==='carrying'&&record.cargo?.phase==='at_well';
    case 'load':return place==='array-field-exchange'&&record.yourRole==='seller'&&record.status==='accepted';
    case 'unload':return place==='array-field-exchange'&&record.yourRole==='seller'&&record.status==='carrying';
  }
}
function moveLegal(option:UpperArrayFieldMovementOption,m:UpperArrayFieldMovementView,site:UpperArrayFieldSite|undefined){
  if(!m.options.some(row=>arrayFieldOrderKey(row)===arrayFieldOrderKey(option)))return false;
  switch(option.upperArrayFieldMove){
    case 'enter':return m.scope==='council'&&!m.blocked&&option.targetUpperArrayFieldSiteId===UPPER_ARRAY_FIELD_GATE;
    case 'exit':return site?.id===UPPER_ARRAY_FIELD_GATE&&option.targetUpperArrayFieldSiteId===UPPER_ARRAY_FIELD_COUNCIL;
    case 'travel':return !!site&&upperArrayFieldEdge(site.id,option.targetUpperArrayFieldSiteId);
    case 'settle':return site?.id===UPPER_ARRAY_FIELD_HOME&&option.targetUpperArrayFieldSiteId===site.id&&!m.residence;
  }
}
function localAt(props:UpperArrayFieldPanelProps,site:UpperArrayFieldSite|undefined){
  return site&&props.local?.siteId===site.id?props.local:undefined;
}
export function upperArrayFieldScopedOrders(props:UpperArrayFieldPanelProps){
  const m=eligibleMovement(props.movement);
  if(!m)return [];
  const site=m.scope==='field'?exactSite(m.site):undefined;
  if(m.scope==='field'&&(!site||!m.visit))return [];
  const local=localAt(props,site);
  return uniqueArrayFieldOrders(props.controls?.choices??[],arrayFieldOrderKey).filter(order=>{
    if(order.action==='UPPER_ARRAY_FIELD')return moveLegal(order,m,site);
    if(order.action==='UPPER_ARRAY_FIELD_TRADE')return site&&tradeLegal(order,site.id,props);
    const rightCell=order.upperArrayFieldLocalMove==='condense'?'array-field-source':'array-field-practice';
    return !!m.residence&&local?.resident&&local.siteId===rightCell&&local.siteId===order.targetUpperArrayFieldSiteId&&
      local.options.some(row=>arrayFieldOrderKey(row)===arrayFieldOrderKey(order));
  });
}
function name(order:UpperArrayFieldOrder,props:TradeProps){
  if(order.action==='UPPER_ARRAY_FIELD_LOCAL')return order.upperArrayFieldLocalMove==='condense'?'在墩前凝取阵片':'入晨修阵行一课';
  if(order.action==='UPPER_ARRAY_FIELD_TRADE'){
    switch(order.upperArrayFieldTradeMove){
      case 'propose':return '与'+(named(props,order.targetCultivatorId)??'同在井边的人')+'提互印货约';
      case 'accept':return '在北井当面应约';
      case 'load':return '在互印垛实封阵片';
      case 'settle':return '在北井交割阵片和玄土根';
      case 'unload':return '把原封阵片返还互印垛';
    }
  }
  switch(order.upperArrayFieldMove){
    case 'enter':return '从议庭步入阵原';
    case 'exit':return '出阵原门回原议庭';
    case 'settle':return '在结庐台实缴落脚';
    case 'travel':return '走一步到'+(upperArrayFieldSite(order.targetUpperArrayFieldSiteId)?.name??'邻地');
  }
}
function terms(order:UpperArrayFieldOrder){
  if(order.action==='UPPER_ARRAY_FIELD_LOCAL'){
    const {condense,cultivate}=cost;
    return order.upperArrayFieldLocalMove==='condense'?
      '实际凝取才付本人 '+condense.stones+' 灵石、'+condense.roots+' 株玄土根和 '+condense.hp+' 气血，成 '+condense.produced+' 枚有源阵片。':
      '实修耗 '+cultivate.lattice+' 枚有源阵片、'+cultivate.stones+' 灵石和 '+cultivate.hp+' 气血，最多增 '+cultivate.qi+' 点灵气，不算破境。';
  }
  if(order.action==='UPPER_ARRAY_FIELD_TRADE'){
    switch(order.upperArrayFieldTradeMove){
      case 'propose':case 'accept':return '北井当面落印，'+tradeLattice+' 枚真实阵片换 '+tradeRoots+' 株本人玄土根；签约不是交付，不动旧井和议庭的账。';
      case 'load':return '在互印垛封存 '+tradeLattice+' 枚有源阵片，由同一原签人沿旧阶携行；阶口不开时不能过。';
      case 'unload':return '只有原封随本人实际回垛才返还原批，不动井边买方的玄土根。';
      case 'settle':return '两名原签人和原封阵片都到北井才当面清讫，实兑 '+tradeLattice+' 枚阵片与 '+tradeRoots+' 株玄土根，不计井水偿借。';
    }
  }
  switch(order.upperArrayFieldMove){
    case 'enter':return '实际入门才付本人 '+UPPER_ARRAY_FIELD_ENTRY_STONES+' 灵石。';
    case 'settle':return '实际登记才付本人 '+UPPER_ARRAY_FIELD_HOME_STONES+' 灵石与 '+UPPER_ARRAY_FIELD_HOME_ROOTS+' 株玄土根。';
    case 'exit':return '只沿真门回原议庭；旧阶的孔窗不因此打开。';
    case 'travel':return '身体到相邻一格，不是从远处传送。';
  }
}
function Orders({props,family,menu}:{props:TradeProps;family:UpperArrayFieldOrder['action'];menu:readonly UpperArrayFieldOrder[]}){
  const choices=menu.filter(row=>row.action===family),pending=props.controls?.pending;
  return <UpperArrayFieldOrders key={family+':'+props.controls?.scopeKey} controls={props.controls} menu={choices}
    pending={pending?.action===family&&choices.some(row=>arrayFieldOrderKey(row)===arrayFieldOrderKey(pending))?pending:undefined}
    orderKey={arrayFieldOrderKey} name={order=>name(order,props)} terms={terms}/>;
}
export function UpperArrayFieldPanel(props:UpperArrayFieldPanelProps){
  const m=eligibleMovement(props.movement);
  if(!m)return null;
  const menu=upperArrayFieldScopedOrders(props),walk=<Orders props={props} family="UPPER_ARRAY_FIELD" menu={menu}/>;
  if(m.scope==='council')return <details className={arrayFieldFold}>
    <summary className={arrayFieldSummary}>向议庭问阵原</summary>
    <p>此人已亲核旧阵、付过议请。人还在议庭，未入阵原，不看阵原图和库存。</p>
    {m.blocked==='fee'&&<p>眼下付不起 {UPPER_ARRAY_FIELD_ENTRY_STONES} 灵石，尚不能入门。</p>}
    {walk}
  </details>;
  const site=exactSite(m.site);
  if(!site||!m.visit)return null;
  const tiles=[site,...m.visibleSites.filter(row=>row.id!==site.id)].map(exactSite).filter((s):s is UpperArrayFieldSite=>!!s&&
    (s.id===site.id||upperArrayFieldEdge(site.id,s.id))).map(s=>({...s,tileId:s.id}));
  const chart={chartId:m.chartId,name:'阵原',rows:3,cols:3,currentTileId:site.id,tiles};
  const local=localAt(props,site);
  const trades=site.id==='array-field-exchange'?props.trades??[]:[];
  return <section className={arrayFieldFold+' pt-3'} aria-label="阵原">
    <h2 className="text-base font-semibold text-amber-100">阵原</h2>
    <FrontierChart chart={chart}/>
    <p>{m.residence?'此身已在结庐台实缴落脚。':'此身是访客，尚未在阵原结庐。'}</p>
    <p className="text-xs text-slate-300">第 {m.visit.enteredTick} 轮入门实付 {m.visit.paidStones} 灵石。</p>
    {props.host&&<UpperPassageHost key={props.host.scopeKey} {...props.host}/>}
    {walk}
    {local&&<UpperArrayFieldLocalRead local={{...local,resident:!!m.residence&&local.resident}}>
      <Orders props={props} family="UPPER_ARRAY_FIELD_LOCAL" menu={menu}/>
    </UpperArrayFieldLocalRead>}
    {trades.length>0&&<UpperArrayFieldTradeRead trades={trades}>
      <Orders props={props} family="UPPER_ARRAY_FIELD_TRADE" menu={menu}/>
    </UpperArrayFieldTradeRead>}
  </section>;
}
export function UpperArrayFieldWellPanel(props:TradeProps&{atWell:boolean}){
  if(!props.atWell)return null;
  const menu=uniqueArrayFieldOrders(props.controls?.choices??[],arrayFieldOrderKey).filter(order=>
    order.action==='UPPER_ARRAY_FIELD_TRADE'&&tradeLegal(order,'well',props));
  if(!menu.length&&!props.trades?.length)return null;
  return <UpperArrayFieldTradeRead trades={props.trades??[]}>
    <Orders props={props} family="UPPER_ARRAY_FIELD_TRADE" menu={menu}/>
  </UpperArrayFieldTradeRead>;
}
export function UpperArrayFieldCarrierRead({trades,atOldPassage}:Pick<TradeProps,'trades'>&{atOldPassage:boolean}){
  const known=atOldPassage?trades?.filter(row=>row.yourRole==='seller'&&row.status==='carrying'&&row.cargo):undefined;
  return known?.length?<UpperArrayFieldTradeRead trades={known}/>:null;
}

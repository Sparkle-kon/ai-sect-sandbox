import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import type {EscortView} from '../engine/escortEngine';
import {marketFreightCapacity,marketFreightQuote} from '../engine/marketFreightTerms';
import {MARKET_GOODS} from '../engine/marketEngine';
import type {MarketFreightBand,MarketFreightOption} from '../types/marketFreight';
import type {Cultivator,MarketShipment,WorldState} from '../types/world';

export interface MarketFreightControls {
  scopeKey:string;revisionKey:object;choices:readonly MarketFreightOption[];
  pending?:MarketFreightOption;disabled?:boolean;
  onQueue:(choice:MarketFreightOption,revision:object)=>boolean;
}
type Offer=Extract<MarketFreightOption,{marketFreightMove:'offer'}>;
type Stage={choice:MarketFreightOption;revision:object};
const bands:Record<MarketFreightBand,string>={light:'轻载',medium:'中载',heavy:'重载'};
const labels:Record<MarketFreightOption['marketFreightMove'],string>={
  offer:'请承这趟货',accept:'亲自应下这趟货',decline:'谢绝承货',withdraw:'收回承货邀约',
};
const entry='min-h-11 min-w-0 max-w-full rounded border border-amber-500/40 bg-slate-950 px-2 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const summary='flex min-h-11 cursor-pointer items-center font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300';
const key=(choice:MarketFreightOption)=>JSON.stringify(choice.marketFreightMove==='offer'?
  [choice.action,choice.marketFreightMove,choice.targetShipmentId,choice.targetCultivatorId]:
  [choice.action,choice.marketFreightMove,choice.targetEscortId]);
const isOffer=(choice:MarketFreightOption):choice is Offer=>choice.marketFreightMove==='offer';
const safe=(name:string)=>name.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').trim().slice(0,50);
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
export function reviewedMarketFreight(stage:Stage|undefined,revision:object,choices:readonly MarketFreightOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const same=choices.filter(row=>key(row)===key(stage.choice));
  return same.length===1?same[0]:undefined;
}
function uniqueMenu(choices:readonly MarketFreightOption[]){
  const counts=new Map<string,number>();
  for(const row of choices)counts.set(key(row),(counts.get(key(row))??0)+1);
  return choices.filter(row=>counts.get(key(row))===1);
}
function shipment(world:WorldState,ask:Offer,viewerId:string){
  return world.markets.shipments.find(row=>row.id===ask.targetShipmentId&&row.sellerId===viewerId&&row.status==='in_transit');
}
function actorName(world:WorldState,id:string){return safe(person(world,id)?.name??'')||'原承运人';}
function thisParty(view:EscortView,id:string){return !!view.contract.freight&&(view.contract.clientId===id||view.contract.freight.carrierId===id);}
function reply(view:EscortView,choice:MarketFreightOption,id:string,tick:number){
  const {contract}=view;
  if(isOffer(choice)||!thisParty(view,id)||choice.targetEscortId!==contract.id||contract.status!=='offered'||
    contract.offeredTick>tick||contract.expiresTick<tick+1)return false;
  return choice.marketFreightMove==='withdraw'?contract.clientId===id:contract.freight?.carrierId===id;
}
function originalQuantity(world:WorldState,sellOrderId:string,clientId:string,originId:string,good:MarketShipment['good']){
  const matches=world.markets.orders.filter(row=>row.id===sellOrderId&&row.side==='sell'&&row.actorId===clientId&&
    row.locationId===originId&&row.good===good&&row.placedTick<=world.tick);
  return matches.length===1?matches[0].quantity:undefined;
}
function delivered(world:WorldState,view:EscortView){
  const {contract}=view,f=contract.freight;
  if(!f?.dispatch||contract.status!=='delivered'||contract.arrivedTick===undefined||
      f.dispatch.tick>contract.arrivedTick||contract.arrivedTick>world.tick)return undefined;
  const records=world.markets.receipts.filter(row=>row.shipmentId===contract.shipmentId&&row.status==='delivered'&&
    row.tick>=contract.arrivedTick!&&row.tick<=world.tick&&row.tick===contract.settledTick&&
    row.buyerId===f.buyerId&&row.sellerId===contract.clientId&&row.originId===contract.originId&&
    row.destinationId===contract.destinationId&&row.good===f.good&&row.quantity===f.quantity&&row.unitPrice===f.unitPrice);
  return records.length===1?records[0]:undefined;
}
export function MarketFreightReceipt({world,view}:{world:WorldState;view:EscortView}){
  const {contract}=view,f=contract.freight;
  if(!f)return null;
  const departure=f.dispatch!==undefined&&f.dispatch.tick<=world.tick;
  const actual=delivered(world,view);
  const line=originalQuantity(world,f.sellOrderId,contract.clientId,contract.originId,f.good);
  const cap=f.capability?.capacity;
  const closed=contract.status==='failed'||contract.status==='expired';
  const outcome=f.closedBy==='declined'?'承运人已谢绝':f.closedBy==='withdrawn'?'邀约已撤下':f.closedBy==='incapable'?
    '未满足实际载力或启程条件':f.closedBy==='shipment_ended'?'原货运已另行结案':'承运未成或已经到期';
  return <div className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2">
    <p className="font-medium text-amber-100">{actorName(world,f.carrierId)}{contract.acceptedTick===undefined?'受邀承运':'已应允承运'}</p>
    {line!==undefined&&<p>卖单原挂 {line} 件；本趟只核 {f.quantity} 件{MARKET_GOODS[f.good].label}。
      {line>f.quantity&&'其余原单不因这趟而记成货损。'}</p>}
    {line===undefined&&<p>本趟只核 {f.quantity} 件{MARKET_GOODS[f.good].label}。</p>}
    <p>{bands[f.band]} · 实核重量 {f.load}{cap!==undefined&&<>／承运人应约时载限 {cap}</>}。运费报价 {f.fee} 灵石、行粮 {f.rations} 株玄土根。</p>
    {actual?<p>有原商单的实到收据：{actual.quantity} 件确已送达，货价仍按原单。</p>:
      closed?<p>{outcome}。此处不把承运约当作到货。</p>:
      contract.status==='delivered'?<p>未能核对本趟的原到货收据，此处不记送达。</p>:
      departure?<p>已经实走出一段，尚无本趟实到收据。</p>:
      contract.status==='active'?<p>已应允，只封存运费与行粮；尚未实走，不记已付或到货。</p>:
      <p>已递承运邀约，委托人只托管了运费；承运人尚未应允，也未启程。</p>}
    {(contract.feeEscrow>0||contract.rationsEscrow>0)&&<p>当前托管 {contract.feeEscrow} 灵石、{contract.rationsEscrow} 株玄土根。</p>}
    {departure&&(contract.feePaid>0||contract.rationsSpent>0)&&<p>已随实走结算：运费实付 {contract.feePaid} 灵石、行粮实耗 {contract.rationsSpent} 株玄土根。</p>}
    {(contract.feeRefunded>0||contract.rationsReturned>0)&&<p>只退尚未动用的托管：{contract.feeRefunded>0&&<>实退委托人 {contract.feeRefunded} 灵石。 </>}
      {contract.rationsReturned>0&&<>实退承运人 {contract.rationsReturned} 株玄土根。</>}</p>}
  </div>;
}
function OfferMenu({world,viewerId,choices,disabled,choose}:{world:WorldState;viewerId:string;choices:readonly Offer[];disabled?:boolean;choose:(choice:Offer)=>void}){
  const [requested,setRequested]=useState<string>();
  const ships=[...new Set(choices.map(row=>row.targetShipmentId))];
  const focus=requested&&ships.includes(requested)?requested:ships.length===1?ships[0]:undefined;
  const subtitle=(id:string)=>{
    const row=world.markets.shipments.find(entry=>entry.id===id&&entry.sellerId===viewerId);
    if(!row)return '';
    const site=safe(world.locations.find(place=>place.id===row.destinationId)?.name??'');
    return [MARKET_GOODS[row.good].label+' '+row.quantity+' 件',site&&'去'+site].filter(Boolean).join(' · ');
  };
  if(!ships.length)return null;
  const eligible=focus?choices.filter(row=>row.targetShipmentId===focus):[];
  return <div className="space-y-2">
    {ships.length>1&&<label className="grid min-w-0 gap-1">要核载的这趟货
      <select className={entry+' w-full'} value={focus?String(ships.indexOf(focus)):''} disabled={disabled}
        onChange={event=>setRequested(ships.find((_,i)=>String(i)===event.currentTarget.value))}>
        <option value="">请选择</option>
        {ships.map((id,i)=><option key={id} value={i}>{subtitle(id)}{ships.some(other=>other!==id&&subtitle(other)===subtitle(id))&&'（同样货单 '+(i+1)+'）'}</option>)}
      </select>
    </label>}
    {focus&&<p>本趟：{subtitle(focus)}。</p>}
    <div className="flex flex-wrap gap-1">
      {eligible.map((row,i)=>{
        const name=actorName(world,row.targetCultivatorId);
        return <button type="button" key={key(row)} className={entry} disabled={disabled} onClick={()=>choose(row)}>
          请{name}{eligible.some(other=>other!==row&&actorName(world,other.targetCultivatorId)===name)&&'（同名 '+(i+1)+'）'}承运
        </button>;
      })}
    </div>
  </div>;
}
function quotedTerms(world:WorldState,viewerId:string,choice:MarketFreightOption,rows:readonly EscortView[]){
  if(isOffer(choice)){
    const ship=shipment(world,choice,viewerId),carrier=person(world,choice.targetCultivatorId);
    const quote=ship&&marketFreightQuote(ship.good,ship.quantity);
    if(!quote||!carrier)return '只核这趟货的实载与托管。';
    const capacity=marketFreightCapacity(carrier.realm,carrier.realmStage);
    return '只约本趟 '+quote.quantity+' 件，'+bands[quote.band]+'重 '+quote.load+'，承运人当下载限 '+capacity+
      '。实际发约才封存委托人 '+quote.fee+' 灵石；承运人同意时另封 '+quote.rations+' 株玄土根，尚不付运费。';
  }
  const f=rows.find(row=>row.contract.id===choice.targetEscortId)?.contract.freight;
  if(choice.marketFreightMove==='accept'&&f)return '委托人已封存 '+f.fee+' 灵石；实际应允时封承运人 '+f.rations+' 株玄土根。待实走才支付运费和耗用行粮，不算交货。';
  return '这次不承运；只按实账退未动用的托管，不改原挂单或货价。';
}
export function MarketFreightRead({world,viewer,rows,controls}:{world:WorldState;viewer:Cultivator;rows:readonly EscortView[];controls?:MarketFreightControls}){
  const [stage,setStage]=useState<Stage>(),[notice,setNotice]=useState('');
  const label=useId();
  const known=rows.filter(view=>view.contract.offeredTick<=world.tick&&thisParty(view,viewer.id))
    .sort((a,b)=>b.contract.offeredTick-a.contract.offeredTick);
  const menu=uniqueMenu(controls?.choices??[]).filter(choice=>choice.action==='MARKET_FREIGHT'&&
    (isOffer(choice)?!!shipment(world,choice,viewer.id)&&!!person(world,choice.targetCultivatorId)&&choice.targetCultivatorId!==viewer.id:
      known.some(row=>reply(row,choice,viewer.id,world.tick))));
  const pending=controls?.pending;
  if(!known.length&&!menu.length&&!pending)return null;
  const latest=known.find(row=>row.contract.status==='offered'||row.contract.status==='active')??known[0];
  const others=known.filter(row=>row!==latest);
  const picked=controls&&reviewedMarketFreight(stage,controls.revisionKey,menu);
  const choose=(choice:MarketFreightOption)=>{if(controls){setStage({choice,revision:controls.revisionKey});setNotice('');}};
  const card=(row:EscortView)=><div className="space-y-1">
    <MarketFreightReceipt world={world} view={row}/>
    {!pending&&<div className="flex flex-wrap gap-1">{menu.filter(choice=>reply(row,choice,viewer.id,world.tick)).map(choice=>
      <button key={key(choice)} type="button" className={entry} disabled={controls?.disabled} aria-pressed={picked===choice}
        onClick={()=>choose(choice)}>{labels[choice.marketFreightMove]}</button>)}</div>}
  </div>;
  return <details className="min-w-0 space-y-2 rounded border border-amber-500/30 bg-slate-950 px-2 pb-2 text-sm [overflow-wrap:anywhere]">
    <summary className={summary}>这一趟核载承运</summary>
    {latest&&card(latest)}
    {!pending&&<OfferMenu key={controls?.scopeKey} world={world} viewerId={viewer.id} choices={menu.filter(isOffer)} disabled={controls?.disabled} choose={choose}/>}
    {pending&&<p role="status">已候下月：{labels[pending.marketFreightMove]}。运费与车上实货此刻未动。</p>}
    {picked&&controls&&!pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-1 rounded border border-slate-800 p-2">
      <p id={label}>{quotedTerms(world,viewer.id,picked,known)} 排入只耗 {AVATAR_ORDER_COST} 神识，下月才核对原货与承运人。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={entry} onClick={()=>{setNotice(controls.onQueue(picked,controls.revisionKey)?
          '已记下打算，货和运费未动。':'原货、本人或时机已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={entry} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
    {others.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className={summary}>其他承运凭据</summary>
      <div className="space-y-1 pb-2">{others.map(row=><div key={row.contract.id}>{card(row)}</div>)}</div>
    </details>}
  </details>;
}

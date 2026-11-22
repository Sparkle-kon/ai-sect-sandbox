import type {CultivationRealm,Cultivator,WorldState} from '../types/world';
import {verifyFrontierTradeAgreement} from './frontierTradeEngine';
import type {FrontierTradeAgreement,FrontierTradeCargo} from './frontierTradeTerms';
import {verifyFrontierDrylandTradeAgreement} from './frontierDrylandTradeEngine';
import type {FrontierDrylandTradeAgreement,FrontierDrylandTradeCargo} from './frontierDrylandTradeTerms';
import {frontierProductionReceiptId,FRONTIER_PRACTICE_QI} from './frontierProductionTerms';
import {frontierDrylandBatchId,frontierDrylandReceiptId,FRONTIER_DRYLAND_COSTS,FRONTIER_DRYLAND_LOCATIONS} from './frontierDrylandTerms';

type Good='ward_reed'|'stormstone'|'rift_salt';
type Region='north-snow'|'western-saltwell'|'plateau-thunderridge';
export type FrontierSupplyLinkKind='north_practice'|'west_layer'|'ridge_feeding';
export type FrontierSupplyLinkResult=
  | {readonly kind:'qi_gain';readonly qiGained:number}
  | {readonly kind:'layer_advanced'|'layer_backlash';readonly realm:CultivationRealm;readonly fromStage:number;readonly toStage:number}
  | {readonly kind:'herd_fed'};
/** Scoped presentation, not an additional journal. Internal IDs are for stable component keys only. */
export interface FrontierSupplyLink{
  readonly id:string;
  readonly kind:FrontierSupplyLinkKind;
  readonly good:Good;
  readonly quantity:1;
  readonly harvestedTick:number;
  readonly loadedTick:number;
  readonly arrivedTick:number;
  readonly deliveredTick:number;
  readonly usedTick:number;
  readonly result:FrontierSupplyLinkResult;
}
type DateSpan={harvestedTick:number;loadedTick:number;arrivedTick:number;deliveredTick:number};
type Proof={lane:'farm';row:FrontierTradeAgreement}|{lane:'dryland';row:FrontierDrylandTradeAgreement};
interface Import extends DateSpan {
  readonly recordId:string;readonly actorId:string;readonly batchId:string;readonly good:Good;
  readonly region:Region;readonly amount:number;readonly proof:Proof;
}
interface Use {
  readonly receiptId:string;readonly tick:number;readonly actorId:string;readonly batchId:string;
  readonly good:Good;readonly region:Region;readonly amount:number;
  readonly consequence?:{readonly kind:FrontierSupplyLinkKind;readonly result:FrontierSupplyLinkResult};
}
interface SourceHistory {
  readonly residency:Map<string,Map<string,number>>;
  readonly visits:Map<string,NonNullable<WorldState['frontier']>['visits']>;
}
const finiteInt=(value:number,min:number,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const ascii=(l:string,r:string)=>l<r?-1:l>r?1:0;
const sourceKey=(region:Region,good:Good,id:string)=>JSON.stringify([region,good,id]);
const creditKey=(lane:Proof['lane'],recordId:string)=>JSON.stringify([lane,recordId]);
function validDate(world:WorldState,tick:number,year:number,month:number):boolean{
  return finiteInt(tick,1,world.tick)&&finiteInt(year,0)&&finiteInt(month,1,12)&&
    year*12+month===world.year*12+world.month+(tick-world.tick);
}
function uniqueIndex<T>(rows:readonly T[],key:(row:T)=>string):Map<string,T|null>{
  const result=new Map<string,T|null>();
  for(const row of rows){const id=key(row);result.set(id,result.has(id)?null:row);}
  return result;
}
function sourceHistory(world:WorldState):SourceHistory{
  const residency:SourceHistory['residency']=new Map(),visits:SourceHistory['visits']=new Map();
  for(const row of world.frontier?.residences??[]){
    const own=residency.get(row.actorId)??new Map<string,number>();
    own.set(row.regionId,Math.min(row.settledTick,own.get(row.regionId)??Infinity));residency.set(row.actorId,own);
  }
  for(const row of world.frontier?.visits??[]){
    const own=visits.get(row.actorId)??[];
    own.push(row);visits.set(row.actorId,own);
  }
  return {residency,visits};
}
function historicallyHere(history:SourceHistory,actorId:string,region:string,site:string,tick:number):boolean{
  return (history.residency.get(actorId)?.get(region)??Infinity)<tick&&
    !!history.visits.get(actorId)?.some(row=>row.regionId===region&&row.enteredTick<tick&&
      (row.exitedTick===undefined||row.exitedTick>tick)&&(row.deceasedTick===undefined||row.deceasedTick>tick)&&
      row.steps.filter(step=>step.tick<=tick).at(-1)?.siteId===site&&!row.steps.some(step=>step.tick===tick));
}
function exactCargoDates(row:{closedTick?:number},cargo:FrontierTradeCargo|FrontierDrylandTradeCargo,through:number){
  const {arrivedTick,loadedTick,closedTick}=cargo;
  if(cargo.status!=='delivered'||arrivedTick===undefined||closedTick===undefined||closedTick!==row.closedTick||
    !finiteInt(loadedTick,1,through)||!finiteInt(arrivedTick,loadedTick+1,through)||!finiteInt(closedTick,arrivedTick,through))return;
  return {loadedTick,arrivedTick,deliveredTick:closedTick};
}
function collectFarm(world:WorldState,history:SourceHistory,through:number,imports:Import[],uses:Use[]):void{
  const state=world.frontier?.production;
  if(!state)return;
  const batches=uniqueIndex(state.batches,row=>row.id),crops=uniqueIndex(state.crops,row=>row.id),
    receipts=uniqueIndex(state.receipts,row=>row.id),spends=uniqueIndex(state.consumptions,row=>row.refId);
  for(const row of world.frontier?.trade?.agreements??[]){
    const cargo=row.south;
    if(row.status!=='exchanged'||cargo?.from!=='south-marsh'||cargo.good!=='ward_reed')continue;
    const span=exactCargoDates(row,cargo,through);if(!span)continue;
    for(const lot of cargo.lots){
      const batch=batches.get(lot.batchId),crop=batch&&crops.get(batch.plotId);
      const harvest=batch&&receipts.get(frontierProductionReceiptId(batch.harvestedTick,'harvest',batch.siteId,batch.harvesterId));
      if(!batch||batch.good!=='ward_reed'||batch.regionId!=='south-marsh'||!crop||crop.regionId!==batch.regionId||crop.siteId!==batch.siteId||
        crop.resolved?.kind!=='harvested'||crop.resolved.batchId!==batch.id||crop.resolved.tick!==batch.harvestedTick||
        !harvest||harvest.kind!=='harvest'||harvest.plotId!==crop.id||harvest.actorId!==batch.harvesterId||
        harvest.regionId!==batch.regionId||harvest.siteId!==batch.siteId||harvest.tick!==batch.harvestedTick||
        !validDate(world,harvest.tick,harvest.year,harvest.month)||
        !finiteInt(batch.harvestedTick,1,span.loadedTick-1)||!finiteInt(lot.amount,1,batch.units))continue;
      imports.push({...span,harvestedTick:batch.harvestedTick,recordId:row.id,actorId:row.northActorId,
        batchId:lot.batchId,amount:lot.amount,region:'north-snow',good:'ward_reed',proof:{lane:'farm',row}});
    }
  }
  for(const spend of state.consumptions){
    if(spend.regionId!=='north-snow'||spend.good!=='ward_reed'||!finiteInt(spend.tick,1,through))continue;
    const native=receipts.get(spend.refId);
    const consequence=spends.get(spend.refId)===spend&&spend.purpose==='practice'&&spend.slices.length===1&&spend.slices[0].amount===1&&
      native?.kind==='cultivate'&&native.tick===spend.tick&&native.actorId===spend.actorId&&native.regionId===spend.regionId&&
      native.id===frontierProductionReceiptId(native.tick,'cultivate','frontier-north-home',native.actorId)&&
      native.siteId==='frontier-north-home'&&validDate(world,native.tick,native.year,native.month)&&
      finiteInt(native.qiGained,1,FRONTIER_PRACTICE_QI)&&historicallyHere(history,native.actorId,native.regionId,native.siteId,native.tick)
      ? {kind:'north_practice' as const,result:{kind:'qi_gain' as const,qiGained:native.qiGained}}:undefined;
    for(const piece of spend.slices)if(finiteInt(piece.amount,1))uses.push({receiptId:spend.refId,tick:spend.tick,actorId:spend.actorId,
      batchId:piece.batchId,amount:piece.amount,good:'ward_reed',region:'north-snow',consequence});
  }
}
function collectDryland(world:WorldState,history:SourceHistory,through:number,imports:Import[],uses:Use[]):void{
  const state=world.frontier?.drylands;
  if(!state)return;
  const batches=uniqueIndex(state.batches,row=>row.id),receipts=uniqueIndex(state.receipts,row=>row.id);
  for(const row of state.trade?.agreements??[]){
    if(row.status!=='exchanged')continue;
    for(const [cargo,side,source,good,move,site,recipient] of [
      [row.ridge,'western-saltwell','plateau-thunderridge','stormstone','quarry_stone',FRONTIER_DRYLAND_LOCATIONS.quarry,row.westActorId],
      [row.west,'plateau-thunderridge','western-saltwell','rift_salt','gather_salt',FRONTIER_DRYLAND_LOCATIONS.saltbed,row.ridgeActorId],
    ] as const){
      if(cargo?.from!==source||cargo.good!==good)continue;
      const span=exactCargoDates(row,cargo,through);if(!span)continue;
      for(const lot of cargo.lots){
        const batch=batches.get(lot.batchId);
        const claim=batch&&receipts.get(frontierDrylandReceiptId(batch.tick,move,batch.actorId));
        if(!batch||batch.regionId!==source||batch.good!==good||batch.siteId!==site||!claim||claim.move!==move||claim.actorId!==batch.actorId||
          claim.regionId!==source||claim.siteId!==site||claim.batchId!==batch.id||batch.id!==frontierDrylandBatchId(claim.id)||
          claim.tick!==batch.tick||!validDate(world,claim.tick,claim.year,claim.month)||
          !finiteInt(batch.tick,1,span.loadedTick-1)||!finiteInt(lot.amount,1,batch.amount))continue;
        imports.push({...span,harvestedTick:batch.tick,recordId:row.id,actorId:recipient,batchId:lot.batchId,
          good,region:side,amount:lot.amount,proof:{lane:'dryland',row}});
      }
    }
  }
  for(const row of state.receipts){
    if(!row.spent?.length||!finiteInt(row.tick,1,through))continue;
    for(const piece of row.spent){
      const batch=batches.get(piece.batchId);if(!batch||!finiteInt(piece.amount,1))continue;
      const market=row.regionId==='western-saltwell'&&batch.good==='stormstone'?{region:'western-saltwell' as const,good:'stormstone' as const}:
        row.regionId==='plateau-thunderridge'&&batch.good==='rift_salt'?{region:'plateau-thunderridge' as const,good:'rift_salt' as const}:undefined;
      if(!market)continue;
      let consequence:Use['consequence'];
      if(receipts.get(row.id)===row&&row.id===frontierDrylandReceiptId(row.tick,row.move,row.actorId)&&row.spent.length===1&&piece.amount===1&&
        validDate(world,row.tick,row.year,row.month)&&historicallyHere(history,row.actorId,row.regionId,row.siteId,row.tick)){
        const layer=row.layer;
        if(market.good==='stormstone'&&row.move==='attempt_layer'&&row.siteId===FRONTIER_DRYLAND_LOCATIONS.trial&&
          row.waterDelta===-FRONTIER_DRYLAND_COSTS.layerWater&&layer&&finiteInt(layer.beforeQi,FRONTIER_DRYLAND_COSTS.layerQi,100)&&
          finiteInt(layer.fromStage,1,8)&&((layer.result==='advanced'&&layer.toStage===layer.fromStage+1&&layer.afterQi===0)||
            (layer.result==='backlash'&&layer.toStage===layer.fromStage&&layer.afterQi===45))&&
          layer.nativeEventId===`evt-${row.tick}-${row.actorId}-${layer.result==='advanced'?'break':'fail'}`){
          consequence={kind:'west_layer',result:{kind:layer.result==='advanced'?'layer_advanced':'layer_backlash',
            realm:layer.realm,fromStage:layer.fromStage,toStage:layer.toStage}};
        }else if(market.good==='rift_salt'&&row.move==='feed_herd'&&row.feed==='salt'&&row.siteId===FRONTIER_DRYLAND_LOCATIONS.pasture){
          consequence={kind:'ridge_feeding',result:{kind:'herd_fed'}};
        }
      }
      uses.push({...market,receiptId:row.id,tick:row.tick,actorId:row.actorId,batchId:piece.batchId,amount:piece.amount,consequence});
    }
  }
}
type InventoryEvent={type:'credit';tick:number;entry:Import}|{type:'debit';tick:number;entry:Use};
/**
 * Reconstruct outstanding units from true dated receipts. Local mouths and winter prep also deplete the batch.
 * The native ledger pools identical batch IDs: if several live deliveries contributed to one pooled stack,
 * no particular delivery may be claimed until the ambiguity has been completely drained.
 */
export function projectFrontierSupplyLinks(world:WorldState,viewer?:Cultivator,options:{asOfTick?:number;limit?:number}={}):FrontierSupplyLink[]{
  if(!viewer||!viewer.alive||viewer.hp<=0||!world.cultivators.includes(viewer))return [];
  const through=options.asOfTick??world.tick,limit=options.limit??4;
  if(!finiteInt(through,1,world.tick)||!finiteInt(limit,1))return [];
  const frontier=world.frontier;
  if(!frontier?.trade&&!frontier?.drylands?.trade)return [];
  const history=sourceHistory(world),imports:Import[]=[],uses:Use[]=[];
  collectFarm(world,history,through,imports,uses);collectDryland(world,history,through,imports,uses);
  const relevant=new Set(uses.filter(use=>use.actorId===viewer.id&&use.consequence).map(use=>sourceKey(use.region,use.good,use.batchId)));
  if(!relevant.size)return [];
  const grouped=new Map<string,InventoryEvent[]>();
  const append=(region:Region,good:Good,id:string,event:InventoryEvent)=>{
    const key=sourceKey(region,good,id);if(!relevant.has(key))return;
    const rows=grouped.get(key)??[];rows.push(event);grouped.set(key,rows);
  };
  for(const row of imports)append(row.region,row.good,row.batchId,{type:'credit',tick:row.deliveredTick,entry:row});
  for(const row of uses)append(row.region,row.good,row.batchId,{type:'debit',tick:row.tick,entry:row});
  const verified=new Map<FrontierTradeAgreement|FrontierDrylandTradeAgreement,boolean>();
  function actual(proof:Proof){
    if(!verified.has(proof.row))verified.set(proof.row,proof.lane==='farm'?verifyFrontierTradeAgreement(world,proof.row):
      verifyFrontierDrylandTradeAgreement(world,proof.row));
    return verified.get(proof.row)===true;
  }
  type Claim={key:string;link:FrontierSupplyLink};
  const claims:Claim[]=[];
  for(const rows of grouped.values()){
    // Local work happens before that same month's automatic cargo settlement.
    rows.sort((a,b)=>a.tick-b.tick||(a.type===b.type?0:a.type==='debit'?-1:1));
    let usesBalance=0,source:Import|undefined,pooled=false,underflow=false;
    for(const event of rows){
      if(event.type==='credit'){
        const row=event.entry;
        if(!usesBalance){source=row;pooled=false;}
        else if(row!==source)pooled=true;
        usesBalance+=row.amount;continue;
      }
      const row=event.entry;
      if(row.amount>usesBalance){usesBalance=0;source=undefined;pooled=false;underflow=true;continue;}
      if(!underflow&&!pooled&&source&&source.actorId===viewer.id&&row.actorId===viewer.id&&row.consequence&&row.amount===1&&
        source.deliveredTick<row.tick&&actual(source.proof)){
        const {recordId,harvestedTick,loadedTick,arrivedTick,deliveredTick,good}=source,{kind,result}=row.consequence;
        claims.push({key:JSON.stringify([creditKey(source.proof.lane,recordId),kind]),link:{
          id:JSON.stringify([source.proof.lane,recordId,row.receiptId]),kind,good,quantity:1,result,
          harvestedTick,loadedTick,arrivedTick,deliveredTick,usedTick:row.tick,
        }});
      }
      usesBalance-=row.amount;
      if(!usesBalance){source=undefined;pooled=false;}
    }
  }
  const taken=new Set<string>(),first:FrontierSupplyLink[]=[];
  for(const item of claims.sort((a,b)=>a.link.usedTick-b.link.usedTick||ascii(a.link.id,b.link.id))){
    if(!taken.has(item.key)){first.push(item.link);taken.add(item.key);}
  }
  return first.reverse().slice(0,Math.min(12,limit));
}

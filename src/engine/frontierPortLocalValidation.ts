import type {ResourceFlowEntry,WorldState} from '../types/world';
import {FRONTIER_SITE_IDS,type FrontierVisit} from './frontierTerms';
import {FRONTIER_PORT_COMMISSION_ROOTS,FRONTIER_PORT_COMMISSION_STONES,FRONTIER_PORT_GATHER_HP,
  FRONTIER_PORT_GOODS,FRONTIER_PORT_HULL_INITIAL,FRONTIER_PORT_HULL_MAX,FRONTIER_PORT_LOCAL_MOVES,FRONTIER_PORT_PRACTICE_HP,
  FRONTIER_PORT_PRACTICE_QI,FRONTIER_PORT_REGION,FRONTIER_PORT_REPAIR_CONDITION,FRONTIER_PORT_REPAIR_ROOTS,FRONTIER_PORT_REPAIR_STONES,
  FRONTIER_PORT_SALT_YIELD,FRONTIER_PORT_STOCK_MAX,frontierPortBatchId,frontierPortHullId,frontierPortLocalReceiptId,frontierPortTide,
  type FrontierPortBatch,type FrontierPortBatchSlice,type FrontierPortCustody,type FrontierPortGood,type FrontierPortHull} from './frontierPortTerms';

type Fail=(path:string)=>never;
type Row=Record<string,unknown>;
const dock='frontier-east-dock',boatyard='frontier-east-boatyard',flat='frontier-east-tideflat',warehouse='frontier-east-warehouse';
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const int=(value:unknown,min=0,max=100_000_000):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\u0000-\u001f\u007f]/u.test(value);
const exact=(value:Row,fields:readonly string[],optional:readonly string[]=[])=>
  fields.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>fields.includes(key)||optional.includes(key));
const one=(value:unknown,values:readonly string[])=>typeof value==='string'&&values.includes(value);
const rowList=(value:unknown,shape:(value:unknown)=>boolean,max=128_000)=>
  Array.isArray(value)&&value.length<=max&&value.every((row:unknown)=>shape(row));
const sliceShape=(row:unknown)=>object(row)&&exact(row,['batchId','amount'])&&id(row.batchId)&&int(row.amount,1,FRONTIER_PORT_SALT_YIELD);
const sliceList=(value:unknown)=>rowList(value,sliceShape,FRONTIER_PORT_STOCK_MAX)&&Array.isArray(value)&&value.length>=1;
const hullShape=(row:unknown)=>object(row)&&exact(row,['id','builderId','createdTick','condition'])&&id(row.id)&&id(row.builderId)&&
  int(row.createdTick,1)&&int(row.condition,1,FRONTIER_PORT_HULL_MAX);
/** Trade is an independently validated nested domain; no other local keys may enter. */
export function validateFrontierPortLocalShape(value:unknown,path:string,fail:Fail):void {
  if(!object(value)||!exact(value,['version','batches','stock','receipts','riggingSpent'],['hull','trade'])||value.version!==1||
    Object.hasOwn(value,'hull')&&!hullShape(value.hull)||Object.hasOwn(value,'trade')&&!object(value.trade)||
    !rowList(value.batches,row=>object(row)&&exact(row,['id','good','amount','actorId','tick'])&&id(row.id)&&
      one(row.good,FRONTIER_PORT_GOODS)&&int(row.amount,1,FRONTIER_PORT_SALT_YIELD)&&id(row.actorId)&&int(row.tick,1))||
    !rowList(value.stock,sliceShape,FRONTIER_PORT_STOCK_MAX)||
    !rowList(value.riggingSpent,row=>object(row)&&exact(row,['refId','actorId','tick','slices'])&&id(row.refId)&&id(row.actorId)&&
      int(row.tick,1)&&sliceList(row.slices))||
    !rowList(value.receipts,row=>object(row)&&exact(row,['id','move','tick','year','month','actorId','siteId','stonesSpent','rootsSpent',
      'hpSpent','qiGained','hullDelta'],['batchId','rigging'])&&id(row.id)&&one(row.move,FRONTIER_PORT_LOCAL_MOVES)&&
      int(row.tick,1)&&int(row.year,1)&&int(row.month,1,12)&&id(row.actorId)&&one(row.siteId,FRONTIER_SITE_IDS)&&
      int(row.stonesSpent,0,FRONTIER_PORT_COMMISSION_STONES)&&int(row.rootsSpent,0,FRONTIER_PORT_COMMISSION_ROOTS)&&
      int(row.hpSpent,0,FRONTIER_PORT_PRACTICE_HP)&&int(row.hullDelta,0,FRONTIER_PORT_HULL_INITIAL)&&
      typeof row.qiGained==='number'&&Number.isFinite(row.qiGained)&&row.qiGained>=0&&row.qiGained<=FRONTIER_PORT_PRACTICE_QI&&
      (!Object.hasOwn(row,'batchId')||id(row.batchId))&&(!Object.hasOwn(row,'rigging')||sliceList(row.rigging))))return fail(path);
}

function placeAt(visits:readonly FrontierVisit[],tick:number){
  for(let i=visits.length-1;i>=0;i--){
    const visit=visits[i];
    if(visit.enteredTick>=tick||visit.regionId!==FRONTIER_PORT_REGION||
      (visit.exitedTick??Infinity)<=tick||(visit.deceasedTick??Infinity)<=tick)continue;
    for(let j=visit.steps.length-1;j>=0;j--){
      const step=visit.steps[j];
      if(step.tick===tick)return undefined;
      if(step.tick<tick)return step.siteId;
    }
  }
  return undefined;
}
const sameSlices=(a:readonly FrontierPortBatchSlice[],b:readonly FrontierPortBatchSlice[])=>
  a.length===b.length&&a.every((row,i)=>row.batchId===b[i].batchId&&row.amount===b[i].amount);
type PortFlowProof={
  tick:number;refId:string;reason:string;good:ResourceFlowEntry['good'];amount:number;actorId:string;kind:'consumption'|'production';
  account:'actor'|'frontier_store';
};
const flowKey=(row:Pick<PortFlowProof,'refId'|'reason'|'good'>)=>JSON.stringify([row.refId,row.reason,row.good]);
const localReason=/^frontier_port_(?:work_(?:output|root|stones)|practice_rigging|voyage_rigging)$/u;
const laborKey=(tick:number,id:string)=>JSON.stringify([tick,id]);

export function validateFrontierPortLocal(world:WorldState,custody:readonly FrontierPortCustody[],fail:Fail):void{
  const port=world.frontier?.port;
  if(!port){
    if(custody.length||world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='frontier'&&localReason.test(row.reason))))
      return fail('frontier.port.local.missing');
    return;
  }
  if(!port.receipts.length&&!port.trade?.agreements.length)return fail('frontier.port.local.empty');
  const actors=new Set(world.cultivators.map(row=>row.id));
  const residents=new Map(world.frontier?.residences.map(row=>[row.actorId,row]));
  const visits=new Map<string,FrontierVisit[]>();
  for(const row of world.frontier?.visits??[]){
    const list=visits.get(row.actorId);
    if(list)list.push(row);else visits.set(row.actorId,[row]);
  }
  const localPlace=(actorId:string,tick:number)=>{
    const house=residents.get(actorId);
    return actors.has(actorId)&&house?.regionId===FRONTIER_PORT_REGION&&house.settledTick<tick?placeAt(visits.get(actorId)??[],tick):undefined;
  };
  const batches=new Map<string,FrontierPortBatch>(),works=new Set<string>(),gathered=new Set<number>();
  const flows=new Map<string,PortFlowProof>(),riggingByVoyage=new Map<string,FrontierPortCustody>();
  const movements=new Map<number,Map<string,number>>();
  const expectFlow=(row:PortFlowProof)=>{
    const key=flowKey(row);
    if(flows.has(key))return fail('frontier.port.local.ledger.duplicate');
    flows.set(key,row);
  };
  function material(tick:number,batchId:string,amount:number){
    const rows=movements.get(tick)??new Map<string,number>();
    rows.set(batchId,(rows.get(batchId)??0)+amount);movements.set(tick,rows);
  }
  function takeSlices(slices:readonly FrontierPortBatchSlice[],good:FrontierPortGood,tick:number,amount:number){
    const seen=new Set<string>();
    if(slices.reduce((total,row)=>total+row.amount,0)!==amount)return fail('frontier.port.local.slice.amount');
    for(const row of slices){
      const batch=batches.get(row.batchId);
      if(!batch||batch.good!==good||batch.tick>tick||seen.has(row.batchId)||!int(row.amount,1,batch.amount))
        return fail('frontier.port.local.slice');
      seen.add(row.batchId);material(tick,row.batchId,-row.amount);
    }
  }
  const ordered=[...custody].sort((a,b)=>a.loadedTick-b.loadedTick);
  const wear=new Map<number,FrontierPortCustody>();
  let previousVoyage=0;
  for(const [index,lane] of ordered.entries()){
    const {loadedTick,closedTick,departedTick,returnedTick}=lane;
    if(!port.hull||lane.hullId!==port.hull.id||!int(loadedTick,port.hull.createdTick+1,world.tick)||loadedTick<previousVoyage||
      (closedTick===undefined&&index!==ordered.length-1)||closedTick!==undefined&&!int(closedTick,loadedTick+1,world.tick)||
      departedTick!==undefined&&(!int(departedTick,loadedTick+1,closedTick??world.tick)||wear.has(departedTick))||
      returnedTick!==undefined&&(closedTick===undefined||!int(returnedTick,Math.max(loadedTick+1,closedTick),world.tick))||
      !id(lane.agreementId)||!id(lane.riggingRefId)||riggingByVoyage.has(lane.riggingRefId))return fail('frontier.port.local.custody');
    previousVoyage=closedTick??world.tick;
    if(departedTick!==undefined)wear.set(departedTick,lane);
    riggingByVoyage.set(lane.riggingRefId,lane);
  }
  const now=world.year*12+world.month-1;
  let previous=0,hull:FrontierPortHull|undefined,wearCursor=0,walked=0;
  const wearTicks=[...wear.keys()].sort((a,b)=>a-b);
  function applyWear(until:number){
    while(wearCursor<wearTicks.length&&wearTicks[wearCursor]<=until){
      const lane=wear.get(wearTicks[wearCursor++]);
      if(!lane||!hull||lane.hullId!==hull.id||hull.condition<2)return fail('frontier.port.local.wear');
      hull.condition--;
    }
  }
  const readyHull=(tick:number)=>{
    while(ordered[walked]?.closedTick!==undefined&&ordered[walked].closedTick!<=tick)walked++;
    // A loan or load occurs during its own month's action; another resident may have
    // legitimately worked *before* that exclusive reservation in the same month.
    return !!hull&&!(ordered[walked]&&ordered[walked].loadedTick<tick);
  };
  for(const row of port.receipts){
    const {id,tick,year,month,actorId,siteId,move}=row,currentPlace=localPlace(actorId,tick);
    const key=laborKey(tick,actorId);
    if(tick<previous||tick>world.tick||currentPlace!==siteId||works.has(key)||
      now-(year*12+month-1)!==world.tick-tick||id!==frontierPortLocalReceiptId(tick,move,actorId))
      return fail('frontier.port.local.receipt');
    previous=tick;works.add(key);applyWear(tick);
    let stones=0,roots=0,hp=0,hullDelta=0,batchId:string|undefined;
    if(move==='commission'){
      if(hull||siteId!==boatyard)return fail('frontier.port.local.hull');
      stones=FRONTIER_PORT_COMMISSION_STONES;roots=FRONTIER_PORT_COMMISSION_ROOTS;hullDelta=FRONTIER_PORT_HULL_INITIAL;
      hull={id:frontierPortHullId(tick,actorId),builderId:actorId,createdTick:tick,condition:hullDelta};
    }else if(move==='repair'){
      if(!hull||!readyHull(tick)||siteId!==boatyard||hull.condition>=FRONTIER_PORT_HULL_MAX)return fail('frontier.port.local.repair');
      stones=FRONTIER_PORT_REPAIR_STONES;roots=FRONTIER_PORT_REPAIR_ROOTS;
      hullDelta=Math.min(FRONTIER_PORT_HULL_MAX-hull.condition,FRONTIER_PORT_REPAIR_CONDITION);hull.condition+=hullDelta;
    }else if(move==='practice'){
      if((siteId!==dock&&siteId!==boatyard)||!readyHull(tick)||frontierPortTide(month)!=='open'||
        !row.rigging||row.qiGained<=0||row.qiGained>FRONTIER_PORT_PRACTICE_QI)return fail('frontier.port.local.practice');
      hp=FRONTIER_PORT_PRACTICE_HP;
      takeSlices(row.rigging,'port_rigging',tick,1);
      expectFlow({tick,refId:id,reason:'frontier_port_practice_rigging',good:'port_rigging',amount:1,actorId,kind:'consumption',account:'frontier_store'});
    }else{
      if(move==='gather'?(siteId!==flat||frontierPortTide(month)!=='open'||gathered.has(tick)):siteId!==boatyard)
        return fail('frontier.port.local.tide');
      if(move==='gather')gathered.add(tick);
      const good=move==='gather'?'reef_salt':'port_rigging',amount=move==='gather'?FRONTIER_PORT_SALT_YIELD:1;
      roots=1;hp=move==='gather'?FRONTIER_PORT_GATHER_HP:0;batchId=frontierPortBatchId(id);
      batches.set(batchId,{id:batchId,good,amount,actorId,tick});material(tick,batchId,amount);
      expectFlow({tick,refId:batchId,reason:'frontier_port_work_output',good,amount,actorId,kind:'production',account:'frontier_store'});
    }
    if(row.stonesSpent!==stones||row.rootsSpent!==roots||row.hpSpent!==hp||row.hullDelta!==hullDelta||row.batchId!==batchId||
      move!=='practice'&&(row.qiGained!==0||row.rigging!==undefined))return fail('frontier.port.local.cost');
    if(stones)expectFlow({tick,refId:id,reason:'frontier_port_work_stones',good:'stone',amount:stones,actorId,kind:'consumption',account:'actor'});
    if(roots)expectFlow({tick,refId:id,reason:'frontier_port_work_root',good:'earth_root',amount:roots,actorId,kind:'consumption',account:'actor'});
  }
  applyWear(world.tick);
  if(!!hull!==!!port.hull||hull&&port.hull&&(hull.id!==port.hull.id||hull.builderId!==port.hull.builderId||
    hull.createdTick!==port.hull.createdTick||hull.condition!==port.hull.condition))return fail('frontier.port.local.hull.replay');
  const originals=[...batches.values()];
  if(port.batches.length!==batches.size||port.batches.some((row,index)=>{
    const batch=originals[index];
    return !batch||row.id!==batch.id||row.good!==batch.good||row.amount!==batch.amount||row.actorId!==batch.actorId||row.tick!==batch.tick;
  }))return fail('frontier.port.local.batch');

  for(const lane of ordered){
    takeSlices(lane.saltSlices,'reef_salt',lane.loadedTick,FRONTIER_PORT_SALT_YIELD);
    if(lane.returnedTick!==undefined)for(const row of lane.saltSlices)material(lane.returnedTick,row.batchId,row.amount);
  }
  let lastRigging=0;
  for(const row of port.riggingSpent){
    const lane=riggingByVoyage.get(row.refId),site=localPlace(row.actorId,row.tick),key=laborKey(row.tick,row.actorId);
    if(row.tick<lastRigging||!lane||lane.loadedTick!==row.tick||lane.actorId!==row.actorId||
      !sameSlices(lane.riggingSlices,row.slices)||works.has(key)||(site!==dock&&site!==warehouse))return fail('frontier.port.local.rigging.escrow');
    lastRigging=row.tick;works.add(key);riggingByVoyage.delete(row.refId);
    takeSlices(row.slices,'port_rigging',row.tick,1);
    expectFlow({tick:row.tick,refId:row.refId,reason:'frontier_port_voyage_rigging',good:'port_rigging',amount:1,
      actorId:row.actorId,kind:'consumption',account:'frontier_store'});
  }
  if(riggingByVoyage.size)return fail('frontier.port.local.rigging.missing');
  const inventory=new Map<string,number>();
  let total=0;
  for(const [,rows] of [...movements].sort(([a],[b])=>a-b)){
    for(const [id,delta] of rows){
      const amount=(inventory.get(id)??0)+delta;
      if(amount<0||amount>(batches.get(id)?.amount??0))return fail('frontier.port.local.stock.negative');
      total+=delta;if(amount===0)inventory.delete(id);else inventory.set(id,amount);
    }
    if(total>FRONTIER_PORT_STOCK_MAX)return fail('frontier.port.local.stock.capacity');
  }
  if(port.stock.length!==inventory.size||new Set(port.stock.map(row=>row.batchId)).size!==port.stock.length||
    port.stock.some(row=>inventory.get(row.batchId)!==row.amount))return fail('frontier.port.local.stock.replay');

  const seen=new Set<string>(),complete=new Set(world.resourceFlow.months.filter(month=>month.entries.length===month.totalEntries).map(month=>month.tick));
  for(const month of world.resourceFlow.months)for(const row of month.entries){
    if(row.mechanism!=='frontier'||!localReason.test(row.reason))continue;
    const key=flowKey(row),proof=flows.get(key);
    const account=row.kind==='consumption'?row.from:row.kind==='production'?row.to:undefined;
    if(!proof||seen.has(key)||!account||row.kind!==proof.kind||row.tick!==proof.tick||row.amount!==proof.amount||
      account.kind!==proof.account||account.id!==(proof.account==='actor'?proof.actorId:FRONTIER_PORT_REGION)||
      row.visibility.kind!=='participants'||row.visibility.actorIds.length!==1||row.visibility.actorIds[0]!==proof.actorId)
      return fail('frontier.port.local.flow');
    seen.add(key);
  }
  for(const [key,row] of flows)if(complete.has(row.tick)&&!seen.has(key))return fail('frontier.port.local.flow.missing');
}

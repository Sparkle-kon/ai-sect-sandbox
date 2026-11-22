import {REALM_ORDER} from '../data/initialWorld';
import type {ResourceFlowEntry,WorldState} from '../types/world';
import {FRONTIER_SITE_IDS,type FrontierVisit} from './frontierTerms';
import {FRONTIER_DRYLAND_COSTS as C,FRONTIER_DRYLAND_LOCATIONS as P,FRONTIER_DRYLAND_GOODS,FRONTIER_DRYLAND_MOVES,
  frontierDrylandBatchId,frontierDrylandChargedWard,frontierDrylandReceiptId,frontierDrylandStore,frontierDrylandWellInflow,
  frontierDrylandWorkingHerd,isFrontierDrylandHarshMonth,isFrontierDrylandRegion,
  type DrylandBatchSlice,type FrontierDrylandBatch,type FrontierDrylandCustody,type FrontierDrylandGood,
  type FrontierDrylandHerd,type FrontierDrylandRegion,type FrontierDrylandWard,type FrontierDrylandWell} from './frontierDrylandTerms';

type Fail=(path:string)=>never;
type Row=Record<string,unknown>;
const west='western-saltwell',ridge='plateau-thunderridge';
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const int=(value:unknown,min=0,max=100_000_000):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const variable=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\u0000-\u001f\u007f]/u.test(value);
const one=(value:unknown,values:readonly string[])=>typeof value==='string'&&values.includes(value);
const exact=(value:Row,required:readonly string[],optional:readonly string[]=[])=>
  required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const rowList=(value:unknown,check:(row:unknown)=>boolean,max=128_000)=>
  Array.isArray(value)&&value.length<=max&&value.every((row:unknown)=>check(row));
const optional=(row:Row,name:string,check:(value:unknown)=>boolean)=>!Object.hasOwn(row,name)||check(row[name]);
const region=isFrontierDrylandRegion;
const site=(value:unknown)=>one(value,FRONTIER_SITE_IDS);
const good=(value:unknown)=>one(value,FRONTIER_DRYLAND_GOODS);
const slice=(row:unknown)=>object(row)&&exact(row,['batchId','amount'])&&id(row.batchId)&&int(row.amount,1,C.batchYield);
const sliceList=(value:unknown)=>rowList(value,slice,C.stockCapacity)&&Array.isArray(value)&&value.length>0;
const wellShape=(value:unknown)=>object(value)&&exact(value,['actorId','openedTick','readyTick','water'])&&id(value.actorId)&&
  int(value.openedTick,1)&&int(value.readyTick,1)&&int(value.water,0,C.waterCapacity);
const herdShape=(value:unknown)=>object(value)&&exact(value,['actorId','startedTick','count','fedTick','expiresTick','work'])&&
  id(value.actorId)&&value.count===C.herdCount&&int(value.startedTick,1)&&int(value.fedTick,1)&&int(value.expiresTick,1)&&int(value.work,0,C.herdWork);
const wardShape=(value:unknown)=>object(value)&&exact(value,['chargedTick','expiresTick','charges'])&&
  int(value.chargedTick,1)&&int(value.expiresTick,1)&&int(value.charges,0,1);
const layerShape=(value:unknown)=>object(value)&&
  exact(value,['nativeEventId','realm','fromStage','toStage','beforeQi','afterQi','result'])&&id(value.nativeEventId)&&
  one(value.realm,REALM_ORDER)&&int(value.fromStage,1,8)&&int(value.toStage,1,9)&&variable(value.beforeQi,C.layerQi,100)&&
  variable(value.afterQi,0,100)&&one(value.result,['advanced','backlash']);
export function validateFrontierDrylandLocalShape(value:unknown,path:string,fail:Fail):void{
  if(!object(value)||!exact(value,['version','batches','stock','receipts'],['well','herd','ward','trade'])||value.version!==1||
    !optional(value,'well',wellShape)||!optional(value,'herd',herdShape)||!optional(value,'ward',wardShape)||!optional(value,'trade',object)||
    !rowList(value.batches,row=>object(row)&&exact(row,['id','good','regionId','siteId','actorId','tick','amount'])&&
      id(row.id)&&good(row.good)&&region(row.regionId)&&site(row.siteId)&&id(row.actorId)&&int(row.tick,1)&&row.amount===C.batchYield)||
    !rowList(value.stock,row=>object(row)&&exact(row,['batchId','regionId','amount'])&&
      id(row.batchId)&&region(row.regionId)&&int(row.amount,1,C.batchYield),C.stockCapacity*2)||
    !rowList(value.receipts,row=>object(row)&&exact(row,['id','move','actorId','regionId','siteId','tick','year','month',
      'stonesSpent','rootsSpent','hpSpent','waterDelta','workDelta','wardDelta'],['feed','batchId','spent','layer','refId'])&&
      id(row.id)&&one(row.move,[...FRONTIER_DRYLAND_MOVES,'haul'])&&id(row.actorId)&&region(row.regionId)&&site(row.siteId)&&
      int(row.tick,1)&&int(row.year,1)&&int(row.month,1,12)&&int(row.stonesSpent,0,C.wellStones)&&int(row.rootsSpent,0,C.wellRoots)&&
      int(row.hpSpent,0,C.gatherHp)&&int(row.waterDelta,-C.layerWater,3)&&int(row.workDelta,-1,C.herdWork)&&int(row.wardDelta,-1,1)&&
      optional(row,'feed',value=>one(value,['root','salt']))&&optional(row,'batchId',id)&&optional(row,'spent',sliceList)&&
      optional(row,'layer',layerShape)&&optional(row,'refId',id)))return fail(path);
}
type ExpectedFlow={
  tick:number;actorId:string;regionId:FrontierDrylandRegion;refId:string;reason:string;
  good:ResourceFlowEntry['good'];amount:number;kind:'production'|'consumption';account:'actor'|'frontier_store';
};
const flowKey=(row:Pick<ExpectedFlow,'reason'|'good'|'refId'>)=>JSON.stringify([row.reason,row.good,row.refId]);
const expectedReason=/^frontier_dryland_(?:stones|roots|water|material|yield)$/u;
const key=(...parts:Array<string|number>)=>JSON.stringify(parts);
const sameSimple=(a:Readonly<object>|undefined,b:Readonly<object>|undefined)=>{
  if(!a||!b)return a===b;
  const fields=Object.entries(a),other=b as Row;
  return fields.length===Object.keys(other).length&&fields.every(([field,value])=>Object.hasOwn(other,field)&&other[field]===value);
};
function placeAt(visits:readonly FrontierVisit[],tick:number,regionId:FrontierDrylandRegion){
  for(let i=visits.length-1;i>=0;i--){
    const visit=visits[i];
    if(visit.regionId!==regionId||visit.enteredTick>=tick||(visit.exitedTick??Infinity)<=tick||(visit.deceasedTick??Infinity)<=tick)continue;
    for(let j=visit.steps.length-1;j>=0;j--){
      const step=visit.steps[j];
      if(step.tick===tick)return undefined;
      if(step.tick<tick)return step.siteId;
    }
  }
  return undefined;
}

export function validateFrontierDrylandLocal(world:WorldState,custody:readonly FrontierDrylandCustody[],fail:Fail):void{
  const state=world.frontier?.drylands;
  if(!state){
    if(custody.length||world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='frontier'&&expectedReason.test(row.reason))))
      return fail('frontier.drylands.local.missing');
    return;
  }
  if(!state.receipts.length&&!state.trade?.agreements.length)return fail('frontier.drylands.local.empty');
  const actors=new Set(world.cultivators.map(row=>row.id));
  const residents=new Map(world.frontier?.residences.map(row=>[row.actorId,row]));
  const visitsByActor=new Map<string,FrontierVisit[]>();
  for(const row of world.frontier?.visits??[]){
    const rows=visitsByActor.get(row.actorId);
    if(rows)rows.push(row);else visitsByActor.set(row.actorId,[row]);
  }
  const place=(id:string,tick:number,regionId:FrontierDrylandRegion)=>{
    const residence=residents.get(id);
    return actors.has(id)&&residence?.regionId===regionId&&residence.settledTick<tick?
      placeAt(visitsByActor.get(id)??[],tick,regionId):undefined;
  };
  const receipts=new Set<string>(),labor=new Set<string>(),monthly=new Set<string>(),haul=new Map<string,FrontierDrylandCustody>();
  const batches=new Map<string,FrontierDrylandBatch>(),flows=new Map<string,ExpectedFlow>();
  const amounts=new Map<number,Map<FrontierDrylandRegion,Map<string,number>>>();
  const retained=new Map(world.events.filter(row=>row.id.startsWith('evt-frontier-dryland-')).map(row=>[row.id,row]));
  const expectFlow=(row:ExpectedFlow)=>{
    const identity=flowKey(row);
    if(flows.has(identity))return fail('frontier.drylands.local.ledger.duplicate');
    flows.set(identity,row);
  };
  function material(tick:number,regionId:FrontierDrylandRegion,batchId:string,delta:number){
    const frame=amounts.get(tick)??new Map<FrontierDrylandRegion,Map<string,number>>();
    const account=frame.get(regionId)??new Map<string,number>();
    account.set(batchId,(account.get(batchId)??0)+delta);frame.set(regionId,account);amounts.set(tick,frame);
  }
  function take(slices:readonly DrylandBatchSlice[],tick:number,regionId:FrontierDrylandRegion,good:FrontierDrylandGood,units:number){
    if(slices.reduce((sum,row)=>sum+row.amount,0)!==units)return fail('frontier.drylands.local.lot.amount');
    const unique=new Set<string>();
    for(const slice of slices){
      const batch=batches.get(slice.batchId);
      if(!batch||batch.tick>tick||batch.good!==good||!int(slice.amount,1,batch.amount)||unique.has(slice.batchId))
        return fail('frontier.drylands.local.lot');
      unique.add(slice.batchId);material(tick,regionId,batch.id,-slice.amount);
    }
  }
  for(const lane of custody){
    if(!id(lane.agreementId)||lane.refId!==`${lane.agreementId}-${lane.from}`||!region(lane.from)||
      !int(lane.loadedTick,1,world.tick)||haul.has(lane.refId)||(lane.to===undefined)!==(lane.landedTick===undefined)||
      lane.to!==undefined&&(!region(lane.to)||!int(lane.landedTick,lane.loadedTick+1,world.tick)))
      return fail('frontier.drylands.local.custody');
    haul.set(lane.refId,lane);
  }
  let well:FrontierDrylandWell|undefined,herd:FrontierDrylandHerd|undefined,ward:FrontierDrylandWard|undefined,previous=0;
  const now=world.year*12+world.month-1;
  const ready=(tick:number)=>well&&tick>=well.readyTick?well.water:0;
  const enough=(tick:number,n:number)=>ready(tick)>=n+C.waterReserve;
  for(const row of state.receipts){
    const {id,tick,year,month,actorId,regionId,siteId,move}=row;
    const activeWork=key(tick,actorId),recentSlot=key(tick,move,siteId);
    const event=retained.get(`evt-${id}`);
    if(tick<previous||tick>world.tick||now-(year*12+month-1)!==world.tick-tick||place(actorId,tick,regionId)!==siteId||
      id!==frontierDrylandReceiptId(tick,move,actorId)||receipts.has(id)||labor.has(activeWork)||
      event&&(event.tick!==tick||event.year!==year||event.month!==month||event.locationId!==siteId||
        event.witnessScope!=='participants'||event.actorIds.length!==1||event.actorIds[0]!==actorId||
        event.category!==(move==='attempt_layer'?'breakthrough':'diplomacy')))
      return fail('frontier.drylands.local.receipt');
    if((move==='draw_water'||move==='gather_salt'||move==='quarry_stone'||move==='feed_herd')&&monthly.has(recentSlot))
      return fail('frontier.drylands.local.site');
    previous=tick;receipts.add(id);labor.add(activeWork);monthly.add(recentSlot);
    let stones=0,roots=0,hp=0,water=0,work=0,wardDelta=0,expectedGood:FrontierDrylandGood|undefined,batchId:string|undefined;
    switch(move){
      case 'open_well':
        if(regionId!==west||siteId!==P.well||well)return fail('frontier.drylands.local.well');
        stones=C.wellStones;roots=C.wellRoots;well={actorId,openedTick:tick,readyTick:tick+1,water:0};break;
      case 'draw_water':
        if(regionId!==west||siteId!==P.well||!well||tick<well.readyTick||well.water>=C.waterCapacity)return fail('frontier.drylands.local.water');
        water=Math.min(frontierDrylandWellInflow(month),C.waterCapacity-well.water);break;
      case 'gather_salt':
        if(regionId!==west||siteId!==P.saltbed||!enough(tick,C.saltWater))return fail('frontier.drylands.local.salt');
        hp=C.gatherHp;water=-C.saltWater;batchId=frontierDrylandBatchId(id);break;
      case 'attempt_layer':{
        const proof=row.layer;
        if(regionId!==west||siteId!==P.trial||!enough(tick,C.layerWater)||!proof||
          proof.beforeQi<C.layerQi||proof.nativeEventId!==`evt-${tick}-${actorId}-${proof.result==='advanced'?'break':'fail'}`||
          (proof.result==='advanced'?proof.toStage!==proof.fromStage+1||proof.afterQi!==0:
            proof.toStage!==proof.fromStage||proof.afterQi!==45))return fail('frontier.drylands.local.layer');
        expectedGood='stormstone';water=-C.layerWater;break;
      }
      case 'tend_herd':
        if(regionId!==ridge||siteId!==P.pasture||herd)return fail('frontier.drylands.local.herd');
        stones=C.herdStones;roots=C.herdRoots;work=C.herdWork;
        herd={actorId,startedTick:tick,count:C.herdCount,fedTick:tick,expiresTick:tick+C.herdMonths,work:C.herdWork};break;
      case 'feed_herd':{
        const held=frontierDrylandWorkingHerd(herd,tick);
        if(regionId!==ridge||siteId!==P.pasture||!herd||held>=C.herdWork||!row.feed)return fail('frontier.drylands.local.feed');
        if(row.feed==='root')roots=1;else expectedGood='rift_salt';
        work=C.herdWork-held;herd={...herd,fedTick:tick,expiresTick:tick+C.herdMonths,work:C.herdWork};break;
      }
      case 'quarry_stone':
        if(regionId!==ridge||siteId!==P.quarry||!herd||frontierDrylandWorkingHerd(herd,tick)<C.quarryWork)
          return fail('frontier.drylands.local.quarry');
        if(isFrontierDrylandHarshMonth(month)){
          if(!ward||frontierDrylandChargedWard(ward,tick)!==1)return fail('frontier.drylands.local.thunder');
          wardDelta=-1;ward.charges=0;
        }
        work=-C.quarryWork;hp=C.gatherHp;herd.work+=work;batchId=frontierDrylandBatchId(id);break;
      case 'charge_ward':
        if(regionId!==ridge||siteId!==P.ward||frontierDrylandChargedWard(ward,tick)!==0)return fail('frontier.drylands.local.ward');
        roots=C.wardRoots;wardDelta=1;expectedGood='stormstone';ward={chargedTick:tick,expiresTick:tick+C.wardMonths,charges:1};break;
      case 'haul':{
        const lane=row.refId&&haul.get(row.refId);
        if(!lane||lane.actorId!==actorId||lane.loadedTick!==tick||lane.from!==regionId||siteId!==frontierDrylandStore(regionId))
          return fail('frontier.drylands.local.haul');
        if(regionId===west){
          if(!enough(tick,C.haulWater))return fail('frontier.drylands.local.haul.water');
          water=-C.haulWater;
        }else{
          if(!herd||frontierDrylandWorkingHerd(herd,tick)<C.haulWork)return fail('frontier.drylands.local.haul.herd');
          work=-C.haulWork;herd.work+=work;
        }
        haul.delete(lane.refId);break;
      }
    }
    if(row.stonesSpent!==stones||row.rootsSpent!==roots||row.hpSpent!==hp||row.waterDelta!==water||row.workDelta!==work||
      row.wardDelta!==wardDelta||row.batchId!==batchId||(row.spent!==undefined)!==(expectedGood!==undefined)||
      (row.feed!==undefined)!==(move==='feed_herd')||(row.layer!==undefined)!==(move==='attempt_layer')||
      (row.refId!==undefined)!==(move==='haul'))return fail('frontier.drylands.local.cost');
    const resource={tick,actorId,regionId,refId:row.refId??id};
    if(stones)expectFlow({...resource,reason:'frontier_dryland_stones',good:'stone',amount:stones,kind:'consumption',account:'actor'});
    if(roots)expectFlow({...resource,reason:'frontier_dryland_roots',good:'earth_root',amount:roots,kind:'consumption',account:'actor'});
    if(water){
      if(!well)return fail('frontier.drylands.local.water.missing');
      well.water+=water;
      expectFlow({...resource,regionId:west,reason:'frontier_dryland_water',good:'frontier_water',amount:Math.abs(water),
        kind:water>0?'production':'consumption',account:'frontier_store'});
    }
    if(expectedGood&&row.spent){
      take(row.spent,tick,regionId,expectedGood,1);
      expectFlow({...resource,reason:'frontier_dryland_material',good:expectedGood,amount:1,kind:'consumption',account:'frontier_store'});
    }
    if(batchId){
      const produced=regionId===west?'rift_salt':'stormstone';
      batches.set(batchId,{id:batchId,good:produced,regionId,siteId,actorId,tick,amount:C.batchYield});
      material(tick,regionId,batchId,C.batchYield);
      expectFlow({...resource,refId:batchId,reason:'frontier_dryland_yield',good:produced,amount:C.batchYield,kind:'production',account:'frontier_store'});
    }
  }
  if(haul.size)return fail('frontier.drylands.local.haul.missing');
  if(!sameSimple(well,state.well)||!sameSimple(herd,state.herd)||!sameSimple(ward,state.ward))
    return fail('frontier.drylands.local.replay');
  const produced=[...batches.values()];
  if(produced.length!==state.batches.length||state.batches.some((row,index)=>!sameSimple(row,produced[index])))
    return fail('frontier.drylands.local.batch');
  for(const lane of custody){
    take(lane.slices,lane.loadedTick,lane.from,lane.from===west?'rift_salt':'stormstone',C.batchYield);
    if(lane.to&&lane.landedTick)for(const slice of lane.slices)material(lane.landedTick,lane.to,slice.batchId,slice.amount);
  }
  const stock=new Map<FrontierDrylandRegion,Map<string,number>>([[west,new Map()],[ridge,new Map()]]);
  const totals:Record<FrontierDrylandRegion,number>={[west]:0,[ridge]:0};
  for(const [,frame] of [...amounts].sort(([a],[b])=>a-b)){
    for(const [regionId,delta] of frame){
      const local=stock.get(regionId)!;
      for(const [batchId,change] of delta){
        const value=(local.get(batchId)??0)+change;
        if(value<0||value>(batches.get(batchId)?.amount??0))return fail('frontier.drylands.local.stock.negative');
        if(value===0)local.delete(batchId);else local.set(batchId,value);
        totals[regionId]+=change;
      }
      if(totals[regionId]>C.stockCapacity)return fail('frontier.drylands.local.stock.capacity');
    }
  }
  const stockRows=stock.get(west)!.size+stock.get(ridge)!.size;
  if(state.stock.length!==stockRows||new Set(state.stock.map(row=>key(row.regionId,row.batchId))).size!==state.stock.length||
    state.stock.some(row=>stock.get(row.regionId)?.get(row.batchId)!==row.amount))
    return fail('frontier.drylands.local.stock');
  const complete=new Set(world.resourceFlow.months.filter(month=>month.entries.length===month.totalEntries).map(month=>month.tick));
  const seen=new Set<string>();
  for(const month of world.resourceFlow.months)for(const row of month.entries){
    if(row.mechanism!=='frontier'||!expectedReason.test(row.reason))continue;
    const id=flowKey(row),proof=flows.get(id);
    const account=row.kind==='production'?row.to:row.kind==='consumption'?row.from:undefined;
    if(!proof||seen.has(id)||!account||row.kind!==proof.kind||row.tick!==proof.tick||row.amount!==proof.amount||
      account.kind!==proof.account||account.id!==(proof.account==='actor'?proof.actorId:proof.regionId)||
      row.visibility.kind!=='participants'||row.visibility.actorIds.length!==1||row.visibility.actorIds[0]!==proof.actorId)
      return fail('frontier.drylands.local.flow');
    seen.add(id);
  }
  for(const [id,row] of flows)if(complete.has(row.tick)&&!seen.has(id))return fail('frontier.drylands.local.flow.missing');
}

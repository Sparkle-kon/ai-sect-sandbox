import type {Cultivator,LLMDecisionPayload,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {ensureFrontierState,frontierActedOnGeography,frontierPhysicalSite,frontierResidence} from './frontierMovementEngine';
import {frontierStepMonth,type FrontierSite} from './frontierTerms';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {FRONTIER_DRYLAND_COSTS as C,FRONTIER_DRYLAND_LOCATIONS as P,FRONTIER_DRYLAND_MOVES,
  frontierDrylandBatchId,frontierDrylandChargedWard,frontierDrylandReceiptId,frontierDrylandStore,frontierDrylandWellInflow,
  frontierDrylandWorkingHerd,isFrontierDrylandHarshMonth,isFrontierDrylandRegion,
  type DrylandBatchSlice,type FrontierDrylandGood,type FrontierDrylandLocalMove,type FrontierDrylandLocalOption,
  type FrontierDrylandLocalView,type FrontierDrylandReceipt,type FrontierDrylandRegion,type FrontierDrylandsState,
  type NativeSameRealmAttempt} from './frontierDrylandTerms';

const west='western-saltwell',ridge='plateau-thunderridge';
function last<T>(items:readonly T[]|undefined, predicate:(row:T)=>boolean):T|undefined{
  if(items)for(let i=items.length-1;i>=0;i--)if(predicate(items[i]))return items[i];
  return undefined;
}
export function ensureFrontierDrylandsState(world:WorldState):FrontierDrylandsState {
  const frontier=ensureFrontierState(world);
  return frontier.drylands??={version:1,batches:[],stock:[],receipts:[]};
}
export const flowDrylandStore=(id:FrontierDrylandRegion):ResourceFlowAccount=>({kind:'frontier_store',id});
const quantity=(state:FrontierDrylandsState|undefined,region:FrontierDrylandRegion)=>
  state?.stock.reduce((total,row)=>total+(row.regionId===region?row.amount:0),0)??0;
const batchAt=(state:FrontierDrylandsState,id:string)=>last(state.batches,row=>row.id===id);
export function drylandStock(world:WorldState,region:FrontierDrylandRegion,good:FrontierDrylandGood):number{
  const state=world.frontier?.drylands;
  return state?.stock.reduce((sum,row)=>sum+(row.regionId===region&&batchAt(state,row.batchId)?.good===good?row.amount:0),0)??0;
}
export function debitDrylandStock(world:WorldState,region:FrontierDrylandRegion,good:FrontierDrylandGood,amount:number):DrylandBatchSlice[]|undefined{
  const state=world.frontier?.drylands;
  if(!state||!isFrontierDrylandRegion(region)||!Number.isSafeInteger(amount)||amount<1||drylandStock(world,region,good)<amount)return undefined;
  const slices:DrylandBatchSlice[]=[];
  let remaining=amount;
  for(const item of state.stock){
    if(!remaining)break;
    if(item.regionId!==region||batchAt(state,item.batchId)?.good!==good)continue;
    const n=Math.min(item.amount,remaining);item.amount-=n;remaining-=n;slices.push({batchId:item.batchId,amount:n});
  }
  state.stock=state.stock.filter(row=>row.amount>0);
  return slices;
}
export function canCreditDrylandStock(world:WorldState,region:FrontierDrylandRegion,slices:readonly DrylandBatchSlice[]):boolean{
  const state=world.frontier?.drylands;
  if(!state||!isFrontierDrylandRegion(region)||!slices.length||slices.length>C.stockCapacity||
    new Set(slices.map(row=>row.batchId)).size!==slices.length)return false;
  if(quantity(state,region)+slices.reduce((sum,row)=>sum+row.amount,0)>C.stockCapacity)return false;
  return slices.every(row=>{
    const original=batchAt(state,row.batchId);
    const held=state.stock.reduce((total,item)=>total+(item.batchId===row.batchId?item.amount:0),0);
    return !!original&&Number.isSafeInteger(row.amount)&&row.amount>0&&held+row.amount<=original.amount;
  });
}
export function creditDrylandStock(world:WorldState,region:FrontierDrylandRegion,slices:readonly DrylandBatchSlice[]):boolean{
  const state=world.frontier?.drylands;
  if(!state||!canCreditDrylandStock(world,region,slices))return false;
  for(const row of slices){
    const item=state.stock.find(old=>old.regionId===region&&old.batchId===row.batchId);
    if(item)item.amount+=row.amount;else state.stock.push({...row,regionId:region});
  }
  return true;
}

function currentReceipt(state:FrontierDrylandsState|undefined,tick:number,filter:(row:FrontierDrylandReceipt)=>boolean):boolean{
  const rows=state?.receipts??[];
  for(let i=rows.length-1;i>=0&&rows[i].tick>=tick;i--)
    if(rows[i].tick===tick&&filter(rows[i]))return true;
  return false;
}
export function frontierDrylandLocalActed(world:WorldState,actorId:string,tick:number):boolean{
  return currentReceipt(world.frontier?.drylands,tick,row=>row.actorId===actorId);
}
function residentSite(world:WorldState,actor:Cultivator,tick:number):(FrontierSite&{regionId:FrontierDrylandRegion})|undefined{
  if(!actor.alive||actor.hp<=0||actor.age<18||actor.positionPlane!=='frontier'||!world.cultivators.includes(actor)||
    actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon'||
    actor.guardAssignment&&actor.guardAssignment.expiresTick>tick)return undefined;
  const site=frontierPhysicalSite(world,actor,tick),resident=frontierResidence(world,actor.id);
  if(!site||!isFrontierDrylandRegion(site.regionId)||resident?.regionId!==site.regionId||resident.settledTick>=tick)return undefined;
  return {...site,regionId:site.regionId};
}
const due=(world:WorldState,tick:number)=>tick===world.tick||tick===world.tick+1;
const money=(actor:Cultivator,stones:number,roots:number)=>Number.isSafeInteger(actor.spiritStones)&&actor.spiritStones>=stones&&
  Number.isSafeInteger(actor.herbs.earth_root)&&actor.herbs.earth_root>=roots;
const readyWater=(state:FrontierDrylandsState|undefined,tick:number)=>state?.well&&tick>=state.well.readyTick?state.well.water:0;
const canSpendWater=(state:FrontierDrylandsState|undefined,tick:number,units:number)=>readyWater(state,tick)>=units+C.waterReserve;
const capacityFor=(state:FrontierDrylandsState|undefined,region:FrontierDrylandRegion,units:number)=>
  quantity(state,region)+units<=C.stockCapacity;

function localAt(world:WorldState,actor:Cultivator,tick:number){
  return due(world,tick)&&!frontierActedOnGeography(world,actor.id,tick)&&!frontierDrylandLocalActed(world,actor.id,tick)?
    residentSite(world,actor,tick):undefined;
}
export function canPayDrylandHaul(world:WorldState,actor:Cultivator,region:FrontierDrylandRegion,executionTick=world.tick):boolean {
  const site=localAt(world,actor,executionTick),state=world.frontier?.drylands;
  return !!site&&site.regionId===region&&site.id===frontierDrylandStore(region)&&(region===west?
    canSpendWater(state,executionTick,C.haulWater):frontierDrylandWorkingHerd(state?.herd,executionTick)>=C.haulWork);
}
function newReceipt(world:WorldState,actor:Cultivator,site:FrontierSite&{regionId:FrontierDrylandRegion},move:FrontierDrylandReceipt['move']):FrontierDrylandReceipt{
  return {id:frontierDrylandReceiptId(world.tick,move,actor.id),move,actorId:actor.id,regionId:site.regionId,siteId:site.id,
    tick:world.tick,year:world.year,month:world.month,stonesSpent:0,rootsSpent:0,hpSpent:0,waterDelta:0,workDelta:0,wardDelta:0};
}
function paid(world:WorldState,actor:Cultivator,state:FrontierDrylandsState,row:FrontierDrylandReceipt){
  const visibility={kind:'participants' as const,actorIds:[actor.id]},refId=row.refId??row.id;
  actor.spiritStones-=row.stonesSpent;actor.herbs.earth_root-=row.rootsSpent;actor.hp-=row.hpSpent;
  if(row.stonesSpent)recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_dryland_stones',
    from:flowActor(actor.id),good:'stone',amount:row.stonesSpent,refId,visibility});
  if(row.rootsSpent)recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_dryland_roots',
    from:flowActor(actor.id),good:'earth_root',amount:row.rootsSpent,refId,visibility});
  if(row.waterDelta&&state.well){
    state.well.water+=row.waterDelta;
    const account=flowDrylandStore(west),data={mechanism:'frontier' as const,reason:'frontier_dryland_water',
      good:'frontier_water' as const,amount:Math.abs(row.waterDelta),refId,visibility};
    recordResourceFlow(world,row.waterDelta>0?{kind:'production',to:account,...data}:{kind:'consumption',from:account,...data});
  }
  state.receipts.push(row);
}

/** Freight enters this native checkpoint only after all controller, route, and original stock checks pass. */
export function payDrylandHaul(world:WorldState,actor:Cultivator,region:FrontierDrylandRegion,refId:string):boolean{
  const site=localAt(world,actor,world.tick),state=world.frontier?.drylands;
  if(!state||!site||!refId||state.receipts.some(row=>row.refId===refId)||!canPayDrylandHaul(world,actor,region))return false;
  const row=newReceipt(world,actor,site,'haul');row.refId=refId;
  if(region===west)row.waterDelta=-C.haulWater;
  else if(state.herd){row.workDelta=-C.haulWork;state.herd.work+=row.workDelta;}else return false;
  paid(world,actor,state,row);return true;
}

export function availableFrontierDrylandLocalActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierDrylandLocalOption[]{
  const site=localAt(world,actor,executionTick);
  if(!site)return [];
  const state=world.frontier?.drylands,month=frontierStepMonth(world.month,executionTick-world.tick),options:FrontierDrylandLocalOption[]=[];
  const add=(frontierDrylandMove:Exclude<FrontierDrylandLocalMove,'feed_herd'>)=>{
    options.push({action:'FRONTIER_DRYLAND',frontierDrylandMove,targetFrontierSiteId:site.id});
  };
  switch(site.id){
    case P.well:
      if(!state?.well&&money(actor,C.wellStones,C.wellRoots))add('open_well');
      if(state?.well&&executionTick>=state.well.readyTick&&state.well.water<C.waterCapacity&&
        !currentReceipt(state,executionTick,row=>row.move==='draw_water'))add('draw_water');
      break;
    case P.saltbed:
      if(actor.hp>C.gatherHp&&canSpendWater(state,executionTick,C.saltWater)&&capacityFor(state,west,C.batchYield)&&
        !currentReceipt(state,executionTick,row=>row.move==='gather_salt'))add('gather_salt');
      break;
    case P.trial:
      if(actor.qiProgress>=C.layerQi&&actor.realmStage>=1&&actor.realmStage<9&&
        canSpendWater(state,executionTick,C.layerWater)&&drylandStock(world,west,'stormstone')>=1)add('attempt_layer');
      break;
    case P.pasture:
      if(!state?.herd&&money(actor,C.herdStones,C.herdRoots))add('tend_herd');
      if(state?.herd&&frontierDrylandWorkingHerd(state.herd,executionTick)<C.herdWork&&
        !currentReceipt(state,executionTick,row=>row.move==='feed_herd')){
        if(money(actor,0,1))options.push({action:'FRONTIER_DRYLAND',frontierDrylandMove:'feed_herd',frontierDrylandFeed:'root',targetFrontierSiteId:site.id});
        if(drylandStock(world,ridge,'rift_salt')>=1)options.push({action:'FRONTIER_DRYLAND',frontierDrylandMove:'feed_herd',frontierDrylandFeed:'salt',targetFrontierSiteId:site.id});
      }
      break;
    case P.quarry:
      if(actor.hp>C.gatherHp&&frontierDrylandWorkingHerd(state?.herd,executionTick)>=C.quarryWork&&capacityFor(state,ridge,C.batchYield)&&
        (!isFrontierDrylandHarshMonth(month)||frontierDrylandChargedWard(state?.ward,executionTick)===1)&&
        !currentReceipt(state,executionTick,row=>row.move==='quarry_stone'))add('quarry_stone');
      break;
    case P.ward:
      if(frontierDrylandChargedWard(state?.ward,executionTick)===0&&money(actor,0,C.wardRoots)&&drylandStock(world,ridge,'stormstone')>=1)add('charge_ward');
      break;
  }
  return options;
}
const story:Readonly<Record<FrontierDrylandLocalMove,readonly [string,string]>>={
  open_well:['下了第一根井绳','灵石与地根逐样付齐，井槽落成；到下月也须亲来，桶里不会自己添水。'],
  draw_water:['井下见水','住民亲临立桶，称出本月井槽实收；旱月能取的水少些。'],
  gather_salt:['盐碱里挑出硬白','盐滩花掉同一井槽的实水与一身气力，两块盐材编号入仓。'],
  attempt_layer:['持水冲过一层','本月实耗井水与到仓雷石，是否迈上一层由真气与功法眼下的实结果决定。'],
  tend_herd:['风口拢住两头牧兽','当世住民实付一回栏料，把本地两头未驯牧兽收作一群；不是凭空多了一队人。'],
  feed_herd:['雪草里见两口食','先看今月确实入圈的地根或西盐，再给本期有限牧工记账。'],
  quarry_stone:['雷石应手','人到石坳，实费这期喂养换来的牧工与气力；仅将这两件原矿收入仓。'],
  charge_ward:['避雷桩上添一枚见证','雷石与地根实付布下近月一储；这份储备留待下一道雷。'],
};
export function resolveFrontierDrylandLocalAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload,
  {attemptNativeLayer}:{attemptNativeLayer?:NativeSameRealmAttempt}={}):WorldEvent|null{
  const internal=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='FRONTIER_DRYLAND'||(internal!==undefined&&internal!=='FRONTIER_DRYLAND')||
    !FRONTIER_DRYLAND_MOVES.some(move=>move===payload.frontierDrylandMove)||
    Object.entries(payload).some(([name,value])=>value!==undefined&&!['chosenAction','action','innerMonologue','spokenLine',
      'frontierDrylandMove','frontierDrylandFeed','targetFrontierSiteId'].includes(name)))return null;
  const option=availableFrontierDrylandLocalActions(actor,world).find(row=>row.frontierDrylandMove===payload.frontierDrylandMove&&
    row.targetFrontierSiteId===payload.targetFrontierSiteId&&row.frontierDrylandFeed===payload.frontierDrylandFeed);
  const site=localAt(world,actor,world.tick);
  if(!site||!option)return null;
  const move=option.frontierDrylandMove,row=newReceipt(world,actor,site,move),region=site.regionId;
  let native:WorldEvent|null;
  // All native resource and actor checks are already closed over the same synchronous turn.
  // A rejected ordinary callback never changes the body or its world; no cost applies in that case.
  if(move==='attempt_layer'){
    if(!attemptNativeLayer)return null;
    const {realm,realmStage:fromStage,qiProgress:beforeQi}=actor;
    native=attemptNativeLayer(world,actor);
    if(!native)return null;
    row.layer={nativeEventId:native.id,realm,fromStage,toStage:actor.realmStage,beforeQi,afterQi:actor.qiProgress,
      result:actor.realmStage===fromStage+1?'advanced':'backlash'};
  }else native=null;
  const state=ensureFrontierDrylandsState(world);
  const visibility={kind:'participants' as const,actorIds:[actor.id]};
  const consume=(good:FrontierDrylandGood)=>{
    const spent=debitDrylandStock(world,region,good,1);
    if(!spent)return false;
    row.spent=spent;recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_dryland_material',
      from:flowDrylandStore(region),good,amount:1,refId:row.id,visibility});return true;
  };
  switch(move){
    case 'open_well':
      row.stonesSpent=C.wellStones;row.rootsSpent=C.wellRoots;
      state.well={actorId:actor.id,openedTick:world.tick,readyTick:world.tick+1,water:0};break;
    case 'draw_water':
      if(!state.well)return null;
      row.waterDelta=Math.min(frontierDrylandWellInflow(world.month),C.waterCapacity-state.well.water);break;
    case 'attempt_layer':
      if(!consume('stormstone'))return null;
      row.waterDelta=-C.layerWater;break;
    case 'tend_herd':
      row.stonesSpent=C.herdStones;row.rootsSpent=C.herdRoots;row.workDelta=C.herdWork;
      state.herd={actorId:actor.id,startedTick:world.tick,count:C.herdCount,fedTick:world.tick,expiresTick:world.tick+C.herdMonths,work:C.herdWork};break;
    case 'feed_herd':
      if(!state.herd||option.frontierDrylandMove!=='feed_herd')return null;
      if(option.frontierDrylandFeed==='salt'&&!consume('rift_salt'))return null;
      row.feed=option.frontierDrylandFeed;row.rootsSpent=row.feed==='root'?1:0;
      row.workDelta=C.herdWork-frontierDrylandWorkingHerd(state.herd,world.tick);
      state.herd.fedTick=world.tick;state.herd.expiresTick=world.tick+C.herdMonths;state.herd.work=C.herdWork;break;
    case 'charge_ward':
      if(!consume('stormstone'))return null;
      row.rootsSpent=C.wardRoots;row.wardDelta=1;
      state.ward={chargedTick:world.tick,expiresTick:world.tick+C.wardMonths,charges:1};break;
    case 'quarry_stone':
    case 'gather_salt':{
      if(move==='quarry_stone'){
        if(!state.herd)return null;
        row.workDelta=-C.quarryWork;state.herd.work+=row.workDelta;
        if(isFrontierDrylandHarshMonth(world.month)&&state.ward){row.wardDelta=-1;state.ward.charges=0;}
      }else row.waterDelta=-C.saltWater;
      row.hpSpent=C.gatherHp;
      const good=move==='quarry_stone'?'stormstone':'rift_salt';
      row.batchId=frontierDrylandBatchId(row.id);
      state.batches.push({id:row.batchId,good,regionId:region,siteId:site.id,actorId:actor.id,tick:world.tick,amount:C.batchYield});
      state.stock.push({batchId:row.batchId,regionId:region,amount:C.batchYield});
      recordResourceFlow(world,{kind:'production',mechanism:'frontier',reason:'frontier_dryland_yield',
        to:flowDrylandStore(region),good,amount:C.batchYield,refId:row.batchId,visibility});
      break;
    }
  }
  paid(world,actor,state,row);
  const [title,description]=story[move];
  return {id:`evt-${row.id}`,title:native?.title??title,description:native?.description??description,
    tick:world.tick,year:world.year,month:world.month,category:native?.category??'diplomacy',locationId:site.id,actorIds:[actor.id],
    witnessScope:'participants'};
}
export function projectFrontierDrylandLocal(world:WorldState,viewer?:Cultivator):FrontierDrylandLocalView|undefined{
  if(!viewer)return undefined;
  const site=frontierPhysicalSite(world,viewer),home=frontierResidence(world,viewer.id);
  if(!site||!isFrontierDrylandRegion(site.regionId))return undefined;
  const regionId=site.regionId,resident=home?.regionId===regionId,state=world.frontier?.drylands;
  const harsh=isFrontierDrylandHarshMonth(world.month),window=harsh?(regionId===west?'dry':'thunder'):'open';
  const atStore=site.id===frontierDrylandStore(regionId);
  const well=resident&&regionId===west&&(atStore||site.id===P.well||site.id===P.saltbed||site.id===P.trial)?state?.well:undefined;
  const herd=resident&&regionId===ridge&&(atStore||site.id===P.pasture||site.id===P.quarry)?state?.herd:undefined;
  const ward=resident&&regionId===ridge&&(site.id===P.quarry||site.id===P.ward)?state?.ward:undefined;
  const layer=resident&&site.id===P.trial?last(state?.receipts,row=>row.move==='attempt_layer'&&row.actorId===viewer.id):undefined;
  return {siteId:site.id,regionId,resident,window,options:availableFrontierDrylandLocalActions(viewer,world,world.tick+1),
    ...(well?{well:{readyTick:well.readyTick,water:well.water,capacity:C.waterCapacity}}:{}),
    ...(herd?{herd:{count:herd.count,work:frontierDrylandWorkingHerd(herd,world.tick),expiresTick:herd.expiresTick}}:{}),
    ...(ward?{ward:{charges:frontierDrylandChargedWard(ward,world.tick),expiresTick:ward.expiresTick}}:{}),
    ...(resident&&atStore?{stock:{rift_salt:drylandStock(world,regionId,'rift_salt'),stormstone:drylandStock(world,regionId,'stormstone')}}:{}),
    ...(layer?.layer?{lastLayer:{result:layer.layer.result,fromStage:layer.layer.fromStage,toStage:layer.layer.toStage,tick:layer.tick}}:{})};
}

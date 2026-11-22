import type {Cultivator,LLMDecisionPayload,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {activeFrontierVisit,frontierActedOnGeography,frontierPhysicalSite,frontierResidence} from './frontierMovementEngine';
import {FRONTIER_REGIONS,frontierSite,frontierStepMonth,frontierWinter,type FrontierRegionId,type FrontierSite} from './frontierTerms';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {FRONTIER_CROP_EXPIRES,FRONTIER_GROW_TICKS,FRONTIER_PRACTICE_QI,FRONTIER_PRODUCTION_MOVES,
  FRONTIER_SOIL_CAPACITY,FRONTIER_SOUTH_PRACTICE_WATER,FRONTIER_STOCK_CAPACITY,FRONTIER_TIDE_WATER,FRONTIER_WATER_CAPACITY,
  frontierBatchId,frontierCropGood,frontierCropId,frontierPeakTide,frontierProductionReceiptId,frontierSpringInflow,frontierTide,
  type FrontierBatchSlice,type FrontierCrop,type FrontierGood,type FrontierProductionMove,type FrontierProductionOption,
  type FrontierProductionReceipt,type FrontierProductionSpend,type FrontierProductionState,type FrontierProductionView} from './frontierProductionTerms';

const north='north-snow',south='south-marsh';
function lastWhere<T>(rows:readonly T[]|undefined,matches:(row:T)=>boolean):T|undefined {
  if(rows)for(let i=rows.length-1;i>=0;i--)if(matches(rows[i]))return rows[i];
  return undefined;
}
const presentStock=(state:FrontierProductionState,regionId:FrontierRegionId)=>
  state.stock.filter(entry=>entry.regionId===regionId).reduce((total,entry)=>total+entry.amount,0);
export const flowFrontierStore=(id:FrontierRegionId):ResourceFlowAccount=>({kind:'frontier_store',id});
const activeCrop=(state:FrontierProductionState|undefined,site:FrontierSite)=>{
  const latest=lastWhere(state?.crops,row=>row.siteId===site.id);
  return latest&&!latest.resolved?latest:undefined;
};
const soilAt=(state:FrontierProductionState|undefined,site:FrontierSite)=>state?.soil.find(row=>row.siteId===site.id);
const usedLabor=(state:FrontierProductionState|undefined,actorId:string,tick:number)=>{
  for(let i=(state?.receipts.length??0)-1;i>=0;i--){
    const row=state!.receipts[i];
    if(row.tick<tick)break;
    if(row.tick===tick&&row.actorId===actorId&&FRONTIER_PRODUCTION_MOVES.some(move=>move===row.kind))return true;
  }
  return false;
};
export function frontierProductionActed(world:WorldState,actorId:string,tick:number):boolean {
  return usedLabor(world.frontier?.production,actorId,tick);
}
function usedSite(state:FrontierProductionState|undefined,site:FrontierSite,tick:number,move:FrontierProductionMove){
  for(let i=(state?.receipts.length??0)-1;i>=0;i--){
    const row=state!.receipts[i];
    if(row.tick<tick)break;
    if(row.tick===tick&&row.siteId===site.id&&row.kind===move)return true;
  }
  return false;
}
const availableSoil=(state:FrontierProductionState|undefined,site:FrontierSite)=>soilAt(state,site)?.units??FRONTIER_SOIL_CAPACITY;
const sowSoilCost=(state:FrontierProductionState|undefined,site:FrontierSite,tick:number)=>
  tick-(soilAt(state,site)?.lastSowTick??-10)<FRONTIER_CROP_EXPIRES?2:1;
const cropNeedsWater=(crop:FrontierCrop)=>crop.irrigatedTick===undefined&&(crop.regionId===south||crop.stressedTick!==undefined);
const harvestUnits=(crop:FrontierCrop):number=>crop.regionId===north?2:crop.stressedTick!==undefined&&crop.protectedTick===undefined?2:3;
function setup(world:WorldState):FrontierProductionState|undefined {
  if(!world.frontier)return undefined;
  return world.frontier.production??={version:1,water:{[north]:0,[south]:0},soil:[],crops:[],batches:[],stock:[],consumptions:[],receipts:[]};
}

export function frontierTradeStock(world:WorldState,regionId:FrontierRegionId,good:FrontierGood):number {
  const state=world.frontier?.production;
  if(!state||!FRONTIER_REGIONS.includes(regionId))return 0;
  const kinds=new Map(state.batches.map(batch=>[batch.id,batch.good]));
  return state.stock.filter(row=>row.regionId===regionId&&kinds.get(row.batchId)===good).reduce((sum,row)=>sum+row.amount,0);
}
/** Exact previously harvested units; cannot debit partially or mint from an empty store. */
export function debitFrontierTradeStock(world:WorldState,regionId:FrontierRegionId,good:FrontierGood,amount:number):FrontierBatchSlice[]|undefined {
  const state=world.frontier?.production;
  if(!state||!FRONTIER_REGIONS.includes(regionId)||!Number.isSafeInteger(amount)||amount<1||
    frontierTradeStock(world,regionId,good)<amount)return undefined;
  const goods=new Map(state.batches.map(batch=>[batch.id,batch.good]));
  let remaining=amount;
  const slices:FrontierBatchSlice[]=[];
  for(const item of state.stock){
    if(!remaining)break;
    if(item.regionId!==regionId||goods.get(item.batchId)!==good)continue;
    const held=Math.min(item.amount,remaining);
    item.amount-=held; remaining-=held;
    slices.push({batchId:item.batchId,amount:held});
  }
  state.stock=state.stock.filter(row=>row.amount>0);
  return slices;
}
export function canCreditFrontierTradeStock(world:WorldState,regionId:FrontierRegionId,slices:readonly FrontierBatchSlice[]):boolean {
  const state=world.frontier?.production;
  if(!state||!FRONTIER_REGIONS.includes(regionId)||!slices.length||
    new Set(slices.map(slice=>slice.batchId)).size!==slices.length)return false;
  const batches=new Map(state.batches.map(batch=>[batch.id,batch.units]));
  const held=new Map<string,number>();
  for(const row of state.stock)held.set(row.batchId,(held.get(row.batchId)??0)+row.amount);
  for(const row of state.consumptions)for(const slice of row.slices)
    held.set(slice.batchId,(held.get(slice.batchId)??0)+slice.amount);
  if(slices.some(slice=>!Number.isSafeInteger(slice.amount)||slice.amount<1||
    (held.get(slice.batchId)??0)+slice.amount>(batches.get(slice.batchId)??0)))return false;
  return presentStock(state,regionId)+slices.reduce((n,row)=>n+row.amount,0)<=FRONTIER_STOCK_CAPACITY;
}
export function creditFrontierTradeStock(world:WorldState,regionId:FrontierRegionId,slices:readonly FrontierBatchSlice[]):boolean{
  const state=world.frontier?.production;
  if(!state||!canCreditFrontierTradeStock(world,regionId,slices))return false;
  for(const {batchId,amount} of slices){
    const existing=state.stock.find(row=>row.batchId===batchId&&row.regionId===regionId);
    if(existing)existing.amount+=amount;
    else state.stock.push({batchId,amount,regionId});
  }
  return true;
}
function spendGoods(world:WorldState,regionId:FrontierRegionId,good:FrontierGood,amount:number,
  {actorId,refId,purpose}:Pick<FrontierProductionSpend,'actorId'|'refId'|'purpose'>):FrontierBatchSlice[]|undefined{
  const state=world.frontier?.production;
  const expected=purpose==='protect_crop'?'frost_dose':'ward_reed';
  if(!state||amount!==1||good!==expected||state.consumptions.some(row=>row.refId===refId&&row.purpose===purpose))return undefined;
  const slices=debitFrontierTradeStock(world,regionId,good,amount);
  if(!slices)return undefined;
  state.consumptions.push({regionId,actorId,tick:world.tick,refId,purpose,good,slices});
  recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:`frontier_${purpose}`,from:flowFrontierStore(regionId),
    good,amount,refId,visibility:{kind:'participants',actorIds:[actorId]}});
  return slices;
}
export function consumeFrontierTradeStock(world:WorldState,regionId:FrontierRegionId,good:FrontierGood,amount:number,
  context:{actorId:string;refId:string;purpose:'winter_detour'}):FrontierBatchSlice[]|undefined{
  return spendGoods(world,regionId,good,amount,context);
}
function activeResident(world:WorldState,actor:Cultivator,tick:number){
  if(!actor.alive||actor.hp<=0||actor.age<18||actor.positionPlane!=='frontier'||!world.cultivators.includes(actor)||
    (actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon')||
    (actor.guardAssignment&&actor.guardAssignment.expiresTick>tick))return undefined;
  const site=frontierPhysicalSite(world,actor,tick);
  const residence=site&&frontierResidence(world,actor.id);
  const visit=activeFrontierVisit(world,actor.id);
  if(!site||!residence||residence.regionId!==site.regionId||residence.settledTick>=tick||!visit||
    (visit.steps.at(-1)?.tick??visit.enteredTick)>=tick||frontierActedOnGeography(world,actor.id,tick))return undefined;
  return site;
}
function quoteMoves(world:WorldState,actor:Cultivator,site:FrontierSite,executionTick:number):FrontierProductionMove[]{
  const state=world.frontier?.production;
  if(usedLabor(state,actor.id,executionTick))return [];
  const region=site.regionId,water=state?.water[region]??0,month=frontierStepMonth(world.month,executionTick-world.tick);
  const roots=actor.herbs.earth_root>=1;
  if(site.role==='spring')return roots&&water<FRONTIER_WATER_CAPACITY[region]&&!usedSite(state,site,executionTick,'tend_spring')?['tend_spring']:[];
  if(site.role==='sluice')return frontierTide(month)&&water<FRONTIER_WATER_CAPACITY[region]&&!usedSite(state,site,executionTick,'draw_tide')?['draw_tide']:[];
  if(site.role==='home'&&region===north){
    return actor.qiProgress<100&&frontierTradeStock(world,north,'ward_reed')>=1?['cultivate']:[];
  }
  if(site.role!=='winter-plot'&&site.role!=='field')return [];
  const crop=activeCrop(state,site), moves:FrontierProductionMove[]=[];
  if(region===south&&actor.qiProgress<100&&water>=FRONTIER_SOUTH_PRACTICE_WATER)moves.push('cultivate');
  if(crop){
    if(executionTick<crop.sownTick+FRONTIER_CROP_EXPIRES&&executionTick>crop.sownTick){
      if(water>=1&&!crop.irrigatedTick)moves.push('irrigate');
      if(region===south&&!crop.protectedTick&&frontierTradeStock(world,south,'frost_dose')>=1)moves.push('protect_crop');
      if(executionTick>=crop.readyTick&&!cropNeedsWater(crop)&&(!state||presentStock(state,region)+harvestUnits(crop)<=FRONTIER_STOCK_CAPACITY))
        moves.push('harvest');
    }
  }else{
    if(roots&&water>=1&&(region!==south||availableSoil(state,site)>=sowSoilCost(state,site,executionTick))&&
      !usedSite(state,site,executionTick,'harvest'))moves.push('sow');
    if(region===south&&availableSoil(state,site)<FRONTIER_SOIL_CAPACITY&&!usedSite(state,site,executionTick,'rest_field'))moves.push('rest_field');
  }
  return moves;
}
export function availableFrontierProductionActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierProductionOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  const site=activeResident(world,actor,executionTick);
  return site?quoteMoves(world,actor,site,executionTick).map(frontierProductionMove=>({action:'FRONTIER_PRODUCTION',frontierProductionMove,targetFrontierSiteId:site.id})):[];
}
function receipt(state:FrontierProductionState,world:WorldState,site:FrontierSite,
  actorId:string,kind:FrontierProductionReceipt['kind'],fields:Partial<Pick<FrontierProductionReceipt,'waterDelta'|'rootsSpent'|'soilDelta'|'qiGained'|'plotId'>>={}){
  const row:FrontierProductionReceipt={id:frontierProductionReceiptId(world.tick,kind,site.id,actorId),kind,tick:world.tick,
    year:world.year,month:world.month,actorId,siteId:site.id,regionId:site.regionId,waterDelta:0,rootsSpent:0,soilDelta:0,qiGained:0,...fields};
  state.receipts.push(row);
  const visibility={kind:'participants' as const,actorIds:[actorId]};
  if(row.waterDelta>0)recordResourceFlow(world,{kind:'production',mechanism:'frontier',reason:`frontier_${kind}_water`,to:flowFrontierStore(site.regionId),
    good:'frontier_water',amount:row.waterDelta,refId:row.id,visibility});
  if(row.waterDelta<0)recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:`frontier_${kind}_water`,from:flowFrontierStore(site.regionId),
    good:'frontier_water',amount:-row.waterDelta,refId:row.id,visibility});
  if(row.rootsSpent)recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:`frontier_${kind}_root`,from:flowActor(actorId),
    good:'earth_root',amount:1,refId:row.id,visibility});
  return row;
}
const prose:Record<FrontierProductionMove,readonly [string,string]>={
  tend_spring:['泉眼点根固石','一株玄土根入了石缝。护泉已备，下月方见有多少可收之水。'],
  draw_tide:['守闸引一潮','当月潮窗可开，水确实流入南泽沟池，只取池中容得下的量。'],
  sow:['下种待生','亲手用原有玄土根与一份当地水播种；尚无收成。'],
  irrigate:['引水润根','从本地水槽实扣一份，浇在这批已下的种上。'],
  harvest:['收成入实仓','成熟的这一批亲手采收，按原批号入仓，不重复计产。'],
  rest_field:['休土养畦','本月以实在一工翻歇空田，有限地力得以回复。'],
  cultivate:['借当地资粮修行','当月先耗确实可用的保暖物或潮水，再以本地一工练气。'],
  protect_crop:['雪药护南畦','用已真实入仓的一份北地霜药护住这批本地作物。'],
};
function scene(world:WorldState,row:FrontierProductionReceipt,move:FrontierProductionMove):WorldEvent{
  const [title,description]=prose[move];
  return {id:`evt-${row.id}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',title,description,
    actorIds:[row.actorId],locationId:row.siteId,witnessScope:'participants'};
}
export function resolveFrontierProductionAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  const internalAction=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='FRONTIER_PRODUCTION'||internalAction!==undefined&&internalAction!=='FRONTIER_PRODUCTION'||
    Object.entries(payload).some(([key,value])=>value!==undefined&&
    !['chosenAction','action','innerMonologue','spokenLine','frontierProductionMove','targetFrontierSiteId'].includes(key)))return null;
  const option=availableFrontierProductionActions(actor,world).find(row=>row.frontierProductionMove===payload.frontierProductionMove&&
    row.targetFrontierSiteId===payload.targetFrontierSiteId);
  const site=option&&frontierSite(option.targetFrontierSiteId);
  if(!option||!site)return null;
  const state=setup(world);
  if(!state)return null;
  const move=option.frontierProductionMove,region=site.regionId,crop=activeCrop(state,site);
  let waterDelta=0,rootsSpent:0|1=0,soilDelta=0,qiGained=0;
  let plotId=move==='irrigate'||move==='harvest'||move==='protect_crop'?crop?.id:undefined;
  switch(move){
    case 'tend_spring': rootsSpent=1;break;
    case 'draw_tide': waterDelta=Math.min(FRONTIER_TIDE_WATER,FRONTIER_WATER_CAPACITY[south]-state.water[south]);break;
    case 'sow':{
      rootsSpent=1;waterDelta=-1;plotId=frontierCropId(world.tick,site.id);
      if(region===south){
        const soil=soilAt(state,site)??{siteId:site.id,units:FRONTIER_SOIL_CAPACITY};
        if(!state.soil.includes(soil))state.soil.push(soil);
        soilDelta=-sowSoilCost(state,site,world.tick);soil.units+=soilDelta;soil.lastSowTick=world.tick;
      }
      state.crops.push({id:plotId,siteId:site.id,regionId:region,sowerId:actor.id,sownTick:world.tick,readyTick:world.tick+FRONTIER_GROW_TICKS});
      break;
    }
    case 'irrigate':
      if(!crop)return null;
      crop.irrigatedTick=world.tick;waterDelta=-1;break;
    case 'rest_field':{
      const soil=soilAt(state,site);
      if(!soil)return null;
      soilDelta=Math.min(2,FRONTIER_SOIL_CAPACITY-soil.units);soil.units+=soilDelta;
      break;
    }
    case 'harvest':{
      if(!crop)return null;
      const id=frontierBatchId(crop.id),good=frontierCropGood(region),units=harvestUnits(crop);
      state.batches.push({id,plotId:crop.id,siteId:site.id,regionId:region,good,units,harvestedTick:world.tick,harvesterId:actor.id});
      state.stock.push({batchId:id,regionId:region,amount:units});
      crop.resolved={kind:'harvested',tick:world.tick,batchId:id};
      recordResourceFlow(world,{kind:'production',mechanism:'frontier',reason:'frontier_crop_harvested',to:flowFrontierStore(region),
        good,amount:units,refId:id,visibility:{kind:'participants',actorIds:[actor.id]}});
      break;
    }
    case 'cultivate':{
      const id=frontierProductionReceiptId(world.tick,move,site.id,actor.id);
      if(region===north&&!spendGoods(world,north,'ward_reed',1,{actorId:actor.id,refId:id,purpose:'practice'}))return null;
      if(region===south)waterDelta=-FRONTIER_SOUTH_PRACTICE_WATER;
      qiGained=Math.min(FRONTIER_PRACTICE_QI,100-actor.qiProgress);actor.qiProgress+=qiGained;break;
    }
    case 'protect_crop':{
      const id=frontierProductionReceiptId(world.tick,move,site.id,actor.id);
      if(!crop||!spendGoods(world,south,'frost_dose',1,{actorId:actor.id,refId:id,purpose:'protect_crop'}))return null;
      crop.protectedTick=world.tick;break;
    }
  }
  state.water[region]+=waterDelta;actor.herbs.earth_root-=rootsSpent;
  return scene(world,receipt(state,world,site,actor.id,move,{waterDelta,rootsSpent,soilDelta,qiGained,...(plotId?{plotId}:{})}),move);
}
/** Only a real past work receipt creates next-month measured inflow; no lazy state on an untouched archive. */
export function advanceFrontierProduction(world:WorldState):void{
  const state=world.frontier?.production;
  if(!state||(state.lastAdvancedTick??0)>=world.tick)return;
  state.lastAdvancedTick=world.tick;
  const spring=frontierSite('frontier-north-spring');
  let maintained:FrontierProductionReceipt|undefined;
  for(let i=state.receipts.length-1;i>=0;i--){
    const row=state.receipts[i];
    if(row.tick<world.tick-1)break;
    if(row.kind==='tend_spring'&&row.tick===world.tick-1){maintained=row;break;}
  }
  if(spring&&maintained){
    const inflow=Math.min(frontierSpringInflow(world.month),FRONTIER_WATER_CAPACITY[north]-state.water[north]);
    if(inflow>0){state.water[north]+=inflow;receipt(state,world,spring,maintained.actorId,'spring_inflow',{waterDelta:inflow});}
  }
  // Ordered crop IDs preserve historical receipts without revisiting every old harvest each month.
  const current:FrontierCrop[]=[];
  for(let i=state.crops.length-1;i>=0;i--){
    const crop=state.crops[i];
    if(world.tick>crop.sownTick+FRONTIER_CROP_EXPIRES)break;
    if(!crop.resolved)current.unshift(crop);
  }
  for(const crop of current){
    const site=frontierSite(crop.siteId),age=world.tick-crop.sownTick;
    if(crop.resolved||!site||age<1)continue;
    if(age>=FRONTIER_CROP_EXPIRES){
      crop.resolved={kind:'failed',tick:world.tick};
      receipt(state,world,site,crop.sowerId,'crop_failed',{plotId:crop.id});continue;
    }
    if(!crop.stressedTick&&(crop.regionId===north?frontierWinter(world.month)&&state.water[north]===0&&!crop.irrigatedTick:
      frontierPeakTide(world.month)&&!crop.protectedTick)){
      crop.stressedTick=world.tick;
      receipt(state,world,site,crop.sowerId,'crop_stress',{plotId:crop.id});
    }
  }
}
export function projectFrontierProduction(world:WorldState,viewer?:Cultivator):FrontierProductionView|undefined{
  // A same-month arrival has a physical address, but only an already established resident sees the workshop ledger.
  if(!viewer)return undefined;
  const site=frontierPhysicalSite(world,viewer,world.tick),resident=frontierResidence(world,viewer.id);
  if(!site||!resident||resident.regionId!==site.regionId||!viewer.alive||viewer.hp<=0||!world.cultivators.includes(viewer))return undefined;
  const state=world.frontier?.production,crop=activeCrop(state,site),regionId=site.regionId;
  const localPlot=site.role==='field'||site.role==='winter-plot'?{...(site.role==='field'?{soil:availableSoil(state,site)}:{}),
    ...(crop?{plantedTick:crop.sownTick,readyTick:crop.readyTick,needIrrigation:cropNeedsWater(crop),protected:crop.protectedTick!==undefined}:{})}:undefined;
  return {regionId,siteId:site.id,water:state?.water[regionId]??0,waterCapacity:FRONTIER_WATER_CAPACITY[regionId],
    isWinter:frontierWinter(world.month),canDrawTide:frontierTide(world.month),...(localPlot?{localPlot}:{}),
    ...(site.role==='home'?{stock:{frost_dose:frontierTradeStock(world,regionId,'frost_dose'),ward_reed:frontierTradeStock(world,regionId,'ward_reed')}}:{}),
    options:availableFrontierProductionActions(viewer,world,world.tick+1)};
}

import type {Cultivator,LLMDecisionPayload,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {ensureFrontierState,frontierActedOnGeography,frontierPhysicalSite,frontierResidence} from './frontierMovementEngine';
import {frontierStepMonth,type FrontierSite} from './frontierTerms';
import {portTradeHullStatus} from './frontierPortTradeTerms';
import {FRONTIER_PORT_COMMISSION_ROOTS,FRONTIER_PORT_COMMISSION_STONES,FRONTIER_PORT_GATHER_HP,FRONTIER_PORT_HULL_INITIAL,
  FRONTIER_PORT_HULL_MAX,FRONTIER_PORT_LOCAL_MOVES,FRONTIER_PORT_PRACTICE_HP,FRONTIER_PORT_PRACTICE_QI,FRONTIER_PORT_REGION,
  FRONTIER_PORT_REPAIR_CONDITION,FRONTIER_PORT_REPAIR_ROOTS,FRONTIER_PORT_REPAIR_STONES,FRONTIER_PORT_SALT_YIELD,FRONTIER_PORT_STOCK_MAX,
  frontierPortBatchId,frontierPortHullId,frontierPortLocalReceiptId,frontierPortTide,
  type FrontierPortBatchSlice,type FrontierPortGood,type FrontierPortHull,type FrontierPortLocalMove,type FrontierPortLocalOption,
  type FrontierPortLocalReceipt,type FrontierPortState,type FrontierPortView} from './frontierPortTerms';

const dock='frontier-east-dock',boatyard='frontier-east-boatyard',flat='frontier-east-tideflat',warehouse='frontier-east-warehouse';
export const flowFrontierPort=():ResourceFlowAccount=>({kind:'frontier_store',id:FRONTIER_PORT_REGION});
export function ensureFrontierPortState(world:WorldState):FrontierPortState {
  const frontier=ensureFrontierState(world);
  return frontier.port??={version:1,batches:[],stock:[],receipts:[],riggingSpent:[]};
}
const stockQty=(state:FrontierPortState|undefined)=>state?.stock.reduce((sum,row)=>sum+row.amount,0)??0;
const storedBatch=(state:FrontierPortState,id:string)=>{
  for(let i=state.batches.length-1;i>=0;i--)if(state.batches[i].id===id)return state.batches[i];
  return undefined;
};
function portStock(world:WorldState,good:FrontierPortGood):number {
  const state=world.frontier?.port;
  return state?.stock.reduce((sum,row)=>sum+(storedBatch(state,row.batchId)?.good===good?row.amount:0),0)??0;
}
export const portSaltStock=(world:WorldState):number=>portStock(world,'reef_salt');
export const portRiggingStock=(world:WorldState):number=>portStock(world,'port_rigging');
function debit(world:WorldState,good:FrontierPortGood,amount:number):FrontierPortBatchSlice[]|undefined{
  const state=world.frontier?.port;
  if(!state||!Number.isSafeInteger(amount)||amount<=0||portStock(world,good)<amount)return undefined;
  const slices:FrontierPortBatchSlice[]=[];
  let remaining=amount;
  for(const item of state.stock){
    if(!remaining)break;
    if(storedBatch(state,item.batchId)?.good!==good)continue;
    const n=Math.min(item.amount,remaining);
    item.amount-=n;remaining-=n;slices.push({batchId:item.batchId,amount:n});
  }
  state.stock=state.stock.filter(row=>row.amount!==0);
  return slices;
}
export const debitPortSalt=(world:WorldState,amount:number)=>debit(world,'reef_salt',amount);
export function canCreditPortSalt(world:WorldState,slices:readonly FrontierPortBatchSlice[]):boolean {
  const state=world.frontier?.port;
  if(!state||!slices.length||slices.length>FRONTIER_PORT_STOCK_MAX||
    new Set(slices.map(row=>row.batchId)).size!==slices.length)return false;
  const complete=slices.every(row=>{
    const batch=storedBatch(state,row.batchId),held=state.stock.find(value=>value.batchId===row.batchId)?.amount??0;
    return batch?.good==='reef_salt'&&Number.isSafeInteger(row.amount)&&row.amount>=1&&held+row.amount<=batch.amount;
  });
  return complete&&stockQty(state)+slices.reduce((sum,row)=>sum+row.amount,0)<=FRONTIER_PORT_STOCK_MAX;
}
export function creditPortSalt(world:WorldState,slices:readonly FrontierPortBatchSlice[]):boolean {
  const state=world.frontier?.port;
  if(!state||!canCreditPortSalt(world,slices))return false;
  for(const {batchId,amount} of slices){
    const standing=state.stock.find(row=>row.batchId===batchId);
    if(standing)standing.amount+=amount;else state.stock.push({batchId,amount});
  }
  return true;
}
export function portHullAtBerth(world:WorldState):FrontierPortHull|undefined {
  const hull=world.frontier?.port?.hull;
  return hull&&portTradeHullStatus(world,hull.id)==='berthed'?hull:undefined;
}
/** Called only by proven voyage departure, immediately before storing the dated native departure. */
export function wearPortHull(world:WorldState,hullId:string):boolean {
  const hull=world.frontier?.port?.hull;
  if(!hull||hull.id!==hullId||hull.condition<2||portTradeHullStatus(world,hull.id)!=='reserved')return false;
  hull.condition-=1;return true;
}
function residentSite(world:WorldState,actor:Cultivator,tick:number):FrontierSite|undefined {
  if(!actor.alive||actor.hp<=0||actor.positionPlane!=='frontier'||!world.cultivators.includes(actor)||
    actor.age<18||actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon'||
    (actor.guardAssignment&&actor.guardAssignment.expiresTick>tick))return undefined;
  const site=frontierPhysicalSite(world,actor,tick),resident=frontierResidence(world,actor.id);
  return site?.regionId===FRONTIER_PORT_REGION&&resident?.regionId===FRONTIER_PORT_REGION&&resident.settledTick<tick?site:undefined;
}
const validFunds=(actor:Cultivator,stones:number,roots:number)=>
  Number.isSafeInteger(actor.spiritStones)&&actor.spiritStones>=stones&&Number.isSafeInteger(actor.herbs.earth_root)&&actor.herbs.earth_root>=roots;
export function frontierPortLocalActed(world:WorldState,actorId:string,tick:number):boolean {
  const state=world.frontier?.port;
  const receipts=state?.receipts??[],rigging=state?.riggingSpent??[];
  for(let i=receipts.length-1;i>=0&&receipts[i].tick>=tick;i--)
    if(receipts[i].tick===tick&&receipts[i].actorId===actorId)return true;
  for(let i=rigging.length-1;i>=0&&rigging[i].tick>=tick;i--)
    if(rigging[i].tick===tick&&rigging[i].actorId===actorId)return true;
  return false;
}
/** Called by port freight after its actor/contract/berth/fee preflight says the entire load can commit. */
export function consumePortRiggingForTrade(world:WorldState,actor:Cultivator,refId:string):FrontierPortBatchSlice[]|undefined {
  const state=world.frontier?.port,place=residentSite(world,actor,world.tick);
  if(!state||(place?.id!==dock&&place?.id!==warehouse)||!refId||
    frontierPortLocalActed(world,actor.id,world.tick)||frontierActedOnGeography(world,actor.id,world.tick)||
    state.riggingSpent.some(row=>row.refId===refId))return undefined;
  const slices=debit(world,'port_rigging',1);
  if(!slices)return undefined;
  state.riggingSpent.push({refId,actorId:actor.id,tick:world.tick,slices});
  recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_port_voyage_rigging',from:flowFrontierPort(),
    good:'port_rigging',amount:1,refId,visibility:{kind:'participants',actorIds:[actor.id]}});
  return slices;
}
export function availableFrontierPortLocalActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierPortLocalOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  const site=residentSite(world,actor,executionTick);
  if(!site||frontierActedOnGeography(world,actor.id,executionTick)||frontierPortLocalActed(world,actor.id,executionTick))return [];
  const state=world.frontier?.port,hull=portHullAtBerth(world),remaining=FRONTIER_PORT_STOCK_MAX-stockQty(state);
  const tide=frontierPortTide(frontierStepMonth(world.month,executionTick-world.tick));
  const options:FrontierPortLocalMove[]=[];
  if(site.id===boatyard){
    if(!state?.hull&&validFunds(actor,FRONTIER_PORT_COMMISSION_STONES,FRONTIER_PORT_COMMISSION_ROOTS))options.push('commission');
    if(hull&&hull.condition<FRONTIER_PORT_HULL_MAX&&validFunds(actor,FRONTIER_PORT_REPAIR_STONES,FRONTIER_PORT_REPAIR_ROOTS))options.push('repair');
    if(remaining>=1&&validFunds(actor,0,1))options.push('weave_rigging');
  }
  if(site.id===flat&&tide==='open'&&remaining>=FRONTIER_PORT_SALT_YIELD&&validFunds(actor,0,1)&&actor.hp>FRONTIER_PORT_GATHER_HP&&
    !state?.receipts.some(row=>row.move==='gather'&&row.tick===executionTick))options.push('gather');
  if((site.id===dock||site.id===boatyard)&&tide==='open'&&hull&&hull.condition>0&&portRiggingStock(world)>=1&&
    actor.hp>FRONTIER_PORT_PRACTICE_HP&&actor.qiProgress<100)options.push('practice');
  return options.map(frontierPortMove=>({action:'FRONTIER_PORT',frontierPortMove,targetFrontierSiteId:site.id}));
}
const prose:Record<FrontierPortLocalMove,readonly [string,string]>={
  commission:['潮边合木初成舟','十二灵石与三株旧根实付入坞；这才有了一只停在港里的船。'],
  repair:['坞中补好旧舟','实付四灵石与两株旧根去填舟损，没有替这艘船变出一份新绳。'],
  weave_rigging:['伏桅编就新绳具','本人以一株实有玄土根作一份绳具，系上原批号收入港仓。'],
  gather:['退潮亲采潮晶','当月潮窗确开，实费一株编篓旧根与四分体力，采得两份潮晶。'],
  practice:['借实舟迎风练息','船仍泊在本港，实用一份仓中绳具和六分体力，才得这一回合的修行。'],
};
export function resolveFrontierPortLocalAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  const internal=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='FRONTIER_PORT'||(internal!==undefined&&internal!=='FRONTIER_PORT')||
    !FRONTIER_PORT_LOCAL_MOVES.some(move=>move===payload.frontierPortMove)||
    Object.entries(payload).some(([key,value])=>value!==undefined&&
    !['chosenAction','action','innerMonologue','spokenLine','frontierPortMove','targetFrontierSiteId'].includes(key)))return null;
  const option=availableFrontierPortLocalActions(actor,world).find(row=>
    row.frontierPortMove===payload.frontierPortMove&&row.targetFrontierSiteId===payload.targetFrontierSiteId);
  if(!option)return null;
  const state=ensureFrontierPortState(world),move=option.frontierPortMove,id=frontierPortLocalReceiptId(world.tick,move,actor.id);
  const receipt:FrontierPortLocalReceipt={id,move,tick:world.tick,year:world.year,month:world.month,actorId:actor.id,
    siteId:option.targetFrontierSiteId,stonesSpent:0,rootsSpent:0,hpSpent:0,qiGained:0,hullDelta:0};
  const visibility={kind:'participants' as const,actorIds:[actor.id]};
  if(move==='commission'){
    receipt.stonesSpent=FRONTIER_PORT_COMMISSION_STONES;receipt.rootsSpent=FRONTIER_PORT_COMMISSION_ROOTS;
    receipt.hullDelta=FRONTIER_PORT_HULL_INITIAL;
    state.hull={id:frontierPortHullId(world.tick,actor.id),builderId:actor.id,createdTick:world.tick,condition:receipt.hullDelta};
  }else if(move==='repair'){
    const hull=portHullAtBerth(world);
    if(!hull)return null;
    receipt.stonesSpent=FRONTIER_PORT_REPAIR_STONES;receipt.rootsSpent=FRONTIER_PORT_REPAIR_ROOTS;
    receipt.hullDelta=Math.min(FRONTIER_PORT_HULL_MAX-hull.condition,FRONTIER_PORT_REPAIR_CONDITION);hull.condition+=receipt.hullDelta;
  }else if(move==='practice'){
    const rigging=debit(world,'port_rigging',1);
    if(!rigging)return null;
    receipt.rigging=rigging;receipt.hpSpent=FRONTIER_PORT_PRACTICE_HP;
    receipt.qiGained=Math.min(100-actor.qiProgress,FRONTIER_PORT_PRACTICE_QI);
    recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_port_practice_rigging',from:flowFrontierPort(),
      good:'port_rigging',amount:1,refId:id,visibility});
  }else{
    const good=move==='gather'?'reef_salt':'port_rigging',amount=move==='gather'?FRONTIER_PORT_SALT_YIELD:1;
    receipt.rootsSpent=1;receipt.hpSpent=move==='gather'?FRONTIER_PORT_GATHER_HP:0;
    receipt.batchId=frontierPortBatchId(id);
    state.batches.push({id:receipt.batchId,good,amount,actorId:actor.id,tick:world.tick});
    state.stock.push({batchId:receipt.batchId,amount});
    recordResourceFlow(world,{kind:'production',mechanism:'frontier',reason:'frontier_port_work_output',to:flowFrontierPort(),
      good,amount,refId:receipt.batchId,visibility});
  }
  actor.spiritStones-=receipt.stonesSpent;actor.herbs.earth_root-=receipt.rootsSpent;
  actor.hp-=receipt.hpSpent;actor.qiProgress+=receipt.qiGained;
  if(receipt.stonesSpent)recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_port_work_stones',
    from:flowActor(actor.id),good:'stone',amount:receipt.stonesSpent,refId:id,visibility});
  if(receipt.rootsSpent)recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_port_work_root',
    from:flowActor(actor.id),good:'earth_root',amount:receipt.rootsSpent,refId:id,visibility});
  state.receipts.push(receipt);
  const [title,description]=prose[move];
  return {id:`evt-${id}`,tick:world.tick,year:world.year,month:world.month,actorIds:[actor.id],locationId:receipt.siteId,
    category:'diplomacy',title,description,witnessScope:'participants'};
}
export function projectFrontierPort(world:WorldState,viewer?:Cultivator):FrontierPortView|undefined {
  if(!viewer)return undefined;
  const site=frontierPhysicalSite(world,viewer,world.tick);
  if(site?.regionId!==FRONTIER_PORT_REGION)return undefined;
  const resident=frontierResidence(world,viewer.id)?.regionId===FRONTIER_PORT_REGION;
  const source=resident&&(site.id===dock||site.id===boatyard)?world.frontier?.port?.hull:undefined;
  const status=source&&portTradeHullStatus(world,source.id);
  const hull=source&&status?{id:source.id,condition:source.condition,status:status==='berthed'||status==='reserved'?status:'away' as const}:undefined;
  const stock=resident&&site.id===warehouse?{reef_salt:portSaltStock(world),port_rigging:portRiggingStock(world)}:undefined;
  return {siteId:site.id,resident,tide:frontierPortTide(world.month),...(hull?{hull}:{}),...(stock?{stock}:{}),
    options:availableFrontierPortLocalActions(viewer,world,world.tick+1)};
}

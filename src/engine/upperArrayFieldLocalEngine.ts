import type {Cultivator,LLMDecisionPayload,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {upperArrayFieldPhysicalSite,upperArrayFieldResidence,upperArrayFieldActedOnGeography} from './upperArrayFieldMovementEngine';
import {upperArrayFieldActedOnTrade} from './upperArrayFieldTradeTerms';
import {
  UPPER_ARRAY_FIELD_LATTICE_CAPACITY as CAP,UPPER_ARRAY_FIELD_LOCAL_COST as C,UPPER_ARRAY_FIELD_LOCAL_LIMIT as MAX,
  upperArrayFieldLatticeBatchId,upperArrayFieldLocalReceiptId,
  type UpperArrayFieldLocalOption,type UpperArrayFieldLocalReceipt,type UpperArrayFieldLocalView,
  type UpperArrayFieldProductionState,type UpperArrayLatticeSlice,
} from './upperArrayFieldLocalTerms';

export const flowUpperArrayStore=():ResourceFlowAccount=>({kind:'upper_array_store',id:'upper-array-field'});
export const upperArrayFieldActedLocally=(world:WorldState,actorId:string,tick:number)=>!!
  world.upperArrayField?.production?.receipts.some(row=>row.actorId===actorId&&row.tick===tick);

function ownedPieces(state:UpperArrayFieldProductionState|undefined,actorId:string,through=Infinity):UpperArrayLatticeSlice[]{
  if(!state)return [];
  const owned=new Set(state.batches.filter(row=>row.actorId===actorId&&row.tick<through).map(row=>row.id));
  return state.stock.filter(row=>owned.has(row.batchId));
}
export function upperArrayLatticeStock(world:WorldState,actorId:string):number{
  return ownedPieces(world.upperArrayField?.production,actorId).reduce((sum,row)=>sum+row.quantity,0);
}
function take(state:UpperArrayFieldProductionState,slices:readonly UpperArrayLatticeSlice[]):void{
  for(const slice of slices){
    const index=state.stock.findIndex(row=>row.batchId===slice.batchId);
    const row=state.stock[index];
    if(row.quantity===slice.quantity)state.stock.splice(index,1);
    else row.quantity-=slice.quantity;
  }
}
export function holdUpperArrayLattice(world:WorldState,actor:Cultivator,quantity:number):UpperArrayLatticeSlice[]|undefined{
  const state=world.upperArrayField?.production;
  if(!state||!Number.isSafeInteger(quantity)||quantity<1||quantity>CAP||
    upperArrayFieldPhysicalSite(world,actor)?.id!=='array-field-exchange'||!upperArrayFieldResidence(world,actor.id))return undefined;
  const slices:UpperArrayLatticeSlice[]=[];
  let remaining=quantity;
  for(const stock of ownedPieces(state,actor.id,world.tick)){
    const count=Math.min(stock.quantity,remaining);
    slices.push({batchId:stock.batchId,quantity:count});
    remaining-=count;
    if(!remaining)break;
  }
  if(remaining)return undefined;
  take(state,slices);
  return slices;
}
export function restockUpperArrayLattice(world:WorldState,actor:Cultivator,slices:readonly UpperArrayLatticeSlice[]):boolean{
  const state=world.upperArrayField?.production;
  if(!state||!slices.length||slices.length>CAP||upperArrayFieldPhysicalSite(world,actor)?.id!=='array-field-exchange'||
    !upperArrayFieldResidence(world,actor.id))return false;
  let total=upperArrayLatticeStock(world,actor.id);
  const ids=new Set<string>();
  for(const slice of slices){
    const batch=state.batches.find(row=>row.id===slice.batchId&&row.actorId===actor.id&&row.tick<world.tick);
    const onHand=state.stock.find(row=>row.batchId===slice.batchId)?.quantity??0;
    if(!batch||!Number.isSafeInteger(slice.quantity)||slice.quantity<1||onHand+slice.quantity>batch.quantity||ids.has(slice.batchId))return false;
    ids.add(slice.batchId);
    total+=slice.quantity;
  }
  if(total>CAP)return false;
  for(const slice of slices){
    const row=state.stock.find(value=>value.batchId===slice.batchId);
    if(row)row.quantity+=slice.quantity;
    else state.stock.push({...slice});
  }
  return true;
}

function hasStones(actor:Cultivator,amount:number):boolean{
  return Number.isSafeInteger(actor.spiritStones)&&actor.spiritStones>=amount;
}
export function availableUpperArrayFieldLocalActions(actor:Cultivator,world:WorldState,tick=world.tick):UpperArrayFieldLocalOption[]{
  if(tick!==world.tick&&tick!==world.tick+1)return [];
  const physical=upperArrayFieldPhysicalSite(world,actor,tick),home=upperArrayFieldResidence(world,actor.id);
  const production=world.upperArrayField?.production;
  if(!physical||!home||home.settledTick>=tick||!Number.isFinite(actor.hp)||actor.hp<=4||
    (production?.receipts.length??0)>=MAX||upperArrayFieldActedLocally(world,actor.id,tick)||
    upperArrayFieldActedOnGeography(world,actor.id,tick)||upperArrayFieldActedOnTrade(world,actor.id,tick))return [];
  if(physical.id==='array-field-source'&&hasStones(actor,C.condense.stones)&&Number.isSafeInteger(actor.herbs.earth_root)&&
    actor.herbs.earth_root>=C.condense.roots&&upperArrayLatticeStock(world,actor.id)+C.condense.produced<=CAP)
    return [{action:'UPPER_ARRAY_FIELD_LOCAL',upperArrayFieldLocalMove:'condense',targetUpperArrayFieldSiteId:'array-field-source'}];
  if(physical.id==='array-field-practice'&&hasStones(actor,C.cultivate.stones)&&Number.isFinite(actor.qiProgress)&&
    actor.qiProgress>=0&&actor.qiProgress<100&&ownedPieces(production,actor.id,tick).length)
    return [{action:'UPPER_ARRAY_FIELD_LOCAL',upperArrayFieldLocalMove:'cultivate',targetUpperArrayFieldSiteId:'array-field-practice'}];
  return [];
}
export function resolveUpperArrayFieldLocalAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='UPPER_ARRAY_FIELD_LOCAL'||Object.keys(payload).some(key=>
    !['chosenAction','innerMonologue','spokenLine','upperArrayFieldLocalMove','targetUpperArrayFieldSiteId'].includes(key)))return null;
  const option=availableUpperArrayFieldLocalActions(actor,world).find(row=>
    row.upperArrayFieldLocalMove===payload.upperArrayFieldLocalMove&&row.targetUpperArrayFieldSiteId===payload.targetUpperArrayFieldSiteId);
  const field=world.upperArrayField;
  const visit=field?.visits.find(row=>row.actorId===actor.id&&row.exitedTick===undefined&&row.deceasedTick===undefined);
  if(!option||!field||!visit)return null;
  const move=option.upperArrayFieldLocalMove;
  const cost=C[move], tick=world.tick;
  const id=upperArrayFieldLocalReceiptId(tick,actor.id);
  const visibility={kind:'participants' as const,actorIds:[actor.id]};
  const book=field.production??={version:1,batches:[],stock:[],receipts:[]};
  const base={id,actorId:actor.id,visitId:visit.id,tick};
  let receipt:UpperArrayFieldLocalReceipt;
  if(move==='condense'){
    const batchId=upperArrayFieldLatticeBatchId(id);
    receipt={...base,move,batchId};
    actor.herbs.earth_root-=C.condense.roots;
    book.batches.push({id:batchId,actorId:actor.id,visitId:visit.id,tick,quantity:C.condense.produced});
    book.stock.push({batchId,quantity:C.condense.produced});
    recordResourceFlow(world,{kind:'consumption',mechanism:'upper_array_field',reason:'upper_lattice_material',
      from:flowActor(actor.id),amount:C.condense.roots,good:'earth_root',refId:id,visibility});
    recordResourceFlow(world,{kind:'production',mechanism:'upper_array_field',reason:'upper_lattice_produced',
      to:flowUpperArrayStore(),amount:C.condense.produced,good:'upper_lattice',refId:id,visibility});
  }else{
    const lot=ownedPieces(book,actor.id,tick)[0];
    if(!lot)return null;
    const spent={batchId:lot.batchId,quantity:C.cultivate.lattice};
    const beforeQi=actor.qiProgress,afterQi=Math.min(100,beforeQi+C.cultivate.qi);
    take(book,[spent]);
    actor.qiProgress=afterQi;
    receipt={...base,move,spent,beforeQi,afterQi};
    recordResourceFlow(world,{kind:'consumption',mechanism:'upper_array_field',reason:'upper_array_practice',
      from:flowUpperArrayStore(),amount:spent.quantity,good:'upper_lattice',refId:id,visibility});
  }
  book.receipts.push(receipt);
  actor.spiritStones-=cost.stones;
  actor.hp-=cost.hp;
  recordResourceFlow(world,{kind:'consumption',mechanism:'upper_array_field',reason:move==='condense'?'upper_lattice_material':'upper_array_practice',
    from:flowActor(actor.id),amount:cost.stones,good:'stone',refId:id,visibility});
  return {id:`evt-${id}`,tick,year:world.year,month:world.month,category:'heavenly',
    locationId:option.targetUpperArrayFieldSiteId,actorIds:[actor.id],witnessScope:'participants',
    title:move==='condense'?'凝纹墩结出两枚阵材':'晨修阵实耗阵材',
    description:move==='condense'?'以本人携来的玄土根为引，实付二灵石、耗四气血，照见两枚同源阵材。':
      '本人付三灵石与一枚有源阵材，耗四气血，凝聚一缕真气，未曾渡劫。'};
}

export function projectUpperArrayFieldLocal(world:WorldState,actor:Cultivator):UpperArrayFieldLocalView|undefined{
  const site=upperArrayFieldPhysicalSite(world,actor);
  return site?{siteId:site.id,resident:!!upperArrayFieldResidence(world,actor.id),stock:upperArrayLatticeStock(world,actor.id),
    options:availableUpperArrayFieldLocalActions(actor,world,world.tick+1)}:undefined;
}

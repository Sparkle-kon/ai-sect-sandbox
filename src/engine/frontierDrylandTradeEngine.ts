import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {frontierEdge,frontierSite} from './frontierTerms';
import {frontierActedOnGeography,frontierAnchor,frontierPhysicalSite,frontierResidence} from './frontierMovementEngine';
import {findMapPath} from './mapMotionEngine';
import {terrainTileAt} from './terrainEngine';
import {regionForColumn} from './simulationRegionGeometry';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {flowShipment,recordResourceFlow,sameFlowAccount} from './resourceFlowEngine';
import type {ResourceFlowDraft} from '../types/world';
import {canCreditDrylandStock,canPayDrylandHaul,creditDrylandStock,debitDrylandStock,ensureFrontierDrylandsState,
  drylandStock,flowDrylandStore,payDrylandHaul} from './frontierDrylandLocalEngine';
import type {DrylandBatchSlice,FrontierDrylandCustody,FrontierDrylandRegion} from './frontierDrylandTerms';
import {DRYLAND_TRADE_AMOUNT,DRYLAND_TRADE_LAND_STRIDE,DRYLAND_TRADE_MARKET,DRYLAND_TRADE_OFFER_MONTHS,
  DRYLAND_TRADE_TERM_MONTHS,drylandTradeGood,drylandTradeHaulRef,drylandTradeThunderDue,otherDrylandTradeSide,
  type FrontierDrylandCargoPoint,type FrontierDrylandTradeAgreement,type FrontierDrylandTradeCargo,type FrontierDrylandTradeMove,
  type FrontierDrylandTradeState} from './frontierDrylandTradeTerms';

const west='western-saltwell',ridge='plateau-thunderridge';
const westChart='chart-western-saltwell',ridgeChart='chart-plateau-thunderridge';
const westPath=['frontier-west-warehouse','frontier-west-trial','frontier-west-trail','frontier-west-gate'];
const ridgePath=['frontier-ridge-gate','frontier-ridge-saddle','frontier-ridge-ward','frontier-ridge-warehouse'];
const westCell='tile-4-3',ridgeCell='tile-19-3';
const same=(a:FrontierDrylandCargoPoint,b:FrontierDrylandCargoPoint)=>a.chartId===b.chartId&&a.tileId===b.tileId;
const aliveAdult=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.age>=18;
const actorById=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const sideOf=(row:FrontierDrylandTradeAgreement,id:string):FrontierDrylandRegion|undefined=>
  id===row.westActorId?west:id===row.ridgeActorId?ridge:undefined;
const cargoOf=(row:FrontierDrylandTradeAgreement,side:FrontierDrylandRegion)=>side===west?row.west:row.ridge;
const warehouse=(side:FrontierDrylandRegion)=>side===west?westPath[0]:ridgePath.at(-1)!;
const terminal=(status:FrontierDrylandTradeAgreement['status'])=>status==='expired'||status==='exchanged'||status==='returned';
const forEachCargo=(row:FrontierDrylandTradeAgreement,cb:(cargo:FrontierDrylandTradeCargo)=>void)=>{
  if(row.west)cb(row.west);if(row.ridge)cb(row.ridge);
};
export const createFrontierDrylandTradeState=():FrontierDrylandTradeState=>({agreements:[],nextId:1});

function atMarket(world:WorldState,actor:Cultivator,tick:number){
  return aliveAdult(actor)&&actor.positionPlane===undefined&&!frontierActedOnGeography(world,actor.id,tick)&&
    frontierAnchor(world,'south-marsh')?.id===DRYLAND_TRADE_MARKET&&doctrineFoundingPhysicallyAt(world,actor,DRYLAND_TRADE_MARKET,tick);
}
function loadResidence(world:WorldState,actor:Cultivator,side:FrontierDrylandRegion,tick:number){
  const residence=frontierResidence(world,actor.id);
  return aliveAdult(actor)&&residence?.regionId===side&&residence.settledTick<tick&&
    frontierPhysicalSite(world,actor,tick)?.id===warehouse(side)&&!frontierActedOnGeography(world,actor.id,tick)?residence:undefined;
}
export function frontierDrylandTradePhysicalEdge(world:WorldState,from:FrontierDrylandCargoPoint,to:FrontierDrylandCargoPoint):boolean{
  if(from.chartId===to.chartId){
    if(from.chartId==='lower-base'){
      const a=world.terrain.tiles.find(tile=>tile.id===from.tileId),b=world.terrain.tiles.find(tile=>tile.id===to.tileId);
      return !!(a&&b&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1);
    }
    const a=frontierSite(from.tileId),b=frontierSite(to.tileId);
    return !!(a?.chartId===from.chartId&&b?.chartId===to.chartId&&frontierEdge(a.id,b.id)&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1);
  }
  const old=from.chartId==='lower-base'?from:to,local=old===from?to:from;
  if(old.chartId!=='lower-base')return false;
  return local.chartId===westChart&&local.tileId==='frontier-west-gate'&&old.tileId===westCell&&!!frontierAnchor(world,west)||
    local.chartId===ridgeChart&&local.tileId==='frontier-ridge-gate'&&old.tileId===ridgeCell&&!!frontierAnchor(world,ridge);
}
export function frontierDrylandTradeCheckpoints(world:WorldState,from:FrontierDrylandRegion):FrontierDrylandCargoPoint[]|undefined{
  const westAnchor=frontierAnchor(world,west),ridgeAnchor=frontierAnchor(world,ridge);
  if(westAnchor?.id!=='loc-taixu'||ridgeAnchor?.id!=='loc-tianji')return;
  const old:FrontierDrylandCargoPoint[]=[],regions=new Set<string>();
  for(const point of findMapPath(world,westAnchor,ridgeAnchor,tile=>tile.id===westCell||tile.id===ridgeCell||tile.biome!=='魔渊')){
    const tile=terrainTileAt(world,point.x,point.y);if(!tile)return;
    const region=regionForColumn(tile.col,world.terrain.columns);if(region)regions.add(region);
    if(old.at(-1)?.tileId!==tile.id)old.push({chartId:'lower-base',tileId:tile.id});
  }
  if(old.length<2||old[0].tileId!==westCell||old.at(-1)?.tileId!==ridgeCell||[...regions].join(',')!=='west,center,east')return;
  const path:FrontierDrylandCargoPoint[]=[...westPath.map(tileId=>({chartId:westChart,tileId} as const)),...old,
    ...ridgePath.map(tileId=>({chartId:ridgeChart,tileId} as const))];
  if(new Set(path.map(row=>row.chartId+'/'+row.tileId)).size!==path.length||
    !path.every((item,i)=>i===0||frontierDrylandTradePhysicalEdge(world,path[i-1],item)))return;
  return from===west?path:path.reverse();
}

export type FrontierDrylandTradeOption=
  | {action:'FRONTIER_DRYLAND_TRADE';frontierDrylandTradeMove:'propose';targetCultivatorId:string;targetFrontierDrylandTradeId?:never}
  | {action:'FRONTIER_DRYLAND_TRADE';frontierDrylandTradeMove:Exclude<FrontierDrylandTradeMove,'propose'>;targetFrontierDrylandTradeId:string;targetCultivatorId?:never};
export function availableFrontierDrylandTradeActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierDrylandTradeOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!aliveAdult(actor)||actorById(world,actor.id)!==actor)return [];
  const rows=world.frontier?.drylands?.trade?.agreements??[];
  const own=rows.find(row=>!terminal(row.status)&&sideOf(row,actor.id));
  if(!own){
    if(!atMarket(world,actor,executionTick))return [];
    const blocked=new Set(rows.filter(row=>!terminal(row.status)).flatMap(row=>[row.westActorId,row.ridgeActorId]));
    return world.cultivators.filter(a=>a.id!==actor.id&&!blocked.has(a.id)&&atMarket(world,a,executionTick))
      .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
      .map(a=>({action:'FRONTIER_DRYLAND_TRADE',frontierDrylandTradeMove:'propose',targetCultivatorId:a.id}));
  }
  const side=sideOf(own,actor.id)!;
  const option=(frontierDrylandTradeMove:'accept'|'load'):FrontierDrylandTradeOption=>
    ({action:'FRONTIER_DRYLAND_TRADE',frontierDrylandTradeMove,targetFrontierDrylandTradeId:own.id});
  if(own.status==='offered'&&side===ridge&&executionTick>own.offeredTick&&executionTick<=own.offeredTick+DRYLAND_TRADE_OFFER_MONTHS){
    const proposer=actorById(world,own.westActorId);
    return proposer&&atMarket(world,actor,executionTick)&&atMarket(world,proposer,executionTick)?[option('accept')]:[];
  }
  if(own.status!=='accepted'||own.acceptedTick===undefined||executionTick<=own.acceptedTick||
    executionTick>=own.acceptedTick+DRYLAND_TRADE_TERM_MONTHS||cargoOf(own,side)||!loadResidence(world,actor,side,executionTick)||
    !canPayDrylandHaul(world,actor,side,executionTick)||drylandStock(world,side,drylandTradeGood(side))<DRYLAND_TRADE_AMOUNT||
    !frontierDrylandTradeCheckpoints(world,side))return [];
  return [option('load')];
}
const intentFields=new Set(['action','chosenAction','innerMonologue','spokenLine','frontierDrylandTradeMove','targetCultivatorId','targetFrontierDrylandTradeId']);
function event(world:WorldState,row:FrontierDrylandTradeAgreement,kind:string,title:string,description:string):WorldEvent{
  return {id:`evt-frontier-dryland-trade-${row.id}-${kind}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',actorIds:[row.westActorId,row.ridgeActorId],witnessScope:'participants',title,description};
}
type TransferPhase='load'|'exchange'|'return';
function tradeFlow(row:FrontierDrylandTradeAgreement,cargo:FrontierDrylandTradeCargo,phase:TransferPhase):Extract<ResourceFlowDraft,{kind:'transfer'}>{
  const refId=drylandTradeHaulRef(row.id,cargo.from);
  const origin=flowDrylandStore(cargo.from),hold=flowShipment(refId);
  return {kind:'transfer',mechanism:'frontier',reason:`frontier_dryland_trade_${phase}`,good:cargo.good,
    amount:DRYLAND_TRADE_AMOUNT,refId,
    from:phase==='load'?origin:hold,to:phase==='load'?hold:phase==='return'?origin:flowDrylandStore(otherDrylandTradeSide(cargo.from)),
    visibility:{kind:'participants',actorIds:[row.westActorId,row.ridgeActorId]}};
}
export function resolveFrontierDrylandTradeAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const internal=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='FRONTIER_DRYLAND_TRADE'||internal!==undefined&&internal!=='FRONTIER_DRYLAND_TRADE'||
    Object.entries(payload).some(([key,value])=>value!==undefined&&!intentFields.has(key)))return null;
  const choice=availableFrontierDrylandTradeActions(actor,world).find(row=>row.frontierDrylandTradeMove===payload.frontierDrylandTradeMove&&
    row.targetCultivatorId===payload.targetCultivatorId&&row.targetFrontierDrylandTradeId===payload.targetFrontierDrylandTradeId);
  if(!choice)return null;
  const dry=ensureFrontierDrylandsState(world);
  const state=dry.trade??=createFrontierDrylandTradeState();
  if(choice.frontierDrylandTradeMove==='propose'){
    const row:FrontierDrylandTradeAgreement={id:`frontier-dryland-trade-${state.nextId++}`,westActorId:actor.id,
      ridgeActorId:choice.targetCultivatorId,offeredTick:world.tick,status:'offered'};
    state.agreements.push(row);
    return event(world,row,'offer','旧坊相见议互养','两人确在旧坊相见，提议两盐换两雷石，任何一边尚未装货。');
  }
  const row=state.agreements.find(deal=>deal.id===choice.targetFrontierDrylandTradeId)!;
  if(choice.frontierDrylandTradeMove==='accept'){
    row.status='accepted';row.acceptedTick=world.tick;
    return event(world,row,'accept','两地当面定约','另一个月，两人亲在旧坊接受交换；各仓现货不因立约增减。');
  }
  const side=sideOf(row,actor.id)!,residence=loadResidence(world,actor,side,world.tick),checkpoints=frontierDrylandTradeCheckpoints(world,side);
  if(!residence||!checkpoints||!payDrylandHaul(world,actor,side,drylandTradeHaulRef(row.id,side)))return null;
  const good=drylandTradeGood(side),lots=debitDrylandStock(world,side,good,DRYLAND_TRADE_AMOUNT);
  if(!lots)throw new Error('已核对的本地原批未能完成装货。');
  const cargo:FrontierDrylandTradeCargo={from:side,good,lots,loadedTick:world.tick,residenceId:residence.id,
    checkpoints,walks:[],waits:[],cursor:0,status:'in_transit'};
  if(side===west)row.west=cargo;else row.ridge=cargo;
  recordResourceFlow(world,tradeFlow(row,cargo,'load'));
  return event(world,row,`load-${side}`,'在地实货受托',side===west?
    '原盐已经入托，实付同一口井的一份水。尚未动身，水是出运开支，不随盐退。':
    '原雷石已经入托，实占当期一份牧运工。尚未动身，实际牧工不随石退。');
}
function walk(world:WorldState,cargo:FrontierDrylandTradeCargo,tick:number,month:number,returning:boolean){
  if(tick<=cargo.loadedTick)return;
  const last=cargo.checkpoints.length-1,end=returning?0:last,dir=returning?-1:1;
  for(let stride=0;stride<DRYLAND_TRADE_LAND_STRIDE&&cargo.cursor!==end;stride++){
    const next=cargo.cursor+dir,a=cargo.checkpoints[cargo.cursor],b=cargo.checkpoints[next];
    const land=a.chartId==='lower-base'&&b.chartId==='lower-base';
    if(stride>0&&!land)break;
    if(!frontierDrylandTradePhysicalEdge(world,a,b))throw new Error('这一步没有真实相邻地格或合法接口。');
    if(drylandTradeThunderDue(a,b,month)){
      cargo.waits.push({tick,fromStep:cargo.cursor,toStep:next,reason:'thunder_closed'});return;
    }
    cargo.cursor=next;cargo.walks.push({tick,step:next});
    if(!land)break;
  }
  if(cargo.cursor===end){
    cargo.status=returning?'home_wait':'arrived';
    if(!returning)cargo.arrivedTick=tick;
  }
}
export function advanceFrontierDrylandTrade(world:WorldState):WorldEvent[]{
  const state=world.frontier?.drylands?.trade;
  if(!state||state.lastAdvancedTick===world.tick)return [];
  state.lastAdvancedTick=world.tick;
  const events:WorldEvent[]=[];
  for(const row of state.agreements){
    if(terminal(row.status))continue;
    if(row.status==='offered'){
      if(world.tick>=row.offeredTick+DRYLAND_TRADE_OFFER_MONTHS){row.status='expired';row.closedTick=world.tick;}
      continue;
    }
    if(row.status==='accepted'&&world.tick>=row.acceptedTick!+DRYLAND_TRADE_TERM_MONTHS){
      row.status='returning';row.returnsTick=world.tick;
      forEachCargo(row,cargo=>{cargo.status='returning';});
    }
    if(row.status==='accepted'){
      forEachCargo(row,cargo=>{if(cargo.status==='in_transit')walk(world,cargo,world.tick,world.month,false);});
      const a=row.west,b=row.ridge;
      if(a?.status==='arrived'&&b?.status==='arrived'&&canCreditDrylandStock(world,ridge,a.lots)&&canCreditDrylandStock(world,west,b.lots)){
        if(!creditDrylandStock(world,ridge,a.lots)||!creditDrylandStock(world,west,b.lots))throw new Error('两端核验后未能同时收货。');
        a.status=b.status='delivered';a.closedTick=b.closedTick=world.tick;row.status='exchanged';row.closedTick=world.tick;
        recordResourceFlow(world,tradeFlow(row,a,'exchange'));recordResourceFlow(world,tradeFlow(row,b,'exchange'));
        events.push(event(world,row,'exchanged','两批货方得同交','两仓都已见到从对方原仓走来的真货，现首次同时实入仓。'));
      }
    }else if(row.status==='returning'){
      forEachCargo(row,cargo=>{
        if(cargo.status==='returning')walk(world,cargo,world.tick,world.month,true);
        if(cargo.status==='home_wait'&&canCreditDrylandStock(world,cargo.from,cargo.lots)){
          if(!creditDrylandStock(world,cargo.from,cargo.lots))throw new Error('原仓核验后未能接回原批。');
          cargo.status='returned';cargo.closedTick=world.tick;
          recordResourceFlow(world,tradeFlow(row,cargo,'return'));
        }
      });
      if([row.west,row.ridge].every(cargo=>!cargo||cargo.status==='returned')){
        row.status='returned';row.closedTick=world.tick;
        events.push(event(world,row,'returned','失约货批循原路回仓','没有完成互换；已启程货批真实回到原仓，已耗水与牧工不退。'));
      }
    }
  }
  return events;
}

type CargoView={readonly status:FrontierDrylandTradeCargo['status'];readonly good:FrontierDrylandTradeCargo['good'];
  readonly quantity:2;readonly stepsCompleted:number;readonly pathLength:number;readonly waitedThunder:number;readonly waiting?:'thunder_closed'};
export interface FrontierDrylandTradeView {
  readonly id:string;readonly status:FrontierDrylandTradeAgreement['status'];readonly yourSide:FrontierDrylandRegion;
  readonly offeredTick:number;readonly acceptedTick?:number;readonly closedTick?:number;
  readonly west?:CargoView;readonly ridge?:CargoView;
}
export function projectFrontierDrylandTrade(world:WorldState,viewer?:Cultivator):FrontierDrylandTradeView[]{
  if(!viewer||!aliveAdult(viewer)||actorById(world,viewer.id)!==viewer)return [];
  const project=(cargo:FrontierDrylandTradeCargo):CargoView=>({status:cargo.status,good:cargo.good,quantity:DRYLAND_TRADE_AMOUNT,
    stepsCompleted:cargo.cursor,pathLength:cargo.checkpoints.length-1,waitedThunder:cargo.waits.length,
    ...(cargo.waits.at(-1)?.tick===world.tick?{waiting:'thunder_closed'}:{})});
  return (world.frontier?.drylands?.trade?.agreements??[]).filter(row=>sideOf(row,viewer.id)).slice(-8).reverse().map(row=>({
    id:row.id,status:row.status,yourSide:sideOf(row,viewer.id)!,offeredTick:row.offeredTick,acceptedTick:row.acceptedTick,
    closedTick:row.closedTick,...(row.west?{west:project(row.west)}:{}),...(row.ridge?{ridge:project(row.ridge)}:{})}));
}
/** The local inventory verifier independently replays when each named finite lot leaves or actually enters a bin. */
export function frontierDrylandTradeCustody(world:WorldState):FrontierDrylandCustody[]{
  return (world.frontier?.drylands?.trade?.agreements??[]).flatMap(row=>[row.west,row.ridge].flatMap(cargo=>{
    if(!cargo)return [];
    const source={agreementId:row.id,refId:drylandTradeHaulRef(row.id,cargo.from),actorId:cargo.from===west?row.westActorId:row.ridgeActorId,
      from:cargo.from,loadedTick:cargo.loadedTick,slices:cargo.lots};
    if(cargo.status==='returned')return [{...source,to:cargo.from,landedTick:cargo.closedTick}];
    if(cargo.status==='delivered')return [{...source,to:otherDrylandTradeSide(cargo.from),landedTick:cargo.closedTick}];
    return [source];
  }));
}
const monthAt=(world:WorldState,tick:number)=>((world.month-1+tick-world.tick)%12+12)%12+1;
function exactLots(lots:readonly DrylandBatchSlice[]){
  return lots.length>0&&lots.length<=DRYLAND_TRADE_AMOUNT&&new Set(lots.map(lot=>lot.batchId)).size===lots.length&&
    lots.every(lot=>typeof lot.batchId==='string'&&lot.batchId.length>0&&Number.isSafeInteger(lot.amount)&&lot.amount>0)&&
    lots.reduce((total,lot)=>total+lot.amount,0)===DRYLAND_TRADE_AMOUNT;
}
function verifyCargo(world:WorldState,row:FrontierDrylandTradeAgreement,cargo:FrontierDrylandTradeCargo,side:FrontierDrylandRegion,through:number){
  const accepted=row.acceptedTick;
  if(accepted===undefined||cargo.from!==side||cargo.good!==drylandTradeGood(side)||!Number.isSafeInteger(cargo.loadedTick)||
    cargo.loadedTick<=accepted||cargo.loadedTick>=accepted+DRYLAND_TRADE_TERM_MONTHS||cargo.loadedTick>world.tick||!exactLots(cargo.lots))return false;
  const actorId=side===west?row.westActorId:row.ridgeActorId;
  if(!world.frontier?.residences.some(res=>res.id===cargo.residenceId&&res.actorId===actorId&&res.regionId===side&&res.settledTick<cargo.loadedTick)||
    !world.frontier.visits.some(visit=>visit.actorId===actorId&&visit.regionId===side&&visit.enteredTick<cargo.loadedTick&&
      (visit.exitedTick===undefined||visit.exitedTick>cargo.loadedTick)&&(visit.deceasedTick===undefined||visit.deceasedTick>cargo.loadedTick)&&
      visit.steps.filter(step=>step.tick<cargo.loadedTick).at(-1)?.siteId===warehouse(side)))return false;
  const path=frontierDrylandTradeCheckpoints(world,side);
  if(!path||cargo.checkpoints.length!==path.length||!path.every((point,i)=>same(point,cargo.checkpoints[i])))return false;
  const replay:FrontierDrylandTradeCargo={...cargo,cursor:0,walks:[],waits:[],status:'in_transit',arrivedTick:undefined,closedTick:undefined};
  const ceiling=Math.min(through,row.closedTick??Infinity,accepted+DRYLAND_TRADE_TERM_MONTHS+path.length*3+12);
  for(let tick=cargo.loadedTick+1;tick<=ceiling;tick++){
    if(tick===row.returnsTick)replay.status='returning';
    if(replay.status==='in_transit'||replay.status==='returning')walk(world,replay,tick,monthAt(world,tick),replay.status==='returning');
    if(replay.status==='home_wait')break;
  }
  if(cargo.status==='delivered'){
    if(row.status!=='exchanged'||cargo.closedTick!==row.closedTick||replay.status!=='arrived')return false;
    replay.status='delivered';
  }else if(cargo.status==='returned'){
    if(row.returnsTick===undefined||replay.status!=='home_wait'||cargo.closedTick===undefined||
      cargo.closedTick<Math.max(row.returnsTick,replay.walks.at(-1)?.tick??0)||cargo.closedTick>through)return false;
    replay.status='returned';
  }else if(cargo.closedTick!==undefined)return false;
  return replay.cursor===cargo.cursor&&replay.status===cargo.status&&replay.arrivedTick===cargo.arrivedTick&&
    replay.walks.length===cargo.walks.length&&replay.walks.every((stamp,i)=>stamp.tick===cargo.walks[i].tick&&stamp.step===cargo.walks[i].step)&&
    replay.waits.length===cargo.waits.length&&replay.waits.every((stamp,i)=>stamp.tick===cargo.waits[i].tick&&stamp.reason===cargo.waits[i].reason&&
      stamp.fromStep===cargo.waits[i].fromStep&&stamp.toStep===cargo.waits[i].toStep);
}
/** Semantic replay; codec must check primitive/nested shape before calling. Does not mutate any original cargo. */
export function verifyFrontierDrylandTradeAgreement(world:WorldState,row:FrontierDrylandTradeAgreement,
  through=world.frontier?.drylands?.trade?.lastAdvancedTick??0){
  if(!Number.isSafeInteger(row.offeredTick)||row.offeredTick<1||row.offeredTick>world.tick||row.westActorId===row.ridgeActorId||
    !actorById(world,row.westActorId)||!actorById(world,row.ridgeActorId))return false;
  const accept=row.acceptedTick,offeredEnd=row.offeredTick+DRYLAND_TRADE_OFFER_MONTHS;
  if(row.status==='offered'||row.status==='expired')return accept===undefined&&row.returnsTick===undefined&&
    row.west===undefined&&row.ridge===undefined&&(row.status==='offered'?row.closedTick===undefined&&through<offeredEnd:
      row.closedTick===offeredEnd&&offeredEnd<=through);
  if(accept===undefined||!Number.isSafeInteger(accept)||accept<=row.offeredTick||accept>offeredEnd||accept>world.tick)return false;
  const due=accept+DRYLAND_TRADE_TERM_MONTHS;
  if(row.status==='accepted'||row.status==='exchanged'){
    if(row.returnsTick!==undefined||(row.status==='accepted'?row.closedTick!==undefined||through>=due:
      row.closedTick===undefined||row.closedTick>=due||row.closedTick>through||
      row.west?.status!=='delivered'||row.ridge?.status!=='delivered'))return false;
  }else if(row.status==='returning'||row.status==='returned'){
    const allHome=[row.west,row.ridge].every(cargo=>!cargo||cargo.status==='returned');
    if(row.returnsTick!==due||due>through||(row.status==='returning'?row.closedTick!==undefined||allHome:
      !allHome||row.closedTick!==Math.max(due,row.west?.closedTick??0,row.ridge?.closedTick??0)||row.closedTick>through))return false;
  }else return false;
  try{return (!row.west||verifyCargo(world,row,row.west,west,through))&&(!row.ridge||verifyCargo(world,row,row.ridge,ridge,through));}
  catch{return false;}
}

/** Reconcile only journal details still retained after its generic 6-month/detail cap. */
export function verifyFrontierDrylandTradeJournal(world:WorldState):boolean {
  const retained=new Map(world.resourceFlow.months.map(month=>[month.tick,month]));
  const expected=new Map<string,ReturnType<typeof tradeFlow>>();
  const key=(tick:number,ref:string,reason:string)=>`${tick}:${ref}:${reason}`;
  for(const row of world.frontier?.drylands?.trade?.agreements??[])forEachCargo(row,cargo=>{
    const put=(tick:number,phase:TransferPhase)=>{
      if(retained.has(tick)){const flow=tradeFlow(row,cargo,phase);expected.set(key(tick,flow.refId,flow.reason),flow);}
    };
    put(cargo.loadedTick,'load');
    if(cargo.closedTick!==undefined){
      if(cargo.status==='delivered')put(cargo.closedTick,'exchange');
      if(cargo.status==='returned')put(cargo.closedTick,'return');
    }
  });
  for(const month of retained.values()){
    for(const actual of month.entries){
      if(!actual.reason.startsWith('frontier_dryland_trade_'))continue;
      const label=key(month.tick,actual.refId,actual.reason),row=expected.get(label);
      if(!row||actual.kind!=='transfer'||actual.mechanism!==row.mechanism||actual.good!==row.good||actual.amount!==row.amount||
        !sameFlowAccount(actual.from,row.from)||!sameFlowAccount(actual.to,row.to)||actual.visibility.kind!=='participants'||
        row.visibility.kind!=='participants'||actual.visibility.actorIds.length!==2||
        actual.visibility.actorIds.some((id,i)=>row.visibility.kind!=='participants'||id!==row.visibility.actorIds[i]))return false;
      expected.delete(label);
    }
    if(month.totalEntries===month.entries.length&&[...expected.keys()].some(label=>label.startsWith(month.tick+':')))return false;
  }
  return true;
}

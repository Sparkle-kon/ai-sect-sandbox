import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {findMapPath} from './mapMotionEngine';
import {terrainTileAt} from './terrainEngine';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {FRONTIER_CHARTS,frontierEdge,frontierSite} from './frontierTerms';
import {frontierActedOnGeography,frontierAnchor,frontierPhysicalSite,frontierResidence,ensureFrontierState} from './frontierMovementEngine';
import {canCreditFrontierTradeStock,consumeFrontierTradeStock,creditFrontierTradeStock,debitFrontierTradeStock,frontierProductionActed,frontierTradeStock} from './frontierProductionEngine';
import {frontierTradeColdMonth,frontierTradeWinterRef,frontierTradeGood,otherFrontierTradeSide,FRONTIER_TRADE_AMOUNT,FRONTIER_TRADE_OFFER_MONTHS,
  FRONTIER_TRADE_STRIDE,FRONTIER_TRADE_TERM_MONTHS,FRONTIER_TRADE_WINTER_REEDS,type FrontierTradeAgreement,type FrontierTradeCargo,
  type FrontierTradeCheckpoint,type FrontierTradeMove,type FrontierTradeRoute,type FrontierTradeSide,type FrontierTradeState} from './frontierTradeTerms';

const north='north-snow',south='south-marsh',market='loc-market';
const standardNorth=['frontier-north-home','frontier-north-pass','frontier-north-gate'];
const winterNorth=['frontier-north-home','frontier-north-lee-east','frontier-north-lee-mid','frontier-north-lee-west','frontier-north-gate'];
const normalSouth=['frontier-south-gate','frontier-south-crossway','frontier-south-home'];
const same=(a:FrontierTradeCheckpoint,b:FrontierTradeCheckpoint)=>a.chartId===b.chartId&&a.tileId===b.tileId;
const lower=(tileId:string):FrontierTradeCheckpoint=>({chartId:'lower-base',tileId});
const liveAdult=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.age>=18;
const participant=(trade:FrontierTradeAgreement,id:string):FrontierTradeSide|undefined=>
  id===trade.northActorId?north:id===trade.southActorId?south:undefined;
const terminal=(status:FrontierTradeAgreement['status'])=>status==='expired'||status==='exchanged'||status==='returned';
const cargoFor=(trade:FrontierTradeAgreement,side:FrontierTradeSide)=>side===north?trade.north:trade.south;
const forEachCargo=(trade:FrontierTradeAgreement,cb:(cargo:FrontierTradeCargo)=>void)=>{
  if(trade.north)cb(trade.north);if(trade.south)cb(trade.south);
};

export const createFrontierTradeState=():FrontierTradeState=>({agreements:[],nextId:1});
function nativeTick(world:WorldState,executionTick:number){return executionTick===world.tick||executionTick===world.tick+1;}
function signedAtMarket(world:WorldState,actor:Cultivator,executionTick:number):boolean {
  return liveAdult(actor)&&actor.positionPlane===undefined&&actor.locationId===market&&!!frontierAnchor(world,south)&&
    !frontierActedOnGeography(world,actor.id,executionTick)&&doctrineFoundingPhysicallyAt(world,actor,market,executionTick);
}
function warehouseResidence(world:WorldState,actor:Cultivator,side:FrontierTradeSide,executionTick:number){
  const residence=frontierResidence(world,actor.id);
  return liveAdult(actor)&&residence?.regionId===side&&!frontierActedOnGeography(world,actor.id,executionTick)&&
    !frontierProductionActed(world,actor.id,executionTick)&&frontierPhysicalSite(world,actor,executionTick)?.id===FRONTIER_CHARTS[side].homeId
    ?residence:undefined;
}
export function frontierTradeCheckpoints(world:WorldState,from:FrontierTradeSide,route:FrontierTradeRoute):FrontierTradeCheckpoint[]|undefined {
  const n=frontierAnchor(world,north),s=frontierAnchor(world,south);
  if(!n||!s)return;
  const nTile=FRONTIER_CHARTS[north].anchorTileId,sTile=FRONTIER_CHARTS[south].anchorTileId;
  const base:FrontierTradeCheckpoint[]=[];
  for(const point of findMapPath(world,n,s,tile=>tile.id===nTile||tile.id===sTile||tile.biome!=='魔渊')){
    const tile=terrainTileAt(world,point.x,point.y);
    if(!tile)return;
    if(base.at(-1)?.tileId!==tile.id)base.push(lower(tile.id));
  }
  if(base.length<2||base[0].tileId!==nTile||base.at(-1)?.tileId!==sTile)return;
  const local=(side:FrontierTradeSide,ids:readonly string[])=>ids.map(tileId=>({chartId:FRONTIER_CHARTS[side].id,tileId}));
  const points=[...local(north,route==='winter'?winterNorth:standardNorth),...base,...local(south,normalSouth)];
  if(new Set(points.map(point=>point.chartId+'/'+point.tileId)).size!==points.length)return;
  return from===north?points:points.reverse();
}
export function frontierTradeEdge(world:WorldState,from:FrontierTradeCheckpoint,to:FrontierTradeCheckpoint):{winterClosed:boolean}|undefined {
  if(from.chartId===to.chartId){
    if(from.chartId==='lower-base'){
      const a=world.terrain.tiles.find(tile=>tile.id===from.tileId),b=world.terrain.tiles.find(tile=>tile.id===to.tileId);
      return a&&b&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1?{winterClosed:false}:undefined;
    }
    const a=frontierSite(from.tileId),b=frontierSite(to.tileId),edge=frontierEdge(from.tileId,to.tileId);
    return a?.chartId===from.chartId&&b?.chartId===to.chartId&&edge&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1
      ?{winterClosed:!!edge.winterClosed}:undefined;
  }
  const old=from.chartId==='lower-base'?from:to,other=old===from?to:from;
  if(old.chartId!=='lower-base')return;
  const chart=Object.values(FRONTIER_CHARTS).find(item=>item.id===other.chartId);
  return chart?.anchorTileId===old.tileId&&chart.gateId===other.tileId
    &&frontierAnchor(world,chart.id===FRONTIER_CHARTS[north].id?north:south)?{winterClosed:false}:undefined;
}
export type FrontierTradeOption=
  | {action:'FRONTIER_TRADE';frontierTradeMove:'propose';targetCultivatorId:string;targetFrontierTradeId?:never}
  | {action:'FRONTIER_TRADE';frontierTradeMove:Exclude<FrontierTradeMove,'propose'>;targetFrontierTradeId:string;targetCultivatorId?:never};

export function availableFrontierTradeActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierTradeOption[]{
  if(!nativeTick(world,executionTick)||!liveAdult(actor))return [];
  const all=world.frontier?.trade?.agreements??[];
  const own=all.find(row=>!terminal(row.status)&&participant(row,actor.id));
  if(!own){
    if(!signedAtMarket(world,actor,executionTick))return [];
    const occupied=new Set(all.filter(row=>!terminal(row.status)).flatMap(row=>[row.northActorId,row.southActorId]));
    return world.cultivators.filter(candidate=>candidate.id!==actor.id&&!occupied.has(candidate.id)&&signedAtMarket(world,candidate,executionTick))
      .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
      .map(candidate=>({action:'FRONTIER_TRADE',frontierTradeMove:'propose',targetCultivatorId:candidate.id}));
  }
  const side=participant(own,actor.id)!;
  const option=(frontierTradeMove:Exclude<FrontierTradeMove,'propose'>):FrontierTradeOption=>
    ({action:'FRONTIER_TRADE',frontierTradeMove,targetFrontierTradeId:own.id});
  if(own.status==='offered'&&side===south&&executionTick>own.offeredTick&&executionTick<=own.offeredTick+FRONTIER_TRADE_OFFER_MONTHS){
    const proposer=world.cultivators.find(person=>person.id===own.northActorId);
    return proposer&&signedAtMarket(world,actor,executionTick)&&signedAtMarket(world,proposer,executionTick)?[option('accept')]:[];
  }
  if(own.status!=='accepted'||own.acceptedTick===undefined||executionTick<=own.acceptedTick||
    executionTick>=own.acceptedTick+FRONTIER_TRADE_TERM_MONTHS||cargoFor(own,side)||!warehouseResidence(world,actor,side,executionTick))return [];
  const good=frontierTradeGood(side),stock=frontierTradeStock(world,side,good);
  if(stock<FRONTIER_TRADE_AMOUNT||!frontierTradeCheckpoints(world,side,'standard'))return [];
  return frontierTradeStock(world,side,'ward_reed')>=FRONTIER_TRADE_WINTER_REEDS+(good==='ward_reed'?FRONTIER_TRADE_AMOUNT:0)&&
    frontierTradeCheckpoints(world,side,'winter')?[option('load'),option('load_winter')]:[option('load')];
}
const privateIntentFields=new Set(['chosenAction','action','innerMonologue','spokenLine','frontierTradeMove','targetCultivatorId','targetFrontierTradeId']);
function event(world:WorldState,trade:FrontierTradeAgreement,kind:string,title:string,description:string):WorldEvent {
  return {id:`evt-frontier-trade-${trade.id}-${kind}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
    actorIds:[trade.northActorId,trade.southActorId],witnessScope:'participants',category:'diplomacy',title,description};
}
export function resolveFrontierTradeAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction!=='FRONTIER_TRADE'||Object.entries(payload).some(([key,value])=>value!==undefined&&!privateIntentFields.has(key)))return null;
  const option=availableFrontierTradeActions(actor,world).find(o=>o.frontierTradeMove===payload.frontierTradeMove&&
    o.targetCultivatorId===payload.targetCultivatorId&&o.targetFrontierTradeId===payload.targetFrontierTradeId);
  if(!option)return null;
  // Presence checks ran against canonical actor and the actual active world before optional state initialization.
  if(world.cultivators.find(a=>a.id===actor.id)!==actor)return null;
  const frontier=ensureFrontierState(world);
  const state=frontier.trade??=createFrontierTradeState();
  if(option.frontierTradeMove==='propose'){
    const trade:FrontierTradeAgreement={id:`frontier-trade-${state.nextId++}`,northActorId:actor.id,southActorId:option.targetCultivatorId,
      offeredTick:world.tick,status:'offered'};
    state.agreements.push(trade);
    return event(world,trade,'offered','两地互换立议','两人确在旧坊市当面议价；暂未押货，也没有远程签收。');
  }
  const trade=state.agreements.find(row=>row.id===option.targetFrontierTradeId)!;
  if(option.frontierTradeMove==='accept'){
    trade.acceptedTick=world.tick;trade.status='accepted';
    return event(world,trade,'accepted','两地互换定约','两人再次在旧坊市见面，独立签下各两份在地货的互换约。');
  }
  const from=participant(trade,actor.id)!,route=option.frontierTradeMove==='load_winter'?'winter':'standard';
  const checkpoints=frontierTradeCheckpoints(world,from,route),residence=warehouseResidence(world,actor,from,world.tick);
  if(!checkpoints||!residence)return null;
  const good=frontierTradeGood(from);
  const winterReeds=route==='winter'?consumeFrontierTradeStock(world,from,'ward_reed',FRONTIER_TRADE_WINTER_REEDS,
    {actorId:actor.id,refId:frontierTradeWinterRef(trade.id,from),purpose:'winter_detour'}):undefined;
  if(route==='winter'&&!winterReeds)return null;
  const lots=debitFrontierTradeStock(world,from,good,FRONTIER_TRADE_AMOUNT);
  if(!lots)throw new Error('已核对的互换原仓无法完成原子装货。');
  const cargo:FrontierTradeCargo={from,good,lots,loadedTick:world.tick,residenceId:residence.id,route,checkpoints,
    ...(winterReeds?{winterReeds}:{}),walks:[],winterWaitTicks:[],cursor:0,status:'in_transit'};
  if(from===north)trade.north=cargo;else trade.south=cargo;
  return event(world,trade,`loaded-${from}`,'在地实货入托',route==='winter'?
    '原仓实扣货物和另付一份御寒芦，托运选背风旁道。货仍在原地，尚未越关。':'原仓实扣货物入独立托管。货仍在原地，尚未越关。');
}
function walk(world:WorldState,cargo:FrontierTradeCargo,tick:number,month:number,returning:boolean){
  if(tick<=cargo.loadedTick)return;
  const last=cargo.checkpoints.length-1,end=returning?0:last,dir=returning?-1:1;
  for(let steps=0;steps<FRONTIER_TRADE_STRIDE&&cargo.cursor!==end;steps++){
    const next=cargo.cursor+dir,edge=frontierTradeEdge(world,cargo.checkpoints[cargo.cursor],cargo.checkpoints[next]);
    if(!edge)throw new Error('互换货路不再是实有相邻格，不能跨过去。');
    if(edge.winterClosed&&frontierTradeColdMonth(month)){cargo.winterWaitTicks.push(tick);return;}
    cargo.cursor=next;cargo.walks.push({tick,step:next});
  }
  if(cargo.cursor===end){
    cargo.status=returning?'home_wait':'arrived';
    if(!returning)cargo.arrivedTick=tick;
  }
}
export function advanceFrontierTrade(world:WorldState):WorldEvent[] {
  const state=world.frontier?.trade;
  if(!state||state.lastAdvancedTick===world.tick)return [];
  state.lastAdvancedTick=world.tick;
  const events:WorldEvent[]=[];
  for(const trade of state.agreements){
    if(terminal(trade.status))continue;
    if(trade.status==='offered'){
      if(world.tick>=trade.offeredTick+FRONTIER_TRADE_OFFER_MONTHS){trade.status='expired';trade.closedTick=world.tick;}
      continue;
    }
    if(trade.status==='accepted'&&world.tick>=trade.acceptedTick!+FRONTIER_TRADE_TERM_MONTHS){
      trade.status='returning';trade.returnsTick=world.tick;
      forEachCargo(trade,cargo=>{cargo.status='returning';});
    }
    if(trade.status==='accepted'){
      forEachCargo(trade,cargo=>{if(cargo.status==='in_transit')walk(world,cargo,world.tick,world.month,false);});
      const n=trade.north,s=trade.south;
      if(n?.status==='arrived'&&s?.status==='arrived'&&canCreditFrontierTradeStock(world,south,n.lots)&&canCreditFrontierTradeStock(world,north,s.lots)){
        if(!creditFrontierTradeStock(world,south,n.lots)||!creditFrontierTradeStock(world,north,s.lots))
          throw new Error('两地已核对仓位却未能同时交接实货。');
        n.status=s.status='delivered';n.closedTick=s.closedTick=world.tick;
        trade.status='exchanged';trade.closedTick=world.tick;
        events.push(event(world,trade,'exchanged','两地实货交讫','两批货确已分别走到对方仓地，现同时入对方实仓。'));
      }
    }else if(trade.status==='returning'){
      forEachCargo(trade,cargo=>{
        if(cargo.status==='returning')walk(world,cargo,world.tick,world.month,true);
        if(cargo.status==='home_wait'&&canCreditFrontierTradeStock(world,cargo.from,cargo.lots)){
          if(!creditFrontierTradeStock(world,cargo.from,cargo.lots))throw new Error('返回实货已核仓位却无法入仓。');
          cargo.status='returned';cargo.closedTick=world.tick;
        }
      });
      if([trade.north,trade.south].every(cargo=>!cargo||cargo.status==='returned')){
        trade.status='returned';trade.closedTick=world.tick;
        events.push(event(world,trade,'returned','互换未成','约期结束。已托付的货按实际来路回到原仓；未装之货没有变化。'));
      }
    }
  }
  return events;
}

export interface FrontierTradeView {
  readonly id:string;readonly status:FrontierTradeAgreement['status'];readonly offeredTick:number;readonly acceptedTick?:number;
  readonly closesTick?:number;readonly yourSide:FrontierTradeSide;
  readonly north?:FrontierCargoView;readonly south?:FrontierCargoView;
}
interface FrontierCargoView {readonly status:FrontierTradeCargo['status'];readonly quantity:number;readonly pathLength:number;
  readonly stepsCompleted:number;readonly winterDetour:boolean;readonly waitedWinter:number}
export function projectFrontierTrade(world:WorldState,actor:Cultivator|undefined):FrontierTradeView[]{
  if(!actor||!liveAdult(actor)||world.cultivators.find(row=>row.id===actor.id)!==actor)return [];
  const project=(cargo:FrontierTradeCargo):FrontierCargoView=>({status:cargo.status,quantity:FRONTIER_TRADE_AMOUNT,
    pathLength:cargo.checkpoints.length-1,stepsCompleted:cargo.cursor,winterDetour:cargo.route==='winter',waitedWinter:cargo.winterWaitTicks.length});
  return (world.frontier?.trade?.agreements??[]).filter(row=>participant(row,actor.id)).slice(-8).reverse().map(row=>({
    id:row.id,status:row.status,offeredTick:row.offeredTick,yourSide:participant(row,actor.id)!,
    ...(row.acceptedTick!==undefined?{acceptedTick:row.acceptedTick}:{}),...(row.closedTick!==undefined?{closesTick:row.closedTick}:{}),
    ...(row.north?{north:project(row.north)}:{}),...(row.south?{south:project(row.south)}:{})}));
}

const tradeYearMonth=(world:WorldState,tick:number)=>((world.month-1+tick-world.tick)%12+12)%12+1;
function exactLots(lots:readonly {batchId:string;amount:number}[],quantity:number):boolean{
  return Array.isArray(lots)&&lots.length>0&&lots.length<=quantity&&new Set(lots.map(lot=>lot.batchId)).size===lots.length&&
    lots.every(lot=>typeof lot.batchId==='string'&&lot.batchId.length>0&&Number.isSafeInteger(lot.amount)&&lot.amount>0)&&
    lots.reduce((total,lot)=>total+lot.amount,0)===quantity;
}
function verifyCargo(world:WorldState,trade:FrontierTradeAgreement,cargo:FrontierTradeCargo,expectedSide:FrontierTradeSide,progressedThrough:number):boolean{
  const accepted=trade.acceptedTick;
  if(accepted===undefined||cargo.from!==expectedSide||cargo.good!==frontierTradeGood(expectedSide)||
    !Number.isSafeInteger(cargo.loadedTick)||cargo.loadedTick<=accepted||cargo.loadedTick>=accepted+FRONTIER_TRADE_TERM_MONTHS||
    cargo.loadedTick>world.tick||!exactLots(cargo.lots,FRONTIER_TRADE_AMOUNT)||
    (cargo.route==='standard'?cargo.winterReeds!==undefined:
      cargo.route!=='winter'||!cargo.winterReeds||!exactLots(cargo.winterReeds,FRONTIER_TRADE_WINTER_REEDS)))return false;
  const actorId=expectedSide===north?trade.northActorId:trade.southActorId,home=FRONTIER_CHARTS[expectedSide].homeId;
  if(!world.frontier?.residences.some(row=>row.id===cargo.residenceId&&row.actorId===actorId&&row.settledTick<=cargo.loadedTick&&
    row.regionId===expectedSide&&row.homeSiteId===home)||
    !world.frontier.visits.some(row=>row.actorId===actorId&&row.regionId===expectedSide&&row.enteredTick<=cargo.loadedTick&&
      (row.exitedTick===undefined||row.exitedTick>cargo.loadedTick)&&(row.deceasedTick===undefined||row.deceasedTick>cargo.loadedTick)&&
      row.steps.filter(step=>step.tick<=cargo.loadedTick).at(-1)?.siteId===home))return false;
  const route=frontierTradeCheckpoints(world,expectedSide,cargo.route);
  if(!route||route.length!==cargo.checkpoints.length||!route.every((point,i)=>same(point,cargo.checkpoints[i])))return false;
  const replay:FrontierTradeCargo={...cargo,walks:[],winterWaitTicks:[],cursor:0,status:'in_transit',arrivedTick:undefined,closedTick:undefined};
  // Unloaded lots need not simulate; even a very old held return only walks until the actual source point.
  const ceiling=Math.min(progressedThrough,trade.closedTick??Infinity,accepted+FRONTIER_TRADE_TERM_MONTHS+route.length*2+12);
  for(let tick=cargo.loadedTick+1;tick<=ceiling;tick++){
    if(tick===trade.returnsTick)replay.status='returning';
    if(replay.status==='in_transit'||replay.status==='returning')walk(world,replay,tick,tradeYearMonth(world,tick),replay.status==='returning');
    if(replay.status==='home_wait')break;
  }
  if(cargo.status==='delivered'){
    if(trade.status!=='exchanged'||cargo.closedTick!==trade.closedTick||replay.status!=='arrived')return false;
    replay.status='delivered';
  }else if(cargo.status==='returned'){
    if(trade.returnsTick===undefined||replay.status!=='home_wait'||cargo.closedTick===undefined||
      cargo.closedTick<Math.max(trade.returnsTick,replay.walks.at(-1)?.tick??0)||cargo.closedTick>progressedThrough)return false;
    replay.status='returned';
  }else if(cargo.closedTick!==undefined)return false;
  return replay.cursor===cargo.cursor&&replay.status===cargo.status&&replay.arrivedTick===cargo.arrivedTick&&
    replay.walks.length===cargo.walks.length&&replay.walks.every((row,i)=>row.tick===cargo.walks[i].tick&&row.step===cargo.walks[i].step)&&
    replay.winterWaitTicks.length===cargo.winterWaitTicks.length&&replay.winterWaitTicks.every((tick,i)=>tick===cargo.winterWaitTicks[i]);
}

/** Semantic proof consumed by codec after primitive/shape guards. No world mutation, synthetic arrival, or stock credit. */
export function verifyFrontierTradeAgreement(world:WorldState,trade:FrontierTradeAgreement,progressedThrough=world.frontier?.trade?.lastAdvancedTick??0):boolean{
  if(!Number.isSafeInteger(trade.offeredTick)||trade.offeredTick<1||trade.offeredTick>world.tick||trade.northActorId===trade.southActorId||
    !world.cultivators.some(a=>a.id===trade.northActorId)||!world.cultivators.some(a=>a.id===trade.southActorId))return false;
  const accepted=trade.acceptedTick,offeredEnd=trade.offeredTick+FRONTIER_TRADE_OFFER_MONTHS;
  if(trade.status==='offered'||trade.status==='expired'){
    return accepted===undefined&&trade.returnsTick===undefined&&trade.north===undefined&&trade.south===undefined&&
      (trade.status==='offered'?trade.closedTick===undefined&&progressedThrough<offeredEnd:trade.closedTick===offeredEnd&&offeredEnd<=progressedThrough);
  }
  if(accepted===undefined||!Number.isSafeInteger(accepted)||accepted<=trade.offeredTick||accepted>offeredEnd||accepted>world.tick)return false;
  const due=accepted+FRONTIER_TRADE_TERM_MONTHS;
  if(trade.status==='accepted'||trade.status==='exchanged'){
    if(trade.returnsTick!==undefined|| (trade.status==='accepted'?
      trade.closedTick!==undefined||progressedThrough>=due :
      trade.closedTick===undefined||trade.closedTick>=due||trade.closedTick>progressedThrough||
        trade.north?.status!=='delivered'||trade.south?.status!=='delivered'))return false;
  }else if(trade.status==='returning'||trade.status==='returned'){
    if(trade.returnsTick!==due||due>progressedThrough|| (trade.status==='returning'?trade.closedTick!==undefined:
      trade.closedTick!==Math.max(due,trade.north?.closedTick??0,trade.south?.closedTick??0)||trade.closedTick>progressedThrough||
      [trade.north,trade.south].some(cargo=>cargo&&cargo.status!=='returned')))return false;
  }else return false;
  try{return (!trade.north||verifyCargo(world,trade,trade.north,north,progressedThrough))&&
    (!trade.south||verifyCargo(world,trade,trade.south,south,progressedThrough));}catch{return false;}
}

/** Only physically outstanding units. Consumed protection reeds and terminal delivery/return are never cargo twice. */
export function frontierTradeEscrowSlices(world:WorldState){
  return (world.frontier?.trade?.agreements??[]).flatMap(trade=>[trade.north,trade.south].flatMap(cargo=>
    cargo&&cargo.status!=='returned'&&cargo.status!=='delivered'?cargo.lots:[]));
}

/** Separate physical store deltas from escrows. Expiry itself never credits an origin stock. */
export function frontierTradeProductionCustody(world:WorldState){
  return (world.frontier?.trade?.agreements??[]).flatMap(trade=>[trade.north,trade.south].flatMap(cargo=>{
    if(!cargo)return [];
    const source={from:cargo.from,loadedTick:cargo.loadedTick,slices:cargo.lots};
    if(cargo.status==='delivered')return [{...source,to:otherFrontierTradeSide(cargo.from),deliveredTick:cargo.closedTick}];
    if(cargo.status==='returned')return [{...source,to:cargo.from,deliveredTick:cargo.closedTick}];
    return [source];
  }));
}

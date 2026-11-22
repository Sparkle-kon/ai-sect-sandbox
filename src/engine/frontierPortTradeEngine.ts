import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {frontierSeaEdge,frontierSite} from './frontierTerms';
import {frontierActedOnGeography,frontierAnchor,frontierPhysicalSite,frontierResidence} from './frontierMovementEngine';
import {findMapPath} from './mapMotionEngine';
import {terrainTileAt} from './terrainEngine';
import {regionForPoint} from './simulationRegionGeometry';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {canCreditPortSalt,consumePortRiggingForTrade,creditPortSalt,debitPortSalt,ensureFrontierPortState,frontierPortLocalActed,portHullAtBerth,portRiggingStock,portSaltStock,
  wearPortHull} from './frontierPortLocalEngine';
import type {FrontierPortBatchSlice,FrontierPortCustody} from './frontierPortTerms';
import {PORT_TRADE_DOCK_SITE,PORT_TRADE_EAST_ANCHOR_INDEX,PORT_TRADE_EAST_SITE,PORT_TRADE_FEE_STONES,PORT_TRADE_FINAL_MONTHS,
  PORT_TRADE_HULL_WEAR,PORT_TRADE_INLAND_SITE,PORT_TRADE_LAND_STRIDE,PORT_TRADE_LOAD_MONTHS,PORT_TRADE_OFFER_MONTHS,PORT_TRADE_RIGGING,
  PORT_TRADE_ROOTS,PORT_TRADE_SALT,PORT_TRADE_SOFT_MONTHS,PORT_TRADE_WAREHOUSE_SITE,portTradeEdgeSeason,portTradeHullStatus,portTradeRiggingRef,
  type FrontierPortCargoPoint,type FrontierPortHullSite,type FrontierPortRootState,type FrontierPortTradeAgreement,
  type FrontierPortTradeMove,type FrontierPortTradeState,type FrontierPortVoyage,type FrontierPortWaitReason} from './frontierPortTradeTerms';

const region='east-offshore',chart='chart-east-offshore',eastCell='tile-19-4',inlandCell='tile-12-12';
const seaNodes=[PORT_TRADE_DOCK_SITE,'frontier-east-outer','frontier-east-gate'] as const;
const living=(a:Cultivator)=>a.alive&&a.hp>0&&a.age>=18;
const actorById=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const same=(a:FrontierPortCargoPoint,b:FrontierPortCargoPoint)=>a.chartId===b.chartId&&a.tileId===b.tileId;
export const createFrontierPortTradeState=():FrontierPortTradeState=>({nextId:1,agreements:[]});
const role=(row:FrontierPortTradeAgreement,id:string)=>row.sellerId===id?'seller':row.buyerId===id?'buyer':undefined;
const open=(trade:FrontierPortTradeAgreement)=>trade.status==='offered'||trade.status==='signed'||trade.status==='shipping';
function presentInland(world:WorldState,actor:Cultivator,tick:number){
  return living(actor)&&actor.positionPlane===undefined&&!frontierActedOnGeography(world,actor.id,tick)&&
    !!frontierAnchor(world,'south-marsh')&&doctrineFoundingPhysicallyAt(world,actor,PORT_TRADE_INLAND_SITE,tick);
}
function portResidentAt(world:WorldState,actor:Cultivator,tick:number,siteIds:readonly string[]){
  const residence=frontierResidence(world,actor.id),site=frontierPhysicalSite(world,actor,tick);
  return living(actor)&&residence?.regionId===region&&site&&siteIds.includes(site.id)&&
    !frontierActedOnGeography(world,actor.id,tick)?residence:undefined;
}
export function frontierPortTradeCheckpoints(world:WorldState):FrontierPortCargoPoint[]|undefined{
  const east=frontierAnchor(world,region),inland=frontierAnchor(world,'south-marsh');
  if(east?.id!==PORT_TRADE_EAST_SITE||inland?.id!==PORT_TRADE_INLAND_SITE||
    regionForPoint(world,east)!=='east'||regionForPoint(world,inland)!=='center')return;
  const base:FrontierPortCargoPoint[]=[];
  for(const point of findMapPath(world,east,inland,tile=>tile.id===eastCell||tile.id===inlandCell||tile.biome!=='魔渊')){
    const tile=terrainTileAt(world,point.x,point.y);
    if(!tile)return;
    if(base.at(-1)?.tileId!==tile.id)base.push({chartId:'lower-base',tileId:tile.id});
  }
  if(base.length<2||base[0].tileId!==eastCell||base.at(-1)?.tileId!==inlandCell)return;
  const points:FrontierPortCargoPoint[]=[...seaNodes.map(tileId=>({chartId:chart,tileId} as const)),...base];
  return points.every((point,i)=>i===0||frontierPortTradePhysicalEdge(world,points[i-1],point))?points:undefined;
}
export function frontierPortTradePhysicalEdge(world:WorldState,from:FrontierPortCargoPoint,to:FrontierPortCargoPoint):boolean{
  if(from.chartId===to.chartId){
    if(from.chartId==='lower-base'){
      const a=world.terrain.tiles.find(x=>x.id===from.tileId),b=world.terrain.tiles.find(x=>x.id===to.tileId);
      return !!(a&&b&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1);
    }
    const a=frontierSite(from.tileId),b=frontierSite(to.tileId);
    return !!(a&&b&&a.chartId===chart&&b.chartId===chart&&frontierSeaEdge(a.id,b.id)&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1);
  }
  const old=from.chartId==='lower-base'?from:to,port=old===from?to:from;
  return old.chartId==='lower-base'&&old.tileId===eastCell&&port.chartId===chart&&port.tileId===seaNodes.at(-1)&&!!frontierAnchor(world,region);
}
export type FrontierPortTradeOption=
  | {action:'FRONTIER_PORT_TRADE';frontierPortTradeMove:'propose';targetCultivatorId:string;targetFrontierPortTradeId?:never}
  | {action:'FRONTIER_PORT_TRADE';frontierPortTradeMove:Exclude<FrontierPortTradeMove,'propose'>;targetFrontierPortTradeId:string;targetCultivatorId?:never};
export function availableFrontierPortTradeActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FrontierPortTradeOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!living(actor)||actorById(world,actor.id)!==actor)return [];
  const rows=world.frontier?.port?.trade?.agreements??[],actions:FrontierPortTradeOption[]=[];
  if(rows.some(row=>row.sellerId===actor.id&&(row.offeredTick===executionTick||row.voyage?.loadedTick===executionTick||
    row.roots==='collected_at_port'&&row.rootsReleasedTick===executionTick)||
    row.buyerId===actor.id&&(row.signedTick===executionTick||row.voyage?.receivedTick===executionTick||
    row.roots==='refunded_inland'&&row.rootsReleasedTick===executionTick)))return [];
  const current=rows.find(row=>open(row)&&role(row,actor.id));
  const add=(trade:FrontierPortTradeAgreement,frontierPortTradeMove:Exclude<FrontierPortTradeMove,'propose'>)=>actions.push(
    {action:'FRONTIER_PORT_TRADE',frontierPortTradeMove,targetFrontierPortTradeId:trade.id});
  const inland=presentInland(world,actor,executionTick);
  const receivingPort=portResidentAt(world,actor,executionTick,[PORT_TRADE_DOCK_SITE,PORT_TRADE_WAREHOUSE_SITE]);
  for(const row of rows){
    if(row.buyerId===actor.id&&row.roots==='refundable_inland'&&inland&&actor.herbs.earth_root+PORT_TRADE_ROOTS<=99&&executionTick>(row.voyage?.returnStartedTick??row.closedTick??Infinity))
      add(row,'recover_roots');
    if(row.sellerId===actor.id&&row.roots==='landed_at_port'&&receivingPort&&actor.herbs.earth_root+PORT_TRADE_ROOTS<=99&&executionTick>(row.voyage?.returnedTick??Infinity))
      add(row,'collect_roots');
  }
  if(!current){
    if(inland){
      const occupied=new Set(rows.filter(open).flatMap(row=>[row.sellerId,row.buyerId]));
      for(const other of world.cultivators.filter(a=>a.id!==actor.id&&!occupied.has(a.id)&&presentInland(world,a,executionTick))
        .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0))
        actions.push({action:'FRONTIER_PORT_TRADE',frontierPortTradeMove:'propose',targetCultivatorId:other.id});
    }
    return actions;
  }
  if(current.status==='offered'&&current.buyerId===actor.id&&inland&&executionTick>current.offeredTick&&
    executionTick<=current.offeredTick+PORT_TRADE_OFFER_MONTHS&&actor.herbs.earth_root>=PORT_TRADE_ROOTS){
    const seller=actorById(world,current.sellerId);
    if(seller&&presentInland(world,seller,executionTick))add(current,'accept');
  }
  const voyage=current.voyage;
  if(current.status==='signed'&&current.sellerId===actor.id&&executionTick>(current.signedTick??Infinity)&&
    executionTick<(current.signedTick??-Infinity)+PORT_TRADE_LOAD_MONTHS&&
    portResidentAt(world,actor,executionTick,[PORT_TRADE_DOCK_SITE])&&(portHullAtBerth(world)?.condition??0)>=PORT_TRADE_HULL_WEAR&&
    !frontierPortLocalActed(world,actor.id,executionTick)&&actor.spiritStones>=PORT_TRADE_FEE_STONES&&portSaltStock(world)>=PORT_TRADE_SALT&&portRiggingStock(world)>=PORT_TRADE_RIGGING&&
    frontierPortTradeCheckpoints(world))add(current,'load');
  if(current.status==='shipping'&&current.buyerId===actor.id&&voyage?.status==='awaiting_buyer'&&inland&&
    executionTick>(voyage.inlandArrivedTick??Infinity)&&executionTick<voyage.loadedTick+PORT_TRADE_FINAL_MONTHS&&current.roots==='inland_escrow')
    add(current,'receive');
  return actions;
}
function event(world:WorldState,row:FrontierPortTradeAgreement,kind:string,title:string,description:string):WorldEvent {
  return {id:`evt-frontier-port-trade-${row.id}-${kind}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
    title,description,category:'diplomacy',actorIds:[row.sellerId,row.buyerId],witnessScope:'participants'};
}
const intentFields=new Set(['action','chosenAction','innerMonologue','spokenLine','frontierPortTradeMove','targetCultivatorId','targetFrontierPortTradeId']);
export function resolveFrontierPortTradeAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const internal=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='FRONTIER_PORT_TRADE'||internal!==undefined&&internal!=='FRONTIER_PORT_TRADE'||Object.entries(payload).some(([key,value])=>value!==undefined&&!intentFields.has(key)))return null;
  const option=availableFrontierPortTradeActions(actor,world).find(o=>o.frontierPortTradeMove===payload.frontierPortTradeMove&&
    o.targetCultivatorId===payload.targetCultivatorId&&o.targetFrontierPortTradeId===payload.targetFrontierPortTradeId);
  if(!option)return null;
  const port=ensureFrontierPortState(world);
  const state=port.trade??=createFrontierPortTradeState();
  if(option.frontierPortTradeMove==='propose'){
    const row:FrontierPortTradeAgreement={id:`frontier-port-trade-${state.nextId++}`,sellerId:actor.id,buyerId:option.targetCultivatorId,
      offeredTick:world.tick,status:'offered'};
    state.agreements.push(row);
    return event(world,row,'offer','两人在内陆坊议货','双方确在内陆坊相会。尚未抵押、装船或交货。');
  }
  const row=state.agreements.find(candidate=>candidate.id===option.targetFrontierPortTradeId)!;
  if(option.frontierPortTradeMove==='accept'){
    actor.herbs.earth_root-=PORT_TRADE_ROOTS;row.signedTick=world.tick;row.roots='inland_escrow';row.status='signed';
    return event(world,row,'signed','押实根，定海道','买方亲到原坊定约，袋内两根已实际封存，尚未出坊。');
  }
  if(option.frontierPortTradeMove==='load'){
    const hull=portHullAtBerth(world),residence=portResidentAt(world,actor,world.tick,[PORT_TRADE_DOCK_SITE]),checkpoints=frontierPortTradeCheckpoints(world);
    if(!hull||!residence||!checkpoints)return null;
    const rigging=consumePortRiggingForTrade(world,actor,portTradeRiggingRef(row.id));
    if(!rigging)return null;
    const lots=debitPortSalt(world,PORT_TRADE_SALT);
    if(!lots)throw new Error('海陆互换已核潮晶却未能入托。');
    actor.spiritStones-=PORT_TRADE_FEE_STONES;
    recordResourceFlow(world,{kind:'consumption',mechanism:'frontier',reason:'frontier_port_voyage_fee',good:'stone',
      amount:PORT_TRADE_FEE_STONES,from:flowActor(actor.id),refId:row.id,visibility:{kind:'participants',actorIds:[actor.id]}});
    row.status='shipping';
    row.voyage={hullId:hull.id,loadResidenceId:residence.id,loadedTick:world.tick,lots,rigging,checkpoints,
      feeStones:PORT_TRADE_FEE_STONES,cursor:0,status:'outbound',walks:[],waits:[]};
    return event(world,row,'loaded','实货入舱，舟仍在泊','两份潮晶从仓中入托，三石与船具已实付。尚无任何海程或交收。');
  }
  if(option.frontierPortTradeMove==='receive'){
    const voyage=row.voyage!;
    voyage.receivedTick=world.tick;voyage.returnStartedTick=world.tick;voyage.status='returning_roots';row.roots='returning_to_port';
    return event(world,row,'received','买方就地收晶','买方亲验已经走完全程的该批潮晶。原押两根改作回程实货，尚未到港。');
  }
  if(option.frontierPortTradeMove==='recover_roots'){
    actor.herbs.earth_root+=PORT_TRADE_ROOTS;row.roots='refunded_inland';row.rootsReleasedTick=world.tick;
    return event(world,row,'refunded','押根就地领回','原买方到原内陆坊，从实际未动的托管中取回两根。');
  }
  const residence=portResidentAt(world,actor,world.tick,[PORT_TRADE_DOCK_SITE,PORT_TRADE_WAREHOUSE_SITE]);
  if(!residence)return null;
  actor.herbs.earth_root+=PORT_TRADE_ROOTS;row.roots='collected_at_port';row.rootsReleasedTick=world.tick;row.rootsCollectedResidenceId=residence.id;
  return event(world,row,'collected','回舟实根入主袋','原卖家亲到港位，才领走已经走完回程的两根。');
}

function moveVoyage(world:WorldState,voyage:FrontierPortVoyage,tick:number,month:number,turnBack:boolean,
  depart?:()=>boolean):void{
  const last=voyage.checkpoints.length-1,to=turnBack?0:last,direction=turnBack?-1:1;
  if(tick<=voyage.loadedTick||turnBack&&tick<=(voyage.returnStartedTick??Infinity))return;
  for(let stride=0;voyage.cursor!==to&&stride<PORT_TRADE_LAND_STRIDE;stride++){
    const next=voyage.cursor+direction,a=voyage.checkpoints[voyage.cursor],b=voyage.checkpoints[next];
    const land=a.chartId==='lower-base'&&b.chartId==='lower-base';
    if(stride>0&&!land)break;
    if(!frontierPortTradePhysicalEdge(world,a,b))throw new Error('当前海道记录不能跨入非相邻或非注册接点。');
    const blocked=portTradeEdgeSeason(a,b,month);
    if(blocked){voyage.waits.push({tick,fromStep:voyage.cursor,toStep:next,reason:blocked});break;}
    if(!turnBack&&voyage.cursor===0){
      if(depart&&!depart())throw new Error('预占的一刻，原有船体无法支付真实磨耗。');
      voyage.departedTick=tick;
    }
    voyage.cursor=next;voyage.walks.push({tick,step:next});
    if(!land)break; // A port/sea/gate crossing consumes its own whole monthly position step.
  }
  if(voyage.cursor===to){
    if(turnBack)voyage.returnedTick=tick;
    else{voyage.inlandArrivedTick=tick;voyage.status='awaiting_buyer';}
  }
}
export function advanceFrontierPortTrade(world:WorldState):WorldEvent[]{
  const trade=world.frontier?.port?.trade;
  if(!trade||trade.lastAdvancedTick===world.tick)return [];
  trade.lastAdvancedTick=world.tick;
  const events:WorldEvent[]=[];
  for(const row of trade.agreements){
    if(row.status==='offered'&&world.tick>=row.offeredTick+PORT_TRADE_OFFER_MONTHS){row.status='expired';row.closedTick=world.tick;continue;}
    if(row.status==='signed'&&world.tick>=row.signedTick!+PORT_TRADE_LOAD_MONTHS){
      row.status='expired';row.closedTick=world.tick;row.roots='refundable_inland';
      events.push(event(world,row,'unladen','载期里没有装货','原舱与原仓无货交接。押根仍留原地，买方可亲领。'));
      continue;
    }
    if(row.status!=='shipping'||!row.voyage)continue;
    const voy=row.voyage;
    if((voy.status==='outbound'||voy.status==='awaiting_buyer')&&world.tick>=voy.loadedTick+PORT_TRADE_FINAL_MONTHS){
      row.roots='refundable_inland';
      voy.status='returning_salt';voy.returnStartedTick=world.tick;
      events.push(event(world,row,'turnback','收货期尽，原货还航','买方未在期限内交割。原货现循已经走过的路返回，尚未归仓。'));
    }
    if(voy.status==='outbound')moveVoyage(world,voy,world.tick,world.month,false,()=>wearPortHull(world,voy.hullId));
    if(voy.status==='returning_roots'||voy.status==='returning_salt'){
      moveVoyage(world,voy,world.tick,world.month,true);
      if(voy.returnedTick===world.tick){
        if(voy.status==='returning_roots'){
          voy.status='roots_landed';row.status='fulfilled';row.closedTick=world.tick;row.roots='landed_at_port';
          events.push(event(world,row,'roots-at-port','根货循路实到港','原船回到原泊位，实押的两根也已运到，在港待原卖家领取。'));
        }else voy.status='home_salt_held';
      }
    }
    if(voy.status==='home_salt_held'&&canCreditPortSalt(world,voy.lots)){
      if(!creditPortSalt(world,voy.lots))throw new Error('原仓确认有位后未能重新接入原货。');
      voy.status='salt_returned';voy.restockedTick=world.tick;
      row.status='unfulfilled';row.closedTick=world.tick;
      events.push(event(world,row,'salt-recovered','归舟入泊，原批归仓','潮晶真实走回原泊，按原批号入港仓；未向买方交付。'));
    }
  }
  return events;
}

/** Buyer-held exact salt batches. The same lots cannot be returned to the port after this real receipt. */
export function portTradeReceivedSalt(world:WorldState,buyerId:string){
  return (world.frontier?.port?.trade?.agreements??[]).flatMap(row=>row.buyerId===buyerId&&row.voyage?.receivedTick!==undefined
    ?[{agreementId:row.id,tick:row.voyage.receivedTick,lots:row.voyage.lots.map(lot=>({...lot}))}]:[]);
}
export function portTradeLocalCustody(world:WorldState):FrontierPortCustody[]{
  return (world.frontier?.port?.trade?.agreements??[]).flatMap(row=>{
    const v=row.voyage;
    return v?[{agreementId:row.id,hullId:v.hullId,loadedTick:v.loadedTick,departedTick:v.departedTick,
      closedTick:v.returnedTick,saltSlices:v.lots,returnedTick:v.restockedTick,riggingRefId:portTradeRiggingRef(row.id),
      actorId:row.sellerId,riggingSlices:v.rigging}]:[];
  });
}
export interface FrontierPortTradeView {
  readonly id:string;readonly yourRole:'seller'|'buyer';readonly status:FrontierPortTradeAgreement['status'];
  readonly offeredTick:number;readonly signedTick?:number;readonly closedTick?:number;readonly roots?:FrontierPortRootState;
  readonly cargo?:{readonly position:'dock'|'sea'|'east_anchor'|'land'|'inland';readonly direction:'outbound'|'return_roots'|'return_salt';
    readonly stepsCompleted:number;readonly pathLength:number;readonly delayed:boolean;readonly waiting?:FrontierPortWaitReason;
    readonly hullLocation:FrontierPortHullSite;readonly departedTick?:number;readonly inlandArrivedTick?:number;
    readonly receivedTick?:number;readonly returnedTick?:number};
}
export function projectFrontierPortTrade(world:WorldState,actor:Cultivator|undefined):FrontierPortTradeView[]{
  if(!actor||!living(actor)||actorById(world,actor.id)!==actor)return [];
  const cargo=(row:FrontierPortTradeAgreement,voyage:FrontierPortVoyage):FrontierPortTradeView['cargo']=>{
    const pathLength=voyage.checkpoints.length-1,cursor=voyage.cursor,lastWait=voyage.waits.at(-1);
    return {position:cursor===0?'dock':cursor===pathLength?'inland':cursor===PORT_TRADE_EAST_ANCHOR_INDEX?'east_anchor':
      cursor<PORT_TRADE_EAST_ANCHOR_INDEX?'sea':'land',
      direction:voyage.receivedTick!==undefined?'return_roots':voyage.returnStartedTick!==undefined?'return_salt':'outbound',
      pathLength,stepsCompleted:cursor,delayed:(voyage.inlandArrivedTick??world.tick)>voyage.loadedTick+PORT_TRADE_SOFT_MONTHS,
      hullLocation:row.status==='shipping'&&voyage.status!=='home_salt_held'?portTradeHullStatus(world,voyage.hullId):'berthed',
      ...(lastWait?.tick===world.tick&&row.status==='shipping'?{waiting:lastWait.reason}:{}),departedTick:voyage.departedTick,
      inlandArrivedTick:voyage.inlandArrivedTick,receivedTick:voyage.receivedTick,returnedTick:voyage.returnedTick};
  };
  return (world.frontier?.port?.trade?.agreements??[]).filter(row=>role(row,actor.id)).slice(-8).reverse().map(row=>({
    id:row.id,yourRole:role(row,actor.id)!,status:row.status,offeredTick:row.offeredTick,signedTick:row.signedTick,
    closedTick:row.closedTick,roots:row.roots,...(row.voyage?{cargo:cargo(row,row.voyage)}:{})}));
}

const monthAt=(world:WorldState,tick:number)=>((world.month-1+tick-world.tick)%12+12)%12+1;
function exactLots(lots:readonly FrontierPortBatchSlice[],amount:number){
  return lots.length>0&&lots.length<=amount&&new Set(lots.map(lot=>lot.batchId)).size===lots.length&&
    lots.every(lot=>typeof lot.batchId==='string'&&lot.batchId.length>0&&Number.isSafeInteger(lot.amount)&&lot.amount>=1)&&
    lots.reduce((sum,lot)=>sum+lot.amount,0)===amount;
}
function actualPortHistory(world:WorldState,actorId:string,residenceId:string,tick:number,sites:readonly string[]){
  return !!world.frontier?.residences.some(res=>res.id===residenceId&&res.regionId===region&&res.actorId===actorId&&res.settledTick<tick)&&
    !!world.frontier?.visits.some(visit=>visit.actorId===actorId&&visit.regionId===region&&visit.enteredTick<=tick&&
      (visit.exitedTick===undefined||visit.exitedTick>tick)&&(visit.deceasedTick===undefined||visit.deceasedTick>tick)&&
      sites.includes(visit.steps.filter(step=>step.tick<=tick).at(-1)?.siteId??''));
}
/** Strict semantic replay after shape validation; derives clock, graph, pauses, real departure and return independently. */
export function verifyFrontierPortTradeAgreement(world:WorldState,row:FrontierPortTradeAgreement,
  through=world.frontier?.port?.trade?.lastAdvancedTick??0):boolean{
  if(row.sellerId===row.buyerId||!actorById(world,row.sellerId)||!actorById(world,row.buyerId)||!Number.isSafeInteger(row.offeredTick)||
    row.offeredTick<1||row.offeredTick>world.tick)return false;
  const signed=row.signedTick,offerEnd=row.offeredTick+PORT_TRADE_OFFER_MONTHS;
  const v=row.voyage;
  if(signed===undefined)return !v&&row.roots===undefined&&row.rootsReleasedTick===undefined&&row.rootsCollectedResidenceId===undefined&&
    (row.status==='offered'?row.closedTick===undefined&&through<offerEnd:row.status==='expired'&&row.closedTick===offerEnd&&through>=offerEnd);
  if(signed<=row.offeredTick||signed>offerEnd||signed>world.tick||!Number.isSafeInteger(signed))return false;
  if(!v){
    if(row.rootsCollectedResidenceId!==undefined)return false;
    const cutoff=signed+PORT_TRADE_LOAD_MONTHS;
    return (row.status==='signed'&&through<cutoff&&row.closedTick===undefined&&row.roots==='inland_escrow'&&row.rootsReleasedTick===undefined)||
      (row.status==='expired'&&through>=cutoff&&row.closedTick===cutoff&&
        (row.roots==='refundable_inland'&&row.rootsReleasedTick===undefined||
          row.roots==='refunded_inland'&&row.rootsReleasedTick!==undefined&&row.rootsReleasedTick>cutoff&&row.rootsReleasedTick<=world.tick));
  }
  if(!Number.isSafeInteger(v.loadedTick)||v.loadedTick<=signed||v.loadedTick>=signed+PORT_TRADE_LOAD_MONTHS||v.loadedTick>world.tick||
    !exactLots(v.lots,PORT_TRADE_SALT)||!exactLots(v.rigging,PORT_TRADE_RIGGING)||v.feeStones!==PORT_TRADE_FEE_STONES||
    world.frontier?.port?.hull?.id!==v.hullId||world.frontier.port.hull.createdTick>=v.loadedTick||
    !actualPortHistory(world,row.sellerId,v.loadResidenceId,v.loadedTick,[PORT_TRADE_DOCK_SITE]))return false;
  const path=frontierPortTradeCheckpoints(world);
  if(!path||path.length!==v.checkpoints.length||!path.every((p,i)=>same(p,v.checkpoints[i])))return false;
  const final=v.loadedTick+PORT_TRADE_FINAL_MONTHS,received=v.receivedTick;
  if(received!==undefined&&(!Number.isSafeInteger(received)||received>world.tick||received>=final||
    received<=(v.inlandArrivedTick??Infinity)||v.returnStartedTick!==received))return false;
  if(received===undefined&&(v.returnStartedTick!==undefined?v.returnStartedTick!==final||final>through:final<=through))return false;
  const replay:FrontierPortVoyage={...v,cursor:0,status:'outbound',walks:[],waits:[],departedTick:undefined,inlandArrivedTick:undefined,
    returnedTick:undefined,restockedTick:undefined};
  const ceiling=Math.min(through,final+path.length*2+12);
  try{
    for(let tick=v.loadedTick+1;tick<=ceiling;tick++){
      if(tick===v.returnStartedTick)replay.status=received===undefined?'returning_salt':'returning_roots';
      if(replay.status==='outbound')moveVoyage(world,replay,tick,monthAt(world,tick),false);
      if(replay.status==='returning_salt'||replay.status==='returning_roots'){
        moveVoyage(world,replay,tick,monthAt(world,tick),true);
        if(replay.returnedTick!==undefined){replay.status=received===undefined?'home_salt_held':'roots_landed';break;}
      }
    }
  }catch{return false;}
  // Receive is a direct native command whose following monthly movement starts strictly later.
  if(received!==undefined&&received===world.tick&&received>through&&replay.status==='awaiting_buyer')replay.status='returning_roots';
  if(v.restockedTick!==undefined){
    if(replay.status!=='home_salt_held'||v.restockedTick<(replay.returnedTick??Infinity)||v.restockedTick>through)return false;
    replay.status='salt_returned';
  }
  if(v.status!==replay.status||v.cursor!==replay.cursor||v.departedTick!==replay.departedTick||v.inlandArrivedTick!==replay.inlandArrivedTick||
    v.returnedTick!==replay.returnedTick||v.walks.length!==replay.walks.length||v.waits.length!==replay.waits.length||
    !v.walks.every((p,i)=>p.tick===replay.walks[i].tick&&p.step===replay.walks[i].step)||
    !v.waits.every((p,i)=>p.tick===replay.waits[i].tick&&p.reason===replay.waits[i].reason&&
      p.fromStep===replay.waits[i].fromStep&&p.toStep===replay.waits[i].toStep))return false;
  if(v.status==='roots_landed'){
    return row.status==='fulfilled'&&row.closedTick===v.returnedTick&&
      (row.roots==='landed_at_port'&&row.rootsReleasedTick===undefined&&row.rootsCollectedResidenceId===undefined||
        row.roots==='collected_at_port'&&row.rootsReleasedTick!==undefined&&row.rootsReleasedTick>(v.returnedTick??Infinity)&&
        row.rootsReleasedTick<=world.tick&&row.rootsCollectedResidenceId!==undefined&&actualPortHistory(world,row.sellerId,
          row.rootsCollectedResidenceId,row.rootsReleasedTick,[PORT_TRADE_DOCK_SITE,PORT_TRADE_WAREHOUSE_SITE]));
  }
  if(row.rootsCollectedResidenceId!==undefined)return false;
  if(v.status==='salt_returned'?row.status!=='unfulfilled'||row.closedTick!==v.restockedTick:row.status!=='shipping'||row.closedTick!==undefined)return false;
  if(v.status==='outbound'||v.status==='awaiting_buyer')return row.roots==='inland_escrow'&&row.rootsReleasedTick===undefined;
  if(v.status==='returning_roots')return row.roots==='returning_to_port'&&row.rootsReleasedTick===undefined;
  return row.roots==='refundable_inland'&&row.rootsReleasedTick===undefined||row.roots==='refunded_inland'&&row.rootsReleasedTick!==undefined&&
    row.rootsReleasedTick>(v.returnStartedTick??Infinity)&&row.rootsReleasedTick<=world.tick;
}

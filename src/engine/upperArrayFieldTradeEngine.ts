import type {Cultivator,LLMDecisionPayload,ResourceFlowDraft,WorldEvent,WorldState} from '../types/world';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {completedNorthWaterWell,northWaterAddress} from './waterVeinEngine';
import {waterVeinApertureActive} from './waterVeinTerms';
import {northGateRenewalApertureAuthorized} from './northGateRenewalTerms';
import {northWellPrecinctRestricted} from './northWellRevisitTerms';
import {activeUpperPassage,usableUpperPassageOpening} from './upperPassageEngine';
import {ensureUpperArrayFieldState,upperArrayFieldActedOnGeography,
  upperArrayFieldPhysicalSite,upperArrayFieldResidence} from './upperArrayFieldMovementEngine';
import {flowUpperArrayStore,holdUpperArrayLattice,restockUpperArrayLattice,upperArrayFieldActedLocally,
  upperArrayLatticeStock} from './upperArrayFieldLocalEngine';
import {UPPER_ARRAY_FIELD_LATTICE_CAPACITY,type UpperArrayFieldLatticeCustody} from './upperArrayFieldLocalTerms';
import {latestUpperArrayFieldVisit} from './upperArrayFieldTerms';
import {flowActor,flowShipment,recordResourceFlow,sameFlowAccount} from './resourceFlowEngine';
import {UPPER_ARRAY_TRADE_EXCHANGE,UPPER_ARRAY_TRADE_LATTICE,UPPER_ARRAY_TRADE_LOAD_MONTHS,UPPER_ARRAY_TRADE_OFFER_MONTHS,
  UPPER_ARRAY_TRADE_ROOTS,UPPER_ARRAY_TRADE_WELL,upperArrayFieldActedOnTrade,type UpperArrayFieldTradeAgreement,
  type UpperArrayFieldTradeCrossing,type UpperArrayFieldTradeMove,type UpperArrayFieldTradeState} from './upperArrayFieldTradeTerms';

const adult=(a:Cultivator)=>a.alive&&a.hp>0&&a.age>=18;
const person=(world:WorldState,id:string)=>world.cultivators.find(a=>a.id===id);
const roleOf=(row:UpperArrayFieldTradeAgreement,id:string)=>row.sellerId===id?'seller':row.buyerId===id?'buyer':undefined;
const open=(row:UpperArrayFieldTradeAgreement)=>row.status==='offered'||row.status==='accepted'||row.status==='carrying';
const funds=(a:Cultivator,n:number)=>Number.isSafeInteger(a.herbs.earth_root)&&a.herbs.earth_root>=n;
export const createUpperArrayFieldTradeState=():UpperArrayFieldTradeState=>({nextId:1,agreements:[]});
function wellProof(world:WorldState,tick:number){
  const address=northWaterAddress(world);
  return address&&completedNorthWaterWell(world,address.village.id,tick);
}
function physicallyAtWell(world:WorldState,a:Cultivator,tick:number){
  return adult(a)&&a.positionPlane===undefined&&a.locationId===UPPER_ARRAY_TRADE_WELL&&
    !northWellPrecinctRestricted(world,tick)&&doctrineFoundingPhysicallyAt(world,a,UPPER_ARRAY_TRADE_WELL,tick);
}
function atWell(world:WorldState,a:Cultivator,tick:number){
  return physicallyAtWell(world,a,tick)&&!world.upperPassage?.journeys.some(j=>j.actorId===a.id&&j.returnedTick===tick);
}
function atExchange(world:WorldState,a:Cultivator,tick:number){
  const current=upperArrayFieldPhysicalSite(world,a,tick),visit=latestUpperArrayFieldVisit(world.upperArrayField,a.id),
    residence=upperArrayFieldResidence(world,a.id),journey=activeUpperPassage(world,a.id);
  if(!adult(a)||current?.id!==UPPER_ARRAY_TRADE_EXCHANGE||!visit||!residence||residence.settledTick>=tick||!journey||visit.journeyId!==journey.id||
    upperArrayFieldActedLocally(world,a.id,tick)||upperArrayFieldActedOnGeography(world,a.id,tick))return;
  return {visit,journey,residence};
}
/** A dated inward native throat step is mandatory. A quoted/open gate alone can never deliver anything. */
export function upperArrayFieldTradeNativeReturn(world:WorldState,row:UpperArrayFieldTradeAgreement):UpperArrayFieldTradeCrossing|undefined{
  const load=row.load;if(!load)return;
  const journey=world.upperPassage?.journeys.find(j=>j.id===load.journeyId&&j.actorId===row.sellerId&&j.wellProjectId===row.wellProjectId);
  const landed=journey?.steps.at(-1);
  if(!journey||!landed||landed.nodeId!==UPPER_ARRAY_TRADE_WELL||landed.direction!=='inbound'||journey.returnedTick!==landed.tick||
    journey.returnedTick<=load.tick||journey.deceasedTick!==undefined)return;
  const pass=journey.steps.at(-2),outer=journey.steps.at(-3);
  if(!pass||!outer||pass.nodeId!=='realm-passage-lower-step'||outer.nodeId!=='realm-passage-upper-step'||
    pass.direction!=='inbound'||outer.tick<=load.tick||pass.tick<=outer.tick||landed.tick<=pass.tick||!pass.crossingOpeningId)return;
  const gate=world.coldWaterVein?.openings.find(g=>g.id===pass.crossingOpeningId&&g.wellProjectId===row.wellProjectId);
  if(!gate||!waterVeinApertureActive(gate,pass.tick)||!northGateRenewalApertureAuthorized(world,gate))return;
  return {crossedTick:pass.tick,crossingOpeningId:gate.id,returnedTick:landed.tick};
}
export type UpperArrayFieldTradeOption=
  | {action:'UPPER_ARRAY_FIELD_TRADE';upperArrayFieldTradeMove:'propose';targetCultivatorId:string;targetUpperArrayFieldTradeId?:never}
  | {action:'UPPER_ARRAY_FIELD_TRADE';upperArrayFieldTradeMove:Exclude<UpperArrayFieldTradeMove,'propose'>;targetUpperArrayFieldTradeId:string;targetCultivatorId?:never};
export function availableUpperArrayFieldTradeActions(actor:Cultivator,world:WorldState,executionTick=world.tick):UpperArrayFieldTradeOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!adult(actor)||person(world,actor.id)!==actor||
    upperArrayFieldActedOnTrade(world,actor.id,executionTick))return [];
  const rows=world.upperArrayField?.trade?.agreements??[],current=rows.find(row=>open(row)&&roleOf(row,actor.id));
  const atOld=atWell(world,actor,executionTick),well=atOld?wellProof(world,executionTick):undefined;
  if(!current){
    if(!well)return [];
    const occupied=new Set(rows.filter(open).flatMap(row=>[row.sellerId,row.buyerId]));
    return world.cultivators.filter(other=>other.id!==actor.id&&!occupied.has(other.id)&&atWell(world,other,executionTick)&&
      !upperArrayFieldActedOnTrade(world,other.id,executionTick)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
      .map(other=>({action:'UPPER_ARRAY_FIELD_TRADE',upperArrayFieldTradeMove:'propose',targetCultivatorId:other.id}));
  }
  const role=roleOf(current,actor.id)!;
  const option=(upperArrayFieldTradeMove:Exclude<UpperArrayFieldTradeMove,'propose'>):UpperArrayFieldTradeOption=>
    ({action:'UPPER_ARRAY_FIELD_TRADE',upperArrayFieldTradeMove,targetUpperArrayFieldTradeId:current.id});
  if(current.status==='offered'&&role==='buyer'&&well?.id===current.wellProjectId&&executionTick>current.offeredTick&&
    executionTick<=current.offeredTick+UPPER_ARRAY_TRADE_OFFER_MONTHS){
    const seller=person(world,current.sellerId);
    return seller&&atWell(world,seller,executionTick)?[option('accept')]:[];
  }
  if(current.status==='accepted'&&role==='seller'&&current.acceptedTick!==undefined&&executionTick>current.acceptedTick&&
    executionTick<current.acceptedTick+UPPER_ARRAY_TRADE_LOAD_MONTHS){
    const candidate=atExchange(world,actor,executionTick);
    return candidate?.journey.wellProjectId===current.wellProjectId&&upperArrayLatticeStock(world,actor.id)>=UPPER_ARRAY_TRADE_LATTICE?
      [option('load')]:[];
  }
  if(current.status!=='carrying'||!current.load)return [];
  if(role==='seller'){
    const candidate=atExchange(world,actor,executionTick);
    return candidate?.journey.wellProjectId===current.wellProjectId&&executionTick>current.load.tick&&
      upperArrayLatticeStock(world,actor.id)+UPPER_ARRAY_TRADE_LATTICE<=UPPER_ARRAY_FIELD_LATTICE_CAPACITY?[option('unload')]:[];
  }
  if(well?.id!==current.wellProjectId||!funds(actor,UPPER_ARRAY_TRADE_ROOTS))return [];
  const seller=person(world,current.sellerId),returned=upperArrayFieldTradeNativeReturn(world,current);
  return seller&&atWell(world,seller,executionTick)&&!upperArrayFieldActedOnTrade(world,seller.id,executionTick)&&funds(seller,0)&&
    seller.herbs.earth_root<=99-UPPER_ARRAY_TRADE_ROOTS&&returned&&executionTick>returned.returnedTick?[option('settle')]:[];
}
function event(world:WorldState,row:UpperArrayFieldTradeAgreement,suffix:string,title:string,description:string):WorldEvent{
  return {id:`evt-upper-array-field-trade-${row.id}-${suffix}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',witnessScope:'participants',actorIds:[row.sellerId,row.buyerId],title,description};
}
type Phase='load'|'lattice_delivery'|'roots_payment'|'restock';
function tradeFlow(row:UpperArrayFieldTradeAgreement,phase:Phase):Extract<ResourceFlowDraft,{kind:'transfer'}>{
  const hold=flowShipment(row.id),store=flowUpperArrayStore(),seller=flowActor(row.sellerId),buyer=flowActor(row.buyerId);
  return {kind:'transfer',mechanism:'upper_array_field',reason:`upper_array_field_trade_${phase}`,refId:row.id,
    good:phase==='roots_payment'?'earth_root':'upper_lattice',amount:phase==='roots_payment'?UPPER_ARRAY_TRADE_ROOTS:UPPER_ARRAY_TRADE_LATTICE,
    from:phase==='load'?store:phase==='roots_payment'?buyer:hold,to:phase==='load'?hold:phase==='restock'?store:phase==='roots_payment'?seller:buyer,
    visibility:{kind:'participants',actorIds:[row.sellerId,row.buyerId]}};
}
const legalFields=new Set(['action','chosenAction','innerMonologue','spokenLine','upperArrayFieldTradeMove','targetCultivatorId','targetUpperArrayFieldTradeId']);
export function resolveUpperArrayFieldTradeAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const internal=(payload as LLMDecisionPayload&{action?:string}).action;
  if(payload.chosenAction!=='UPPER_ARRAY_FIELD_TRADE'||internal!==undefined&&internal!=='UPPER_ARRAY_FIELD_TRADE'||
    Object.entries(payload).some(([key,value])=>value!==undefined&&!legalFields.has(key)))return null;
  const choice=availableUpperArrayFieldTradeActions(actor,world).find(opt=>opt.upperArrayFieldTradeMove===payload.upperArrayFieldTradeMove&&
    opt.targetCultivatorId===payload.targetCultivatorId&&opt.targetUpperArrayFieldTradeId===payload.targetUpperArrayFieldTradeId);
  if(!choice)return null;
  if(choice.upperArrayFieldTradeMove==='propose'){
    const well=wellProof(world,world.tick);if(!well)return null;
    const state=ensureUpperArrayFieldState(world).trade??=createUpperArrayFieldTradeState();
    const row:UpperArrayFieldTradeAgreement={id:`upper-array-trade-${state.nextId++}`,offeredTick:world.tick,wellProjectId:well.id,
      sellerId:actor.id,buyerId:choice.targetCultivatorId,status:'offered'};
    state.agreements.push(row);
    return event(world,row,'offer','井栏旁定价','两人真在旧井会面，议以两件实阵材换两株实根；各自现有财物未付。');
  }
  const row=world.upperArrayField?.trade?.agreements.find(item=>item.id===choice.targetUpperArrayFieldTradeId);
  if(!row)return null;
  switch(choice.upperArrayFieldTradeMove){
    case 'accept':
      row.status='accepted';row.acceptedTick=world.tick;
      return event(world,row,'accept','两人在旧井另月签认','下界买家当面另月签认。此时只是定约，不认货到，也没向旧井借水。');
    case 'load':{
      const source=atExchange(world,actor,world.tick);
      if(!source)return null;
      const slices=holdUpperArrayLattice(world,actor,UPPER_ARRAY_TRADE_LATTICE);if(!slices)return null;
      row.load={tick:world.tick,journeyId:source.journey.id,visitId:source.visit.id,residenceId:source.residence.id,slices};
      row.status='carrying';recordResourceFlow(world,tradeFlow(row,'load'));
      return event(world,row,'load','原批随原身封装','两件现有原批离开阵仓入托，货只随这个人在正经界路移动。');
    }
    case 'unload':{
      const local=atExchange(world,actor,world.tick);
      if(!local||!row.load||!restockUpperArrayLattice(world,actor,row.load.slices))return null;
      row.restock={tick:world.tick,visitId:local.visit.id,journeyId:local.journey.id};
      row.closedTick=world.tick;row.status='restocked';recordResourceFlow(world,tradeFlow(row,'restock'));
      return event(world,row,'restock','未成交原批实回仓','原送货者确在原阵仓，才一次退回原来两件货。未动下界款。');
    }
    case 'settle':{
      const seller=person(world,row.sellerId),returned=upperArrayFieldTradeNativeReturn(world,row);
      if(!seller||!returned)return null;
      actor.herbs.earth_root-=UPPER_ARRAY_TRADE_ROOTS;seller.herbs.earth_root+=UPPER_ARRAY_TRADE_ROOTS;
      row.settlement={tick:world.tick,...returned};row.closedTick=world.tick;row.status='settled';
      recordResourceFlow(world,tradeFlow(row,'lattice_delivery'));recordResourceFlow(world,tradeFlow(row,'roots_payment'));
      return event(world,row,'settle','井边只交这一对原物','载货本人已过真正开的门，双方同在原井。买家第一次取得两件原阵材，卖家取得买家两株实根。旧水债另算。');
    }
  }
}
export function advanceUpperArrayFieldTrade(world:WorldState):void{
  const state=world.upperArrayField?.trade;
  if(!state||state.lastAdvancedTick===world.tick)return;
  state.lastAdvancedTick=world.tick;
  for(const row of state.agreements){
    if(row.status==='offered'&&world.tick>=row.offeredTick+UPPER_ARRAY_TRADE_OFFER_MONTHS||
      row.status==='accepted'&&row.acceptedTick!==undefined&&world.tick>=row.acceptedTick+UPPER_ARRAY_TRADE_LOAD_MONTHS){
      row.status='expired';row.closedTick=world.tick;
    }
  }
}
export function upperArrayFieldTradeCustody(world:WorldState):UpperArrayFieldLatticeCustody[]{
  return (world.upperArrayField?.trade?.agreements??[]).flatMap(row=>row.load?[{
    tradeId:row.id,actorId:row.sellerId,loadedTick:row.load.tick,slices:row.load.slices,...(row.restock?{restockedTick:row.restock.tick}:{}),
  }]:[]);
}
export function upperArrayFieldTradeReceivedLattice(world:WorldState,buyerId:string){
  return (world.upperArrayField?.trade?.agreements??[]).flatMap(row=>row.buyerId===buyerId&&row.settlement&&row.load?
    [{tradeId:row.id,tick:row.settlement.tick,slices:row.load.slices.map(piece=>({...piece}))}]:[]);
}

export interface UpperArrayFieldTradeView{
  readonly id:string;readonly yourRole:'seller'|'buyer';readonly status:UpperArrayFieldTradeAgreement['status'];
  readonly offeredTick:number;readonly acceptedTick?:number;readonly closedTick?:number;
  readonly cargo?:{readonly quantity:2;readonly phase:'field'|'in_transit'|'at_well'|'delivered'|'restocked';readonly atClosedThroat?:true};
}
export function projectUpperArrayFieldTrade(world:WorldState,viewer?:Cultivator):UpperArrayFieldTradeView[]{
  if(!viewer||!adult(viewer)||person(world,viewer.id)!==viewer)return [];
  return (world.upperArrayField?.trade?.agreements??[]).filter(row=>roleOf(row,viewer.id)).slice(-8).reverse().map(row=>{
    const yourRole=roleOf(row,viewer.id)!;
    const result:UpperArrayFieldTradeView={id:row.id,yourRole,status:row.status,offeredTick:row.offeredTick,
      acceptedTick:row.acceptedTick,closedTick:row.closedTick};
    if(!row.load)return result;
    const seller=person(world,row.sellerId),active=yourRole==='seller'?activeUpperPassage(world,viewer.id):undefined;
    const contact=seller&&physicallyAtWell(world,seller,world.tick)&&physicallyAtWell(world,viewer,world.tick)&&upperArrayFieldTradeNativeReturn(world,row);
    const held=row.status==='carrying'&&active?.id===row.load.journeyId&&active.direction==='inbound'&&
      viewer.locationId==='realm-passage-upper-step'&&!usableUpperPassageOpening(world,world.tick);
    const phase=row.status==='settled'?'delivered':row.status==='restocked'?'restocked':contact?'at_well':
      yourRole==='seller'&&upperArrayFieldPhysicalSite(world,viewer)?'field':'in_transit';
    return {...result,cargo:{quantity:UPPER_ARRAY_TRADE_LATTICE,phase,...(held?{atClosedThroat:true}:{})}};
  });
}
function historicalExchange(world:WorldState,actorId:string,visitId:string,journeyId:string,tick:number){
  const visit=world.upperArrayField?.visits.find(item=>item.id===visitId&&item.actorId===actorId&&item.journeyId===journeyId);
  return !!visit&&visit.enteredTick<tick&&(visit.exitedTick===undefined||visit.exitedTick>tick)&&
    (visit.deceasedTick===undefined||visit.deceasedTick>tick)&&
    visit.steps.filter(step=>step.tick<=tick).at(-1)?.siteId===UPPER_ARRAY_TRADE_EXCHANGE&&
    !visit.steps.some(step=>step.tick===tick)&&
    !!world.upperPassage?.journeys.some(journey=>journey.id===journeyId&&journey.actorId===actorId);
}
/** Typed shape first; then actual visits, dated native throat proof and current contract phases. */
export function verifyUpperArrayFieldTradeAgreement(world:WorldState,row:UpperArrayFieldTradeAgreement,
  through=world.upperArrayField?.trade?.lastAdvancedTick??0):boolean{
  if(row.sellerId===row.buyerId||!person(world,row.sellerId)||!person(world,row.buyerId)||row.offeredTick<1||
    row.offeredTick>world.tick||wellProof(world,row.offeredTick)?.id!==row.wellProjectId)return false;
  const accept=row.acceptedTick,end=row.offeredTick+UPPER_ARRAY_TRADE_OFFER_MONTHS;
  if(accept===undefined)return !row.load&&!row.settlement&&!row.restock&&
    (row.status==='offered'?row.closedTick===undefined&&through<end:row.status==='expired'&&row.closedTick===end&&end<=through);
  if(accept<=row.offeredTick||accept>end||accept>world.tick)return false;
  const due=accept+UPPER_ARRAY_TRADE_LOAD_MONTHS;
  const load=row.load;
  if(!load)return !row.settlement&&!row.restock&&(row.status==='accepted'?row.closedTick===undefined&&through<due:
    row.status==='expired'&&row.closedTick===due&&due<=through);
  if(load.tick<=accept||load.tick>=due||load.tick>world.tick||load.slices.length<1||load.slices.length>UPPER_ARRAY_TRADE_LATTICE||
    new Set(load.slices.map(s=>s.batchId)).size!==load.slices.length||
    load.slices.reduce((total,s)=>total+s.quantity,0)!==UPPER_ARRAY_TRADE_LATTICE||
    !historicalExchange(world,row.sellerId,load.visitId,load.journeyId,load.tick)||
    !world.upperArrayField?.residences.some(home=>home.id===load.residenceId&&home.actorId===row.sellerId&&home.settledTick<load.tick)||
    !world.upperPassage?.journeys.some(j=>j.id===load.journeyId&&j.wellProjectId===row.wellProjectId))return false;
  if(row.status==='carrying')return !!load&&!row.settlement&&!row.restock&&row.closedTick===undefined;
  if(row.status==='settled'){
    const outcome=row.settlement,way=upperArrayFieldTradeNativeReturn(world,row);
    return !!outcome&&!row.restock&&!!way&&row.closedTick===outcome.tick&&outcome.tick<=world.tick&&outcome.tick>way.returnedTick&&
      outcome.returnedTick===way.returnedTick&&outcome.crossedTick===way.crossedTick&&outcome.crossingOpeningId===way.crossingOpeningId;
  }
  const restock=row.restock;
  return row.status==='restocked'&&!!restock&&!row.settlement&&row.closedTick===restock.tick&&restock.tick<=world.tick&&
    restock.tick>load.tick&&historicalExchange(world,row.sellerId,restock.visitId,restock.journeyId,restock.tick)&&
    !!world.upperPassage?.journeys.some(j=>j.id===restock.journeyId&&j.wellProjectId===row.wellProjectId);
}
export function verifyUpperArrayFieldTradeJournal(world:WorldState):boolean{
  const months=new Map(world.resourceFlow.months.map(month=>[month.tick,month]));
  const checks=new Map<string,ReturnType<typeof tradeFlow>>();
  const key=(t:number,ref:string,reason:string)=>`${t}:${ref}:${reason}`;
  for(const row of world.upperArrayField?.trade?.agreements??[]){
    const requireAt=(tick:number|undefined,phase:Phase)=>{
      if(tick!==undefined&&months.has(tick)){const flow=tradeFlow(row,phase);checks.set(key(tick,row.id,flow.reason),flow);}
    };
    requireAt(row.load?.tick,'load');requireAt(row.restock?.tick,'restock');
    requireAt(row.settlement?.tick,'lattice_delivery');requireAt(row.settlement?.tick,'roots_payment');
  }
  for(const month of months.values()){
    for(const actual of month.entries){
      if(!actual.reason.startsWith('upper_array_field_trade_'))continue;
      const id=key(month.tick,actual.refId,actual.reason),expect=checks.get(id);
      if(!expect||actual.kind!=='transfer'||actual.mechanism!==expect.mechanism||actual.good!==expect.good||actual.amount!==expect.amount||
        !sameFlowAccount(actual.from,expect.from)||!sameFlowAccount(actual.to,expect.to)||actual.visibility.kind!=='participants'||
        expect.visibility.kind!=='participants'||actual.visibility.actorIds.length!==2||
        actual.visibility.actorIds.some((actor,i)=>expect.visibility.kind!=='participants'||actor!==expect.visibility.actorIds[i]))return false;
      checks.delete(id);
    }
    if(month.totalEntries===month.entries.length&&[...checks.keys()].some(id=>id.startsWith(month.tick+':')))return false;
  }
  return true;
}

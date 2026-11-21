import type {
  Cultivator, LLMDecisionPayload, MapHazard, MarketOrder, VillageFair, VillageFairMove, VillageFairsState,
  VillageFairStall, WorldEvent, WorldState,
} from '../types/world';
import { presentAtVillageGranary, granaryAt, type VillageGranaryDonationMove } from './villageGranaryEngine';
import { flowActor, flowVillageFairStall, recordResourceFlow } from './resourceFlowEngine';
import { terrainTileAt } from './terrainEngine';
import { routeWarningHazardValid } from './routeWarningProof';

export const VILLAGE_FAIR_CAPACITY = 2;
export const VILLAGE_FAIR_FEE = 4;
const WALLET_SAVE_LIMIT = 1_000_000_000;
export const createVillageFairsState = (): VillageFairsState => ({fairs:[],nextId:1});

export type VillageFairOption =
  | { action:'VILLAGE_FAIR';villageFairMove:'announce';targetSettlementId:string;targetVillageFairId?:never;targetMarketOrderId?:never }
  | { action:'VILLAGE_FAIR';villageFairMove:'reserve';targetVillageFairId:string;targetMarketOrderId:string;targetSettlementId?:never };

const actorAt = (world:WorldState,id:string) => world.cultivators.find(actor => actor.id===id);
const venueAt = (world:WorldState,settlementId:string,siteId:string) =>
  world.settlements.villages.some(row => row.id===settlementId && row.locationId===siteId && row.population>0)
    ? world.locations.find(row => row.id===siteId && row.type==='market') : undefined;
const pauseHazard = (world:WorldState,siteId:string,tick:number) => {
  const site = world.locations.find(row => row.id===siteId);
  const tile = site && terrainTileAt(world,site.x,site.y);
  return tile ? world.mapHazards.filter(row => row.tileId===tile.id && row.intensity>=2 &&
    routeWarningHazardValid(world,row,tick))
    .sort((a,b)=>b.intensity-a.intensity || a.createdTick-b.createdTick || (a.id<b.id?-1:a.id>b.id?1:0))[0] : undefined;
};
const hazardProof = ({id,kind,tileId,createdTick,expiresTick,intensity}:MapHazard) =>
  ({id,kind,tileId,createdTick,expiresTick,intensity});
const donationKind = (kind:string):kind is VillageGranaryDonationMove =>
  kind==='donate'||kind==='donate_roots'||kind==='donate_stones';
function priorDonation(world:WorldState,settlementId:string,actorId:string,tick:number) {
  const rows = granaryAt(world,settlementId)?.receipts;
  if (!rows) return undefined;
  for (let i=rows.length-1;i>=0;i--) {
    const row=rows[i];
    if (row.actorId===actorId && row.tick<tick && donationKind(row.kind)) return {tick:row.tick,kind:row.kind};
  }
  return undefined;
}
const realSellOrder = (order:MarketOrder,actorId:string,siteId:string,liveThroughTick:number):boolean =>
  order.actorId===actorId && order.locationId===siteId && order.side==='sell' && order.status==='open'
  && order.expiresTick>liveThroughTick && Number.isSafeInteger(order.remaining) && order.remaining>0
  && order.remaining===order.escrowGoods && order.remaining<=order.quantity;

function isOfferingAt(world:WorldState,fair:VillageFair,stall:VillageFairStall,tick:number) {
  const order = world.markets.orders.find(row => row.id===stall.orderId);
  return order && realSellOrder(order,stall.merchantId,fair.siteId,tick) ? order : undefined;
}

export function availableVillageFairActions(actor:Cultivator,world:WorldState,executionTick=world.tick):VillageFairOption[] {
  const village = presentAtVillageGranary(world,actor,executionTick);
  if (!village || !venueAt(world,village.id,village.locationId) || pauseHazard(world,village.locationId,executionTick)) return [];
  const active = world.villageFairs.fairs.find(fair => fair.settlementId===village.id &&
    (fair.status==='announced'||fair.status==='open') && executionTick<fair.endsTick);
  if (!active) return priorDonation(world,village.id,actor.id,executionTick)
    ? [{action:'VILLAGE_FAIR',villageFairMove:'announce',targetSettlementId:village.id}] : [];
  if (active.status!=='announced' || executionTick!==active.claimTick || actor.id===active.sponsorId ||
      !Number.isFinite(actor.spiritStones) || actor.spiritStones<VILLAGE_FAIR_FEE || actor.spiritStones>WALLET_SAVE_LIMIT ||
      active.stalls.length>=VILLAGE_FAIR_CAPACITY || active.stalls.some(stall=>stall.merchantId===actor.id)) return [];
  const sponsor = actorAt(world,active.sponsorId);
  if (!sponsor || presentAtVillageGranary(world,sponsor,executionTick)?.id!==village.id) return [];
  return world.markets.orders.filter(order=>realSellOrder(order,actor.id,active.siteId,active.opensTick)
    && !active.stalls.some(stall=>stall.orderId===order.id))
    .map(order=>({action:'VILLAGE_FAIR',villageFairMove:'reserve',targetVillageFairId:active.id,targetMarketOrderId:order.id}));
}

const baseKeys = ['chosenAction','innerMonologue','spokenLine','villageFairMove'];
function validKeys(payload:LLMDecisionPayload,move:VillageFairMove):boolean {
  const keys = move==='announce' ? [...baseKeys,'targetSettlementId'] : [...baseKeys,'targetVillageFairId','targetMarketOrderId'];
  return Object.keys(payload).every(key=>keys.includes(key));
}
function notice(world:WorldState,fair:VillageFair,suffix:string,title:string,description:string,merchantId?:string):WorldEvent {
  return {
    id:`evt-${world.tick}-${fair.id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,
    title,description,actorIds:merchantId?[fair.sponsorId,merchantId]:[fair.sponsorId],locationId:fair.siteId,
    category:'diplomacy',witnessScope:'participants',
  };
}

export function resolveVillageFairAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  const {villageFairMove:move}=payload;
  if (payload.chosenAction!=='VILLAGE_FAIR'||(move!=='announce'&&move!=='reserve')||!validKeys(payload,move)) return null;
  const exact=availableVillageFairActions(actor,world).find(option=>option.villageFairMove===move &&
    (option.villageFairMove==='announce'?option.targetSettlementId===payload.targetSettlementId:
      option.targetVillageFairId===payload.targetVillageFairId && option.targetMarketOrderId===payload.targetMarketOrderId));
  if (!exact) return null;
  if (exact.villageFairMove==='announce') {
    const village=presentAtVillageGranary(world,actor);
    const donor=priorDonation(world,exact.targetSettlementId,actor.id,world.tick);
    if (!village||!donor) return null;
    const fair:VillageFair={
      id:`village-fair-${world.villageFairs.nextId++}`,settlementId:village.id,siteId:village.locationId,
      sponsorId:actor.id,sponsorDonationTick:donor.tick,sponsorDonationKind:donor.kind,
      announcedTick:world.tick,claimTick:world.tick+1,opensTick:world.tick+2,endsTick:world.tick+3,
      status:'announced',stalls:[],
    };
    world.villageFairs.fairs.push(fair);
    return notice(world,fair,'announced','乡集排期','本村核验了实到发起人与旧捐记录，并公布两席择日开市。');
  }
  const fair=world.villageFairs.fairs.find(row=>row.id===exact.targetVillageFairId);
  if (!fair) return null;
  const stall:VillageFairStall={merchantId:actor.id,orderId:exact.targetMarketOrderId,reservedTick:world.tick,
    feeEscrow:VILLAGE_FAIR_FEE,status:'reserved'};
  actor.spiritStones-=stall.feeEscrow;
  fair.stalls.push(stall);
  recordResourceFlow(world,{kind:'transfer',mechanism:'village_fair',refId:fair.id,reason:'fair_reserve_fee',good:'stone',amount:stall.feeEscrow,
    visibility:{kind:'participants',actorIds:[fair.sponsorId,stall.merchantId]},from:flowActor(stall.merchantId),
    to:flowVillageFairStall(fair.id,stall.orderId)});
  return notice(world,fair,`${stall.orderId}-reserved`,'乡集摊位已留','预留现有坊市卖单的一席，四枚摊费进入托管；不另收货物。',stall.merchantId);
}

function refund(world:WorldState,fair:VillageFair,stall:VillageFairStall):WorldEvent|undefined {
  if (stall.status!=='refund_due' || stall.feeEscrow!==VILLAGE_FAIR_FEE) return undefined;
  const actor = actorAt(world,stall.merchantId);
  if (!actor || !Number.isFinite(actor.spiritStones) || actor.spiritStones<0 ||
      actor.spiritStones+stall.feeEscrow>WALLET_SAVE_LIMIT) return undefined;
  const amount=stall.feeEscrow;
  actor.spiritStones+=amount;
  stall.feeEscrow=0;
  stall.status='refunded';
  stall.settledTick=world.tick;
  recordResourceFlow(world,{kind:'transfer',mechanism:'village_fair',refId:fair.id,reason:'fair_refund_fee',good:'stone',amount,
    visibility:{kind:'participants',actorIds:[fair.sponsorId,stall.merchantId]},from:flowVillageFairStall(fair.id,stall.orderId),to:flowActor(stall.merchantId)});
  return notice(world,fair,`${stall.orderId}-refund`,'乡集摊费退还','尚未入账的实有摊费原额退回，不改动坊市挂单。',stall.merchantId);
}

function release(stall:VillageFairStall,reason:NonNullable<VillageFairStall['releaseReason']>):void {
  if (stall.status!=='reserved') return;
  stall.status='refund_due';
  stall.releaseReason=reason;
}

function pay(world:WorldState,fair:VillageFair,stall:VillageFairStall,order:MarketOrder):WorldEvent {
  const amount=stall.feeEscrow;
  stall.offering={good:order.good,quantity:order.remaining,unitPrice:order.limitPrice};
  stall.status='paid';
  stall.feeEscrow=0;
  stall.settledTick=world.tick;
  recordResourceFlow(world,{kind:'consumption',mechanism:'village_fair',refId:fair.id,reason:'fair_local_service',good:'stone',amount,
    visibility:{kind:'participants',actorIds:[fair.sponsorId,stall.merchantId]},from:flowVillageFairStall(fair.id,stall.orderId)});
  return notice(world,fair,`${stall.orderId}-paid`,'乡集摊位开售','已核验到场和坊市真实待售库存，摊费支付本地摊场服务。',stall.merchantId);
}

export function advanceVillageFairs(world:WorldState):WorldEvent[] {
  const events:WorldEvent[]=[];
  for (const fair of world.villageFairs.fairs) {
    if (fair.status==='announced') {
      const venue=venueAt(world,fair.settlementId,fair.siteId);
      const hazard=venue?pauseHazard(world,fair.siteId,world.tick):undefined;
      const sponsor=actorAt(world,fair.sponsorId);
      const closure=!venue?'venue_missing':hazard?'site_hazard':
        world.tick>=fair.opensTick && (!sponsor||presentAtVillageGranary(world,sponsor)?.id!==fair.settlementId)?'sponsor_absent':undefined;
      if (closure) {
        fair.status='cancelled';
        fair.closure=closure;
        fair.closedTick=world.tick;
        if (hazard) fair.hazard=hazardProof(hazard);
        fair.stalls.forEach(stall=>release(stall,'fair_cancelled'));
        events.push(notice(world,fair,'cancelled','乡集取消','开市前现场未通过核验，未用摊费按原额退还。'));
      } else if (world.tick===fair.opensTick) {
        fair.status='open';
        for (const stall of fair.stalls) {
          const merchant=actorAt(world,stall.merchantId);
          const order=isOfferingAt(world,fair,stall,world.tick);
          if (!merchant||presentAtVillageGranary(world,merchant)?.id!==fair.settlementId) release(stall,'merchant_absent');
          else if (!order) release(stall,'order_unavailable');
          else events.push(pay(world,fair,stall,order));
        }
        events.push(notice(world,fair,'opened','乡集开市','仅展示仍有实货托管且守约到场的摊位，不另行交易或记入村籍。'));
      }
    } else if (fair.status==='open' && world.tick>=fair.endsTick) {
      fair.status='ended';
      fair.closedTick=world.tick;
    }
    for (const stall of fair.stalls) {
      const event=refund(world,fair,stall);
      if (event) events.push(event);
    }
  }
  return events;
}

export function projectVillageFairs(world:WorldState,viewer?:Cultivator) {
  const village = viewer && presentAtVillageGranary(world,viewer);
  if (!viewer || !village) return undefined;
  const fair=[...world.villageFairs.fairs].reverse().find(row=>row.settlementId===village.id);
  if (!fair) return undefined;
  const current=fair.status==='open' && world.tick<fair.endsTick && !!venueAt(world,fair.settlementId,fair.siteId) &&
    !pauseHazard(world,fair.siteId,world.tick);
  return {
    settlementId:fair.settlementId,id:fair.id,status:fair.status,announcedTick:fair.announcedTick,
    claimTick:fair.claimTick,opensTick:fair.opensTick,endsTick:fair.endsTick,closedTick:fair.closedTick,closure:fair.closure,
    capacity:VILLAGE_FAIR_CAPACITY,reserved:fair.stalls.length,
    offerings:current?fair.stalls.flatMap(stall=>{
      if (stall.status!=='paid') return [];
      const merchant=actorAt(world,stall.merchantId);
      if (!merchant || presentAtVillageGranary(world,merchant)?.id!==fair.settlementId) return [];
      const order=isOfferingAt(world,fair,stall,world.tick);
      return order ? [{good:order.good,quantity:order.remaining,unitPrice:order.limitPrice}]:[];
    }):[],
    ownStall:fair.stalls.flatMap(stall=>stall.merchantId===viewer.id?[{
      status:stall.status,reservedTick:stall.reservedTick,feeEscrow:stall.feeEscrow,settledTick:stall.settledTick,
      releaseReason:stall.releaseReason,offering:stall.offering,
    }]:[])[0],
  };
}

export function projectLocalVillageFair(world:WorldState,viewer?:Cultivator):{siteId:string;paidStalls:number}|undefined {
  const village = viewer && presentAtVillageGranary(world,viewer);
  if (!village || pauseHazard(world,village.locationId,world.tick)) return undefined;
  const fair=world.villageFairs.fairs.find(row=>row.settlementId===village.id && row.status==='open' && world.tick<row.endsTick);
  if (!fair || !venueAt(world,fair.settlementId,fair.siteId)) return undefined;
  return {siteId:fair.siteId,paidStalls:fair.stalls.filter(stall=>stall.status==='paid').length};
}

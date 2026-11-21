import type {
  CaravanRestitutionLot, CaravanRestitutionMove, CaravanRestitutionState, Cultivator, LLMDecisionPayload,
  LocationNode, MapHazard, MarketShipment, WorldEvent, WorldState,
} from '../types/world';
import { flowActor, flowSalvage, recordResourceFlow } from './resourceFlowEngine';
import { terrainTileAt } from './terrainEngine';

export const CARAVAN_SALVAGE_GOODS = ['jade_leaf','earth_root'] as const;
const RETURNED_HISTORY_LIMIT = 96;

export interface CaravanRestitutionOption {
  action: 'CARAVAN_RESTITUTION';
  restitutionMove: CaravanRestitutionMove;
  targetRestitutionId: string;
}
export interface CaravanRestitutionView {
  /** Scoped display key, never a capability for local actions. */
  id: string;
  siteId: string;
  good: CaravanRestitutionLot['good'];
  units: 1;
  status: CaravanRestitutionLot['status'];
  role: 'local'|'finder'|'seller';
  discoveredTick?: number;
  returnedTick?: number;
  receipt?: {
    shipmentId?: string;
    sourceLossEventId?: string;
    openedTick: number;
    discoveredTick: number;
    returnedTick: number;
    returnedBy: 'finder'|'seller';
  };
}

export const createCaravanRestitutionState = (): CaravanRestitutionState => ({lots:[]});
const byId = (a:{id:string},b:{id:string}) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const actorAt = (world: WorldState,id: string) => world.cultivators.find(actor => actor.id === id);
const live = (actor: Cultivator|undefined): actor is Cultivator => !!actor?.alive && actor.hp > 0;
const adult = (actor: Cultivator) => Number.isFinite(actor.age) && actor.age >= 18;
const durable = (good: MarketShipment['good']): good is CaravanRestitutionLot['good'] =>
  good === 'jade_leaf' || good === 'earth_root';
const safeSite = (site: LocationNode) => site.type !== 'secret_realm' && site.type !== 'abyss';
const safeTileSite = (world: WorldState,lot: CaravanRestitutionLot) => world.locations.some(site =>
  site.id === lot.siteId && safeSite(site) && terrainTileAt(world,site.x,site.y)?.id === lot.tileId);

function physicallyPresent(world: WorldState,actor: Cultivator|undefined,siteId: string): actor is Cultivator {
  if (!live(actor) || actor.locationId !== siteId || actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  const id = actor.id;
  return !world.couriers.dispatches.some(row => row.courierId === id && (row.status === 'in_transit' || row.status === 'returning')) &&
    !world.pilgrimages.journeys.some(row => row.status === 'active' && (row.organizerId === id || row.companionId === id)) &&
    !world.escorts.contracts.some(row => row.status === 'active' && row.escortId === id) &&
    !world.relocations.plans.some(row => row.status === 'in_transit' && row.garrisonIds.includes(id)) &&
    !world.boundaryReliefs.cases.some(row => row.incomingId === id && (row.status === 'travelling' || row.status === 'returning')) &&
    !world.sieges.some(row => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(id)) &&
    !world.occasions.some(row => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(id) &&
      !world.expeditionRescues.requests.some(rescue => rescue.occasionId === row.id && rescue.arrivedIds?.includes(id))) &&
    !world.expeditionRescues.requests.some(row => row.gateSiteId === siteId && (row.explorerId === id || row.rescuerId === id) &&
      row.supplySpent === 1 && (row.status === 'extracting' || row.status === 'interrupted' && row.pathIndex > 0 &&
        !row.arrivedIds?.includes(id) && world.occasions.some(occasion => occasion.id === row.occasionId && occasion.status === 'running')));
}

/** Canonical market calls this only for the hazard actually struck during its crossed-segment loss decision. */
export function sealCaravanSalvage(world: WorldState,shipment: MarketShipment,sourceLossEvent: WorldEvent,
  actualHazard: MapHazard): CaravanRestitutionLot|undefined {
  const good = shipment.good;
  if (!world.markets.shipments.includes(shipment) || shipment.status !== 'lost' || shipment.settledTick !== world.tick ||
    world.tick <= shipment.departedTick || !Number.isSafeInteger(shipment.quantity) || shipment.quantity < 2 || !durable(good) ||
    shipment.buyerId === shipment.sellerId || !actorAt(world,shipment.buyerId) || !actorAt(world,shipment.sellerId) ||
    !world.mapHazards.includes(actualHazard) || actualHazard.kind !== 'beast_tide' || actualHazard.intensity !== 2 ||
    actualHazard.createdTick > world.tick || actualHazard.expiresTick <= world.tick ||
    sourceLossEvent.id !== `evt-${world.tick}-market-${shipment.id}` || sourceLossEvent.tick !== world.tick ||
    sourceLossEvent.category !== 'diplomacy' || sourceLossEvent.locationId !== shipment.destinationId ||
    sourceLossEvent.actorIds.length !== 2 || !sourceLossEvent.actorIds.includes(shipment.buyerId) ||
    !sourceLossEvent.actorIds.includes(shipment.sellerId) ||
    !world.markets.receipts.some(receipt => receipt.shipmentId === shipment.id && receipt.status === 'lost' &&
      receipt.tick === world.tick && receipt.quantity === shipment.quantity && receipt.good === good &&
      receipt.originId === shipment.originId && receipt.destinationId === shipment.destinationId &&
      receipt.buyerId === shipment.buyerId && receipt.sellerId === shipment.sellerId && receipt.unitPrice === shipment.unitPrice) ||
    world.caravanRestitution.lots.some(lot => lot.shipmentId === shipment.id)) return undefined;
  const site = world.locations.filter(location => safeSite(location) &&
    terrainTileAt(world,location.x,location.y)?.id === actualHazard.tileId).sort(byId)[0];
  if (!site) return undefined;
  const lot: CaravanRestitutionLot = {
    id:`salvage-${shipment.id}`,shipmentId:shipment.id,sourceLossEventId:sourceLossEvent.id,
    siteId:site.id,tileId:actualHazard.tileId,hazardId:actualHazard.id,hazardIntensity:2,
    openedTick:world.tick,good,originalQuantity:shipment.quantity,destroyedQuantity:shipment.quantity-1,units:1,
    buyerId:shipment.buyerId,sellerId:shipment.sellerId,status:'buried',
  };
  world.caravanRestitution.lots.push(lot);
  return lot;
}

function hasDiscovery(lot: CaravanRestitutionLot): lot is CaravanRestitutionLot & {finderId:string;discoveredTick:number} {
  return !!lot.finderId && lot.finderId !== lot.sellerId && lot.discoveredTick !== undefined && lot.discoveredTick > lot.openedTick;
}

export function availableCaravanRestitutionActions(actor: Cultivator,world: WorldState,
  executionTick = world.tick): CaravanRestitutionOption[] {
  if ((executionTick !== world.tick && executionTick !== world.tick+1) || !world.caravanRestitution.lots.length ||
    !live(actor) || !world.cultivators.includes(actor) || !physicallyPresent(world,actor,actor.locationId)) return [];
  const options: CaravanRestitutionOption[] = [];
  for (const lot of world.caravanRestitution.lots) {
    if (lot.status === 'returned' || lot.siteId !== actor.locationId || lot.openedTick >= executionTick || !safeTileSite(world,lot)) continue;
    const add = (restitutionMove: CaravanRestitutionMove) =>
      options.push({action:'CARAVAN_RESTITUTION',restitutionMove,targetRestitutionId:lot.id});
    if (lot.status === 'buried') {
      if (actor.id !== lot.sellerId && adult(actor)) add('discover');
      continue;
    }
    if (!hasDiscovery(lot) || lot.discoveredTick >= executionTick ||
      (actor.id !== lot.sellerId && actor.id !== lot.finderId)) continue;
    const seller = actor.id === lot.sellerId ? actor : actorAt(world,lot.sellerId);
    if (physicallyPresent(world,seller,lot.siteId) && Number.isSafeInteger(seller.herbs[lot.good]+lot.units) &&
      seller.herbs[lot.good] >= 0) add('return');
  }
  return options;
}

function event(world: WorldState,lot: CaravanRestitutionLot,token:string,title:string,description:string,actorIds:string[]):WorldEvent {
  return {id:`evt-caravan-restitution-${lot.id}-${world.tick}-${token}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',title,description,actorIds,locationId:lot.siteId,witnessScope:'participants'};
}

function keepRecentReturns(world: WorldState) {
  const state = world.caravanRestitution;
  if (state.lots.length <= RETURNED_HISTORY_LIMIT) return;
  const recent = new Set(state.lots.filter(lot => lot.status === 'returned')
    .sort((a,b) => (a.returnedTick ?? 0)-(b.returnedTick ?? 0) || byId(a,b)).slice(-RETURNED_HISTORY_LIMIT).map(lot => lot.id));
  state.lots = state.lots.filter(lot => lot.status !== 'returned' || recent.has(lot.id));
}

export function resolveCaravanRestitutionAction(world: WorldState,actor: Cultivator,payload: LLMDecisionPayload): WorldEvent|null {
  if (payload.chosenAction !== 'CARAVAN_RESTITUTION' || payload.targetCultivatorId !== undefined ||
    payload.targetLocationId !== undefined || payload.targetSettlementId !== undefined || payload.targetShipmentId !== undefined ||
    payload.marketGood !== undefined ||
    payload.marketQuantity !== undefined || payload.marketLimitPrice !== undefined) return null;
  const option = availableCaravanRestitutionActions(actor,world).find(candidate =>
    candidate.restitutionMove === payload.restitutionMove && candidate.targetRestitutionId === payload.targetRestitutionId);
  if (!option) return null;
  const lot = world.caravanRestitution.lots.find(item => item.id === option.targetRestitutionId)!;
  if (option.restitutionMove === 'discover') {
    lot.status = 'sealed';
    lot.finderId = actor.id;
    lot.discoveredTick = world.tick;
    return event(world,lot,'discovered','就地查见真实商队遗货','只封存原批留下的一份遗货；发现者并未取得货物。',[actor.id]);
  }
  const seller = actorAt(world,lot.sellerId)!;
  seller.herbs[lot.good] += lot.units;
  lot.status = 'returned';
  lot.returnedTick = world.tick;
  lot.returnedById = actor.id;
  const participants = [lot.sellerId,lot.finderId!];
  recordResourceFlow(world,{kind:'transfer',mechanism:'market',refId:lot.id,reason:'caravan_restitution',
    good:lot.good,amount:lot.units,from:flowSalvage(lot.id),to:flowActor(seller.id),visibility:{kind:'participants',actorIds:participants}});
  keepRecentReturns(world);
  return event(world,lot,'returned','经现场核验交还原卖方','原货中的一份已交还，只结清遗货托管。原货款、退款和毁损不回滚。',
    actor.id === seller.id ? [seller.id] : [seller.id,actor.id]);
}

export function visibleCaravanRestitution(world: WorldState,viewer?: Cultivator): CaravanRestitutionView[] {
  if (!viewer || !world.caravanRestitution.lots.length || !world.cultivators.includes(viewer)) return [];
  const result: CaravanRestitutionView[] = [];
  const onsite = physicallyPresent(world,viewer,viewer.locationId);
  for (const lot of world.caravanRestitution.lots) {
    if (lot.openedTick > world.tick) continue;
    const role = viewer.id === lot.sellerId ? 'seller' : viewer.id === lot.finderId ? 'finder' : 'local';
    const {siteId,good,units,status} = lot;
    // The canonical lot ID embeds the private shipment ID. Non-sellers see only a view-local row key.
    const id = role === 'seller' ? lot.id : `local-restoration-${result.length+1}`;
    if (status === 'returned') {
      if (role === 'local' || !hasDiscovery(lot) || lot.returnedTick === undefined || lot.returnedTick > world.tick) continue;
      result.push({id,siteId,good,units,status,role,discoveredTick:lot.discoveredTick,returnedTick:lot.returnedTick,
        receipt:{...(role === 'seller' ? {shipmentId:lot.shipmentId,sourceLossEventId:lot.sourceLossEventId} : {}),
          openedTick:lot.openedTick,discoveredTick:lot.discoveredTick,returnedTick:lot.returnedTick,
          returnedBy:lot.returnedById === lot.sellerId ? 'seller' : 'finder'}});
    } else if (onsite && viewer.locationId === siteId && safeTileSite(world,lot)) {
      result.push({id,siteId,good,units,status,role,
        ...(hasDiscovery(lot) && lot.discoveredTick <= world.tick ? {discoveredTick:lot.discoveredTick} : {})});
    }
  }
  return result;
}

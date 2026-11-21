import { escortDirective, settleEscortWithShipment } from './escortEngine';
import { causalChronicleEventId, recordCausalChronicleNode } from './chronicleCausalityEngine';
import type { CausalChronicleOutcome, CausalChroniclePredecessor } from '../types/world';
import { flowActor, flowOrder, flowShipment, recordResourceFlow } from './resourceFlowEngine';
import type { Cultivator, HerbId, LLMDecisionPayload, MarketGood, MarketOrder, MarketReceipt, MarketShipment, MarketState, LocationNode, WorldEvent, WorldState } from '../types/world';
import { terrainTileAt } from './terrainEngine';
import { weatherTravelFriction } from './weatherEngine';

export const MARKET_GOODS: Record<MarketGood, { label: string; referencePrice: number }> = {
  jade_leaf: { label: '翡翠灵叶', referencePrice: 9 },
  earth_root: { label: '玄土根', referencePrice: 12 },
  star_bloom: { label: '星露花', referencePrice: 18 },
  shadow_moss: { label: '幽影苔', referencePrice: 16 },
  foundation: { label: '筑基丹', referencePrice: 48 },
  golden: { label: '九转金丹', referencePrice: 108 },
  barrier: { label: '破障丹', referencePrice: 88 },
  heart_poison: { label: '噬心毒丹', referencePrice: 72 },
};
const GOODS = Object.keys(MARKET_GOODS) as MarketGood[];
const herbs = new Set<MarketGood>(['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss']);
const isHerb = (good: MarketGood): good is HerbId => herbs.has(good);
const MAX_QUANTITY = 12;
const MAX_PRICE = 500;
const ORDER_LIFE = 8;
const MAX_ACTIVE_ORDERS = 48;
const MAX_ACTOR_ORDERS = 3;
const MAX_CONVOYS = 48;
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const owner = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const market = (world: WorldState, id: string) => world.locations.find((location) => location.id === id && location.type === 'market');

export type MarketOption =
  | { action: 'PLACE_MARKET_BUY' | 'PLACE_MARKET_SELL'; marketGood: MarketGood; marketQuantity: number; marketLimitPrice: number; targetMarketOrderId?: never }
  | { action: 'CANCEL_MARKET_ORDER'; targetMarketOrderId: string; marketGood?: never; marketQuantity?: never; marketLimitPrice?: never };

export const createMarketState = (): MarketState => ({ orders: [], shipments: [], receipts: [], nextId: 1 });

export function marketOrdersInPriority(orders: readonly MarketOrder[], side: MarketOrder['side']): MarketOrder[] {
  return orders.filter((entry) => entry.status === 'open' && entry.side === side).sort((a, b) =>
    (side === 'buy' ? b.limitPrice - a.limitPrice : a.limitPrice - b.limitPrice) || a.sequence - b.sequence);
}

function store(actor: Cultivator, good: MarketGood, delta: number): void {
  if (isHerb(good)) actor.herbs[good] += delta;
  else actor.pills[good] += delta;
}
const count = (actor: Cultivator, good: MarketGood): number => isHerb(good) ? actor.herbs[good] : actor.pills[good];
const integerIn = (value: number | undefined, low: number, high: number): value is number =>
  value !== undefined && Number.isSafeInteger(value) && value >= low && value <= high;
const validGood = (value: MarketGood | undefined): value is MarketGood => value !== undefined && GOODS.includes(value);

type MarketFlowAccount = ReturnType<typeof flowActor> | ReturnType<typeof flowOrder> | ReturnType<typeof flowShipment>;
function transfer(world: WorldState, refId: string, reason: string, good: MarketGood | 'stone', amount: number,
  actorIds: string[], from: MarketFlowAccount, to: MarketFlowAccount): void {
  if (amount > 0) recordResourceFlow(world, { kind: 'transfer', mechanism: 'market', refId, reason, good, amount,
    visibility: { kind: 'participants', actorIds }, from, to });
}

const activeDangers = (world: WorldState, ids: Set<string>) => world.mapHazards.filter((hazard) =>
  hazard.createdTick <= world.tick && hazard.expiresTick > world.tick && ids.has(hazard.tileId) && hazard.intensity >= 1);
const tileId = (world: WorldState, x: number, y: number) => terrainTileAt(world, x, y)?.id;

export function marketClosureReason(world: WorldState, locationId: string): string | undefined {
  const place = market(world, locationId);
  if (!place) return '该处已不是坊市';
  const id = tileId(world, place.x, place.y);
  if (id && activeDangers(world, new Set([id])).length) return '坊市遭遇地脉灾害，暂时闭市';
  if (world.sieges.some((siege) => siege.destinationId === locationId && siege.status === 'sieging')) return '战事封市';
  const offset = Math.floor((place.x + place.y) / 90) % 7;
  if ((world.tick + offset) % 13 === 0) return '定期闭市检修';
}

function canPlace(world: WorldState, actor: Cultivator): boolean {
  const open = world.markets.orders.filter(({ status }) => status === 'open');
  return !marketClosureReason(world, actor.locationId) &&
    open.length < MAX_ACTIVE_ORDERS && open.filter(({ actorId }) => actorId === actor.id).length < MAX_ACTOR_ORDERS;
}

export function availableMarketActions(actor: Cultivator, world: WorldState): MarketOption[] {
  if (!live(actor) || owner(world, actor.id) !== actor) return [];
  const options: MarketOption[] = world.markets.orders
    .filter((entry) => entry.status === 'open' && entry.actorId === actor.id && entry.expiresTick > world.tick)
    .map(({ id }) => ({ action: 'CANCEL_MARKET_ORDER', targetMarketOrderId: id }));
  if (!canPlace(world, actor)) return options;
  const otherOrders = world.markets.orders.filter((entry) => entry.actorId !== actor.id && entry.expiresTick > world.tick &&
    entry.status === 'open' && !marketClosureReason(world, entry.locationId));
  for (const marketGood of GOODS) {
    const matching = otherOrders.filter(({ good }) => good === marketGood);
    const reference = MARKET_GOODS[marketGood].referencePrice;
    const bestAsk = marketOrdersInPriority(matching, 'sell')[0]?.limitPrice;
    const bestBid = marketOrdersInPriority(matching, 'buy')[0]?.limitPrice;
    const buy = bestAsk !== undefined && bestAsk <= reference * 1.5 ? bestAsk : reference;
    const sell = bestBid !== undefined && bestBid >= reference * .65 ? bestBid : reference;
    if (actor.spiritStones >= buy) options.push({ action: 'PLACE_MARKET_BUY', marketGood, marketQuantity: 1, marketLimitPrice: buy });
    if (count(actor, marketGood) >= 1) options.push({ action: 'PLACE_MARKET_SELL', marketGood, marketQuantity: 1, marketLimitPrice: sell });
  }
  return options;
}

function event(world: WorldState, key: string, title: string, description: string, actorIds: string[], locationId: string): WorldEvent {
  return { id: `evt-${world.tick}-market-${key}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId, category: 'diplomacy' };
}

function releaseOrder(world: WorldState, actor: Cultivator, order: MarketOrder, status: 'cancelled' | 'expired'): WorldEvent {
  const refund = order.escrowStones;
  const goods = order.escrowGoods;
  actor.spiritStones += refund;
  store(actor, order.good, goods);
  order.escrowStones = 0;
  order.escrowGoods = 0;
  order.status = status;
  order.settledTick = world.tick;
  transfer(world, order.id, 'order_release', 'stone', refund, [actor.id], flowOrder(order.id), flowActor(actor.id));
  transfer(world, order.id, 'order_release', order.good, goods, [actor.id], flowOrder(order.id), flowActor(actor.id));
  return event(world, `${order.id}-${status}`, status === 'cancelled' ? '坊市撤单' : '坊市挂单到期',
    `${actor.name}的挂单结束，退回${refund}灵石、${goods}份${MARKET_GOODS[order.good].label}。`, [actor.id], order.locationId);
}

export function resolveMarketAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (!live(actor) || owner(world, actor.id) !== actor) return null;
  if (decision.chosenAction === 'CANCEL_MARKET_ORDER') {
    const order = world.markets.orders.find((entry) =>
      entry.id === decision.targetMarketOrderId && entry.actorId === actor.id && entry.status === 'open' && entry.expiresTick > world.tick);
    return order ? releaseOrder(world, actor, order, 'cancelled') : null;
  }
  const side = decision.chosenAction === 'PLACE_MARKET_BUY' ? 'buy' : decision.chosenAction === 'PLACE_MARKET_SELL' ? 'sell' : undefined;
  const { marketGood: good, marketQuantity: quantity, marketLimitPrice: limitPrice } = decision;
  if (!side || !validGood(good) || !integerIn(quantity, 1, MAX_QUANTITY) || !integerIn(limitPrice, 1, MAX_PRICE) || !canPlace(world, actor)) return null;
  const escrowStones = side === 'buy' ? quantity * limitPrice : 0;
  const escrowGoods = side === 'sell' ? quantity : 0;
  if (escrowStones > actor.spiritStones || escrowGoods > count(actor, good)) return null;
  actor.spiritStones -= escrowStones;
  store(actor, good, -escrowGoods);
  const sequence = world.markets.nextId++;
  const order: MarketOrder = { id: `order-${sequence}`, sequence, actorId: actor.id, locationId: actor.locationId,
    side, good, quantity, remaining: quantity, limitPrice, escrowStones, escrowGoods,
    placedTick: world.tick, expiresTick: world.tick + ORDER_LIFE, status: 'open' };
  world.markets.orders.push(order);
  transfer(world, order.id, 'order_deposit', 'stone', escrowStones, [actor.id], flowActor(actor.id), flowOrder(order.id));
  transfer(world, order.id, 'order_deposit', order.good, escrowGoods, [actor.id], flowActor(actor.id), flowOrder(order.id));
  const fact = event(world, order.id, side === 'buy' ? '坊市买单入簿' : '坊市卖单入簿',
    `${actor.name}挂出${quantity}份${MARKET_GOODS[good].label}，限价${limitPrice}灵石，履约资产交由坊市保管。`, [actor.id], order.locationId);
  recordCausalChronicleNode(world, fact, { kind: side === 'buy' ? 'market_buy_order' : 'market_sell_order', entityId: order.id });
  return fact;
}

function record(world: WorldState, trade: Pick<MarketReceipt, 'buyerId' | 'sellerId' | 'originId' | 'destinationId' | 'good' | 'quantity' | 'unitPrice'>,
  status: MarketReceipt['status'], shipmentId?: string, reason?: string): string {
  const sequence = world.markets.nextId++;
  const id = `receipt-${sequence}`;
  const { buyerId, sellerId, originId, destinationId, good, quantity, unitPrice } = trade;
  world.markets.receipts.push({ id, sequence, buyerId, sellerId, originId, destinationId, good,
    quantity, unitPrice, tick: world.tick, status, ...(shipmentId ? { shipmentId } : {}), ...(reason ? { reason } : {}) });
  return id;
}

type Trade = Pick<MarketShipment, 'buyerId' | 'sellerId' | 'originId' | 'destinationId' | 'good' | 'quantity' | 'unitPrice'>;

function matchingProof(world: WorldState, bid: MarketOrder, ask: MarketOrder): CausalChroniclePredecessor[] {
  const buyId = causalChronicleEventId(world, 'market_buy_order', bid.id);
  const sellId = causalChronicleEventId(world, 'market_sell_order', ask.id);
  return [
    ...(buyId ? [{ eventId: buyId, relation: 'matched_buy_order' as const }] : []),
    ...(sellId ? [{ eventId: sellId, relation: 'matched_sell_order' as const }] : []),
  ];
}

function match(world: WorldState, bid: MarketOrder, ask: MarketOrder, buyer: Cultivator, seller: Cultivator,
  origin: LocationNode, destination: LocationNode): WorldEvent {
  const quantity = Math.min(bid.remaining, ask.remaining);
  const unitPrice = bid.sequence < ask.sequence ? bid.limitPrice : ask.limitPrice;
  const price = unitPrice * quantity;
  const difference = quantity * (bid.limitPrice - unitPrice);
  const participants = [buyer.id, seller.id];
  bid.escrowStones -= quantity * bid.limitPrice;
  ask.escrowGoods -= quantity;
  buyer.spiritStones += difference;
  for (const order of [bid, ask]) {
    order.remaining -= quantity;
    if (order.remaining === 0) {
      order.status = 'filled';
      order.settledTick = world.tick;
    }
  }
  const trade: Trade = { buyerId: buyer.id, sellerId: seller.id, originId: origin.id, destinationId: destination.id,
    good: ask.good, quantity, unitPrice };
  if (origin.id === destination.id) {
    store(buyer, ask.good, quantity);
    seller.spiritStones += price;
    const ref = record(world, trade, 'local_fill');
    transfer(world, ref, 'price_improvement', 'stone', difference, [buyer.id], flowOrder(bid.id), flowActor(buyer.id));
    transfer(world, ref, 'local_fill', 'stone', price, participants, flowOrder(bid.id), flowActor(seller.id));
    transfer(world, ref, 'local_fill', ask.good, quantity, participants, flowOrder(ask.id), flowActor(buyer.id));
    const fact = event(world, `fill-${world.markets.nextId - 1}`, '坊市当场结算',
      `${quantity}份${MARKET_GOODS[ask.good].label}成交，每份${unitPrice}灵石，货款当场交割。`, [buyer.id, seller.id], origin.id);
    recordCausalChronicleNode(world, fact, { kind: 'market_settlement', entityId: ref, outcome: 'local_fill',
      predecessors: matchingProof(world, bid, ask) });
    return fact;
  }
  const eta = Math.min(6, Math.max(2, Math.ceil(Math.hypot(origin.x - destination.x, origin.y - destination.y) / 160) +
    (weatherTravelFriction(world, origin, destination) >= .45 ? 1 : 0)));
  const sequence = world.markets.nextId++;
  const shipment: MarketShipment = { ...trade, id: `caravan-${sequence}`, sequence, buyOrderId: bid.id,
    sellOrderId: ask.id, departedTick: world.tick, arrivalTick: world.tick + eta, status: 'in_transit' };
  world.markets.shipments.push(shipment);
  transfer(world, shipment.id, 'price_improvement', 'stone', difference, [buyer.id], flowOrder(bid.id), flowActor(buyer.id));
  transfer(world, shipment.id, 'shipment_departure', 'stone', price, participants, flowOrder(bid.id), flowShipment(shipment.id));
  transfer(world, shipment.id, 'shipment_departure', ask.good, quantity, participants, flowOrder(ask.id), flowShipment(shipment.id));
  const fact = event(world, shipment.id, '跨坊商队启程',
    `${quantity}份${MARKET_GOODS[ask.good].label}由${origin.name}运往${destination.name}，预计${eta}回合。货款待到货结算。`,
    [buyer.id, seller.id], origin.id);
  recordCausalChronicleNode(world, fact, { kind: 'market_shipment', entityId: shipment.id,
    predecessors: matchingProof(world, bid, ask) });
  return fact;
}

function routeDanger(world: WorldState, shipment: MarketShipment, origin: LocationNode, destination: LocationNode,
  directive?: ReturnType<typeof escortDirective>): boolean {
  const duration = shipment.arrivalTick - shipment.departedTick;
  const end = Math.min(1, (world.tick - shipment.departedTick - (directive?.baselineDelay ?? 0)) / duration);
  const start = Math.max(0, end - 1 / duration);
  const ids = new Set<string>(directive?.managed ? directive.crossedTileIds : []);
  // Only test the actual segment crossed this tick; a distant disaster cannot hit the caravan.
  for (let i = 0; !directive?.managed && i <= 12; i++) {
    const progress = start + (end - start) * i / 12;
    const id = tileId(world, origin.x + (destination.x - origin.x) * progress, origin.y + (destination.y - origin.y) * progress);
    if (id) ids.add(id);
  }
  const intensity = activeDangers(world, ids).filter((hazard) => hazard.kind !== 'cursed_miasma' || hazard.intensity >= 2)
    .reduce((maximum, hazard) => Math.max(maximum, hazard.intensity), 0);
  if (!intensity) return false;
  let value = world.terrain.seed ^ Math.imul(shipment.sequence, 0x9e3779b1) ^ Math.imul(world.tick, 0x7feb352d);
  value = Math.imul(value ^ (value >>> 16), 0x846ca68b);
  const roll = ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
  return roll < Math.min(.55, .14 + intensity * .10) * (directive?.riskMultiplier ?? 1);
}

function settleShipment(world: WorldState, shipment: MarketShipment): WorldEvent | undefined {
  if (shipment.status !== 'in_transit' || world.tick <= shipment.departedTick) return undefined;
  const origin = market(world, shipment.originId);
  const destination = market(world, shipment.destinationId);
  const buyer = owner(world, shipment.buyerId);
  const seller = owner(world, shipment.sellerId);
  // Dead cultivators retain their settlements on the actor ledger for future estate proceedings.
  if (!buyer || !seller) return undefined;
  const price = shipment.unitPrice * shipment.quantity;
  const route = origin && destination ? escortDirective(world, shipment) : undefined;
  const effectiveArrival = route?.managed ? (route.arrivedTick ?? world.tick) : shipment.arrivalTick + (route?.baselineDelay ?? 0);
  const isOnRoute = route?.managed ? route.crossedTileIds.length > 0 :
    world.tick > shipment.departedTick + (route?.baselineDelay ?? 0) && world.tick <= effectiveArrival;
  let status: Exclude<MarketShipment['status'], 'in_transit'>;
  let outcome: Extract<CausalChronicleOutcome, 'delivered' | 'route_loss' | 'escort_failed' | 'endpoint_missing' | 'market_closed'>;
  let reason: string;
  if (!origin || !destination) {
    status = 'returned';
    outcome = 'endpoint_missing';
    reason = `商路已撤销，退买方${price}灵石、卖方${shipment.quantity}份货`;
  } else if (route?.forceReturn) {
    status = 'returned';
    outcome = 'escort_failed';
    reason = `护送无法继续，按原货账退买方${price}灵石、卖方${shipment.quantity}份货`;
  } else if (route?.hold) return undefined;
  else if (isOnRoute && routeDanger(world, shipment, origin, destination, route)) {
    status = 'lost';
    outcome = 'route_loss';
    reason = `商队途经当回合灾区，遗失${shipment.quantity}份货并退买方${price}灵石`;
  } else if (route?.managed ? !route.arrived : world.tick < effectiveArrival) return undefined;
  else if (marketClosureReason(world, destination.id)) {
    if (world.tick < effectiveArrival + 3) return undefined;
    status = 'returned';
    outcome = 'market_closed';
    reason = `目的坊市持续关闭，退买方${price}灵石、卖方${shipment.quantity}份货`;
  } else {
    status = 'delivered';
    outcome = 'delivered';
    reason = `买方收货${shipment.quantity}份，卖方收到${price}灵石`;
  }
  if (status === 'delivered') {
    store(buyer, shipment.good, shipment.quantity);
    seller.spiritStones += price;
  } else {
    buyer.spiritStones += price;
    if (status === 'returned') store(seller, shipment.good, shipment.quantity);
  }
  shipment.status = status;
  shipment.reason = reason;
  shipment.settledTick = world.tick;
  record(world, shipment, status, shipment.id, reason);
  const participants = [buyer.id, seller.id];
  const from = flowShipment(shipment.id);
  if (status === 'delivered') {
    transfer(world, shipment.id, 'shipment_delivery', 'stone', price, participants, from, flowActor(seller.id));
    transfer(world, shipment.id, 'shipment_delivery', shipment.good, shipment.quantity, participants, from, flowActor(buyer.id));
  } else if (status === 'returned') {
    transfer(world, shipment.id, 'shipment_return', 'stone', price, participants, from, flowActor(buyer.id));
    transfer(world, shipment.id, 'shipment_return', shipment.good, shipment.quantity, participants, from, flowActor(seller.id));
  } else {
    transfer(world, shipment.id, 'shipment_refund', 'stone', price, participants, from, flowActor(buyer.id));
    recordResourceFlow(world, { kind: 'loss', mechanism: 'market', refId: shipment.id, reason: 'shipment_loss',
      good: shipment.good, amount: shipment.quantity, visibility: { kind: 'participants', actorIds: participants }, from });
  }
  const fact = event(world, shipment.id, status === 'delivered' ? '商队到货结算' : status === 'lost' ? '商队货损退款' : '商队退运退款',
    `${reason}。`, [buyer.id, seller.id], shipment.destinationId);
  const departureId = causalChronicleEventId(world, 'market_shipment', shipment.id);
  recordCausalChronicleNode(world, fact, { kind: 'market_settlement', entityId: shipment.id, outcome,
    predecessors: departureId ? [{ eventId: departureId, relation: 'settled_shipment' }] : [] });
  return fact;
}

export function advanceMarkets(world: WorldState): WorldEvent[] {
  const result: WorldEvent[] = [];
  for (const shipment of world.markets.shipments) {
    const settled = settleShipment(world, shipment);
    if (settled) {
      result.push(settled);
      const escrowSettlement = settleEscortWithShipment(world, shipment);
      if (escrowSettlement) result.push(escrowSettlement);
    }
  }
  for (const order of world.markets.orders) {
    if (order.status !== 'open') continue;
    const actor = owner(world, order.actorId);
    if (actor && (!live(actor) || world.tick >= order.expiresTick || !market(world, order.locationId))) {
      result.push(releaseOrder(world, actor, order, 'expired'));
    }
  }
  const venues = new Map(world.locations.filter((place) => place.type === 'market' && !marketClosureReason(world, place.id))
    .map((place) => [place.id, place]));
  let activeShipments = world.markets.shipments.filter(({ status }) => status === 'in_transit').length;
  for (const good of GOODS) {
    const book = world.markets.orders.filter((entry) => entry.good === good && venues.has(entry.locationId));
    const bids = marketOrdersInPriority(book, 'buy');
    const asks = marketOrdersInPriority(book, 'sell');
    for (const bid of bids) {
      const buyer = owner(world, bid.actorId);
      if (!buyer || !live(buyer)) continue;
      for (const ask of asks) {
        if (bid.remaining === 0 || ask.limitPrice > bid.limitPrice) break;
        if (ask.status !== 'open' || ask.actorId === bid.actorId) continue;
        const seller = owner(world, ask.actorId);
        if (!seller || !live(seller)) continue;
        const crossVenue = bid.locationId !== ask.locationId;
        if (crossVenue && activeShipments >= MAX_CONVOYS) continue;
        result.push(match(world, bid, ask, buyer, seller, venues.get(ask.locationId)!, venues.get(bid.locationId)!));
        if (crossVenue) activeShipments++;
      }
    }
  }
  const active = world.markets.shipments.filter(({ status }) => status === 'in_transit');
  const referenced = new Set(active.flatMap(({ buyOrderId, sellOrderId }) => [buyOrderId, sellOrderId]));
  const settledOrders = new Set(world.markets.orders.filter(({ status }) => status !== 'open').slice(-96));
  world.markets.orders = world.markets.orders.filter((order) => order.status === 'open' || referenced.has(order.id) || settledOrders.has(order));
  const settledShipments = new Set(world.markets.shipments.filter(({ status }) => status !== 'in_transit').slice(-64));
  world.markets.shipments = world.markets.shipments.filter((shipment) => shipment.status === 'in_transit' || settledShipments.has(shipment));
  world.markets.receipts = world.markets.receipts.slice(-96);
  return result;
}

import type { CausalChronicleNode, ChronicleAnchor, MarketOrder, MarketReceipt, ProtagonistArc, WorldEvent, WorldState } from '../types/world';
import { publicChronicleChapters } from '../engine/coldHistoryEngine';
import { canFocusChronicleSite } from '../engine/chronicleFocusEngine';
import { isChronicleStoryFact } from '../engine/chronicleLead';
import { writePublicChronicleScene } from '../engine/chroniclePublicProse';
import { MARKET_GOODS } from '../engine/marketEngine';
import { protagonistFactIndex, qualifiesProtagonistOpening } from '../engine/protagonistSuccession';
import { matchesWitnessedPersonalScene, witnessedPersonalSceneKind } from '../engine/witnessedPersonalStory';

export interface SharedTurningPointEvidence { eventId: string; tick: number; title: string; paragraph: string }
export interface SharedTurningPointPerson {
  actorId: string;
  arcId: string;
  name: string;
  role: 'buyer' | 'seller';
  settlement: string;
  earlier: SharedTurningPointEvidence;
  aftermath?: SharedTurningPointEvidence;
}
export interface SharedTurningPoint extends SharedTurningPointEvidence {
  siteName: string;
  reunion: boolean;
  people: readonly [SharedTurningPointPerson, SharedTurningPointPerson];
}

const LIMIT = 3;
type Fact = ChronicleAnchor | WorldEvent;
type Side = SharedTurningPointPerson['role'];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const label = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, ' ')
  .trim().slice(0, max);
const cut = (value: string, max: number) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(0, max);
const exactParticipants = (fact: Fact, ids: readonly string[]) =>
  fact.actorIds.length === ids.length && ids.every((id, i) => fact.actorIds[i] === id);
const matchFact = (left: Fact, right: Fact) => left.id === right.id && left.tick === right.tick &&
  left.year === right.year && left.month === right.month && left.locationId === right.locationId &&
  left.category === right.category && exactParticipants(left, right.actorIds) &&
  cut(left.title, 80) === cut(right.title, 80) && cut(left.description, 220) === cut(right.description, 220);

function indexUnique<T>(rows: readonly T[], key: (row: T) => string): Map<string, T | undefined> {
  const map = new Map<string, T | undefined>();
  for (const row of rows) {
    const id = key(row);
    map.set(id, map.has(id) ? undefined : row);
  }
  return map;
}
function evidence(fact: Fact): SharedTurningPointEvidence | undefined {
  const scene = writePublicChronicleScene(fact);
  const title = label(scene.title, 64), paragraph = label(scene.paragraph, 180);
  return title && paragraph ? { eventId: fact.id, tick: fact.tick, title, paragraph } : undefined;
}

function exactReceiptFlow(world: WorldState, receipt: MarketReceipt, buy: MarketOrder, sell: MarketOrder): boolean {
  const books = world.resourceFlow.months.filter((row) => row.tick === receipt.tick);
  if (books.length > 1) return false;
  const book = books[0];
  if (!book) return true; // Old statements may be outside the bounded detail journal.
  const rows = book.entries.filter((row) => row.refId === receipt.id && row.reason === 'local_fill');
  const kinds = new Set<string>();
  for (const row of rows) {
    if (row.kind !== 'transfer' || row.mechanism !== 'market' || row.tick !== receipt.tick ||
        row.from.kind !== 'order' || row.to.kind !== 'actor' || row.visibility.kind !== 'participants' ||
        row.visibility.actorIds.length !== 2 || row.visibility.actorIds[0] !== receipt.buyerId ||
        row.visibility.actorIds[1] !== receipt.sellerId || kinds.has(row.good)) return false;
    kinds.add(row.good);
    if (row.good === 'stone') {
      if (row.from.id !== buy.id || row.to.id !== receipt.sellerId || row.amount !== receipt.quantity * receipt.unitPrice) return false;
    } else if (row.good !== receipt.good || row.from.id !== sell.id || row.to.id !== receipt.buyerId ||
        row.amount !== receipt.quantity) return false;
  }
  return book.entries.length < book.totalEntries || kinds.size === 2;
}

interface Meeting {
  receipt: MarketReceipt;
  fact: Fact;
  siteName: string;
  pair: string;
  arcs: readonly [ProtagonistArc, ProtagonistArc];
  earlier: readonly [SharedTurningPointEvidence, SharedTurningPointEvidence];
}

/**
 * Read only one current branch. Two submitted, auditable local orders (not a shared date or a conversation)
 * prove a crossing. Individual later scenes are labeled separately, not inferred as consequences of this trade.
 */
export function projectSharedTurningPoints(
  world: WorldState, chapterId: string, viewerId?: string | null, throughTick = world.tick,
): SharedTurningPoint[] {
  if (!viewerId || !Number.isSafeInteger(throughTick) || throughTick < 1 || throughTick > world.tick) return [];
  const people = indexUnique(world.cultivators, (row) => row.id);
  const viewer = people.get(viewerId);
  if (!viewer?.alive || viewer.hp <= 0) return [];
  const allChapters = indexUnique([...world.chronicleArchive.chapters, ...world.coldHistory.chapters], (row) => row.id);
  if (!allChapters.get(chapterId)) return [];
  const chapter = publicChronicleChapters(world).find((row) => row.id === chapterId && row.endTick <= throughTick);
  if (!chapter) return [];
  const cutoff = chapter.endTick;
  const chapterFacts = indexUnique(chapter.anchors, (row) => row.id);
  const belongsToChapter = (fact: Fact) => {
    const anchor = chapterFacts.get(fact.id);
    return !!anchor && anchor.tick >= chapter.startTick && matchFact(anchor, fact);
  };
  const source = protagonistFactIndex(world, cutoff);
  const liveSources = indexUnique(world.events, (row) => row.id);
  const publicFacts = new Map([...source.byId].filter(([id]) => !liveSources.has(id) || liveSources.get(id)));
  const orders = indexUnique(world.markets.orders, (row) => row.id);
  const receipts = indexUnique(world.markets.receipts, (row) => row.id);
  const causes = indexUnique(world.chronicleCausality.nodes, (row) => row.eventId);
  const arcIds = indexUnique(world.protagonistSuccession.arcs, (row) => row.id);
  const sites = indexUnique(world.locations, (row) => row.id);
  const ownScenes = indexUnique(world.witnessedPersonalStory.scenes, (row) => row.eventId);
  const visible = new Map<string, boolean>();
  const canReadPlace = (id: string) => {
    if (!visible.has(id)) visible.set(id, sites.has(id) && canFocusChronicleSite(world, id, viewerId));
    return visible.get(id) === true;
  };

  function witnessedOrder(node: CausalChronicleNode, receipt: MarketReceipt, actorId: string, side: 'buy' | 'sell'): MarketOrder | undefined {
    const relation = side === 'buy' ? 'matched_buy_order' : 'matched_sell_order';
    const edges = node.predecessors.filter((edge) => edge.relation === relation);
    if (edges.length !== 1) return undefined;
    const prior = causes.get(edges[0].eventId), fact = publicFacts.get(edges[0].eventId);
    const order = prior && orders.get(prior.entityId);
    const receiptSite = receipt.originId;
    if (!prior || !fact || !order || prior.kind !== (side === 'buy' ? 'market_buy_order' : 'market_sell_order') ||
        prior.sequence >= node.sequence || prior.locationId !== receiptSite || prior.tick !== order.placedTick ||
        prior.eventId !== `evt-${order.placedTick}-market-${order.id}` || fact.tick !== order.placedTick ||
        fact.locationId !== receiptSite || fact.category !== 'diplomacy' || !exactParticipants(fact, [actorId]) ||
        order.actorId !== actorId || order.locationId !== receiptSite || order.side !== side || order.good !== receipt.good ||
        order.placedTick > receipt.tick || order.expiresTick <= receipt.tick || order.quantity < receipt.quantity ||
        order.sequence >= receipt.sequence || order.id !== `order-${order.sequence}`) return undefined;
    return order;
  }

  function independentArcs(actorId: string, otherId: string, meeting: number) {
    return world.protagonistSuccession.arcs.flatMap((arc) => {
      if (arc.actorId !== actorId || arcIds.get(arc.id) !== arc || arc.openedTick >= meeting ||
          arc.endedTick !== undefined && arc.endedTick < meeting && arc.closeReason !== 'receded' ||
          !qualifiesProtagonistOpening(arc.opening) ||
          arc.opening.some((row) => row.tick > arc.openedTick || source.disputed.has(row.eventId) ||
            publicFacts.has(row.eventId) && !publicFacts.get(row.eventId)?.actorIds.includes(actorId))) return [];
      const named = [...arc.opening, ...arc.support].filter((row) => row.tick < meeting).sort((a, b) =>
        b.tick - a.tick || compare(a.eventId, b.eventId)).flatMap((row) => {
          const fact = publicFacts.get(row.eventId);
          if (!fact || fact.tick !== row.tick || fact.category !== row.category || !fact.actorIds.includes(actorId) ||
              fact.actorIds.includes(otherId)) return [];
          const own = evidence(fact);
          if (!own) return [];
          return [belongsToChapter(fact) || fact.locationId && canReadPlace(fact.locationId)
            ? own : { ...own, title: '另有独立旧事', paragraph: '有本人的公开原据；此处不展开不在本次见闻范围的原文。' }];
        })[0];
      return named ? [{ arc, named }] : [];
    }).sort((a, b) => b.arc.openedTick - a.arc.openedTick || compare(a.arc.id, b.arc.id));
  }

  const meetings: Meeting[] = [];
  for (const [eventId, node] of causes) {
    if (!node || node.kind !== 'market_settlement' || node.outcome !== 'local_fill' || node.predecessors.length !== 2 ||
        node.tick > cutoff || !node.locationId) continue;
    const fact = publicFacts.get(eventId), receipt = receipts.get(node.entityId), site = sites.get(node.locationId);
    if (!fact || !receipt || !site || site.type !== 'market' || receipt.status !== 'local_fill' || receipt.shipmentId ||
        receipt.id !== `receipt-${receipt.sequence}` || node.tick !== receipt.tick || fact.tick !== receipt.tick ||
        eventId !== `evt-${receipt.tick}-market-fill-${receipt.sequence}` || fact.category !== 'diplomacy' ||
        fact.locationId !== site.id || receipt.originId !== site.id || receipt.destinationId !== site.id ||
        receipt.buyerId === receipt.sellerId || !people.get(receipt.buyerId) || !people.get(receipt.sellerId) ||
        (viewerId !== receipt.buyerId && viewerId !== receipt.sellerId && !canReadPlace(site.id)) ||
        !exactParticipants(fact, [receipt.buyerId, receipt.sellerId]) || !Object.hasOwn(MARKET_GOODS, receipt.good) ||
        !Number.isSafeInteger(receipt.quantity) || receipt.quantity < 1 || !Number.isSafeInteger(receipt.unitPrice) || receipt.unitPrice < 1 ||
        !Number.isSafeInteger(receipt.quantity * receipt.unitPrice)) continue;
    const description = `${receipt.quantity}份${MARKET_GOODS[receipt.good].label}成交，每份${receipt.unitPrice}灵石，货款当场交割。`;
    if (fact.title !== '坊市当场结算' || fact.description !== description) continue;
    const buy = witnessedOrder(node, receipt, receipt.buyerId, 'buy'), sell = witnessedOrder(node, receipt, receipt.sellerId, 'sell');
    if (!buy || !sell || buy.id === sell.id || buy.sequence === sell.sequence || buy.limitPrice < sell.limitPrice ||
        receipt.unitPrice !== (buy.sequence < sell.sequence ? buy.limitPrice : sell.limitPrice) ||
        !exactReceiptFlow(world, receipt, buy, sell)) continue;
    outer: for (const first of independentArcs(receipt.buyerId, receipt.sellerId, receipt.tick)) {
      const origins = new Set(first.arc.opening.map(({ eventId }) => eventId));
      for (const second of independentArcs(receipt.sellerId, receipt.buyerId, receipt.tick)) {
        const [older, newer] = first.arc.openedTick < second.arc.openedTick ? [first.arc, second.arc] : [second.arc, first.arc];
        if (first.arc.id === second.arc.id || first.named.eventId === second.named.eventId ||
            older.openedTick >= newer.openedTick || older.endedTick === undefined || older.endedTick > newer.openedTick ||
            second.arc.opening.some(({ eventId }) => origins.has(eventId))) continue;
        const siteName = label(site.name, 45);
        if (!siteName) break outer;
        meetings.push({ receipt, fact, siteName, pair: JSON.stringify([receipt.buyerId, receipt.sellerId].sort(compare)),
          arcs: [first.arc, second.arc], earlier: [first.named, second.named] });
        break outer;
      }
    }
  }

  const sorted = meetings.slice().sort((a, b) => a.fact.tick - b.fact.tick || a.receipt.sequence - b.receipt.sequence);
  function later(actorId: string, otherId: string, afterTick: number, nextMeeting: number): SharedTurningPointEvidence | undefined {
    const choices = [...liveSources.values()].filter((row): row is WorldEvent => !!row && row.tick > afterTick &&
      row.tick <= cutoff && row.tick < nextMeeting && row.actorIds[0] === actorId && !row.actorIds.includes(otherId) &&
      publicFacts.has(row.id) && isChronicleStoryFact(row, cutoff)).sort((a, b) => a.tick - b.tick || compare(a.id, b.id));
    for (const fact of choices) {
      const own = ownScenes.get(fact.id);
      if (!own || !own.witnessIds.includes(actorId) || !witnessedPersonalSceneKind(fact) ||
          !matchesWitnessedPersonalScene(own, fact) || !(belongsToChapter(fact) || canReadPlace(own.siteId))) continue;
      const result = evidence(fact);
      if (result) return result;
    }
    return undefined;
  }

  return sorted.slice().reverse().flatMap((meeting): SharedTurningPoint[] => {
    const { fact, receipt, siteName, pair } = meeting;
    if (!belongsToChapter(fact)) return [];
    const names = meeting.arcs.map((arc) => label(people.get(arc.actorId)?.name ?? '', 40));
    if (names.some((name) => !name)) return [];
    const good = MARKET_GOODS[receipt.good].label, quantity = receipt.quantity, paid = quantity * receipt.unitPrice;
    const nextMeeting = sorted.find((row) => row.pair === pair && row.fact.tick > fact.tick)?.fact.tick ?? Infinity;
    const member = (index: 0 | 1, role: Side, other: string, settlement: string): SharedTurningPointPerson => {
      const { actorId, id: arcId } = meeting.arcs[index];
      const aftermath = later(actorId, other, fact.tick, nextMeeting);
      return { actorId, arcId, name: names[index], role, settlement, earlier: meeting.earlier[index], ...(aftermath ? { aftermath } : {}) };
    };
    return [{
      eventId: fact.id, tick: fact.tick, siteName, title: '坊口交割，两条路在此相逢',
      paragraph: `在${siteName}，两张原单合在一处；${quantity} 份${good}与 ${paid} 灵石当场交割。`,
      reunion: sorted.some((row) => row.pair === pair && row.fact.tick < fact.tick),
      people: [
        member(0, 'buyer', receipt.sellerId, `从本单实付 ${paid} 灵石，收到 ${quantity} 份${good}。`),
        member(1, 'seller', receipt.buyerId, `从本单交出 ${quantity} 份${good}，实收 ${paid} 灵石。`),
      ],
    }];
  }).slice(0, LIMIT);
}

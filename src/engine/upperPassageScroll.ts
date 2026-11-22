import type { Cultivator, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { northGateRenewalApertureAuthorized } from './northGateRenewalTerms';
import { projectUpperPassage, usableUpperPassageOpening } from './upperPassageEngine';
import { UPPER_PASSAGE_FEE, UPPER_PASSAGE_PATH, upperPassageId, upperPassageIndex, upperPassagePlane,
  upperPassageThroat, type UpperPassageJourney, type UpperPassageNodeId } from './upperPassageTerms';
import { completedNorthWaterWell, northWaterAddress } from './waterVeinEngine';
import { WATER_VEIN_ID, WATER_VEIN_SITE, waterVeinApertureActive } from './waterVeinTerms';

export interface UpperPassageScrollView {
  kind: 'eligible' | 'threshold' | 'arrived' | 'turning' | 'returned' | 'walking';
  nodeId: UpperPassageNodeId;
  tick: number;
  sourceId?: string;
}

function unique<T>(rows: readonly T[], matches: (row: T) => boolean): T | undefined {
  let only: T | undefined;
  for (const row of rows) {
    if (!matches(row)) continue;
    if (only) return undefined;
    only = row;
  }
  return only;
}

const validTick = (world: WorldState, tick: number) => Number.isSafeInteger(tick) && tick >= 1 && tick <= world.tick;

function exactAdmission(world: WorldState, journey: UpperPassageJourney): boolean {
  const veined = world.coldWaterVein;
  const address = northWaterAddress(world);
  if (!veined || !address || !unique(world.locations, row => row.id === WATER_VEIN_SITE) ||
      unique(world.settlements.villages, row => row.locationId === WATER_VEIN_SITE) !== address.village ||
      veined.veinId !== WATER_VEIN_ID || veined.siteId !== WATER_VEIN_SITE || veined.settlementId !== address.village.id ||
      !unique(world.villageWorks.projects, row => row.id === journey.wellProjectId) ||
      completedNorthWaterWell(world, address.village.id, journey.enteredTick)?.id !== journey.wellProjectId) return false;
  const months = world.resourceFlow.months.filter(row => row.tick === journey.enteredTick);
  if (months.length > 1) return false;
  const month = months[0];
  const fee = month?.entries.filter(row => row.refId === journey.id && row.reason === 'realm_passage_paid') ?? [];
  if (!fee.length) return journey.enteredTick !== world.tick && (!month || month.totalEntries > month.entries.length);
  const [payment] = fee;
  return fee.length === 1 && payment.kind === 'consumption' && payment.mechanism === 'upper_passage' &&
    payment.tick === journey.enteredTick && payment.from.kind === 'actor' && payment.from.id === journey.actorId &&
    payment.good === 'stone' && payment.amount === UPPER_PASSAGE_FEE && payment.visibility.kind === 'participants' &&
    payment.visibility.actorIds.length === 1 && payment.visibility.actorIds[0] === journey.actorId;
}

function reachedStage(world: WorldState, actor: Cultivator, journey: UpperPassageJourney): UpperPassageScrollView | undefined {
  const { steps, enteredTick } = journey;
  const first = steps[0], latest = steps.at(-1);
  if (!first || !latest || steps.length > 2 * (UPPER_PASSAGE_PATH.length - 1) ||
      !validTick(world, enteredTick) || journey.id !== upperPassageId(enteredTick, actor.id) ||
      journey.deceasedTick !== undefined || journey.paidStones !== UPPER_PASSAGE_FEE ||
      first.nodeId !== UPPER_PASSAGE_PATH[1] || first.tick !== enteredTick ||
      first.direction !== 'outbound' || first.crossingOpeningId !== undefined ||
      latest.direction !== journey.direction || latest.nodeId !== actor.locationId ||
      upperPassagePlane(latest.nodeId) !== actor.positionPlane || !exactAdmission(world, journey)) return undefined;
  const aperture = (id: string, tick: number) => {
    const gate = unique(world.coldWaterVein?.openings ?? [], row => row.id === id);
    return !!gate && gate.wellProjectId === journey.wellProjectId && waterVeinApertureActive(gate, tick) &&
      northGateRenewalApertureAuthorized(world, gate);
  };
  if (!aperture(journey.openingId, enteredTick)) return undefined;
  let move: 'enter' | 'advance' | 'turnback' = 'enter';
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1], to = steps[i];
    const origin = upperPassageIndex(from.nodeId), destination = upperPassageIndex(to.nodeId);
    if (!validTick(world, to.tick) || to.tick <= from.tick || origin < 1 || destination < 0 ||
        to.direction !== 'outbound' && to.direction !== 'inbound' ||
        from.direction === 'inbound' && to.direction !== 'inbound' ||
        destination !== origin + (to.direction === 'outbound' ? 1 : -1) ||
        upperPassageThroat(origin, destination) !== (to.crossingOpeningId !== undefined) ||
        to.crossingOpeningId !== undefined && !aperture(to.crossingOpeningId, to.tick)) return undefined;
    move = from.direction === to.direction ? 'advance' : 'turnback';
  }
  const returned = latest.nodeId === WATER_VEIN_SITE;
  if (returned !== (journey.returnedTick !== undefined) || returned &&
      (journey.returnedTick !== latest.tick || latest.tick !== world.tick ||
       !doctrineFoundingPhysicallyAt(world, actor, WATER_VEIN_SITE, world.tick))) return undefined;
  const sourceId = `evt-${journey.id}-${move}-${latest.tick}`;
  const receipt = unique(world.events, row => row.id === sourceId);
  const title = returned ? '原身踏回寒玉井' : move === 'enter' ? '天门门槛验身' :
    move === 'turnback' ? '沿原阶折返' : '天门行过一阶';
  if (!receipt || receipt.category !== 'diplomacy' || receipt.title !== title || receipt.tick !== latest.tick ||
      receipt.locationId !== latest.nodeId || receipt.actorIds.length !== 1 || receipt.actorIds[0] !== actor.id ||
      receipt.witnessScope !== 'participants' || !Number.isSafeInteger(receipt.year) ||
      !Number.isSafeInteger(receipt.month) || receipt.month < 1 || receipt.month > 12 ||
      world.year * 12 + world.month - (receipt.year * 12 + receipt.month) !== world.tick - latest.tick) return undefined;
  const kind = returned ? 'returned' : move === 'turnback' ? 'turning' :
    latest.direction === 'outbound' && latest.nodeId === UPPER_PASSAGE_PATH[3] ? 'arrived' :
    upperPassagePlane(latest.nodeId) === 'threshold' && latest.direction === 'outbound' ? 'threshold' : 'walking';
  return { kind, nodeId: latest.nodeId, tick: latest.tick, sourceId };
}

/** A view of the original traveler's native receipt, never an actor switch, mutation, or new route. */
export function projectUpperPassageScroll(world: WorldState, actor?: Cultivator, viewerId = actor?.id): UpperPassageScrollView | undefined {
  if (!actor?.alive || actor.hp <= 0 || actor.id !== viewerId ||
      unique(world.cultivators, row => row.id === actor.id) !== actor) return undefined;
  const all = world.upperPassage?.journeys ?? [];
  const own = all.filter(row => row.actorId === actor.id);
  const current = own.filter(row => row.returnedTick === undefined && row.deceasedTick === undefined || row.returnedTick === world.tick);
  if (current.length > 1) return undefined;
  const journey = current[0];
  if (journey) {
    if (own.some(row => row !== journey && (row.enteredTick >= journey.enteredTick || row.returnedTick === undefined ||
        row.returnedTick >= journey.enteredTick)) || unique(all, row => row.id === journey.id) !== journey) return undefined;
    return reachedStage(world, actor, journey);
  }
  const quote = projectUpperPassage(world, actor);
  const gate = quote?.options.length ? usableUpperPassageOpening(world, world.tick + 1) : undefined;
  if (!gate || !unique(world.locations, row => row.id === WATER_VEIN_SITE) ||
      !unique(world.settlements.villages, row => row.locationId === WATER_VEIN_SITE) ||
      !unique(world.villageWorks.projects, row => row.id === gate.wellProjectId) ||
      unique(world.coldWaterVein?.openings ?? [], row => row.id === gate.id) !== gate) return undefined;
  return quote?.nodeId === WATER_VEIN_SITE && quote.options.some(row =>
    row.upperPassageMove === 'enter' && row.targetUpperPassageNodeId === UPPER_PASSAGE_PATH[1]) ?
    { kind: 'eligible', nodeId: WATER_VEIN_SITE, tick: world.tick } : undefined;
}

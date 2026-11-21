import type {
  CultivationRealm, Cultivator, LLMDecisionPayload, LocationNode, WorkshopCloseReason, WorkshopMove, WorkshopOrder,
  WorkshopOutputGrade, WorkshopQualityFloor, WorkshopState, WorkshopTier, WorkshopWorkReceipt, WorldEvent, WorldState,
} from '../types/world';
import { ARTIFACT_RULES } from './artifactEngine';
import { canUseFurnace, claimFurnaceUse } from './furnaceReservationEngine';
import { activeEscortForActor } from './escortEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { activeRelocationForActor } from './relocationEngine';
import { flowActor, flowWorkshop, recordResourceFlow } from './resourceFlowEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { isTribulationActive } from './tribulationEngine';

export const WORKSHOP_OFFER_TICKS = 3;
export const WORKSHOP_ACTIVE_TICKS = 7;
export const WORKSHOP_TERMINAL_LIMIT = 24;
export const WORKSHOP_MAX_WORK_RECEIPTS = 4;
export const WORKSHOP_HERB = 'earth_root';
export const WORKSHOP_CAPACITY = 12;
export const WORKSHOP_ACTIVE_OFFERS_PER_SITE = 2;
const MAKERS_PER_OFFER = 2;
const TIERS: WorkshopTier[] = ['法器', '灵器'];
const FLOORS: WorkshopQualityFloor[] = ['standard', 'fine'];
const REALMS: CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];

export interface WorkshopOption {
  action: 'WORKSHOP';
  workshopMove: WorkshopMove;
  targetWorkshopId?: string;
  targetCultivatorId?: string;
  workshopTier?: WorkshopTier;
  workshopQuantity?: 1 | 2;
  workshopQualityFloor?: WorkshopQualityFloor;
}

export const createWorkshopState = (): WorkshopState => ({ orders: [], nextId: 1 });

export function workshopTerms(tier: WorkshopTier, quantity: 1 | 2 = 1) {
  const base = ARTIFACT_RULES[tier].stones;
  const fuelPerPiece = Math.ceil(base * 0.6);
  const feePerPiece = base - fuelPerPiece;
  const blankFuel = Math.ceil(fuelPerPiece / 2);
  const finishFuel = fuelPerPiece - blankFuel;
  return { fuelPerPiece, feePerPiece, blankFuel, finishFuel, totalStones: quantity * base, totalHerbs: quantity * 2 };
}

const alive = (actor?: Cultivator): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const participant = (actor: Cultivator, order: WorkshopOrder) => actor.id === order.patronId || actor.id === order.makerId;
const person = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const at = (world: WorldState, id: string) => world.locations.find(site => site.id === id);
const active = (world: WorldState, order: WorkshopOrder) => order.status === 'active' &&
  (order.acceptedTick ?? Infinity) <= world.tick && world.tick < (order.deadlineTick ?? 0);
const offered = (world: WorldState, order: WorkshopOrder) => order.status === 'offered' &&
  order.offeredTick <= world.tick && world.tick < order.offerExpiresTick;
const qualityNames: Record<WorkshopOutputGrade, string> = { failed: '报废', standard: '标准', fine: '精品' };

function availableAt(world: WorldState, actor: Cultivator | undefined, site: LocationNode | undefined): actor is Cultivator {
  return alive(actor) && site !== undefined && actor.locationId === site.id &&
    !pilgrimageCheckpoint(world, actor) && !courierCheckpoint(world, actor) &&
    !activeRelocationForActor(world, actor) && !activeEscortForActor(world, actor) && !isTribulationActive(actor);
}

function makerEligible(world: WorldState, actor: Cultivator | undefined, site: LocationNode | undefined, tier: WorkshopTier) {
  const rule = ARTIFACT_RULES[tier];
  return availableAt(world, actor, site) && site!.furnaceGrade >= rule.grade &&
    actor.techniqueMastery >= rule.mastery && REALMS.indexOf(actor.realm) >= REALMS.indexOf(rule.realm);
}

function hasFunds(patron: Cultivator, tier: WorkshopTier, quantity: 1 | 2) {
  const terms = workshopTerms(tier, quantity);
  return patron.spiritStones >= terms.totalStones && patron.herbs[WORKSHOP_HERB] >= terms.totalHerbs &&
    patron.artifacts.length + quantity <= WORKSHOP_CAPACITY;
}

function hasCanonicalArtifact(world: WorldState, id: string) {
  return world.cultivators.some(actor => actor.artifacts.some(item => item.id === id)) ||
    world.estates.entries.some(estate => estate.holdings.artifacts.some(item => item.id === id));
}

const artifactIdFor = (order: WorkshopOrder, piece: number) => `workshop-artifact-${order.id}-${piece}`;
const choice = (workshopMove: WorkshopMove, targetWorkshopId: string): WorkshopOption =>
  ({ action: 'WORKSHOP', workshopMove, targetWorkshopId });

export function availableWorkshopActions(actor: Cultivator, world: WorldState, includeOffers = true, executionTick = world.tick): WorkshopOption[] {
  if (!alive(actor) || person(world, actor.id) !== actor) return [];
  const { orders } = world.workshops;
  const result: WorkshopOption[] = [];
  const makerWorked = orders.some(order => order.makerId === actor.id && order.work.at(-1)?.tick === executionTick);
  for (const order of orders) {
    if (!participant(actor, order)) continue;
    const site = at(world, order.siteId);
    const patron = person(world, order.patronId);
    if (offered(world, order)) {
      if (actor.id === order.patronId) result.push(choice('cancel', order.id));
      else {
        result.push(choice('decline', order.id));
        if (availableAt(world, patron, site) && hasFunds(patron, order.tier, order.quantity) &&
            makerEligible(world, actor, site, order.tier) &&
            !orders.some(other => active(world, other) && (other.siteId === order.siteId || other.makerId === actor.id))) {
          result.push(choice('accept', order.id));
        }
      }
    }
    if (active(world, order)) {
      result.push(choice('cancel', order.id));
      if (actor.id !== order.makerId || makerWorked || executionTick <= (order.acceptedTick ?? Infinity) ||
          executionTick >= (order.deadlineTick ?? -Infinity) ||
          !makerEligible(world, actor, site, order.tier) || !availableAt(world, patron, site) || order.work.length >= order.quantity * 2) continue;
      const finish = order.work.length % 2 === 1;
      const terms = workshopTerms(order.tier, order.quantity);
      if (order.escrowHerbs < 1 || order.escrowStones < (finish ? terms.finishFuel + terms.feePerPiece : terms.blankFuel)) continue;
      if (finish && (patron.artifacts.length >= WORKSHOP_CAPACITY ||
          hasCanonicalArtifact(world, artifactIdFor(order, Math.floor(order.work.length / 2) + 1)))) continue;
      if (canUseFurnace(world, actor, order.siteId, 'workshop', order.id, executionTick)) result.push(choice('work', order.id));
    }
  }
  if (!includeOffers) return result;
  const site = at(world, actor.locationId);
  if (!availableAt(world, actor, site) || !site?.furnaceGrade ||
      orders.some(order => order.patronId === actor.id && (offered(world, order) || active(world, order))) ||
      orders.some(order => order.siteId === site.id && active(world, order)) ||
      orders.filter(order => order.siteId === site.id && offered(world, order)).length >= WORKSHOP_ACTIVE_OFFERS_PER_SITE) return result;
  for (const tier of TIERS) {
    if (!hasFunds(actor, tier, 1)) continue;
    const makers = world.cultivators.filter(candidate => candidate.id !== actor.id && makerEligible(world, candidate, site, tier) &&
      !orders.some(order => active(world, order) && order.makerId === candidate.id))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, MAKERS_PER_OFFER);
    for (const maker of makers) for (const quantity of [1, 2] as const) {
      if (!hasFunds(actor, tier, quantity)) continue;
      for (const qualityFloor of FLOORS) result.push({ action: 'WORKSHOP', workshopMove: 'offer', targetCultivatorId: maker.id,
        workshopTier: tier, workshopQuantity: quantity, workshopQualityFloor: qualityFloor });
    }
  }
  return result;
}

function event(world: WorldState, order: WorkshopOrder, phase: string, title: string, description: string): WorldEvent {
  return {
    id: `evt-workshop-${order.id}-${world.tick}-${phase}`,
    tick: world.tick, year: world.year, month: world.month, category: 'diplomacy', title, description,
    actorIds: [order.patronId, order.makerId], locationId: order.siteId, witnessScope: 'participants',
  };
}

const visibility = (order: WorkshopOrder) => ({ kind: 'participants' as const, actorIds: [order.patronId, order.makerId] });

function refund(world: WorldState, order: WorkshopOrder, patron: Cultivator) {
  const { escrowStones, escrowHerbs } = order;
  patron.spiritStones += escrowStones;
  patron.herbs[WORKSHOP_HERB] += escrowHerbs;
  const fields = { kind: 'transfer' as const, from: flowWorkshop(order.id), to: flowActor(order.patronId),
    visibility: visibility(order), refId: order.id, reason: 'workshop_refund', mechanism: 'workshop' as const };
  recordResourceFlow(world, { ...fields, good: 'stone', amount: escrowStones });
  recordResourceFlow(world, { ...fields, good: WORKSHOP_HERB, amount: escrowHerbs });
  order.refundedStones += escrowStones;
  order.refundedHerbs += escrowHerbs;
  order.escrowStones = 0;
  order.escrowHerbs = 0;
}

function settle(world: WorldState, order: WorkshopOrder, status: Exclude<WorkshopOrder['status'], 'active' | 'offered'>,
  reason?: WorkshopCloseReason): boolean {
  if (order.settledTick !== undefined) return false;
  if (order.escrowStones > 0 || order.escrowHerbs > 0) {
    const patron = person(world, order.patronId);
    if (!patron) return false; // Invalid orphan state must not destroy inventory.
    refund(world, order, patron);
  }
  order.status = status;
  order.settledTick = world.tick;
  if (reason) order.closeReason = reason;
  return true;
}

const clamp = (value: number, upper: number) => Number.isFinite(value) ? Math.max(0, Math.min(upper, value)) : 0;

export function workshopGradeForScore(score: number): WorkshopOutputGrade {
  return score >= 70 ? 'fine' : score >= 40 ? 'standard' : 'failed';
}

function gradeWork(maker: Cultivator, site: LocationNode, order: WorkshopOrder, rng: () => number) {
  const qualityScore = clamp(42 + Math.floor(clamp(maker.techniqueMastery, 100) / 4) +
    10 * (site.furnaceGrade - ARTIFACT_RULES[order.tier].grade) +
    (maker.spiritRoot === site.spiritRoot ? 8 : 0) + Math.min(15, Math.floor(clamp(rng(), 1) * 16)) -
    (maker.hp < maker.maxHp / 2 ? 10 : 0), 100);
  const quality = workshopGradeForScore(qualityScore);
  return { qualityScore, quality };
}

function work(world: WorldState, order: WorkshopOrder, maker: Cultivator, rng: () => number): WorldEvent {
  const site = at(world, order.siteId)!;
  const patron = person(world, order.patronId)!;
  const terms = workshopTerms(order.tier, order.quantity);
  const piece = (order.work.length < 2 ? 1 : 2) as 1 | 2;
  const stage = order.work.length % 2 === 0 ? 'blank' : 'finish';
  const stonesUsed = stage === 'blank' ? terms.blankFuel : terms.finishFuel;
  order.escrowStones -= stonesUsed;
  order.escrowHerbs -= 1;
  const fields = { kind: 'consumption' as const, from: flowWorkshop(order.id), mechanism: 'workshop' as const,
    refId: order.id, visibility: visibility(order) };
  recordResourceFlow(world, { ...fields, good: 'stone', amount: stonesUsed, reason: 'workshop_fuel' });
  recordResourceFlow(world, { ...fields, good: WORKSHOP_HERB, amount: 1, reason: 'workshop_material' });
  const row: WorkshopWorkReceipt = { tick: world.tick, makerId: maker.id, piece, stage, stonesUsed, herbsUsed: 1 };
  order.work.push(row);
  if (stage === 'blank') return event(world, order, `blank-${piece}`, '工坊铸坯', `第${piece}件投入${stonesUsed}灵石和1份玄土根，尚未交付。`);
  const { quality, qualityScore } = gradeWork(maker, site, order, rng);
  Object.assign(row, { quality, qualityScore });
  if (quality === 'fine' || quality === 'standard' && order.qualityFloor === 'standard') {
    const artifactId = artifactIdFor(order, piece);
    const baseDurability = ARTIFACT_RULES[order.tier].durability;
    const durability = quality === 'fine' ? Math.ceil(baseDurability * 1.2) : baseDurability;
    patron.artifacts.push({ id: artifactId, tier: order.tier, name: `${maker.spiritRoot}纹·工坊${order.tier}`, spiritRoot: maker.spiritRoot,
      durability, maxDurability: durability, resonance: 0 });
    order.escrowStones -= terms.feePerPiece;
    maker.spiritStones += terms.feePerPiece;
    Object.assign(row, { artifactId, feePaid: terms.feePerPiece });
    recordResourceFlow(world, { kind: 'transfer', good: 'stone', amount: terms.feePerPiece, from: flowWorkshop(order.id), to: flowActor(maker.id),
      mechanism: 'workshop', refId: order.id, reason: 'workshop_wage', visibility: visibility(order) });
  }
  if (piece === order.quantity) settle(world, order, 'completed');
  const outcome = row.artifactId ? `已实际交付，支付${row.feePaid}灵石工钱` : '未达契约门槛，无成品也无工钱';
  const suffix = order.status === 'completed' ? `；结案实退${order.refundedStones}灵石、${order.refundedHerbs}份余料` : '';
  return event(world, order, `finish-${piece}`, row.artifactId ? '工坊验收交割' : '工坊验收未过',
    `第${piece}件实测${qualityScore}分（${qualityNames[quality]}），${outcome}${suffix}。`);
}

export function resolveWorkshopAction(world: WorldState, actor: Cultivator, payload: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  if (payload.chosenAction !== 'WORKSHOP') return null;
  const valid = availableWorkshopActions(actor, world, payload.workshopMove === 'offer').find(option =>
    option.workshopMove === payload.workshopMove && option.targetWorkshopId === payload.targetWorkshopId &&
    option.targetCultivatorId === payload.targetCultivatorId && option.workshopTier === payload.workshopTier &&
    option.workshopQuantity === payload.workshopQuantity && option.workshopQualityFloor === payload.workshopQualityFloor);
  if (!valid) return null;
  if (valid.workshopMove === 'offer') {
    const order: WorkshopOrder = {
      id: `commission-${world.workshops.nextId++}`, patronId: actor.id, makerId: valid.targetCultivatorId!, siteId: actor.locationId,
      tier: valid.workshopTier!, quantity: valid.workshopQuantity!, qualityFloor: valid.workshopQualityFloor!,
      status: 'offered', offeredTick: world.tick, offerExpiresTick: world.tick + WORKSHOP_OFFER_TICKS,
      escrowStones: 0, escrowHerbs: 0, refundedStones: 0, refundedHerbs: 0, work: [],
    };
    world.workshops.orders.push(order);
    return event(world, order, 'offer', '提出工坊委制', `拟制${order.quantity}件${order.tier}，约定${qualityNames[order.qualityFloor]}起收；尚未支出。`);
  }
  const order = world.workshops.orders.find(({ id }) => id === valid.targetWorkshopId)!;
  if (valid.workshopMove === 'accept') {
    const patron = person(world, order.patronId)!;
    const terms = workshopTerms(order.tier, order.quantity);
    patron.spiritStones -= terms.totalStones;
    patron.herbs[WORKSHOP_HERB] -= terms.totalHerbs;
    order.escrowStones = terms.totalStones;
    order.escrowHerbs = terms.totalHerbs;
    const fields = { kind: 'transfer' as const, from: flowActor(patron.id), to: flowWorkshop(order.id),
      mechanism: 'workshop' as const, refId: order.id, reason: 'workshop_deposit', visibility: visibility(order) };
    recordResourceFlow(world, { ...fields, good: 'stone', amount: terms.totalStones });
    recordResourceFlow(world, { ...fields, good: WORKSHOP_HERB, amount: terms.totalHerbs });
    order.status = 'active';
    order.acceptedTick = world.tick;
    order.deadlineTick = world.tick + WORKSHOP_ACTIVE_TICKS;
    return event(world, order, 'accept', '工坊委制生效', `实托${order.escrowStones}灵石、${order.escrowHerbs}份玄土根；需工匠逐回合加工。`);
  }
  if (valid.workshopMove === 'work') {
    return claimFurnaceUse(world, actor, order.siteId, 'workshop', order.id) ? work(world, order, actor, rng) : null;
  }
  if (valid.workshopMove === 'decline') {
    settle(world, order, 'declined');
    return event(world, order, 'decline', '工匠谢绝委制', '未签约，无实际扣款。');
  }
  settle(world, order, 'cancelled', actor.id === order.patronId ? 'patron_cancelled' : 'maker_cancelled');
  return event(world, order, 'cancel', '工坊委制中止', `只退实余${order.refundedStones}灵石、${order.refundedHerbs}份玄土根；已耗用料不退。`);
}

export function advanceWorkshops(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const order of world.workshops.orders) {
    if (order.status !== 'active' && order.status !== 'offered') continue;
    const patron = person(world, order.patronId), maker = person(world, order.makerId);
    const reason: WorkshopCloseReason | undefined = !alive(patron) ? 'patron_unavailable' : !alive(maker) ? 'maker_unavailable' :
      !at(world, order.siteId) ? 'site_unavailable' :
      order.status === 'offered' && world.tick >= order.offerExpiresTick ? 'offer_expired' :
      order.status === 'active' && world.tick >= (order.deadlineTick ?? Infinity) ? 'work_expired' : undefined;
    if (!reason) continue; // Temporary absence/furnace downgrade leaves the agreement paused until a real deadline.
    const timedOut = reason === 'offer_expired' || reason === 'work_expired';
    if (settle(world, order, timedOut ? 'expired' : 'cancelled', reason)) {
      events.push(event(world, order, 'close', timedOut ? '工坊委制到期' : '工坊委制无法继续',
        `已核实并退回实余${order.refundedStones}灵石、${order.refundedHerbs}份玄土根；已付工钱及已耗投入不重复结算。`));
    }
  }
  const terminal = world.workshops.orders.filter(order => order.settledTick !== undefined)
    .sort((a, b) => (b.settledTick! - a.settledTick!) || Number(b.id.slice(11)) - Number(a.id.slice(11)))
    .slice(0, WORKSHOP_TERMINAL_LIMIT);
  const retain = new Set(terminal.map(({ id }) => id));
  world.workshops.orders = world.workshops.orders.filter(order => order.settledTick === undefined || retain.has(order.id));
  return events;
}

/** Private terms and job receipts are participant records, not world intelligence. */
export function visibleWorkshopOrders(world: WorldState, actor?: Cultivator): WorkshopOrder[] {
  return actor && person(world, actor.id) === actor
    ? world.workshops.orders.filter(order => order.offeredTick <= world.tick && participant(actor, order)) : [];
}

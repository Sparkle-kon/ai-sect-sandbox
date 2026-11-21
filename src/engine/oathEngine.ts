import { flowActor, flowOath, recordResourceFlow } from './resourceFlowEngine';
import type { Cultivator, LLMDecisionPayload, OathContract, OathState, OathTerm, WorldEvent, WorldState } from '../types/world';

export const OATH_TERMS: Record<OathTerm, { name: string; quantity: number; payment: number; collateral: number }> = {
  foundation_pill: { name: '筑基丹', quantity: 1, payment: 115, collateral: 55 },
  jade_herb: { name: '翡翠灵叶', quantity: 3, payment: 48, collateral: 24 },
};
const TERMS = Object.keys(OATH_TERMS) as OathTerm[];
const OFFER_WINDOW = 3;
const SERVICE_WINDOW = 5;
const APPEAL_WINDOW = 2;
const PARTY_SLOTS = 3;
const HISTORY_LIMIT = 144;
const isLive = (actor: Cultivator | undefined): actor is Cultivator => !!actor && actor.alive && actor.hp > 0;
const outstanding = (oath: OathContract) => oath.settledTick === undefined && (oath.status === 'offered' || oath.status === 'active' || oath.status === 'breached');
const holdings = (actor: Cultivator, term: OathTerm) => term === 'foundation_pill' ? actor.pills.foundation : actor.herbs.jade_leaf;
const actorBy = (world: WorldState, id: string) => world.cultivators.find((person) => person.id === id);

export interface OathOption {
  action: 'OFFER_OATH' | 'ACCEPT_OATH' | 'DECLINE_OATH' | 'FULFILL_OATH' | 'APPEAL_OATH';
  targetCultivatorId?: string;
  targetOathId?: string;
  oathTerm?: OathTerm;
}

export function createOathState(): OathState { return { contracts: [], nextId: 1 }; }

export function availableOathActions(actor: Cultivator, world: WorldState, includeOffers = true): OathOption[] {
  if (!isLive(actor)) return [];
  const liveContracts = world.oaths.contracts.filter(outstanding);
  const options: OathOption[] = [];
  const related = (id: string) => liveContracts.filter((oath) => oath.requesterId === id || oath.providerId === id);
  const ownContracts = related(actor.id);
  for (const oath of ownContracts) {
    if (oath.providerId !== actor.id) continue;
    const requester = actorBy(world, oath.requesterId);
    if (oath.status === 'offered' && oath.offerExpiresTick > world.tick) {
      options.push({ action: 'DECLINE_OATH', targetOathId: oath.id });
      if (isLive(requester) && requester.locationId === oath.locationId && actor.locationId === oath.locationId &&
          requester.spiritStones >= oath.payment && actor.spiritStones >= oath.collateral && holdings(actor, oath.term) >= oath.quantity) {
        options.push({ action: 'ACCEPT_OATH', targetOathId: oath.id });
      }
    }
    if (oath.status === 'active' && (oath.deadlineTick ?? 0) > world.tick && actor.locationId === oath.locationId &&
        holdings(actor, oath.term) >= oath.quantity && !oath.evidence.some(({ tick }) => tick === world.tick)) {
      options.push({ action: 'FULFILL_OATH', targetOathId: oath.id });
    }
    if (oath.status === 'breached' && !oath.appeal && (oath.appealUntilTick ?? 0) > world.tick) {
      options.push({ action: 'APPEAL_OATH', targetOathId: oath.id });
    }
  }
  if (!includeOffers || ownContracts.length >= PARTY_SLOTS || !world.locations.some(({ id }) => id === actor.locationId)) return options;
  for (const provider of world.cultivators) {
    if (provider.id === actor.id || !isLive(provider) || provider.locationId !== actor.locationId || related(provider.id).length >= PARTY_SLOTS ||
        ownContracts.some((item) => item.requesterId === provider.id || item.providerId === provider.id)) continue;
    for (const oathTerm of TERMS) {
      const terms = OATH_TERMS[oathTerm];
      if (actor.spiritStones >= terms.payment && provider.spiritStones >= terms.collateral && holdings(provider, oathTerm) >= terms.quantity &&
          holdings(actor, oathTerm) < terms.quantity * 2) options.push({ action: 'OFFER_OATH', targetCultivatorId: provider.id, oathTerm });
    }
  }
  return options;
}

function oathEvent(world: WorldState, oath: OathContract, token: string, title: string, description: string): WorldEvent {
  return { id: `evt-${oath.id}-${world.tick}-${token}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds: [oath.requesterId, oath.providerId], locationId: oath.locationId, category: 'diplomacy' };
}

function settle(world: WorldState, oath: OathContract, disposition: 'deliver' | 'refund' | 'forfeit'): boolean {
  if (oath.settledTick !== undefined) return false;
  const payer = actorBy(world, oath.requesterId);
  const provider = actorBy(world, oath.providerId);
  if (!payer || !provider) return false; // Do not destroy escrow whose estate cannot be accounted for.
  if (disposition === 'deliver') provider.spiritStones += oath.escrow.payment + oath.escrow.collateral;
  else {
    payer.spiritStones += oath.escrow.payment;
    if (disposition === 'forfeit') payer.spiritStones += oath.escrow.collateral;
    else provider.spiritStones += oath.escrow.collateral;
  }
  const parties = { kind: 'participants', actorIds: [oath.requesterId, oath.providerId] } as const;
  const shared = { kind: 'transfer', mechanism: 'oath', refId: oath.id, good: 'stone', visibility: parties } as const;
  recordResourceFlow(world, { ...shared, reason: disposition === 'deliver' ? 'oath_paid' : 'oath_refunded',
    from: flowOath(oath.id, 'payment'), to: flowActor(disposition === 'deliver' ? provider.id : payer.id), amount: oath.escrow.payment });
  recordResourceFlow(world, { ...shared, reason: disposition === 'forfeit' ? 'oath_forfeited' : 'oath_refunded',
    from: flowOath(oath.id, 'collateral'), to: flowActor(disposition === 'forfeit' ? payer.id : provider.id), amount: oath.escrow.collateral });
  oath.escrow = { payment: 0, collateral: 0 };
  oath.settledTick = world.tick;
  return true;
}

export function resolveOathAction(world: WorldState, actor: Cultivator, choice: LLMDecisionPayload): WorldEvent | null {
  const option = availableOathActions(actor, world).find((item) => item.action === choice.chosenAction &&
    item.targetOathId === choice.targetOathId && item.targetCultivatorId === choice.targetCultivatorId && item.oathTerm === choice.oathTerm);
  if (!option) return null;
  const state = world.oaths;
  if (option.action === 'OFFER_OATH') {
    const term = option.oathTerm!;
    const { name, quantity, payment, collateral } = OATH_TERMS[term];
    const oath: OathContract = { id: `oath-${state.nextId++}`, requesterId: actor.id, providerId: option.targetCultivatorId!,
      locationId: actor.locationId, term, quantity, payment, collateral, offeredTick: world.tick, offerExpiresTick: world.tick + OFFER_WINDOW,
      status: 'offered', evidence: [], escrow: { payment: 0, collateral: 0 } };
    state.contracts.unshift(oath);
    return oathEvent(world, oath, 'offer', '天道契书提案', `约定在此地交付${name}×${quantity}，买方付款${payment}，供方质押${collateral}；待双方应承。`);
  }
  const oath = state.contracts.find(({ id }) => id === option.targetOathId)!;
  const requester = actorBy(world, oath.requesterId);
  if (!requester) return null;
  if (option.action === 'DECLINE_OATH') {
    oath.status = 'declined'; oath.settledTick = world.tick; oath.outcome = '供方拒签，无资金或货物变动。';
    return oathEvent(world, oath, 'decline', '契书未签', oath.outcome);
  }
  if (option.action === 'ACCEPT_OATH') {
    requester.spiritStones -= oath.payment; actor.spiritStones -= oath.collateral;
    oath.escrow = { payment: oath.payment, collateral: oath.collateral };
    const shared = { kind: 'transfer', mechanism: 'oath', refId: oath.id, reason: 'oath_funded', good: 'stone',
      visibility: { kind: 'participants', actorIds: [requester.id, actor.id] } } as const;
    recordResourceFlow(world, { ...shared, from: flowActor(requester.id), to: flowOath(oath.id, 'payment'), amount: oath.payment });
    recordResourceFlow(world, { ...shared, from: flowActor(actor.id), to: flowOath(oath.id, 'collateral'), amount: oath.collateral });
    oath.deadlineTick = world.tick + SERVICE_WINDOW; oath.status = 'active';
    return oathEvent(world, oath, 'accept', '天道契书生效', `双方实际出资已托管，须于第${oath.deadlineTick}轮之前在立约地完成交付。`);
  }
  if (option.action === 'FULFILL_OATH') {
    const present = isLive(requester) && requester.locationId === oath.locationId;
    oath.evidence.push({ tick: world.tick, actorId: actor.id, kind: present ? 'delivery' : 'tender',
      locationId: oath.locationId, quantity: oath.quantity, requesterPresent: present });
    if (!present) return oathEvent(world, oath, 'tender', '履约到场留证', '供方携有约定货物抵达立约地，买方未到；仅记到场证据，未交货或支付。');
    if (oath.term === 'foundation_pill') {
      actor.pills.foundation -= oath.quantity; requester.pills.foundation += oath.quantity;
    } else {
      actor.herbs.jade_leaf -= oath.quantity; requester.herbs.jade_leaf += oath.quantity;
    }
    recordResourceFlow(world, { kind: 'transfer', mechanism: 'oath', refId: oath.id, reason: 'oath_goods',
      from: flowActor(actor.id), to: flowActor(requester.id), good: oath.term === 'foundation_pill' ? 'foundation' : 'jade_leaf',
      amount: oath.quantity, visibility: { kind: 'participants', actorIds: [requester.id, actor.id] } });
    settle(world, oath, 'deliver');
    oath.status = 'fulfilled'; oath.outcome = '实物已验收，价款与保证金按约支付，仅结算一次。';
    return oathEvent(world, oath, 'delivery', '契书履约结算', oath.outcome);
  }
  const exculpated = oath.evidence.some((entry) => entry.actorId === oath.providerId && entry.kind === 'tender' &&
    !entry.requesterPresent && entry.locationId === oath.locationId && entry.quantity === oath.quantity &&
    entry.tick >= oath.offeredTick && entry.tick < (oath.deadlineTick ?? 0));
  if (!settle(world, oath, exculpated ? 'refund' : 'forfeit')) return null;
  oath.appeal = { tick: world.tick, appellantId: actor.id, status: exculpated ? 'upheld' : 'rejected',
    reason: exculpated ? '核实供方按期携货到约定地点，但买方缺席。双方原额退回。' : '查无有效到场交付凭证。价款退回，保证金赔偿买方。' };
  oath.status = exculpated ? 'excused' : 'breached';
  oath.outcome = oath.appeal.reason;
  return oathEvent(world, oath, 'appeal', exculpated ? '天道复核免除违约' : '天道复核驳回', oath.outcome);
}

export function advanceOaths(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const oath of world.oaths.contracts) {
    if (!outstanding(oath)) continue;
    const requester = actorBy(world, oath.requesterId);
    const provider = actorBy(world, oath.providerId);
    const site = world.locations.some(({ id }) => id === oath.locationId);
    if (oath.status === 'offered' && (world.tick >= oath.offerExpiresTick || !isLive(requester) || !isLive(provider) || !site)) {
      oath.status = 'expired'; oath.settledTick = world.tick; oath.outcome = '邀约结束，无托管资金变动。';
      events.push(oathEvent(world, oath, 'expire', '未签契书失效', oath.outcome));
    } else if ((oath.status === 'active' || oath.status === 'breached') && (!isLive(requester) || !site)) {
      if (settle(world, oath, 'refund')) {
        oath.status = 'excused'; oath.outcome = '买方或立约地点已无法履约，托管双方原额退回。';
        events.push(oathEvent(world, oath, 'excuse', '契书非过错终止', oath.outcome));
      }
    } else if (oath.status === 'active' && (world.tick >= (oath.deadlineTick ?? 0) || !isLive(provider))) {
      oath.status = 'breached'; oath.appealUntilTick = world.tick + APPEAL_WINDOW;
      oath.outcome = '过期未交货；资金继续托管，供方可在短期内凭已有证据申请复核。';
      events.push(oathEvent(world, oath, 'breach', '天道契书违约待裁', oath.outcome));
    } else if (oath.status === 'breached' && world.tick >= (oath.appealUntilTick ?? 0) && settle(world, oath, 'forfeit')) {
      oath.outcome = '复核期限结束：买方收回原款并获供方保证金，结算不可重放。';
      events.push(oathEvent(world, oath, 'forfeit', '契书违约结算', oath.outcome));
    }
  }
  const open = world.oaths.contracts.filter(outstanding);
  world.oaths.contracts = [...open, ...world.oaths.contracts.filter((item) => !outstanding(item)).slice(0, Math.max(0, HISTORY_LIMIT - open.length))];
  return events;
}

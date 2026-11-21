import {SECT_CREDIT_TREASURY_CAP,SECT_CREDIT_RESERVE} from './sectCreditTerms';
export {SECT_CREDIT_TREASURY_CAP,SECT_CREDIT_RESERVE} from './sectCreditTerms';
import {isSectActive} from './sectActivity';
import type { Cultivator, LLMDecisionPayload, Sect, SectCreditMove, SectCreditReceipt, SectCreditState, SectLoan, WorldEvent, WorldState } from '../types/world';

export const SECT_CREDIT_PRINCIPAL = 120;
export const SECT_CREDIT_OFFER_TICKS = 3;
export const SECT_CREDIT_TERM_TICKS = 6;
export const SECT_CREDIT_COLLECTION_TICKS = 3;
export const SECT_CREDIT_PAYMENT_MAX = 40;

export const SECT_CREDIT_EXPOSURE_MAX = 360;
export const SECT_CREDIT_RESTRICTION_TICKS = 7;
const RETAIN_TERMINAL = 72;

export interface SectCreditOption {
  action: 'SECT_CREDIT';
  creditMove: SectCreditMove;
  targetSectId?: string;
  targetCreditId?: string;
}
export interface SectCreditExposure {
  receivable: number;
  payable: number;
  pendingOutgoing: number;
  defaultedWriteOff: number;
  restrictedUntilTick?: number;
}

export const createSectCreditState = (): SectCreditState => ({ loans: [], restrictions: [], nextId: 1 });
const findSect = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const findPerson = (world: WorldState, id: string | undefined) => world.cultivators.find((person) => person.id === id);
const relocation = (world: WorldState, sectId: string) => world.relocations.plans.find((plan) => plan.sectId === sectId && plan.status === 'in_transit');

function treasury(world: WorldState, sect: Sect) {
  const transit = relocation(world, sect.id);
  const balance = transit ? transit.custody.stones : sect.spiritStones;
  // Only the active custody is debited/credited. If another engine left deposits at ground, reserve that headroom too:
  // relocation reunites the two compartments when it finishes.
  const headroom = Math.max(0, Math.floor(SECT_CREDIT_TREASURY_CAP - balance - (transit ? sect.spiritStones : 0)));
  return {
    balance, headroom,
    adjust(amount: number) {
      if (transit) transit.custody.stones += amount;
      else sect.spiritStones += amount;
    },
  };
}

export function sectCreditLiquidity(world: WorldState, sectId: string): number {
  const sect = findSect(world, sectId);
  return sect ? treasury(world, sect).balance : 0;
}

function pending(world: WorldState, loan: SectLoan): boolean {
  return loan.status === 'offered' && loan.openedTick <= world.tick && loan.offerExpiresTick > world.tick;
}
function remaining(loan: SectLoan): number {
  return loan.principal - loan.paidTotal - loan.writtenOff;
}
function restriction(world: WorldState, sectId: string): number | undefined {
  return world.credit.restrictions.find((hold) => hold.sectId === sectId && hold.untilTick > world.tick)?.untilTick;
}

export function sectCreditExposure(world: WorldState, sectId: string): SectCreditExposure {
  const exposure: SectCreditExposure = { receivable: 0, payable: 0, pendingOutgoing: 0, defaultedWriteOff: 0,
    restrictedUntilTick: restriction(world, sectId) };
  for (const loan of world.credit.loans) {
    if (loan.lenderSectId === sectId) {
      if (loan.status === 'active') exposure.receivable += remaining(loan);
      if (pending(world, loan)) exposure.pendingOutgoing += loan.principal;
      if (loan.status === 'defaulted') exposure.defaultedWriteOff += loan.writtenOff;
    }
    if (loan.borrowerSectId === sectId && loan.status === 'active') exposure.payable += remaining(loan);
  }
  return exposure;
}

/** Signed obligations are public. An offer or a non-funded reply is visible only to the two sects. */
export function visibleSectCredit(world: WorldState, viewer?: Cultivator): SectLoan[] {
  const selected = viewer && findPerson(world, viewer.id);
  return world.credit.loans.filter((loan) => loan.openedTick <= world.tick &&
    ((loan.fundedTick !== undefined && loan.fundedTick <= world.tick) || [loan.lenderSectId, loan.borrowerSectId].includes(selected?.sectId ?? '')));
}

function atWar(world: WorldState, a: string, b: string): boolean {
  return world.diplomacy.some((relation) => relation.pact === 'war' && ((relation.sectAId === a && relation.sectBId === b) ||
    (relation.sectAId === b && relation.sectBId === a)));
}

function represents(world: WorldState, actor: Cultivator | undefined, sect: Sect): actor is Cultivator {
  return Boolean(actor && actor.alive && actor.hp > 0 && actor.sectId === sect.id && actor.id === sect.leaderId && actor.sectRank === '掌门' &&
    actor.locationId === sect.headquartersId && world.locations.some((site) => site.id === sect.headquartersId &&
      (!site.ownerSectId || site.ownerSectId === sect.id)) && !relocation(world, sect.id) &&
    !world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) &&
    !world.escorts.contracts.some((contract) => contract.status === 'active' && contract.escortId === actor.id) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') && occasion.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon');
}

function canFund(world: WorldState, lender: Sect, borrower: Sect, excludedOffer?: SectLoan): boolean {
  if (lender.id === borrower.id || atWar(world, lender.id, borrower.id) || restriction(world, borrower.id) !== undefined) return false;
  const existing = world.credit.loans.some((loan) => loan !== excludedOffer && (pending(world, loan) || loan.status === 'active') &&
    (loan.borrowerSectId === borrower.id || (loan.lenderSectId === borrower.id && loan.borrowerSectId === lender.id)));
  if (existing) return false;
  const exposure = sectCreditExposure(world, lender.id);
  const committed = exposure.pendingOutgoing - (excludedOffer && pending(world, excludedOffer) ? excludedOffer.principal : 0);
  const source = treasury(world, lender), destination = treasury(world, borrower);
  const amount = excludedOffer?.principal ?? SECT_CREDIT_PRINCIPAL;
  return committed + exposure.receivable + amount <= SECT_CREDIT_EXPOSURE_MAX &&
    source.balance >= SECT_CREDIT_RESERVE + exposure.payable + committed + amount && destination.headroom >= amount;
}

function paymentAmount(world: WorldState, borrower: Sect, lender: Sect, loan: SectLoan): number {
  const paidThisTick = loan.receipts.filter(({ tick }) => tick === world.tick).reduce((sum, receipt) => sum + receipt.amount, 0);
  return Math.max(0, Math.floor(Math.min(
    treasury(world, borrower).balance - SECT_CREDIT_RESERVE, treasury(world, lender).headroom,
    remaining(loan), SECT_CREDIT_PAYMENT_MAX - paidThisTick,
  )));
}

export function availableSectCreditActions(actor: Cultivator, world: WorldState): SectCreditOption[] {
  const own = findSect(world, actor.sectId);
  if (!isSectActive(own) || !world.cultivators.includes(actor) || !represents(world, actor, own)) return [];
  const options: SectCreditOption[] = [];
  const add = (creditMove: SectCreditMove, targetSectId?: string, targetCreditId?: string) =>
    options.push({ action: 'SECT_CREDIT', creditMove, ...(targetSectId ? { targetSectId } : {}), ...(targetCreditId ? { targetCreditId } : {}) });
  for (const loan of world.credit.loans) {
    if (own.id !== loan.borrowerSectId) continue;
    const lender = findSect(world, loan.lenderSectId);
    if (pending(world, loan) && loan.borrowerSignerId === actor.id) {
      if (lender && represents(world, findPerson(world, loan.lenderSignerId), lender) && canFund(world, lender, own, loan)) add('accept', undefined, loan.id);
      add('decline', undefined, loan.id);
    } else if (loan.status === 'active' && (loan.collectionUntilTick ?? 0) > world.tick && lender &&
      !loan.receipts.some(({ tick, kind }) => tick === world.tick && kind === 'voluntary') && paymentAmount(world, own, lender, loan) > 0) {
      add('repay', undefined, loan.id);
    }
  }
  for (const other of world.sects) {
    if (!isSectActive(other)||other === own || !represents(world, findPerson(world, other.leaderId), other) || !canFund(world, own, other)) continue;
    add('offer', other.id);
  }
  return options;
}

function event(world: WorldState, loan: SectLoan, stage: string, title: string, description: string, actorIds: string[], privateOnly = false): WorldEvent {
  return { id: `evt-${loan.id}-${stage}-${world.tick}`, tick: world.tick, year: world.year, month: world.month,
    title, description, category: 'diplomacy', actorIds, ...(privateOnly ? { witnessScope: 'participants' } : {}) };
}

function postPayment(world: WorldState, loan: SectLoan, borrower: Sect, lender: Sect, kind: SectCreditReceipt['kind']): WorldEvent | null {
  const amount = paymentAmount(world, borrower, lender, loan);
  if (amount <= 0) return null;
  treasury(world, borrower).adjust(-amount);
  treasury(world, lender).adjust(amount);
  loan.paidTotal += amount;
  loan.receipts.push({ tick: world.tick, kind, amount });
  if (remaining(loan) === 0) { loan.status = 'paid'; loan.settledTick = world.tick; }
  const actors = [borrower.leaderId ?? loan.borrowerSignerId, lender.leaderId ?? loan.lenderSignerId];
  return event(world, loan, kind, kind === 'voluntary' ? '宗门主动清偿' : '到期实账催收',
    `${borrower.name}从本宗财库向${lender.name}实付${amount}灵石，余本金${remaining(loan)}。`, actors);
}

export function resolveSectCreditAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SECT_CREDIT') return null;
  const option = availableSectCreditActions(actor, world).find((candidate) => candidate.creditMove === decision.creditMove &&
    candidate.targetSectId === decision.targetSectId && candidate.targetCreditId === decision.targetCreditId);
  if (!option) return null;
  const own = findSect(world, actor.sectId)!;
  if (option.creditMove === 'offer') {
    const borrowing = findSect(world, option.targetSectId!)!;
    const loan: SectLoan = { id: `sect-credit-${world.credit.nextId++}`, lenderSectId: own.id, borrowerSectId: borrowing.id,
      lenderSignerId: actor.id, borrowerSignerId: borrowing.leaderId!, openedTick: world.tick, offerExpiresTick: world.tick + SECT_CREDIT_OFFER_TICKS,
      status: 'offered', principal: SECT_CREDIT_PRINCIPAL, paidTotal: 0, writtenOff: 0, receipts: [] };
    world.credit.loans.push(loan);
    return event(world, loan, 'offer', '宗门信贷邀约', `${own.name}提议以本宗真实财库借出${loan.principal}灵石；未拨款，不计利息。`,
      [loan.lenderSignerId, loan.borrowerSignerId], true);
  }
  const loan = world.credit.loans.find(({ id }) => id === option.targetCreditId)!;
  const lender = findSect(world, loan.lenderSectId);
  if (option.creditMove === 'decline') {
    loan.status = 'declined';
    loan.settledTick = world.tick;
    return event(world, loan, 'declined', '拒绝宗门信贷邀约', '借方未接受邀约，双方财库未划款。', [loan.lenderSignerId, actor.id], true);
  }
  if (!lender) return null;
  if (option.creditMove === 'repay') return postPayment(world, loan, own, lender, 'voluntary');
  treasury(world, lender).adjust(-loan.principal);
  treasury(world, own).adjust(loan.principal);
  loan.status = 'active';
  loan.fundedTick = world.tick;
  loan.dueTick = world.tick + SECT_CREDIT_TERM_TICKS;
  loan.collectionUntilTick = loan.dueTick + SECT_CREDIT_COLLECTION_TICKS;
  return event(world, loan, 'funded', '双签后宗门信贷实拨',
    `${lender.name}向${own.name}实拨${loan.principal}灵石；${SECT_CREDIT_TERM_TICKS}月后归还本金，不计利息。`, [loan.lenderSignerId, actor.id]);
}

export function advanceSectCredit(world: WorldState): WorldEvent[] {
  const state = world.credit;
  const events: WorldEvent[] = [];
  state.restrictions = state.restrictions.filter((item) => item.untilTick > world.tick);
  for (const loan of state.loans) {
    if (loan.status === 'offered' && loan.offerExpiresTick <= world.tick) {
      loan.status = 'expired';
      loan.settledTick = world.tick;
      events.push(event(world, loan, 'expired', '信贷邀约届满', '未双签拨款，邀约结束。', [loan.lenderSignerId, loan.borrowerSignerId], true));
      continue;
    }
    if (loan.status !== 'active' || loan.dueTick === undefined || loan.collectionUntilTick === undefined || world.tick < loan.dueTick) continue;
    const borrower = findSect(world, loan.borrowerSectId), lender = findSect(world, loan.lenderSectId);
    if (world.tick >= loan.collectionUntilTick) {
      loan.writtenOff = remaining(loan);
      loan.status = 'defaulted';
      loan.settledTick = world.tick;
      const untilTick = world.tick + SECT_CREDIT_RESTRICTION_TICKS;
      const existing = state.restrictions.find((item) => item.sectId === loan.borrowerSectId);
      if (existing) existing.untilTick = Math.max(existing.untilTick, untilTick);
      else state.restrictions.push({ sectId: loan.borrowerSectId, untilTick });
      events.push(event(world, loan, 'defaulted', '宗门逾期清算',
        `注销未收本金${loan.writtenOff}灵石，未凭空补偿或再扣取；借方${SECT_CREDIT_RESTRICTION_TICKS}月内不得新增借款。`,
        [borrower?.leaderId ?? loan.borrowerSignerId, lender?.leaderId ?? loan.lenderSignerId]));
    } else if (loan.lastCollectionTick !== world.tick) {
      loan.lastCollectionTick = world.tick;
      const receipt = borrower && lender && postPayment(world, loan, borrower, lender, 'collection');
      if (receipt) events.push(receipt);
    }
  }
  const terminal = new Set(state.loans.filter((loan) => loan.status !== 'offered' && loan.status !== 'active').slice(-RETAIN_TERMINAL).map(({ id }) => id));
  state.loans = state.loans.filter((loan) => loan.status === 'offered' || loan.status === 'active' || terminal.has(loan.id));
  return events;
}

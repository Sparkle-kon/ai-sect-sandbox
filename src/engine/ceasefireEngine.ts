import type { CeasefireMove, CeasefireState, Cultivator, LLMDecisionPayload, Sect, SectCeasefire, SectSiege, WorldEvent, WorldState } from '../types/world';
import { noteTerrainVisit } from './terrainEngine';

export const CEASEFIRE_BOND = 60;
export const CEASEFIRE_DURATION = 12;
export const CEASEFIRE_AID_DELAY = 3;
export const CEASEFIRE_OFFER_TICKS = 4;
const MIN_WAR_TICKS = 6;
const MIN_AID = 30;
const MAX_AID = 120;
const RETAIN_CEASEFIRES = 72;
const live = (person: Cultivator) => person.alive && person.hp > 0;
const getSect = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const getActor = (world: WorldState, id: string | undefined) => world.cultivators.find((person) => person.id === id);
const pair = (left: string, right: string, a: string, b: string) => (left === a && right === b) || (left === b && right === a);
const sameSides = (deal: SectCeasefire, a: string, b: string) => pair(deal.proposerSectId, deal.targetSectId, a, b);
const relation = (world: WorldState, a: string, b: string) => world.diplomacy.find((r) => pair(r.sectAId, r.sectBId, a, b));
const pairedSieges = (world: WorldState, a: string, b: string) =>
  world.sieges.filter((siege) => pair(siege.attackerSectId, siege.defenderSectId, a, b));
const activeArmy = (siege: SectSiege) => siege.status === 'marching' || siege.status === 'sieging';
const siteExists = (world: WorldState, id: string) => world.locations.some((place) => place.id === id);
const weakened = (sect: Sect) => sect.arrayMaxHp > 0 && sect.arrayHp < sect.arrayMaxHp;
const damageRatio = (sect: Sect) => sect.arrayMaxHp > 0 ? Math.max(0, 1 - sect.arrayHp / sect.arrayMaxHp) : 0;

export interface CeasefireOption { action: 'CEASEFIRE'; ceasefireMove: CeasefireMove; targetSectId?: string; targetCeasefireId?: string }
export const createCeasefireState = (): CeasefireState => ({ agreements: [], nextId: 1 });

export function activeCeasefireBetween(world: WorldState, a: string, b: string): SectCeasefire | undefined {
  return world.ceasefires.agreements.find((deal) => deal.status === 'active' && sameSides(deal, a, b) &&
    deal.signedTick !== undefined && deal.signedTick <= world.tick && deal.endsTick !== undefined && world.tick < deal.endsTick);
}

export function visibleCeasefires(world: WorldState, actor?: Cultivator): SectCeasefire[] {
  const observer = actor && getActor(world, actor.id);
  return world.ceasefires.agreements.filter((deal) => deal.openedTick <= world.tick &&
    (deal.status === 'active' || deal.status === 'fulfilled' || deal.status === 'breached' ||
      (observer && [deal.proposerSectId, deal.targetSectId].includes(observer.sectId))));
}

function canRepresent(world: WorldState, actor: Cultivator, sect: Sect, counterpart: Sect): boolean {
  if (!live(actor) || !world.cultivators.includes(actor) || actor.id !== sect.leaderId || actor.sectId !== sect.id ||
      !siteExists(world, actor.locationId) ||
      world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.sectId === sect.id) ||
      world.escorts.contracts.some((contract) => contract.status === 'active' && contract.escortId === actor.id) ||
      world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') &&
        occasion.participantIds.includes(actor.id)) ||
      actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  if (actor.locationId === sect.headquartersId) return true;
  return pairedSieges(world, sect.id, counterpart.id).some((siege) => activeArmy(siege) &&
    siege.participantIds.includes(actor.id) && actor.locationId === siege.destinationId);
}

function warWeariness(world: WorldState, a: Sect, b: Sect): SectSiege[] {
  const standing = relation(world, a.id, b.id);
  if (!standing || standing.pact !== 'war' || standing.sinceTick > world.tick - MIN_WAR_TICKS) return [];
  return pairedSieges(world, a.id, b.id).filter((siege) => siege.startedTick >= standing.sinceTick &&
    (activeArmy(siege) || world.tick - (siege.lastResolvedTick ?? siege.startedTick) <= 18) &&
    (siege.rounds > 0 || siege.status === 'sieging' || (activeArmy(siege) && (weakened(a) || weakened(b))) ||
      siege.status === 'victory')).sort((x, y) => (y.lastResolvedTick ?? y.startedTick) - (x.lastResolvedTick ?? x.startedTick) || x.id.localeCompare(y.id));
}

function termsFor(world: WorldState, a: Sect, b: Sect): SectCeasefire['terms'] | undefined {
  const evidence = warWeariness(world, a, b);
  if (!evidence.length) return undefined;
  const difference = damageRatio(a) - damageRatio(b);
  const needy = Math.abs(difference) > .001 ? (difference > 0 ? a : b) :
    (evidence[0].defenderSectId === a.id ? a : b);
  const payer = needy.id === a.id ? b : a;
  const amount = Math.min(MAX_AID, Math.floor(payer.spiritStones - CEASEFIRE_BOND));
  if (amount < MIN_AID || needy.spiritStones < CEASEFIRE_BOND) return undefined;
  return { duration: CEASEFIRE_DURATION, bondPerSide: CEASEFIRE_BOND, aidAmount: amount, aidPayerSectId: payer.id, aidRecipientSectId: needy.id };
}

function funded(deal: SectCeasefire, a: Sect, b: Sect): boolean {
  const { bondPerSide, aidAmount, aidPayerSectId } = deal.terms;
  return a.spiritStones >= bondPerSide + (aidPayerSectId === a.id ? aidAmount : 0) &&
    b.spiritStones >= bondPerSide + (aidPayerSectId === b.id ? aidAmount : 0);
}

function currentSigners(world: WorldState, deal: SectCeasefire, a: Sect, b: Sect): boolean {
  const from = getActor(world, deal.proposerId);
  const to = getActor(world, deal.targetLeaderId);
  return Boolean(from && to && canRepresent(world, from, a, b) && canRepresent(world, to, b, a));
}

export function availableCeasefireActions(actor: Cultivator, world: WorldState): CeasefireOption[] {
  const own = getSect(world, actor.sectId);
  if (!own || !live(actor) || !world.cultivators.includes(actor) || own.leaderId !== actor.id) return [];
  const options: CeasefireOption[] = [];
  for (const other of world.sects.filter(({ id }) => id !== own.id).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!canRepresent(world, actor, own, other)) continue;
    const paused = activeCeasefireBetween(world, own.id, other.id);
    if (paused) {
      options.push({ action: 'CEASEFIRE', ceasefireMove: 'break', targetCeasefireId: paused.id });
      continue;
    }
    const outstanding = world.ceasefires.agreements.find((deal) => deal.status === 'offered' && sameSides(deal, own.id, other.id));
    if (outstanding) {
      if (world.tick < outstanding.offerExpiresTick && outstanding.targetLeaderId === actor.id && outstanding.targetSectId === own.id) {
        if (currentSigners(world, outstanding, other, own) && funded(outstanding, other, own) && warWeariness(world, own, other).length) {
          options.push({ action: 'CEASEFIRE', ceasefireMove: 'accept', targetCeasefireId: outstanding.id });
        }
        options.push({ action: 'CEASEFIRE', ceasefireMove: 'decline', targetCeasefireId: outstanding.id });
      }
      continue;
    }
    const otherLeader = getActor(world, other.leaderId);
    if (!otherLeader || !canRepresent(world, otherLeader, other, own) || !termsFor(world, own, other)) continue;
    const latest = world.ceasefires.agreements.filter((deal) => sameSides(deal, own.id, other.id)).at(-1);
    if (latest?.settledTick !== undefined && world.tick - latest.settledTick < 4) continue;
    options.push({ action: 'CEASEFIRE', ceasefireMove: 'offer', targetSectId: other.id });
  }
  return options;
}

function event(world: WorldState, deal: SectCeasefire, slug: string, title: string, description: string,
  actorIds: string[], privateOnly = false, locationId?: string): WorldEvent {
  return { id: `evt-${world.tick}-${deal.id}-${slug}`, tick: world.tick, year: world.year, month: world.month, title,
    description, category: 'diplomacy', actorIds, ...(locationId ? { locationId } : {}), ...(privateOnly ? { witnessScope: 'participants' as const } : {}) };
}

function withdrawArmies(world: WorldState, deal: SectCeasefire): string[] {
  const moved = new Set<string>();
  for (const siege of pairedSieges(world, deal.proposerSectId, deal.targetSectId).filter(activeArmy)) {
    siege.status = 'withdrawn';
    siege.lastResolvedTick = world.tick;
    siege.outcome = '双方签订停战，联军有序撤回各宗山门；不记攻防胜负或罚款。';
    deal.withdrawnSiegeIds.push(siege.id);
    const attacker = getSect(world, siege.attackerSectId);
    for (const id of new Set(siege.participantIds)) {
      const actor = getActor(world, id);
      if (!actor || !live(actor)) continue;
      const home = getSect(world, actor.sectId)?.headquartersId;
      const fallback = attacker?.headquartersId;
      const destination = home && siteExists(world, home) ? home : fallback && siteExists(world, fallback) ? fallback : undefined;
      if (destination) {
        actor.locationId = destination;
        noteTerrainVisit(world, actor);
        moved.add(actor.id);
      }
    }
  }
  for (const tribute of world.tributeDemands) {
    if (tribute.status === 'pending' && pair(tribute.demanderSectId, tribute.targetSectId, deal.proposerSectId, deal.targetSectId)) {
      tribute.status = 'rejected';
      tribute.resolvedTick = world.tick;
    }
  }
  return [...moved];
}

function closeWithoutSigning(world: WorldState, deal: SectCeasefire, status: 'declined' | 'expired'): WorldEvent {
  deal.status = status;
  deal.settledTick = world.tick;
  return event(world, deal, status, status === 'declined' ? '停战提议被拒' : '停战提议失效',
    status === 'declined' ? '受邀方明确拒绝，无财物划付，原战况不变。' : '签署资格或期限失效，无财物划付，原战况不变。',
    [deal.proposerId, deal.targetLeaderId], true);
}

function sign(world: WorldState, deal: SectCeasefire, proposer: Sect, recipient: Sect): WorldEvent {
  const payer = deal.terms.aidPayerSectId === proposer.id ? proposer : recipient;
  proposer.spiritStones -= deal.terms.bondPerSide;
  recipient.spiritStones -= deal.terms.bondPerSide;
  payer.spiritStones -= deal.terms.aidAmount;
  deal.escrow = { proposerBond: deal.terms.bondPerSide, targetBond: deal.terms.bondPerSide, aid: deal.terms.aidAmount };
  const returned = withdrawArmies(world, deal);
  deal.status = 'active';
  deal.signedTick = world.tick;
  deal.endsTick = world.tick + deal.terms.duration;
  const standing = relation(world, proposer.id, recipient.id)!;
  standing.pact = 'neutral';
  standing.sinceTick = world.tick;
  standing.lastActionTick = world.tick;
  standing.affinity = Math.min(100, standing.affinity + 10);
  const actors = [...new Set([deal.proposerId, deal.targetLeaderId, ...returned])];
  return event(world, deal, 'signed', '两宗签署停战撤军议约',
    `双方托管实际保证金及${deal.terms.aidAmount}灵石重建款，有序撤回${deal.withdrawnSiegeIds.length}支参战队伍，暂停敌对行为。`,
    actors, false, proposer.headquartersId);
}

function refundAid(world: WorldState, deal: SectCeasefire): void {
  if (deal.escrow.aid === 0) return;
  const payer = getSect(world, deal.terms.aidPayerSectId);
  if (!payer) return;
  payer.spiritStones += deal.escrow.aid;
  deal.escrow.aid = 0;
}

function breach(world: WorldState, deal: SectCeasefire, offender: Sect, affected: Sect,
  kind: NonNullable<SectCeasefire['breach']>['kind'], proof?: WorldEvent): WorldEvent {
  const isProposer = offender.id === deal.proposerSectId;
  const amount = isProposer ? deal.escrow.proposerBond : deal.escrow.targetBond;
  affected.spiritStones += deal.escrow.proposerBond + deal.escrow.targetBond;
  deal.escrow.proposerBond = 0;
  deal.escrow.targetBond = 0;
  refundAid(world, deal);
  deal.status = 'breached';
  deal.settledTick = world.tick;
  deal.breach = { offenderSectId: offender.id, tick: world.tick, kind, forfeitedBond: amount,
    ...(proof && proof.witnessScope !== 'participants' ? { eventId: proof.id } : {}) };
  offender.reputation -= 12;
  const standing = relation(world, offender.id, affected.id);
  if (standing) {
    standing.pact = 'war';
    standing.sinceTick = world.tick;
    standing.lastActionTick = world.tick;
    standing.affinity = Math.max(-100, standing.affinity - 20);
  }
  return event(world, deal, 'breached', '停战违约及保证金罚没',
    `${offender.name}${kind === 'renounced' ? '单方毁约' : '对停战方造成可核验伤害'}，原有保证金${amount}灵石转入${affected.name}，自身声望下降，敌对恢复。`,
    [offender.leaderId, affected.leaderId].filter((id): id is string => !!id), false, offender.headquartersId);
}

export function resolveCeasefireAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'CEASEFIRE') return null;
  const option = availableCeasefireActions(actor, world).find((item) => item.ceasefireMove === decision.ceasefireMove &&
    item.targetSectId === decision.targetSectId && item.targetCeasefireId === decision.targetCeasefireId);
  if (!option) return null;
  if (option.ceasefireMove === 'offer') {
    const own = getSect(world, actor.sectId)!;
    const other = getSect(world, option.targetSectId!)!;
    const deal: SectCeasefire = { id: `ceasefire-${world.ceasefires.nextId++}`, proposerSectId: own.id, targetSectId: other.id,
      proposerId: actor.id, targetLeaderId: other.leaderId!, openedTick: world.tick, offerExpiresTick: world.tick + CEASEFIRE_OFFER_TICKS,
      status: 'offered', terms: termsFor(world, own, other)!, escrow: { proposerBond: 0, targetBond: 0, aid: 0 }, withdrawnSiegeIds: [] };
    world.ceasefires.agreements.push(deal);
    return event(world, deal, 'offered', '两宗议拟停战', '发出有期限的相互停战及重建援款提议；未签署前不动用财物。',
      [actor.id, deal.targetLeaderId], true, actor.locationId);
  }
  const deal = world.ceasefires.agreements.find(({ id }) => id === option.targetCeasefireId)!;
  const proposer = getSect(world, deal.proposerSectId)!;
  const recipient = getSect(world, deal.targetSectId)!;
  if (option.ceasefireMove === 'decline') return closeWithoutSigning(world, deal, 'declined');
  if (option.ceasefireMove === 'accept') return sign(world, deal, proposer, recipient);
  return actor.sectId === proposer.id ? breach(world, deal, proposer, recipient, 'renounced') :
    breach(world, deal, recipient, proposer, 'renounced');
}

/** Caller must supply the actual initiating actor and the actual harmed actor from the committed combat. */
export function recordCeasefireHostility(world: WorldState, attacker: Cultivator, defender: Cultivator, proof: WorldEvent): WorldEvent | null {
  if (!world.cultivators.includes(attacker) || !world.cultivators.includes(defender) || attacker.id === defender.id ||
      proof.tick !== world.tick || (proof.category !== 'combat' && proof.category !== 'death') ||
      !proof.actorIds.includes(attacker.id) || !proof.actorIds.includes(defender.id) ||
      !proof.damage?.some((hit) => hit.cultivatorId === defender.id && hit.amount > 0 && Number.isFinite(hit.amount))) return null;
  const deal = activeCeasefireBetween(world, attacker.sectId, defender.sectId);
  const offender = getSect(world, attacker.sectId);
  const affected = getSect(world, defender.sectId);
  if (!deal || !offender || !affected) return null;
  return breach(world, deal, offender, affected, 'hostile_damage', proof);
}

export function advanceCeasefires(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const deal of world.ceasefires.agreements) {
    const first = getSect(world, deal.proposerSectId);
    const second = getSect(world, deal.targetSectId);
    if (deal.status === 'offered') {
      if (world.tick >= deal.offerExpiresTick || !first || !second || !currentSigners(world, deal, first, second) ||
          relation(world, deal.proposerSectId, deal.targetSectId)?.pact !== 'war') events.push(closeWithoutSigning(world, deal, 'expired'));
      continue;
    }
    if (deal.status !== 'active' || !first || !second || deal.signedTick === undefined || deal.endsTick === undefined) continue;
    const recipient = getSect(world, deal.terms.aidRecipientSectId);
    const armies = pairedSieges(world, first.id, second.id);
    if (deal.escrow.aid > 0 && recipient && world.tick >= deal.signedTick + CEASEFIRE_AID_DELAY &&
        !armies.some(activeArmy) && deal.withdrawnSiegeIds.every((id) => armies.some((siege) => siege.id === id && siege.status === 'withdrawn')) &&
        relation(world, first.id, second.id)?.pact === 'neutral') {
      const paid = deal.escrow.aid;
      recipient.spiritStones += paid;
      deal.escrow.aid = 0;
      deal.aidReleasedTick = world.tick;
      events.push(event(world, deal, 'aid', '战后重建援款入库', `实际撤军核实后，${paid}灵石从托管划入${recipient.name}，不复制公共库银。`,
        [deal.proposerId, deal.targetLeaderId], false, recipient.headquartersId));
    }
    if (world.tick < deal.endsTick) continue;
    first.spiritStones += deal.escrow.proposerBond;
    second.spiritStones += deal.escrow.targetBond;
    deal.escrow.proposerBond = 0;
    deal.escrow.targetBond = 0;
    refundAid(world, deal);
    deal.status = 'fulfilled';
    deal.settledTick = world.tick;
    events.push(event(world, deal, 'fulfilled', '停战正常期满',
      '双方守约，原有保证金返还；到期不自动恢复战争，已经支付的援款不重复结算。', [deal.proposerId, deal.targetLeaderId]));
  }
  const recent = new Set(world.ceasefires.agreements.filter((item) => item.status !== 'offered' && item.status !== 'active').slice(-RETAIN_CEASEFIRES));
  world.ceasefires.agreements = world.ceasefires.agreements.filter((item) => item.status === 'offered' || item.status === 'active' || recent.has(item));
  return events;
}

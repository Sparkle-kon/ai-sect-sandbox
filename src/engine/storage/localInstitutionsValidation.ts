import { validateCraftTraining } from '../storageCraftTrainingValidation';
import { PROBATION_REQUEST_TICKS, PROBATION_REQUIRED_RELIEF, PROBATION_REQUIRED_REVIEWS, PROBATION_SERVICE_TICKS } from '../probationEngine';
import { validateWorkshopInstitutionHistory } from '../storageWorkshopValidation';
import { WORKSHOP_ACTIVE_TICKS, WORKSHOP_OFFER_TICKS, workshopGradeForScore, workshopTerms } from '../workshopEngine';
import { validateDamageAssuranceHistory } from '../storageDamageAssuranceValidation';
import { FURNACE_QUEUE_TICKS, FURNACE_TERMINAL_LIMIT, FURNACE_USE_RETENTION_TICKS } from '../furnaceReservationEngine';
import { validateSparringRelationships, validateExpeditionRescueRelationships, validateShortShiftRelationships, validateBoundaryReliefRelationships, validateApprenticeCohortRelationships, validateHouseholdNameRelationships, validateCaravanRestitutionRelationships, validateVillageGranaryRelationships, validateFurnaceSafetyRelationships } from '../storageActivityValidation';
import { validateVillageSupplyHistory } from '../storageVillageSupplyValidation';
import { validatePavilionLoanHistory } from '../storagePavilionLoanValidation';
import { validateCivicMemorialHistory } from '../storageCivicMemorialValidation';
import { validateVillageFairHistory } from '../storageVillageFairValidation';
import { validateSectStipendHistory } from '../storageSectStipendValidation';
import { validateSeedCultureHistory } from '../storageSeedCultureValidation';
import { effectiveWorkshopDeadline, effectiveWorkshopQuantity } from '../workshopCapacityTerms';
import { validateWorkshopCapacityClauses } from '../storageWorkshopCapacityValidation';
import { validateWorkshopReleaseNegotiations } from '../storageWorkshopReleaseValidation';
import { validateRouteWarningHistory } from '../storageRouteWarningValidation';
import { RESOURCE_FLOW_DETAIL_LIMIT, RESOURCE_FLOW_REASON, sameFlowAccount } from '../resourceFlowEngine';
import { COMMONS_MAINTENANCE_UNIT, COMMONS_OFFER_TICKS, COMMONS_ROUND_TICKS, COMMONS_TERM_TICKS, commonsQuotaShares } from '../sharedCommonsEngine';
import { SERVICE_RETIREMENT_MIN_TICKS, isRetiredFromService } from '../serviceRetirementEngine';
import { SETTLEMENT_RELIEF } from '../settlementEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateLocalInstitutions(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
  locations: ReadonlySet<string>,
): ReadonlySet<string> {
  const activeProbation = (status: WorldState['probation']['cases'][number]['status']) => status === 'requested' || status === 'active' || status === 'ready';
  unique(w.probation.cases.filter(({ status }) => activeProbation(status)), ({ actorId }) => actorId, 'probation.cases.openActor');
  const expulsions = new Map(w.probation.expulsions.map((row) => [row.id, row]));
  const storedCouncils = new Map(w.councils.map((row) => [row.id, row]));
  const villagers = new Set(w.settlements.villages.map(({ id }) => id));
  for (const anchor of w.probation.expulsions) {
    const subject = w.cultivators.find(({ id }) => id === anchor.actorId);
    const historical = storedCouncils.get(anchor.id);
    if (!subject || !sector.has(anchor.sectId) || anchor.tick > w.tick ||
        anchor.id !== `council-${anchor.tick}-${anchor.sectId}-expel:${anchor.actorId}` ||
        anchor.transgressions < 4 || anchor.disciplineRevision > (subject.disciplineRevision ?? 0) ||
        (historical && (historical.status !== 'passed' || historical.proposal.kind !== 'expel' ||
          historical.proposal.targetCultivatorId !== anchor.actorId || historical.tick !== anchor.tick || historical.sectId !== anchor.sectId)) ||
        (anchor.lastCaseClosedTick !== undefined && (anchor.lastCaseClosedTick < anchor.tick || anchor.lastCaseClosedTick > w.tick)) ||
        (anchor.reinstatedTick === undefined ? anchor.reinstatedRevision !== undefined :
          anchor.reinstatedTick < anchor.tick || anchor.reinstatedTick > w.tick ||
          anchor.reinstatedRevision === undefined || anchor.reinstatedRevision < anchor.disciplineRevision ||
          anchor.reinstatedRevision > (subject.disciplineRevision ?? 0))) fail('probation.expulsions.references');
  }
  const creditedRelief = new Set<string>();
  const actualVillageReceipts = new Map(w.settlements.records.map((row) => [row.id, row]));
  for (const plan of w.probation.cases) {
    const serial = Number(plan.id.match(/^probation-([1-9][0-9]*)$/)?.[1]);
    const anchor = expulsions.get(plan.expulsionId);
    const admitted = plan.admittedTick;
    const settled = plan.settledTick;
    const live = activeProbation(plan.status);
    if (!Number.isSafeInteger(serial) || serial >= w.probation.nextId || !anchor || anchor.actorId !== plan.actorId ||
        anchor.sectId !== plan.sectId || plan.disciplineRevision < anchor.disciplineRevision ||
        plan.disciplineRevision > (w.cultivators.find(({ id }) => id === plan.actorId)?.disciplineRevision ?? 0) ||
        plan.requestedTick < anchor.tick ||
        plan.requestedTick > w.tick || plan.requestExpiresTick !== plan.requestedTick + PROBATION_REQUEST_TICKS ||
        plan.villageIds.length !== 2 || plan.villageIds[0] === plan.villageIds[1] || plan.villageIds.some((id) => !villagers.has(id)) ||
        (live ? settled !== undefined || plan.reason !== undefined :
          settled === undefined || settled < (admitted ?? plan.requestedTick) || settled > w.tick) ||
        (admitted === undefined ? plan.sponsorId !== undefined || plan.deadlineTick !== undefined || plan.relief.length > 0 || plan.reviews.length > 0 :
          !plan.sponsorId || plan.sponsorId === plan.actorId || !actor.has(plan.sponsorId) ||
          admitted < plan.requestedTick || admitted >= plan.requestExpiresTick || admitted > w.tick || plan.deadlineTick !== admitted + PROBATION_SERVICE_TICKS) ||
        (plan.status === 'requested' && admitted !== undefined) || (plan.status === 'active' && admitted === undefined) ||
        (plan.status === 'withdrawn' && plan.reason !== 'withdrawn') ||
        (plan.status === 'expired' && (plan.reason !== 'deadline' || (settled ?? 0) < (plan.deadlineTick ?? plan.requestExpiresTick))) ||
        (plan.status === 'rejected' && plan.reason !== 'review_oppose' && plan.reason !== 'unavailable' && plan.reason !== 'new_misconduct') ||
        (plan.status === 'reinstated' && (anchor.reinstatedTick !== settled || anchor.reinstatedRevision !== plan.disciplineRevision || plan.reason !== undefined)) ||
        ((plan.status === 'ready' || plan.status === 'reinstated') &&
          (plan.relief.length !== PROBATION_REQUIRED_RELIEF || plan.reviews.length !== PROBATION_REQUIRED_REVIEWS ||
            plan.reviews.some(({ vote }) => vote !== 'support')))) fail('probation.cases.references');
    unique(plan.relief, ({ tick }) => String(tick), 'probation.relief.tick');
    unique(plan.relief, ({ settlementId }) => settlementId, 'probation.relief.village');
    unique(plan.reviews, ({ reviewerId }) => reviewerId, 'probation.reviews.reviewer');
    for (const receipt of plan.relief) {
      const source = actualVillageReceipts.get(receipt.sourceId);
      if (creditedRelief.has(receipt.sourceId) || receipt.actorId !== plan.actorId ||
          receipt.sourceId !== `settlement-${receipt.tick}-relief-${receipt.settlementId}-${receipt.actorId}` ||
          !plan.villageIds.includes(receipt.settlementId) || receipt.stones !== SETTLEMENT_RELIEF.stones || receipt.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (source && (source.kind !== 'relief' || source.actorId !== receipt.actorId || source.tick !== receipt.tick ||
            source.settlementId !== receipt.settlementId || source.stones !== receipt.stones || source.herbs !== receipt.herbs)) ||
          receipt.tick <= (admitted ?? Infinity) || receipt.tick >= (plan.deadlineTick ?? 0) || receipt.tick > (settled ?? w.tick))
        fail('probation.relief.references');
      creditedRelief.add(receipt.sourceId);
    }
    const provedAt = Math.max(...plan.relief.map(({ tick }) => tick));
    if (plan.reviews.length && plan.relief.length !== PROBATION_REQUIRED_RELIEF) fail('probation.reviews.proof');
    for (const review of plan.reviews) {
      if (!actor.has(review.reviewerId) || review.reviewerId === plan.sponsorId || review.reviewerId === plan.actorId ||
          review.tick < provedAt || review.tick >= (plan.deadlineTick ?? 0) || review.tick > (settled ?? w.tick) ||
          (review.vote === 'oppose' && (plan.status !== 'rejected' || plan.reason !== 'review_oppose'))) fail('probation.reviews.references');
    }
  }
  unique(w.workshops.orders, ({ id }) => id, 'workshops.orders.id');
  const activeWorkshops = w.workshops.orders.filter(({ status }) => status === 'active');
  unique(activeWorkshops, ({ makerId }) => makerId, 'workshops.orders.activeMaker');
  unique(activeWorkshops, ({ siteId }) => siteId, 'workshops.orders.activeSite');
  const makerWorkTicks = new Set<string>();
  for (const order of w.workshops.orders) {
    const serial = Number(order.id.match(/^commission-([1-9][0-9]*)$/)?.[1]);
    const accepted = order.acceptedTick;
    const settled = order.settledTick;
    const live = order.status === 'offered' || order.status === 'active' || order.status === 'probate_hold';
    const terms = workshopTerms(order.tier, order.quantity);
    const effectiveQuantity = effectiveWorkshopQuantity(order);
    const effectiveDeadline = effectiveWorkshopDeadline(order);
    if (!Number.isSafeInteger(serial) || serial >= w.workshops.nextId || order.patronId === order.makerId ||
        !actor.has(order.patronId) || !actor.has(order.makerId) || (live && !locations.has(order.siteId)) ||
        order.offeredTick > w.tick || order.offerExpiresTick !== order.offeredTick + WORKSHOP_OFFER_TICKS ||
        (live && (settled !== undefined || order.closeReason !== undefined)) ||
        (!live && (settled === undefined || settled < (accepted ?? order.offeredTick) || settled > w.tick)) ||
        (order.status === 'completed' && (order.closeReason !== undefined || order.work.length !== effectiveQuantity * 2)) ||
        (order.status === 'declined' && (order.closeReason !== undefined || (settled ?? 0) >= order.offerExpiresTick)) ||
        (order.status === 'cancelled' && (order.closeReason === undefined || order.closeReason === 'offer_expired' || order.closeReason === 'work_expired')) ||
        (order.status === 'expired' && (accepted === undefined ?
          order.closeReason !== 'offer_expired' || (settled ?? 0) < order.offerExpiresTick :
          order.closeReason !== 'work_expired' || (settled ?? 0) < (effectiveDeadline ?? Infinity))) ||
        (order.status === 'active' && (accepted === undefined || order.work.length >= effectiveQuantity * 2)) ||
        ((order.status === 'offered' || order.status === 'declined') && accepted !== undefined) ||
        (accepted === undefined && (order.deadlineTick !== undefined || order.work.length !== 0 || order.status === 'completed')) ||
        (accepted !== undefined && (accepted < order.offeredTick || accepted >= order.offerExpiresTick || accepted > w.tick ||
          order.deadlineTick !== accepted + WORKSHOP_ACTIVE_TICKS)) ||
        (live && (order.refundedStones !== (order.capacityAmendment?.releasedStones ?? 0) ||
          order.refundedHerbs !== (order.capacityAmendment?.releasedHerbs ?? 0))) ||
        (!live && (order.escrowStones !== 0 || order.escrowHerbs !== 0))) fail('workshops.orders.references');
    let usedStones = 0;
    let usedHerbs = 0;
    let previousWorkTick = accepted ?? Infinity;
    for (const [index, receipt] of order.work.entries()) {
      const blank = index % 2 === 0;
      const piece = Math.floor(index / 2) + 1;
      const workKey = JSON.stringify([receipt.makerId, receipt.tick]);
      if (receipt.makerId !== order.makerId || makerWorkTicks.has(workKey) ||
          receipt.tick <= previousWorkTick || receipt.tick > w.tick || receipt.tick >= (effectiveDeadline ?? 0) ||
          (settled !== undefined && receipt.tick > settled) || receipt.piece !== piece || piece > effectiveQuantity ||
          receipt.stage !== (blank ? 'blank' : 'finish') || receipt.herbsUsed !== 1 ||
          receipt.stonesUsed !== (blank ? terms.blankFuel : terms.finishFuel)) fail('workshops.work.sequence');
      makerWorkTicks.add(workKey);
      previousWorkTick = receipt.tick;
      usedStones += receipt.stonesUsed;
      usedHerbs += receipt.herbsUsed;
      if (blank) {
        if (receipt.toolUse !== undefined || receipt.quality !== undefined || receipt.qualityScore !== undefined || receipt.artifactId !== undefined ||
            receipt.feePaid !== undefined) fail('workshops.work.blank');
      } else {
        const score = receipt.qualityScore;
        const grade = score === undefined ? undefined : workshopGradeForScore(score);
        const passed = grade === 'fine' || (grade === 'standard' && order.qualityFloor === 'standard');
        if (grade === undefined || grade !== receipt.quality ||
            (passed ? receipt.artifactId !== `workshop-artifact-${order.id}-${piece}` || receipt.feePaid !== terms.feePerPiece :
              receipt.artifactId !== undefined || (receipt.feePaid !== undefined && receipt.feePaid !== 0))) fail('workshops.work.quality');
        usedStones += receipt.feePaid ?? 0;
      }
    }
    if (order.escrowStones + order.refundedStones + usedStones !== (accepted === undefined ? 0 : terms.totalStones) ||
        order.escrowHerbs + order.refundedHerbs + usedHerbs !== (accepted === undefined ? 0 : terms.totalHerbs))
      fail('workshops.orders.custody');
  }
  validateWorkshopCapacityClauses(w,fail);
  validateWorkshopReleaseNegotiations(w,fail);
  validateWorkshopInstitutionHistory(w, actor, sector, locations, fail);
  const furnace = w.furnaceReservations;
  unique(furnace.reservations, ({ id }) => id, 'furnaceReservations.reservations.id');
  unique(furnace.uses, ({ siteId, tick, slot }) => JSON.stringify([siteId, tick, slot]), 'furnaceReservations.uses.siteTurn');
  unique(furnace.uses, ({ actorId, tick }) => JSON.stringify([actorId, tick]), 'furnaceReservations.uses.actorTurn');
  const activeFurnace = furnace.reservations.filter(({ status }) => status === 'queued' || status === 'reserved');
  unique(activeFurnace, ({ actorId }) => actorId, 'furnaceReservations.active.actor');
  unique(activeFurnace.filter(({ status }) => status === 'reserved'), ({ siteId, assignedTick, slot }) =>
    JSON.stringify([siteId, assignedTick, slot]), 'furnaceReservations.active.siteTurn');
  const furnaceById = new Map(furnace.reservations.map((row) => [row.id, row]));
  const furnaceSitesById = new Map(w.locations.map((site) => [site.id, site]));
  const workshopById = new Map(w.workshops.orders.map((order) => [order.id, order]));
  const furnaceActorsById = new Map(w.cultivators.map((person) => [person.id, person]));
  const usageByReservation = new Set<string>();
  for (const use of furnace.uses) {
    const reservation = use.reservationId ? furnaceById.get(use.reservationId) : undefined;
    const order = use.workshopOrderId ? workshopById.get(use.workshopOrderId) : undefined;
    if (!actor.has(use.actorId) || use.tick > w.tick || w.tick - use.tick >= FURNACE_USE_RETENTION_TICKS ||
        (use.kind === 'workshop') !== Boolean(use.workshopOrderId) ||
        (use.reservationId !== undefined && (!reservation || usageByReservation.has(use.reservationId) ||
          reservation.status !== 'used' || reservation.actorId !== use.actorId || reservation.siteId !== use.siteId ||
          reservation.assignedTick !== use.tick || reservation.slot !== use.slot ||
          reservation.workshopOrderId !== use.workshopOrderId)) ||
        (order && (order.makerId !== use.actorId || order.siteId !== use.siteId || !order.work.some(({ tick }) => tick === use.tick))))
      fail('furnaceReservations.uses.source');
    if (use.reservationId) usageByReservation.add(use.reservationId);
  }
  if (furnace.reservations.filter((row) => row.closedTick !== undefined && !usageByReservation.has(row.id)).length > FURNACE_TERMINAL_LIMIT)
    fail('furnaceReservations.reservations.history');
  for (const row of furnace.reservations) {
    const serial = Number(row.id.match(/^furnace-([1-9][0-9]*)$/)?.[1]);
    const site = furnaceSitesById.get(row.siteId);
    const order = row.workshopOrderId ? workshopById.get(row.workshopOrderId) : undefined;
    const maker = furnaceActorsById.get(row.actorId);
    const isActive = row.status === 'queued' || row.status === 'reserved';
    const assigned = row.assignedTick;
    if (!Number.isSafeInteger(serial) || serial >= furnace.nextId || !actor.has(row.actorId) ||
        row.requestedTick > w.tick || row.expiresTick !== row.requestedTick + FURNACE_QUEUE_TICKS + (row.suspendedTicks ?? 0) ||
        (row.suspendedTicks === undefined) !== (row.lastSuspendedTick === undefined) ||
        (row.lastSuspendedTick !== undefined && (row.lastSuspendedTick > (row.closedTick ?? w.tick) ||
          row.lastSuspendedTick < row.requestedTick + (row.suspendedTicks ?? 0) ||
          (assigned !== undefined && row.lastSuspendedTick >= assigned))) ||
        (assigned === undefined) !== (row.slot === undefined) ||
        (assigned !== undefined && (assigned <= row.requestedTick || assigned >= row.expiresTick || assigned > w.tick)) ||
        (isActive && (!site?.furnaceGrade || !maker?.alive || maker.hp <= 0 || maker.locationId !== row.siteId ||
          row.expiresTick <= w.tick || row.closedTick !== undefined || row.reason !== undefined ||
          (row.status === 'queued' ? assigned !== undefined : assigned !== w.tick || (row.slot ?? 0) > site.furnaceGrade))) ||
        (!isActive && (row.closedTick === undefined || row.closedTick < (assigned ?? row.requestedTick) || row.closedTick > w.tick)) ||
        (row.status === 'used' && (assigned === undefined || row.closedTick !== assigned || row.reason !== undefined ||
          (w.tick - assigned < FURNACE_USE_RETENTION_TICKS && !usageByReservation.has(row.id)))) ||
        (row.status === 'cancelled' && (!row.reason || row.reason === 'queue_expired' || row.reason === 'turn_missed')) ||
        (row.status === 'expired' && (row.reason !== 'queue_expired' && row.reason !== 'turn_missed')) ||
        (row.reason === 'queue_expired' && (assigned !== undefined || (row.closedTick ?? 0) < row.expiresTick)) ||
        (row.reason === 'turn_missed' && (assigned === undefined || (row.closedTick ?? 0) < assigned)) ||
        (isActive && row.workshopOrderId && (!order || order.status !== 'active')) ||
        (order && (order.makerId !== row.actorId || order.siteId !== row.siteId)))
      fail('furnaceReservations.reservations.source');
  }
  validateSparringRelationships(w, actor, locations, fail);
  validateExpeditionRescueRelationships(w, actor, fail);
  validateShortShiftRelationships(w, actor, sector, fail);
  validateBoundaryReliefRelationships(w, actor, sector, fail);
  validateApprenticeCohortRelationships(w, actor, sector, locations, fail);
  validateHouseholdNameRelationships(w, actor, fail);
  validateCaravanRestitutionRelationships(w, actor, fail);
  validateSeedCultureHistory(w, actor, fail);
  validateSectStipendHistory(w, actor, fail);
  validateVillageFairHistory(w, actor, fail);
  validateCivicMemorialHistory(w, actor, fail);
  validatePavilionLoanHistory(w, actor, sector, fail);
  validateRouteWarningHistory(w, actor, fail);
  validateVillageSupplyHistory(w, actor, fail);
  validateVillageGranaryRelationships(w, actor, fail);
  validateFurnaceSafetyRelationships(w, actor, sector, fail);
  validateDamageAssuranceHistory(w, actor, fail);
  let previousFlowTick = -1;
  let previousFlowId = 0;
  validateCraftTraining(w,fail);
  for (const book of w.resourceFlow.months) {
    if (book.tick <= previousFlowTick || book.tick > w.tick || (book.tick === w.tick && (book.year !== w.year || book.month !== w.month)) ||
        book.entries.length !== Math.min(book.totalEntries, RESOURCE_FLOW_DETAIL_LIMIT)) fail('resourceFlow.months.window');
    previousFlowTick = book.tick;
    unique(book.totals, ({ good }) => good, 'resourceFlow.months.totals');
    const recorded = new Map(book.totals.map(({ good }) => [good, { transfer:0, production:0, consumption:0, loss:0 }]));
    for (const entry of book.entries) {
      if (entry.id <= previousFlowId || entry.id >= w.resourceFlow.nextId || entry.tick !== book.tick || entry.amount <= 0 ||
          !RESOURCE_FLOW_REASON.test(entry.reason)) fail('resourceFlow.entries.reference');
      previousFlowId = entry.id;
      const hasFrom = 'from' in entry && !!entry.from;
      const hasTo = 'to' in entry && !!entry.to;
      if (hasFrom !== (entry.kind !== 'production') || hasTo !== (entry.kind === 'transfer' || entry.kind === 'production'))
        fail('resourceFlow.entries.endpoints');
      if (entry.kind === 'transfer' && sameFlowAccount(entry.from, entry.to)) fail('resourceFlow.entries.sameEndpoint');
      const accounts = [...('from' in entry ? [entry.from] : []), ...('to' in entry ? [entry.to] : [])];
      for (const account of accounts) {
        if (!account || (account.kind === 'oath') !== ('pocket' in account)) fail('resourceFlow.entries.account');
      }
      const scope = entry.visibility;
      if (scope.kind === 'observer' && ('siteIds' in scope || 'actorIds' in scope)) fail('resourceFlow.entries.scope');
      if (scope.kind === 'participants') {
        if ('siteIds' in scope || !scope.actorIds.length) fail('resourceFlow.entries.scope');
        unique([...scope.actorIds], (value) => value, 'resourceFlow.entries.participants');
      }
      if (scope.kind === 'known_sites') {
        if ('actorIds' in scope || !scope.siteIds.length) fail('resourceFlow.entries.scope');
        unique([...scope.siteIds], (value) => value, 'resourceFlow.entries.sites');
      }
      const total = recorded.get(entry.good);
      if (!total) fail('resourceFlow.entries.unaccounted');
      else total[entry.kind] += entry.amount;
    }
    for (const total of book.totals) {
      const stored = recorded.get(total.good)!;
      if (!(total.transfer > 0 || total.production > 0 || total.consumption > 0 || total.loss > 0)) fail('resourceFlow.totals.empty');
      for (const kind of ['transfer','production','consumption','loss'] as const) {
        const precision = Math.max(1, total[kind], stored[kind]) * 1e-10;
        if (stored[kind] - total[kind] > precision ||
            (book.totalEntries === book.entries.length && Math.abs(stored[kind] - total[kind]) > precision)) fail('resourceFlow.totals.accounting');
      }
    }
  }
  unique(w.sharedCommons.pacts, ({ id }) => id, 'sharedCommons.pacts.id');
  unique(w.sharedCommons.pacts.filter(({ status }) => status !== 'closed'), ({ siteId }) => siteId, 'sharedCommons.openSite');
  for (const pact of w.sharedCommons.pacts) {
    const serial = Number(pact.id.match(/^shared-commons-([1-9][0-9]*)$/)?.[1]);
    unique(pact.parties, ({ sectId }) => sectId, 'sharedCommons.parties.sect');
    const parties = new Map(pact.parties.map((party) => [party.sectId, party]));
    unique(pact.parties, ({ signerId }) => signerId, 'sharedCommons.parties.signer');
    const proposer = parties.get(pact.proposerSectId);
    const activated = pact.activatedTick;
    const start = pact.startsTick;
    const end = pact.endsTick;
    if (!Number.isSafeInteger(serial) || serial >= w.sharedCommons.nextId || pact.parties.length !== 3 ||
        pact.openedTick > w.tick || pact.offerExpiresTick !== pact.openedTick + COMMONS_OFFER_TICKS ||
        !proposer || proposer.signedTick !== pact.openedTick || proposer.share !== 2 ||
        pact.parties.some((party) => !sector.has(party.sectId) || !actor.has(party.signerId) ||
          (party.sectId !== pact.proposerSectId && party.share !== 1) ||
          (party.signedTick !== undefined && (party.signedTick < pact.openedTick || party.signedTick >= pact.offerExpiresTick || party.signedTick > w.tick)))) fail('sharedCommons.pacts.parties');
    if (activated === undefined) {
      if (pact.status === 'active' || start !== undefined || end !== undefined || pact.rounds.length ||
          pact.parties.every(({ signedTick }) => signedTick !== undefined)) fail('sharedCommons.pacts.notActivated');
    } else if (pact.status === 'offered' || activated > w.tick || activated >= pact.offerExpiresTick ||
        start !== activated + 1 || end !== start + COMMONS_TERM_TICKS ||
        pact.parties.some(({ signedTick }) => signedTick === undefined || signedTick > activated) ||
        !pact.parties.some(({ signedTick }) => signedTick === activated)) fail('sharedCommons.pacts.activation');
    if (pact.status === 'closed') {
      if (pact.settledTick === undefined || !pact.closeReason || pact.settledTick > w.tick ||
          pact.settledTick < (activated ?? pact.openedTick) ||
          (pact.closeReason === 'offer_expiry' && (activated !== undefined || pact.settledTick < pact.offerExpiresTick)) ||
          (pact.closeReason === 'term_complete' && (end === undefined || pact.settledTick < end))) fail('sharedCommons.pacts.settlement');
    } else if (pact.settledTick !== undefined || pact.closeReason !== undefined || !locations.has(pact.siteId)) fail('sharedCommons.pacts.live');
    let previousRoundIndex = -1;
    for (const round of pact.rounds) {
      const allocated = unique(round.allocations, ({ sectId }) => sectId, 'sharedCommons.allocations.sect');
      unique(round.harvests, ({ tick, actorId }) => JSON.stringify([tick, actorId]), 'sharedCommons.harvests.oneTurn');
      const roundIndex = (round.startTick - (start ?? Infinity)) / COMMONS_ROUND_TICKS;
      if (!Number.isSafeInteger(roundIndex) || roundIndex <= previousRoundIndex || roundIndex >= COMMONS_TERM_TICKS / COMMONS_ROUND_TICKS ||
          round.startTick > w.tick || (pact.settledTick !== undefined && round.startTick > pact.settledTick) ||
          round.endsTick !== round.startTick + COMMONS_ROUND_TICKS || round.allocations.length !== 3 || round.reserved > round.stockAtOpen ||
          round.allocations.reduce((sum, row) => sum + row.quota, 0) !== round.reserved) fail('sharedCommons.rounds.window');
      previousRoundIndex = roundIndex;
      const shares = commonsQuotaShares(round.stockAtOpen, pact.parties, roundIndex);
      const entitled = new Map(pact.parties.map(({ sectId }, index) => [sectId, shares[index]]));
      const used = new Map<string, number>();
      for (const harvest of round.harvests) {
        if (!actor.has(harvest.actorId) || !allocated.has(harvest.sectId) || harvest.tick < round.startTick ||
            harvest.tick >= round.endsTick || harvest.tick > w.tick ||
            (pact.settledTick !== undefined && harvest.tick > pact.settledTick)) fail('sharedCommons.harvests.references');
        used.set(harvest.sectId, (used.get(harvest.sectId) ?? 0) + harvest.units);
      }
      for (const entry of round.allocations) {
        const signed = parties.get(entry.sectId);
        if (!signed || entry.maintenanceDue !== signed.share * COMMONS_MAINTENANCE_UNIT ||
            (entry.maintenancePaid !== 0 && entry.maintenancePaid !== entry.maintenanceDue) ||
            entry.quota !== (entry.maintenancePaid === 0 ? 0 : entitled.get(entry.sectId)) || entry.used > entry.quota ||
            entry.used !== (used.get(entry.sectId) ?? 0)) fail('sharedCommons.allocations.accounting');
      }
    }
  }
  unique(w.serviceRetirement.history, ({ id }) => id, 'serviceRetirement.history.id');
  unique(w.serviceRetirement.history, ({ actorId, tick }) => JSON.stringify([actorId, tick]), 'serviceRetirement.history.action');
  const lastService = new Map<string, typeof w.serviceRetirement.history[number]>();
  for (const entry of w.serviceRetirement.history) {
    const serial = Number(entry.id.match(/^service-record-([1-9][0-9]*)$/)?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.serviceRetirement.nextId || !actor.has(entry.actorId) ||
        !sector.has(entry.sectId) || entry.tick > w.tick ||
        (entry.kind === 'return' && (entry.leaderReleased || entry.forumReleased || entry.guardLocationId ||
          entry.stewardSchoolIds.length || entry.infirmaryShiftIds.length))) fail('serviceRetirement.history.references');
    unique(entry.stewardSchoolIds, (id) => id, 'serviceRetirement.history.school');
    unique(entry.infirmaryShiftIds, (id) => id, 'serviceRetirement.history.shift');
    const previous = lastService.get(entry.actorId);
    if (!previous || entry.tick > previous.tick) lastService.set(entry.actorId, entry);
  }
  for (const person of w.cultivators) {
    const stamp = person.service;
    const latest = lastService.get(person.id);
    if (!stamp) {
      if (latest) fail('serviceRetirement.current.missing');
      continue;
    }
    if (!sector.has(stamp.formerSectId) || stamp.changedTick > w.tick ||
        (stamp.status === 'retired' ? stamp.changedTick !== stamp.retiredTick || !!person.guardAssignment ||
          w.sects.some(({ leaderId }) => leaderId === person.id) :
          stamp.changedTick < stamp.retiredTick + SERVICE_RETIREMENT_MIN_TICKS) ||
        (latest && (latest.tick !== stamp.changedTick ||
          latest.kind !== (isRetiredFromService(person) ? 'retire' : 'return') || latest.formerRank !== stamp.formerRank))) fail('serviceRetirement.current.references');
  }
  unique(w.couriers.dispatches, ({ id }) => id, 'couriers.dispatches.id');
  unique(w.couriers.dispatches.filter(({ status }) => status === 'in_transit' || status === 'returning'),
    ({ courierId }) => courierId, 'couriers.dispatches.active_courier');
  return villagers;
}

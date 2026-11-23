import { validateProtagonistFlightHistory } from '../storageProtagonistFlightValidation';
import { validateExpeditionDungeonHistory } from '../storageExpeditionDungeonValidation';
import { validateTournamentArenaHistory } from '../storageTournamentArenaValidation';
import { validatePublicAlchemyPractice } from '../storagePublicAlchemyValidation';
import { validateHeavenlyAlchemyHistory } from '../storageHeavenlyAlchemyValidation';
import { validateDaoPathHistory } from '../storageDaoPathValidation';
import { validateImmortalAuctionHistory } from '../storageImmortalAuctionValidation';
import { validateTianjiGazetteHistory } from '../storageTianjiGazetteValidation';
import { validateCultivationClanHistory } from '../storageCultivationClanValidation';
import { validateAscensionHistory } from '../storageAscensionValidation';
import { validateRingAudienceHistory } from '../storageRingAudienceValidation';
import { validateDramaticBondHistory } from '../storageDramaticBondValidation';
import { validateMarketFreight } from '../storageMarketFreightValidation';
import { validateEraHistory } from '../storageEraHistoryValidation';
import { validateSeasonalHousing } from '../storageSeasonalHousingValidation';
import { validateMentorTransfers } from '../storageMentorTransferValidation';
import { validateAuthoredEraHistory } from '../storageAuthoredEraValidation';
import { validateRegionalSimulation } from '../storageRegionalSimulationValidation';
import { validateRegionalPromotions } from '../storageRegionalPromotionValidation';
import { validateEraHeritage } from '../storageEraHeritageValidation';
import { validateColdWaterVein } from '../storageColdWaterVeinValidation';
import { validateNorthMiningCharters } from '../storageNorthMiningCharterValidation';
import { validateNorthWellRevisit } from '../storageNorthWellRevisitValidation';
import { validateUpperPassage } from '../storageUpperPassageValidation';
import { validateNorthGateRenewal } from '../storageNorthGateRenewalValidation';
import { validateUpperArrayFieldMovement } from '../storageUpperArrayFieldMovementValidation';
import { validateWitnessedPersonalStory } from '../storageWitnessedPersonalStoryValidation';
import { validateProtagonistHistory } from '../storageProtagonistValidation';
import { validateScribeCommissions } from '../storageScribeCommissionValidation';
import { COLD_HISTORY_MIN_AGE_TICKS } from '../coldHistoryEngine';
import { ESCORT_FEE, ESCORT_RATIONS } from '../escortEngine';
import { MORTAL_MATURITY_TICKS } from '../reincarnationEngine';
import { OATH_TERMS } from '../oathEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateContinuity(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
  locations: ReadonlySet<string>,
  map: ReadonlySet<string>,
  settlementIds: ReadonlySet<string>,
  volunteerIds: ReadonlySet<string>,
): void {
  const deceasedActors = new Set(w.cultivators.filter(({ alive, hp }) => !alive && hp === 0).map(({ id }) => id));
  unique(w.reincarnation.cases, ({ id }) => id, 'reincarnation.cases.id');
  unique(w.reincarnation.cases, ({ deceasedId }) => deceasedId, 'reincarnation.cases.deceased');
  const registeredCases = new Set<string>();
  const reservedBirths = new Set<string>();
  const reborn = new Set<string>();
  for (const row of w.reincarnation.cases) {
    const hasBirth = row.settlementId !== undefined || row.birthTick !== undefined ||
      row.maturesTick !== undefined || row.birthSlot !== undefined;
    if (!deceasedActors.has(row.deceasedId) || row.deathTick > w.tick || row.expiresTick <= row.deathTick ||
        ((row.status === 'recruited' || row.status === 'expired') !== (row.resolvedTick !== undefined)) ||
        (row.resolvedTick !== undefined && (row.resolvedTick < row.deathTick || row.resolvedTick > w.tick)) ||
        (row.status === 'awaiting_birth' && (hasBirth || row.volunteerId || row.newActorId)) ||
        ((row.status === 'reserved' || row.status === 'volunteer' || row.status === 'recruited') && !hasBirth) ||
        ((row.status === 'volunteer' || row.status === 'recruited') && !row.volunteerId) ||
        (row.status === 'reserved' && row.volunteerId) ||
        (row.volunteerId !== undefined && (!hasBirth || row.maturesTick === undefined || row.maturesTick > w.tick)) ||
        ((row.status === 'recruited') !== (row.newActorId !== undefined))) fail('reincarnation.cases.references');
    if (hasBirth) {
      if (!row.settlementId || !settlementIds.has(row.settlementId) || row.birthTick === undefined ||
          row.birthTick <= row.deathTick || row.birthTick > row.expiresTick || row.birthTick > w.tick ||
          row.maturesTick !== row.birthTick + MORTAL_MATURITY_TICKS || row.birthSlot === undefined) fail('reincarnation.cases.birth');
      const birthKey = JSON.stringify([row.settlementId, row.birthTick, row.birthSlot]);
      if (reservedBirths.has(birthKey)) fail('reincarnation.cases.birth');
      reservedBirths.add(birthKey);
    }
    if (row.volunteerId) {
      if (registeredCases.has(row.volunteerId) ||
          (row.status === 'volunteer' && !volunteerIds.has(row.volunteerId))) fail('reincarnation.cases.volunteer');
      registeredCases.add(row.volunteerId);
    }
    if (row.newActorId) {
      if (!actor.has(row.newActorId) || row.newActorId === row.deceasedId || row.newActorId !== `recruit-${row.volunteerId}` ||
          reborn.has(row.newActorId)) fail('reincarnation.cases.recruit');
      reborn.add(row.newActorId);
    }
  }
  unique(w.reincarnation.echoes, ({ actorId }) => actorId, 'reincarnation.echoes.actor');
  for (const row of w.reincarnation.echoes) if (!actor.has(row.actorId) || row.receivedTick > w.tick ||
      ((row.status === 'unconsidered') !== (row.resolvedTick === undefined)) ||
      (row.resolvedTick !== undefined && (row.resolvedTick < row.receivedTick || row.resolvedTick > w.tick))) fail('reincarnation.echoes.references');
  const marketLocations = new Set(w.locations.filter(({type}) => type === 'market').map(({id}) => id));
  const marketOrders = unique(w.markets.orders, ({id}) => id, 'markets.orders.id');
  unique(w.markets.shipments, ({id}) => id, 'markets.shipments.id');
  unique(w.markets.receipts, ({id}) => id, 'markets.receipts.id');
  for (const order of w.markets.orders) {
    if (!actor.has(order.actorId) || (order.status === 'open' && !marketLocations.has(order.locationId)) ||
        order.remaining > order.quantity || order.expiresTick <= order.placedTick ||
        order.escrowStones !== (order.status === 'open' && order.side === 'buy' ? order.remaining * order.limitPrice : 0) ||
        order.escrowGoods !== (order.status === 'open' && order.side === 'sell' ? order.remaining : 0)) fail('markets.orders.references');
  }
  for (const shipment of w.markets.shipments) {
    if (!actor.has(shipment.buyerId) || !actor.has(shipment.sellerId) || shipment.buyerId === shipment.sellerId ||
        shipment.originId === shipment.destinationId || shipment.arrivalTick <= shipment.departedTick ||
        (shipment.status === 'in_transit' && (!marketOrders.has(shipment.buyOrderId) || !marketOrders.has(shipment.sellOrderId)))) fail('markets.shipments.references');
  }
  const escortContractById = new Map(w.escorts.contracts.map((contract) => [contract.id, contract]));
  const shipmentById = new Map(w.markets.shipments.map((shipment) => [shipment.id, shipment]));
  unique(w.escorts.contracts, ({ id }) => id, 'escorts.contracts.id');
  unique(w.escorts.contracts, ({ shipmentId }) => shipmentId, 'escorts.contracts.shipment');
  unique(w.escorts.contracts.filter(({ status }) => status === 'active'), ({ escortId }) => escortId ?? '', 'escorts.contracts.active_actor');
  unique(w.escorts.reports, ({ id }) => id, 'escorts.reports.id');
  for (const contract of w.escorts.contracts) {
    if((contract.freight!==undefined)!==/^freight-escort-[1-9][0-9]*$/u.test(contract.id))
      fail('escorts.freight.protocol');
    const shipment = shipmentById.get(contract.shipmentId);
    const activeContract = contract.status === 'offered' || contract.status === 'active';
    unique(contract.usedReportIds, (id) => id, 'escorts.contracts.used_reports');
    unique(contract.detours, ({ reportId }) => reportId, 'escorts.contracts.detours');
    if (!actor.has(contract.clientId) || contract.originId === contract.destinationId ||
        (contract.escortId !== undefined && (!actor.has(contract.escortId) || contract.escortId === contract.clientId)) ||
        (shipment && (shipment.sellerId !== contract.clientId || shipment.originId !== contract.originId || shipment.destinationId !== contract.destinationId)) ||
        (activeContract && (!shipment || shipment.status !== 'in_transit' || !locations.has(contract.originId) || !locations.has(contract.destinationId))) ||
        contract.offeredTick > w.tick || contract.expiresTick <= contract.offeredTick ||
        (contract.acceptedTick !== undefined && (contract.acceptedTick < contract.offeredTick || contract.acceptedTick > w.tick ||
          contract.acceptedTick > contract.expiresTick)) ||
        ((contract.escortId !== undefined) !== (contract.acceptedTick !== undefined)) ||
        (contract.status === 'active' && (contract.acceptedTick === undefined || contract.path.length < 2 || contract.stride <= 0)) ||
        (contract.pathIndex >= Math.max(1,contract.path.length)) ||
        (contract.arrivedTick !== undefined && (contract.arrivedTick > w.tick || contract.pathIndex !== contract.path.length - 1)) ||
        (contract.holdAppliedTick !== undefined && (contract.holdAppliedTick < contract.offeredTick || contract.holdAppliedTick > w.tick)) ||
        (contract.lastAdvancedTick !== undefined && (contract.lastAdvancedTick < (contract.acceptedTick ?? contract.offeredTick) || contract.lastAdvancedTick > w.tick)) ||
        (activeContract === (contract.settledTick !== undefined)) ||
        (contract.settledTick !== undefined && (contract.settledTick < contract.offeredTick || contract.settledTick > w.tick)) ||
        contract.lastCrossedTileIds.some((id) => !map.has(id)) ||
        contract.detours.some((data) => !contract.usedReportIds.includes(data.reportId) || data.tick > w.tick || data.tick < (contract.acceptedTick ?? contract.offeredTick))) {
      fail('escorts.contracts.references');
    }
    if (!contract.freight && (contract.feeEscrow + contract.feePaid + contract.feeRefunded !== ESCORT_FEE ||
        contract.rationsEscrow + contract.rationsSpent + contract.rationsReturned !== (contract.acceptedTick !== undefined ? ESCORT_RATIONS : 0) ||
        (activeContract ? (contract.feeEscrow !== ESCORT_FEE || contract.feePaid !== 0 || contract.feeRefunded !== 0)
          : (contract.feeEscrow !== 0 || contract.rationsEscrow !== 0)) ||
        (contract.status === 'delivered' && (contract.feePaid !== ESCORT_FEE || contract.acceptedTick === undefined)) ||
        ((contract.status === 'failed' || contract.status === 'expired') && contract.feeRefunded !== ESCORT_FEE))) fail('escorts.contracts.escrow');
  }
  for (const report of w.escorts.reports) {
    if (!escortContractById.has(report.contractId) || !actor.has(report.reporterId) || !map.has(report.tileId) ||
        report.observedTick > w.tick || report.expiresTick <= report.observedTick) fail('escorts.reports.references');
  }
  for (const receipt of w.markets.receipts) {
    if (!actor.has(receipt.buyerId) || !actor.has(receipt.sellerId) || receipt.buyerId === receipt.sellerId) fail('markets.receipts.references');
  }
  validateMarketFreight(w,fail);
  unique(w.oaths.contracts, ({ id }) => id, 'oaths.contracts.id');
  for (const oath of w.oaths.contracts) {
    const terms = OATH_TERMS[oath.term];
    const pendingEscrow = oath.settledTick === undefined && (oath.status === 'active' || oath.status === 'breached');
    const next = Number(oath.id.split('-').at(-1));
    if (!/^oath-[1-9]\d*$/.test(oath.id) || !Number.isSafeInteger(next) || next >= w.oaths.nextId ||
        !actor.has(oath.requesterId) || !actor.has(oath.providerId) || oath.requesterId === oath.providerId ||
        oath.payment !== terms.payment || oath.collateral !== terms.collateral || oath.quantity !== terms.quantity ||
        oath.escrow.payment !== (pendingEscrow ? terms.payment : 0) || oath.escrow.collateral !== (pendingEscrow ? terms.collateral : 0) ||
        ((oath.status === 'offered' || pendingEscrow) && !locations.has(oath.locationId)) ||
        (oath.appeal && oath.appeal.appellantId !== oath.providerId) ||
        oath.evidence.some((row) => row.actorId !== oath.providerId || row.locationId !== oath.locationId ||
          row.quantity !== oath.quantity || row.tick > w.tick)) fail('oaths.references');
  }
  validateMentorTransfers(w, actor, fail);
  validateSeasonalHousing(w, actor, fail);
  unique(w.mentorship.offers, ({ id }) => id, 'mentorship.offers.id');
  for (const record of [...w.mentorship.offers, ...w.mentorship.lineage]) {
    if (!actor.has(record.mentorId) || !actor.has(record.studentId) || record.mentorId === record.studentId) fail('mentorship.references');
  }
  if (w.mentorship.budgets.some(({ mentorId }) => !actor.has(mentorId))) fail('mentorship.budgets.references');
  unique(w.mentorship.budgets, ({ mentorId, tick }) => `${mentorId}:${tick}`, 'mentorship.budgets.key');
  unique(w.mentorship.lineage, ({ studentId }) => studentId, 'mentorship.lineage.student');
  const parents = new Map(w.mentorship.lineage.map(({ studentId, mentorId }) => [studentId, mentorId]));
  for (const student of parents.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = student;
    while (cursor) {
      if (visited.has(cursor)) fail('mentorship.lineage.cycle');
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
  }
  for (const council of w.councils) if (!sector.has(council.sectId) || council.voterIds.some((id) => !actor.has(id))) fail('councils.references');
  const chapters = [...w.chronicleArchive.chapters, ...w.coldHistory.chapters];
  unique(chapters, ({ id }) => id, 'coldHistory.chapters.id');
  unique(chapters, ({ chapterNumber }) => String(chapterNumber), 'coldHistory.chapters.number');
  const latestHot = w.chronicleArchive.chapters.reduce((latest, { chapterNumber }) => Math.max(latest, chapterNumber), 0);
  if (w.coldHistory.chapters.some((row) => row.endTick > w.tick - COLD_HISTORY_MIN_AGE_TICKS || row.chapterNumber >= latestHot)) {
    fail('coldHistory.chapters.age');
  }
  for (const chapter of chapters) {
    const anchors = unique(chapter.anchors, ({ id }) => id, 'coldHistory.chapters.anchor');
    if (chapter.chapterNumber < 1 || chapter.startTick < 1 || chapter.startTick > chapter.endTick || chapter.endTick > w.tick ||
        chapter.anchors.some(({ tick: at }) => at < chapter.startTick || at > chapter.endTick) ||
        chapter.biographies.some((entry) => entry.anchorIds.some((id) => !anchors.has(id)))) fail('coldHistory.chapters.references');
  }
  validateProtagonistHistory(w,chapters,actor,fail);
  validateProtagonistFlightHistory(w,fail);
  validateWitnessedPersonalStory(w,actor,fail);
  validateDramaticBondHistory(w,fail);
  validateRingAudienceHistory(w,fail);
  validatePublicAlchemyPractice(w,fail);
  validateHeavenlyAlchemyHistory(w,fail);
  validateDaoPathHistory(w,fail);
  validateImmortalAuctionHistory(w,fail);
  validateTournamentArenaHistory(w,fail);
  validateTianjiGazetteHistory(w,fail);
  validateCultivationClanHistory(w,fail);
  validateAscensionHistory(w,fail);
  validateExpeditionDungeonHistory(w,fail);
  validateEraHistory(w,fail);
  validateAuthoredEraHistory(w,fail);
  validateRegionalSimulation(w,fail);
  validateRegionalPromotions(w,fail);
  validateEraHeritage(w,fail);
  validateScribeCommissions(w,fail);
  validateColdWaterVein(w,fail);
  validateNorthMiningCharters(w,fail);
  validateNorthWellRevisit(w,fail);
  validateNorthGateRenewal(w,fail);
  validateUpperPassage(w,fail);
  validateUpperArrayFieldMovement(w,fail);
}

import { availableMarketFreightActions } from '../escortEngine';
import { availableDisasterShelterActions } from '../disasterShelterEngine';
import { availableCraftTrainingActions } from '../craftTrainingEngine';
import { availableWaypostMealActions } from '../waypostMealEngine';
import { availableWorkshopEstateActions, availableWorkshopReleaseActions } from '../workshopEngine';
import { validateWorkshopEstateContinuations } from '../storageWorkshopEstateValidation';
import { findNorthGateRenewalSource, northGateRenewalForSource } from '../northGateRenewalTerms';
import { UPPER_PASSAGE_PATH } from '../upperPassageTerms';
import { availableUpperArrayFieldActions, upperArrayFieldOptionKey } from '../upperArrayFieldActions';
import { onUpperPassagePlane } from '../upperPassageIsolation';
import { availableFrontierActions, frontierOptionKey } from '../frontierActions';
import { validateExpeditionOmenHistory } from '../storageExpeditionOmenValidation';
import { availableCivicMemorialActions } from '../civicMemorialEngine';
import { availableScribeCommissionActions } from '../scribeCommissionEngine';
import { CEASEFIRE_AID_DELAY, CEASEFIRE_BOND, CEASEFIRE_DURATION, CEASEFIRE_OFFER_TICKS } from '../ceasefireEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validatePoliticalGovernance(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
  locations: ReadonlySet<string>,
  map: ReadonlySet<string>,
  value: unknown,
): void {
  const liveAgreements = w.ceasefires.agreements.filter(({ status }) => status === 'offered' || status === 'active');
  const pairKey = (a: string, b: string) => JSON.stringify([a,b].sort());
  unique(liveAgreements, (item) => pairKey(item.proposerSectId, item.targetSectId), 'ceasefires.active.pair');
  const siegeById = new Map(w.sieges.map((siege) => [siege.id, siege]));
  for (const agreement of w.ceasefires.agreements) {
    const { terms, escrow } = agreement;
    const pair = new Set([agreement.proposerSectId, agreement.targetSectId]);
    const signed = agreement.status === 'active' || agreement.status === 'fulfilled' || agreement.status === 'breached';
    const resolved = agreement.status !== 'offered' && agreement.status !== 'active';
    const serial = Number(agreement.id.match(/^ceasefire-([1-9][0-9]*)$/)?.[1]);
    unique(agreement.withdrawnSiegeIds, (id) => id, 'ceasefires.withdrawal.ids');
    if (!Number.isSafeInteger(serial) || serial >= w.ceasefires.nextId || pair.size !== 2 ||
        [...pair].some((id) => !sector.has(id)) || !actor.has(agreement.proposerId) || !actor.has(agreement.targetLeaderId) ||
        agreement.proposerId === agreement.targetLeaderId || agreement.openedTick > w.tick || agreement.offerExpiresTick !== agreement.openedTick + CEASEFIRE_OFFER_TICKS ||
        !pair.has(terms.aidPayerSectId) || !pair.has(terms.aidRecipientSectId) || terms.aidPayerSectId === terms.aidRecipientSectId ||
        signed !== (agreement.signedTick !== undefined) || signed !== (agreement.endsTick !== undefined) ||
        (agreement.signedTick !== undefined && (agreement.signedTick < agreement.openedTick || agreement.signedTick > w.tick ||
          agreement.signedTick > agreement.offerExpiresTick || agreement.endsTick !== agreement.signedTick + terms.duration)) ||
        (agreement.aidReleasedTick !== undefined && (agreement.signedTick === undefined || agreement.endsTick === undefined ||
          agreement.aidReleasedTick < agreement.signedTick + CEASEFIRE_AID_DELAY || agreement.aidReleasedTick > w.tick ||
          (agreement.settledTick !== undefined && agreement.aidReleasedTick > agreement.settledTick))) ||
        (resolved !== (agreement.settledTick !== undefined)) ||
        (agreement.settledTick !== undefined && (agreement.settledTick < (agreement.signedTick ?? agreement.openedTick) || agreement.settledTick > w.tick)) ||
        (agreement.status === 'breached') !== (agreement.breach !== undefined) ||
        (agreement.breach !== undefined && (!pair.has(agreement.breach.offenderSectId) || agreement.breach.tick !== agreement.settledTick ||
          agreement.breach.forfeitedBond !== terms.bondPerSide)) ||
        (!signed && agreement.withdrawnSiegeIds.length > 0) ||
        agreement.withdrawnSiegeIds.some((id) => {
          const siege = siegeById.get(id);
          return siege && (siege.status !== 'withdrawn' || pairKey(siege.attackerSectId, siege.defenderSectId) !== pairKey(agreement.proposerSectId, agreement.targetSectId));
        })) fail('ceasefires.references');
    if (terms.duration !== CEASEFIRE_DURATION || terms.bondPerSide !== CEASEFIRE_BOND || terms.aidAmount < 30 || terms.aidAmount > 120 ||
        (agreement.status === 'active' ? (escrow.proposerBond !== terms.bondPerSide || escrow.targetBond !== terms.bondPerSide ||
          escrow.aid !== (agreement.aidReleasedTick === undefined ? terms.aidAmount : 0))
          : (escrow.proposerBond !== 0 || escrow.targetBond !== 0 || escrow.aid !== 0))) fail('ceasefires.escrow');
  }
  unique(w.occasions, ({ id }) => id, 'occasions.id');
  validateExpeditionOmenHistory(w, actor, fail);
  unique(w.bounties, ({ id }) => id, 'bounties.id');
  unique(w.mapHazards, ({ id }) => id, 'mapHazards.id'); unique(w.spiritBeasts, ({ id }) => id, 'spiritBeasts.id');
  for (const item of w.mapHazards) if (!map.has(item.tileId) || item.expiresTick <= item.createdTick) fail('mapHazards.references');
  for (const beast of w.spiritBeasts) if ((beast.alive && !locations.has(beast.locationId)) || beast.hp > beast.maxHp ||
      (beast.tamedBy && !actor.has(beast.tamedBy))) fail('spiritBeasts.references');
  if ((w.playerAvatar.possessedId && !actor.has(w.playerAvatar.possessedId)) ||
      (w.playerAvatar.pendingOrder && w.playerAvatar.pendingOrder.actorId !== w.playerAvatar.possessedId) ||
      w.playerAvatar.transcript.some((entry) => !actor.has(entry.targetCultivatorId) || (entry.actorId && !actor.has(entry.actorId)))) fail('playerAvatar.references');
  const localWaterOrder=w.playerAvatar.pendingOrder;
  if(localWaterOrder?.action==='FRONTIER'||localWaterOrder?.action==='FRONTIER_PRODUCTION'||localWaterOrder?.action==='FRONTIER_TRADE'||
    localWaterOrder?.action==='FRONTIER_PORT'||localWaterOrder?.action==='FRONTIER_PORT_TRADE'||
    localWaterOrder?.action==='FRONTIER_DRYLAND'||localWaterOrder?.action==='FRONTIER_DRYLAND_TRADE'){
    const current=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||!current||
      !availableFrontierActions(current,w,w.tick+1).some(option=>frontierOptionKey(option)===frontierOptionKey(localWaterOrder)))
      fail('playerAvatar.frontierOrder');
  }
  if(localWaterOrder?.action==='NORTH_GATE_RENEWAL'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    const source=!w.northGateRenewal?findNorthGateRenewalSource(w):undefined;
    const hearing=w.northGateRenewal?.hearing??(source&&northGateRenewalForSource(source));
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      !ordered||!ordered.alive||ordered.hp<=0||ordered.positionPlane!==undefined||!hearing||hearing.outcome||
      hearing.id!==localWaterOrder.targetNorthGateRenewalId||w.tick+1<hearing.openedTick||w.tick+1>=hearing.expiresTick)
      fail('playerAvatar.northGateRenewalOrder');
  }
  if(localWaterOrder?.action==='SCRIBE_COMMISSION'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableScribeCommissionActions(ordered,w,w.tick+1).some(option=>{
        if(option.scribeCommissionMove==='offer'&&localWaterOrder.scribeCommissionMove==='offer')
          return option.targetCultivatorId===localWaterOrder.targetCultivatorId&&option.targetChronicleSourceId===localWaterOrder.targetChronicleSourceId;
        if(option.scribeCommissionMove!=='offer'&&localWaterOrder.scribeCommissionMove!=='offer')
          return option.scribeCommissionMove===localWaterOrder.scribeCommissionMove&&option.targetScribeCommissionId===localWaterOrder.targetScribeCommissionId;
        return false;
      }))fail('playerAvatar.scribeCommissionOrder');
  }
  if(localWaterOrder?.action==='CRAFT_TRAINING'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableCraftTrainingActions(ordered,w,w.tick+1).some(option=>{
        if(option.craftTrainingMove==='offer'&&localWaterOrder.craftTrainingMove==='offer')
          return option.targetCultivatorId===localWaterOrder.targetCultivatorId&&option.targetCraftTraineeId===localWaterOrder.targetCraftTraineeId;
        if(option.craftTrainingMove!=='offer'&&localWaterOrder.craftTrainingMove!=='offer')
          return option.craftTrainingMove===localWaterOrder.craftTrainingMove&&option.targetCraftTrainingId===localWaterOrder.targetCraftTrainingId;
        return false;
      }))fail('playerAvatar.craftTrainingOrder');
  }
  if(localWaterOrder?.action==='CIVIC_MEMORIAL'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableCivicMemorialActions(ordered,w,w.tick+1).some(option=>option.civicMemorialMove==='append_relief'&&
        option.targetCivicMemorialId===localWaterOrder.targetCivicMemorialId&&option.targetCivicDeedId===localWaterOrder.targetCivicDeedId))
      fail('playerAvatar.civicMemorialOrder');
  }
  if(localWaterOrder?.action==='MARKET_FREIGHT'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableMarketFreightActions(ordered,w,w.tick+1).some(option=>{
        if(option.marketFreightMove==='offer'&&localWaterOrder.marketFreightMove==='offer')
          return option.targetShipmentId===localWaterOrder.targetShipmentId&&option.targetCultivatorId===localWaterOrder.targetCultivatorId;
        if(option.marketFreightMove!=='offer'&&localWaterOrder.marketFreightMove!=='offer')
          return option.marketFreightMove===localWaterOrder.marketFreightMove&&option.targetEscortId===localWaterOrder.targetEscortId;
        return false;
      }))fail('playerAvatar.marketFreightOrder');
  }
  if(localWaterOrder?.action==='DISASTER_SHELTER'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableDisasterShelterActions(ordered,w,w.tick+1).some(option=>{
        if(option.disasterShelterMove==='offer'&&localWaterOrder.disasterShelterMove==='offer')
          return option.targetCultivatorId===localWaterOrder.targetCultivatorId;
        if(option.disasterShelterMove!=='offer'&&localWaterOrder.disasterShelterMove!=='offer')
          return option.disasterShelterMove===localWaterOrder.disasterShelterMove&&option.targetDisasterShelterId===localWaterOrder.targetDisasterShelterId;
        return false;
      }))fail('playerAvatar.disasterShelterOrder');
  }
  if(localWaterOrder?.action==='WAYPOST_MEAL'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableWaypostMealActions(ordered,w,w.tick+1).some(option=>{
        if(option.waypostMealMove==='offer'&&localWaterOrder.waypostMealMove==='offer')
          return option.targetCultivatorId===localWaterOrder.targetCultivatorId;
        if(option.waypostMealMove!=='offer'&&localWaterOrder.waypostMealMove!=='offer')
          return option.waypostMealMove===localWaterOrder.waypostMealMove&&option.targetWaypostMealId===localWaterOrder.targetWaypostMealId;
        return false;
      }))fail('playerAvatar.waypostMealOrder');
  }
  if(localWaterOrder?.action==='WORKSHOP_ESTATE'){
    const ordered=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!ordered||
      !availableWorkshopEstateActions(ordered,w,w.tick+1).some(option=>option.workshopEstateMove===localWaterOrder.workshopEstateMove&&
        option.targetWorkshopId===localWaterOrder.targetWorkshopId))fail('playerAvatar.workshopEstateOrder');
  }
  if(localWaterOrder?.action==='WORKSHOP_RELEASE'){
    const actor=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      w.playerAvatar.possessedId!==localWaterOrder.actorId||!actor||!availableWorkshopReleaseActions(actor,w,w.tick+1).some(option=>
        option.workshopReleaseMove===localWaterOrder.workshopReleaseMove&&option.targetWorkshopId===localWaterOrder.targetWorkshopId&&
        option.targetWorkshopReleaseId===localWaterOrder.targetWorkshopReleaseId))fail('playerAvatar.workshopReleaseOrder');
  }
  if(localWaterOrder?.action==='UPPER_ARRAY_FIELD'||localWaterOrder?.action==='UPPER_ARRAY_FIELD_LOCAL'||localWaterOrder?.action==='UPPER_ARRAY_FIELD_TRADE'){
    const current=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||!current||
      !availableUpperArrayFieldActions(current,w,w.tick+1).some(option=>upperArrayFieldOptionKey(option)===upperArrayFieldOptionKey(localWaterOrder)))
      fail('playerAvatar.upperArrayFieldOrder');
  }
  if(localWaterOrder?.action==='UPPER_PASSAGE'){
    const moved=w.cultivators.find(row=>row.id===localWaterOrder.actorId);
    if(localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||!moved||
      (localWaterOrder.upperPassageMove==='enter'?
        (moved.positionPlane!==undefined||localWaterOrder.targetUpperPassageNodeId!==UPPER_PASSAGE_PATH[1]):
        !onUpperPassagePlane(moved)))fail('playerAvatar.upperPassageOrder');
  }
  if(localWaterOrder?.action==='NORTH_WELL_REVIEW'&&
    (localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1||
      !w.northMiningCharters?.charters.some(row=>row.id===localWaterOrder.targetNorthMiningCharterId&&row.status==='ratified')))
    fail('playerAvatar.northWellReviewOrder');
  if(localWaterOrder?.action==='NORTH_MINING_CHARTER'&&
    (localWaterOrder.queuedTick!==w.tick||(w.playerAvatar.possessionUntilTick??0)<=w.tick+1))fail('playerAvatar.northMiningCharterOrder');
  if(localWaterOrder?.action==='WATER_VEIN'&&
    (!locations.has(localWaterOrder.targetLocationId)||localWaterOrder.queuedTick!==w.tick||
      (w.playerAvatar.possessionUntilTick??0)<=w.tick+1))fail('playerAvatar.waterVeinOrder');
  unique(w.decisionTrace.records, ({id}) => id, 'decisionTrace.id');
  for (const row of w.decisionTrace.records) {
    unique(row.candidates, ({id}) => id, 'decisionTrace.candidateId');
    if (!actor.has(row.actorId) || row.tick > w.tick ||
        (row.chosenCandidateId && !row.candidates.some(({id,action}) => id === row.chosenCandidateId && action === row.chosenAction)) ||
        row.candidates.some((candidate) => candidate.targetCultivatorId && !actor.has(candidate.targetCultivatorId))) fail('decisionTrace.references');
  }
  unique(w.estates.entries, ({id}) => id, 'estates.id');
  unique(w.estates.entries, ({deceasedId}) => deceasedId, 'estates.deceasedId');
  const knownArtefacts = new Set(w.cultivators.flatMap((person) => person.artifacts.flatMap(({id}) => id ? [id] : [])));
  for (const estate of w.estates.entries) {
    if (!w.cultivators.some(({id,alive}) => id === estate.deceasedId && !alive) ||
        (estate.namedHeirId && !actor.has(estate.namedHeirId)) || (estate.beneficiaryId && !actor.has(estate.beneficiaryId)) ||
        (estate.sponsorSectId && !sector.has(estate.sponsorSectId)) || estate.closesTick < estate.openedTick ||
        estate.eligibleHeirs.some(({actorId}) => !actor.has(actorId) || actorId === estate.deceasedId) ||
        estate.claims.some(({actorId}) => !estate.eligibleHeirs.some((person) => person.actorId === actorId)) ||
        (estate.memorial && (!actor.has(estate.memorial.organizerId) || estate.memorial.attendeeIds.some((id) => !actor.has(id))))) fail('estates.references');
    unique(estate.eligibleHeirs, ({actorId}) => actorId, 'estates.eligibleHeirs');
    unique(estate.claims, ({actorId}) => actorId, 'estates.claims');
    for (const artifact of estate.holdings.artifacts) {
      if (artifact.id && knownArtefacts.has(artifact.id)) fail('estates.duplicate_asset');
      if (artifact.id) knownArtefacts.add(artifact.id);
    }
  }
  validateWorkshopEstateContinuations(w,fail);
  const factIds = unique(w.witnesses.facts, ({eventId}) => eventId, 'witnesses.facts.id');
  unique(w.witnesses.claims, ({id}) => id, 'witnesses.claims.id');
  for (const fact of w.witnesses.facts) {
    if (fact.participantIds.length !== 2 || new Set(fact.participantIds).size !== 2 ||
        !fact.participantIds.includes(fact.winnerId) || fact.participantIds.some((id) => !actor.has(id)) ||
        new Set(fact.witnessIds).size !== fact.witnessIds.length ||
        fact.witnessIds.some((id) => !actor.has(id) || fact.participantIds.includes(id))) fail('witnesses.facts.references');
  }
  for (const claim of w.witnesses.claims) {
    if (!actor.has(claim.claimantId) || !actor.has(claim.subjectId) ||
        (claim.settledTick === undefined && !factIds.has(claim.sourceEventId)) ||
        (claim.reputationSectId && !sector.has(claim.reputationSectId)) || claim.reputationRestored > claim.reputationPenalty ||
        (claim.appeal && claim.appeal.actorId !== claim.subjectId) ||
        new Set(claim.attestations.map(({ actorId }) => actorId)).size !== claim.attestations.length ||
        claim.attestations.some(({ actorId }) => !actor.has(actorId))) fail('witnesses.claims.references');
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'witnesses')) {
    const historicalPrivate = new Set(w.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => `rumor-${id}`));
    for (const person of w.cultivators) for (const rumor of person.rumors) {
      if (historicalPrivate.has(rumor.id)) rumor.witnessScope = 'participants';
    }
  }
  unique(w.relocations.plans, ({ id }) => id, 'relocations.plans.id');
  unique(w.relocations.abandonedSites, ({ id }) => id, 'relocations.abandonedSites.id');
  const openRelocations = w.relocations.plans.filter(({ status }) => status === 'voting' || status === 'in_transit');
  unique(openRelocations, ({ sectId }) => sectId, 'relocations.active.sect');
  unique(openRelocations, ({ destinationId }) => destinationId, 'relocations.active.destination');
  for (const plan of w.relocations.plans) {
    const voterIds = unique(plan.voterIds, (id) => id, 'relocations.plans.voters');
    unique(plan.votes, ({ actorId }) => actorId, 'relocations.plans.votes');
    unique(plan.garrisonIds, (id) => id, 'relocations.plans.garrison');
    if (!sector.has(plan.sectId) || !locations.has(plan.originId) || !locations.has(plan.destinationId) || plan.originId === plan.destinationId ||
        !voterIds.has(plan.proposerId) || plan.voterIds.some((id) => !actor.has(id)) || plan.garrisonIds.some((id) => !actor.has(id)) ||
        plan.path.length < 2 || plan.pathIndex >= plan.path.length || plan.openedTick > w.tick || plan.deadlineTick <= plan.openedTick ||
        plan.votes.some((vote) => !voterIds.has(vote.actorId) || vote.tick < plan.openedTick || vote.tick > w.tick || vote.tick > plan.deadlineTick) ||
        (plan.departedTick !== undefined && (plan.departedTick < plan.openedTick || plan.departedTick > w.tick)) ||
        (plan.lastAdvancedTick !== undefined && (plan.lastAdvancedTick < (plan.departedTick ?? plan.openedTick) || plan.lastAdvancedTick > w.tick)) ||
        (plan.settledTick !== undefined && (plan.settledTick < (plan.departedTick ?? plan.openedTick) || plan.settledTick > w.tick)) ||
        ((plan.status === 'settled' || plan.status === 'aborted') !== (plan.settledTick !== undefined)) ||
        plan.spent !== (plan.departedTick !== undefined) ||
        (plan.status === 'voting' && plan.spent) || ((plan.status === 'in_transit' || plan.status === 'settled') && !plan.spent) ||
        (plan.status === 'settled' && plan.pathIndex !== plan.path.length - 1) ||
        (plan.status !== 'in_transit' && (plan.custody.stones !== 0 || plan.custody.pavilion.length > 0))) fail('relocations.plans.references');
  }
  for (const row of w.relocations.abandonedSites) {
    if (!sector.has(row.sectId) || !locations.has(row.originId) || !locations.has(row.destinationId) ||
        row.originId === row.destinationId || row.tick > w.tick || row.arrayHp > row.arrayMaxHp) fail('relocations.abandonedSites.references');
  }
}

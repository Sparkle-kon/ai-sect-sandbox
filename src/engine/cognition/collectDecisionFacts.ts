import { activeBellWatchForActor } from '../bellWatchPresence';
import { physicalAtlasHome } from '../physicalAtlasEngine';
import { availableFrontierProviderActions, availableNorthGateRenewalProviderActions, availableUpperPassageProviderActions, availableUpperArrayFieldProviderActions, holdsCivicAppendAvatar } from './decisionFactsLate';
import { frontierCommand } from '../frontierActions';
import { activeDanxiaMedicineEscort } from '../danxiaMedicineTerms';
import { activeRelocationForActor, availableRelocationActions } from '../relocationEngine';
import { activeEscortForActor, availableEscortActions } from '../escortEngine';
import { pilgrimageCheckpoint } from '../pilgrimageEngine';
import { courierCheckpoint, availableCourierHandoffActions, availableCourierActions, visibleCouriers } from '../sealedCourierEngine';
import { boundaryReliefCheckpoint } from '../boundaryReliefCheckpoint';
import { disasterShelterCheckpoint } from '../disasterShelterCheckpoint';
import { sealedHeartDemonMemoryIds } from '../heartDemonPrivacy';
import { recallMemories, memoryStrength } from '../memoryEngine';
import { schemeOptions } from '../schemeEngine';
import { terrainTileAt, knownMapLocations } from '../terrainEngine';
import { knownRumorLead } from '../rumorEngine';
import { voluntaryHeartDemonChoiceEffect } from '../heartDemonChoicePolicy';
import { hasOrdinaryIntentHistory, modelOrdinaryIntentOptions } from '../ordinaryIntentEngine';
import { activeAvatar } from '../avatarEngine';
import { availableHeartDemonRecovery } from '../heartDemonAftermathEngine';
import { availableApprenticeshipReunionActions } from '../apprenticeshipReunion';
import { apprenticeshipReunionCommand } from '../apprenticeshipReunionCognition';
import { availableMentorshipActions } from '../mentorshipEngine';
import { availableApprenticeCohortActions } from '../apprenticeCohortEngine';
import { availableMentorTransferActions } from '../mentorTransferEngine';
import { availableOathArbitrationActions } from '../oathArbitrationEngine';
import { availableOathActions } from '../oathEngine';
import { availableMarketActions } from '../marketEngine';
import { availableNorthWellReviewActions } from '../northWellRevisitEngine';
import { availableNorthMiningCharterActions } from '../northMiningCharterEngine';
import { availableWaterVeinActions } from '../waterVeinEngine';
import { availableSeedCultureActions } from '../seedCultureEngine';
import { availableVillageFairActions } from '../villageFairEngine';
import { availableCaravanRestitutionActions } from '../caravanRestitutionEngine';
import { availableSettlementActions } from '../settlementEngine';
import { availableVillageGranaryActions } from '../villageGranaryEngine';
import { availableVillageSupplyActions } from '../villageSupplyEngine';
import { availableWitnessActions } from '../witnessEngine';
import { availableEstateActions } from '../estateEngine';
import { availableDoctrineActions } from '../doctrineEngine';
import { availableDoctrineFoundingActions } from '../doctrineFoundingEngine';
import { availableDoctrineMaturityActions } from '../doctrineMaturityEngine';
import { availableSeasonReviewActions } from '../seasonReviewEngine';
import { availableObservatoryActions } from '../fieldObservatoryEngine';
import { availableAlignedWeatherActions } from '../alignedWeatherEngine';
import { availableShortShiftActions } from '../shortShiftEngine';
import { availableVillageCensusActions } from '../villageCensusEngine';
import { availableCivicMemorialActions } from '../civicMemorialEngine';
import { availableRoadActions } from '../roadEngine';
import { availableProbationActions } from '../probationEngine';
import { availableRelicExhibitActions } from '../relicExhibitEngine';
import { availableWorkshopActions, availableWorkshopReleaseActions, availableWorkshopCapacityActions } from '../workshopEngine';
import { craftTrainingProviderOptions } from '../craftTrainingCognition';
import { disasterShelterProviderOptions } from '../disasterShelterCognition';
import { workshopEstateProviderOptions } from '../workshopEstateCognition';
import { scribeCommissionProviderOptions } from '../scribeCommissionCognition';
import { possessedForWorkshopRelease } from './decisionCommands';
import { availableToolLoanActions } from '../toolLoanEngine';
import { availableArtifactSalvageActions } from '../artifactSalvageEngine';
import { availableFurnaceReservationActions } from '../furnaceReservationEngine';
import { availableFurnaceSafetyActions } from '../furnaceSafetyEngine';
import { availableDamageAssuranceActions } from '../damageAssuranceEngine';
import { availableSparringActions } from '../sparringEngine';
import { availableTerrainRecoveryActions } from '../terrainSuccessionEngine';
import { availableSharedCommonsActions } from '../sharedCommonsEngine';
import { availableServiceRetirementActions } from '../serviceRetirementEngine';
import { availableVillageWorksActions } from '../villageWorksEngine';
import { availableGuardianActions } from '../householdEngine';
import { availableSeasonalHousingActions, seasonalHousingTravelTarget } from '../seasonalHousingEngine';
import { availableHouseholdNameActions } from '../householdNameEngine';
import { availableTerritorialLeaseActions } from '../territorialLeaseEngine';
import { availableFormationActions } from '../formationNetworkEngine';
import { availableSectStipendActions } from '../sectStipendEngine';
import { availableCareFollowupActions, shouldVolunteerCareFollowup } from '../careFollowupEngine';
import { availableDanxiaMedicineActions } from '../danxiaMedicineEngine';
import { availableDanxiaReviewActions } from '../danxiaSeasonReviewEngine';
import { availableInfirmaryActions } from '../infirmaryEngine';
import { availableHabitatActions } from '../habitatEngine';
import { availableChronicleErrataActions } from '../chronicleErrataEngine';
import { availableSectCreditActions } from '../sectCreditEngine';
import { availableSanctuaryActions } from '../sanctuaryEngine';
import { availableResearchActions } from '../researchEngine';
import { availableCeasefireActions } from '../ceasefireEngine';
import { marketFreightProviderOptions } from '../marketFreightCognition';
import { availableCompetitionActions } from '../competitionEngine';
import { availableScriptureActions, scriptureEditionModifiers } from '../scriptureEngine';
import { availablePavilionLoanActions } from '../pavilionLoanEngine';
import { availableRelicActions } from '../relicEngine';
import { availableRecollectionActions, visibleRecollection } from '../reincarnationEngine';
import { projectReliefHomecoming } from '../reliefHomecoming';
import { latestEarnedPersonaTrait } from '../wildPersonaEngine';
import type { CognitiveSnapshot } from './cognitiveContext';
import type { NativeDecisionContinuation } from './nativeDecisionGate';

/** Collect the request-time quotes in their original evaluation order. */
export function collectDecisionFacts({ cultivator, world, requestTick }: CognitiveSnapshot, quotes: NativeDecisionContinuation) {
  const { activeVow, rescueOnly, boundaryReliefOnly } = quotes;

  const location = world.locations.find((l) => l.id === cultivator.locationId);
  const physicalRegion=physicalAtlasHome(world,cultivator)?.point.regionId;
  const frontierOptions=availableFrontierProviderActions(cultivator,world,requestTick);
  const frontierGuide=frontierOptions.length?`- 实地另图或交换许可：只能照抄，不得自填费用、货数、身份或天气。${JSON.stringify(frontierOptions.map(frontierCommand))}`:' ';
  const coLocated = world.cultivators.filter(
    (c) =>
      c.alive &&
      c.id !== cultivator.id &&
      c.locationId === cultivator.locationId && !activeBellWatchForActor(world,c) && !activeDanxiaMedicineEscort(world,c) && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) && !pilgrimageCheckpoint(world, c) && !courierCheckpoint(world, c) && !boundaryReliefCheckpoint(world, c) && !disasterShelterCheckpoint(world,c)
  );
  const privateHeartMemories=sealedHeartDemonMemoryIds(cultivator);
  const recalled=recallMemories(cultivator,world.tick,privateHeartMemories.size?Infinity:5)
    .filter(memory=>!privateHeartMemories.has(memory.id)).slice(0,5).map(m=>({
    tick: m.tick,
    type: m.consolidatedAtTick === undefined ? '经历' : '核心',
    strength: Number(memoryStrength(m, world.tick).toFixed(1)),
    valence: m.emotionalValence,
    content: m.content.slice(0, 280),
  }));

  const currentPlan = cultivator.activeScheme?.status === 'active' ? cultivator.activeScheme : undefined;
  const eligiblePlans = schemeOptions(cultivator, world);
  const tile = location ? terrainTileAt(world, location.x, location.y) : undefined;
  const knownLocations = knownMapLocations(world, cultivator);
  const unverifiedTrail = knownRumorLead(cultivator, world);
  const socialEffect=voluntaryHeartDemonChoiceEffect(world,cultivator,requestTick);
  const ordinaryHistory=hasOrdinaryIntentHistory(world,cultivator,requestTick);
  const ordinaryOptions = modelOrdinaryIntentOptions(world,cultivator,requestTick);
  const initialAftermathSocial=socialEffect?ordinaryOptions.find(row=>row.action==='SOCIALIZE'):undefined;
  const ownRecovery=!activeVow&&!rescueOnly&&!boundaryReliefOnly&&activeAvatar(world)!==cultivator?
    availableHeartDemonRecovery(world,cultivator,requestTick):undefined;
  const ordinaryGuide=ordinaryHistory&&ordinaryOptions.length?
    `- 若没有更紧急或早已承诺的合法事务，可从实际可执行的日常选项原样复制动作与目标。计分只是偏好，不可自报结果或编造额外目标：${JSON.stringify(ordinaryOptions.map(({action,targetCultivatorId,targetLocationId,targetHerbId,score,factors})=>({
      chosenAction:action,targetCultivatorId,targetLocationId,targetHerbId,score,factors
    })))}` : initialAftermathSocial?
    `- 若没有更紧急或早已承诺的合法事务，本月若自行选择交谈，只可向这名实在同地的可选人物发起：${JSON.stringify({
      chosenAction:'SOCIALIZE',targetCultivatorId:initialAftermathSocial.targetCultivatorId,
    })}`:'';


  const apprenticeshipOptions=activeAvatar(world)===cultivator?[]:availableApprenticeshipReunionActions(cultivator,world,requestTick);
  const apprenticeshipGuide=apprenticeshipOptions.length?
    '仅复制本人真正同地的请教或重谈许可；邀约、应允和已发生的切磋不同，不为他人答应、不填写旧拒理由或结果：'+JSON.stringify(apprenticeshipOptions.map(apprenticeshipReunionCommand)):'';
  const mentorshipOptions = availableMentorshipActions(cultivator, world);
  const cohortOptions = availableApprenticeCohortActions(cultivator, world, requestTick);
  const mentorTransferOptions = availableMentorTransferActions(cultivator,world,requestTick);
  const arbitrationOptions = availableOathArbitrationActions(cultivator, world);
  const oathOptions = availableOathActions(cultivator, world);
  const marketOptions = availableMarketActions(cultivator, world);
  const renewalOptions=availableNorthGateRenewalProviderActions(cultivator,world,requestTick);
  const renewalMoves=renewalOptions.map(({action,northGateRenewalMove,targetNorthGateRenewalId})=>
    ({chosenAction:action,northGateRenewalMove,targetNorthGateRenewalId}));
  const pendingUpperEntry=availableUpperPassageProviderActions(cultivator,world,requestTick)
    .filter(row=>row.upperPassageMove==='enter');
  const arrayFieldWellOptions=availableUpperArrayFieldProviderActions(cultivator,world,requestTick);
  const oldWellOptions=world.playerAvatar.possessedId===cultivator.id&&(world.playerAvatar.possessionUntilTick??0)>requestTick ?
    [] : availableNorthWellReviewActions(cultivator,world,requestTick);
  const charterOptions=world.playerAvatar.possessedId===cultivator.id&&(world.playerAvatar.possessionUntilTick??0)>requestTick ?
    [] : availableNorthMiningCharterActions(cultivator,world,requestTick);
  const waterVeinOptions = availableWaterVeinActions(cultivator,world,requestTick);
  const seedOptions = availableSeedCultureActions(cultivator, world, requestTick);
  const seedPromptOptions = seedOptions.map(({ seedMove, targetLocationId, targetSeedLotId, targetSeedPlotId }) =>
    ({ seedMove, targetLocationId, targetSeedLotId, targetSeedPlotId }));
  const villageFairOptions = availableVillageFairActions(cultivator, world, requestTick);
  const villageFairPromptOptions = villageFairOptions.map(({ villageFairMove, targetSettlementId, targetVillageFairId, targetMarketOrderId }) =>
    ({ villageFairMove, targetSettlementId, targetVillageFairId, targetMarketOrderId }));
  const restitutionOptions = availableCaravanRestitutionActions(cultivator, world, requestTick);
  const settlementOptions = availableSettlementActions(cultivator, world);
  const granaryOptions = availableVillageGranaryActions(cultivator, world, requestTick);
  const villageSupplyOptions = availableVillageSupplyActions(cultivator, world, requestTick)
    .map(({ villageSupplyMove, targetSettlementId, targetVillageSupplyId }) => ({ villageSupplyMove, targetSettlementId, targetVillageSupplyId }));
  const witnessOptions = availableWitnessActions(cultivator, world);
  const estateOptions = availableEstateActions(cultivator, world);
  const doctrineOptions = availableDoctrineActions(cultivator, world);
  const foundingOptions=availableDoctrineFoundingActions(cultivator,world,requestTick);
  const maturityOptions=availableDoctrineMaturityActions(cultivator,world,requestTick);
  const relocationOptions = availableRelocationActions(cultivator, world);
  const honorReviewOptions = availableSeasonReviewActions(cultivator, world);
  const observatoryOptions = availableObservatoryActions(cultivator, world, requestTick);
  const alignedWeatherOptions = availableAlignedWeatherActions(cultivator, world, requestTick);
  const alignedWeatherPromptOptions = alignedWeatherOptions.map(({ alignedWeatherMove, targetLocationId, targetCultivatorId,
    targetObservatoryTick, targetAlignedWeatherId }) => ({ alignedWeatherMove, targetLocationId, targetCultivatorId,
    targetObservatoryTick, targetAlignedWeatherId }));
  const shortShiftOptions = availableShortShiftActions(cultivator, world, requestTick);
  const censusOptions = availableVillageCensusActions(cultivator, world);
  const civicMemorialOptions = availableCivicMemorialActions(cultivator, world, requestTick)
    .filter(row=>row.civicMemorialMove!=='append_relief'||!holdsCivicAppendAvatar(cultivator,world,requestTick))
    .map(({ civicMemorialMove, targetCivicDeedId, targetCivicMemorialId }) =>
      ({ civicMemorialMove, targetCivicDeedId, targetCivicMemorialId }));
  const roadOptions = availableRoadActions(cultivator, world);
  const probationOptions = availableProbationActions(cultivator, world);
  const exhibitOptions = availableRelicExhibitActions(cultivator, world);
  const workshopOptions = availableWorkshopActions(cultivator, world, true, requestTick);
  const trainingOptions = craftTrainingProviderOptions(cultivator, world, requestTick);
  const disasterShelterOptions = disasterShelterProviderOptions(cultivator,world,requestTick);
  const estateCraftOptions = workshopEstateProviderOptions(cultivator, world, requestTick);
  const scribeOptions = scribeCommissionProviderOptions(cultivator, world, requestTick);
  const workshopReleaseOptions = possessedForWorkshopRelease(cultivator, world, requestTick)
    ? [] : availableWorkshopReleaseActions(cultivator, world, requestTick);
  const workshopReleasePromptOptions = workshopReleaseOptions.map(({ workshopReleaseMove, targetWorkshopId,
    targetWorkshopReleaseId }) => ({ workshopReleaseMove, targetWorkshopId, targetWorkshopReleaseId }));
  const toolLoanOptions = availableToolLoanActions(cultivator, world, requestTick);
  const toolLoanPromptOptions = toolLoanOptions.map(({ toolLoanMove, targetArtifactId, targetWorkshopId, targetToolLoanId }) =>
    ({ toolLoanMove, targetArtifactId, targetWorkshopId, targetToolLoanId }));
  const capacityOptions = availableWorkshopCapacityActions(cultivator, world, requestTick)
    .map(({ workshopCapacityMove, targetWorkshopId }) => ({ workshopCapacityMove, targetWorkshopId }));
  const mayAcceptCharteredWorkshop = workshopOptions.some(({ workshopMove, targetWorkshopId }) => workshopMove === 'accept' &&
    world.workshops.orders.some((order) => order.id === targetWorkshopId && order.makerId === cultivator.id && order.institution));
  // Workshop provenance is custody evidence, not an actor's new knowledge of earlier people or places.
  const ownArtifactView = cultivator.artifacts.map(({ id, name, spiritRoot, tier, durability, maxDurability, boundTo, soul,
    resonance, relicSetId, relicFragmentIds }) => ({ id, name, spiritRoot, tier, durability, maxDurability, boundTo, soul,
    resonance, relicSetId, relicFragmentIds }));
  const salvageOptions = availableArtifactSalvageActions(cultivator, world, requestTick)
    .map(({ targetArtifactId, targetLocationId }) => ({ targetArtifactId, targetLocationId }));
  const furnaceOptions = availableFurnaceReservationActions(cultivator, world, requestTick);
  const furnaceSafetyOptions = availableFurnaceSafetyActions(cultivator, world, requestTick)
    .map(({ action, furnaceSafetyMove, targetFurnaceSafetyId }) => ({ action, furnaceSafetyMove, targetFurnaceSafetyId }));
  const damageAssuranceOptions = availableDamageAssuranceActions(cultivator, world, requestTick);
  const damageAssurancePromptOptions = damageAssuranceOptions.map(({ damageAssuranceMove, targetFurnaceSafetyId, targetDamageAssuranceId }) =>
    ({ damageAssuranceMove, targetFurnaceSafetyId, targetDamageAssuranceId }));
  const sparringOptions = availableSparringActions(cultivator, world, true, requestTick);
  const recoveryOptions = availableTerrainRecoveryActions(cultivator, world);
  const commonsOptions = availableSharedCommonsActions(cultivator, world);
  const serviceOptions = availableServiceRetirementActions(cultivator, world);
  const courierHandoffOptions = availableCourierHandoffActions(cultivator, world, requestTick)
    .filter(({ courierHandoffMove }) => courierHandoffMove !== 'offer');
  const courierHandoffPromptOptions = courierHandoffOptions.map(({ courierHandoffMove, targetDispatchId }) =>
    ({ courierHandoffMove, targetDispatchId }));
  const courierOptions = availableCourierActions(cultivator, world);
  const receivedDispatches = visibleCouriers(world, cultivator).filter((row) =>
    row.role === 'recipient' && row.status === 'delivered' && row.payload).slice(-3).map(({ deliveredTick, payload }) => ({ deliveredTick, payload }));
  const worksOptions = availableVillageWorksActions(cultivator, world);
  const guardianOptions = availableGuardianActions(cultivator, world);
  const housingOptions = availableSeasonalHousingActions(cultivator,world,requestTick);
  const housingTravel = seasonalHousingTravelTarget(world,cultivator,requestTick);
  const householdNameOptions = availableHouseholdNameActions(cultivator, world, requestTick);
  const leaseOptions = availableTerritorialLeaseActions(cultivator, world);
  const formationOptions = availableFormationActions(cultivator, world);
  const stipendOptions = availableSectStipendActions(cultivator, world, requestTick);
  const stipendPromptOptions = stipendOptions.map(({ stipendMove, targetInfirmaryCaseId, targetStipendId }) =>
    ({ stipendMove, targetInfirmaryCaseId, targetStipendId }));
  const careFollowupOptions = availableCareFollowupActions(cultivator, world, requestTick);
  const danxiaOptions=availableDanxiaMedicineActions(cultivator,world,requestTick);
  const danxiaReviewOptions=availableDanxiaReviewActions(cultivator,world,requestTick);
  const careFollowupPromptOptions = careFollowupOptions.map(({ careFollowupMove, targetInfirmaryCaseId, targetCareFollowupId }) =>
    ({ careFollowupMove, targetInfirmaryCaseId, targetCareFollowupId }));
  const infirmaryOptions = availableInfirmaryActions(cultivator, world, requestTick)
    .map(({ action, infirmaryMove, targetInfirmaryCaseId }) => ({ action, infirmaryMove, targetInfirmaryCaseId }));
  const mayStaffFollowup = infirmaryOptions.some(({ infirmaryMove }) => infirmaryMove === 'staff') &&
    shouldVolunteerCareFollowup(world, cultivator, requestTick);
  const habitatOptions = availableHabitatActions(cultivator, world);
  const chronicleErrataOptions = availableChronicleErrataActions(cultivator, world);
  const creditOptions = availableSectCreditActions(cultivator, world);
  const sanctuaryOptions = availableSanctuaryActions(cultivator, world);
  const researchOptions = availableResearchActions(cultivator, world);
  const ceasefireOptions = availableCeasefireActions(cultivator, world);
  const escortOptions = availableEscortActions(cultivator, world);
  const freightOptions=marketFreightProviderOptions(cultivator,world,requestTick);
  const competitionOptions = availableCompetitionActions(cultivator, world);
  const scriptureOptions = availableScriptureActions(cultivator, world);
  const pavilionLoanOptions = availablePavilionLoanActions(cultivator, world, requestTick)
    .map(({ pavilionLoanMove, targetScriptureEditionId, targetPavilionLoanId }) =>
      ({ pavilionLoanMove, targetScriptureEditionId, targetPavilionLoanId }));
  const currentEdition = scriptureEditionModifiers(cultivator);
  const relicOptions = availableRelicActions(cultivator, world, requestTick);
  const recollectionOptions = availableRecollectionActions(cultivator, world);
  const ownEcho = visibleRecollection(world, cultivator.id);
  const ownReliefScene=projectReliefHomecoming(world,cultivator);
  const earnedPersona = latestEarnedPersonaTrait(cultivator);
  return {
    ownReliefScene, earnedPersona, location, frontierOptions, frontierGuide, physicalRegion, coLocated, tile,
    knownLocations, unverifiedTrail, ordinaryGuide, recalled, honorReviewOptions, observatoryOptions,
    renewalMoves, pendingUpperEntry, arrayFieldWellOptions, oldWellOptions, charterOptions, waterVeinOptions,
    alignedWeatherPromptOptions, mentorTransferOptions, cohortOptions, shortShiftOptions, censusOptions,
    civicMemorialOptions, roadOptions, probationOptions, exhibitOptions, toolLoanPromptOptions,
    workshopOptions, mayAcceptCharteredWorkshop, workshopReleasePromptOptions, disasterShelterOptions,
    trainingOptions, estateCraftOptions, scribeOptions, capacityOptions, ownRecovery, recoveryOptions,
    commonsOptions, serviceOptions, receivedDispatches, courierHandoffPromptOptions, courierOptions,
    worksOptions, granaryOptions, villageSupplyOptions, restitutionOptions, housingOptions, housingTravel,
    householdNameOptions, guardianOptions, leaseOptions, formationOptions, stipendPromptOptions, danxiaOptions,
    danxiaReviewOptions, careFollowupPromptOptions, infirmaryOptions, mayStaffFollowup, habitatOptions,
    chronicleErrataOptions, creditOptions, sanctuaryOptions, researchOptions, ceasefireOptions, freightOptions,
    escortOptions, competitionOptions, currentEdition, scriptureOptions, pavilionLoanOptions, relicOptions,
    ownEcho, recollectionOptions, relocationOptions, doctrineOptions, foundingOptions, maturityOptions,
    ownArtifactView, salvageOptions, seedPromptOptions, furnaceSafetyOptions, damageAssurancePromptOptions,
    furnaceOptions, sparringOptions, estateOptions, witnessOptions, settlementOptions, marketOptions,
    villageFairPromptOptions, arbitrationOptions, oathOptions, mentorshipOptions, apprenticeshipGuide,
    currentPlan, eligiblePlans, privateHeartMemories, apprenticeshipOptions, ordinaryHistory, ordinaryOptions,
    initialAftermathSocial, socialEffect, renewalOptions, damageAssuranceOptions, villageFairOptions,
    toolLoanOptions, workshopReleaseOptions, courierHandoffOptions, stipendOptions, careFollowupOptions,
    alignedWeatherOptions, seedOptions
  };
}

export type DecisionFacts = ReturnType<typeof collectDecisionFacts>;

import { verifiedHeartDemonChoiceEffect, autonomousExpeditionRescueOptions } from '../heartDemonChoicePolicy';
import { toHousingDecision, toMentorTransferDecision, workshopReleaseDecision } from './decisionCommands';
import { decodeScribeCommissionDecision } from '../scribeCommissionCognition';
import { decodeMarketFreightDecision } from '../marketFreightCognition';
import { decodeDisasterShelterDecision } from '../disasterShelterCognition';
import { decodeCraftTrainingDecision } from '../craftTrainingCognition';
import { decodeWorkshopEstateDecision } from '../workshopEstateCognition';
import { decodeCourierHandoff } from './privateDecisionDecoders';
import { isTribulationActive, availableAmbushTargets } from '../tribulationEngine';
import { availableLeadershipActions } from '../sectPoliticsEngine';
import { availableBeastTames } from '../spiritBeastEngine';
import { availableBountyHunts } from '../bountyEngine';
import { availableOccasionJoins } from '../occasionEngine';
import { availableDiplomacyActions } from '../diplomacyEngine';
import { availableSectEconomyActions } from '../sectEconomyEngine';
import { availableArtifactActions } from '../artifactEngine';
import { availableAlchemy } from '../alchemyEngine';
import { mayAuthorTechnique, availableTechniques } from '../techniqueEngine';
import { availableEncounters } from '../encounterEngine';
import { isSchemeKind } from '../schemeEngine';
import { privatePersonaText, personaLine } from '../wildPersonaEngine';
import type { CognitiveSnapshot } from './cognitiveContext';
import type { DecisionFacts } from './collectDecisionFacts';
import type { NativeDecisionContinuation } from './nativeDecisionGate';
import type { ActionType, LLMDecisionPayload } from '../../types/world';

/** Resolve only an admitted action against its quoted and live targets. */
export function decodeOrdinaryAction(
  { cultivator, world, requestTick }: CognitiveSnapshot,
  quotes: NativeDecisionContinuation, facts: DecisionFacts, parsed: Partial<LLMDecisionPayload>, chosenAction: ActionType,
): LLMDecisionPayload | undefined {
  const { rescueOptions, rescueEffect, boundaryReliefOptions, routeWarningOptions, pilgrimageOptions } = quotes;
  const {
    roadOptions, probationOptions, exhibitOptions, furnaceOptions, damageAssuranceOptions,
    furnaceSafetyOptions, sparringOptions, housingOptions, householdNameOptions, restitutionOptions,
    granaryOptions, villageFairOptions, villageSupplyOptions, mentorTransferOptions, cohortOptions,
    shortShiftOptions, toolLoanOptions, scribeOptions, freightOptions, disasterShelterOptions, trainingOptions,
    estateCraftOptions, workshopReleaseOptions, capacityOptions, workshopOptions, recoveryOptions,
    commonsOptions, serviceOptions, courierHandoffOptions, courierOptions, worksOptions, guardianOptions,
    leaseOptions, formationOptions, stipendOptions, danxiaReviewOptions, danxiaOptions, careFollowupOptions,
    infirmaryOptions, habitatOptions, chronicleErrataOptions, creditOptions, sanctuaryOptions, researchOptions,
    ceasefireOptions, escortOptions, competitionOptions, pavilionLoanOptions, scriptureOptions, relicOptions,
    recollectionOptions, relocationOptions, maturityOptions, foundingOptions, doctrineOptions, estateOptions,
    witnessOptions, honorReviewOptions, alignedWeatherOptions, observatoryOptions, civicMemorialOptions,
    censusOptions, settlementOptions, marketOptions, arbitrationOptions, oathOptions, mentorshipOptions,
    knownLocations, unverifiedTrail, salvageOptions, seedOptions, currentPlan, eligiblePlans
  } = facts;
  const legalRoad = chosenAction === 'ROAD' ? roadOptions.find((item) =>
    item.roadMove === parsed.roadMove && item.targetRoadId === parsed.targetRoadId &&
    item.targetLocationId === parsed.targetLocationId) : undefined;
  if (chosenAction === 'ROAD' && (!legalRoad || parsed.targetCultivatorId !== undefined ||
      parsed.targetSectId !== undefined)) return undefined;
  const legalProbation = chosenAction === 'PROBATION' ? probationOptions.find((item) =>
    item.probationMove === parsed.probationMove && item.targetProbationId === parsed.targetProbationId &&
    item.targetExpulsionId === parsed.targetExpulsionId && item.probationFirstVillageId === parsed.probationFirstVillageId &&
    item.probationSecondVillageId === parsed.probationSecondVillageId && item.probationVote === parsed.probationVote) : undefined;
  if (chosenAction === 'PROBATION' && (!legalProbation || parsed.targetCultivatorId !== undefined ||
      parsed.targetLocationId !== undefined || parsed.targetSectId !== undefined)) return undefined;
  const legalExhibit = chosenAction === 'RELIC_EXHIBIT' ? exhibitOptions.find((item) =>
    item.exhibitMove === parsed.exhibitMove && item.targetArtifactId === parsed.targetArtifactId &&
    item.targetRelicExhibitId === parsed.targetRelicExhibitId) : undefined;
  if (chosenAction === 'RELIC_EXHIBIT' && (!legalExhibit || parsed.targetCultivatorId !== undefined ||
      parsed.targetLocationId !== undefined || parsed.targetSectId !== undefined)) return undefined;
  const legalFurnace = chosenAction === 'FURNACE_RESERVATION' ? furnaceOptions.find((item) =>
    item.furnaceMove === parsed.furnaceMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetWorkshopId === parsed.targetWorkshopId && item.targetFurnaceReservationId === parsed.targetFurnaceReservationId) : undefined;
  if (chosenAction === 'FURNACE_RESERVATION' && (!legalFurnace || Object.keys(parsed).some((field) =>
    !['innerMonologue', 'chosenAction', 'spokenLine', 'furnaceMove', 'targetLocationId', 'targetWorkshopId', 'targetFurnaceReservationId'].includes(field)))) return undefined;
  const legalAssurance = chosenAction === 'DAMAGE_ASSURANCE' ? damageAssuranceOptions.find((item) =>
    item.damageAssuranceMove === parsed.damageAssuranceMove && item.targetFurnaceSafetyId === parsed.targetFurnaceSafetyId &&
    item.targetDamageAssuranceId === parsed.targetDamageAssuranceId) : undefined;
  if (chosenAction === 'DAMAGE_ASSURANCE' && (!legalAssurance || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'damageAssuranceMove',
      legalAssurance.damageAssuranceMove === 'seal' ? 'targetFurnaceSafetyId' : 'targetDamageAssuranceId'].includes(field)))) return undefined;
  if (legalAssurance) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '只按真实验炉和已发生的实修行动。';
    return legalAssurance.damageAssuranceMove === 'seal'
      ? { chosenAction: 'DAMAGE_ASSURANCE', damageAssuranceMove: 'seal', targetFurnaceSafetyId: legalAssurance.targetFurnaceSafetyId, innerMonologue }
      : { chosenAction: 'DAMAGE_ASSURANCE', damageAssuranceMove: 'make_good',
        targetDamageAssuranceId: legalAssurance.targetDamageAssuranceId, innerMonologue };
  }
  const legalFurnaceSafety = chosenAction === 'FURNACE_SAFETY' ? furnaceSafetyOptions.find((item) =>
    item.furnaceSafetyMove === parsed.furnaceSafetyMove && item.targetFurnaceSafetyId === parsed.targetFurnaceSafetyId) : undefined;
  if (chosenAction === 'FURNACE_SAFETY' && (!legalFurnaceSafety || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'furnaceSafetyMove', 'targetFurnaceSafetyId'].includes(field)))) return undefined;
  const legalSparring = chosenAction === 'SPARRING' ? sparringOptions.find((item) =>
    item.sparringMove === parsed.sparringMove && item.targetCultivatorId === parsed.targetCultivatorId &&
    item.targetSparringId === parsed.targetSparringId && item.sparringRounds === parsed.sparringRounds) : undefined;
  if (chosenAction === 'SPARRING' && (!legalSparring || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'sparringMove', 'targetCultivatorId', 'targetSparringId', 'sparringRounds'].includes(field)))) return undefined;
  const legalRescue = chosenAction === 'EXPEDITION_RESCUE' ? rescueOptions.find((item) =>
    item.rescueMove === parsed.rescueMove && item.targetOccasionId === parsed.targetOccasionId &&
    item.targetExpeditionRescueId === parsed.targetExpeditionRescueId) : undefined;
  if(legalRescue?.rescueMove==='accept'){
    const currentEffect=verifiedHeartDemonChoiceEffect(world,cultivator,requestTick);
    if((rescueEffect||currentEffect)&&(currentEffect!==rescueEffect||
      !autonomousExpeditionRescueOptions(cultivator,world,requestTick).some(current=>current.rescueMove==='accept'&&
        current.targetExpeditionRescueId===legalRescue.targetExpeditionRescueId)))return undefined;
  }
  if (chosenAction === 'EXPEDITION_RESCUE' && (!legalRescue || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'rescueMove', 'targetOccasionId', 'targetExpeditionRescueId'].includes(field)))) return undefined;
  const legalBoundaryRelief = chosenAction === 'BOUNDARY_RELIEF' ? boundaryReliefOptions.find((item) =>
    item.boundaryReliefMove === parsed.boundaryReliefMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetCultivatorId === parsed.targetCultivatorId && item.targetBoundaryReliefId === parsed.targetBoundaryReliefId) : undefined;
  if (chosenAction === 'BOUNDARY_RELIEF' && (!legalBoundaryRelief || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'boundaryReliefMove', 'targetLocationId', 'targetCultivatorId', 'targetBoundaryReliefId'].includes(field)))) return undefined;
  if (chosenAction === 'SEASONAL_HOUSING') {
    const exact = housingOptions.find(row=>row.housingMove===parsed.housingMove&&
      row.targetHousingClaimId===parsed.targetHousingClaimId&&row.targetHousingHouseholdId===parsed.targetHousingHouseholdId&&
      row.targetCultivatorId===parsed.targetCultivatorId);
    if(!exact||Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','housingMove',
       ...(exact.housingMove==='offer'?['targetHousingHouseholdId','targetCultivatorId']:['targetHousingClaimId'])].includes(field))) return undefined;
    const reflection=(typeof parsed.innerMonologue==='string'&&parsed.innerMonologue.trim().slice(0,160))||
      cultivator.innerMonologue||'按实际地处和本人许可办借居。';
    return toHousingDecision(exact,reflection);
  }
  const legalHouseholdName = chosenAction === 'HOUSEHOLD_NAME' ? householdNameOptions.find((item) =>
    item.nameMove === parsed.nameMove && item.householdAlias === parsed.householdAlias &&
    item.targetHouseholdNameId === parsed.targetHouseholdNameId) : undefined;
  if (chosenAction === 'HOUSEHOLD_NAME' && (!legalHouseholdName || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'nameMove', 'householdAlias', 'targetHouseholdNameId'].includes(field)))) return undefined;
  const legalRestitution = chosenAction === 'CARAVAN_RESTITUTION' ? restitutionOptions.find((item) =>
    item.restitutionMove === parsed.restitutionMove && item.targetRestitutionId === parsed.targetRestitutionId) : undefined;
  if (chosenAction === 'CARAVAN_RESTITUTION' && (!legalRestitution || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'restitutionMove', 'targetRestitutionId'].includes(field)))) return undefined;
  const legalGranary = chosenAction === 'VILLAGE_GRANARY' ? granaryOptions.find((item) =>
    item.granaryMove === parsed.granaryMove && item.targetSettlementId === parsed.targetSettlementId) : undefined;
  if (chosenAction === 'VILLAGE_GRANARY' && (!legalGranary || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'granaryMove', 'targetSettlementId'].includes(field)))) return undefined;
  const legalVillageFair = chosenAction === 'VILLAGE_FAIR' ? villageFairOptions.find((item) =>
    item.villageFairMove === parsed.villageFairMove && item.targetSettlementId === parsed.targetSettlementId &&
    item.targetVillageFairId === parsed.targetVillageFairId && item.targetMarketOrderId === parsed.targetMarketOrderId) : undefined;
  if (chosenAction === 'VILLAGE_FAIR' && (!legalVillageFair || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'villageFairMove', ...(legalVillageFair.villageFairMove === 'announce'
      ? ['targetSettlementId'] : ['targetVillageFairId', 'targetMarketOrderId'])].includes(field)))) return undefined;
  // The fair resolver requires exact enumerable keys, including absence of optional fields from other actions.
  if (legalVillageFair) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '依据真实集期与本人实物行事。';
    return legalVillageFair.villageFairMove === 'announce'
      ? { chosenAction: 'VILLAGE_FAIR', villageFairMove: 'announce', targetSettlementId: legalVillageFair.targetSettlementId, innerMonologue }
      : { chosenAction: 'VILLAGE_FAIR', villageFairMove: 'reserve', targetVillageFairId: legalVillageFair.targetVillageFairId,
        targetMarketOrderId: legalVillageFair.targetMarketOrderId, innerMonologue };
  }
  const legalVillageSupply = chosenAction === 'VILLAGE_SUPPLY' ? villageSupplyOptions.find((item) =>
    item.villageSupplyMove === parsed.villageSupplyMove && item.targetSettlementId === parsed.targetSettlementId &&
    item.targetVillageSupplyId === parsed.targetVillageSupplyId) : undefined;
  if (chosenAction === 'VILLAGE_SUPPLY' && (!legalVillageSupply || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'villageSupplyMove',
      legalVillageSupply.villageSupplyMove === 'offer' ? 'targetSettlementId' : 'targetVillageSupplyId'].includes(field)))) return undefined;
  if (chosenAction === 'MENTOR_TRANSFER') {
    const exact = mentorTransferOptions.find(option=>option.mentorTransferMove===parsed.mentorTransferMove&&
      option.targetOldMentorId===parsed.targetOldMentorId&&option.targetMentorReleaseId===parsed.targetMentorReleaseId&&
      option.targetMentorTransferId===parsed.targetMentorTransferId);
    if (!exact || Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','spokenLine','mentorTransferMove',
      ...(exact.mentorTransferMove==='end'?['targetOldMentorId']:exact.mentorTransferMove==='offer'?
        ['targetMentorReleaseId']:['targetMentorTransferId'])].includes(field))) return undefined;
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0,160)) ||
      cultivator.innerMonologue || '只按本人真实同意与实到凭据行事。';
    return toMentorTransferDecision(exact,innerMonologue);
  }
  const invitees = parsed.cohortInviteeIds;
  const legalCohort = chosenAction === 'APPRENTICE_COHORT' ? cohortOptions.find((item) =>
    item.cohortMove === parsed.cohortMove && item.targetTechniqueId === parsed.targetTechniqueId &&
    item.targetCohortId === parsed.targetCohortId && (item.cohortInviteeIds === undefined ? invitees === undefined :
      Array.isArray(invitees) && invitees.length === item.cohortInviteeIds.length &&
      item.cohortInviteeIds.every((id, index) => id === invitees[index]))) : undefined;
  if (chosenAction === 'APPRENTICE_COHORT' && (!legalCohort || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'cohortMove', 'targetTechniqueId', 'targetCohortId', 'cohortInviteeIds'].includes(field)))) return undefined;
  const legalShortShift = chosenAction === 'SHORT_SHIFT' ? shortShiftOptions.find((item) =>
    item.shortShiftMove === parsed.shortShiftMove && item.targetCultivatorId === parsed.targetCultivatorId &&
    item.targetObservatoryTick === parsed.targetObservatoryTick && item.targetShortShiftId === parsed.targetShortShiftId) : undefined;
  if (chosenAction === 'SHORT_SHIFT' && (!legalShortShift || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'shortShiftMove', 'targetCultivatorId', 'targetObservatoryTick', 'targetShortShiftId'].includes(field)))) return undefined;
  const legalToolLoan = chosenAction === 'TOOL_LOAN' ? toolLoanOptions.find((item) =>
    item.toolLoanMove === parsed.toolLoanMove && item.targetArtifactId === parsed.targetArtifactId &&
    item.targetWorkshopId === parsed.targetWorkshopId && item.targetToolLoanId === parsed.targetToolLoanId) : undefined;
  if (chosenAction === 'TOOL_LOAN' && (!legalToolLoan || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'toolLoanMove', ...(legalToolLoan.toolLoanMove === 'offer'
      ? ['targetArtifactId', 'targetWorkshopId'] : ['targetToolLoanId'])].includes(field)))) return undefined;
  if (legalToolLoan) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '按在场实物与本人同意行事。';
    return legalToolLoan.toolLoanMove === 'offer'
      ? { chosenAction: 'TOOL_LOAN', toolLoanMove: 'offer', targetArtifactId: legalToolLoan.targetArtifactId,
        targetWorkshopId: legalToolLoan.targetWorkshopId, innerMonologue }
      : { chosenAction: 'TOOL_LOAN', toolLoanMove: legalToolLoan.toolLoanMove,
        targetToolLoanId: legalToolLoan.targetToolLoanId, innerMonologue };
  }
  if (chosenAction === 'SCRIBE_COMMISSION') return decodeScribeCommissionDecision(parsed, cultivator, scribeOptions);
  if (chosenAction === 'MARKET_FREIGHT') return decodeMarketFreightDecision(parsed,cultivator,freightOptions);
  if (chosenAction === 'DISASTER_SHELTER') return decodeDisasterShelterDecision(parsed,cultivator,disasterShelterOptions);
  if (chosenAction === 'CRAFT_TRAINING') return decodeCraftTrainingDecision(parsed, cultivator, trainingOptions);
  if (parsed.craftTrainingMove !== undefined || parsed.targetCraftTraineeId !== undefined ||
      parsed.targetCraftTrainingId !== undefined) return undefined;
  if (chosenAction === 'WORKSHOP_ESTATE') return decodeWorkshopEstateDecision(parsed, cultivator, estateCraftOptions);
  if (chosenAction === 'WORKSHOP_RELEASE') {
    const exact = workshopReleaseOptions.find((item) => item.workshopReleaseMove === parsed.workshopReleaseMove &&
      item.targetWorkshopId === parsed.targetWorkshopId && item.targetWorkshopReleaseId === parsed.targetWorkshopReleaseId);
    if (!exact || Object.keys(parsed).some((key) => !['chosenAction', 'innerMonologue',
      'workshopReleaseMove', 'targetWorkshopId', ...(exact.workshopReleaseMove === 'propose'
        ? [] : ['targetWorkshopReleaseId'])].includes(key))) return undefined;
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '照原人、原地与眼前真实账目再作决定。';
    return workshopReleaseDecision(exact, innerMonologue);
  }
  const legalWorkshopCapacity = chosenAction === 'WORKSHOP_CAPACITY' ? capacityOptions.find((item) =>
    item.workshopCapacityMove === parsed.workshopCapacityMove && item.targetWorkshopId === parsed.targetWorkshopId) : undefined;
  if (chosenAction === 'WORKSHOP_CAPACITY' && (!legalWorkshopCapacity || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'workshopCapacityMove', 'targetWorkshopId'].includes(field)))) return undefined;

  const legalWorkshop = chosenAction === 'WORKSHOP' ? workshopOptions.find((item) =>
    item.workshopMove === parsed.workshopMove && item.targetWorkshopId === parsed.targetWorkshopId &&
    item.targetToolLoanId === parsed.targetToolLoanId &&
    item.targetCultivatorId === parsed.targetCultivatorId && item.workshopTier === parsed.workshopTier &&
    item.workshopQuantity === parsed.workshopQuantity && item.workshopQualityFloor === parsed.workshopQualityFloor) : undefined;
  if (chosenAction === 'WORKSHOP' && (!legalWorkshop || Object.entries(parsed).some(([field, value]) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'workshopMove', 'targetWorkshopId', 'targetCultivatorId',
      'workshopTier', 'workshopQuantity', 'workshopQualityFloor', 'targetToolLoanId'].includes(field) && !(field === 'action' && value === 'WORKSHOP')))) return undefined;
  const legalRecovery = chosenAction === 'TERRAIN_RECOVERY' ?
    recoveryOptions.find((item) => item.targetTerrainTileId === parsed.targetTerrainTileId) : undefined;
  if (chosenAction === 'TERRAIN_RECOVERY' && (!legalRecovery || parsed.targetCultivatorId !== undefined ||
      parsed.targetLocationId !== undefined || parsed.targetSectId !== undefined)) return undefined;
  const legalCommons = chosenAction === 'SHARED_COMMONS' ? commonsOptions.find((item) =>
    item.commonsMove === parsed.commonsMove && item.targetCommonsId === parsed.targetCommonsId &&
    item.targetLocationId === parsed.targetLocationId && item.targetHerbId === parsed.targetHerbId &&
    item.targetSectId === parsed.targetSectId && item.targetCommonsThirdSectId === parsed.targetCommonsThirdSectId) : undefined;
  if (chosenAction === 'SHARED_COMMONS' && (!legalCommons || parsed.targetCultivatorId !== undefined ||
      parsed.targetPillId !== undefined)) return undefined;
  const legalService = chosenAction === 'SECT_SERVICE' ? serviceOptions.find((item) => item.serviceMove === parsed.serviceMove) : undefined;
  if (chosenAction === 'SECT_SERVICE' && (!legalService || parsed.targetCultivatorId !== undefined ||
      parsed.targetLocationId !== undefined || parsed.targetSectId !== undefined)) return undefined;

  if (chosenAction === 'COURIER_HANDOFF') return decodeCourierHandoff(parsed, courierHandoffOptions);
  const legalCourier = chosenAction === 'SEALED_COURIER' ? courierOptions.find((item) =>
    item.courierMove === parsed.courierMove && item.targetDispatchId === parsed.targetDispatchId &&
    item.targetCourierId === parsed.targetCourierId && item.targetCultivatorId === parsed.targetCultivatorId &&
    item.dispatchCue === parsed.dispatchCue && item.targetDispatchSourceId === parsed.targetDispatchSourceId) : undefined;
  if (chosenAction === 'SEALED_COURIER' && (!legalCourier || parsed.targetSectId !== undefined ||
      parsed.targetLocationId !== undefined)) return undefined;

  const legalWork = chosenAction === 'VILLAGE_WORKS' ? worksOptions.find((item) =>
    item.villageWorkKind === parsed.villageWorkKind && item.targetSettlementId === parsed.targetSettlementId) : undefined;
  if (chosenAction === 'VILLAGE_WORKS' && (!legalWork || parsed.targetCultivatorId !== undefined ||
      parsed.targetSectId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalGuardianship = chosenAction === 'HOUSEHOLD_GUARDIAN' ? guardianOptions.find((item) =>
    item.guardianMove === parsed.guardianMove && item.targetGuardianshipId === parsed.targetGuardianshipId &&
    item.targetCultivatorId === parsed.targetCultivatorId) : undefined;
  if (chosenAction === 'HOUSEHOLD_GUARDIAN' && (!legalGuardianship || parsed.targetLocationId !== undefined ||
      parsed.targetSectId !== undefined)) return undefined;

  const legalLease = chosenAction === 'TERRITORIAL_LEASE' ? leaseOptions.find((item) =>
    item.leaseMove === parsed.leaseMove && item.targetSectId === parsed.targetSectId &&
    item.targetLocationId === parsed.targetLocationId && item.targetTerritorialLeaseId === parsed.targetTerritorialLeaseId) : undefined;
  if (chosenAction === 'TERRITORIAL_LEASE' && (!legalLease || parsed.targetCultivatorId !== undefined)) return undefined;

  const legalFormation = chosenAction === 'FORMATION_NETWORK' ? formationOptions.find((item) =>
    item.formationMove === parsed.formationMove && item.targetSectId === parsed.targetSectId &&
    item.targetFormationLinkId === parsed.targetFormationLinkId) : undefined;
  if (chosenAction === 'FORMATION_NETWORK' && (!legalFormation || parsed.targetLocationId !== undefined ||
      parsed.targetCultivatorId !== undefined)) return undefined;

  const legalStipend = chosenAction === 'SECT_STIPEND' ? stipendOptions.find((item) =>
    item.stipendMove === parsed.stipendMove && item.targetInfirmaryCaseId === parsed.targetInfirmaryCaseId &&
    item.targetStipendId === parsed.targetStipendId) : undefined;
  if (chosenAction === 'SECT_STIPEND' && (!legalStipend || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'stipendMove',
      legalStipend.stipendMove === 'offer' ? 'targetInfirmaryCaseId' : 'targetStipendId'].includes(field)))) return undefined;
  if (legalStipend) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '按旧勤实据与本人许可办理。';
    return legalStipend.stipendMove === 'offer'
      ? { chosenAction: 'SECT_STIPEND', stipendMove: 'offer', targetInfirmaryCaseId: legalStipend.targetInfirmaryCaseId, innerMonologue }
      : { chosenAction: 'SECT_STIPEND', stipendMove: legalStipend.stipendMove, targetStipendId: legalStipend.targetStipendId, innerMonologue };
  }
  if(chosenAction==='DANXIA_REVIEW'){
    const choice=danxiaReviewOptions.find(row=>row.danxiaReviewMove===parsed.danxiaReviewMove&&
      row.targetDanxiaReviewId===parsed.targetDanxiaReviewId&&row.targetSettlementRecordId===parsed.targetSettlementRecordId);
    if(!choice||Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','danxiaReviewMove','targetDanxiaReviewId',
      ...(choice.danxiaReviewMove==='propose_switch'?['targetSettlementRecordId']:[])].includes(field)))return undefined;
    const {action,...allowed}=choice;
    const text=typeof parsed.innerMonologue==='string'?parsed.innerMonologue.trim().slice(0,160):'';
    return {...allowed,chosenAction:action,innerMonologue:text||'按本人与实交凭据核对旧约。'};
  }
  if(chosenAction==='DANXIA_MEDICINE'){
    const choice=danxiaOptions.find(row=>row.danxiaMedicineMove===parsed.danxiaMedicineMove&&
      row.targetDanxiaShortageId===parsed.targetDanxiaShortageId&&row.targetDanxiaMedicineId===parsed.targetDanxiaMedicineId&&
      row.targetCultivatorId===parsed.targetCultivatorId);
    if(!choice||Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','danxiaMedicineMove','targetDanxiaShortageId',
        'targetDanxiaMedicineId','targetCultivatorId'].includes(field)))return undefined;
    const {action,...allowed}=choice;
    const text=typeof parsed.innerMonologue==='string'?parsed.innerMonologue.trim().slice(0,160):'';
    return {...allowed,chosenAction:action,innerMonologue:text||'按实到与约定核对。'};
  }
  const legalCareFollowup = chosenAction === 'CARE_FOLLOWUP' ? careFollowupOptions.find((item) =>
    item.careFollowupMove === parsed.careFollowupMove && item.targetInfirmaryCaseId === parsed.targetInfirmaryCaseId &&
    item.targetCareFollowupId === parsed.targetCareFollowupId) : undefined;
  if (chosenAction === 'CARE_FOLLOWUP' && (!legalCareFollowup || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'careFollowupMove',
      legalCareFollowup.careFollowupMove === 'schedule' ? 'targetInfirmaryCaseId' : 'targetCareFollowupId'].includes(field)))) return undefined;
  if (legalCareFollowup) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '按真实出院回执与现场核验复诊。';
    return legalCareFollowup.careFollowupMove === 'schedule'
      ? { chosenAction: 'CARE_FOLLOWUP', careFollowupMove: 'schedule', targetInfirmaryCaseId: legalCareFollowup.targetInfirmaryCaseId, innerMonologue }
      : { chosenAction: 'CARE_FOLLOWUP', careFollowupMove: legalCareFollowup.careFollowupMove,
        targetCareFollowupId: legalCareFollowup.targetCareFollowupId, innerMonologue };
  }
  const legalInfirmary = chosenAction === 'INFIRMARY' ? infirmaryOptions.find((item) =>
    item.infirmaryMove === parsed.infirmaryMove && item.targetInfirmaryCaseId === parsed.targetInfirmaryCaseId) : undefined;
  if (chosenAction === 'INFIRMARY' && (!legalInfirmary || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'infirmaryMove', 'targetInfirmaryCaseId'].includes(field)))) return undefined;

  const legalHabitat = chosenAction === 'HABITAT' ? habitatOptions.find((item) =>
    item.habitatMove === parsed.habitatMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetBeastId === parsed.targetBeastId && item.targetBeastReleaseId === parsed.targetBeastReleaseId) : undefined;
  if (chosenAction === 'HABITAT' && (!legalHabitat || parsed.targetSectId !== undefined ||
      parsed.targetCultivatorId !== undefined)) return undefined;

  const legalChronicleErrata = chosenAction === 'CHRONICLE_ERRATA' ? chronicleErrataOptions.find((item) =>
    item.chronicleErrataMove === parsed.chronicleErrataMove && item.targetChronicleSourceId === parsed.targetChronicleSourceId &&
    item.chronicleReliefReading === parsed.chronicleReliefReading && item.targetCultivatorId === parsed.targetCultivatorId) : undefined;
  if (chosenAction === 'CHRONICLE_ERRATA' && (!legalChronicleErrata || parsed.targetLocationId !== undefined ||
      parsed.targetSectId !== undefined)) return undefined;

  const legalRouteWarning = chosenAction === 'ROUTE_WARNING' ? routeWarningOptions.find((item) =>
    item.routeWarningMove === parsed.routeWarningMove && item.targetRouteWarningId === parsed.targetRouteWarningId &&
    item.targetRouteObservationId === parsed.targetRouteObservationId) : undefined;
  if (chosenAction === 'ROUTE_WARNING' && (!legalRouteWarning || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'routeWarningMove',
      ...(legalRouteWarning.routeWarningMove !== 'retract' ? ['targetRouteObservationId'] : []),
      ...(legalRouteWarning.routeWarningMove !== 'post' ? ['targetRouteWarningId'] : [])].includes(field)))) return undefined;

  const legalPilgrimage = chosenAction === 'PILGRIMAGE' ? pilgrimageOptions.find((item) =>
    item.pilgrimageMove === parsed.pilgrimageMove && item.targetPilgrimageId === parsed.targetPilgrimageId &&
    item.targetLocationId === parsed.targetLocationId && item.targetPilgrimageNextStopId === parsed.targetPilgrimageNextStopId &&
    item.targetRoadId === parsed.targetRoadId &&
    item.targetCultivatorId === parsed.targetCultivatorId) : undefined;
  if (chosenAction === 'PILGRIMAGE' && (!legalPilgrimage || parsed.targetSectId !== undefined)) return undefined;
  if ((legalPilgrimage?.pilgrimageMove === 'camp' || legalPilgrimage?.pilgrimageMove === 'resume' ||
      legalPilgrimage?.pilgrimageMove === 'dismantle') && Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'spokenLine', 'pilgrimageMove', 'targetPilgrimageId'].includes(field))) return undefined;

  const legalCredit = chosenAction === 'SECT_CREDIT' ? creditOptions.find((item) =>
    item.creditMove === parsed.creditMove && item.targetSectId === parsed.targetSectId &&
    item.targetCreditId === parsed.targetCreditId) : undefined;
  if (chosenAction === 'SECT_CREDIT' && (!legalCredit ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalSanctuary = chosenAction === 'SANCTUARY' ? sanctuaryOptions.find((item) =>
    item.sanctuaryMove === parsed.sanctuaryMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetSanctuaryId === parsed.targetSanctuaryId) : undefined;
  if (chosenAction === 'SANCTUARY' && (!legalSanctuary || parsed.targetCultivatorId !== undefined)) return undefined;

  const legalResearch = chosenAction === 'RESEARCH' ? researchOptions.find((item) =>
    item.researchMove === parsed.researchMove && item.researchTopic === parsed.researchTopic &&
    item.targetResearchId === parsed.targetResearchId && item.researchWithdrawReason === parsed.researchWithdrawReason) : undefined;
  if (chosenAction === 'RESEARCH' && (!legalResearch ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalCeasefire = chosenAction === 'CEASEFIRE' ? ceasefireOptions.find((item) =>
    item.ceasefireMove === parsed.ceasefireMove && item.targetSectId === parsed.targetSectId &&
    item.targetCeasefireId === parsed.targetCeasefireId) : undefined;
  if (chosenAction === 'CEASEFIRE' && (!legalCeasefire ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalEscort = chosenAction === 'ESCORT' ? escortOptions.find((item) =>
    item.escortMove === parsed.escortMove && item.targetShipmentId === parsed.targetShipmentId &&
    item.targetEscortId === parsed.targetEscortId && item.targetHazardId === parsed.targetHazardId) : undefined;
  if (chosenAction === 'ESCORT' && (!legalEscort ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalCompetition = chosenAction === 'RANK_SEASON'
    ? competitionOptions.find((item) => item.seasonMove === parsed.seasonMove) : undefined;
  if (chosenAction === 'RANK_SEASON' && (!legalCompetition ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalPavilionLoan = chosenAction === 'PAVILION_LOAN' ? pavilionLoanOptions.find((item) =>
    item.pavilionLoanMove === parsed.pavilionLoanMove && item.targetScriptureEditionId === parsed.targetScriptureEditionId &&
    item.targetPavilionLoanId === parsed.targetPavilionLoanId) : undefined;
  if (chosenAction === 'PAVILION_LOAN' && (!legalPavilionLoan || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'pavilionLoanMove',
      ...(legalPavilionLoan.pavilionLoanMove === 'shelve' || legalPavilionLoan.pavilionLoanMove === 'checkout'
        ? ['targetScriptureEditionId'] : legalPavilionLoan.pavilionLoanMove === 'read' || legalPavilionLoan.pavilionLoanMove === 'return'
        ? ['targetPavilionLoanId'] : [])].includes(field)))) return undefined;

  const legalScripture = chosenAction === 'SCRIPTURE' ? scriptureOptions.find((item) =>
    item.editionMove === parsed.editionMove && item.targetScriptureOriginalId === parsed.targetScriptureOriginalId &&
    item.targetScriptureEditionId === parsed.targetScriptureEditionId) : undefined;
  if (chosenAction === 'SCRIPTURE' && (!legalScripture ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalRelic = chosenAction === 'RELIC' ? relicOptions.find((item) =>
    item.relicMove === parsed.relicMove && item.targetRelicFragmentId === parsed.targetRelicFragmentId &&
    item.targetRelicSetId === parsed.targetRelicSetId) : undefined;
  if (chosenAction === 'RELIC' && (!legalRelic ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalRecollection = chosenAction === 'RECOLLECT'
    ? recollectionOptions.find((item) => item.recollectionMove === parsed.recollectionMove) : undefined;
  if (chosenAction === 'RECOLLECT' && (!legalRecollection ||
      parsed.targetCultivatorId !== undefined || parsed.targetLocationId !== undefined)) return undefined;

  const legalRelocation = chosenAction === 'RELOCATE' ? relocationOptions.find((item) =>
    item.relocationMove === parsed.relocationMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetRelocationId === parsed.targetRelocationId) : undefined;
  if (chosenAction === 'RELOCATE' && !legalRelocation) return undefined;

  if(chosenAction==='DOCTRINE_MATURITY'){
    const option=maturityOptions.find(row=>row.doctrineMaturityMove===parsed.doctrineMaturityMove&&
      row.targetDoctrineFoundingId===parsed.targetDoctrineFoundingId);
    if(!option||Object.keys(parsed).some(key=>!['chosenAction','innerMonologue','doctrineMaturityMove','targetDoctrineFoundingId'].includes(key)))return undefined;
    const {action,...safe}=option;
    const phrase=typeof parsed.innerMonologue==='string'?parsed.innerMonologue.trim().slice(0,160):'';
    return {...safe,chosenAction:action,innerMonologue:phrase||'按已知困境和本人资格处理。'};
  }
  if(chosenAction==='DOCTRINE_FOUNDING'){
    const option=foundingOptions.find(row=>row.doctrineFoundingMove===parsed.doctrineFoundingMove&&
      row.targetDoctrineFoundingId===parsed.targetDoctrineFoundingId&&row.targetDoctrineSchoolId===parsed.targetDoctrineSchoolId&&
      row.targetRelocationId===parsed.targetRelocationId);
    if(!option||Object.keys(parsed).some(key=>!['chosenAction','innerMonologue','doctrineFoundingMove',
      ...(option.doctrineFoundingMove==='propose'?['targetDoctrineSchoolId','targetRelocationId']:['targetDoctrineFoundingId'])].includes(key)))return undefined;
    const {action,...safe}=option;
    const phrase=typeof parsed.innerMonologue==='string'?parsed.innerMonologue.trim().slice(0,160):'';
    return {...safe,chosenAction:action,innerMonologue:phrase||'照本人许可和现存实据行事。'};
  }
  const legalDoctrine = chosenAction === 'DOCTRINE' ? doctrineOptions.find((item) =>
    item.doctrineMove === parsed.doctrineMove && item.doctrineTheme === parsed.doctrineTheme &&
    item.targetDoctrineSchoolId === parsed.targetDoctrineSchoolId &&
    item.targetDoctrineProposalId === parsed.targetDoctrineProposalId &&
    item.targetCultivatorId === parsed.targetCultivatorId) : undefined;
  if (chosenAction === 'DOCTRINE' && !legalDoctrine) return undefined;

  const isEstate = chosenAction === 'NAME_HEIR' || chosenAction === 'CLAIM_ESTATE' || chosenAction === 'HOLD_MEMORIAL';
  const legalEstate = isEstate && estateOptions.find((item) => item.action === chosenAction &&
    item.targetEstateId === parsed.targetEstateId && item.targetCultivatorId === parsed.targetCultivatorId);
  if (isEstate && !legalEstate) return undefined;

  const isWitness = chosenAction === 'FILE_WITNESS_CLAIM' || chosenAction === 'ATTEST_WITNESS' || chosenAction === 'CHALLENGE_WITNESS';
  const legalWitness = isWitness && witnessOptions.find((item) => item.action === chosenAction &&
    item.targetWitnessEventId === parsed.targetWitnessEventId &&
    item.targetWitnessClaimId === parsed.targetWitnessClaimId && item.targetCultivatorId === parsed.targetCultivatorId);
  if (isWitness && !legalWitness) return undefined;

  const legalSeasonReview = chosenAction === 'SEASON_REVIEW' ?
    honorReviewOptions.find((item) => item.targetScoreId === parsed.targetScoreId) : undefined;
  if (chosenAction === 'SEASON_REVIEW' && (!legalSeasonReview || parsed.targetLocationId !== undefined ||
      parsed.targetCultivatorId !== undefined || parsed.targetSectId !== undefined)) return undefined;
  if (parsed.observatoryStation !== undefined && chosenAction !== 'FIELD_OBSERVATORY') return undefined;
  const legalAligned = chosenAction === 'ALIGNED_WEATHER' ? alignedWeatherOptions.find((item) =>
    item.alignedWeatherMove === parsed.alignedWeatherMove && item.targetAlignedWeatherId === parsed.targetAlignedWeatherId &&
    item.targetLocationId === parsed.targetLocationId && item.targetCultivatorId === parsed.targetCultivatorId &&
    item.targetObservatoryTick === parsed.targetObservatoryTick) : undefined;
  if (chosenAction === 'ALIGNED_WEATHER' && (!legalAligned || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'alignedWeatherMove', ...(legalAligned.alignedWeatherMove === 'offer'
      ? ['targetLocationId', 'targetCultivatorId', 'targetObservatoryTick']
      : legalAligned.alignedWeatherMove === 'compare' ? ['targetAlignedWeatherId', 'targetObservatoryTick']
      : ['targetAlignedWeatherId'])].includes(field)))) return undefined;
  if (legalAligned) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0,160)) ||
      cultivator.innerMonologue || '只按同刻亲历许可核验。';
    if (legalAligned.alignedWeatherMove === 'offer') return { chosenAction:'ALIGNED_WEATHER', alignedWeatherMove:'offer',
      targetLocationId:legalAligned.targetLocationId, targetCultivatorId:legalAligned.targetCultivatorId,
      targetObservatoryTick:legalAligned.targetObservatoryTick, innerMonologue };
    if (legalAligned.alignedWeatherMove === 'compare') return { chosenAction:'ALIGNED_WEATHER', alignedWeatherMove:'compare',
      targetAlignedWeatherId:legalAligned.targetAlignedWeatherId,
      targetObservatoryTick:legalAligned.targetObservatoryTick, innerMonologue };
    return { chosenAction:'ALIGNED_WEATHER', alignedWeatherMove:legalAligned.alignedWeatherMove,
      targetAlignedWeatherId:legalAligned.targetAlignedWeatherId, innerMonologue };
  }
  const legalObservatory = chosenAction === 'FIELD_OBSERVATORY' ? observatoryOptions.find((item) =>
    item.observatoryMove === parsed.observatoryMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetObservatoryTick === parsed.targetObservatoryTick && item.targetCultivatorId === parsed.targetCultivatorId &&
    item.observatoryStation === parsed.observatoryStation) : undefined;
  if (chosenAction === 'FIELD_OBSERVATORY' && (!legalObservatory || parsed.targetSectId !== undefined ||
      parsed.targetSettlementId !== undefined)) return undefined;
  const legalCivicMemorial = chosenAction === 'CIVIC_MEMORIAL' ? civicMemorialOptions.find((item) =>
    item.civicMemorialMove === parsed.civicMemorialMove && item.targetCivicDeedId === parsed.targetCivicDeedId &&
    item.targetCivicMemorialId === parsed.targetCivicMemorialId) : undefined;
  if(chosenAction==='CIVIC_MEMORIAL'){
    if(!legalCivicMemorial)return undefined;
    const fields=legalCivicMemorial.civicMemorialMove==='propose'?['targetCivicDeedId']:
      legalCivicMemorial.civicMemorialMove==='verify'?['targetCivicMemorialId']:['targetCivicDeedId','targetCivicMemorialId'];
    if(Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','civicMemorialMove',...fields].includes(field)))return undefined;
  }
  const legalCensus = chosenAction === 'VILLAGE_CENSUS' ? censusOptions.find((item) =>
    item.targetSettlementId === parsed.targetSettlementId) : undefined;
  if (chosenAction === 'VILLAGE_CENSUS' && (!legalCensus || parsed.targetLocationId !== undefined ||
      parsed.targetCultivatorId !== undefined || parsed.targetVolunteerId !== undefined || parsed.targetSectId !== undefined)) return undefined;
  const isSettlement = chosenAction === 'RECRUIT_SETTLER' || chosenAction === 'DELIVER_RELIEF';
  const legalSettlement = isSettlement && settlementOptions.find((item) => item.action === chosenAction &&
    item.targetSettlementId === parsed.targetSettlementId && item.targetVolunteerId === parsed.targetVolunteerId);
  if (isSettlement && !legalSettlement) return undefined;

  const isMarket = chosenAction === 'PLACE_MARKET_BUY' || chosenAction === 'PLACE_MARKET_SELL' || chosenAction === 'CANCEL_MARKET_ORDER';
  const legalMarket = isMarket && marketOptions.find((item) => item.action === chosenAction &&
    (item.action === 'CANCEL_MARKET_ORDER' ? item.targetMarketOrderId === parsed.targetMarketOrderId
      : item.marketGood === parsed.marketGood && item.marketQuantity === parsed.marketQuantity && item.marketLimitPrice === parsed.marketLimitPrice));
  if (isMarket && !legalMarket) return undefined;

  const legalArbitration = chosenAction === 'OATH_ARBITRATION' ? arbitrationOptions.find((item) =>
    item.arbitrationMove === parsed.arbitrationMove && item.targetOathId === parsed.targetOathId &&
    item.targetCultivatorId === parsed.targetCultivatorId && item.targetTenderTick === parsed.targetTenderTick) : undefined;
  if (chosenAction === 'OATH_ARBITRATION' && (!legalArbitration || parsed.targetSectId !== undefined ||
      parsed.targetLocationId !== undefined || parsed.oathTerm !== undefined)) return undefined;
  const oath = chosenAction === 'OFFER_OATH' || chosenAction === 'ACCEPT_OATH' || chosenAction === 'DECLINE_OATH' ||
    chosenAction === 'FULFILL_OATH' || chosenAction === 'APPEAL_OATH';
  const legalOath = oath && oathOptions.find((item) => item.action === chosenAction &&
    (chosenAction === 'OFFER_OATH' ? item.targetCultivatorId === parsed.targetCultivatorId && item.oathTerm === parsed.oathTerm
      : item.targetOathId === parsed.targetOathId));
  if (oath && !legalOath) return undefined;

  const training = chosenAction === 'TEACH' || chosenAction === 'ACCEPT_TUITION' || chosenAction === 'DECLINE_TUITION';
  const legalTraining = training && mentorshipOptions.find((item) => item.action === chosenAction &&
    (chosenAction === 'TEACH' ? item.targetCultivatorId === parsed.targetCultivatorId : item.targetTuitionId === parsed.targetTuitionId));
  if (training && !legalTraining) return undefined;

  const currentlyFacing = isTribulationActive(cultivator);
  const stance = parsed.tribulationStance;
  const validStance = stance === 'guard' || stance === 'focus' || stance === 'defy';
  if (currentlyFacing && (chosenAction !== 'FACE_TRIBULATION' || !validStance)) return undefined;
  if (!currentlyFacing && chosenAction === 'FACE_TRIBULATION') return undefined;
  if (chosenAction === 'AMBUSH_TRIBULATION' &&
      !availableAmbushTargets(cultivator, world).some((target) => target.id === parsed.targetCultivatorId)) {
    return undefined;
  }
  if (chosenAction === 'EXPLORE' && parsed.targetLocationId !== undefined &&
      !knownLocations.some((item) => item.id === parsed.targetLocationId) && parsed.targetLocationId !== unverifiedTrail) return undefined;
  if ((chosenAction === 'CHALLENGE_LEADERSHIP' || chosenAction === 'PLOT_COUP') &&
      !availableLeadershipActions(cultivator, world).some((option) => option.action === chosenAction && option.targetCultivatorId === parsed.targetCultivatorId)) {
    return undefined;
  }
  const legalBeast = chosenAction === 'TAME_BEAST' ? availableBeastTames(cultivator, world).find((item) => item.targetBeastId === parsed.targetBeastId) : undefined;
  if (chosenAction === 'TAME_BEAST' && !legalBeast) return undefined;
  const legalHunt = chosenAction === 'PURSUE_BOUNTY' ? availableBountyHunts(cultivator, world).find((item) => item.targetBountyId === parsed.targetBountyId) : undefined;
  if (chosenAction === 'PURSUE_BOUNTY' && !legalHunt) return undefined;
  const legalOccasion = chosenAction === 'JOIN_OCCASION' ? availableOccasionJoins(cultivator, world,requestTick).find((item) => item.targetOccasionId === parsed.targetOccasionId) : undefined;
  if (chosenAction === 'JOIN_OCCASION' && !legalOccasion) return undefined;
  const foreign = chosenAction === 'OFFER_ALLIANCE' || chosenAction === 'DECLARE_WAR' || chosenAction === 'DEMAND_TRIBUTE' || chosenAction === 'LAUNCH_SIEGE';
  const legalForeign = foreign ? availableDiplomacyActions(cultivator, world)
    .find((option) => option.action === chosenAction && option.targetSectId === parsed.targetSectId) : undefined;
  if (foreign && !legalForeign) return undefined;
  const infrastructureChoice = chosenAction === 'BUILD_FACILITY' || chosenAction === 'DISPATCH_GUARD' || chosenAction === 'GUARD_DUTY';
  const legalInfrastructure = infrastructureChoice ? availableSectEconomyActions(cultivator, world).find((item) =>
    item.action === chosenAction && item.facilityKind === parsed.facilityKind &&
    item.targetCultivatorId === parsed.targetCultivatorId && item.targetLocationId === parsed.targetLocationId) : undefined;
  if (infrastructureChoice && !legalInfrastructure) return undefined;
  const legalSalvage = chosenAction === 'SALVAGE_ARTIFACT' ? salvageOptions.find((item) =>
    item.targetArtifactId === parsed.targetArtifactId && item.targetLocationId === parsed.targetLocationId) : undefined;
  if (chosenAction === 'SALVAGE_ARTIFACT' && (!legalSalvage || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'targetArtifactId', 'targetLocationId'].includes(field)))) return undefined;
  const artifactAction = chosenAction === 'FORGE_ARTIFACT' || chosenAction === 'BIND_ARTIFACT' || chosenAction === 'REPAIR_ARTIFACT' || chosenAction === 'AWAKEN_ARTIFACT';
  const legalArtifact = artifactAction ? availableArtifactActions(cultivator, world, requestTick).find((item) =>
    item.action === chosenAction && item.targetArtifactId === parsed.targetArtifactId && item.forgeTier === parsed.forgeTier) : undefined;
  if (artifactAction && !legalArtifact) return undefined;
  const legalSeed = chosenAction === 'SEED_CULTURE' ? seedOptions.find((item) =>
    item.seedMove === parsed.seedMove && item.targetLocationId === parsed.targetLocationId &&
    item.targetSeedLotId === parsed.targetSeedLotId && item.targetSeedPlotId === parsed.targetSeedPlotId) : undefined;
  if (chosenAction === 'SEED_CULTURE' && (!legalSeed || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'seedMove', legalSeed.seedMove === 'reserve' ? 'targetLocationId'
      : legalSeed.seedMove === 'harvest' ? 'targetSeedPlotId' : 'targetSeedLotId'].includes(field)))) return undefined;
  if (legalSeed) {
    const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
      cultivator.innerMonologue || '按本人在实地确认的种料行事。';
    if (legalSeed.seedMove === 'reserve') return { chosenAction: 'SEED_CULTURE', seedMove: 'reserve',
      targetLocationId: legalSeed.targetLocationId, innerMonologue };
    if (legalSeed.seedMove === 'harvest') return { chosenAction: 'SEED_CULTURE', seedMove: 'harvest',
      targetSeedPlotId: legalSeed.targetSeedPlotId, innerMonologue };
    return { chosenAction: 'SEED_CULTURE', seedMove: legalSeed.seedMove,
      targetSeedLotId: legalSeed.targetSeedLotId, innerMonologue };
  }
  const alchemyAction = chosenAction === 'GATHER_HERBS' || chosenAction === 'BREW_PILL' || chosenAction === 'USE_PILL';
  const legalAlchemy = alchemyAction ? availableAlchemy(cultivator, world, requestTick).find((option) =>
    option.action === chosenAction && option.targetHerbId === parsed.targetHerbId &&
    option.targetPillId === parsed.targetPillId && option.targetCultivatorId === parsed.targetCultivatorId) : undefined;
  if (alchemyAction && !legalAlchemy) return undefined;
  if ((chosenAction === 'AUTHOR_TECHNIQUE' && !mayAuthorTechnique(cultivator)) ||
      (chosenAction === 'STUDY_TECHNIQUE' && !availableTechniques(cultivator, world).some((option) => option.id === parsed.targetTechniqueId))) {
    return undefined;
  }
  if ((chosenAction === 'TRADE' || chosenAction === 'DUAL_CULTIVATE' || chosenAction === 'SECT_DIPLOMACY') &&
      !availableEncounters(cultivator, world).some((option) => option.action === chosenAction && option.targetId === parsed.targetCultivatorId)) {
    return undefined;
  }
  if (chosenAction === 'PURSUE_SCHEME' && !currentPlan && (!isSchemeKind(parsed.proposedScheme) || !eligiblePlans.includes(parsed.proposedScheme))) {
    return undefined;
  }

  return {
    innerMonologue: privatePersonaText(parsed.innerMonologue) ??
      privatePersonaText(cultivator.innerMonologue) ?? personaLine(cultivator, 'thought'),
    chosenAction,
    targetLocationId: legalSalvage ? legalSalvage.targetLocationId : legalBoundaryRelief ? legalBoundaryRelief.targetLocationId : legalFurnace ? legalFurnace.targetLocationId : legalSanctuary ? legalSanctuary.targetLocationId : legalRelocation ? legalRelocation.targetLocationId :
      chosenAction !== 'DOCTRINE' && typeof parsed.targetLocationId === 'string' ? parsed.targetLocationId : undefined,
    targetCultivatorId: legalBoundaryRelief ? legalBoundaryRelief.targetCultivatorId : legalShortShift ? legalShortShift.targetCultivatorId : legalSparring ? legalSparring.targetCultivatorId : legalObservatory ? legalObservatory.targetCultivatorId : legalArbitration ? legalArbitration.targetCultivatorId : legalWorkshop ? legalWorkshop.targetCultivatorId : legalDoctrine ? legalDoctrine.targetCultivatorId : legalEstate ? legalEstate.targetCultivatorId : legalWitness ? legalWitness.targetCultivatorId : legalOath ? legalOath.targetCultivatorId : legalTraining ? legalTraining.targetCultivatorId
      : typeof parsed.targetCultivatorId === 'string' ? parsed.targetCultivatorId : undefined,
    spokenLine: typeof parsed.spokenLine === 'string' ? parsed.spokenLine.trim().slice(0, 90) : undefined,
    facilityKind: legalInfrastructure?.facilityKind,
    targetSectId: legalCommons?.targetSectId ?? legalLease?.targetSectId ?? legalFormation?.targetSectId ?? legalCredit?.targetSectId ?? legalCeasefire?.targetSectId ?? legalForeign?.targetSectId,
    targetOccasionId: legalRescue?.targetOccasionId ?? legalOccasion?.targetOccasionId,
    rescueMove: legalRescue?.rescueMove,
    targetExpeditionRescueId: legalRescue?.targetExpeditionRescueId,
    targetBountyId: legalHunt?.targetBountyId,
    targetBeastId: legalHabitat?.targetBeastId ?? legalBeast?.targetBeastId,
    tribulationStance: chosenAction === 'FACE_TRIBULATION' && validStance ? stance : undefined,
    targetArtifactId: legalSalvage?.targetArtifactId ?? legalExhibit?.targetArtifactId ?? legalArtifact?.targetArtifactId,
    forgeTier: legalArtifact?.forgeTier,
    targetHerbId: legalCommons?.targetHerbId ?? legalAlchemy?.targetHerbId,
    targetPillId: legalAlchemy?.targetPillId,
    roadMove: legalRoad?.roadMove,
    targetRoadId: legalRoad?.targetRoadId ?? legalPilgrimage?.targetRoadId,
    probationMove: legalProbation?.probationMove,
    targetProbationId: legalProbation?.targetProbationId,
    targetExpulsionId: legalProbation?.targetExpulsionId,
    probationFirstVillageId: legalProbation?.probationFirstVillageId,
    probationSecondVillageId: legalProbation?.probationSecondVillageId,
    probationVote: legalProbation?.probationVote,
    exhibitMove: legalExhibit?.exhibitMove,
    targetRelicExhibitId: legalExhibit?.targetRelicExhibitId,
    workshopMove: legalWorkshop?.workshopMove,
    targetToolLoanId: legalWorkshop?.targetToolLoanId,
    workshopCapacityMove: legalWorkshopCapacity?.workshopCapacityMove,
    sparringMove: legalSparring?.sparringMove,
    targetSparringId: legalSparring?.targetSparringId,
    sparringRounds: legalSparring?.sparringRounds,
    furnaceMove: legalFurnace?.furnaceMove,
    targetFurnaceReservationId: legalFurnace?.targetFurnaceReservationId,
    furnaceSafetyMove: legalFurnaceSafety?.furnaceSafetyMove,
    targetFurnaceSafetyId: legalFurnaceSafety?.targetFurnaceSafetyId,
    targetWorkshopId: legalWorkshopCapacity?.targetWorkshopId ?? legalFurnace?.targetWorkshopId ?? legalWorkshop?.targetWorkshopId,
    workshopTier: legalWorkshop?.workshopTier,
    workshopQuantity: legalWorkshop?.workshopQuantity,
    workshopQualityFloor: legalWorkshop?.workshopQualityFloor,
    targetTerrainTileId: legalRecovery?.targetTerrainTileId,
    commonsMove: legalCommons?.commonsMove,
    targetCommonsId: legalCommons?.targetCommonsId,
    targetCommonsThirdSectId: legalCommons?.targetCommonsThirdSectId,
    serviceMove: legalService?.serviceMove,
    courierMove: legalCourier?.courierMove,
    targetCourierId: legalCourier?.targetCourierId,
    dispatchCue: legalCourier?.dispatchCue,
    targetDispatchId: legalCourier?.targetDispatchId,
    targetDispatchSourceId: legalCourier?.targetDispatchSourceId,
    villageWorkKind: legalWork?.villageWorkKind,
    guardianMove: legalGuardianship?.guardianMove,
    targetGuardianshipId: legalGuardianship?.targetGuardianshipId,
    leaseMove: legalLease?.leaseMove,
    targetTerritorialLeaseId: legalLease?.targetTerritorialLeaseId,
    formationMove: legalFormation?.formationMove,
    targetFormationLinkId: legalFormation?.targetFormationLinkId,
    infirmaryMove: legalInfirmary?.infirmaryMove,
    targetInfirmaryCaseId: legalInfirmary?.targetInfirmaryCaseId,
    habitatMove: legalHabitat?.habitatMove,
    targetBeastReleaseId: legalHabitat?.targetBeastReleaseId,
    chronicleErrataMove: legalChronicleErrata?.chronicleErrataMove,
    targetChronicleSourceId: legalChronicleErrata?.targetChronicleSourceId,
    chronicleReliefReading: legalChronicleErrata?.chronicleReliefReading,
    routeWarningMove: legalRouteWarning?.routeWarningMove,
    targetRouteWarningId: legalRouteWarning?.targetRouteWarningId,
    targetRouteObservationId: legalRouteWarning?.targetRouteObservationId,
    pilgrimageMove: legalPilgrimage?.pilgrimageMove,
    targetPilgrimageId: legalPilgrimage?.targetPilgrimageId,
    targetPilgrimageNextStopId: legalPilgrimage?.targetPilgrimageNextStopId,
    creditMove: legalCredit?.creditMove,
    targetCreditId: legalCredit?.targetCreditId,
    sanctuaryMove: legalSanctuary?.sanctuaryMove,
    targetSanctuaryId: legalSanctuary?.targetSanctuaryId,
    researchMove: legalResearch?.researchMove,
    researchTopic: legalResearch?.researchTopic,
    targetResearchId: legalResearch?.targetResearchId,
    researchWithdrawReason: legalResearch?.researchWithdrawReason,
    ceasefireMove: legalCeasefire?.ceasefireMove,
    targetCeasefireId: legalCeasefire?.targetCeasefireId,
    escortMove: legalEscort?.escortMove,
    targetShipmentId: legalEscort?.targetShipmentId,
    targetEscortId: legalEscort?.targetEscortId,
    targetHazardId: legalEscort?.targetHazardId,
    seasonMove: legalCompetition?.seasonMove,
    editionMove: legalScripture?.editionMove,
    targetScriptureOriginalId: legalScripture?.targetScriptureOriginalId,
    targetScriptureEditionId: legalPavilionLoan?.targetScriptureEditionId ?? legalScripture?.targetScriptureEditionId,
    pavilionLoanMove: legalPavilionLoan?.pavilionLoanMove,
    targetPavilionLoanId: legalPavilionLoan?.targetPavilionLoanId,
    relicMove: legalRelic?.relicMove,
    targetRelicFragmentId: legalRelic?.targetRelicFragmentId,
    targetRelicSetId: legalRelic?.targetRelicSetId,
    recollectionMove: legalRecollection?.recollectionMove,
    relocationMove: legalRelocation?.relocationMove,
    targetRelocationId: legalRelocation?.targetRelocationId,
    doctrineMove: legalDoctrine?.doctrineMove,
    doctrineTheme: legalDoctrine?.doctrineTheme,
    targetDoctrineSchoolId: legalDoctrine?.targetDoctrineSchoolId,
    targetDoctrineProposalId: legalDoctrine?.targetDoctrineProposalId,
    targetEstateId: legalEstate ? legalEstate.targetEstateId : undefined,
    targetWitnessEventId: legalWitness ? legalWitness.targetWitnessEventId : undefined,
    targetWitnessClaimId: legalWitness ? legalWitness.targetWitnessClaimId : undefined,
    villageSupplyMove: legalVillageSupply?.villageSupplyMove,
    targetVillageSupplyId: legalVillageSupply?.targetVillageSupplyId,
    civicMemorialMove: legalCivicMemorial?.civicMemorialMove,
    targetCivicDeedId: legalCivicMemorial?.targetCivicDeedId,
    targetCivicMemorialId: legalCivicMemorial?.targetCivicMemorialId,
    targetSettlementId: legalVillageSupply?.targetSettlementId ?? legalGranary?.targetSettlementId ?? legalCensus?.targetSettlementId ?? legalWork?.targetSettlementId ?? (legalSettlement ? legalSettlement.targetSettlementId : undefined),
    targetVolunteerId: legalSettlement ? legalSettlement.targetVolunteerId : undefined,
    marketGood: legalMarket && legalMarket.action !== 'CANCEL_MARKET_ORDER' ? legalMarket.marketGood : undefined,
    marketQuantity: legalMarket && legalMarket.action !== 'CANCEL_MARKET_ORDER' ? legalMarket.marketQuantity : undefined,
    marketLimitPrice: legalMarket && legalMarket.action !== 'CANCEL_MARKET_ORDER' ? legalMarket.marketLimitPrice : undefined,
    targetMarketOrderId: legalMarket && legalMarket.action === 'CANCEL_MARKET_ORDER' ? legalMarket.targetMarketOrderId : undefined,
    targetOathId: legalArbitration?.targetOathId ?? (legalOath ? legalOath.targetOathId : undefined),
    targetScoreId: legalSeasonReview?.targetScoreId,
    observatoryMove: legalObservatory?.observatoryMove,
    observatoryStation: legalObservatory?.observatoryStation,
    targetObservatoryTick: legalShortShift?.targetObservatoryTick ?? legalObservatory?.targetObservatoryTick,
    boundaryReliefMove: legalBoundaryRelief?.boundaryReliefMove,
    targetBoundaryReliefId: legalBoundaryRelief?.targetBoundaryReliefId,
    shortShiftMove: legalShortShift?.shortShiftMove,
    targetShortShiftId: legalShortShift?.targetShortShiftId,
    arbitrationMove: legalArbitration?.arbitrationMove,
    targetTenderTick: legalArbitration?.targetTenderTick,
    oathTerm: legalOath ? legalOath.oathTerm : undefined,
    targetTuitionId: legalTraining ? legalTraining.targetTuitionId : undefined,
    targetTechniqueId: legalCohort?.targetTechniqueId ??
      (chosenAction === 'STUDY_TECHNIQUE' && typeof parsed.targetTechniqueId === 'string' ? parsed.targetTechniqueId : undefined),
    granaryMove: legalGranary?.granaryMove,
    restitutionMove: legalRestitution?.restitutionMove,
    targetRestitutionId: legalRestitution?.targetRestitutionId,
    nameMove: legalHouseholdName?.nameMove,
    householdAlias: legalHouseholdName?.householdAlias,
    targetHouseholdNameId: legalHouseholdName?.targetHouseholdNameId,
    cohortMove: legalCohort?.cohortMove,
    targetCohortId: legalCohort?.targetCohortId,
    cohortInviteeIds: legalCohort?.cohortInviteeIds?.slice(),
    proposedScheme: chosenAction === 'PURSUE_SCHEME' && isSchemeKind(parsed.proposedScheme) ? parsed.proposedScheme : undefined,
    rumorIntent: chosenAction === 'SCHEMING' && (parsed.rumorIntent === 'FABRICATE' || parsed.rumorIntent === 'EXAGGERATE')
      ? parsed.rumorIntent : undefined,
  };
}

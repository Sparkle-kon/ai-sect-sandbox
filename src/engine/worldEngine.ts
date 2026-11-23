import {availableBanquetSeatActions,isPrivateBanquetSeatEvent,recordBanquetSeatInvitation,resolveBanquetSeatAction,settleBanquetSeats} from './banquetSeats';
import {exactBanquetSeatDecision} from './banquetSeatCognition';
import {advanceNightDoors,availableNightDoorActions,isPrivateNightDoorEvent,recordNightDoorArrival,recordNightDoorBlocked,resolveNightDoorAction} from './nightDoor';
import {exactNightDoorDecision} from './nightDoorCognition';
import {advanceReliefHomecomings,recordReliefHomecomingAid,recordReliefHomecomingMovement} from './reliefHomecoming';
import {advanceBoundaryGapResponses,availableBoundaryGapActions,resolveBoundaryGapAction,isPrivateBoundaryGapEvent} from './boundaryGap';
import {exactBoundaryGapDecision} from './boundaryGapCognition';
import {availableAbandonedQuarterActions,recordAbandonedQuarterMovement,resolveAbandonedQuarterAction,isPrivateAbandonedQuarterEvent} from './abandonedQuarter';
import {exactAbandonedQuarterDecision} from './abandonedQuarterCognition';
import {advanceFurnaceEmergencies,availableFurnaceEmergencyActions,furnaceEmergencyCrossingLocked,
  isPrivateFurnaceEmergencyEvent,resolveFurnaceEmergencyAction} from './furnaceEmergency';
import {exactFurnaceEmergencyDecision} from './furnaceEmergencyCognition';
import {availableApprenticeshipReunionActions,isPrivateApprenticeshipReunionEvent,recordApprenticeshipReunionMovement,
  recordApprenticeshipReunionQuiet,recordApprenticeshipReunionRounds,resolveApprenticeshipReunionAction} from './apprenticeshipReunion';
import {exactApprenticeshipReunionDecision} from './apprenticeshipReunionCognition';
import {advancePilgrimageForks,availablePilgrimageForkActions,isPrivatePilgrimageForkEvent,
  recordPilgrimageForkArrival,resolvePilgrimageForkAction} from './pilgrimageFork';
import {pilgrimageForkActedThisTick,pilgrimageForkTravelLocked} from './pilgrimageForkPresence';
import {exactPilgrimageForkDecision} from './pilgrimageForkCognition';
import {availableBattlefieldAftermathActions,isPrivateBattlefieldAftermathEvent,recordBattlefieldAftermathApproach,
  recordBattlefieldAftermathTerminal,resolveBattlefieldAftermathAction} from './battlefieldAftermath';
import {exactBattlefieldAftermathDecision} from './battlefieldAftermathCognition';
import {advanceVillageReunions,availableVillageReunionActions,isPrivateVillageReunionEvent,recordVillageReunionMovement,resolveVillageReunionAction} from './villageReunion';
import {exactVillageReunionDecision} from './villageReunionCognition';
import {availableVacantGateActions,isPrivateVacantGateEvent,stageVacantGateAction} from './vacantGate';
import {exactVacantGateDecision} from './vacantGateCognition';
import {availableWildMigrationActions,isPrivateWildMigrationEvent,resolveWildMigrationAction} from './wildMigration';
import {exactWildMigrationDecision} from './wildMigrationCognition';
import {availableFarewellLandingActions,isPrivateFarewellLandingEvent,resolveFarewellLandingAction} from './farewellLanding';
import {exactFarewellLandingDecision} from './farewellLandingCognition';
import {availableMercyReunionActions,isPrivateMercyReunionEvent,mercyReunionAidActed,mercyReunionAidPendingHold,recordMercyReunionMovement,
  recordMercySpared,resolveMercyReunionAction} from './mercyReunion';
import {conditionalMercyChoices,exactStoryMercyDecision,lawfulConditionalMercy} from './mercyReunionCognition';
import { availableFrontierGorgeActions, isPrivateFrontierGorgeEvent, resolveFrontierGorgeAction } from './frontierGorge';
import { exactFrontierGorgeDecision } from './frontierGorgeCognition';
import { advancePavilionFires, availablePavilionFireActions, isPrivatePavilionFireEvent, resolvePavilionFireAction } from './pavilionFire';
import { exactPavilionFireDecision } from './pavilionFireCognition';
import { availableCampaignAssemblyActions } from './campaignAssembly';
import { exactCampaignAssemblyDecision } from './campaignAssemblyCognition';
import { availableWitnessInquiryActions, isPrivateWitnessInquiryEvent, resolveWitnessInquiry } from './witnessInquiry';
import { exactWitnessInquiryDecision } from './witnessInquiryCognition';
import { availableFrontierNightHuntActions, initializeFrontierNightHunt, isPrivateFrontierNightHuntEvent, resolveFrontierNightHunt } from './frontierNightHunt';
import { exactFrontierNightHuntDecision } from './frontierNightHuntCognition';
import { availableSchoolFormChoices, closeSchoolFormDuel, deadSchoolFormContacts, isPrivateSchoolFormEvent,
  openSchoolFormDuel, schoolFormActualStroke, schoolFormCounterPayment, schoolFormDuelForParticipant, schoolFormPrivateEvent } from './schoolFormDuel';
import { exactSchoolFormDecision, schoolFormCommand } from './schoolFormDuelCognition';
import { isTaughtSwordPracticeEvent, recordTaughtSwordPractice } from './taughtSwordForm';
import type { NativeDuelModifier } from './nativeDuelRules';
import { availableCalamityArrayChoices, isPrivateCalamityArrayEvent, recordCalamityArrayChoice } from './calamityArray';
import { exactCalamityArrayDecision } from './calamityArrayCognition';
import { beastDuelContactForParticipant, beastDuelGuardEvent, consumeBeastDuelContact, openBeastDuelContact, openBeastDuelEvent,
  prepareBeastDuelResolution, pruneInvalidBeastDuelContacts, settleBeastGuard, settleBeastWithdraw } from './beastDuelProtection';
import type { BeastDuelContact } from '../types/beastDuelProtection';
import { availableBattlefieldRevisits, isBattlefieldRevisitEvent, recordBattlefieldReturn, resolveBattlefieldRevisit } from './battlefieldRevisit';
import { exactBattlefieldRevisitDecision } from './battlefieldRevisitCognition';
import {autonomousExpeditionRescueOptions,canPauseAftermathRescue,voluntaryHeartDemonChoiceEffect} from './heartDemonChoicePolicy';
import {availableHeartDemonRecovery,resolveHeartDemonRecovery} from './heartDemonAftermathEngine';
import {activeProtagonistFlight,availableProtagonistFlightActions} from './protagonistFlightEngine';
import {matchesProtagonistFlightOption} from './protagonistFlightCognition';
import { availableAscensionActions, reconcileAscensionInterruptions, resolveAscensionAction } from './ascensionEngine';
import { ascensionQuietWait, exactAscensionDecision } from './ascensionCognition';
import { ascensionDutyActive } from './ascensionPresence';
import { advanceCultivationClans, availableCultivationClanActions, resolveCultivationClanAction } from './cultivationClanEngine';
import { exactCultivationClanDecision } from './cultivationClanCognition';
import { publishTianjiGazette } from './tianjiGazetteEngine';
import { advanceImmortalAuctions, availableImmortalAuctionActions, recordImmortalAuctionDeparture, resolveImmortalAuctionAction } from './immortalAuctionEngine';
import { exactAuctionAmbushDecision, exactImmortalAuctionDecision } from './immortalAuctionCognition';
import {consumeDaoDuelIntents,previewDaoDuelIntents,recordDaoDuelIntents} from './daoPathEngine';
import { availableDaoPathActions, resolveDaoPathAction } from './daoPathEngine';
import { availableHeavenlyAlchemyActions, resolveHeavenlyAlchemyAction } from './heavenlyAlchemyEngine';
import { activeDungeonForActor, availableDungeonMoves, resolveDungeonAction } from './expeditionDungeonEngine';
import {RING_AUDIENCE_TABOO_TECHNIQUE,expireRingAudiences,finishRingAudienceExecution,pendingRingAudienceExecution} from './ringAudienceEngine';
import { personaLine } from './wildPersonaEngine';
import { captureDramaticBondFact } from './dramaticBondEngine';
import { availableGrandSiegeHeroActions } from './grandSiegeTheatreEngine';
import type { ForbiddenDuelContact, NativeDuelRolls } from '../types/forbiddenArt';
import { measureNativeDuel } from './nativeDuelRules';
import { consumeForbiddenDuelContact, forbiddenDuelForParticipant, openForbiddenDuelContact,
  prepareForbiddenDuelResolution, pruneInvalidForbiddenDuelContacts, recordForbiddenArtOutcome,
  type ForbiddenArtActivation } from './forbiddenArtEngine';
import { interruptStoryChoicesOnDeath } from './interruptedStoryChoices';
import {onLowerPlane} from './upperPassageIsolation';
import {isUpperArrayFieldAction,resolveUpperArrayFieldAction} from './upperArrayFieldActions';
import {advanceUpperArrayFieldTrade} from './upperArrayFieldTradeEngine';
import {resolveOrdinaryBreakthrough} from './ordinaryBreakthroughEngine';
import {isFrontierAction,resolveFrontierAction} from './frontierActions';
import {recordFrontierDeath,settleFrontierMortality} from './frontierMovementEngine';
import {advanceFrontierProduction} from './frontierProductionEngine';
import {advanceFrontierTrade} from './frontierTradeEngine';
import {advanceFrontierPortTrade} from './frontierPortTradeEngine';
import {advanceFrontierDrylandTrade} from './frontierDrylandTradeEngine';
import {recordUpperPassageDeath,settleUpperPassageMortality} from './upperPassageEngine';
import { recordRegionalActorReturn, recordRegionalEarlyPromotions, recordRegionalLatePromotions } from './regionalPromotionEngine';
import { beginRegionalSimulationTurn, deferRegionalActorTurn, finishRegionalSimulationTurn, recordRegionalTurnRegistry, renewRegionalProtectionAfterEvent } from './regionalSimulationEngine';
import {advanceDoctrineMaturity,resolveDoctrineMaturityAction} from './doctrineMaturityEngine';
import { resolveUpperPassageAction } from './upperPassageEngine';
import { advanceNorthGateRenewal,resolveNorthGateRenewalAction } from './northGateRenewalEngine';
import { resolveNorthWellReviewAction } from './northWellRevisitEngine';
import { resolveNorthMiningCharterAction } from './northMiningCharterEngine';
import { resolveWaterVeinAction } from './waterVeinEngine';
import { advanceDanxiaMedicine, resolveDanxiaMedicineAction } from './danxiaMedicineEngine';
import { advanceDanxiaSeasonReviews, resolveDanxiaReviewAction } from './danxiaSeasonReviewEngine';
import {advanceDoctrineFoundings,resolveDoctrineFoundingAction} from './doctrineFoundingEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from './danxiaMedicineTerms';
import {advanceDanxiaShortages,openDanxiaShortage} from './danxiaShortageEngine';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { recordOrdinaryActionEvidence, snapshotOrdinaryAction } from './ordinaryActionEvidence';
import { hasOrdinaryIntentHistory, isOrdinaryIntentAction, matchesOrdinaryIntent, modelOrdinaryIntentOptions, preferredOrdinarySocialIntent, rankOrdinaryIntents } from './ordinaryIntentEngine';
import {recordEraHistoryTurn} from './eraHistoryIndex';
import { advanceSeasonalHousing, recordSeasonalHousingMovement, resolveSeasonalHousingAction } from './seasonalHousingEngine';
import { advanceMentorTransfers, resolveMentorTransferAction } from './mentorTransferEngine';
import { advanceSeasonReviews, resolveSeasonReviewAction } from './seasonReviewEngine';
import { advanceDamageAssurance, resolveDamageAssuranceAction } from './damageAssuranceEngine';
import { advanceAlignedWeather, resolveAlignedWeatherAction } from './alignedWeatherEngine';
import { advanceFieldObservatories, resolveObservatoryAction } from './fieldObservatoryEngine';
import { resolveOathArbitrationAction } from './oathArbitrationEngine';
import { closeVillageCensusPeriod, resolveVillageCensusAction } from './villageCensusEngine';
import { advanceRoads, resolveRoadAction } from './roadEngine';
import { advanceProbation, resolveProbationAction } from './probationEngine';
import { advanceRelicExhibits, resolveRelicExhibitAction } from './relicExhibitEngine';
import { advanceScribeCommissions, resolveScribeCommissionAction } from './scribeCommissionEngine';
import { advanceWorkshopInstitutionClosures, advanceWorkshops, resolveWorkshopAction, resolveWorkshopCapacityAction, resolveWorkshopEstateAction, resolveWorkshopReleaseAction } from './workshopEngine';
import { openFurnaceTurn, resolveFurnaceReservationAction, settleFurnaceTurn } from './furnaceReservationEngine';
import { advanceSparring, resolveSparringAction, sparringLocksActor } from './sparringEngine';
import { availableExpeditionRescueActions, resolveExpeditionRescueAction } from './expeditionRescueEngine';
import { advanceShortShifts, resolveShortShiftAction } from './shortShiftEngine';
import { advanceBoundaryReliefs, resolveBoundaryReliefAction } from './boundaryReliefEngine';
import { advanceApprenticeCohorts, recordCohortPractice, resolveApprenticeCohortAction } from './apprenticeCohortEngine';
import { advanceHouseholdNames, resolveHouseholdNameAction } from './householdNameEngine';
import { resolveVillageGranaryAction } from './villageGranaryEngine';
import { advanceVillageSupply, resolveVillageSupplyAction } from './villageSupplyEngine';
import { resolvePavilionLoanAction } from './pavilionLoanEngine';
import { advanceCivicMemorials,resolveCivicMemorialAction } from './civicMemorialEngine';
import { advanceVillageFairs,resolveVillageFairAction } from './villageFairEngine';
import { advanceSectStipends,resolveSectStipendAction } from './sectStipendEngine';
import { advanceSeedCulture,resolveSeedCultureAction } from './seedCultureEngine';
import { advanceToolLoans,resolveToolLoanAction } from './toolLoanEngine';
import { advanceRouteWarnings,availableRouteWarningActions,resolveRouteWarningAction } from './routeWarningEngine';
import { resolveCaravanRestitutionAction } from './caravanRestitutionEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';
import { advanceTerrainSuccession, resolveTerrainRecovery } from './terrainSuccessionEngine';
import { openResourceFlowMonth } from './resourceFlowEngine';
import { advanceSharedCommons, resolveSharedCommonsAction } from './sharedCommonsEngine';
import { resolveServiceRetirementAction } from './serviceRetirementEngine';
import { cloneWorldWithColdHistory, compactColdHistory } from './coldHistoryEngine';
import { advanceCausalChronicle } from './chronicleCausalityEngine';
import { activeCourierForActor, advanceCouriers, courierActedThisTick, courierCheckpoint, courierHandoffMayOfferNow,
  reconcileCourierDeaths, resolveCourierAction, resolveCourierHandoffAction } from './sealedCourierEngine';
import { captureWatchDigests } from './watchlistEngine';
import { advanceVillageWorks, resolveVillageWorksAction } from './villageWorksEngine';
import { advanceWaterVein } from './waterVeinEngine';
import { advanceNorthMiningCharters } from './northMiningCharterEngine';
import { advanceHouseholds, resolveGuardianAction } from './householdEngine';
import { advanceTerritorialLeases, resolveTerritorialLeaseAction } from './territorialLeaseEngine';
import { advanceFormations, resolveFormationAction } from './formationNetworkEngine';
import { advanceCareFollowups, resolveCareFollowupAction } from './careFollowupEngine';
import { advanceInfirmaries, beginClinicDutyTurn, resolveInfirmaryAction } from './infirmaryEngine';
import { advanceHabitats, resolveHabitatAction } from './habitatEngine';
import { advanceChronicleErrata, resolveChronicleErrataAction } from './chronicleErrataEngine';
import { advanceCraftTraining, resolveCraftTrainingAction } from './craftTrainingEngine';
import { advanceDisasterShelters, resolveDisasterShelterAction } from './disasterShelterEngine';
import { disasterShelterCheckpoint, disasterShelterLocksTravel } from './disasterShelterCheckpoint';
import { advanceWaypostMeals, resolveWaypostMealAction } from './waypostMealEngine';
import { activePilgrimageForActor, advancePilgrimages, pilgrimageActedThisTick, pilgrimageCheckpoint, resolvePilgrimageAction } from './pilgrimageEngine';
import { advanceSectCredit, resolveSectCreditAction } from './sectCreditEngine';
import { advanceSanctuaries, interceptSanctuaryDuel, resolveSanctuaryAction } from './sanctuaryEngine';
import { advanceResearch, resolveResearchAction } from './researchEngine';
import { advanceCeasefires, availableCeasefireActions, recordCeasefireHostility, resolveCeasefireAction } from './ceasefireEngine';
import { activeEscortForActor, resolveEscortAction, resolveMarketFreightAction } from './escortEngine';
import { advanceCompetitionSeasons, publicCompetitionStandings, recordBreakthroughCompetition, recordReliefCompetition, resolveCompetitionAction } from './competitionEngine';
import { resolveScriptureAction } from './scriptureEngine';
import { reconcileRelicCustody, resolveRelicAction, transferLootedRelics } from './relicEngine';
import { advanceReincarnation, resolveRecollectionAction } from './reincarnationEngine';
import { recordNewDeathsForReincarnation } from './reincarnationRuntime';
import { activeRelocationForActor, advanceRelocations, resolveRelocationAction } from './relocationEngine';
import { advanceDoctrines, resolveDoctrineAction } from './doctrineEngine';
import { legalTraceCandidates, recordDecisionTrace, rememberReplayDecision } from './decisionTraceEngine';
import type { DecisionReplayTape } from './decisionTraceEngine';
import type { DecisionTraceCandidate } from '../types/world';
import { advanceEstates, resolveEstateAction } from './estateEngine';
import { advanceWitnesses, resolveWitnessAction } from './witnessEngine';
import { advanceSettlements, resolveSettlementAction } from './settlementEngine';
import { advanceMarkets, resolveMarketAction } from './marketEngine';
import { weatherTravelFriction } from './weatherEngine';
import { advanceOaths, resolveOathAction } from './oathEngine';
import { maintainMentorship, mentorshipTechniqueMultiplier, resolveMentorshipAction } from './mentorshipEngine';
import { worldRandom } from './worldRandom';
import { activeAvatar, consumeAvatarOrder, maintainPlayerAvatar } from './avatarEngine';
import {activeRoguelikeEncounter,chooseRoguelikeEncounterDecision,finalizeRoguelikeEncounters,
  maybeOpenRoguelikeEncounter,settleRoguelikeEncounter} from './roguelikeEncounterEngine';
import {ROGUELIKE_ENCOUNTER_CHOICES} from '../types/roguelikeEncounter';
import { activeDestinyTraitOffer, chooseDestinyTraitDecision, destinyCultivationDetox, destinyCultivationMultiplier,
  finalizeDestinyTraitOffers, maybeOpenDestinyTrait, settleDestinyTrait } from './destinyTraitEngine';
import { archiveChronicleEvents } from './novelGenerator';
import { advanceWitnessedPersonalStory, captureWitnessedPersonalScene } from './witnessedPersonalStory';
import { finalizeProtagonistFlightTurn } from './protagonistFlightEngine';
import { recordFlightPursuit, trackFlightTurn } from './protagonistFlightTape';
import { advanceProtagonistSuccession } from './protagonistSuccession';
import { settleChronicleOffline } from './chronicleRuntime';
import { settleAnnualCouncilOffline } from './councilRuntime';
import {
  Cultivator,
  LLMDecisionPayload,
  RelationType,
  WorldEvent,
  WorldState,
} from '../types/world';
import { availableAutonomousAscensionActions, availableAutonomousCultivationClanActions, availableAutonomousDaoPathActions, availableAutonomousHeavenlyAlchemyActions, availableAutonomousImmortalAuctionActions, computeHeuristicDecision, currentAuctionAmbushOffer, daoPathTurnLocked, dungeonDecisionOccasion, exactDaoPathDecision, exactDungeonDecision, exactHeavenlyAlchemyDecision, isProviderPersonaDecision, requiredBeforeOrdinaryDecision, utilityCeasefireDecision, utilityDungeonDecision, utilityExpeditionRescueDecision, utilityAscensionDecision, waitForOwnClanChoice } from './llmBrain';
import { maintainMemories, recordMemory } from './memoryEngine';
import { synthesizeReflections } from './reflectionEngine';
import { fabricateRumor, knownRumorLead, spreadRumors, witnessEvent } from './rumorEngine';
import { expireScheme, pursueScheme } from './schemeEngine';
import { scriptedDialogue } from './dialogueEngine';
import { resolveEncounter } from './encounterEngine';
import { cultivationMultiplier } from './elementalEngine';
import { authorTechnique, dropInheritance, gainMastery, masteryMultiplier, studyTechnique } from './techniqueEngine';
import { maintainAlchemy, resolveAlchemy } from './alchemyEngine';
import { lootStorageRing, resolveArtifactAction, wearArtifact } from './artifactEngine';
import { interfereTribulation, isTribulationActive, recommendedTribulationStance, resolveTribulation, tribulationTarget, triggerTribulation } from './tribulationEngine';
import { maintainSectPolitics, resolveLeadershipAction, rewardContribution } from './sectPoliticsEngine';
import { maintainSectEconomy, mitigateSectArray, previewSectArrayDamage, resolveSectEconomyAction, sectQiBonus } from './sectEconomyEngine';
import { activeSiegeForActor, advanceDiplomacy, resolveDiplomacyAction } from './diplomacyEngine';
import { activeOccasionForActor, advanceOccasions, joinOccasion } from './occasionEngine';
import { isPrivateTournamentBanquetEvent, recordTournamentBanquetAfterTalk } from './tournamentBanquet';
import { advanceBounties, pursueBounty, recordTransgression } from './bountyEngine';
import { knownMapLocations, noteTerrainVisit } from './terrainEngine';
import { deriveMapPresentation } from './mapMotionEngine';
import { advanceMapHazards } from './mapBrushEngine';
import { resolveFurnaceSafetyAction } from './furnaceSafetyEngine';
import { resolveArtifactSalvageAction } from './artifactSalvageEngine';
import { advanceSpiritBeasts, tameSpiritBeast } from './spiritBeastEngine';

export type GodInterventionType =
  | 'SPAWN_TREASURE'
  | 'TRIBULATION_STRIKE'
  | 'DEMONIC_TIDE'
  | 'WHISPER_MIND';

export interface GodInterventionCommand {
  type: GodInterventionType;
  targetCultivatorId?: string;
  targetLocationId?: string;
  whisperText?: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function adjustRelationship(
  world: WorldState,
  fromId: string,
  toId: string,
  delta: number,
  fallbackType: RelationType,
  noteUpdate?: string
): void {
  const existing = world.relationships.find(
    (r) =>
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId && r.toId === fromId)
  );
  if (existing) {
    existing.affinity = clamp(existing.affinity + delta, -100, 100);
    if (existing.affinity <= -60) {
      existing.type = '血仇';
    } else if (existing.affinity >= 80 && existing.type === '竞争') {
      existing.type = '挚友';
    }
    if (noteUpdate) {
      existing.note = noteUpdate;
    }
  } else {
    world.relationships.push({
      fromId,
      toId,
      type: fallbackType,
      affinity: clamp(delta, -100, 100),
      note: noteUpdate ?? '修仙界因果交集',
    });
  }
}

function closeInterruptedTrial(actor: Cultivator, tick: number): void {
  interruptStoryChoicesOnDeath(actor, tick, '应劫者已先行陨落，本次天劫中断。');
}

function recordAuxiliaryActionEvent(world: WorldState, event: WorldEvent, emit?: (value: WorldEvent) => void): void {
  if (emit) { emit(event); return; }
  if(!isPrivateMercyReunionEvent(event))witnessEvent(world,event);
  archiveChronicleEvents(world,[event]);
  world.events = [event, ...world.events].slice(0, 120);
}

function applyUpperPassageDecision(world:WorldState,cultivator:Cultivator,decision:LLMDecisionPayload,
  explicitAvatarDecision:LLMDecisionPayload|undefined):WorldEvent|null{
  if(activeAvatar(world)?.id===cultivator.id&&decision!==explicitAvatarDecision)return null;
  const event=resolveUpperPassageAction(world,cultivator,decision);
  if(event){cultivator.innerMonologue=decision.innerMonologue;cultivator.currentAction='UPPER_PASSAGE';}
  return event;
}

function applyUpperArrayFieldDecision(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload,
  explicit?:LLMDecisionPayload):WorldEvent|null{
  if(activeAvatar(world)?.id===actor.id&&payload!==explicit)return null;
  const event=resolveUpperArrayFieldAction(world,actor,payload);
  if(event){actor.innerMonologue=payload.innerMonologue;actor.currentAction=payload.chosenAction;}
  return event;
}

function applyFrontierDecision(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload,rng:()=>number,explicit?:LLMDecisionPayload):WorldEvent|null {
  if(activeAvatar(world)?.id===actor.id&&payload!==explicit)return null;
  const event=resolveFrontierAction(world,actor,payload,rng);
  if(event){
    actor.innerMonologue=payload.innerMonologue;actor.currentAction=payload.chosenAction;
    if(payload.chosenAction==='FRONTIER'&&payload.frontierMove==='enter')initializeFrontierNightHunt(world,actor);
  }
  return event;
}

interface ForbiddenDuelSettlement {
  contact: ForbiddenDuelContact;
  activation: ForbiddenArtActivation;
}

/** Ordinary and suspended contact finish through the same real damage, witnesses, and inheritance. */
function settleNativeDuel(world:WorldState,cultivator:Cultivator,defender:Cultivator,decision:LLMDecisionPayload,
  rolls:NativeDuelRolls,authorizedBountyTargetId?:string,emit?:(event:WorldEvent)=>void,
  context?:ForbiddenDuelSettlement,beastGuardContact?:BeastDuelContact,formModifier?:NativeDuelModifier):WorldEvent{
  const location=world.locations.find(site=>site.id===cultivator.locationId);
  const finishDuel = (proof: WorldEvent,paid:ReturnType<typeof consumeDaoDuelIntents>=[]): WorldEvent => {
    recordDaoDuelIntents(world,proof,paid);
    const breach = recordCeasefireHostility(world, cultivator, defender, proof);
    if (breach) recordAuxiliaryActionEvent(world, breach, emit);
    return proof;
  };

  if(context?.activation.escape){
    const release=recordForbiddenArtOutcome(world,context.contact,context.activation,'escape');
    if(release)return finishDuel(release);
  }
  const modifier=context?{ownerId:context.contact.ownerId,scoreMultiplier:context.activation.scoreMultiplier,
    incomingMultiplier:context.activation.incomingMultiplier}:formModifier;
  const daoPaid=consumeDaoDuelIntents(world,cultivator,defender);
  const ordinaryWinner=context&&context.activation.choice!=='decline'
    ?measureNativeDuel(world,cultivator,defender,rolls,undefined,daoPaid).winner:undefined;
  const {winner,loser,hitLoser,hitWinner,divineArtProse}=measureNativeDuel(world,cultivator,defender,rolls,modifier,daoPaid);
  const nativeLoserDamage=mitigateSectArray(world,loser,winner,hitLoser);
  const guarded=beastGuardContact&&settleBeastGuard(world,beastGuardContact,loser,nativeLoserDamage);
  const sufferedByLoser=nativeLoserDamage-(guarded?.absorbed??0);
  const sufferedByWinner=mitigateSectArray(world,winner,loser,hitWinner);
  const attachForbiddenOutcome=(event:WorldEvent):WorldEvent=>{
    if(!context||context.activation.choice==='decline')return event;
    const owner=context.contact.ownerId===cultivator.id?cultivator:defender;
    const receipt=recordForbiddenArtOutcome(world,context.contact,context.activation,
      !owner.alive?'fallen':winner===owner&&ordinaryWinner!==owner?'reversal':'survived');
    if(receipt?.forbiddenArt){
      event.forbiddenArt=receipt.forbiddenArt;
      event.description+=receipt.description;
    }
    return event;
  };
  const loserBeforeHp = loser.hp;
  const winnerBeforeHp = winner.hp;
  const spared=decision.duelMercy==='spare'&&decision.targetCultivatorId===defender.id&&
    !authorizedBountyTargetId&&!context&&!beastGuardContact&&!formModifier&&winner===cultivator&&loser===defender&&
    lawfulConditionalMercy(world,winner,loser)&&sufferedByLoser>=loserBeforeHp;
  loser.hp = Math.max(spared||context?.activation.lastStand&&context.contact.ownerId===loser.id ? 1 : 0, loser.hp-sufferedByLoser);
  winner.hp = Math.max(1, winner.hp - sufferedByWinner);
  if(guarded&&beastGuardContact)
    recordAuxiliaryActionEvent(world,beastDuelGuardEvent(world,beastGuardContact,guarded,loser),emit);
  const damage = [{cultivatorId: loser.id, amount: loserBeforeHp - loser.hp},
    {cultivatorId: winner.id, amount: winnerBeforeHp - winner.hp}].filter((item) => item.amount > 0);
  wearArtifact(winner, true);
  wearArtifact(loser, false);

  adjustRelationship(
    world,
    cultivator.id,
    defender.id,
    -40,
    '血仇',
    `在${location?.name ?? '荒野'}发生生死斗法，结下深仇`
  );

  if (loser.hp <= 0) {
    loser.alive = false;
    if (loser.id !== authorizedBountyTargetId) recordTransgression(winner, 'killing');
    closeInterruptedTrial(loser, world.tick);
    dropInheritance(loser, world);
    const loot = lootStorageRing(winner, loser);
    const lootedStones = loot.stones;
    recordMemory(
      winner,
      world.tick,
      `在生死斗法中斩杀【${loser.name}】，接收其储物戒，得 ${lootedStones} 灵石及 ${loot.artifacts} 件法宝！`,
      10,
      'combat', 4
    );
    const lethalEvent: WorldEvent = {
      id: `evt-${world.tick}-${cultivator.id}-kill`,
      tick: world.tick,
      year: world.year,
      month: world.month,
      title: `陨落：${winner.name}斩杀${loser.name}！`,
      description: `【${location?.name ?? '秘境'}】剑气纵横，${cultivator.name}与${defender.name}爆发生死决战！最终${winner.name}技高一筹，将${loser.name}当场斩杀并收缴其储物戒：${lootedStones} 灵石及 ${loot.artifacts} 件法宝。`,
      category: 'death',
      actorIds: [cultivator.id, defender.id],
      duelWinnerId: winner.id,
      damage,
      dialogue: scriptedDialogue('combat', cultivator, defender, `${winner.name}胜出，${loser.name}当场陨落。`, decision.spokenLine, loser),
      locationId: cultivator.locationId,
    };
    if (divineArtProse) lethalEvent.description += divineArtProse + '。';
    const fragments = transferLootedRelics(world, winner, loser, lethalEvent);
    if (fragments) lethalEvent.description += `另有${fragments}枚古器碎片循实账随战利品转移。`;
    return finishDuel(attachForbiddenOutcome(lethalEvent),daoPaid);
  }

  recordMemory(
    winner,
    world.tick,
    `与【${loser.name}】激战一场将其击败重创。`,
    8,
    'combat', 3
  );
  recordMemory(
    loser,
    world.tick,
    `不敌【${winner.name}】身受重伤，燃血遁走，此仇必报！`,
    9,
    'combat', -5
  );
  const duelEvent: WorldEvent = {
    id: `evt-${world.tick}-${cultivator.id}-duel`,
    tick: world.tick,
    year: world.year,
    month: world.month,
    title: `惊天斗法：${cultivator.name}激战${defender.name}`,
    description: `${cultivator.name}于【${location?.name ?? '秘境'}】向${defender.name}悍然出手！一番激斗后，${winner.name}占据上风，${loser.name}受创（-${loserBeforeHp - loser.hp} HP）${spared?'，最后一剑收回，仍在原处。':guarded?'，仍立在此处。':'化作血光遁走。'}`,
    category: 'combat',
    actorIds: [cultivator.id, defender.id],
    duelWinnerId: winner.id,
    damage,
    dialogue: scriptedDialogue('combat', cultivator, defender, `${winner.name}占得上风，${loser.name}${spared?'尚存一息，未离此地。':guarded?'仍在此处。':'负伤离去。'}`, decision.spokenLine),
    locationId: cultivator.locationId,
  };
  if (divineArtProse) duelEvent.description += divineArtProse + '。';
  if(spared){
    const receipt=recordMercySpared(world,winner,loser,loserBeforeHp,sufferedByLoser,duelEvent);
    if(receipt)recordAuxiliaryActionEvent(world,receipt,emit);
  }
  return finishDuel(attachForbiddenOutcome(duelEvent),daoPaid);
}

export function applyCultivatorBrainDecision(
  world: WorldState,
  cultivator: Cultivator,
  decision: LLMDecisionPayload,
  rng: () => number = worldRandom(world),
  authorizedBountyTargetId?: string,
  emit?: (event: WorldEvent) => void,
  explicitAvatarDecision?: LLMDecisionPayload,
  modelInput = false,
  allowForbiddenDuel = true,
): WorldEvent | null {
  if (!cultivator.alive || cultivator.positionPlane === 'immortal') return null;
  if (decision.targetCampaignAssemblySiegeId!==undefined) {
    const {targetCampaignAssemblySiegeId,...native}=decision;
    const exact=exactCampaignAssemblyDecision(native,availableCampaignAssemblyActions(cultivator,world,world.tick)
      .filter(row=>row.siegeId===targetCampaignAssemblySiegeId&&row.kind!=='guard'),true);
    if(!exact||modelInput&&activeAvatar(world)===cultivator)return null;
    decision=exact;
  }
  if(decision.targetHeartDemonAftermathId!==undefined&&decision.chosenAction!=='REST')return null;
  if (decision.chosenAction === 'ASCENSION' || ascensionDutyActive(world, cultivator)) {
    if (decision.chosenAction !== 'ASCENSION') return null;
    const autonomous = modelInput || isProviderPersonaDecision(decision);
    const choices = autonomous ? availableAutonomousAscensionActions(cultivator, world) : availableAscensionActions(cultivator, world);
    const exact = exactAscensionDecision(decision, choices, true);
    if (!exact) return null;
    const event = resolveAscensionAction(world, cultivator, exact);
    if (event) {
      cultivator.currentAction = 'ASCENSION';
      cultivator.innerMonologue = exact.innerMonologue;
    }
    return event;
  }
  if(cultivator.positionPlane==='frontier'){
    if(decision.chosenAction==='FAREWELL_LANDING'){
      if(activeAvatar(world)===cultivator&&(modelInput||isProviderPersonaDecision(decision)))return null;
      const exact=exactFarewellLandingDecision(decision,availableFarewellLandingActions(cultivator,world,world.tick),true);
      const result=exact&&resolveFarewellLandingAction(world,cultivator,exact);
      if(result&&exact){cultivator.currentAction='FAREWELL_LANDING';cultivator.innerMonologue=exact.innerMonologue;}
      return result??null;
    }
    if(decision.chosenAction==='FRONTIER_GORGE'){
      if(activeAvatar(world)===cultivator&&(modelInput||isProviderPersonaDecision(decision)))return null;
      const exact=exactFrontierGorgeDecision(decision,availableFrontierGorgeActions(cultivator,world,world.tick),true);
      const result=exact&&resolveFrontierGorgeAction(world,cultivator,exact);
      if(result&&exact){cultivator.currentAction='FRONTIER_GORGE';cultivator.innerMonologue=exact.innerMonologue;}
      return result??null;
    }
    if(decision.chosenAction==='FRONTIER_NIGHT_HUNT'){
      if(activeAvatar(world)===cultivator&&(modelInput||isProviderPersonaDecision(decision)))return null;
      const exact=exactFrontierNightHuntDecision(decision,availableFrontierNightHuntActions(cultivator,world,world.tick),true);
      const event=exact&&resolveFrontierNightHunt(world,cultivator,exact);
      if(event&&exact){cultivator.currentAction='FRONTIER_NIGHT_HUNT';cultivator.innerMonologue=exact.innerMonologue;}
      return event??null;
    }
    if(isFrontierAction(decision.chosenAction))return applyFrontierDecision(world,cultivator,decision,rng,explicitAvatarDecision);
    if(decision.chosenAction==='REST'){
      cultivator.currentAction='REST';
      cultivator.innerMonologue='在亲到的另图休息，不在旧址行事。';
    }
    return null;
  }
  // A separate plane cannot spend lower supplies, heal at a lower site or act from a former address.
  if(cultivator.positionPlane!==undefined){
    if(decision.chosenAction==='UPPER_PASSAGE')return applyUpperPassageDecision(world,cultivator,decision,explicitAvatarDecision);
    if(isUpperArrayFieldAction(decision.chosenAction))return applyUpperArrayFieldDecision(world,cultivator,decision,explicitAvatarDecision);
    if(decision.chosenAction==='REST'){
      cultivator.currentAction='REST';
      cultivator.innerMonologue='在实到的界路停步，不在旧址另作事务。';
    }
    return null;
  }
  if (isTribulationActive(cultivator)) {
    const forced = decision.chosenAction !== 'FACE_TRIBULATION';
    const stance = !forced && decision.tribulationStance ? decision.tribulationStance : recommendedTribulationStance(cultivator);
    cultivator.currentAction = 'FACE_TRIBULATION';
    cultivator.innerMonologue = forced ? '天劫未止，无暇旁顾，先守住雷心。' : decision.innerMonologue;
    return resolveTribulation(world, cultivator, stance, rng, { decision: !forced ? decision : undefined, modelInput, emit });
  }
  if(activeDanxiaMedicineEscort(world,cultivator)||danxiaMedicineActedThisTick(world,cultivator)){
    cultivator.currentAction='DANXIA_MEDICINE';
    cultivator.innerMonologue='药束随实际路段走置；本轮不能在旧站另接事务。';
    return null;
  }
  if (activeCourierForActor(world, cultivator) || courierActedThisTick(world, cultivator)) {
    if (decision.chosenAction === 'COURIER_HANDOFF' && decision.courierHandoffMove === 'offer' &&
        courierHandoffMayOfferNow(world, cultivator)) {
      const offered = resolveCourierHandoffAction(world, cultivator, decision);
      if (offered) {
        cultivator.currentAction = 'COURIER_HANDOFF';
        cultivator.innerMonologue = '只请眼前的同行者接手封函，不许拆封，也不报送达。';
        return offered;
      }
    }
    cultivator.currentAction = 'SEALED_COURIER';
    cultivator.innerMonologue = '信使正沿实路前进，本轮不能在旧站另作行动。';
    return null;
  }
  if (decision.chosenAction === 'WAYPOST_MEAL') {
    if (activeAvatar(world)?.id === cultivator.id && decision !== explicitAvatarDecision) return null;
    const applied = resolveWaypostMealAction(world, cultivator, decision);
    if (applied) {
      cultivator.currentAction = 'WAYPOST_MEAL';
      cultivator.innerMonologue = decision.innerMonologue;
    }
    return applied;
  }
  if (decision.chosenAction === 'PILGRIMAGE' && world.waypostMeals?.meals.some((row) => row.status === 'served' &&
      row.closedTick === world.tick && (row.hostId === cultivator.id || row.guestId === cultivator.id))) {
    cultivator.currentAction = 'WAYPOST_MEAL';
    cultivator.innerMonologue = '已经在本处停歇分茶，这月没有迈过下一个关口。';
    return null;
  }
  if(furnaceEmergencyCrossingLocked(world,cultivator)){
    cultivator.currentAction='FURNACE_EMERGENCY';
    cultivator.innerMonologue='先走应下的这一段路，不在险处另办事务。';
    return null;
  }
  if(pilgrimageForkTravelLocked(world,cultivator)||pilgrimageForkActedThisTick(world,cultivator)){
    cultivator.currentAction='PILGRIMAGE_FORK';
    cultivator.innerMonologue='岔路各走各的，不在旧地另办事务。';
    return null;
  }
  if(decision.chosenAction==='PILGRIMAGE_FORK'){
    if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
    const exact=exactPilgrimageForkDecision(decision,availablePilgrimageForkActions(cultivator,world,world.tick),true);
    const rows=exact?resolvePilgrimageForkAction(world,cultivator,exact):[];
    for(const prior of rows.slice(0,-1))emit?.(prior);
    const own=rows.at(-1);
    if(own&&exact){cultivator.currentAction='PILGRIMAGE_FORK';cultivator.innerMonologue=exact.innerMonologue;}
    return own??null;
  }
  const mayIssueRouteWarning = decision.chosenAction === 'ROUTE_WARNING' &&
    availableRouteWarningActions(cultivator,world).some((option)=>
      option.routeWarningMove===decision.routeWarningMove && option.targetRouteObservationId===decision.targetRouteObservationId &&
      option.targetRouteWarningId===decision.targetRouteWarningId);
  if (!mayIssueRouteWarning && decision.chosenAction !== 'PILGRIMAGE' && (pilgrimageActedThisTick(world, cultivator) ||
      (activePilgrimageForActor(world, cultivator) && (decision.chosenAction !== 'REST' || pilgrimageCheckpoint(world, cultivator))))) {
    cultivator.currentAction = 'PILGRIMAGE';
    cultivator.innerMonologue = '要守同行之约，途中不能在旧站另作行动。';
    return null;
  }
  if (decision.chosenAction !== 'SPARRING' && sparringLocksActor(world, cultivator)) {
    cultivator.currentAction = 'SPARRING';
    cultivator.innerMonologue = '切磋已约定，本回合留在现场，未发生其他行动。';
    return null;
  }
  if (decision.chosenAction !== 'EXPEDITION_RESCUE' && expeditionRescueCheckpoint(world, cultivator)) {
    cultivator.currentAction = 'EXPEDITION_RESCUE';
    cultivator.innerMonologue = '正沿已核实的撤离路段前进，不能在原秘境另作行动。';
    return null;
  }
  if (decision.chosenAction !== 'BOUNDARY_RELIEF' && boundaryReliefCheckpoint(world, cultivator)) {
    cultivator.currentAction = 'BOUNDARY_RELIEF';
    cultivator.innerMonologue = '按已核实的换防关口行进，未到岗前不计驻守。';
    return null;
  }
  if (decision.chosenAction === 'DISASTER_SHELTER') {
    if (activeAvatar(world)?.id === cultivator.id && decision !== explicitAvatarDecision) return null;
    const applied = resolveDisasterShelterAction(world, cultivator, decision);
    if (applied) {
      cultivator.currentAction = 'DISASTER_SHELTER';
      cultivator.innerMonologue = decision.innerMonologue;
    }
    return applied;
  }
  const shelterStep = disasterShelterCheckpoint(world,cultivator);
  if (shelterStep || disasterShelterLocksTravel(world,cultivator) &&
    !(['REST','CULTIVATE','SOCIALIZE'] as const).some(action=>action===decision.chosenAction)) {
    cultivator.currentAction = 'DISASTER_SHELTER';
    cultivator.innerMonologue = shelterStep
      ? '沿已经核验的借泊关口行走或停等，不能在旧地址行事。' : '仍有借泊来回之约，未另行离开当前真实地点。';
    return null;
  }
  if (decision.chosenAction === 'EXPEDITION_DUNGEON') {
    if ((modelInput || isProviderPersonaDecision(decision)) && !dungeonDecisionOccasion(cultivator, world)) return null;
    const exact = exactDungeonDecision(decision, availableDungeonMoves(world, cultivator), true);
    if (!exact) return null;
    const applied = resolveDungeonAction(world, cultivator, exact);
    if (applied) {
      cultivator.currentAction = 'EXPEDITION_DUNGEON';
      cultivator.innerMonologue = exact.innerMonologue;
    }
    return applied;
  }
  if (decision.chosenAction !== 'EXPEDITION_RESCUE' && activeDungeonForActor(world, cultivator)) return null;
  if (decision.chosenAction === 'CULTIVATION_CLAN') {
    if (daoPathTurnLocked(cultivator, world)) return null;
    const autonomous = modelInput || isProviderPersonaDecision(decision);
    const options = autonomous ? availableAutonomousCultivationClanActions(cultivator, world) :
      availableCultivationClanActions(cultivator, world);
    const exact = exactCultivationClanDecision(decision, options, true);
    if (!exact) return null;
    const applied = resolveCultivationClanAction(world, cultivator, exact);
    if (applied) {
      cultivator.currentAction = 'CULTIVATION_CLAN';
      cultivator.innerMonologue = exact.innerMonologue;
    }
    return applied;
  }
  if (decision.targetAuctionAmbushLotId !== undefined &&
      !exactAuctionAmbushDecision(decision, currentAuctionAmbushOffer(cultivator, world), true)) return null;
  if (decision.chosenAction === 'IMMORTAL_AUCTION') {
    if (daoPathTurnLocked(cultivator, world)) return null;
    const autonomous = modelInput || isProviderPersonaDecision(decision);
    const options = autonomous ? availableAutonomousImmortalAuctionActions(cultivator, world) :
      availableImmortalAuctionActions(cultivator, world);
    const exact = exactImmortalAuctionDecision(decision, options, true);
    if (!exact) return null;
    const auction = resolveImmortalAuctionAction(world, cultivator, exact);
    if (auction) {
      cultivator.currentAction = 'IMMORTAL_AUCTION';
      cultivator.innerMonologue = exact.innerMonologue;
    }
    return auction;
  }
  if (decision.chosenAction === 'DAO_PATH') {
    if (daoPathTurnLocked(cultivator, world)) return null;
    const autonomous = modelInput || isProviderPersonaDecision(decision);
    const options = autonomous ? availableAutonomousDaoPathActions(cultivator, world) : availableDaoPathActions(cultivator, world);
    const exact = exactDaoPathDecision(decision, options, true);
    if (!exact) return null;
    const applied = resolveDaoPathAction(world, cultivator, exact);
    if (applied) {
      cultivator.currentAction = 'DAO_PATH';
      cultivator.innerMonologue = exact.innerMonologue;
    }
    return applied;
  }
  if (decision.chosenAction === 'HEAVENLY_ALCHEMY') {
    if (activeSiegeForActor(world, cultivator) || activeOccasionForActor(world, cultivator)) return null;
    const autonomous = modelInput || isProviderPersonaDecision(decision);
    const choices = autonomous ? availableAutonomousHeavenlyAlchemyActions(cultivator, world)
      : availableHeavenlyAlchemyActions(cultivator, world);
    const exact = exactHeavenlyAlchemyDecision(decision, choices, true);
    if (!exact) return null;
    const applied = resolveHeavenlyAlchemyAction(world, cultivator, exact, rng);
    if (applied) {
      cultivator.currentAction = 'HEAVENLY_ALCHEMY';
      cultivator.innerMonologue = exact.innerMonologue;
    }
    return applied;
  }
  if(isFrontierAction(decision.chosenAction))return applyFrontierDecision(world,cultivator,decision,rng,explicitAvatarDecision);
  if(decision.chosenAction==='UPPER_PASSAGE')return applyUpperPassageDecision(world,cultivator,decision,explicitAvatarDecision);
  if(isUpperArrayFieldAction(decision.chosenAction))return applyUpperArrayFieldDecision(world,cultivator,decision,explicitAvatarDecision);
  if (decision.chosenAction === 'SCRIBE_COMMISSION') {
    if (activeAvatar(world)?.id === cultivator.id && decision !== explicitAvatarDecision) return null;
    const applied = resolveScribeCommissionAction(world, cultivator, decision);
    if (applied) {
      cultivator.innerMonologue = decision.innerMonologue;
      cultivator.currentAction = 'SCRIBE_COMMISSION';
    }
    return applied;
  }
  if(decision.chosenAction==='MARKET_FREIGHT'){
    if(activeAvatar(world)?.id===cultivator.id&&decision!==explicitAvatarDecision)return null;
    const applied=resolveMarketFreightAction(world,cultivator,decision);
    if(applied){cultivator.currentAction='MARKET_FREIGHT';cultivator.innerMonologue=decision.innerMonologue;}
    return applied;
  }
  if (decision.chosenAction === 'CRAFT_TRAINING') {
    if (activeAvatar(world)?.id === cultivator.id && decision !== explicitAvatarDecision) return null;
    const applied = resolveCraftTrainingAction(world, cultivator, decision);
    if (applied) {
      cultivator.innerMonologue = decision.innerMonologue;
      cultivator.currentAction = 'CRAFT_TRAINING';
    }
    return applied;
  }
  if (decision.chosenAction === 'WORKSHOP_ESTATE') {
    if (activeAvatar(world)?.id === cultivator.id && decision !== explicitAvatarDecision) return null;
    const applied = resolveWorkshopEstateAction(world, cultivator, decision);
    if (applied) {
      cultivator.innerMonologue = decision.innerMonologue;
      cultivator.currentAction = 'WORKSHOP_ESTATE';
    }
    return applied;
  }
  if (decision.chosenAction === 'WORKSHOP_RELEASE') {
    if (activeAvatar(world)?.id === cultivator.id && decision !== explicitAvatarDecision) return null;
    const applied = resolveWorkshopReleaseAction(world, cultivator, decision);
    if (applied) {
      cultivator.innerMonologue = decision.innerMonologue;
      cultivator.currentAction = 'WORKSHOP_RELEASE';
    }
    return applied;
  }
  if(decision.chosenAction==='NORTH_GATE_RENEWAL'){
    if(activeAvatar(world)?.id===cultivator.id&&decision!==explicitAvatarDecision)return null;
    const applied=resolveNorthGateRenewalAction(world,cultivator,decision);
    if(applied){
      cultivator.innerMonologue=decision.innerMonologue;
      cultivator.currentAction='NORTH_GATE_RENEWAL';
    }
    return applied;
  }
  if(decision.chosenAction==='NORTH_WELL_REVIEW'){
    if(activeAvatar(world)?.id===cultivator.id&&decision!==explicitAvatarDecision)return null;
    const applied=resolveNorthWellReviewAction(world,cultivator,decision);
    if(applied){
      cultivator.innerMonologue=decision.innerMonologue;
      cultivator.currentAction='NORTH_WELL_REVIEW';
    }
    return applied;
  }
  if(decision.chosenAction==='NORTH_MINING_CHARTER'){
    if(activeAvatar(world)?.id===cultivator.id&&decision!==explicitAvatarDecision)return null;
    const applied=resolveNorthMiningCharterAction(world,cultivator,decision);
    if(applied){
      cultivator.innerMonologue=decision.innerMonologue;
      cultivator.currentAction='NORTH_MINING_CHARTER';
    }
    return applied;
  }
  if(decision.chosenAction==='WATER_VEIN'){
    const applied=resolveWaterVeinAction(world,cultivator,decision);
    if(applied){
      cultivator.innerMonologue=decision.innerMonologue;
      cultivator.currentAction='WATER_VEIN';
    }
    return applied;
  }
  cultivator.innerMonologue = decision.innerMonologue;
  cultivator.currentAction = decision.chosenAction;

  const location = world.locations.find((l) => l.id === cultivator.locationId);
  const qiFactor = (location?.spiritQi ?? 50) / 50;
  // A behavioral provider saw personal context. Its words may remain in-character thought, never a public quote.
  const publicSpeech=modelInput||isProviderPersonaDecision(decision)?undefined:decision.spokenLine;
  const publicDecision=publicSpeech===decision.spokenLine?decision:{...decision,spokenLine:publicSpeech};

  switch (decision.chosenAction) {
    case 'TAME_BEAST':
      return tameSpiritBeast(world, cultivator, decision, rng);
    case 'PURSUE_BOUNTY': {
      return pursueBounty(world, cultivator, decision, (target) => {
        const siteId=cultivator.locationId;
        const actualCoPresence=siteId===target.locationId&&cultivator.positionPlane===undefined&&target.positionPlane===undefined&&
          !pilgrimageCheckpoint(world,cultivator)&&!pilgrimageCheckpoint(world,target);
        const result = applyCultivatorBrainDecision(world, cultivator, {
          chosenAction: 'DUEL', innerMonologue: decision.innerMonologue, targetCultivatorId: target.id,
        }, rng, target.id, emit, undefined, false, false);
        cultivator.currentAction = 'PURSUE_BOUNTY';
        if(actualCoPresence&&decision.targetBountyId&&result?.duelWinnerId===target.id&&
          result.category==='combat'&&result.damage?.some(hit=>hit.cultivatorId===target.id&&hit.amount>0))
          recordFlightPursuit(world,{hunterId:cultivator.id,targetId:target.id,bountyId:decision.targetBountyId,siteId,event:result});
        return result?.duelWinnerId ? { event: result, winnerId: result.duelWinnerId } : result;
      });
    }
    case 'JOIN_OCCASION':
      return joinOccasion(world, cultivator, decision);
    case 'OFFER_ALLIANCE':
    case 'DECLARE_WAR':
    case 'DEMAND_TRIBUTE':
    case 'LAUNCH_SIEGE':
      return resolveDiplomacyAction(world, cultivator, decision);
    case 'BUILD_FACILITY':
    case 'DISPATCH_GUARD':
    case 'GUARD_DUTY':
      return resolveSectEconomyAction(world, cultivator, decision);
    case 'CHALLENGE_LEADERSHIP':
    case 'PLOT_COUP': {
      const politicalEvent = resolveLeadershipAction(world, cultivator, decision, rng);
      if (politicalEvent && decision.chosenAction === 'PLOT_COUP') recordTransgression(cultivator, 'betrayal');
      return politicalEvent;
    }
    case 'FACE_TRIBULATION':
      return null; // No active trial remains to face.
    case 'AMBUSH_TRIBULATION':
      return interfereTribulation(world, cultivator, decision.targetCultivatorId, rng);
    case 'SALVAGE_ARTIFACT':
      return resolveArtifactSalvageAction(cultivator, world, decision);
    case 'FORGE_ARTIFACT':
    case 'BIND_ARTIFACT':
    case 'REPAIR_ARTIFACT':
    case 'AWAKEN_ARTIFACT':
      return resolveArtifactAction(world, cultivator, decision, rng);
    case 'GATHER_HERBS':
    case 'BREW_PILL':
    case 'USE_PILL':
      return resolveAlchemy(world, cultivator, decision, rng);
    case 'NAME_HEIR':
    case 'CLAIM_ESTATE':
    case 'HOLD_MEMORIAL':
      return resolveEstateAction(world, cultivator, decision);
    case 'FILE_WITNESS_CLAIM':
    case 'ATTEST_WITNESS':
    case 'CHALLENGE_WITNESS':
      return resolveWitnessAction(world, cultivator, decision);
    case 'PROBATION':
      return resolveProbationAction(world, cultivator, decision);
    case 'RELIC_EXHIBIT':
      return resolveRelicExhibitAction(world, cultivator, decision);
    case 'WORKSHOP':
      return resolveWorkshopAction(world, cultivator, decision, rng);
    case 'BANQUET_SEAT': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactBanquetSeatDecision(decision,availableBanquetSeatActions(cultivator,world,world.tick),true);
      if(!exact)return null;
      const result=resolveBanquetSeatAction(world,cultivator,exact,siteId=>{
        const from=cultivator.locationId;
        const movement=applyCultivatorBrainDecision(world,cultivator,{chosenAction:'EXPLORE',targetLocationId:siteId,
          innerMonologue:'循自己认得的路去前厅。'},rng,undefined,emit);
        if(movement)emit?.(movement);
        return cultivator.alive&&cultivator.locationId!==from&&cultivator.locationId===siteId&&cultivator.currentAction==='EXPLORE';
      });
      if(result){cultivator.currentAction='BANQUET_SEAT';cultivator.innerMonologue=exact.innerMonologue;}
      return result;
    }
    case 'NIGHT_DOOR': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactNightDoorDecision(decision,availableNightDoorActions(cultivator,world,world.tick),true);
      if(!exact)return null;
      const result=resolveNightDoorAction(world,cultivator,exact,siteId=>{
        const from=cultivator.locationId;
        const movement=applyCultivatorBrainDecision(world,cultivator,{chosenAction:'EXPLORE',targetLocationId:siteId,
          innerMonologue:'循自己认得的一步走去。'},rng,undefined,emit);
        if(movement)emit?.(movement);
        return cultivator.alive&&cultivator.locationId!==from&&cultivator.locationId===siteId&&cultivator.currentAction==='EXPLORE';
      });
      if(result){cultivator.currentAction='NIGHT_DOOR';cultivator.innerMonologue=exact.innerMonologue;}
      return result;
    }
    case 'BOUNDARY_GAP': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactBoundaryGapDecision(decision,availableBoundaryGapActions(cultivator,world,world.tick),true);
      const result=exact?resolveBoundaryGapAction(world,cultivator,exact):null;
      if(result&&exact){cultivator.currentAction='BOUNDARY_GAP';cultivator.innerMonologue=exact.innerMonologue;}
      return result;
    }
    case 'ABANDONED_QUARTER': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactAbandonedQuarterDecision(decision,availableAbandonedQuarterActions(cultivator,world,world.tick),true);
      if(!exact)return null;
      const result=resolveAbandonedQuarterAction(world,cultivator,exact,siteId=>{
        const from=cultivator.locationId;
        const journey=applyCultivatorBrainDecision(world,cultivator,{chosenAction:'EXPLORE',targetLocationId:siteId,
          innerMonologue:'沿自己认得的去处离开旧村。'},rng,undefined,emit);
        if(journey)emit?.(journey);
        return cultivator.alive&&cultivator.locationId!==from&&cultivator.locationId===siteId&&cultivator.currentAction==='EXPLORE';
      });
      if(result){cultivator.currentAction='ABANDONED_QUARTER';cultivator.innerMonologue=exact.innerMonologue;}
      return result;
    }
    case 'FURNACE_EMERGENCY': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactFurnaceEmergencyDecision(decision,availableFurnaceEmergencyActions(cultivator,world,world.tick),true);
      const event=exact?resolveFurnaceEmergencyAction(world,cultivator,exact):null;
      if(event&&exact){cultivator.currentAction='FURNACE_EMERGENCY';cultivator.innerMonologue=exact.innerMonologue;}
      return event;
    }
    case 'FURNACE_SAFETY':
      return resolveFurnaceSafetyAction(world,cultivator,decision);
    case 'DAMAGE_ASSURANCE':
      return resolveDamageAssuranceAction(world, cultivator, decision);
    case 'FURNACE_RESERVATION':
      return resolveFurnaceReservationAction(world, cultivator, decision);
    case 'SPARRING':
      return resolveSparringAction(world, cultivator, decision);
    case 'EXPEDITION_RESCUE':
      if(decision.rescueMove==='accept'&&(modelInput||isProviderPersonaDecision(decision))&&
        !autonomousExpeditionRescueOptions(cultivator,world).some(option=>option.rescueMove==='accept'&&
          option.targetExpeditionRescueId===decision.targetExpeditionRescueId))return null;
      return resolveExpeditionRescueAction(world, cultivator, decision);
    case 'SHORT_SHIFT':
      return resolveShortShiftAction(world, cultivator, decision);
    case 'BOUNDARY_RELIEF':
      return resolveBoundaryReliefAction(world, cultivator, decision);
    case 'MENTOR_TRANSFER':
      return resolveMentorTransferAction(world, cultivator, decision);
    case 'APPRENTICE_COHORT':
      return resolveApprenticeCohortAction(world, cultivator, decision);
    case 'SEASONAL_HOUSING':
      return resolveSeasonalHousingAction(world, cultivator, decision);
    case 'HOUSEHOLD_NAME':
      return resolveHouseholdNameAction(world, cultivator, decision);
    case 'TOOL_LOAN':
      return resolveToolLoanAction(world,cultivator,decision);
    case 'SEED_CULTURE':
      return resolveSeedCultureAction(world,cultivator,decision);
    case 'SECT_STIPEND':
      return resolveSectStipendAction(world,cultivator,decision);
    case 'VILLAGE_FAIR':
      return resolveVillageFairAction(world,cultivator,decision);
    case 'CIVIC_MEMORIAL':
      if(decision.civicMemorialMove==='append_relief'&&activeAvatar(world)?.id===cultivator.id&&decision!==explicitAvatarDecision)return null;
      return resolveCivicMemorialAction(world,cultivator,decision);
    case 'WORKSHOP_CAPACITY':
      return resolveWorkshopCapacityAction(world, cultivator, decision);
    case 'PAVILION_LOAN':
      return resolvePavilionLoanAction(world, cultivator, decision);
    case 'ROUTE_WARNING':
      return resolveRouteWarningAction(world, cultivator, decision);
    case 'VILLAGE_SUPPLY':
      return resolveVillageSupplyAction(world, cultivator, decision);
    case 'VILLAGE_GRANARY':
      return resolveVillageGranaryAction(world, cultivator, decision);
    case 'CARAVAN_RESTITUTION':
      return resolveCaravanRestitutionAction(world, cultivator, decision);
    case 'TERRAIN_RECOVERY':
      return resolveTerrainRecovery(world, cultivator, decision);
    case 'SHARED_COMMONS':
      return resolveSharedCommonsAction(world, cultivator, decision);
    case 'SECT_SERVICE': {
      const outcome = resolveServiceRetirementAction(world, cultivator, decision);
      if (outcome && decision.serviceMove === 'retire' && !emit) {
        for (const event of maintainSectPolitics(world)) recordAuxiliaryActionEvent(world, event);
      }
      return outcome;
    }
    case 'SEALED_COURIER':
      return resolveCourierAction(world, cultivator, decision);
    case 'COURIER_HANDOFF':
      return resolveCourierHandoffAction(world, cultivator, decision);
    case 'VILLAGE_WORKS':
      return resolveVillageWorksAction(world, cultivator, decision);
    case 'HOUSEHOLD_GUARDIAN':
      return resolveGuardianAction(world, cultivator, decision);
    case 'TERRITORIAL_LEASE':
      return resolveTerritorialLeaseAction(world, cultivator, decision);
    case 'FORMATION_NETWORK':
      return resolveFormationAction(world, cultivator, decision);
    case 'INFIRMARY':
      return resolveInfirmaryAction(world, cultivator, decision);
    case 'CARE_FOLLOWUP':
      return resolveCareFollowupAction(world, cultivator, decision);
    case 'AUDIENCE_PLEDGE':
      return null; // Only a real sealed audience can execute through the native turn below.
    case 'GRAND_SIEGE_HERO':
      // The native attack round, not this individual turn, owns actual array and resource settlement.
      return null;
    case 'VACANT_GATE': return null; // The actual opposing round applies the independently staged response.
    case 'BATTLEFIELD_AFTERMATH': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactBattlefieldAftermathDecision(decision,availableBattlefieldAftermathActions(cultivator,world,world.tick),true);
      if(!exact)return null;
      return resolveBattlefieldAftermathAction(world,cultivator,exact,siteId=>{
        const before=cultivator.locationId;
        const native=applyCultivatorBrainDecision(world,cultivator,{chosenAction:'EXPLORE',targetLocationId:siteId,
          innerMonologue:'循自己走过的旧路归去。'},rng,undefined,emit);
        if(native)emit?.(native);
        return cultivator.alive&&cultivator.locationId===siteId&&before!==siteId&&cultivator.currentAction==='EXPLORE';
      });
    }
    case 'APPRENTICESHIP_REUNION': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactApprenticeshipReunionDecision(decision,availableApprenticeshipReunionActions(cultivator,world,world.tick),true);
      const rows=exact?resolveApprenticeshipReunionAction(world,cultivator,exact,rng):[];
      for(const original of rows.slice(0,-1))emit?.(original);
      const own=rows.at(-1);
      if(own&&exact){cultivator.currentAction='APPRENTICESHIP_REUNION';cultivator.innerMonologue=exact.innerMonologue;}
      return own??null;
    }
    case 'VILLAGE_REUNION': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactVillageReunionDecision(decision,availableVillageReunionActions(cultivator,world,world.tick),true);
      return exact?resolveVillageReunionAction(world,cultivator,exact):null;
    }
    case 'WILD_MIGRATION': {
      if(modelInput&&activeAvatar(world)===cultivator)return null;
      const exact=exactWildMigrationDecision(decision,availableWildMigrationActions(cultivator,world,world.tick),true);
      return exact?resolveWildMigrationAction(world,cultivator,exact):null;
    }
    case 'MERCY_REUNION': {
      if(modelInput&&activeAvatar(world)===cultivator)return null;
      const exact=exactStoryMercyDecision(decision,availableMercyReunionActions(cultivator,world,world.tick),true);
      if(!exact)return null;
      const event=resolveMercyReunionAction(world,cultivator,exact,target=>applyCultivatorBrainDecision(world,cultivator,{
        chosenAction:'DUEL',targetCultivatorId:target.id,innerMonologue:'只与真正眼前的旧人交锋。',
      },rng,undefined,emit),proof=>recordAuxiliaryActionEvent(world,proof,emit));
      if(event){
        cultivator.currentAction='MERCY_REUNION';
        if((exact.mercyReunionMove==='stand_down'||exact.mercyReunionMove==='accept_aid')&&event.witnessScope==='participants'&&
          event.actorIds[0]===cultivator.id&&event.actorIds.length===2){
          const link=world.relationships.find(row=>(row.fromId===cultivator.id&&row.toId===event.actorIds[1])||
            (row.toId===cultivator.id&&row.fromId===event.actorIds[1]));
          if(link)link.affinity=clamp(link.affinity+(exact.mercyReunionMove==='accept_aid'?6:3),-100,100);
        }
      }
      return event;
    }
    case 'PAVILION_FIRE': {
      if(modelInput&&activeAvatar(world)===cultivator)return null;
      const exact=exactPavilionFireDecision(decision,availablePavilionFireActions(cultivator,world,world.tick),true);
      return exact?resolvePavilionFireAction(world,cultivator,exact):null;
    }
    case 'WITNESS_INQUIRY': {
      if (modelInput && activeAvatar(world)===cultivator) return null;
      const exact=exactWitnessInquiryDecision(decision,availableWitnessInquiryActions(cultivator,world,world.tick),true);
      return exact?resolveWitnessInquiry(world,cultivator,exact):null;
    }
    case 'CALAMITY_ARRAY': {
      if (modelInput && activeAvatar(world) === cultivator) return null;
      const exact = exactCalamityArrayDecision(decision, availableCalamityArrayChoices(world, cultivator, world.tick), true);
      return exact ? recordCalamityArrayChoice(world, cultivator, exact) : null;
    }
    case 'BATTLEFIELD_REVISIT': {
      if(modelInput&&activeAvatar(world)===cultivator)return null;
      const exact=exactBattlefieldRevisitDecision(decision,availableBattlefieldRevisits(world,cultivator,world.tick),true);
      return exact?resolveBattlefieldRevisit(world,cultivator,exact):null;
    }
    case 'AWAKEN_DESTINY':
      return decision.targetDestinyOfferId && decision.destinyTraitChoice
        ? settleDestinyTrait(world, cultivator, decision.targetDestinyOfferId, decision.destinyTraitChoice)
        : null;
    case 'ROGUELIKE_ENCOUNTER':
      return decision.targetRoguelikeEncounterId&&decision.roguelikeEncounterChoice
        ?settleRoguelikeEncounter(world,cultivator,decision.targetRoguelikeEncounterId,decision.roguelikeEncounterChoice)
        :null;
    case 'DANXIA_MEDICINE':
      return resolveDanxiaMedicineAction(world,cultivator,decision,rng);
    case 'DOCTRINE_MATURITY':
      return resolveDoctrineMaturityAction(world,cultivator,decision);
    case 'DOCTRINE_FOUNDING':
      return resolveDoctrineFoundingAction(world,cultivator,decision);
    case 'DANXIA_REVIEW':
      return resolveDanxiaReviewAction(world,cultivator,decision);
    case 'HABITAT':
      return resolveHabitatAction(world, cultivator, decision);
    case 'CHRONICLE_ERRATA':
      return resolveChronicleErrataAction(world, cultivator, decision);
    case 'SEASON_REVIEW':
      return resolveSeasonReviewAction(world, cultivator, decision);
    case 'FIELD_OBSERVATORY':
      return resolveObservatoryAction(world, cultivator, decision);
    case 'ALIGNED_WEATHER':
      return resolveAlignedWeatherAction(world, cultivator, decision);
    case 'OATH_ARBITRATION':
      return resolveOathArbitrationAction(world, cultivator, decision);
    case 'VILLAGE_CENSUS':
      return resolveVillageCensusAction(world, cultivator, decision);
    case 'ROAD':
      return resolveRoadAction(world, cultivator, decision);
    case 'PILGRIMAGE': {
      const flight=activeProtagonistFlight(world,cultivator);
      if(flight&&decision.targetPilgrimageId===flight.journeyId){
        const exact=availableProtagonistFlightActions(cultivator,world,world.tick);
        if(!exact.some(option=>matchesProtagonistFlightOption(option,decision))||
          activeAvatar(world)===cultivator&&(modelInput||isProviderPersonaDecision(decision)))return null;
      }
      return resolvePilgrimageAction(world, cultivator, decision);
    }
    case 'SECT_CREDIT':
      return resolveSectCreditAction(world, cultivator, decision);
    case 'SANCTUARY':
      return resolveSanctuaryAction(world, cultivator, decision);
    case 'RESEARCH':
      return resolveResearchAction(world, cultivator, decision);
    case 'CEASEFIRE':
      return resolveCeasefireAction(world, cultivator, decision);
    case 'ESCORT':
      return resolveEscortAction(world, cultivator, decision);
    case 'RANK_SEASON':
      return resolveCompetitionAction(world, cultivator, decision);
    case 'SCRIPTURE':
      return resolveScriptureAction(world, cultivator, decision);
    case 'RELIC':
      return resolveRelicAction(world, cultivator, decision);
    case 'RECOLLECT':
      return resolveRecollectionAction(world, cultivator, decision);
    case 'RELOCATE':
      return resolveRelocationAction(world, cultivator, decision);
    case 'DOCTRINE':
      return resolveDoctrineAction(world, cultivator, decision);
    case 'RECRUIT_SETTLER':
    case 'DELIVER_RELIEF':
      return resolveSettlementAction(world, cultivator, decision);
    case 'PLACE_MARKET_BUY':
    case 'PLACE_MARKET_SELL':
    case 'CANCEL_MARKET_ORDER':
      return resolveMarketAction(world, cultivator, decision);
    case 'OFFER_OATH':
    case 'ACCEPT_OATH':
    case 'DECLINE_OATH':
    case 'FULFILL_OATH':
    case 'APPEAL_OATH':
      return resolveOathAction(world, cultivator, decision);
    case 'TEACH':
    case 'ACCEPT_TUITION':
    case 'DECLINE_TUITION':
      return resolveMentorshipAction(world, cultivator, decision, rng);
    case 'AUTHOR_TECHNIQUE':
      return authorTechnique(cultivator, world);
    case 'STUDY_TECHNIQUE':
      return studyTechnique(cultivator, world, decision.targetTechniqueId);
    case 'PURSUE_SCHEME': {
      return pursueScheme(cultivator, world, decision.proposedScheme, (target) => {
        const result = applyCultivatorBrainDecision(world, cultivator, {
          chosenAction: 'DUEL', innerMonologue: decision.innerMonologue, targetCultivatorId: target.id,
        }, rng, undefined, emit, undefined, false, false);
        cultivator.currentAction = 'PURSUE_SCHEME';
        return result;
      }, (target, delta) => adjustRelationship(world, cultivator.id, target.id, delta, '竞争'), rng);
    }
    case 'TRADE':
    case 'DUAL_CULTIVATE':
    case 'SECT_DIPLOMACY':
      return resolveEncounter(decision.chosenAction, world, cultivator, publicDecision,
        (target, amount) => adjustRelationship(world, cultivator.id, target.id, amount,
          cultivator.sectId === target.sectId ? '同门' : '竞争'));
    case 'CULTIVATE': {
      const beforeMastery = cultivator.techniqueMastery;
      const gain = Math.round((8 + rng() * 10) * qiFactor * cultivationMultiplier(cultivator, location) * masteryMultiplier(cultivator, 'cultivation') * mentorshipTechniqueMultiplier(world, cultivator) * sectQiBonus(world, cultivator) * destinyCultivationMultiplier(cultivator));
      cultivator.qiProgress = clamp(cultivator.qiProgress + gain, 0, 100);
      cultivator.pillToxicity -= destinyCultivationDetox(cultivator);
      gainMastery(cultivator, 3);
      cultivator.hp = clamp(
        cultivator.hp + Math.round(cultivator.maxHp * 0.08),
        1,
        cultivator.maxHp
      );
      const lesson = recordTaughtSwordPractice(world,cultivator,beforeMastery);
      const cohort = recordCohortPractice(world,cultivator,beforeMastery);
      if(lesson&&cohort&&emit){emit(lesson);return cohort;}
      return lesson??cohort;
    }

    case 'REST': {
      if(decision.targetHeartDemonAftermathId!==undefined){
        if(activeAvatar(world)===cultivator&&(modelInput||isProviderPersonaDecision(decision)))return null;
        return resolveHeartDemonRecovery(world,cultivator,decision.targetHeartDemonAftermathId);
      }
      cultivator.pillToxicity = Math.max(0, cultivator.pillToxicity - 4);
      const previousHp = cultivator.hp;
      const heal = Math.round(cultivator.maxHp * 0.35);
      cultivator.hp = clamp(cultivator.hp + heal, 1, cultivator.maxHp);
      if (cultivator.hp > previousHp) {
        recordMemory(
          cultivator,
          world.tick,
          `在【${location?.name ?? '洞府'}】闭关调息，恢复了 ${cultivator.hp - previousHp} 点气血。`,
          4,
          'cultivation', 1
        );
      }
      return null;
    }

    case 'EXPLORE': {
      const known = knownMapLocations(world, cultivator);
      const ordinarySites = world.locations.filter(place=>!isScopedExpeditionGate(place));
      const unknown = ordinarySites.filter((place) => place.id !== cultivator.locationId && !known.includes(place));
      const candidates = unknown.length ? unknown : ordinarySites.filter((place) => place.id !== cultivator.locationId);
      const dest = decision.targetLocationId
        ? known.find((place) => place.id === decision.targetLocationId) ??
          (knownRumorLead(cultivator, world) === decision.targetLocationId ? ordinarySites.find((site) => site.id === decision.targetLocationId) : undefined)
        : candidates[Math.floor(rng() * candidates.length)];
      if (dest && dest.id !== cultivator.locationId) {
        const strain = location ? Math.round(weatherTravelFriction(world, location, dest) * 12) : 0;
        if (strain > 0) {
          const spent = Math.min(cultivator.qiProgress, strain);
          cultivator.qiProgress -= spent;
          if (spent >= 3) recordMemory(cultivator, world.tick,
            `灵潮扰动御剑行路，抵至【${dest.name}】时额外消耗${spent}点灵气。`, 4, 'cultivation', -1);
        }
        const departedSiteId = cultivator.locationId;
        cultivator.locationId = dest.id;
        noteTerrainVisit(world, cultivator);
        // This only records a real departure by the exact buyer; failed and non-world travel cannot open a pursuit.
        if (world.immortalAuction) recordImmortalAuctionDeparture(world, cultivator, departedSiteId);
        // Random chance of finding spirit stones or herbs while exploring
        if (rng() < 0.35) {
          const foundStones = Math.round(40 + rng() * 120);
          cultivator.spiritStones += foundStones;
          recordMemory(
            cultivator,
            world.tick,
            `御剑游历至【${dest.name}】，偶得机缘收获 ${foundStones} 枚灵石。`,
            6,
            'cultivation', 2
          );
          return {
            id: `evt-${world.tick}-${cultivator.id}-explore`,
            tick: world.tick,
            year: world.year,
            month: world.month,
            title: `${cultivator.name}游历${dest.name}获机缘`,
            description: `${cultivator.name}御剑抵达【${dest.name}】，在古迹残垣间寻得 ${foundStones} 枚上品灵石。`,
            category: 'breakthrough',
            actorIds: [cultivator.id],
            locationId: dest.id,
          };
        }
      }
      return null;
    }

    case 'BREAKTHROUGH': {
      if (tribulationTarget(cultivator)) {
        const avatar = world.playerAvatar;
        const originalPossessionUntilTick = avatar.possessionUntilTick;
        const guide = originalPossessionUntilTick !== undefined && activeAvatar(world) === cultivator
          ? { actorId: cultivator.id, grantedTick: world.tick, bindingGeneration: avatar.switchAvailableTick,
              originalPossessionUntilTick }
          : undefined;
        return triggerTribulation(world, cultivator, guide);
      }
      return resolveOrdinaryBreakthrough(world,cultivator,location?.name,rng);
    }

    case 'SOCIALIZE': {
      const target = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && !ascensionDutyActive(world,c) && c.locationId === cultivator.locationId && !activeDanxiaMedicineEscort(world,c) && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) && !pilgrimageCheckpoint(world, c) && !courierCheckpoint(world, c) && !expeditionRescueCheckpoint(world, c) && !boundaryReliefCheckpoint(world, c) && !disasterShelterCheckpoint(world,c) &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!target) return null;

      adjustRelationship(
        world,
        cultivator.id,
        target.id,
        12,
        cultivator.sectId === target.sectId ? '同门' : '挚友',
        `在${location?.name ?? '秘境'}品茗论道，情谊加深`
      );
      cultivator.qiProgress = clamp(cultivator.qiProgress + 6, 0, 100);
      target.qiProgress = clamp(target.qiProgress + 6, 0, 100);
      recordMemory(
        cultivator,
        world.tick,
        `与【${target.name}】在【${location?.name ?? '坊市'}】论道交流，双方修为皆有精进。`,
        6,
        'social', 3
      );
      return {
        id: `evt-${world.tick}-${cultivator.id}-social`,
        tick: world.tick,
        year: world.year,
        month: world.month,
        title: `${cultivator.name}与${target.name}坐而论道`,
        description: `${cultivator.name}与${target.name}于【${location?.name ?? '灵山'}】畅谈天地法则。言道：“${publicSpeech||personaLine(cultivator,'social_open')}”`,
        category: 'diplomacy',
        actorIds: [cultivator.id, target.id],
        locationId: cultivator.locationId,
      };
    }

    case 'SCHEMING': {
      const target = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && !ascensionDutyActive(world,c) && c.locationId === cultivator.locationId && !activeDanxiaMedicineEscort(world,c) && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) && !pilgrimageCheckpoint(world, c) && !courierCheckpoint(world, c) && !expeditionRescueCheckpoint(world, c) && !boundaryReliefCheckpoint(world, c) && !disasterShelterCheckpoint(world,c) &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!target) return null;

      if (decision.rumorIntent) {
        fabricateRumor(world, cultivator, target, decision.rumorIntent);
      }
      const stolenStones = Math.min(target.spiritStones, Math.round(50 + rng() * 110));
      target.spiritStones -= stolenStones;
      cultivator.spiritStones += stolenStones;
      cultivator.karma = clamp(cultivator.karma - 8, -100, 100);

      adjustRelationship(
        world,
        cultivator.id,
        target.id,
        -25,
        '竞争',
        `${cultivator.name}暗中设局算计了${target.name}`
      );
      recordMemory(
        cultivator,
        world.tick,
        `施展阴谋算计【${target.name}】，截获其 ${stolenStones} 枚灵石与修行情报。`,
        7,
        'social', 2
      );
      recordMemory(
        target,
        world.tick,
        `遭【${cultivator.name}】暗中算计，损失了 ${stolenStones} 枚灵石，心中暗恨！`,
        8,
        'social', -4
      );
      return {
        id: `evt-${world.tick}-${cultivator.id}-scheme`,
        tick: world.tick,
        year: world.year,
        month: world.month,
        title: `暗流涌动：${cultivator.name}设局算计${target.name}`,
        description: `${cultivator.name}借天机迷阵暗算${target.name}，夺走 ${stolenStones} 枚灵石并动摇其道心。`,
        category: 'intrigue',
        witnessScope: 'participants',
        actorIds: [cultivator.id, target.id],
        locationId: cultivator.locationId,
      };
    }

    case 'FAREWELL_LANDING':
    case 'FRONTIER_GORGE':
    case 'FRONTIER_NIGHT_HUNT':
    case 'SCHOOL_FORM_DUEL':
    case 'BEAST_DUEL_RESPONSE':
    case 'FORBIDDEN_ART':
      // The owner can only answer through an actual suspended duel's native monthly slot.
      return null;
    case 'DUEL': {
      const defender = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && !ascensionDutyActive(world,c) && c.locationId === cultivator.locationId && !activeDanxiaMedicineEscort(world,c) && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) && !pilgrimageCheckpoint(world, c) && !courierCheckpoint(world, c) && !expeditionRescueCheckpoint(world, c) && !boundaryReliefCheckpoint(world, c) && !disasterShelterCheckpoint(world,c) &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!defender || forbiddenDuelForParticipant(world,defender) || forbiddenDuelForParticipant(world,cultivator)||beastDuelContactForParticipant(world,defender)||
          beastDuelContactForParticipant(world,cultivator)||schoolFormDuelForParticipant(world,cultivator)||
          schoolFormDuelForParticipant(world,defender)) return null;
      if(decision.duelMercy!==undefined&&(decision.duelMercy!=='spare'||decision.targetCultivatorId!==defender.id||
        authorizedBountyTargetId!==undefined||!lawfulConditionalMercy(world,cultivator,defender)))return null;
      const ward = interceptSanctuaryDuel(world, cultivator, defender);
      if (ward?.blocked) return ward.event;
      if (ward) recordAuxiliaryActionEvent(world, ward.event, emit);
      const rolls:NativeDuelRolls=[rng(),rng(),rng(),rng()];
      if(allowForbiddenDuel&&authorizedBountyTargetId===undefined&&
          (cultivator.hp<.25*cultivator.maxHp||defender.hp<.25*defender.maxHp)){
        const threat=measureNativeDuel(world,cultivator,defender,rolls,undefined,previewDaoDuelIntents(world,cultivator,defender));
        // A valid conditional restraint never requires the incoming defender to pay for separate self-protection.
        const intendedRestraint=decision.duelMercy==='spare'&&threat.winner===cultivator&&threat.loser===defender;
        if(!intendedRestraint&&threat.loser.hp<.25*threat.loser.maxHp&&
          previewSectArrayDamage(world,threat.loser,threat.winner,threat.hitLoser)>=threat.loser.hp){
          const contact=openForbiddenDuelContact(world,cultivator,defender,threat.loser,rolls);
          if(contact)return {
            id:`evt-${contact.id}-contact`,tick:world.tick,year:world.year,month:world.month,
            title:'刃下绝境',description:'两道锋芒已在此地相抵；交锋尚未落定。',
            category:'combat',actorIds:[cultivator.id,defender.id],locationId:contact.siteId,witnessScope:'participants',
          };
          const beastContact=openBeastDuelContact(world,cultivator,defender,threat.loser,rolls);
          if(beastContact)return openBeastDuelEvent(world,beastContact);
        }
      }
      if(allowForbiddenDuel&&decision.duelMercy===undefined&&authorizedBountyTargetId===undefined&&decision.targetCultivatorId===defender.id){
        const school=openSchoolFormDuel(world,cultivator,defender,rolls);
        if(school)return schoolFormPrivateEvent(world,school,'noticed');
      }
      return settleNativeDuel(world,cultivator,defender,publicDecision,rolls,authorizedBountyTargetId,emit);
    }
  }
}

/**
 * Advances the entire world by 1 tick (1 month in virtual cultivation calendar).
 * Accepts optional precomputed LLM decisions keyed by cultivator ID.
 */
function creditSectService(world: WorldState, actor: Cultivator, event: WorldEvent | null): void {
  if (!actor.alive || !world.sects.some((sect) => sect.id === actor.sectId)) return;
  const ownSect = world.sects.find((sect) => sect.id === actor.sectId);
  let points = 0;
  if (event?.id.endsWith('-author-technique')) points = 25;
  else if (event?.dialogue?.kind === 'sect_diplomacy') points = 12;
  else if (event?.id.endsWith('-scheme-outcome') && actor.activeScheme?.kind === 'infiltration' && actor.activeScheme.status === 'completed') points = 16;
  else if (event?.id.endsWith('-social') && world.cultivators.some((other) =>
    other.id !== actor.id && event.actorIds.includes(other.id) && other.sectId === actor.sectId)) points = 4;
  else if (actor.locationId === ownSect?.headquartersId && actor.currentAction === 'CULTIVATE') points = 2;
  rewardContribution(actor, world, points);
}

export function advanceWorldTick(
  prevState: WorldState,
  precomputedDecisions?: Record<string, LLMDecisionPayload>,
  injectedRandom: (() => number) | undefined = undefined,
  councilMode: 'utility' | 'deferred' = 'utility',
  recordDecisionEffect?: (actorId: string, applied: boolean) => void,
  traceOptions?: {
    tape?: DecisionReplayTape;
    modelActors?: ReadonlySet<string>;
    /** An attempted online choice that did not validate cannot become an offline assent. */
    suppressAutoClanConsent?: ReadonlySet<string>;
    captureTrace?: boolean;
    capturePresentation?: boolean;
    onWatchBatch?: (events: readonly WorldEvent[]) => void;
    onCompletedEvents?: (events: readonly WorldEvent[]) => void;
    replayDraws?: Readonly<Record<string, number>>;
    replayHeartModelActors?: ReadonlySet<string>;
    replayForbiddenModelActors?: ReadonlySet<string>;
    replayGrandSiegeModelActors?: ReadonlySet<string>;
    onActor?: (actorId: string, candidates: DecisionTraceCandidate[], applied: boolean) => void;
  }
): WorldState {
  const nextState: WorldState = cloneWorldWithColdHistory(prevState);
  const rng = injectedRandom ?? worldRandom(nextState);
  nextState.tick += 1;
  if (nextState.month >= 12) {
    nextState.year += 1;
    nextState.month = 1;
  } else {
    nextState.month += 1;
  }

  advanceProtagonistSuccession(nextState, prevState);
  trackFlightTurn(nextState);
  openResourceFlowMonth(nextState);
  advanceNorthMiningCharters(nextState);
  advanceNorthGateRenewal(nextState);
  advanceFrontierProduction(nextState);
  advanceRouteWarnings(nextState);
  maintainPlayerAvatar(nextState);
  maintainMentorship(nextState);
  const avatarOrder = consumeAvatarOrder(nextState);
  const pendingGateEffects=new Map<string,{decision:LLMDecisionPayload;model:boolean;avatar:boolean;supplied:boolean}>();
  const danxiaRegrowth = maintainAlchemy(nextState);
  maintainSectEconomy(nextState);
  const newEvents: WorldEvent[] = [...advanceSanctuaries(nextState), ...advanceCeasefires(nextState), ...advanceCompetitionSeasons(nextState), ...advanceMapHazards(nextState), ...advanceTerrainSuccession(nextState), ...advanceWaterVein(nextState), ...advanceRoads(nextState), ...advanceCouriers(nextState), ...advanceDanxiaMedicine(nextState), ...advanceDanxiaSeasonReviews(nextState), ...advancePilgrimages(nextState), ...advanceRelocations(nextState), ...advanceDoctrineMaturity(nextState,prevState), ...advanceWorkshopInstitutionClosures(nextState), ...advanceSettlements(nextState), ...advanceVillageSupply(nextState), ...advanceVillageWorks(nextState), ...advanceSpiritBeasts(nextState, rng), ...advanceSeedCulture(nextState), ...advanceVillageFairs(nextState), ...advanceHabitats(nextState), ...advanceInfirmaries(nextState), ...advanceFormations(nextState), ...advanceTerritorialLeases(nextState), ...advanceSharedCommons(nextState), ...advanceHouseholds(nextState), ...advanceSeasonalHousing(nextState)];
  newEvents.push(...openDanxiaShortage(nextState,danxiaRegrowth));
  for (const event of newEvents) witnessEvent(nextState, event);
  openFurnaceTurn(nextState);
  beginClinicDutyTurn(nextState);
  recordRegionalEarlyPromotions(nextState,prevState);
  const regionalTurn=beginRegionalSimulationTurn(nextState);
  const finishedDuelActors=new Set<string>();
  pruneInvalidForbiddenDuelContacts(nextState);
  pruneInvalidBeastDuelContacts(nextState);
  deadSchoolFormContacts(nextState);

  for (const cultivator of [...nextState.cultivators]) {
    if (!cultivator.alive || cultivator.positionPlane === 'immortal') continue;

    // Age increment every 12 months
    if (nextState.month === 1) {
      cultivator.age += 1;
      if (cultivator.age >= cultivator.lifespan) {
        cultivator.alive = false;
        cultivator.hp = 0;
        closeInterruptedTrial(cultivator, nextState.tick);
        const below = onLowerPlane(cultivator);
        if(below) dropInheritance(cultivator, nextState);
        else if(cultivator.positionPlane==='frontier')recordFrontierDeath(nextState,cultivator);
        else recordUpperPassageDeath(nextState,cultivator);
        const death: WorldEvent = {
          id: below ? `evt-${nextState.tick}-${cultivator.id}-oldage` :
            `evt-${cultivator.positionPlane==='frontier'?'frontier':'upper-passage'}-${nextState.tick}-${cultivator.id}-oldage`,
          tick: nextState.tick,
          year: nextState.year,
          month: nextState.month,
          title: `寿元耗尽：${cultivator.name}坐化陨落`,
          description: below ? `${cultivator.name}未能突破更高境界，大限将至，于洞府中安然坐化。` : '此人已到实际寿限；财物仍与本人的原处记录同存。',
          category: 'death',
          actorIds: [cultivator.id],
          ...(below ? {locationId:cultivator.locationId} : {witnessScope:'participants' as const}),
        };
        newEvents.push(death);
        witnessEvent(nextState, death);
        continue;
      }
    }

    if (ascensionDutyActive(nextState, cultivator)) {
      const supplied = precomputedDecisions && Object.hasOwn(precomputedDecisions, cultivator.id)
        ? precomputedDecisions[cultivator.id] : undefined;
      const explicit = avatarOrder?.actorId === cultivator.id && avatarOrder.decision.chosenAction === 'ASCENSION' ?
        avatarOrder.decision : undefined;
      const requested = explicit ?? supplied;
      const provider = !explicit && Boolean(supplied && (traceOptions?.modelActors?.has(cultivator.id) || isProviderPersonaDecision(supplied)));
      const earlier = provider ? prevState.cultivators.find(actor => actor.id === cultivator.id) : undefined;
      const originallyOffered = !provider || earlier && exactAscensionDecision(requested,
        availableAutonomousAscensionActions(earlier, prevState, nextState.tick), true);
      const accepted = originallyOffered ? exactAscensionDecision(requested, provider
        ? availableAutonomousAscensionActions(cultivator, nextState)
        : availableAscensionActions(cultivator, nextState), true) : undefined;
      const native = accepted ?? utilityAscensionDecision(cultivator, nextState);
      const recorded = native ?? ascensionQuietWait();
      if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, recorded, 0, false, false, false, nextState);
      const event = native && applyCultivatorBrainDecision(nextState, cultivator, native, rng, undefined, undefined, explicit,
        provider && Boolean(accepted));
      if (event) {
        newEvents.push(event);
        witnessEvent(nextState, event);
        renewRegionalProtectionAfterEvent(regionalTurn);
      } else {
        cultivator.currentAction = 'ASCENSION';
        cultivator.innerMonologue = recorded.innerMonologue;
      }
      if (supplied) recordDecisionEffect?.(cultivator.id, !explicit && Boolean(accepted && event));
      traceOptions?.onActor?.(cultivator.id, [], Boolean(event));
      if (traceOptions?.captureTrace !== false) recordDecisionTrace(nextState, cultivator.id, [], recorded,
        explicit ? 'avatar' : provider && accepted ? 'model' : 'utility', Boolean(event));
      continue;
    }

    if(!onLowerPlane(cultivator)){
      const supplied=precomputedDecisions&&Object.hasOwn(precomputedDecisions,cultivator.id)?precomputedDecisions[cultivator.id]:undefined;
      const explicit=avatarOrder?.actorId===cultivator.id?avatarOrder.decision:undefined;
      let decisionDraws=0;
      const fromModel=Boolean(!explicit&&supplied&&traceOptions?.modelActors?.has(cultivator.id));
      let requested=explicit??supplied;
      if(fromModel&&requested?.chosenAction==='FAREWELL_LANDING'){
        const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
        if(!earlier||activeAvatar(prevState)===earlier||!exactFarewellLandingDecision(requested,
          availableFarewellLandingActions(earlier,prevState,nextState.tick),true))requested=undefined;
      }
      if(fromModel&&requested?.chosenAction==='FRONTIER_GORGE'){
        const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
        if(!earlier||activeAvatar(prevState)===earlier||!exactFrontierGorgeDecision(requested,
          availableFrontierGorgeActions(earlier,prevState,nextState.tick),true))requested=undefined;
      }
      if(fromModel&&requested?.chosenAction==='FRONTIER_NIGHT_HUNT'){
        const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
        if(!earlier||activeAvatar(prevState)===earlier||!exactFrontierNightHuntDecision(requested,
          availableFrontierNightHuntActions(earlier,prevState,nextState.tick),true))requested=undefined;
      }
      const decision=requested??computeHeuristicDecision(cultivator,nextState,()=>{decisionDraws++;return rng();});
      if((explicit||supplied)&&traceOptions?.replayDraws){
        const draws=traceOptions.replayDraws[cultivator.id]??0;
        for(let step=0;step<Math.min(64,draws);step++)rng();
      }
      const capture=traceOptions?.captureTrace!==false;
      const candidates:DecisionTraceCandidate[]=[]; // no lower trace state crosses the plane
      if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,cultivator.id,decision,decisionDraws);
      const result=applyCultivatorBrainDecision(nextState,cultivator,decision,rng,undefined,event=>{
        newEvents.push(event);witnessEvent(nextState,event);
      },explicit,Boolean(fromModel&&requested));
      const applied=(decision.chosenAction==='UPPER_PASSAGE'||decision.chosenAction==='FRONTIER_NIGHT_HUNT'||decision.chosenAction==='FRONTIER_GORGE'||decision.chosenAction==='FAREWELL_LANDING'||
        isFrontierAction(decision.chosenAction)||isUpperArrayFieldAction(decision.chosenAction))&&result!==null;
      if(supplied)recordDecisionEffect?.(cultivator.id,!explicit&&requested===supplied&&applied);
      traceOptions?.onActor?.(cultivator.id,candidates,applied);
      if(capture)recordDecisionTrace(nextState,cultivator.id,candidates,decision,explicit?'avatar':
        supplied&&traceOptions?.modelActors?.has(cultivator.id)?'model':'utility',applied);
      if(result){newEvents.push(result);if(decision.chosenAction!=='FRONTIER_GORGE'&&!isPrivateFrontierNightHuntEvent(result)&&!isPrivateFrontierGorgeEvent(result)&&!isPrivateFarewellLandingEvent(result))witnessEvent(nextState,result);}
      continue;
    }

    if(!isTribulationActive(cultivator)&&(activeDanxiaMedicineEscort(nextState,cultivator)||danxiaMedicineActedThisTick(nextState,cultivator))){
      cultivator.currentAction='DANXIA_MEDICINE';
      cultivator.innerMonologue='沿原路实际护送或折返；无本人签收不得宣告已交。';
      continue;
    }
    if (activeCourierForActor(nextState, cultivator) || courierActedThisTick(nextState, cultivator)) {
      const supplied = precomputedDecisions && Object.hasOwn(precomputedDecisions, cultivator.id) ? precomputedDecisions[cultivator.id] : undefined;
      const allowedHandoff = courierHandoffMayOfferNow(nextState, cultivator);
      if (allowedHandoff || supplied?.chosenAction === 'COURIER_HANDOFF') {
        const decision = supplied ?? computeHeuristicDecision(cultivator, nextState, rng);
        if (decision.chosenAction === 'COURIER_HANDOFF' && decision.courierHandoffMove === 'offer') {
          const event = allowedHandoff ? applyCultivatorBrainDecision(nextState, cultivator, decision, rng) : null;
          const applied = event !== null;
          if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, decision, 0);
          if (supplied) recordDecisionEffect?.(cultivator.id, applied);
          traceOptions?.onActor?.(cultivator.id, [], applied);
          if (traceOptions?.captureTrace !== false) recordDecisionTrace(nextState, cultivator.id, [], decision,
            traceOptions?.modelActors?.has(cultivator.id) ? 'model' : 'utility', applied);
          if (event) {
            newEvents.push(event);
            witnessEvent(nextState, event);
            renewRegionalProtectionAfterEvent(regionalTurn);
            continue;
          }
        } else if (supplied && traceOptions?.tape) {
          rememberReplayDecision(traceOptions.tape, cultivator.id, decision, 0);
        }
      }
      cultivator.currentAction = 'SEALED_COURIER';
      cultivator.innerMonologue = '沿实际关口投递或折返，本轮不另作行动。';
      continue;
    }

    if (activeEscortForActor(nextState, cultivator)) {
      cultivator.currentAction = 'ESCORT';
      cultivator.innerMonologue = '正沿实路护送客户货物，不能另作行动。';
      continue;
    }

    if (activeRelocationForActor(nextState, cultivator)) {
      cultivator.currentAction = 'RELOCATE';
      cultivator.innerMonologue = '山门迁徙尚在途中，须领护送之责。';
      continue;
    }

    if(finishedDuelActors.has(cultivator.id)||mercyReunionAidActed(nextState,cultivator))continue;
    if(mercyReunionAidPendingHold(nextState,cultivator)){
      cultivator.currentAction='MERCY_REUNION';
      cultivator.innerMonologue='先前提议护这一程，如今仍只在原处等对方自己应下。';
      continue;
    }
    const school=schoolFormDuelForParticipant(nextState,cultivator);
    if(school){
      if(school.attackerId!==cultivator.id||school.openedTick>=nextState.tick)continue;
      const defender=nextState.cultivators.find(row=>row.id===school.defenderId);
      const options=availableSchoolFormChoices(nextState,school);
      if(!defender||!options.length){closeSchoolFormDuel(nextState,school);continue;}
      const supplied=precomputedDecisions?.[cultivator.id];
      const directed=avatarOrder?.actorId===cultivator.id?avatarOrder.decision:undefined;
      const fromModel=Boolean(!directed&&traceOptions?.modelActors?.has(cultivator.id));
      const earlier=prevState.cultivators.find(row=>row.id===cultivator.id);
      const before=earlier&&schoolFormDuelForParticipant(prevState,earlier);
      const requested=before?.id===school.id&&(!fromModel||activeAvatar(prevState)!==earlier)
        ?exactSchoolFormDecision(directed??supplied,school.id,availableSchoolFormChoices(prevState,before),true):undefined;
      const accepted=requested&&exactSchoolFormDecision(requested,school.id,options,true);
      // The possessed learner can wait one month; never invent a player answer at expiry.
      if(!accepted&&activeAvatar(nextState)===cultivator&&nextState.tick===school.openedTick+1)continue;
      const fallback=activeAvatar(nextState)===cultivator?undefined:
        options.includes('counter')&&cultivator.hp>=cultivator.maxHp*.45&&
        (cultivator.personality==='狂傲'||cultivator.personality==='嗜血'||cultivator.personality==='刚正')?'counter':'stop';
      const choice=accepted?.schoolFormChoice??fallback;
      const settled=choice?exactSchoolFormDecision(schoolFormCommand(school.id,choice),school.id,options):undefined;
      const modifier=choice==='counter'?schoolFormCounterPayment(nextState,school):undefined;
      closeSchoolFormDuel(nextState,school);
      finishedDuelActors.add(cultivator.id);finishedDuelActors.add(defender.id);
      if(settled){cultivator.currentAction='SCHOOL_FORM_DUEL';cultivator.innerMonologue=settled.innerMonologue;}
      if(choice==='stop'){
        newEvents.push(schoolFormPrivateEvent(nextState,school,'stop'));
      }else{
        if(modifier)newEvents.push(schoolFormPrivateEvent(nextState,school,'counter'));
        const publish=(event:WorldEvent)=>{newEvents.push(event);witnessEvent(nextState,event);};
        const duel=settleNativeDuel(nextState,cultivator,defender,settled??{chosenAction:'DUEL',innerMonologue:'只按眼下刃势。'},
          school.rolls,undefined,publish,undefined,undefined,modifier);
        captureWitnessedPersonalScene(nextState,duel);captureDramaticBondFact(nextState,duel);
        publish(duel);
        const actual=modifier&&schoolFormActualStroke(nextState,school,duel);
        if(actual)newEvents.push(actual);
        renewRegionalProtectionAfterEvent(regionalTurn);
      }
      if(settled&&traceOptions?.tape)rememberReplayDecision(traceOptions.tape,cultivator.id,settled,0);
      if(supplied)recordDecisionEffect?.(cultivator.id,Boolean(accepted&&fromModel));
      if(settled&&traceOptions?.captureTrace!==false)
        recordDecisionTrace(nextState,cultivator.id,[],settled,directed?'avatar':accepted&&fromModel?'model':'utility',true);
      continue;
    }
    const beastContact=beastDuelContactForParticipant(nextState,cultivator);
    if(beastContact){
      cultivator.currentAction='BEAST_DUEL_RESPONSE';
      cultivator.innerMonologue='这一刃尚未落定，不在此时另行动作。';
      if(beastContact.attackerId!==cultivator.id||beastContact.openedTick>=nextState.tick)continue;
      const defender=nextState.cultivators.find(actor=>actor.id===beastContact.defenderId);
      if(!defender)continue;
      const owner=beastContact.ownerId===cultivator.id?cultivator:defender;
      const offered=precomputedDecisions?.[owner.id];
      const modelInput=Boolean(offered&&(traceOptions?.modelActors?.has(owner.id)||traceOptions?.replayDraws));
      const response=prepareBeastDuelResolution(nextState,beastContact,offered,modelInput);
      if(!response)continue;
      const published=(event:WorldEvent)=>{newEvents.push(event);witnessEvent(nextState,event);};
      if(response.choice==='withdraw'){
        const retreat=response.destinationId&&settleBeastWithdraw(nextState,beastContact,response.destinationId);
        if(!retreat)continue;
        published(retreat);
      }
      finishedDuelActors.add(cultivator.id);finishedDuelActors.add(defender.id);
      const settled:LLMDecisionPayload={chosenAction:'BEAST_DUEL_RESPONSE',targetBeastDuelId:beastContact.id,
        beastDuelChoice:response.choice,
        ...(response.destinationId?{targetLocationId:response.destinationId}:{}),innerMonologue:'依这一刃实际行止。'};
      const event=settleNativeDuel(nextState,cultivator,defender,settled,beastContact.rolls,undefined,published,undefined,
        response.choice==='guard'?beastContact:undefined);
      consumeBeastDuelContact(nextState,beastContact);
      captureWitnessedPersonalScene(nextState,event);
      captureDramaticBondFact(nextState,event);
      published(event);
      renewRegionalProtectionAfterEvent(regionalTurn);
      const modelUsed=Boolean(modelInput&&offered?.chosenAction==='BEAST_DUEL_RESPONSE'&&
        offered.targetBeastDuelId===beastContact.id&&response.choice===offered.beastDuelChoice&&response.destinationId===offered.targetLocationId);
      if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,owner.id,settled,0);
      recordDecisionEffect?.(owner.id,modelUsed);
      traceOptions?.onActor?.(owner.id,[],true);
      if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,owner.id,[],settled,
        beastContact.guided?'avatar':modelUsed?'model':'utility',true);
      continue;
    }
    const contact=nextState.forbiddenDuels?.length?forbiddenDuelForParticipant(nextState,cultivator):undefined;
    if(contact){
      cultivator.currentAction='FORBIDDEN_ART';
      cultivator.innerMonologue='刃势未歇，此番交锋尚未落定。';
      if(contact.attackerId!==cultivator.id||contact.openedTick>=nextState.tick)continue;
      const defender=nextState.cultivators.find(actor=>actor.id===contact.defenderId);
      const owner=contact.ownerId===cultivator.id?cultivator:defender;
      if(!defender||!owner)continue;
      const offered=precomputedDecisions&&Object.hasOwn(precomputedDecisions,owner.id)?precomputedDecisions[owner.id]:undefined;
      const modelInput=Boolean(offered&&(traceOptions?.modelActors?.has(owner.id)||traceOptions?.replayForbiddenModelActors?.has(owner.id)));
      const response=prepareForbiddenDuelResolution(nextState,contact,offered,modelInput);
      if(response.kind!=='ready')continue;
      const activation=consumeForbiddenDuelContact(nextState,contact,response.choice,response.origin)??
        consumeForbiddenDuelContact(nextState,contact,'decline','utility');
      if(!activation)continue;
      const settled:LLMDecisionPayload={chosenAction:'FORBIDDEN_ART',targetForbiddenDuelId:contact.id,
        forbiddenArtChoice:activation.choice,innerMonologue:'只在眼前实有的刃下落定此念。'};
      if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,owner.id,settled,0,false,activation.origin==='model');
      finishedDuelActors.add(cultivator.id);finishedDuelActors.add(defender.id);
      const publish=(event:WorldEvent)=>{newEvents.push(event);witnessEvent(nextState,event);};
      if(activation.choice==='decline'){
        const threat=measureNativeDuel(nextState,cultivator,defender,contact.rolls,undefined,previewDaoDuelIntents(nextState,cultivator,defender));
        if(threat.loser===owner&&owner.hp<.25*owner.maxHp&&
          previewSectArrayDamage(nextState,threat.loser,threat.winner,threat.hitLoser)>=owner.hp){
          const nextContact=openBeastDuelContact(nextState,cultivator,defender,owner,contact.rolls);
          if(nextContact){publish(openBeastDuelEvent(nextState,nextContact));continue;}
        }
      }
      const event=settleNativeDuel(nextState,cultivator,defender,settled,contact.rolls,undefined,publish,{contact,activation});
      captureWitnessedPersonalScene(nextState,event);
      captureDramaticBondFact(nextState,event);
      publish(event);
      renewRegionalProtectionAfterEvent(regionalTurn);
      if(recordDecisionEffect&&offered)recordDecisionEffect(owner.id,activation.origin==='model'||!modelInput&&
        activation.origin==='utility'&&offered.chosenAction==='FORBIDDEN_ART'&&offered.targetForbiddenDuelId===contact.id&&
        offered.forbiddenArtChoice===activation.choice);
      traceOptions?.onActor?.(owner.id,[],true);
      if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,owner.id,[],settled,
        activation.origin==='player'?'avatar':activation.origin,true);
      continue;
    }

    const audience=nextState.playerAvatar.audience&&!isTribulationActive(cultivator)&&!activeSiegeForActor(nextState,cultivator)&&
      !activeOccasionForActor(nextState,cultivator)&&avatarOrder?.actorId!==cultivator.id&&
      !activeRoguelikeEncounter(nextState,cultivator)&&!activeDestinyTraitOffer(nextState,cultivator)
      ?pendingRingAudienceExecution(nextState,cultivator):undefined;
    if(audience?.aim==='challenge_master'&&audience.leaderId){
      const duel=applyCultivatorBrainDecision(nextState,cultivator,{chosenAction:'DUEL',targetCultivatorId:audience.leaderId,
        innerMonologue:'只与真正眼前的掌门当面分说。'},rng,undefined,
        event=>{newEvents.push(event);witnessEvent(nextState,event);});
      if(duel){
        if(duel.duelWinnerId&&duel.actorIds[1]===audience.leaderId)finishRingAudienceExecution(nextState,audience,duel,'confronted');
        captureWitnessedPersonalScene(nextState,duel);captureDramaticBondFact(nextState,duel);
        newEvents.push(duel);witnessEvent(nextState,duel);
        renewRegionalProtectionAfterEvent(regionalTurn);
        if(precomputedDecisions&&Object.hasOwn(precomputedDecisions,cultivator.id))recordDecisionEffect?.(cultivator.id,false);
        continue;
      }
    }else if(audience&&audience.aim!=='challenge_master'){
      const effect=audience.aim==='leave_sect'?'left':'learned';
      if(effect==='left'){
        cultivator.sectId='';cultivator.sectRank='外门弟子';cultivator.contribution=0;
        delete cultivator.guardAssignment;
      }else{
        cultivator.qiProgress-=10;
        cultivator.technique={id:RING_AUDIENCE_TABOO_TECHNIQUE,name:'藏锋逆息诀',spiritRoot:cultivator.spiritRoot};
        cultivator.techniqueMastery=10;
      }
      cultivator.currentAction='AUDIENCE_PLEDGE';
      const execution:WorldEvent={id:`evt-${nextState.tick}-${cultivator.id}-audience-${effect}`,tick:nextState.tick,year:nextState.year,month:nextState.month,
        title:effect==='left'?'离山立身':'禁诀入门',description:effect==='left'?'已亲自卸下门中名籍，此刻仍在原处。':'实耗十点灵气，已学藏锋逆息诀的入门一式。',
        category:effect==='left'?'diplomacy':'breakthrough',actorIds:[cultivator.id],locationId:cultivator.locationId,witnessScope:'participants'};
      finishRingAudienceExecution(nextState,audience,execution,effect);
      newEvents.push(execution);
      if(precomputedDecisions&&Object.hasOwn(precomputedDecisions,cultivator.id))recordDecisionEffect?.(cultivator.id,false);
      continue;
    }

    const supplied = precomputedDecisions && Object.hasOwn(precomputedDecisions, cultivator.id) ? precomputedDecisions[cultivator.id] : undefined;
    const avatarDecision = avatarOrder?.actorId === cultivator.id ? avatarOrder.decision : undefined;
    const modelProposal = supplied && traceOptions?.modelActors?.has(cultivator.id) ? supplied : undefined;
    let provided = avatarDecision ?? supplied;
    let modelOrdinaryReplaced=false;
    if (modelProposal?.targetCampaignAssemblySiegeId!==undefined && !avatarDecision) {
      const before=prevState.cultivators.find(row=>row.id===cultivator.id);
      const {targetCampaignAssemblySiegeId,...native}=modelProposal;
      if(!before||activeAvatar(prevState)===before||!exactCampaignAssemblyDecision(native,
        availableCampaignAssemblyActions(before,prevState,nextState.tick).filter(row=>
          row.kind!=='guard'&&row.siegeId===targetCampaignAssemblySiegeId),true)) {
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='VACANT_GATE'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactVacantGateDecision(modelProposal,
        availableVacantGateActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='BANQUET_SEAT'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactBanquetSeatDecision(modelProposal,
        availableBanquetSeatActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='NIGHT_DOOR'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactNightDoorDecision(modelProposal,
        availableNightDoorActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='BOUNDARY_GAP'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactBoundaryGapDecision(modelProposal,
        availableBoundaryGapActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='ABANDONED_QUARTER'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactAbandonedQuarterDecision(modelProposal,
        availableAbandonedQuarterActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='FURNACE_EMERGENCY'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactFurnaceEmergencyDecision(modelProposal,
        availableFurnaceEmergencyActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='APPRENTICESHIP_REUNION'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactApprenticeshipReunionDecision(modelProposal,
        availableApprenticeshipReunionActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='PILGRIMAGE_FORK'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactPilgrimageForkDecision(modelProposal,
        availablePilgrimageForkActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='BATTLEFIELD_AFTERMATH'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactBattlefieldAftermathDecision(modelProposal,
        availableBattlefieldAftermathActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='VILLAGE_REUNION'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactVillageReunionDecision(modelProposal,
        availableVillageReunionActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='WILD_MIGRATION'&&!avatarDecision){
      const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!prior||activeAvatar(prevState)===prior||!exactWildMigrationDecision(modelProposal,
        availableWildMigrationActions(prior,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal&&!avatarDecision&&(modelProposal.chosenAction==='MERCY_REUNION'||modelProposal.duelMercy!==undefined)){
      const before=prevState.cultivators.find(row=>row.id===cultivator.id);
      const menu=before&&(modelProposal.chosenAction==='MERCY_REUNION'
        ?availableMercyReunionActions(before,prevState,nextState.tick):conditionalMercyChoices(prevState,before,nextState.tick));
      if(!before||activeAvatar(prevState)===before||!menu||!exactStoryMercyDecision(modelProposal,menu,true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if(modelProposal?.chosenAction==='PAVILION_FIRE'&&!avatarDecision){
      const before=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!before||activeAvatar(prevState)===before||!exactPavilionFireDecision(modelProposal,
        availablePavilionFireActions(before,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if (modelProposal?.chosenAction === 'WITNESS_INQUIRY' && !avatarDecision) {
      const before=prevState.cultivators.find(row=>row.id===cultivator.id);
      if(!before||activeAvatar(prevState)===before||
        !exactWitnessInquiryDecision(modelProposal,availableWitnessInquiryActions(before,prevState,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    if (modelProposal?.chosenAction === 'CALAMITY_ARRAY' && !avatarDecision) {
      const old = prevState.cultivators.find(actor => actor.id === cultivator.id);
      if (!old || activeAvatar(prevState) === old ||
        !exactCalamityArrayDecision(modelProposal, availableCalamityArrayChoices(prevState, old, nextState.tick), true)) {
        provided = undefined;
        modelOrdinaryReplaced = true;
      }
    }
    if(modelProposal?.chosenAction==='BATTLEFIELD_REVISIT'&&!avatarDecision){
      const old=prevState.cultivators.find(actor=>actor.id===cultivator.id);
      if(!old||activeAvatar(prevState)===old||
        !exactBattlefieldRevisitDecision(modelProposal,availableBattlefieldRevisits(prevState,old,nextState.tick),true)){
        provided=undefined;
        modelOrdinaryReplaced=true;
      }
    }
    const fromProvider=Boolean(!avatarDecision&&provided&&(modelProposal||isProviderPersonaDecision(provided)));
    const replaying=traceOptions?.replayDraws!==undefined;
    const exactPlainRest=provided?.chosenAction==='REST'&&Object.keys(provided).every(
      key=>key==='chosenAction'||key==='innerMonologue');
    const pauseBody=exactPlainRest&&!avatarDecision&&(fromProvider||replaying)
      ?prevState.cultivators.find(actor=>actor.id===cultivator.id):undefined;
    const pauseOption=pauseBody&&activeOccasionForActor(prevState,pauseBody)?.kind==='expedition'&&
      canPauseAftermathRescue(pauseBody,prevState,nextState.tick)
      ?autonomousExpeditionRescueOptions(pauseBody,prevState,nextState.tick).find(option=>option.rescueMove==='accept'):undefined;
    let suppressRescueAccept=Boolean(pauseOption);
    let holdAftermathRescue=Boolean(pauseOption);
    if(!avatarDecision&&provided?.targetHeartDemonAftermathId!==undefined&&
      (modelProposal||isProviderPersonaDecision(provided))){
      const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
      if(!earlier||activeAvatar(nextState)===cultivator||
        availableHeartDemonRecovery(prevState,earlier,nextState.tick)?.targetHeartDemonAftermathId!==provided.targetHeartDemonAftermathId||
        availableHeartDemonRecovery(nextState,cultivator)?.targetHeartDemonAftermathId!==provided.targetHeartDemonAftermathId){
        provided={chosenAction:'REST',innerMonologue:'只在眼前停一停；不沿用已不合时的闭关之约。'};
        modelOrdinaryReplaced=true;
      }
    }
    if(!avatarDecision&&provided?.chosenAction==='EXPEDITION_RESCUE'&&provided.rescueMove==='accept'&&
      (modelProposal||isProviderPersonaDecision(provided))){
      const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
      const rescueId=provided.targetExpeditionRescueId;
      const exact=(options:ReturnType<typeof autonomousExpeditionRescueOptions>)=>
        options.some(option=>option.rescueMove==='accept'&&option.targetExpeditionRescueId===rescueId);
      if(!earlier||!exact(autonomousExpeditionRescueOptions(earlier,prevState,nextState.tick))||
        !exact(autonomousExpeditionRescueOptions(cultivator,nextState))){
        provided={chosenAction:'REST',innerMonologue:'此时不能接下这份求援，不代签也不报已出发。'};
        modelOrdinaryReplaced=true;
        // A stale private offer cannot be substituted with a new voluntary signature or room progression.
        if((earlier&&voluntaryHeartDemonChoiceEffect(prevState,earlier,nextState.tick)||
            voluntaryHeartDemonChoiceEffect(nextState,cultivator))&&
            activeOccasionForActor(nextState,cultivator)?.kind==='expedition'){
          suppressRescueAccept=true;
          holdAftermathRescue=true;
        }
      }
    }
    if (provided?.chosenAction === 'ASCENSION') {
      const provider = !avatarDecision && Boolean(modelProposal || isProviderPersonaDecision(provided));
      const earlier = provider ? prevState.cultivators.find(actor => actor.id === cultivator.id) : undefined;
      const originallyOffered = !provider || earlier && exactAscensionDecision(provided,
        availableAutonomousAscensionActions(earlier, prevState, nextState.tick), true);
      const legal = originallyOffered && exactAscensionDecision(provided, provider
        ? availableAutonomousAscensionActions(cultivator, nextState) : availableAscensionActions(cultivator, nextState), true);
      if (!legal) {
        provided = requiredBeforeOrdinaryDecision(cultivator, nextState) ?? ascensionQuietWait();
        modelOrdinaryReplaced = provider;
      }
    }
    if (provided?.chosenAction === 'CULTIVATION_CLAN') {
      const fromProvider = !avatarDecision && Boolean(modelProposal || isProviderPersonaDecision(provided));
      const earlier = fromProvider ? prevState.cultivators.find(person => person.id === cultivator.id) : undefined;
      const offered = !fromProvider || earlier && exactCultivationClanDecision(provided,
        availableAutonomousCultivationClanActions(earlier, prevState, nextState.tick), true);
      const actual = offered && !daoPathTurnLocked(cultivator, nextState) &&
        exactCultivationClanDecision(provided, fromProvider ? availableAutonomousCultivationClanActions(cultivator, nextState)
          : availableCultivationClanActions(cultivator, nextState), true);
      if (!actual) {
        provided = requiredBeforeOrdinaryDecision(cultivator, nextState) ?? waitForOwnClanChoice();
        modelOrdinaryReplaced = fromProvider;
      }
    }
    if (provided?.chosenAction === 'IMMORTAL_AUCTION' || provided?.targetAuctionAmbushLotId !== undefined) {
      const fromProvider = !avatarDecision && Boolean(modelProposal || isProviderPersonaDecision(provided));
      const isAuction = provided.chosenAction === 'IMMORTAL_AUCTION';
      const required = requiredBeforeOrdinaryDecision(cultivator, nextState);
      const startingActor = fromProvider ? prevState.cultivators.find(row => row.id === cultivator.id) : undefined;
      const startingOffer = !fromProvider || startingActor && (isAuction
        ? exactImmortalAuctionDecision(provided, availableAutonomousImmortalAuctionActions(startingActor, prevState, nextState.tick), true)
        : exactAuctionAmbushDecision(provided, currentAuctionAmbushOffer(startingActor, prevState), true));
      const legal = startingOffer && !daoPathTurnLocked(cultivator, nextState) && (isAuction
        ? exactImmortalAuctionDecision(provided, fromProvider ? availableAutonomousImmortalAuctionActions(cultivator, nextState)
          : availableImmortalAuctionActions(cultivator, nextState), true)
        : exactAuctionAmbushDecision(provided, currentAuctionAmbushOffer(cultivator, nextState), true));
      if (!legal && (fromProvider || required)) {
        // Do not silently turn a refused provider quote into an autonomous higher payment this month.
        provided = required ?? (isAuction ? { chosenAction: 'REST', innerMonologue: '报价已变，这一口不再出价。' } : undefined);
        modelOrdinaryReplaced = fromProvider;
      }
    }
    if (provided?.chosenAction === 'DAO_PATH') {
      const fromProvider = !avatarDecision && Boolean(modelProposal || isProviderPersonaDecision(provided));
      const required = requiredBeforeOrdinaryDecision(cultivator, nextState);
      const legal = !daoPathTurnLocked(cultivator, nextState) && exactDaoPathDecision(provided, fromProvider
        ? availableAutonomousDaoPathActions(cultivator, nextState) : availableDaoPathActions(cultivator, nextState), true);
      if (!legal && (fromProvider || required)) {
        provided = required;
        modelOrdinaryReplaced = fromProvider;
      }
    }
    if (!avatarDecision && provided?.chosenAction === 'HEAVENLY_ALCHEMY' &&
        (modelProposal || isProviderPersonaDecision(provided))) {
      const required = requiredBeforeOrdinaryDecision(cultivator, nextState);
      const exact = !required && exactHeavenlyAlchemyDecision(provided,
        availableAutonomousHeavenlyAlchemyActions(cultivator, nextState), true);
      if (!exact) {
        provided = required;
        modelOrdinaryReplaced = true;
      }
    }
    if(suppressRescueAccept){
      const required=requiredBeforeOrdinaryDecision(cultivator,nextState,true);
      if(required){
        provided=required;
        modelOrdinaryReplaced=fromProvider;
        holdAftermathRescue=false;
      }
    }
    const ordinaryProposal=!avatarDecision&&fromProvider&&!replaying&&supplied&&isOrdinaryIntentAction(supplied.chosenAction)
      ?supplied:undefined;
    if(ordinaryProposal&&!holdAftermathRescue&&!modelOrdinaryReplaced){
      const required=modelProposal?requiredBeforeOrdinaryDecision(cultivator,nextState,suppressRescueAccept):undefined;
      if(required){
        provided=required;modelOrdinaryReplaced=true;
      }else{
        const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
        if(earlier){
          const history=Boolean(modelProposal)&&hasOrdinaryIntentHistory(prevState,earlier,nextState.tick);
          const social=ordinaryProposal.chosenAction==='SOCIALIZE';
          const oldEffect=social&&voluntaryHeartDemonChoiceEffect(prevState,earlier,nextState.tick);
          const effect=social&&voluntaryHeartDemonChoiceEffect(nextState,cultivator);
          const earlierPreferred=oldEffect?preferredOrdinarySocialIntent(prevState,earlier,nextState.tick):undefined;
          const nowPreferred=effect?preferredOrdinarySocialIntent(nextState,cultivator):undefined;
          const validPreference=!(earlierPreferred||nowPreferred)||Boolean(oldEffect&&effect&&
            oldEffect.trialId===effect.trialId&&oldEffect.resolvedTick===effect.resolvedTick&&oldEffect.choice===effect.choice&&
            earlierPreferred&&nowPreferred&&matchesOrdinaryIntent(earlierPreferred,ordinaryProposal)&&matchesOrdinaryIntent(nowPreferred,ordinaryProposal));
          const target=ordinaryProposal.targetLocationId;
          const independentTrail=ordinaryProposal.chosenAction==='EXPLORE'&&target!==undefined&&
            knownRumorLead(earlier,prevState)===target&&knownRumorLead(cultivator,nextState)===target;
          const offered=history?modelOrdinaryIntentOptions(prevState,earlier,nextState.tick):[];
          const stillLegal=!history||!offered.length||offered.some(option=>matchesOrdinaryIntent(option,ordinaryProposal))&&
            rankOrdinaryIntents(nextState,cultivator).some(option=>matchesOrdinaryIntent(option,ordinaryProposal));
          if(!validPreference||!stillLegal&&!independentTrail){provided=undefined;modelOrdinaryReplaced=true;}
        }
      }
    }
    let fieldNegotiation: LLMDecisionPayload | undefined;
    if (activeSiegeForActor(nextState, cultivator)) {
      if (!provided) fieldNegotiation = utilityCeasefireDecision(cultivator, nextState);
      const negotiation = provided ?? fieldNegotiation;
      const validNegotiation = negotiation?.chosenAction === 'CEASEFIRE' && availableCeasefireActions(cultivator, nextState).some((option) =>
        option.ceasefireMove === negotiation.ceasefireMove && option.targetSectId === negotiation.targetSectId &&
        option.targetCeasefireId === negotiation.targetCeasefireId);
      if (!validNegotiation) {
        cultivator.currentAction = 'LAUNCH_SIEGE';
        cultivator.innerMonologue = '军令已下，今月随本阵行军攻山。';
        continue;
      }
    }

    const occasion = activeOccasionForActor(nextState, cultivator);
    if(holdAftermathRescue){
      const stillOffered=Boolean(pauseOption&&occasion?.kind==='expedition'&&
        canPauseAftermathRescue(cultivator,nextState)&&
        autonomousExpeditionRescueOptions(cultivator,nextState).some(option=>option.rescueMove==='accept'&&
          option.targetExpeditionRescueId===pauseOption.targetExpeditionRescueId&&option.targetOccasionId===pauseOption.targetOccasionId));
      if(replaying){
        const draws=traceOptions?.replayDraws?.[cultivator.id]??0;
        for(let draw=0;draw<Math.min(64,draws);draw++)rng();
      }
      cultivator.currentAction=occasion?.kind==='expedition'?'JOIN_OCCASION':'REST';
      cultivator.innerMonologue='眼下先停一停，不认一份新约，也不另取机缘。';
      const waiting:LLMDecisionPayload={chosenAction:'REST',innerMonologue:cultivator.innerMonologue};
      if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,cultivator.id,waiting,0,stillOffered&&Boolean(modelProposal),false,false,nextState);
      if(modelProposal)recordDecisionEffect?.(cultivator.id,stillOffered&&!modelOrdinaryReplaced);
      continue;
    }
    let expeditionOrder: LLMDecisionPayload | undefined;
    let expeditionModelReplaced = false;
    if (occasion) {
      const dungeon = occasion.kind === 'expedition' ? dungeonDecisionOccasion(cultivator, nextState) : undefined;
      const isModel = Boolean(modelProposal || provided && isProviderPersonaDecision(provided));
      const explicitEntry = occasion.kind === 'expedition' && provided?.chosenAction === 'EXPEDITION_DUNGEON' && !isModel;
      const naturalRescue = occasion.kind === 'expedition' && (!provided || dungeon || explicitEntry)
        ? utilityExpeditionRescueDecision(cultivator, nextState) : undefined;
      const rescue=suppressRescueAccept&&naturalRescue?.chosenAction==='EXPEDITION_RESCUE'&&naturalRescue.rescueMove==='accept'
        ?undefined:naturalRescue;
      const action = provided ?? rescue;
      if (dungeon && provided?.chosenAction === 'REST' && !isModel && !rescue) {
        // A deliberate trusted wait is not a cultivation/rest action or an invitation to substitute progression.
        cultivator.currentAction = 'JOIN_OCCASION';
        cultivator.innerMonologue = '在亲到的房间停等，本轮不另取机缘。';
        if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, provided);
        continue;
      }
      if (dungeon || explicitEntry) {
        const exactRescue = action?.chosenAction === 'EXPEDITION_RESCUE' &&
          availableExpeditionRescueActions(cultivator, nextState).some(row => row.rescueMove === action.rescueMove &&
            row.targetExpeditionRescueId === action.targetExpeditionRescueId && row.targetOccasionId === action.targetOccasionId);
        const exact = action?.chosenAction === 'EXPEDITION_DUNGEON'
          ? exactDungeonDecision(action, availableDungeonMoves(nextState, cultivator), true) : undefined;
        expeditionOrder = exactRescue ? action : rescue ?? exact ?? (dungeon ? utilityDungeonDecision(cultivator, nextState) : undefined);
        expeditionModelReplaced = Boolean(modelProposal && !(exactRescue && expeditionOrder === action) &&
          !(exact && expeditionOrder === exact));
      } else if (occasion.kind === 'expedition' && action?.chosenAction === 'EXPEDITION_RESCUE') expeditionOrder = action;
      if (!expeditionOrder) {
        const extracting = Boolean(expeditionRescueCheckpoint(nextState, cultivator));
        cultivator.currentAction = extracting ? 'EXPEDITION_RESCUE' : 'JOIN_OCCASION';
        cultivator.innerMonologue = extracting ? '沿已经核实的关口撤离，不另取秘境机缘。' : '已入大会或秘境名册，眼下须静候下一轮。';
        if (modelProposal?.chosenAction === 'EXPEDITION_DUNGEON') recordDecisionEffect?.(cultivator.id, false);
        continue;
      }
    }

    // Mandatory embodied travel, trial and siege checks above are never bypassed by an encounter.
    const liveEncounter=nextState.roguelikeEncounters?.length&&!avatarDecision&&!expeditionOrder&&!occasion&&!activeSiegeForActor(nextState,cultivator)
      ?activeRoguelikeEncounter(nextState,cultivator):undefined;
    let modelStoryChoiceReplaced=false;
    if(liveEncounter){
      const allowed=provided?.chosenAction==='ROGUELIKE_ENCOUNTER'&&provided.targetRoguelikeEncounterId===liveEncounter.id&&
        !!provided.roguelikeEncounterChoice&&ROGUELIKE_ENCOUNTER_CHOICES.includes(provided.roguelikeEncounterChoice);
      if(!allowed||liveEncounter.guided){
        const local=chooseRoguelikeEncounterDecision(nextState,cultivator);
        if(local){provided=local;modelStoryChoiceReplaced=Boolean(modelProposal);}
      }
    }
    const destinyOffer = !liveEncounter && !avatarDecision && !expeditionOrder && !occasion &&
      cultivator.destinyTraits?.pending && !activeSiegeForActor(nextState, cultivator)
      ? activeDestinyTraitOffer(nextState, cultivator) : undefined;
    const liveDestiny = destinyOffer && destinyOffer.openedTick < nextState.tick ? destinyOffer : undefined;
    if (liveDestiny) {
      const validPick = provided?.chosenAction === 'AWAKEN_DESTINY' && provided.targetDestinyOfferId === liveDestiny.id &&
        provided.destinyTraitChoice !== undefined && liveDestiny.options.includes(provided.destinyTraitChoice);
      if (!validPick || activeAvatar(nextState) === cultivator) {
        const local = chooseDestinyTraitDecision(nextState, cultivator);
        if (local) { provided = local; modelStoryChoiceReplaced = Boolean(modelProposal); }
      }
    }
    if(!liveEncounter&&!liveDestiny&&expeditionOrder?.chosenAction!=='EXPEDITION_DUNGEON'&&deferRegionalActorTurn(nextState,regionalTurn,cultivator,expeditionOrder??provided??supplied??fieldNegotiation,
      ()=>!!requiredBeforeOrdinaryDecision(cultivator,nextState)||
        availableVacantGateActions(cultivator,nextState,nextState.tick).length>0||
        availableFurnaceEmergencyActions(cultivator,nextState,nextState.tick).length>0||
        availableAbandonedQuarterActions(cultivator,nextState,nextState.tick).length>0||
        availableBoundaryGapActions(cultivator,nextState,nextState.tick).length>0||
        availableNightDoorActions(cultivator,nextState,nextState.tick).length>0||
        availableBanquetSeatActions(cultivator,nextState,nextState.tick).length>0||
        availableVillageReunionActions(cultivator,nextState,nextState.tick).some(row=>row.villageReunionMove==='accept')||
        availableBattlefieldAftermathActions(cultivator,nextState,nextState.tick).some(row=>row.battlefieldAftermathMove==='accept_care')))continue;

    let decisionDraws = 0;
    if (provided && traceOptions?.replayDraws) {
      const replayedDraws = traceOptions.replayDraws[cultivator.id] ?? 0;
      for (let draw = 0; draw < Math.min(64, replayedDraws); draw++) rng();
    }
    const planned = expeditionOrder ?? provided ?? fieldNegotiation ??
      computeHeuristicDecision(cultivator, nextState, () => { decisionDraws++; return rng(); });
    // Invalid/declined online output may leave no order. Record the actual quiet fallback, never a new private signature.
    const unresolvedModelConsent=!expeditionOrder&&!provided&&!fieldNegotiation&&
      (traceOptions?.suppressAutoClanConsent?.has(cultivator.id)||modelProposal!==undefined);
    const decision:LLMDecisionPayload=unresolvedModelConsent&&planned.chosenAction==='CULTIVATION_CLAN'?waitForOwnClanChoice():
      unresolvedModelConsent&&(planned.chosenAction==='VILLAGE_REUNION'&&(planned.villageReunionMove==='offer'||planned.villageReunionMove==='accept')||
        planned.chosenAction==='BATTLEFIELD_AFTERMATH'&&(planned.battlefieldAftermathMove==='offer_care'||planned.battlefieldAftermathMove==='accept_care')||
        planned.chosenAction==='FURNACE_EMERGENCY'&&planned.furnaceEmergencyMove==='accept_rescue')?
        {chosenAction:'REST',innerMonologue:'未曾应下旧交所问，先让这句话留在原处。'}:planned;

    const captureTrace = traceOptions?.captureTrace !== false;
    const candidates = (captureTrace || traceOptions?.onActor) && decision.chosenAction !== 'EXPEDITION_DUNGEON' &&
      decision.chosenAction !== 'HEAVENLY_ALCHEMY' && decision.chosenAction !== 'DAO_PATH' &&
      decision.chosenAction !== 'IMMORTAL_AUCTION' && decision.targetAuctionAmbushLotId === undefined &&
      decision.chosenAction !== 'CULTIVATION_CLAN' && decision.chosenAction !== 'ASCENSION' &&
      !activeProtagonistFlight(nextState,cultivator) && decision.targetHeartDemonAftermathId===undefined ?
      legalTraceCandidates(nextState, cultivator) : [];
    const chosenByModel = Boolean(modelProposal && !modelOrdinaryReplaced && !modelStoryChoiceReplaced && !expeditionModelReplaced);
    if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, decision, decisionDraws, chosenByModel, false, false, nextState);
    if(decision.chosenAction==='VACANT_GATE'){
      const exact=exactVacantGateDecision(decision,availableVacantGateActions(cultivator,nextState,nextState.tick),true);
      const applied=Boolean(exact&&(!(modelProposal||isProviderPersonaDecision(decision))||activeAvatar(nextState)!==cultivator)&&
        stageVacantGateAction(nextState,cultivator,exact));
      if(applied&&exact)pendingGateEffects.set(cultivator.id,{decision:exact,model:chosenByModel,avatar:Boolean(avatarDecision),supplied:Boolean(supplied)});
      else if(supplied)recordDecisionEffect?.(cultivator.id,false);
      continue;
    }
    const previousLocation = cultivator.locationId;
    const previousRealm = cultivator.realm;
    const previousRealmStage = cultivator.realmStage;
    const ordinaryBefore = snapshotOrdinaryAction(cultivator, decision);
    const evt = applyCultivatorBrainDecision(nextState, cultivator, decision, rng, undefined, (event) => {
      newEvents.push(event);
      if(!isTaughtSwordPracticeEvent(event)&&!isPrivateSchoolFormEvent(event)&&!isPrivateMercyReunionEvent(event))witnessEvent(nextState,event);
    }, avatarDecision, chosenByModel || Boolean(traceOptions?.replayHeartModelActors?.has(cultivator.id)));
    if (decision.chosenAction === 'EXPLORE' && cultivator.currentAction === 'EXPLORE' && previousLocation !== cultivator.locationId) {
      recordRegionalActorReturn(nextState,regionalTurn,cultivator,previousLocation,decision.chosenAction,evt);
      renewRegionalProtectionAfterEvent(regionalTurn);
      const lodging = recordSeasonalHousingMovement(nextState,cultivator,previousLocation);
      if (lodging) { newEvents.push(lodging); witnessEvent(nextState,lodging); }
      const encounter=maybeOpenRoguelikeEncounter(nextState,cultivator,previousLocation);
      if(encounter)newEvents.push(encounter);
      const scarReturn=recordBattlefieldReturn(nextState,cultivator,previousLocation);
      if(scarReturn)newEvents.push(scarReturn);
      const mercyMeeting=recordMercyReunionMovement(nextState,cultivator,previousLocation);
      if(mercyMeeting)newEvents.push(mercyMeeting);
      const villageMeeting=recordVillageReunionMovement(nextState,cultivator,previousLocation);
      if(villageMeeting)newEvents.push(villageMeeting);
      recordBattlefieldAftermathApproach(nextState,cultivator,previousLocation);
      recordApprenticeshipReunionMovement(nextState,cultivator,previousLocation);
      const returnToRuin=recordAbandonedQuarterMovement(nextState,cultivator,previousLocation);
      if(returnToRuin)newEvents.push(returnToRuin);
      recordReliefHomecomingMovement(nextState,cultivator,previousLocation);
    }
    if(evt&&decision.chosenAction==='DELIVER_RELIEF')recordReliefHomecomingAid(nextState,evt);
    if(evt&&decision.chosenAction==='SOCIALIZE')recordApprenticeshipReunionQuiet(nextState,evt);
    if (evt && (decision.chosenAction === 'DUEL' || decision.chosenAction === 'SOCIALIZE' || decision.chosenAction === 'BREAKTHROUGH' ||
      decision.chosenAction==='MERCY_REUNION'&&evt.duelWinnerId!==undefined))
      captureWitnessedPersonalScene(nextState, evt);
    // Capture only the actual emitted source after native bounty/scheme/duel wrappers have settled scope.
    if (evt && evt.actorIds.length === 2 && evt.witnessScope === undefined &&
        (evt.category === 'combat' || evt.category === 'death' || evt.category === 'diplomacy')) captureDramaticBondFact(nextState,evt);
    const validEffect = decision.chosenAction === cultivator.currentAction && (evt !== null ||
      (decision.chosenAction === 'REST' && decision.targetHeartDemonAftermathId===undefined) || decision.chosenAction === 'CULTIVATE' ||
      (decision.chosenAction === 'EXPLORE' && previousLocation !== cultivator.locationId));
    recordOrdinaryActionEvidence(cultivator,nextState.tick,decision,ordinaryBefore,
      {applied:validEffect,avatar:avatarOrder?.actorId===cultivator.id,event:evt});
    if (recordDecisionEffect && supplied) recordDecisionEffect(cultivator.id, !avatarDecision && !modelOrdinaryReplaced && !modelStoryChoiceReplaced && !expeditionModelReplaced && validEffect);
    traceOptions?.onActor?.(cultivator.id, candidates, validEffect);
    if (captureTrace) recordDecisionTrace(nextState, cultivator.id, candidates, decision,
      avatarDecision ? 'avatar' : modelProposal && !modelOrdinaryReplaced && !modelStoryChoiceReplaced && !expeditionModelReplaced ? 'model' : 'utility', validEffect);
    creditSectService(nextState, cultivator, evt);
    if (evt) {
      renewRegionalProtectionAfterEvent(regionalTurn);
      if (cultivator.realm !== previousRealm) {
        recordBreakthroughCompetition(nextState, cultivator, previousRealm, evt);
        maybeOpenDestinyTrait(nextState, cultivator, previousRealm, previousRealmStage, evt);
      }
      if (decision.chosenAction === 'AMBUSH_TRIBULATION') {
        const opponent = nextState.cultivators.find((candidate) => candidate.id !== cultivator.id && evt.actorIds.includes(candidate.id));
        if (opponent) {
          const breach = recordCeasefireHostility(nextState, cultivator, opponent, evt);
          if (breach) { newEvents.push(breach); witnessEvent(nextState, breach); }
        }
      }
      if (decision.chosenAction === 'DELIVER_RELIEF') {
        const receipt = nextState.settlements.records.at(-1);
        if (receipt && evt.id === `evt-${receipt.id}`) recordReliefCompetition(nextState, receipt);
      }
      newEvents.push(evt);
      if(!isBattlefieldRevisitEvent(evt)&&!isPrivateCalamityArrayEvent(evt)&&!isTaughtSwordPracticeEvent(evt)&&!isPrivateSchoolFormEvent(evt)&&!isPrivateWitnessInquiryEvent(evt)&&!isPrivatePavilionFireEvent(evt)&&!isPrivateMercyReunionEvent(evt)&&!isPrivateWildMigrationEvent(evt)&&!isPrivateVillageReunionEvent(evt)&&!isPrivateBattlefieldAftermathEvent(evt)&&!isPrivatePilgrimageForkEvent(evt)&&!isPrivateApprenticeshipReunionEvent(evt)&&!isPrivateFurnaceEmergencyEvent(evt)&&!isPrivateAbandonedQuarterEvent(evt)&&!isPrivateBoundaryGapEvent(evt)&&!isPrivateNightDoorEvent(evt)&&!isPrivateBanquetSeatEvent(evt)&&!(evt.witnessScope==='participants'&&evt.id.endsWith('-study-technique-fire')))witnessEvent(nextState, evt);
      if(decision.chosenAction==='SOCIALIZE'&&cultivator.currentAction==='SOCIALIZE'){
        const after=recordTournamentBanquetAfterTalk(nextState,evt);
        if(after&&!newEvents.some(row=>row.id===after.id))newEvents.push(after);
      }
    }
  }

  for (const cultivator of nextState.cultivators) {
    if (cultivator.positionPlane === 'immortal') continue;
    expireScheme(cultivator, nextState.tick);
    if (!cultivator.alive) {
      closeInterruptedTrial(cultivator, nextState.tick);
      continue;
    }
    const yearly = nextState.month === 1;
    maintainMemories(cultivator, nextState.tick, yearly);
    if (yearly) cultivator.reflections = synthesizeReflections(cultivator, nextState.tick);
  }

  for(const event of advancePavilionFires(nextState)){
    newEvents.push(event);
    if(event.witnessScope===undefined)witnessEvent(nextState,event);
  }
  advanceUpperArrayFieldTrade(nextState);
  for(const event of [...advanceFrontierTrade(nextState),...advanceFrontierPortTrade(nextState),...advanceFrontierDrylandTrade(nextState)]){
    newEvents.push(event);
    witnessEvent(nextState,event);
  }
  finishRegionalSimulationTurn(nextState,regionalTurn);
  const grandReplies=new Map<string,{actorId:string;decision:LLMDecisionPayload}>();
  if(precomputedDecisions&&prevState.sieges.some(siege=>siege.status==='sieging'&&siege.theatre)){
    for(const actor of prevState.cultivators){
      if(!traceOptions?.modelActors?.has(actor.id)&&!traceOptions?.replayGrandSiegeModelActors?.has(actor.id))continue;
      const answer=Object.hasOwn(precomputedDecisions,actor.id)?precomputedDecisions[actor.id]:undefined;
      if(answer?.chosenAction!=='GRAND_SIEGE_HERO'||!answer.targetGrandSiegeId||!answer.grandSiegeHeroMove||
        !Object.keys(answer).every(key=>key==='chosenAction'||key==='targetGrandSiegeId'||key==='grandSiegeHeroMove'||key==='innerMonologue')||
        (prevState.roguelikeEncounters?.length&&activeRoguelikeEncounter(prevState,actor))||activeDestinyTraitOffer(prevState,actor)||
        grandReplies.has(answer.targetGrandSiegeId)||!availableGrandSiegeHeroActions(actor,prevState).some(option=>
          option.targetGrandSiegeId===answer.targetGrandSiegeId&&option.grandSiegeHeroMove===answer.grandSiegeHeroMove))continue;
      grandReplies.set(answer.targetGrandSiegeId,{actorId:actor.id,decision:answer});
    }
  }
  for (const event of [...advanceApprenticeCohorts(nextState), ...advanceBoundaryReliefs(nextState), ...advanceShortShifts(nextState), ...advanceSparring(nextState), ...advanceDiplomacy(nextState,rng,{
    chosenHero:siege=>grandReplies.get(siege.id),
    heldByModel:(siege,actorId)=>{
      const held=grandReplies.get(siege.id);
      if(held?.actorId!==actorId||held.decision.grandSiegeHeroMove!=='hold')return;
      if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,actorId,held.decision,0,false,false,true);
      recordDecisionEffect?.(actorId,true);
    },
    applied:(siege,result)=>{
      const decision:LLMDecisionPayload={chosenAction:'GRAND_SIEGE_HERO',targetGrandSiegeId:siege.id,grandSiegeHeroMove:result.move,
        innerMonologue:'山门前亲身护阵，所付代价已经落定。'};
      const actor=nextState.cultivators.find(person=>person.id===result.actorId);
      if(actor?.alive){
        actor.currentAction='GRAND_SIEGE_HERO';actor.innerMonologue=decision.innerMonologue;
        // The current turn's redacted frontline action supersedes its ordinary receipt, not earlier retained facts.
        if(actor.ordinaryActionEvidence?.tick===nextState.tick)delete actor.ordinaryActionEvidence;
      }
      if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,result.actorId,decision,0,false,false,result.origin==='model');
      if(result.origin==='model')recordDecisionEffect?.(result.actorId,true);
      traceOptions?.onActor?.(result.actorId,[],true);
      if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,result.actorId,[],decision,
        result.origin==='player'?'avatar':result.origin,true);
    },
  }), ...advanceOccasions(nextState, rng), ...advanceOaths(nextState), ...advanceMarkets(nextState), ...advanceWitnesses(nextState), ...advanceSeasonReviews(nextState, (state, seasonId) =>
    publicCompetitionStandings(state, seasonId).find(({ rank }) => rank === 1)), ...maintainSectPolitics(nextState), ...advanceDoctrineFoundings(nextState), ...advanceDoctrineMaturity(nextState,prevState), ...advanceBounties(nextState), ...advanceResearch(nextState), ...advanceWorkshops(nextState), ...advanceCraftTraining(nextState), ...advanceScribeCommissions(nextState), ...advanceDamageAssurance(nextState), ...advanceRelicExhibits(nextState), ...advanceProbation(nextState), ...advanceToolLoans(nextState), ...advanceWaypostMeals(nextState), ...advanceImmortalAuctions(nextState), ...advanceVillageReunions(nextState), ...advancePilgrimageForks(nextState,{blocked:recordNightDoorBlocked,arrived:recordNightDoorArrival}), ...advanceEstates(nextState), ...advanceDoctrines(nextState), ...advanceSectCredit(nextState), ...advanceSanctuaries(nextState), ...advancePilgrimages(nextState), ...advanceHabitats(nextState), ...advanceInfirmaries(nextState), ...advanceCareFollowups(nextState), ...advanceDanxiaShortages(nextState), ...advanceFormations(nextState), ...advanceTerritorialLeases(nextState), ...reconcileCourierDeaths(nextState), ...advanceHouseholds(nextState), ...advanceHouseholdNames(nextState), ...advanceCultivationClans(nextState)]) {
    newEvents.push(event);
    if(!isPrivateTournamentBanquetEvent(event)&&!isPrivateVacantGateEvent(event)&&!isPrivateVillageReunionEvent(event)&&!isPrivatePilgrimageForkEvent(event))witnessEvent(nextState, event);
  }
  if(pendingGateEffects.size){
    const executed=new Set(newEvents.filter(event=>event.actorIds.length===1&&isPrivateVacantGateEvent(event)).flatMap(event=>[...event.actorIds]));
    for(const [actorId,planned] of pendingGateEffects){
      const applied=executed.has(actorId);
      if(planned.supplied)recordDecisionEffect?.(actorId,applied&&!planned.avatar);
      traceOptions?.onActor?.(actorId,[],applied);
      if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,actorId,[],planned.decision,
        planned.avatar?'avatar':planned.model?'model':'utility',applied);
    }
  }
  for(const event of [...advanceDisasterShelters(nextState), ...advanceSeasonalHousing(nextState), ...advanceMentorTransfers(nextState), ...advanceSectStipends(nextState)]) {
    newEvents.push(event);
    witnessEvent(nextState,event);
  }
  for (const event of reconcileAscensionInterruptions(nextState)) {
    newEvents.push(event);
    witnessEvent(nextState, event);
  }
  for(const actual of settleBanquetSeats(nextState)){
    newEvents.push(actual);
    if(!isPrivateBanquetSeatEvent(actual))witnessEvent(nextState,actual);
  }
  for(const actual of advanceBoundaryGapResponses(nextState)){
    newEvents.push(actual);
    if(!isPrivateBoundaryGapEvent(actual))witnessEvent(nextState,actual);
  }
  for(const actual of advanceFurnaceEmergencies(nextState)){
    newEvents.push(actual);
    if(!isPrivateFurnaceEmergencyEvent(actual))witnessEvent(nextState,actual);
  }
  for(const publicPractice of recordApprenticeshipReunionRounds(nextState,newEvents)){
    newEvents.push(publicPractice);witnessEvent(nextState,publicPractice);
  }
  recordRegionalLatePromotions(nextState,prevState,newEvents);
  advanceCivicMemorials(nextState);
  advanceReliefHomecomings(nextState);
  advanceNightDoors(nextState);
  advanceChronicleErrata(nextState);
  for (const actor of nextState.cultivators) if (actor.alive) noteTerrainVisit(nextState, actor);
  maintainPlayerAvatar(nextState);
  finalizeRoguelikeEncounters(nextState);
  spreadRumors(nextState);
  reconcileRelicCustody(nextState);
  advanceReincarnation(nextState);
  recordNewDeathsForReincarnation(prevState, nextState, newEvents);
  archiveChronicleEvents(nextState, newEvents);
  nextState.events = [...newEvents, ...nextState.events].slice(0, 120);
  recordBattlefieldAftermathTerminal(nextState,newEvents);
  recordPilgrimageForkArrival(nextState,newEvents);
  recordBanquetSeatInvitation(nextState,newEvents);
  advanceWitnessedPersonalStory(nextState);
  if (councilMode === 'utility') {
    settleAnnualCouncilOffline(nextState);
    settleChronicleOffline(nextState);
  }
  advanceAlignedWeather(nextState);
  advanceFieldObservatories(nextState);
  closeVillageCensusPeriod(nextState);
  settleFurnaceTurn(nextState);
  compactColdHistory(nextState);
  advanceCausalChronicle(nextState);
  if (nextState.watchlists.watches.length) {
    if (traceOptions?.onWatchBatch) traceOptions.onWatchBatch(newEvents);
    else {
      const ids = new Set(newEvents.map(({ id }) => id));
      const endingCouncil = councilMode === 'utility'
        ? nextState.events.filter(({ id, tick }) => tick === nextState.tick && !ids.has(id)) : [];
      captureWatchDigests(nextState, [...newEvents, ...endingCouncil]);
    }
  }
  const mainEventIds=new Set(newEvents.map(({id})=>id));
  const completedEvents=[...newEvents,...nextState.events.filter(({id,tick})=>tick===nextState.tick&&!mainEventIds.has(id))];
  settleUpperPassageMortality(nextState);
  settleFrontierMortality(nextState);
  expireRingAudiences(nextState);
  finalizeDestinyTraitOffers(nextState);
  pruneInvalidForbiddenDuelContacts(nextState);
  pruneInvalidBeastDuelContacts(nextState);
  deadSchoolFormContacts(nextState);
  finalizeProtagonistFlightTurn(prevState,nextState,completedEvents);
  recordEraHistoryTurn(prevState,nextState,completedEvents);
  publishTianjiGazette(prevState,nextState,completedEvents);
  recordRegionalTurnRegistry(nextState);
  traceOptions?.onCompletedEvents?.(completedEvents);
  nextState.mapPresentation = traceOptions?.capturePresentation === false
    ? { tick: nextState.tick, trails: [], effects: [] }
    : deriveMapPresentation(prevState, nextState, newEvents);
  return nextState;
}

/**
 * Applies a Heavenly Dao (God Console) direct intervention to the world state.
 */
export function executeGodIntervention(
  prevState: WorldState,
  cmd: GodInterventionCommand
): WorldState {
  if(cmd.type==='SPAWN_TREASURE'&&cmd.targetLocationId!==undefined&&
    !prevState.locations.some(site=>site.id===cmd.targetLocationId&&!isScopedExpeditionGate(site)))return prevState;
  const lowerAlive=(actor:Cultivator)=>actor.alive&&actor.hp>0&&onLowerPlane(actor);
  if(cmd.type==='DEMONIC_TIDE'&&!prevState.cultivators.some(lowerAlive))return prevState;
  if((cmd.type==='TRIBULATION_STRIKE'||cmd.type==='WHISPER_MIND')&&cmd.targetCultivatorId!==undefined&&
     !prevState.cultivators.some(actor=>actor.id===cmd.targetCultivatorId&&lowerAlive(actor)))return prevState;
  const nextState: WorldState = cloneWorldWithColdHistory(prevState);

  switch (cmd.type) {
    case 'SPAWN_TREASURE': {
      const available=nextState.locations.filter(site=>!isScopedExpeditionGate(site));
      const loc=available.find(site=>site.id===cmd.targetLocationId)??available[0];
      if(!loc)return prevState;
      loc.spiritQi = clamp(loc.spiritQi + 20, 10, 150);

      const luckyOnes = nextState.cultivators.filter(
        (c) => lowerAlive(c) && c.locationId === loc.id && !activeRelocationForActor(nextState, c) && !activeEscortForActor(nextState, c) && !pilgrimageCheckpoint(nextState, c) && !courierCheckpoint(nextState, c) && !expeditionRescueCheckpoint(nextState, c) && !boundaryReliefCheckpoint(nextState, c) && !disasterShelterCheckpoint(nextState,c)
      );
      for (const c of luckyOnes) {
        c.qiProgress = clamp(c.qiProgress + 30, 0, 100);
        c.spiritStones += 500;
        if (!c.artifacts.some((artifact) => artifact.name === '天道造化玉碟')) {
          c.artifacts.push({ id: `artifact-jade-tablet-${c.id}-${nextState.interventionSequence + 1}`, name: '天道造化玉碟', spiritRoot: '天灵根', tier: '通天灵宝', durability: 160, maxDurability: 160 });
        }
        recordMemory(
          c,
          nextState.tick,
          `天降祥瑞于【${loc.name}】，我沐浴仙光获得天材地宝，修为大进！`,
          10,
          'heavenly', 5
        );
      }

      nextState.events.unshift({
        id: `evt-god-treasure-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `天道赐福：【${loc.name}】仙宝出世！`,
        description: `天道降下浩瀚紫气，【${loc.name}】灵气暴涨，驻留此地的 ${luckyOnes.map((c) => c.name).join('、') || '生灵'} 获无上造化！`,
        category: 'heavenly',
        actorIds: luckyOnes.map((c) => c.id),
        locationId: loc.id,
      });
      break;
    }

    case 'TRIBULATION_STRIKE': {
      const target =
        cmd.targetCultivatorId ? nextState.cultivators.find((c) => lowerAlive(c) && c.id === cmd.targetCultivatorId) :
        nextState.cultivators.find(lowerAlive);
      if (!target) break;

      const beforeHp = target.hp;
      target.hp = clamp(target.hp - Math.round(target.maxHp * 0.45), 1, target.maxHp);
      const dmg = beforeHp - target.hp;
      target.innerMonologue = '为何苍天突然降下紫霄神雷劈我？！莫非我逆天行事触怒了天道？！';
      recordMemory(
        target,
        nextState.tick,
        `无故遭九天紫霄神雷劈中，损失 ${dmg} 点气血，道心巨震！`,
        10,
        'heavenly', -5
      );

      nextState.events.unshift({
        id: `evt-god-strike-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `天罚降世：九天神雷怒劈${target.name}！`,
        description: `晴空霹雳！一道毁天灭地的紫霄神雷直劈${target.name}，令其重伤吐血（-${dmg} HP）！`,
        category: 'heavenly',
        actorIds: [target.id],
        damage: dmg > 0 ? [{ cultivatorId: target.id, amount: dmg }] : [],
        locationId: target.locationId,
      });
      break;
    }

    case 'DEMONIC_TIDE': {
      for (const c of nextState.cultivators) {
        if (!lowerAlive(c)) continue;
        if (c.sectId === 'sect-bloodmoon') {
          c.combatPower = Math.round(c.combatPower * 1.15);
          c.qiProgress = clamp(c.qiProgress + 20, 0, 100);
        } else {
          c.hp = clamp(c.hp - Math.round(c.maxHp * 0.15), 1, c.maxHp);
        }
      }
      nextState.events.unshift({
        id: `evt-god-demon-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: '血月当空：域外天魔劫降临！',
        description:
          '苍穹化为诡异血色，魔道修士战力暴涨15%，正道与中立修士皆受魔音侵蚀气血受损！',
        category: 'heavenly',
        actorIds: nextState.cultivators.filter(lowerAlive).map((c) => c.id),
      });
      break;
    }

    case 'WHISPER_MIND': {
      const target =
        cmd.targetCultivatorId ? nextState.cultivators.find((c) => c.id === cmd.targetCultivatorId && lowerAlive(c)) :
        nextState.cultivators.find(lowerAlive);
      if (!target || !cmd.whisperText?.trim()) break;

      const whisper = cmd.whisperText.trim();
      target.innerMonologue = `脑海中突然响起神秘天道法旨：“${whisper}”……我定当遵从这冥冥中的指引！`;
      target.secretGoal = whisper;
      recordMemory(
        target,
        nextState.tick,
        `聆听天道传音：“${whisper}”，从此道心执念彻底改变。`,
        10,
        'whisper', 5
      );

      nextState.events.unshift({
        id: `evt-god-whisper-${nextState.tick}-${++nextState.interventionSequence}`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `天道传音：神念降临${target.name}识海`,
        description: `冥冥之中一道不可抗拒的意志传入${target.name}脑海：“${whisper}”，彻底改写了其秘密目标！`,
        category: 'intrigue',
        witnessScope: 'participants',
        actorIds: [target.id],
        locationId: target.locationId,
      });
      break;
    }
  }

  const head = nextState.events[0];
  if (head && head.id !== prevState.events[0]?.id) {
    witnessEvent(nextState, head);
    recordNewDeathsForReincarnation(prevState, nextState, [head]);
    if (head.category === 'death') reconcileRelicCustody(nextState);
    archiveChronicleEvents(nextState, [head]);
    settleFurnaceTurn(nextState);
    nextState.events = nextState.events.slice(0, 120);
    nextState.mapPresentation = deriveMapPresentation(prevState, nextState, [head]);
  }
  pruneInvalidForbiddenDuelContacts(nextState);
  pruneInvalidBeastDuelContacts(nextState);
  deadSchoolFormContacts(nextState);
  return nextState;
}

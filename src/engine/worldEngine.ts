import { availableLastRosterActions, recordLastRosterClosure, resolveLastRosterAction } from './lastRoster';
import {exactLastRosterDecision} from './lastRosterCognition';
import { availableBanquetSeatActions, resolveBanquetSeatAction } from './banquetSeats';
import {exactBanquetSeatDecision} from './banquetSeatCognition';
import { availableNightDoorActions, resolveNightDoorAction } from './nightDoor';
import {exactNightDoorDecision} from './nightDoorCognition';
import { availableBoundaryGapActions, resolveBoundaryGapAction } from './boundaryGap';
import {exactBoundaryGapDecision} from './boundaryGapCognition';
import { availableAbandonedQuarterActions, resolveAbandonedQuarterAction } from './abandonedQuarter';
import {exactAbandonedQuarterDecision} from './abandonedQuarterCognition';
import { availableFurnaceEmergencyActions, furnaceEmergencyCrossingLocked, resolveFurnaceEmergencyAction } from './furnaceEmergency';
import {exactFurnaceEmergencyDecision} from './furnaceEmergencyCognition';
import { availableApprenticeshipReunionActions, resolveApprenticeshipReunionAction } from './apprenticeshipReunion';
import {exactApprenticeshipReunionDecision} from './apprenticeshipReunionCognition';
import { availablePilgrimageForkActions, resolvePilgrimageForkAction } from './pilgrimageFork';
import {pilgrimageForkActedThisTick,pilgrimageForkTravelLocked} from './pilgrimageForkPresence';
import {exactPilgrimageForkDecision} from './pilgrimageForkCognition';
import { availableBattlefieldAftermathActions, resolveBattlefieldAftermathAction } from './battlefieldAftermath';
import {exactBattlefieldAftermathDecision} from './battlefieldAftermathCognition';
import { availableVillageReunionActions, resolveVillageReunionAction } from './villageReunion';
import {exactVillageReunionDecision} from './villageReunionCognition';
import { availableWildMigrationActions, resolveWildMigrationAction } from './wildMigration';
import {exactWildMigrationDecision} from './wildMigrationCognition';
import { availableFarewellLandingActions, resolveFarewellLandingAction } from './farewellLanding';
import {exactFarewellLandingDecision} from './farewellLandingCognition';
import { availableMercyReunionActions, isPrivateMercyReunionEvent, recordMercySpared, resolveMercyReunionAction } from './mercyReunion';
import { exactStoryMercyDecision, lawfulConditionalMercy } from './mercyReunionCognition';
import { availableFrontierGorgeActions, resolveFrontierGorgeAction } from './frontierGorge';
import { exactFrontierGorgeDecision } from './frontierGorgeCognition';
import { availablePavilionFireActions, resolvePavilionFireAction } from './pavilionFire';
import { exactPavilionFireDecision } from './pavilionFireCognition';
import { availableCampaignAssemblyActions } from './campaignAssembly';
import { exactCampaignAssemblyDecision } from './campaignAssemblyCognition';
import { availableWitnessInquiryActions, resolveWitnessInquiry } from './witnessInquiry';
import { exactWitnessInquiryDecision } from './witnessInquiryCognition';
import { availableFrontierNightHuntActions, initializeFrontierNightHunt, resolveFrontierNightHunt } from './frontierNightHunt';
import { exactFrontierNightHuntDecision } from './frontierNightHuntCognition';
import { deadSchoolFormContacts, openSchoolFormDuel, schoolFormDuelForParticipant, schoolFormPrivateEvent } from './schoolFormDuel';
import { recordTaughtSwordPractice } from './taughtSwordForm';
import type { NativeDuelModifier } from './nativeDuelRules';
import { availableCalamityArrayChoices, recordCalamityArrayChoice } from './calamityArray';
import { exactCalamityArrayDecision } from './calamityArrayCognition';
import { beastDuelContactForParticipant, beastDuelGuardEvent, openBeastDuelContact, openBeastDuelEvent, pruneInvalidBeastDuelContacts, settleBeastGuard } from './beastDuelProtection';
import type { BeastDuelContact } from '../types/beastDuelProtection';
import { availableBattlefieldRevisits, resolveBattlefieldRevisit } from './battlefieldRevisit';
import { exactBattlefieldRevisitDecision } from './battlefieldRevisitCognition';
import { autonomousExpeditionRescueOptions } from './heartDemonChoicePolicy';
import { resolveHeartDemonRecovery } from './heartDemonAftermathEngine';
import {activeProtagonistFlight,availableProtagonistFlightActions} from './protagonistFlightEngine';
import {matchesProtagonistFlightOption} from './protagonistFlightCognition';
import { availableAscensionActions, resolveAscensionAction } from './ascensionEngine';
import { exactAscensionDecision } from './ascensionCognition';
import { ascensionDutyActive } from './ascensionPresence';
import { availableCultivationClanActions, resolveCultivationClanAction } from './cultivationClanEngine';
import { exactCultivationClanDecision } from './cultivationClanCognition';
import { availableImmortalAuctionActions, recordImmortalAuctionDeparture, resolveImmortalAuctionAction } from './immortalAuctionEngine';
import { exactAuctionAmbushDecision, exactImmortalAuctionDecision } from './immortalAuctionCognition';
import {consumeDaoDuelIntents,previewDaoDuelIntents,recordDaoDuelIntents} from './daoPathEngine';
import { availableDaoPathActions, resolveDaoPathAction } from './daoPathEngine';
import { availableHeavenlyAlchemyActions, resolveHeavenlyAlchemyAction } from './heavenlyAlchemyEngine';
import { activeDungeonForActor, availableDungeonMoves, resolveDungeonAction } from './expeditionDungeonEngine';
import { personaLine } from './wildPersonaEngine';
import type { NativeDuelRolls } from '../types/forbiddenArt';
import { measureNativeDuel } from './nativeDuelRules';
import { forbiddenDuelForParticipant, openForbiddenDuelContact, pruneInvalidForbiddenDuelContacts, recordForbiddenArtOutcome } from './forbiddenArtEngine';
import { interruptStoryChoicesOnDeath } from './interruptedStoryChoices';
import {onLowerPlane} from './upperPassageIsolation';
import {isUpperArrayFieldAction,resolveUpperArrayFieldAction} from './upperArrayFieldActions';
import {resolveOrdinaryBreakthrough} from './ordinaryBreakthroughEngine';
import {isFrontierAction,resolveFrontierAction} from './frontierActions';
import { resolveDoctrineMaturityAction } from './doctrineMaturityEngine';
import { resolveUpperPassageAction } from './upperPassageEngine';
import { resolveNorthGateRenewalAction } from './northGateRenewalEngine';
import { resolveNorthWellReviewAction } from './northWellRevisitEngine';
import { resolveNorthMiningCharterAction } from './northMiningCharterEngine';
import { resolveWaterVeinAction } from './waterVeinEngine';
import { resolveDanxiaMedicineAction } from './danxiaMedicineEngine';
import { resolveDanxiaReviewAction } from './danxiaSeasonReviewEngine';
import { resolveDoctrineFoundingAction } from './doctrineFoundingEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from './danxiaMedicineTerms';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { resolveSeasonalHousingAction } from './seasonalHousingEngine';
import { resolveMentorTransferAction } from './mentorTransferEngine';
import { resolveSeasonReviewAction } from './seasonReviewEngine';
import { resolveDamageAssuranceAction } from './damageAssuranceEngine';
import { resolveAlignedWeatherAction } from './alignedWeatherEngine';
import { resolveObservatoryAction } from './fieldObservatoryEngine';
import { resolveOathArbitrationAction } from './oathArbitrationEngine';
import { resolveVillageCensusAction } from './villageCensusEngine';
import { resolveRoadAction } from './roadEngine';
import { resolveProbationAction } from './probationEngine';
import { resolveRelicExhibitAction } from './relicExhibitEngine';
import { resolveScribeCommissionAction } from './scribeCommissionEngine';
import { resolveWorkshopAction, resolveWorkshopCapacityAction, resolveWorkshopEstateAction, resolveWorkshopReleaseAction } from './workshopEngine';
import { resolveFurnaceReservationAction, settleFurnaceTurn } from './furnaceReservationEngine';
import { resolveSparringAction, sparringLocksActor } from './sparringEngine';
import { resolveExpeditionRescueAction } from './expeditionRescueEngine';
import { resolveShortShiftAction } from './shortShiftEngine';
import { resolveBoundaryReliefAction } from './boundaryReliefEngine';
import { recordCohortPractice, resolveApprenticeCohortAction } from './apprenticeCohortEngine';
import { resolveHouseholdNameAction } from './householdNameEngine';
import { resolveVillageGranaryAction } from './villageGranaryEngine';
import { resolveVillageSupplyAction } from './villageSupplyEngine';
import { resolvePavilionLoanAction } from './pavilionLoanEngine';
import { resolveCivicMemorialAction } from './civicMemorialEngine';
import { resolveVillageFairAction } from './villageFairEngine';
import { resolveSectStipendAction } from './sectStipendEngine';
import { resolveSeedCultureAction } from './seedCultureEngine';
import { resolveToolLoanAction } from './toolLoanEngine';
import { availableRouteWarningActions, resolveRouteWarningAction } from './routeWarningEngine';
import { resolveCaravanRestitutionAction } from './caravanRestitutionEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';
import { resolveTerrainRecovery } from './terrainSuccessionEngine';
import { resolveSharedCommonsAction } from './sharedCommonsEngine';
import { resolveServiceRetirementAction } from './serviceRetirementEngine';
import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { activeCourierForActor, courierActedThisTick, courierCheckpoint, courierHandoffMayOfferNow, resolveCourierAction, resolveCourierHandoffAction } from './sealedCourierEngine';
import { resolveVillageWorksAction } from './villageWorksEngine';
import { resolveGuardianAction } from './householdEngine';
import { resolveTerritorialLeaseAction } from './territorialLeaseEngine';
import { resolveFormationAction } from './formationNetworkEngine';
import { resolveCareFollowupAction } from './careFollowupEngine';
import { resolveInfirmaryAction } from './infirmaryEngine';
import { resolveHabitatAction } from './habitatEngine';
import { resolveChronicleErrataAction } from './chronicleErrataEngine';
import { resolveCraftTrainingAction } from './craftTrainingEngine';
import { resolveDisasterShelterAction } from './disasterShelterEngine';
import { disasterShelterCheckpoint, disasterShelterLocksTravel } from './disasterShelterCheckpoint';
import { resolveWaypostMealAction } from './waypostMealEngine';
import { activePilgrimageForActor, pilgrimageActedThisTick, pilgrimageCheckpoint, resolvePilgrimageAction } from './pilgrimageEngine';
import { resolveSectCreditAction } from './sectCreditEngine';
import { interceptSanctuaryDuel, resolveSanctuaryAction } from './sanctuaryEngine';
import { resolveResearchAction } from './researchEngine';
import { recordCeasefireHostility, resolveCeasefireAction } from './ceasefireEngine';
import { activeEscortForActor, resolveEscortAction, resolveMarketFreightAction } from './escortEngine';
import { resolveCompetitionAction } from './competitionEngine';
import { resolveScriptureAction } from './scriptureEngine';
import { reconcileRelicCustody, resolveRelicAction, transferLootedRelics } from './relicEngine';
import { resolveRecollectionAction } from './reincarnationEngine';
import { recordNewDeathsForReincarnation } from './reincarnationRuntime';
import { activeRelocationForActor, resolveRelocationAction } from './relocationEngine';
import { resolveDoctrineAction } from './doctrineEngine';
import { resolveEstateAction } from './estateEngine';
import { resolveWitnessAction } from './witnessEngine';
import { resolveSettlementAction } from './settlementEngine';
import { resolveMarketAction } from './marketEngine';
import { weatherTravelFriction } from './weatherEngine';
import { resolveOathAction } from './oathEngine';
import { mentorshipTechniqueMultiplier, resolveMentorshipAction } from './mentorshipEngine';
import { worldRandom } from './worldRandom';
import { activeAvatar } from './avatarEngine';
import { settleRoguelikeEncounter } from './roguelikeEncounterEngine';
import { destinyCultivationDetox, destinyCultivationMultiplier, settleDestinyTrait } from './destinyTraitEngine';
import { archiveChronicleEvents } from './novelGenerator';
import { recordFlightPursuit } from './protagonistFlightTape';
import {
  Cultivator,
  LLMDecisionPayload,
  RelationType,
  WorldEvent,
  WorldState,
} from '../types/world';
import { availableAutonomousAscensionActions, availableAutonomousCultivationClanActions, availableAutonomousDaoPathActions, availableAutonomousHeavenlyAlchemyActions, availableAutonomousImmortalAuctionActions, currentAuctionAmbushOffer, daoPathTurnLocked, dungeonDecisionOccasion, exactDaoPathDecision, exactDungeonDecision, exactHeavenlyAlchemyDecision, isProviderPersonaDecision } from './llmBrain';
import { recordMemory } from './memoryEngine';
import { fabricateRumor, knownRumorLead, witnessEvent } from './rumorEngine';
import { pursueScheme } from './schemeEngine';
import { scriptedDialogue } from './dialogueEngine';
import { resolveEncounter } from './encounterEngine';
import { cultivationMultiplier } from './elementalEngine';
import { authorTechnique, dropInheritance, gainMastery, masteryMultiplier, studyTechnique } from './techniqueEngine';
import { resolveAlchemy } from './alchemyEngine';
import { lootStorageRing, resolveArtifactAction, wearArtifact } from './artifactEngine';
import { interfereTribulation, isTribulationActive, recommendedTribulationStance, resolveTribulation, tribulationTarget, triggerTribulation } from './tribulationEngine';
import { maintainSectPolitics, resolveLeadershipAction } from './sectPoliticsEngine';
import { mitigateSectArray, previewSectArrayDamage, resolveSectEconomyAction, sectQiBonus } from './sectEconomyEngine';
import { activeSiegeForActor, resolveDiplomacyAction } from './diplomacyEngine';
import { activeOccasionForActor, joinOccasion } from './occasionEngine';
import { pursueBounty, recordTransgression } from './bountyEngine';
import { knownMapLocations, noteTerrainVisit } from './terrainEngine';
import { deriveMapPresentation } from './mapMotionEngine';
import { resolveFurnaceSafetyAction } from './furnaceSafetyEngine';
import { resolveArtifactSalvageAction } from './artifactSalvageEngine';
import { tameSpiritBeast } from './spiritBeastEngine';

import { runTickStagePipeline } from './tick/tickStagePipeline';
import type { ForbiddenDuelSettlement, TickActionPorts, TickTraceOptions } from './tick/tickContext';

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
    case 'LAST_ROSTER': {
      if((modelInput||isProviderPersonaDecision(decision))&&activeAvatar(world)===cultivator)return null;
      const exact=exactLastRosterDecision(decision,availableLastRosterActions(cultivator,world,world.tick),true);
      if(!exact)return null;
      const result=resolveLastRosterAction(world,cultivator,exact,siteId=>{
        const from=cultivator.locationId;
        const movement=applyCultivatorBrainDecision(world,cultivator,{chosenAction:'EXPLORE',targetLocationId:siteId,
          innerMonologue:'去自己认得的那个去处。'},rng,undefined,emit);
        if(movement)emit?.(movement);
        return cultivator.alive&&cultivator.locationId!==from&&cultivator.locationId===siteId&&cultivator.currentAction==='EXPLORE';
      });
      if(result){cultivator.currentAction='LAST_ROSTER';cultivator.innerMonologue=exact.innerMonologue;}
      return result;
    }
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
    case 'DOCTRINE_MATURITY': {
      const native=resolveDoctrineMaturityAction(world,cultivator,decision);
      if(native&&decision.doctrineMaturityMove==='finalize_merge')recordLastRosterClosure(world,native);
      return native;
    }
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

const tickActionPorts: TickActionPorts = Object.freeze({
  closeInterruptedTrial,
  applyCultivatorBrainDecision,
  settleNativeDuel,
});

/** Advance the virtual calendar and execute one complete world tick. */
export function advanceWorldTick(
  prevState: WorldState,
  precomputedDecisions?: Record<string, LLMDecisionPayload>,
  injectedRandom: (() => number) | undefined = undefined,
  councilMode: 'utility' | 'deferred' = 'utility',
  recordDecisionEffect?: (actorId: string, applied: boolean) => void,
  traceOptions?: TickTraceOptions,
): WorldState {
  return runTickStagePipeline({
    prevState, precomputedDecisions, injectedRandom, councilMode, recordDecisionEffect, traceOptions,
  }, tickActionPorts);
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

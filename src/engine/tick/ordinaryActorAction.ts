import { chooseSectChallengeAction } from '../sectChallenges';
import {deferSectPairChore} from '../sectMeetingOrders';
import {observeSectJob,planSectJob,settleSectJobChore,snapshotSectJobEvidence} from '../sectJobs';
import type {SectJobPlan} from '../../types/sectJobs';
import type { Cultivator, LLMDecisionPayload, WorldEvent, WorldState } from '../../types/world';
import type { TickActionPorts, WorldTickContext } from './tickContext';
import { activeAvatar } from '../avatarEngine';
import { exactCampaignAssemblyDecision } from '../campaignAssemblyCognition';
import { availableCampaignAssemblyActions } from '../campaignAssembly';
import { exactVacantGateDecision } from '../vacantGateCognition';
import { availableVacantGateActions, stageVacantGateAction } from '../vacantGate';
import { exactLastRosterDecision } from '../lastRosterCognition';
import { availableLastRosterActions, isPrivateLastRosterEvent } from '../lastRoster';
import { exactBanquetSeatDecision } from '../banquetSeatCognition';
import { availableBanquetSeatActions, isPrivateBanquetSeatEvent } from '../banquetSeats';
import { availableStorytellerActions, completeStorytellerChoice, planStorytellerChoice } from '../storytellerDirector';
import { exactStorytellerDecision, storytellerActionApplied } from '../cognition/storytellerDecision';
import { availableBellWatchActions } from '../bellWatch';
import { exactBellWatchDecision } from '../cognition/bellWatchDecision';
import { exactNightDoorDecision } from '../nightDoorCognition';
import { availableNightDoorActions, isPrivateNightDoorEvent } from '../nightDoor';
import { exactBoundaryGapDecision } from '../boundaryGapCognition';
import { availableBoundaryGapActions, isPrivateBoundaryGapEvent } from '../boundaryGap';
import { exactAbandonedQuarterDecision } from '../abandonedQuarterCognition';
import { availableAbandonedQuarterActions, recordAbandonedQuarterMovement, isPrivateAbandonedQuarterEvent } from '../abandonedQuarter';
import { exactFurnaceEmergencyDecision } from '../furnaceEmergencyCognition';
import { availableFurnaceEmergencyActions, isPrivateFurnaceEmergencyEvent } from '../furnaceEmergency';
import { exactApprenticeshipReunionDecision } from '../apprenticeshipReunionCognition';
import { availableApprenticeshipReunionActions, recordApprenticeshipReunionMovement, recordApprenticeshipReunionQuiet, isPrivateApprenticeshipReunionEvent } from '../apprenticeshipReunion';
import { exactPilgrimageForkDecision } from '../pilgrimageForkCognition';
import { availablePilgrimageForkActions, isPrivatePilgrimageForkEvent } from '../pilgrimageFork';
import { exactBattlefieldAftermathDecision } from '../battlefieldAftermathCognition';
import { availableBattlefieldAftermathActions, recordBattlefieldAftermathApproach, isPrivateBattlefieldAftermathEvent } from '../battlefieldAftermath';
import { exactVillageReunionDecision } from '../villageReunionCognition';
import { availableVillageReunionActions, recordVillageReunionMovement, isPrivateVillageReunionEvent } from '../villageReunion';
import { exactWildMigrationDecision } from '../wildMigrationCognition';
import { availableWildMigrationActions, isPrivateWildMigrationEvent } from '../wildMigration';
import { availableMercyReunionActions, isPrivateMercyReunionEvent, recordMercyReunionMovement } from '../mercyReunion';
import { conditionalMercyChoices, exactStoryMercyDecision } from '../mercyReunionCognition';
import { exactPavilionFireDecision } from '../pavilionFireCognition';
import { availablePavilionFireActions, isPrivatePavilionFireEvent } from '../pavilionFire';
import { exactWitnessInquiryDecision } from '../witnessInquiryCognition';
import { availableWitnessInquiryActions, isPrivateWitnessInquiryEvent } from '../witnessInquiry';
import { exactCalamityArrayDecision } from '../calamityArrayCognition';
import { availableCalamityArrayChoices, isPrivateCalamityArrayEvent } from '../calamityArray';
import { exactBattlefieldRevisitDecision } from '../battlefieldRevisitCognition';
import { availableBattlefieldRevisits, recordBattlefieldReturn, isBattlefieldRevisitEvent } from '../battlefieldRevisit';
import { isProviderPersonaDecision, availableAutonomousAscensionActions, requiredBeforeOrdinaryDecision, availableAutonomousCultivationClanActions, daoPathTurnLocked, waitForOwnClanChoice, availableAutonomousImmortalAuctionActions, currentAuctionAmbushOffer, exactDaoPathDecision, availableAutonomousDaoPathActions, exactHeavenlyAlchemyDecision, availableAutonomousHeavenlyAlchemyActions, utilityCeasefireDecision, dungeonDecisionOccasion, utilityExpeditionRescueDecision, exactDungeonDecision, utilityDungeonDecision, computeHeuristicDecision } from '../llmBrain';
import { activeOccasionForActor } from '../occasionEngine';
import { canPauseAftermathRescue, autonomousExpeditionRescueOptions, voluntaryHeartDemonChoiceEffect } from '../heartDemonChoicePolicy';
import { availableHeartDemonRecovery } from '../heartDemonAftermathEngine';
import { exactAscensionDecision, ascensionQuietWait } from '../ascensionCognition';
import { availableAscensionActions } from '../ascensionEngine';
import { exactCultivationClanDecision } from '../cultivationClanCognition';
import { availableCultivationClanActions } from '../cultivationClanEngine';
import { exactImmortalAuctionDecision, exactAuctionAmbushDecision } from '../immortalAuctionCognition';
import { availableImmortalAuctionActions } from '../immortalAuctionEngine';
import { availableDaoPathActions } from '../daoPathEngine';
import { isOrdinaryIntentAction, hasRankedOrdinaryIntentAuthority, preferredOrdinarySocialIntent, matchesOrdinaryIntent, modelOrdinaryIntentOptions, rankOrdinaryIntents } from '../ordinaryIntentEngine';
import { knownRumorLead, witnessEvent } from '../rumorEngine';
import { activeSiegeForActor } from '../diplomacyEngine';
import { availableCeasefireActions, recordCeasefireHostility } from '../ceasefireEngine';
import { rememberReplayDecision, legalTraceCandidates, recordDecisionTrace } from '../decisionTraceEngine';
import { availableExpeditionRescueActions } from '../expeditionRescueEngine';
import { availableDungeonMoves } from '../expeditionDungeonEngine';
import { expeditionRescueCheckpoint } from '../expeditionRescueCheckpoint';
import { activeRoguelikeEncounter, chooseRoguelikeEncounterDecision, maybeOpenRoguelikeEncounter } from '../roguelikeEncounterEngine';
import { roguelikeEncounterChoiceIds } from '../roguelikeEncounterCatalog';
import { activeDestinyTraitOffer, chooseDestinyTraitDecision, maybeOpenDestinyTrait } from '../destinyTraitEngine';
import { deferRegionalActorTurn, renewRegionalProtectionAfterEvent } from '../regionalSimulationEngine';
import { activeProtagonistFlight } from '../protagonistFlightEngine';
import { snapshotOrdinaryAction, recordOrdinaryActionEvidence } from '../ordinaryActionEvidence';
import { isTaughtSwordPracticeEvent } from '../taughtSwordForm';
import { isPrivateSchoolFormEvent } from '../schoolFormDuel';
import { recordRegionalActorReturn } from '../regionalPromotionEngine';
import { recordSeasonalHousingMovement } from '../seasonalHousingEngine';
import { recordReliefHomecomingMovement, recordReliefHomecomingAid } from '../reliefHomecoming';
import { captureWitnessedPersonalScene } from '../witnessedPersonalStory';
import { captureDramaticBondFact } from '../dramaticBondEngine';
import { recordBreakthroughCompetition, recordReliefCompetition } from '../competitionEngine';
import { recordTournamentBanquetAfterTalk } from '../tournamentBanquet';
import { rewardContribution } from '../sectPoliticsEngine';

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

/** A standing appointment takes precedence unless it is exactly the job the player picked. */
function matchesSectJobDecision(job:LLMDecisionPayload,due:LLMDecisionPayload):boolean{
  const mechanics=(decision:LLMDecisionPayload)=>(Object.keys(decision) as (keyof LLMDecisionPayload)[])
    .filter(key=>key!=='innerMonologue'&&String(key)!=='action'&&decision[key]!==undefined).sort()
    .map(key=>[key,decision[key]] as const);
  const left=mechanics(job),right=mechanics(due);
  return left.length===right.length&&left.every(([key,value],i)=>key===right[i][0]&&value===right[i][1]);
}

export function runOrdinaryActorAction(
  cultivator: Cultivator,
  { nextState, prevState, rng, newEvents, regionalTurn, pendingGateEffects, avatarOrder, precomputedDecisions, recordDecisionEffect, traceOptions, sectMeeting }: WorldTickContext,
  { applyCultivatorBrainDecision }: TickActionPorts,
): void {
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
  if(modelProposal?.chosenAction==='LAST_ROSTER'&&!avatarDecision){
    const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
    if(!prior||activeAvatar(prevState)===prior||!exactLastRosterDecision(modelProposal,
      availableLastRosterActions(prior,prevState,nextState.tick),true)){
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
  if(modelProposal?.chosenAction==='STORYTELLER_CHOICE'&&!avatarDecision){
    const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
    if(!prior||activeAvatar(prevState)===prior||prevState.storyteller?.focusActorId===prior.id||!exactStorytellerDecision(modelProposal,
      availableStorytellerActions(prior,prevState,nextState.tick),true)){
      provided={chosenAction:'REST',innerMonologue:'先在原处歇息。'};
      modelOrdinaryReplaced=true;
    }
  }
  if(modelProposal?.chosenAction==='BELL_WATCH'&&!avatarDecision){
    const prior=prevState.cultivators.find(row=>row.id===cultivator.id);
    if(!prior||activeAvatar(prevState)===prior||!exactBellWatchDecision(modelProposal,
      availableBellWatchActions(prior,prevState,nextState.tick),true)){
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
        const rankedAuthority=Boolean(modelProposal)&&hasRankedOrdinaryIntentAuthority(prevState,earlier,nextState.tick);
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
        const offered=rankedAuthority?modelOrdinaryIntentOptions(prevState,earlier,nextState.tick):[];
        const stillLegal=!rankedAuthority||!offered.length||offered.some(option=>matchesOrdinaryIntent(option,ordinaryProposal))&&
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
      return;
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
    return;
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
      return;
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
      return;
    }
  }

  // Mandatory embodied travel, trial and siege checks above are never bypassed by an encounter.
  const liveEncounter=nextState.roguelikeEncounters?.length&&!avatarDecision&&!expeditionOrder&&!occasion&&!activeSiegeForActor(nextState,cultivator)
    ?activeRoguelikeEncounter(nextState,cultivator):undefined;
  let modelStoryChoiceReplaced=false;
  if(liveEncounter){
    const allowed=provided?.chosenAction==='ROGUELIKE_ENCOUNTER'&&provided.targetRoguelikeEncounterId===liveEncounter.id&&
      !!provided.roguelikeEncounterChoice&&roguelikeEncounterChoiceIds(liveEncounter.kind).includes(provided.roguelikeEncounterChoice);
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
  const pendingChallenge=nextState.sectManagement?.challenges?.pending;
  const challenge=pendingChallenge&&(pendingChallenge.challengerId===cultivator.id||pendingChallenge.defenderId===cultivator.id)&&
    !avatarDecision&&!expeditionOrder&&
    !occasion&&!liveEncounter&&!liveDestiny&&activeAvatar(nextState)!==cultivator&&
    !activeSiegeForActor(nextState,cultivator)&&!requiredBeforeOrdinaryDecision(cultivator,nextState)
    ?chooseSectChallengeAction(nextState,cultivator):undefined;
  if(challenge){
    // An admitted challenge owns the route even if the provider suggests something else.
    if(modelProposal&&!matchesSectJobDecision(challenge,modelProposal))modelOrdinaryReplaced=true;
    provided=challenge;
  }
  const job=sectMeeting?.byDisciple.get(cultivator.id);
  let plannedJob:Exclude<SectJobPlan,{kind:'blocked'}>|undefined;
  if(challenge&&job&&sectMeeting)sectMeeting.observations.set(cultivator.id,{...job,tick:nextState.tick,phase:'unavailable',line:'先履已经应下的山门比试。'});
  if(!challenge&&job&&sectMeeting&&!avatarDecision&&!expeditionOrder&&!occasion&&!liveEncounter&&!liveDestiny&&
      activeAvatar(nextState)!==cultivator&&!activeSiegeForActor(nextState,cultivator)){
    const possible=planSectJob(nextState,cultivator,job.jobId);
    const required=requiredBeforeOrdinaryDecision(cultivator,nextState);
    if(possible.kind!=='blocked'&&(!required||matchesSectJobDecision(possible.decision,required))){
      plannedJob=possible;
      if(modelProposal&&!matchesSectJobDecision(possible.decision,modelProposal))modelOrdinaryReplaced=true;
      provided=possible.decision;
    }else if(possible.kind==='blocked'){
      sectMeeting.observations.set(cultivator.id,{...job,tick:nextState.tick,phase:'unavailable',line:possible.reason});
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
      availableLastRosterActions(cultivator,nextState,nextState.tick).length>0||
      availableVillageReunionActions(cultivator,nextState,nextState.tick).some(row=>row.villageReunionMove==='accept')||
      availableBattlefieldAftermathActions(cultivator,nextState,nextState.tick).some(row=>row.battlefieldAftermathMove==='accept_care')))return;

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
  const selectedDecision:LLMDecisionPayload=unresolvedModelConsent&&planned.chosenAction==='CULTIVATION_CLAN'?waitForOwnClanChoice():
    unresolvedModelConsent&&(planned.chosenAction==='VILLAGE_REUNION'&&(planned.villageReunionMove==='offer'||planned.villageReunionMove==='accept')||
      planned.chosenAction==='BATTLEFIELD_AFTERMATH'&&(planned.battlefieldAftermathMove==='offer_care'||planned.battlefieldAftermathMove==='accept_care')||
      planned.chosenAction==='FURNACE_EMERGENCY'&&planned.furnaceEmergencyMove==='accept_rescue')?
      {chosenAction:'REST',innerMonologue:'未曾应下旧交所问，先让这句话留在原处。'}:planned;

  const story=selectedDecision.chosenAction==='STORYTELLER_CHOICE'
    ? planStorytellerChoice(nextState,cultivator,selectedDecision) : undefined;
  if(selectedDecision.chosenAction==='STORYTELLER_CHOICE'&&!story){
    if(supplied)recordDecisionEffect?.(cultivator.id,false);
    traceOptions?.onActor?.(cultivator.id,[],false);
    return;
  }
  const decision=story?.native??selectedDecision;
  const captureTrace = traceOptions?.captureTrace !== false;
  const candidates = (captureTrace || traceOptions?.onActor) && decision.chosenAction !== 'EXPEDITION_DUNGEON' &&
    decision.chosenAction !== 'HEAVENLY_ALCHEMY' && decision.chosenAction !== 'DAO_PATH' &&
    decision.chosenAction !== 'IMMORTAL_AUCTION' && decision.targetAuctionAmbushLotId === undefined &&
    decision.chosenAction !== 'CULTIVATION_CLAN' && decision.chosenAction !== 'ASCENSION' &&
    !activeProtagonistFlight(nextState,cultivator) && decision.targetHeartDemonAftermathId===undefined ?
    legalTraceCandidates(nextState, cultivator) : [];
  const chosenByModel = Boolean(modelProposal && !modelOrdinaryReplaced && !modelStoryChoiceReplaced && !expeditionModelReplaced);
  if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, story ? selectedDecision : decision, decisionDraws, chosenByModel, false, false, nextState);
  if(decision.chosenAction==='VACANT_GATE'){
    const exact=exactVacantGateDecision(decision,availableVacantGateActions(cultivator,nextState,nextState.tick),true);
    const applied=Boolean(exact&&(!(modelProposal||isProviderPersonaDecision(decision))||activeAvatar(nextState)!==cultivator)&&
      stageVacantGateAction(nextState,cultivator,exact));
    if(applied&&exact)pendingGateEffects.set(cultivator.id,{decision:exact,model:chosenByModel,avatar:Boolean(avatarDecision),supplied:Boolean(supplied)});
    else if(supplied)recordDecisionEffect?.(cultivator.id,false);
    return;
  }
  const previousLocation = cultivator.locationId;
  const previousRealm = cultivator.realm;
  const previousRealmStage = cultivator.realmStage;
  const ordinaryBefore = snapshotOrdinaryAction(cultivator, decision);
  const jobBefore=plannedJob&&plannedJob.decision===decision?snapshotSectJobEvidence(nextState,cultivator):undefined;
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
  if(job&&sectMeeting&&plannedJob&&jobBefore){
    const deferred=validEffect&&plannedJob.kind==='chore'&&deferSectPairChore(sectMeeting,cultivator,job,plannedJob,jobBefore);
    if(!deferred){
      const choreEvent=validEffect&&plannedJob.kind==='chore'?settleSectJobChore(nextState,cultivator,plannedJob):undefined;
      if(choreEvent){newEvents.push(choreEvent);witnessEvent(nextState,choreEvent);}
      sectMeeting.observations.set(cultivator.id,
        observeSectJob(nextState,cultivator,job,plannedJob,jobBefore,choreEvent??evt??undefined,validEffect));
    }
  }
  if(story)completeStorytellerChoice(nextState,cultivator,story,
    validEffect&&storytellerActionApplied(cultivator,story.native,previousLocation,evt));
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
    if(!isBattlefieldRevisitEvent(evt)&&!isPrivateCalamityArrayEvent(evt)&&!isTaughtSwordPracticeEvent(evt)&&!isPrivateSchoolFormEvent(evt)&&!isPrivateWitnessInquiryEvent(evt)&&!isPrivatePavilionFireEvent(evt)&&!isPrivateMercyReunionEvent(evt)&&!isPrivateWildMigrationEvent(evt)&&!isPrivateVillageReunionEvent(evt)&&!isPrivateBattlefieldAftermathEvent(evt)&&!isPrivatePilgrimageForkEvent(evt)&&!isPrivateApprenticeshipReunionEvent(evt)&&!isPrivateFurnaceEmergencyEvent(evt)&&!isPrivateAbandonedQuarterEvent(evt)&&!isPrivateBoundaryGapEvent(evt)&&!isPrivateNightDoorEvent(evt)&&!isPrivateBanquetSeatEvent(evt)&&!isPrivateLastRosterEvent(evt)&&!(evt.witnessScope==='participants'&&evt.id.endsWith('-study-technique-fire')))witnessEvent(nextState, evt);
    if(decision.chosenAction==='SOCIALIZE'&&cultivator.currentAction==='SOCIALIZE'){
      const after=recordTournamentBanquetAfterTalk(nextState,evt);
      if(after&&!newEvents.some(row=>row.id===after.id))newEvents.push(after);
    }
  }
}

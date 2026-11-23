import { availableBellWatchActions } from '../bellWatch';
import { availableStorytellerActions } from '../storytellerDirector';
import { exactStorytellerDecision } from './storytellerDecision';
import { exactBellWatchDecision } from './bellWatchDecision';
import { activeAvatar } from '../avatarEngine';
import { exactLastRosterDecision } from '../lastRosterCognition';
import { availableLastRosterActions } from '../lastRoster';
import { exactBanquetSeatDecision } from '../banquetSeatCognition';
import { availableBanquetSeatActions } from '../banquetSeats';
import { exactApprenticeshipReunionDecision } from '../apprenticeshipReunionCognition';
import { availableApprenticeshipReunionActions } from '../apprenticeshipReunion';
import { exactPilgrimageForkDecision } from '../pilgrimageForkCognition';
import { availablePilgrimageForkActions } from '../pilgrimageFork';
import { AUCTION_PRIVATE_COMMAND_KEYS } from '../immortalAuctionCognition';
import { CLAN_PRIVATE_COMMAND_KEYS } from '../cultivationClanCognition';
import { ASCENSION_PRIVATE_COMMAND_KEYS } from '../ascensionCognition';
import { exactHeartDemonRecoveryDecision } from '../heartDemonRecoveryCognition';
import { availableHeartDemonRecovery } from '../heartDemonAftermathEngine';
import { isOrdinaryIntentAction, matchesOrdinaryIntent, preferredOrdinarySocialIntent } from '../ordinaryIntentEngine';
import { voluntaryHeartDemonChoiceEffect, verifiedHeartDemonChoiceEffect, canPauseAftermathRescue } from '../heartDemonChoicePolicy';
import { decodeWaypostMealDecision } from '../waypostMealCognition';
import { isFrontierAction, exactFrontierDecision } from '../frontierActions';
import { decodeNorthGateRenewal, decodeUpperPassage } from './decisionFactsLate';
import { isUpperArrayFieldAction, exactUpperArrayFieldDecision } from '../upperArrayFieldActions';
import type { CognitiveSnapshot } from './cognitiveContext';
import type { NativeDecisionContinuation } from './nativeDecisionGate';
import type { DecisionFacts } from './collectDecisionFacts';

import { decodeOrdinaryAction } from './ordinaryActionDecoder';
import type { ActionType, LLMDecisionPayload } from '../../types/world';

/** Apply exclusive policies and the authoritative action allowlist before decoding targets. */
export function decodeOrdinaryDecision(snapshot: CognitiveSnapshot, quotes: NativeDecisionContinuation, facts: DecisionFacts, parsed: Partial<LLMDecisionPayload>): LLMDecisionPayload | undefined {
  const { cultivator, world, requestTick } = snapshot;
  const {
    afterSect, banquet, forkOptions, boundaryReliefOnly, rescueOnly, rescuePause, rescueEffect, mealOptions,
    activeVow, onPilgrimagePath, bellOptions, storytellerOptions
  } = quotes;
  const {
    apprenticeshipOptions, ownRecovery, ordinaryHistory, ordinaryOptions, unverifiedTrail,
    initialAftermathSocial, socialEffect, frontierOptions, renewalOptions, pendingUpperEntry,
    arrayFieldWellOptions, oldWellOptions, charterOptions, waterVeinOptions
  } = facts;

  if(parsed?.chosenAction==='LAST_ROSTER'){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||!exactLastRosterDecision(parsed,afterSect))return undefined;
    return exactLastRosterDecision(parsed,availableLastRosterActions(cultivator,world,requestTick));
  }
  if(parsed&&(Object.hasOwn(parsed,'lastRosterMove')||Object.hasOwn(parsed,'targetLastRosterId')))return undefined;
  if(parsed?.chosenAction==='BANQUET_SEAT'){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||!exactBanquetSeatDecision(parsed,banquet))return undefined;
    return exactBanquetSeatDecision(parsed,availableBanquetSeatActions(cultivator,world,requestTick));
  }
  if(parsed&&(Object.hasOwn(parsed,'banquetSeatMove')||Object.hasOwn(parsed,'targetBanquetSeatId')))return undefined;
  if(parsed?.chosenAction==='STORYTELLER_CHOICE'){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||world.storyteller?.focusActorId===cultivator.id||!exactStorytellerDecision(parsed,storytellerOptions))return undefined;
    return exactStorytellerDecision(parsed,availableStorytellerActions(cultivator,world,requestTick));
  }
  if(parsed&&(Object.hasOwn(parsed,'storytellerOfferId')||Object.hasOwn(parsed,'storytellerMove')))return undefined;
  if(parsed?.chosenAction==='BELL_WATCH'){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||!exactBellWatchDecision(parsed,bellOptions))return undefined;
    return exactBellWatchDecision(parsed,availableBellWatchActions(cultivator,world,requestTick));
  }
  if(parsed&&(Object.hasOwn(parsed,'bellWatchMove')||Object.hasOwn(parsed,'targetBellWatchId')))return undefined;
  if(parsed&&(Object.hasOwn(parsed,'nightDoorMove')||Object.hasOwn(parsed,'targetNightDoorId')))return undefined;
  if(parsed&&(Object.hasOwn(parsed,'boundaryGapMove')||Object.hasOwn(parsed,'targetBoundaryGapId')))return undefined;
  if(parsed&&(Object.hasOwn(parsed,'abandonedQuarterMove')||Object.hasOwn(parsed,'targetAbandonedQuarterId')))return undefined;
  if(parsed&&(Object.hasOwn(parsed,'furnaceEmergencyMove')||Object.hasOwn(parsed,'targetFurnaceEmergencyId')))return undefined;
  if(parsed?.chosenAction==='APPRENTICESHIP_REUNION'){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||!exactApprenticeshipReunionDecision(parsed,apprenticeshipOptions))return undefined;
    return exactApprenticeshipReunionDecision(parsed,availableApprenticeshipReunionActions(cultivator,world,requestTick));
  }
  if(parsed&&(Object.hasOwn(parsed,'apprenticeshipReunionMove')||Object.hasOwn(parsed,'targetApprenticeshipReunionId')))return undefined;
  if(parsed?.chosenAction==='PILGRIMAGE_FORK'){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||!exactPilgrimageForkDecision(parsed,forkOptions))return undefined;
    return exactPilgrimageForkDecision(parsed,availablePilgrimageForkActions(cultivator,world,requestTick));
  }
  if(parsed&&(Object.hasOwn(parsed,'pilgrimageForkMove')||Object.hasOwn(parsed,'targetPilgrimageForkId')))return undefined;
  // Generic actions cannot smuggle proof-bound fields from a separate native choice lane.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.hasOwn(parsed, 'targetHeartTrialId') || Object.hasOwn(parsed, 'heartDemonChoice') ||
      Object.hasOwn(parsed, 'targetForbiddenDuelId') || Object.hasOwn(parsed, 'forbiddenArtChoice') ||
      Object.hasOwn(parsed, 'targetGrandSiegeId') || Object.hasOwn(parsed, 'grandSiegeHeroMove') ||
      Object.hasOwn(parsed, 'targetDungeonRoomId') || Object.hasOwn(parsed, 'dungeonMove') ||
      Object.hasOwn(parsed, 'targetDaoPathId') || Object.hasOwn(parsed, 'daoPathMove') ||
      AUCTION_PRIVATE_COMMAND_KEYS.some(key => Object.hasOwn(parsed, key)) ||
      CLAN_PRIVATE_COMMAND_KEYS.some(key => Object.hasOwn(parsed, key)) ||
      ASCENSION_PRIVATE_COMMAND_KEYS.some(key => Object.hasOwn(parsed, key)) ||
      ['heavenlyAlchemyMove', 'targetHeavenlyRecipeId', 'heavenlyAlchemyHeat', 'heavenlyAlchemyQuality']
        .some(key => Object.hasOwn(parsed, key))) return undefined;
  const validActions: ActionType[] = [
    'CULTIVATE',
    'BREAKTHROUGH',
    'EXPLORE',
    'SOCIALIZE',
    'DUEL',
    'SCHEMING',
    'PURSUE_SCHEME',
    'AUTHOR_TECHNIQUE',
    'STUDY_TECHNIQUE',
    'GATHER_HERBS',
    'SEED_CULTURE',
    'WATER_VEIN',
    'NORTH_MINING_CHARTER',
    'NORTH_WELL_REVIEW',
    'UPPER_PASSAGE',
    'UPPER_ARRAY_FIELD',
    'UPPER_ARRAY_FIELD_LOCAL',
    'UPPER_ARRAY_FIELD_TRADE',
    'NORTH_GATE_RENEWAL',
    'FRONTIER',
    'FRONTIER_PRODUCTION',
    'FRONTIER_TRADE',
    'FRONTIER_PORT',
    'FRONTIER_PORT_TRADE',
    'FRONTIER_DRYLAND',
    'FRONTIER_DRYLAND_TRADE',
    'BREW_PILL',
    'USE_PILL',
    'FORGE_ARTIFACT',
    'BIND_ARTIFACT',
    'REPAIR_ARTIFACT',
    'SALVAGE_ARTIFACT',
    'AWAKEN_ARTIFACT',
    'FACE_TRIBULATION',
    'AMBUSH_TRIBULATION',
    'CHALLENGE_LEADERSHIP',
    'PLOT_COUP',
    'BUILD_FACILITY',
    'DISPATCH_GUARD',
    'GUARD_DUTY',
    'OFFER_ALLIANCE',
    'DECLARE_WAR',
    'DEMAND_TRIBUTE',
    'LAUNCH_SIEGE',
    'JOIN_OCCASION',
    'PURSUE_BOUNTY',
    'TAME_BEAST',
    'TRADE',
    'DUAL_CULTIVATE',
    'SECT_DIPLOMACY',
    'REST',
    'TEACH',
    'ACCEPT_TUITION',
    'DECLINE_TUITION',
    'OFFER_OATH',
    'ACCEPT_OATH',
    'DECLINE_OATH',
    'FULFILL_OATH',
    'APPEAL_OATH',
    'OATH_ARBITRATION',
    'PLACE_MARKET_BUY',
    'PLACE_MARKET_SELL',
    'CANCEL_MARKET_ORDER',
    'RECRUIT_SETTLER',
    'DELIVER_RELIEF',
    'FILE_WITNESS_CLAIM',
    'ATTEST_WITNESS',
    'CHALLENGE_WITNESS',
    'NAME_HEIR',
    'CLAIM_ESTATE',
    'HOLD_MEMORIAL',
    'DOCTRINE',
    'DOCTRINE_FOUNDING',
    'DOCTRINE_MATURITY',
    'RELOCATE',
    'RECOLLECT',
    'RELIC',
    'SCRIPTURE',
    'PAVILION_LOAN',
    'RANK_SEASON',
    'ESCORT',
    'CEASEFIRE',
    'RESEARCH',
    'SANCTUARY',
    'SECT_CREDIT',
    'PILGRIMAGE',
    'ROUTE_WARNING',
    'CHRONICLE_ERRATA',
    'HABITAT',
    'INFIRMARY',
    'CARE_FOLLOWUP',
    'DANXIA_MEDICINE',
    'DANXIA_REVIEW',
    'SECT_STIPEND',
    'FORMATION_NETWORK',
    'TERRITORIAL_LEASE',
    'HOUSEHOLD_GUARDIAN',
    'VILLAGE_WORKS',
    'SEALED_COURIER',
    'COURIER_HANDOFF',
    'SECT_SERVICE',
    'SHARED_COMMONS',
    'TERRAIN_RECOVERY',
    'WORKSHOP',
    'TOOL_LOAN',
    'WORKSHOP_CAPACITY',
    'WORKSHOP_RELEASE',
    'WORKSHOP_ESTATE',
    'WAYPOST_MEAL',
    'MARKET_FREIGHT',
    'DISASTER_SHELTER',
    'CRAFT_TRAINING',
    'SCRIBE_COMMISSION',
    'FURNACE_RESERVATION',
    'FURNACE_SAFETY',
    'DAMAGE_ASSURANCE',
    'SPARRING',
    'EXPEDITION_RESCUE',
    'SHORT_SHIFT',
    'BOUNDARY_RELIEF',
    'MENTOR_TRANSFER',
    'APPRENTICE_COHORT',
    'SEASONAL_HOUSING',
    'HOUSEHOLD_NAME',
    'CARAVAN_RESTITUTION',
    'VILLAGE_GRANARY',
    'VILLAGE_SUPPLY',
    'VILLAGE_FAIR',
    'RELIC_EXHIBIT',
    'PROBATION',
    'ROAD',
    'VILLAGE_CENSUS',
    'CIVIC_MEMORIAL',
    'FIELD_OBSERVATORY',
    'ALIGNED_WEATHER',
    'SEASON_REVIEW',
  ];
  const chosenAction = parsed?.chosenAction;
  if (!chosenAction || !validActions.includes(chosenAction)) return undefined;
  if(parsed.targetHeartDemonAftermathId!==undefined){
    if(activeAvatar(world)===cultivator||!exactHeartDemonRecoveryDecision(parsed,ownRecovery))return undefined;
    return exactHeartDemonRecoveryDecision(parsed,availableHeartDemonRecovery(world,cultivator,requestTick));
  }
  if (ordinaryHistory && ordinaryOptions.length && isOrdinaryIntentAction(chosenAction) &&
      !ordinaryOptions.some((candidate)=>matchesOrdinaryIntent(candidate,{...parsed,chosenAction})) &&
      !(chosenAction==='EXPLORE'&&unverifiedTrail&&parsed.targetLocationId===unverifiedTrail)) return undefined;
  if(chosenAction==='SOCIALIZE'){
    const current=voluntaryHeartDemonChoiceEffect(world,cultivator,requestTick);
    const preferred=current?preferredOrdinarySocialIntent(world,cultivator,requestTick):undefined;
    if(initialAftermathSocial||preferred){
      // Match the starting and fresh exact own target, even without ordinary history.
      if(current!==socialEffect||!initialAftermathSocial||!preferred||
        Object.keys(parsed).some(key=>!['chosenAction','targetCultivatorId','innerMonologue','spokenLine'].includes(key))||
        !matchesOrdinaryIntent(initialAftermathSocial,{...parsed,chosenAction})||
        !matchesOrdinaryIntent(preferred,{...parsed,chosenAction}))return undefined;
    }
  }

  if (boundaryReliefOnly && chosenAction !== 'BOUNDARY_RELIEF') return undefined;
  if(rescueOnly&&chosenAction==='REST'&&rescuePause&&Object.keys(parsed).length===1&&
      verifiedHeartDemonChoiceEffect(world,cultivator,requestTick)===rescueEffect&&
      canPauseAftermathRescue(cultivator,world,requestTick))
    return {chosenAction:'REST',innerMonologue:'本月暂不接信，不代别人应诺。'};
  if (rescueOnly && chosenAction !== 'EXPEDITION_RESCUE') return undefined;
  if (chosenAction === 'WAYPOST_MEAL') return decodeWaypostMealDecision(parsed, cultivator, mealOptions);
  if (parsed.waypostMealMove !== undefined || parsed.targetWaypostMealId !== undefined) return undefined;
  if (activeVow && chosenAction !== 'PILGRIMAGE' &&
      (onPilgrimagePath || (chosenAction !== 'REST' && chosenAction !== 'ROUTE_WARNING'))) return undefined;
  if(isFrontierAction(chosenAction))return exactFrontierDecision(parsed,frontierOptions);
  if(parsed.frontierMove!==undefined||parsed.frontierProductionMove!==undefined||parsed.frontierTradeMove!==undefined||
    parsed.targetFrontierSiteId!==undefined||parsed.targetFrontierTradeId!==undefined||parsed.frontierPortMove!==undefined||
    parsed.frontierPortTradeMove!==undefined||parsed.targetFrontierPortTradeId!==undefined||parsed.frontierDrylandMove!==undefined||
    parsed.frontierDrylandFeed!==undefined||parsed.frontierDrylandTradeMove!==undefined||parsed.targetFrontierDrylandTradeId!==undefined)return undefined;
  if(chosenAction==='NORTH_GATE_RENEWAL')return decodeNorthGateRenewal(parsed,renewalOptions);
  if(parsed.northGateRenewalMove!==undefined||parsed.targetNorthGateRenewalId!==undefined)return undefined;
  if((parsed.upperPassageMove!==undefined||parsed.targetUpperPassageNodeId!==undefined)&&
    chosenAction!=='UPPER_PASSAGE')return undefined;
  if(chosenAction==='UPPER_PASSAGE')return decodeUpperPassage(parsed,pendingUpperEntry,false);
  if(isUpperArrayFieldAction(chosenAction))return exactUpperArrayFieldDecision(parsed,arrayFieldWellOptions);
  if(parsed.upperArrayFieldMove!==undefined||parsed.upperArrayFieldLocalMove!==undefined||parsed.upperArrayFieldTradeMove!==undefined||
    parsed.targetUpperArrayFieldSiteId!==undefined||parsed.targetUpperArrayFieldTradeId!==undefined)return undefined;
  if(parsed.northWellReviewMove!==undefined&&chosenAction!=='NORTH_WELL_REVIEW')return undefined;
  if(chosenAction==='NORTH_WELL_REVIEW'){
    const exact=oldWellOptions.find(row=>row.northWellReviewMove===parsed.northWellReviewMove&&
      row.targetNorthMiningCharterId===parsed.targetNorthMiningCharterId);
    if(!exact||Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','northWellReviewMove','targetNorthMiningCharterId'].includes(field)))return undefined;
    const innerMonologue=(typeof parsed.innerMonologue==='string'&&parsed.innerMonologue.trim().slice(0,160))||
      '依本人当前实读与旧契办理，不替旁人解禁。';
    return {chosenAction:'NORTH_WELL_REVIEW',northWellReviewMove:exact.northWellReviewMove,
      targetNorthMiningCharterId:exact.targetNorthMiningCharterId,innerMonologue};
  }
  if(chosenAction!=='NORTH_MINING_CHARTER'&&
    (parsed.northMiningMove!==undefined||parsed.northMiningStance!==undefined||parsed.targetNorthMiningCharterId!==undefined))return undefined;
  if(chosenAction==='NORTH_MINING_CHARTER'){
    const exact=charterOptions.find(row=>row.northMiningMove===parsed.northMiningMove&&row.northMiningStance===parsed.northMiningStance&&
      row.targetNorthMiningCharterId===parsed.targetNorthMiningCharterId);
    if(!exact||Object.keys(parsed).some(field=>!['chosenAction','innerMonologue','northMiningMove',
        exact.northMiningMove==='propose'?'northMiningStance':'targetNorthMiningCharterId'].includes(field)))return undefined;
    const innerMonologue=(typeof parsed.innerMonologue==='string'&&parsed.innerMonologue.trim().slice(0,160))||
      '在实址按本人已经核准的采契选项办理。';
    return exact.northMiningMove==='propose' ?
      {chosenAction:'NORTH_MINING_CHARTER',northMiningMove:'propose',northMiningStance:exact.northMiningStance,innerMonologue} :
      {chosenAction:'NORTH_MINING_CHARTER',northMiningMove:'sign',targetNorthMiningCharterId:exact.targetNorthMiningCharterId,innerMonologue};
  }
  if(parsed.waterVeinMove!==undefined&&chosenAction!=='WATER_VEIN')return undefined;
  if(chosenAction==='WATER_VEIN'){
    const exact=waterVeinOptions.find(row=>row.waterVeinMove===parsed.waterVeinMove&&row.targetLocationId===parsed.targetLocationId);
    if(!exact||Object.keys(parsed).some(field=>!['chosenAction','waterVeinMove','targetLocationId','innerMonologue'].includes(field)))return undefined;
    const innerMonologue=(typeof parsed.innerMonologue==='string'&&parsed.innerMonologue.trim().slice(0,160))||
      '到实址照现有水线许可办理。';
    return {chosenAction:'WATER_VEIN',waterVeinMove:exact.waterVeinMove,targetLocationId:exact.targetLocationId,innerMonologue};
  }
  return decodeOrdinaryAction(snapshot, quotes, facts, parsed, chosenAction);
}

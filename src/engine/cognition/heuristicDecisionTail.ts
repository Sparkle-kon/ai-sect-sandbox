// Extracted from the native decision flow; evaluation order belongs to the enclosing Utility pipeline.
import { activeAvatar } from '../avatarEngine';
import { availableCampaignAssemblyActions } from '../campaignAssembly';
import { exactCampaignAssemblyDecision, tagCampaignAssemblyDecision } from '../campaignAssemblyCognition';
import { availableEstateActions } from '../estateEngine';
import { availableWitnessActions } from '../witnessEngine';
import { availableWitnessInquiryActions } from '../witnessInquiry';
import { exactWitnessInquiryDecision, witnessInquiryCommand } from '../witnessInquiryCognition';
import { availableSettlementActions } from '../settlementEngine';
import { availableCivicMemorialActions } from '../civicMemorialEngine';
import { availableSeedCultureActions } from '../seedCultureEngine';
import { availableScriptureActions } from '../scriptureEngine';
import { utilityNorthMiningDecision } from '../northMiningCharterEngine';
import { utilityNorthWellReviewDecision } from '../northWellRevisitEngine';
import { UPPER_PASSAGE_PATH } from '../upperPassageTerms';
import { utilityUpperPassageDecision } from '../upperPassageEngine';
import { utilityWaterVeinDecision } from '../waterVeinEngine';
import { availableRelicActions } from '../relicEngine';
import { availableRecollectionActions } from '../reincarnationEngine';
import { availableRelocationActions } from '../relocationEngine';
import { availableDoctrineMaturityActions } from '../doctrineMaturityEngine';
import { availableDoctrineFoundingActions } from '../doctrineFoundingEngine';
import { availableDoctrineActions } from '../doctrineEngine';
import { availableMarketActions, marketClosureReason } from '../marketEngine';
import { availableOathActions } from '../oathEngine';
import { availableMentorshipActions } from '../mentorshipEngine';
import { availableOccasionJoins } from '../occasionEngine';
import { availableDiplomacyActions } from '../diplomacyEngine';
import { availableBountyHunts } from '../bountyEngine';
import { availableSectEconomyActions } from '../sectEconomyEngine';
import { availableLeadershipActions } from '../sectPoliticsEngine';
import { availableAmbushTargets } from '../tribulationEngine';
import { availableBeastTames, petCombatBonus } from '../spiritBeastEngine';
import { mayAuthorTechnique, utilityStudyTarget } from '../techniqueEngine';
import { utilityScheme } from '../schemeEngine';
import { availableEscortActions } from '../escortEngine';
import { availableArtifactActions, equippedArtifact, durabilityOf, artifactId } from '../artifactEngine';
import { exactAuctionAmbushDecision, auctionAmbushCommand } from '../immortalAuctionCognition';
import { firstActorRelationships, availableEncounters } from '../encounterEngine';
import { activeCeasefireBetween } from '../ceasefireEngine';
import { sanctuaryCanShield, availableSanctuaryActions } from '../sanctuaryEngine';
import { recallMemories, memoryStrength } from '../memoryEngine';
import { strikeMultiplier, cultivationMultiplier, compareCultivationSites } from '../elementalEngine';
import { destinyDuelAppetite } from '../destinyTraitEngine';
import { personaLine } from '../wildPersonaEngine';
import { availableCaravanRestitutionActions } from '../caravanRestitutionEngine';
import { availableCompetitionActions, competitionActorOptedOut } from '../competitionEngine';
import { availableResearchActions } from '../researchEngine';
import { availableSectCreditActions } from '../sectCreditEngine';
import { availablePilgrimageActions } from '../pilgrimageEngine';
import { pickChronicleReading, availableChronicleErrataActions } from '../chronicleErrataEngine';
import { availableHabitatActions } from '../habitatEngine';
import { availableFormationActions } from '../formationNetworkEngine';
import { availableGuardianActions } from '../householdEngine';
import { availableCourierActions } from '../sealedCourierEngine';
import { availableShortShiftActions, type ShortShiftOption } from '../shortShiftEngine';
import { availableBoundaryReliefActions } from '../boundaryReliefEngine';
import { availableApprenticeCohortActions } from '../apprenticeCohortEngine';
import { availableMentorTransferActions } from '../mentorTransferEngine';
import { availableSeasonalHousingActions } from '../seasonalHousingEngine';
import { availableHouseholdNameActions } from '../householdNameEngine';
import { availableVillageSupplyActions } from '../villageSupplyEngine';
import { availableVillageGranaryActions, projectVillageGranary } from '../villageGranaryEngine';
import { availableVillageFairActions } from '../villageFairEngine';
import { availableSectStipendActions } from '../sectStipendEngine';
import { availableCareFollowupActions } from '../careFollowupEngine';
import { availableObservatoryFundingActions } from '../fieldObservatoryEngine';
import { availableArtifactSalvageActions } from '../artifactSalvageEngine';
import { availableDanxiaMedicineActions } from '../danxiaMedicineEngine';
import { availableDanxiaReviewActions } from '../danxiaSeasonReviewEngine';
import { availableBattlefieldRevisits } from '../battlefieldRevisit';
import { exactBattlefieldRevisitDecision, battlefieldRevisitCommand } from '../battlefieldRevisitCognition';
import { activeHeartDemonAftermath, availableHeartDemonRecovery } from '../heartDemonAftermathEngine';
import { exactHeartDemonRecoveryDecision, heartDemonRecoveryCommand } from '../heartDemonRecoveryCognition';
import { voluntaryHeartDemonChoiceEffect, preferredHeartDemonSocialTarget } from '../heartDemonChoicePolicy';
import { knownMapLocations } from '../terrainEngine';
import { knownRumorLead } from '../rumorEngine';
import { utilityCeasefireDecision } from './decisionFactsEarly';
import { holdsCivicAppendAvatar, utilityNorthGateRenewalDecision, holdsUpperPassageBody, upperPassageDecision, dueOrdinaryOath, utilityCultivationClanDecision, utilityImmortalAuctionDecision, utilityDaoPathDecision, utilityHeavenlyAlchemyDecision, currentAuctionAmbushOffer, utilityRouteWarning, utilityRankedOrdinaryDecision } from './decisionFactsLate';
import { toMentorTransferDecision, toHousingDecision } from './decisionCommands';
import type { Cultivator, LLMDecisionPayload, LocationNode, WorldState } from '../../types/world';
import { type PavilionLoanOption } from '../pavilionLoanEngine';
import { type AlchemyOption } from '../alchemyEngine';

interface UtilityContinuation {
  readonly cultivator: Cultivator;
  readonly world: WorldState;
  readonly currentLocation: LocationNode | undefined;
  readonly rng: () => number;
  readonly pavilionLoans: PavilionLoanOption[];
  readonly alchemy: AlchemyOption[];
  readonly coLocatedOthers: Cultivator[];
  readonly shiftChoices: ShortShiftOption[];
  readonly willingTransfer: boolean;
  readonly willingVillageSupport: boolean;
  readonly willingStipend: boolean;
  readonly leadingAtStipendSite: boolean;
  readonly willingFollowup: boolean;
  readonly pairStation: "edge" | "wait" | "center" | undefined;
}

/** Existing charter choices take precedence over new local narrative follow-ups. */
export function utilityDoctrineFoundingDecision(cultivator:Cultivator,world:WorldState):LLMDecisionPayload|undefined {
  if(world.relocations.abandonedSites.length||world.doctrineFoundings.foundings.length){
    const choices=availableDoctrineFoundingActions(cultivator,world);
    const hesitant=cultivator.personality==='阴险'||cultivator.personality==='诡诈';
    const response=choices.find(row=>row.doctrineFoundingMove===(hesitant?'decline':'authorize'));
    const action=choices.find(row=>row.doctrineFoundingMove==='establish')??response??
      (!hesitant?choices.find(row=>row.doctrineFoundingMove==='join')??choices.find(row=>row.doctrineFoundingMove==='propose'):undefined);
    if(action)return {...action,chosenAction:action.action,innerMonologue:'原山门、本人许可和实有钱库要一项项核对。'};
  }
  return undefined;
}

export function completeHeuristicDecision({
  cultivator,
  world,
  currentLocation,
  rng,
  pavilionLoans,
  alchemy,
  coLocatedOthers,
  shiftChoices,
  willingTransfer,
  willingVillageSupport,
  willingStipend,
  leadingAtStipendSite,
  willingFollowup,
  pairStation
}: UtilityContinuation): LLMDecisionPayload {
  const negotiation = utilityCeasefireDecision(cultivator, world);
  if (negotiation) return negotiation;
  // A witnessed front can occupy one of the other bodies' quiet turns; unattended native pacing stays unchanged.
  const frontWitness=activeAvatar(world);
  if(frontWitness&&frontWitness!==cultivator&&frontWitness.positionPlane===undefined&&frontWitness.alive&&frontWitness.hp>0){
    const scene=availableCampaignAssemblyActions(cultivator,world,world.tick).filter(row=>row.kind!=='guard'&&
      world.sieges.some(siege=>siege.id===row.siegeId&&siege.destinationId===frontWitness.locationId));
    const choice=scene.find(row=>row.kind==='negotiate'&&(cultivator.personality==='刚正'||cultivator.personality==='逍遥'))??
      scene.find(row=>row.kind==='join'&&cultivator.hp>=cultivator.maxHp*.6&&cultivator.personality!=='苟道');
    const exact=choice&&exactCampaignAssemblyDecision(choice.command,[choice]);
    const tagged=exact&&choice&&tagCampaignAssemblyDecision(exact,[choice]);
    if(tagged)return tagged;
  }

  const mayNameHeir = world.tick % 12 === 7 && !cultivator.namedHeirId && cultivator.age >= cultivator.lifespan * .62;
  const estateOptions = availableEstateActions(cultivator, world, mayNameHeir);
  const nextEstate = estateOptions.find(({ action }) => action === 'CLAIM_ESTATE') ??
    (world.tick % 5 === 0 ? estateOptions.find(({ action }) => action === 'HOLD_MEMORIAL') : undefined) ??
    (mayNameHeir ? estateOptions.find(({ action }) => action === 'NAME_HEIR') : undefined);
  if (nextEstate) return { ...nextEstate, chosenAction: nextEstate.action, innerMonologue: '亲缘、师承与归葬皆须按实情记录。' };

  const witnessActions = availableWitnessActions(cultivator, world, world.tick % 7 === 3);
  const evidenceAction = witnessActions.find(({ action }) => action === 'CHALLENGE_WITNESS') ??
    witnessActions.find(({ action }) => action === 'ATTEST_WITNESS') ??
    (world.tick % 7 === 3 ? witnessActions.find((option) => {
      if (option.action !== 'FILE_WITNESS_CLAIM') return false;
      const fact = world.witnesses.facts.find(({ eventId }) => eventId === option.targetWitnessEventId);
      if (!fact || !(fact.witnessIds.includes(cultivator.id) || fact.participantIds.includes(cultivator.id))) return false;
      return (cultivator.personality === '阴险' || cultivator.personality === '诡诈')
        === (option.targetCultivatorId === fact.winnerId);
    }) : undefined);
  if (evidenceAction) return { ...evidenceAction, chosenAction: evidenceAction.action, innerMonologue: '证言应以亲知来由或已掌握的案卷为据。' };
  if(activeAvatar(world)!==cultivator && (cultivator.personality==='刚正'||cultivator.personality==='逍遥')){
    const inquiries=availableWitnessInquiryActions(cultivator,world,world.tick);
    const option=inquiries.find(row=>row.witnessInquiryMove==='ask')??inquiries[0];
    const inquiry=option&&exactWitnessInquiryDecision(witnessInquiryCommand(option),inquiries);
    if(inquiry)return inquiry;
  }

  const villageNeeds = world.tick >= 4 && !cultivator.guardAssignment ? availableSettlementActions(cultivator, world) : [];
  const relief = villageNeeds.find((option) => option.action === 'DELIVER_RELIEF');
  if (relief) return { ...relief, chosenAction: relief.action, innerMonologue: '灾后所缺须从实际库存筹措。' };

  const civicAtVillage = world.civicMemorials.deeds.length > 0 && !cultivator.guardAssignment &&
    cultivator.hp >= cultivator.maxHp * .75 &&
    world.settlements.villages.some(({ locationId }) => locationId === cultivator.locationId);
  if(civicAtVillage&&!holdsCivicAppendAvatar(cultivator,world,world.tick)&&world.civicMemorials.memorials.some(
    row=>row.status==='verified'&&row.verification&&row.verification.tick<(world.civicMemorials.deeds.at(-1)?.tick??0))){
    const additions=availableCivicMemorialActions(cultivator,world).filter(row=>row.civicMemorialMove==='append_relief');
    if(additions.length===1)return {chosenAction:'CIVIC_MEMORIAL',civicMemorialMove:'append_relief',
      targetCivicDeedId:additions[0].targetCivicDeedId,targetCivicMemorialId:additions[0].targetCivicMemorialId,
      innerMonologue:'不是重刻旧碑，只把我亲见、留账的后来一次赈济另记一行。'};
  }
  if (civicAtVillage && world.civicMemorials.memorials.some(({ status, openedTick, expiresTick }) =>
      status === 'proposed' && openedTick < world.tick && expiresTick > world.tick)) {
    const confirm = availableCivicMemorialActions(cultivator, world).filter(({ civicMemorialMove }) => civicMemorialMove === 'verify');
    if (confirm.length === 1) return { chosenAction: 'CIVIC_MEMORIAL', civicMemorialMove: 'verify',
      targetCivicMemorialId: confirm[0].targetCivicMemorialId, innerMonologue: '我只核认自己当场见过的一件实事，不代人证明亲缘或行踪。' };
  }

  const willingSeedCulture = !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .75;
  const wantSeedReserve = world.tick >= 16 && cultivator.herbs.jade_leaf >= 5 &&
    (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 17 === 8;
  const ownLocalSeedWork = () =>
    world.seedCulture.lots.some(({ ownerId, siteId, remaining, loss }) =>
      ownerId === cultivator.id && siteId === cultivator.locationId && remaining > 0 && !loss) ||
    world.seedCulture.plots.some(({ ownerId, siteId, status }) =>
      ownerId === cultivator.id && siteId === cultivator.locationId && status === 'ready');
  const seeds = willingSeedCulture && (wantSeedReserve || ownLocalSeedWork()) ? availableSeedCultureActions(cultivator, world) : [];
  const harvests = seeds.filter(({ seedMove }) => seedMove === 'harvest');
  if (harvests.length === 1) return { chosenAction: 'SEED_CULTURE', seedMove: 'harvest',
    targetSeedPlotId: harvests[0].targetSeedPlotId, innerMonologue: '只收现场确实成熟的一畦，不把试苗当作收成。' };

  if (world.tick % 6 === 2) {
    const recruit = villageNeeds.find((option) => option.action === 'RECRUIT_SETTLER');
    if (recruit) return { ...recruit, chosenAction: recruit.action, innerMonologue: '此人具仙缘且愿入门，依规发放安置资粮。' };
  }

  const plantings = seeds.filter(({ seedMove }) => seedMove === 'plant');
  if (plantings.length === 1) return { chosenAction: 'SEED_CULTURE', seedMove: 'plant',
    targetSeedLotId: plantings[0].targetSeedLotId, innerMonologue: '已留原读数，按实有余量与现场条件落种。' };
  if (plantings.length === 0) {
    const trials = seeds.filter((choice) => choice.seedMove === 'test' && world.seedCulture.lots.some(({ id, tests }) =>
      id === choice.targetSeedLotId && tests.length === 0));
    if (trials.length === 1) return { chosenAction: 'SEED_CULTURE', seedMove: 'test',
      targetSeedLotId: trials[0].targetSeedLotId, innerMonologue: '拿自存这批种料实试，先留下原读数。' };
  }

  if (cultivator.technique.id && !cultivator.guardAssignment && world.tick >= 12 && world.tick % 4 === 3) {
    const editions = availableScriptureActions(cultivator, world);
    const improve = editions.find(({ editionMove }) => editionMove === 'compare');
    const adoption = editions.find(({ editionMove, targetScriptureEditionId }) => {
      if (editionMove !== 'adopt') return false;
      const kind = world.scriptures.editions.find(({ id }) => id === targetScriptureEditionId)?.kind;
      if (kind === 'corrected') return cultivator.activeEdition?.kind !== 'corrected';
      if (kind === 'gloss') return !cultivator.activeEdition && cultivator.personality !== '嗜血';
      return !cultivator.activeEdition && (cultivator.personality === '狂傲' || cultivator.personality === '逍遥');
    });
    const revert = cultivator.activeEdition?.kind === 'misread' && cultivator.personality === '苟道'
      ? editions.find(({ editionMove }) => editionMove === 'revert') : undefined;
    const choice = improve ?? adoption ?? revert ?? editions.find(({ editionMove }) => editionMove === 'annotate');
    if (choice) return { ...choice, chosenAction: 'SCRIPTURE', innerMonologue: '经义须以原本核证，异读不可混同。' };
  }

  const renewal=utilityNorthGateRenewalDecision(cultivator,world);
  if(renewal)return renewal;
  // A possessed body signs only via its own explicit next-month order.
  const charter=world.playerAvatar.possessedId===cultivator.id&&(world.playerAvatar.possessionUntilTick??0)>world.tick ?
    undefined : utilityNorthMiningDecision(cultivator,world);
  if(charter)return charter.northMiningMove==='propose' ?
    {chosenAction:charter.action,northMiningMove:'propose',northMiningStance:charter.northMiningStance,
      innerMonologue:'到原井以现存实据和自己的职分提出采契，不替他人落笔。'} :
    {chosenAction:charter.action,northMiningMove:'sign',targetNorthMiningCharterId:charter.targetNorthMiningCharterId,
      innerMonologue:'只对这份原件以自己的实际职分落笔，不预报生效或行过新路。'};
  const oldWell=world.playerAvatar.possessedId===cultivator.id&&(world.playerAvatar.possessionUntilTick??0)>world.tick ?
    undefined : utilityNorthWellReviewDecision(cultivator,world);
  if(oldWell)return {chosenAction:oldWell.action,northWellReviewMove:oldWell.northWellReviewMove,
    targetNorthMiningCharterId:oldWell.targetNorthMiningCharterId,
    innerMonologue:oldWell.northWellReviewMove==='keep'?'按旧井原件和自己的实读保留现行规则，不声称已经复采。':
      '依据原址实读求一人一铲的限期许可，不改门法或既有地权。'};
  const upperPassage=cultivator.locationId===UPPER_PASSAGE_PATH[0]&&!holdsUpperPassageBody(world,cultivator)?
    utilityUpperPassageDecision(cultivator,world):undefined;
  if(upperPassage?.upperPassageMove==='enter')
    return upperPassageDecision(upperPassage,'凭实存资粮踏进自己所在门槛，未称抵达上界。');
  // Known local water work is weighed after actual harvest/planting, before elective relic hunting.
  const waterVein=utilityWaterVeinDecision(cultivator,world);
  if(waterVein)return {chosenAction:waterVein.action,waterVeinMove:waterVein.waterVeinMove,targetLocationId:waterVein.targetLocationId,
    innerMonologue:waterVein.waterVeinMove==='observe'?'到井边实看水尺，不猜井背后的事。':
      waterVein.waterVeinMove==='mine'?'只掘此处够取的一铲，不把空矿当收成。':'据已勘明的原井与地权，按实账行门。'};
  if (!cultivator.guardAssignment && world.tick >= 4 && world.tick % 4 === 1) {
    const relicChoices = availableRelicActions(cultivator, world);
    const relic = relicChoices.find(({ relicMove }) => relicMove === 'assemble') ?? relicChoices.find(({ relicMove }) => relicMove === 'recover');
    if (relic) return { ...relic, chosenAction: 'RELIC', innerMonologue: '只按手中真碎片和炉火补给行事。' };
  }
  const recollection = availableRecollectionActions(cultivator, world).find(({ recollectionMove }) =>
    recollectionMove === (cultivator.personality === '刚正' || cultivator.personality === '苟道' ? 'dismiss' : 'consider'));
  if (recollection) return { ...recollection, chosenAction: 'RECOLLECT', innerMonologue: '所感仅是虚实难辨的残响，不可当成真实旧事。' };

  if (!cultivator.guardAssignment &&
      (world.tick % 4 === 0 || world.relocations.plans.some(({ status }) => status === 'voting'))) {
    const moves = availableRelocationActions(cultivator, world);
    const vote = moves.find(({ relocationMove }) => relocationMove === (cultivator.personality === '狂傲' ? 'decline' : 'approve'));
    const proposal = world.tick % 4 === 0 ? moves.find(({ relocationMove }) => relocationMove === 'propose') : undefined;
    const move = vote ?? proposal;
    if (move) return { ...move, chosenAction: 'RELOCATE', innerMonologue: '宗门危势须核实，迁徙按议约和实际补给行事。' };
  }

  if(world.doctrineFoundings.foundings.length){
    const next=availableDoctrineMaturityActions(cultivator,world);
    const reticent=cultivator.personality==='诡诈'||cultivator.personality==='阴险';
    const choice=next.find(option=>option.doctrineMaturityMove==='finalize_merge')??
      (reticent?next.find(option=>option.doctrineMaturityMove==='decline_merge'):
        next.find(option=>option.doctrineMaturityMove==='accept_merge')??next.find(option=>option.doctrineMaturityMove==='approve_member'))??
      (!reticent?next.find(option=>option.doctrineMaturityMove==='offer_merge'):undefined);
    if(choice)return {...choice,chosenAction:choice.action,innerMonologue:'旧地确受困，仍要我方、对方和每个同门分别决定。'};
  }
  const founding=utilityDoctrineFoundingDecision(cultivator,world);
  if(founding)return founding;
  if (world.tick >= 13 && !cultivator.guardAssignment &&
      (world.tick % 4 === 0 || world.doctrines.proposals.some(({ status }) => status === 'pending'))) {
    const options = availableDoctrineActions(cultivator, world);
    const dissent = cultivator.personality === '诡诈' || (cultivator.personality === '苟道' && cultivator.hp < cultivator.maxHp * .7);
    const answer = options.find(({ doctrineMove }) => doctrineMove === (dissent ? 'decline' : 'accept'));
    const initiative = world.tick % 4 !== 0 ? undefined
      : options.find(({ doctrineMove }) => doctrineMove === 'endorse') ??
        options.find(({ doctrineMove }) => doctrineMove === 'fund_training') ??
        options.find(({ doctrineMove }) => doctrineMove === 'join') ??
        options.find(({ doctrineMove }) => doctrineMove === (cultivator.personality === '逍遥' || cultivator.personality === '狂傲'
          ? 'propose_separation' : 'propose_reconciliation')) ??
        options.find(({ doctrineMove }) => doctrineMove === 'propose_separation');
    const choice = answer ?? initiative;
    if (choice) return { ...choice, chosenAction: 'DOCTRINE', innerMonologue: '道统之议须凭公开证据，按双方约定行事。' };
  }

  const lastCallOath=dueOrdinaryOath(cultivator,world);
  if(lastCallOath)return lastCallOath;

  if (world.tick >= 5 && world.tick % 5 === 1 && !cultivator.guardAssignment) {
    const market = availableMarketActions(cultivator, world);
    const preferred = market.find((order) => order.action === 'PLACE_MARKET_SELL' &&
      order.marketGood === 'jade_leaf' && cultivator.herbs.jade_leaf >= 4) ??
      market.find((order) => order.action === 'PLACE_MARKET_BUY' && order.marketGood === 'jade_leaf' && cultivator.herbs.jade_leaf < 2);
    if (preferred) return { ...preferred, chosenAction: preferred.action, innerMonologue: '按坊市挂价与实际存货下单，等候成交。' };
    if (currentLocation?.type !== 'market' && cultivator.techniqueMastery >= 22 && cultivator.herbs.jade_leaf >= 4) {
      const nextMarket = world.locations.filter((site) => site.type === 'market' && !marketClosureReason(world, site.id))
        .sort((a, b) => Math.hypot(a.x - (currentLocation?.x ?? 0), a.y - (currentLocation?.y ?? 0)) -
          Math.hypot(b.x - (currentLocation?.x ?? 0), b.y - (currentLocation?.y ?? 0)) || a.id.localeCompare(b.id))[0];
      if (nextMarket) return { chosenAction: 'EXPLORE', targetLocationId: nextMarket.id, innerMonologue: '带上余裕灵草去坊市。' };
    }
  }

  const family = utilityCultivationClanDecision(cultivator, world);
  if (family) return family;
  const auction = utilityImmortalAuctionDecision(cultivator, world);
  if (auction) return auction;

  const mayOfferOath = world.tick >= 6 && world.tick % 9 === 4;
  const oaths = availableOathActions(cultivator, world, mayOfferOath);
  const obligation = oaths.find(({ action }) => action === 'FULFILL_OATH') ??
    oaths.find(({ action }) => action === 'APPEAL_OATH') ??
    oaths.find(({ action }) => action === (cultivator.personality === '诡诈' || cultivator.personality === '嗜血' ? 'DECLINE_OATH' : 'ACCEPT_OATH'));
  if (obligation) return { ...obligation, chosenAction: obligation.action, innerMonologue: '以本门库存和现有证据处置这份契约。' };
  if (mayOfferOath) {
    const offer = oaths.find(({ action }) => action === 'OFFER_OATH');
    if (offer) return { ...offer, chosenAction: offer.action, innerMonologue: '两宗可以订下明确交割与担保，不必空言。' };
  }

  const mayTeach = world.tick % 4 === 2 && !cultivator.guardAssignment;
  const learning = availableMentorshipActions(cultivator, world, mayTeach);
  const tuition = learning.find((option) => option.action === (cultivator.personality === '狂傲' ||
    (cultivator.personality === '苟道' && cultivator.hp < cultivator.maxHp * 0.75) ? 'DECLINE_TUITION' : 'ACCEPT_TUITION'));
  if (tuition) return { ...tuition, chosenAction: tuition.action, innerMonologue: tuition.action === 'ACCEPT_TUITION'
    ? '同门愿传授见解，我且请益。' : '功法须切合自身，今日先谢过师门。' };
  if (mayTeach) {
    const lesson = learning.find((option) => option.action === 'TEACH');
    if (lesson) return { ...lesson, chosenAction: lesson.action, innerMonologue: '此时正可推演经意，且请同门来听。' };
  }

  const pendingOccasion = availableOccasionJoins(cultivator, world)[0];
  if (pendingOccasion && !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * 0.65 &&
      (cultivator.personality !== '苟道' || world.occasions.find((item) => item.id === pendingOccasion.targetOccasionId)?.kind === 'tournament')) {
    return { ...pendingOccasion, chosenAction: 'JOIN_OCCASION', innerMonologue: '盛会机缘难得，我愿一试。' };
  }
  if (world.tick >= 9 && world.tick % 3 === 0) {
    const foreignOptions = availableDiplomacyActions(cultivator, world);
    const statecraft = foreignOptions.find((option) => option.action === 'OFFER_ALLIANCE') ??
      foreignOptions.find((option) => option.action === 'LAUNCH_SIEGE') ??
      foreignOptions.find((option) => option.action === 'DECLARE_WAR') ??
      foreignOptions.find((option) => option.action === 'DEMAND_TRIBUTE');
    if (statecraft) return { ...statecraft, chosenAction: statecraft.action, innerMonologue: '内外局势正在变化，且按宗门之利落定外议。' };
  }
  if (world.tick >= 4 && world.tick % 4 === 0 && !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * 0.65) {
    const hunt = availableBountyHunts(cultivator, world)[0];
    if (hunt) return { ...hunt, chosenAction: hunt.action, innerMonologue: '天机榜既立，我且循证查访，不可妄伤旁人。' };
  }
  const infrastructure = availableSectEconomyActions(cultivator, world);
  const guardDuty = infrastructure.find((item) => item.action === 'GUARD_DUTY');
  if (guardDuty && (cultivator.locationId !== cultivator.guardAssignment?.locationId || world.tick % 2 === 0)) {
    return { ...guardDuty, chosenAction: guardDuty.action, innerMonologue: '既领宗门之令，自当驻守灵脉。' };
  }
  if (world.tick >= 8 && world.tick % 8 === 0) {
    const guardOrBuild = infrastructure.find((item) => item.action === 'DISPATCH_GUARD') ??
      infrastructure.find((item) => item.action === 'BUILD_FACILITY' && item.facilityKind === 'defense_array') ??
      infrastructure.find((item) => item.action === 'BUILD_FACILITY');
    if (guardOrBuild) return { ...guardOrBuild, chosenAction: guardOrBuild.action, innerMonologue: '宗门欲久，须经营驻地、巡守灵脉。' };
  }

  if (world.tick % 4 === 0) {
    const politicalOptions = availableLeadershipActions(cultivator, world);
    const bid = (cultivator.personality === '阴险' || cultivator.personality === '诡诈')
      ? politicalOptions.find((item) => item.action === 'PLOT_COUP') ?? politicalOptions[0] : politicalOptions[0];
    if (bid) return { ...bid, chosenAction: bid.action, innerMonologue: '人心与道统皆有所归，掌门之位当有新的论断。' };
  }
  const ambush = availableAmbushTargets(cultivator, world)[0];
  if (ambush && cultivator.personality !== '苟道' && cultivator.combatPower >= ambush.combatPower * 0.7 && rng() < 0.5) {
    return {
      chosenAction: 'AMBUSH_TRIBULATION', targetCultivatorId: ambush.id,
      innerMonologue: `【${ambush.name}】正专心应劫，我若扰其气机，未必要正面斗法。`,
    };
  }
  const beastChoice = availableBeastTames(cultivator, world)[0];
  if (beastChoice && (cultivator.personality === '逍遥' || cultivator.personality === '刚正' || world.tick % 4 === 2)) {
    return { ...beastChoice, chosenAction: 'TAME_BEAST', innerMonologue: '且以灵草示意，不强迫它相从。' };
  }
  if (pavilionLoans.length && cultivator.hp >= cultivator.maxHp * .75 && !cultivator.guardAssignment) {
    const stage = (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 6;
    const shelving = pavilionLoans.filter(({ pavilionLoanMove }) => pavilionLoanMove === 'shelve');
    if (shelving.length === 1) return {
      chosenAction: 'PAVILION_LOAN', pavilionLoanMove: 'shelve', targetScriptureEditionId: shelving[0].targetScriptureEditionId,
      innerMonologue: '把已有真本校订册入架，不另抄一册。',
    };
    const checkout = pavilionLoans.filter((option) => option.pavilionLoanMove === 'checkout' &&
      !world.pavilionLoans.loans.some(({ borrowerId, editionId }) =>
        borrowerId === cultivator.id && editionId === option.targetScriptureEditionId));
    if (checkout.length === 1) return {
      chosenAction: 'PAVILION_LOAN', pavilionLoanMove: 'checkout', targetScriptureEditionId: checkout[0].targetScriptureEditionId,
      innerMonologue: '请实在值守的人当面出借，并记住须归原阁。',
    };
    if ((stage === 0 || stage === 3) && pavilionLoans.some(({ pavilionLoanMove }) => pavilionLoanMove === 'staff')) return {
      chosenAction: 'PAVILION_LOAN', pavilionLoanMove: 'staff', innerMonologue: '亲自在此值阁，借还不以本人名义替读者签。',
    };
  }

  if (mayAuthorTechnique(cultivator)) {
    return { chosenAction: 'AUTHOR_TECHNIQUE', innerMonologue: '历练已有所得，是时候将所悟写成自己的法诀。' };
  }
  const studyTarget = utilityStudyTarget(cultivator, world);
  if (studyTarget) {
    return { chosenAction: 'STUDY_TECHNIQUE', targetTechniqueId: studyTarget, innerMonologue: '此法合我灵根，且细细参详。' };
  }

  // Long plans survive tactical interruptions; only one step may run per month.
  const proposal = utilityScheme(cultivator, world);
  const plan = cultivator.activeScheme;
  if ((plan?.status === 'active' && world.tick - plan.startedTick < 24) ||
      (proposal && world.tick >= 6 && world.tick % 6 === 0)) {
    return {
      chosenAction: 'PURSUE_SCHEME',
      innerMonologue: plan?.status === 'active' ? `先办妥此事：${plan.steps[plan.stepIndex]?.label ?? plan.title}。` : '眼前得失不足虑，我要为来日作一番长远打算。',
      proposedScheme: proposal,
    };
  }

  if (!cultivator.guardAssignment && world.markets.shipments.some(({ status }) => status === 'in_transit')) {
    const offers = availableEscortActions(cultivator, world);
    const service = offers.find(({ escortMove }) => escortMove === 'report') ??
      offers.find(({ escortMove }) => escortMove === 'offer') ??
      offers.find(({ escortMove }) => escortMove === 'accept');
    if (service) return { ...service, chosenAction: 'ESCORT', innerMonologue: '实地查证与补给到位，才可议护送。' };
  }

  if (world.tick % 7 === 0) {
    const choices = availableArtifactActions(cultivator, world);
    const equipped = equippedArtifact(cultivator);
    const artifactAction = choices.find((item) => item.action === 'AWAKEN_ARTIFACT') ??
      (!equipped || (equipped.durability ?? 100) < 42 ? choices.find((item) => item.action === 'REPAIR_ARTIFACT') : undefined) ??
      choices.find((item) => item.action === 'BIND_ARTIFACT') ??
      [...choices].reverse().find((item) => item.action === 'FORGE_ARTIFACT');
    if (artifactAction) return { ...artifactAction, chosenAction: artifactAction.action, innerMonologue: '兵刃须磨砺温养，方能与我心神相合。' };
  }
  const path = utilityDaoPathDecision(cultivator, world);
  if (path) return path;
  const heavenly = utilityHeavenlyAlchemyDecision(cultivator, world);
  if (heavenly) return heavenly;
  if (world.tick % 5 === 0) {
    const option = alchemy.find((item) => item.action === 'USE_PILL' &&
      (item.targetPillId === 'heart_poison' || (cultivator.pillToxicity < 35 && cultivator.qiProgress < 78))) ??
      alchemy.find((item) => item.action === 'BREW_PILL') ??
      alchemy.find((item) => item.action === 'GATHER_HERBS');
    if (option) return { ...option, chosenAction: option.action, innerMonologue: '借灵材与丹火补我道途。' };
  }

  const auctionAmbush = currentAuctionAmbushOffer(cultivator, world);
  if (auctionAmbush) {
    const landing = exactAuctionAmbushDecision(auctionAmbushCommand(auctionAmbush), auctionAmbush);
    if (landing) return landing;
  }

  // 3. Check if an enemy is at the same location
  const edges = coLocatedOthers.length ? firstActorRelationships(world.relationships, cultivator.id) : undefined;
  const enemy = coLocatedOthers.find((other) => {
    if (activeCeasefireBetween(world, cultivator.sectId, other.sectId) || sanctuaryCanShield(world, cultivator, other)) return false;
    const edge = edges?.get(other.id);
    return edge && edge.affinity <= -50;
  });

  const painfulDuel = recallMemories(cultivator, world.tick).some(
    (m) => m.category === 'combat' && m.emotionalValence <= -4 && memoryStrength(m, world.tick) >= 4
  );
  const conflictDemon = cultivator.reflections.some(
    (entry) => entry.kind === 'heart_demon' && entry.theme === 'conflict' && entry.intensity >= 6
  );
  if (
    enemy &&
    cultivator.personality !== '苟道' &&
    cultivator.combatPower * strikeMultiplier(cultivator, enemy) * petCombatBonus(world, cultivator) >= enemy.combatPower * strikeMultiplier(enemy, cultivator) * petCombatBonus(world, enemy) * 0.85 &&
    rng() < Math.max(0, Math.min(1, (conflictDemon ? 0.18 : painfulDuel ? 0.3 : 0.65) + destinyDuelAppetite(cultivator, enemy)))
  ) {
    return {
      innerMonologue: personaLine(cultivator, 'thought'),
      chosenAction: 'DUEL',
      targetCultivatorId: enemy.id,
      spokenLine: personaLine(cultivator, 'combat_open'),
    };
  }

  // 4. Scheming personality or co-located with others
  if (
    (cultivator.personality === '阴险' || cultivator.personality === '诡诈') &&
    coLocatedOthers.length > 0 &&
    rng() < 0.4
  ) {
    const target = coLocatedOthers[Math.floor(rng() * coLocatedOthers.length)];
    return {
      innerMonologue: personaLine(cultivator, 'scheme'),
      chosenAction: 'SCHEMING',
      targetCultivatorId: target.id,
      rumorIntent: cultivator.rumors.some((item) => item.lead) ? 'EXAGGERATE' : 'FABRICATE',
      spokenLine: '道友近日气色不凡，莫非在秘境中得了什么逆天机缘？',
    };
  }

  if (world.caravanRestitution.lots.some((lot) => lot.siteId === cultivator.locationId &&
      (lot.status === 'buried' || lot.status === 'sealed' && (lot.finderId === cultivator.id || lot.sellerId === cultivator.id)))) {
    const recovery = availableCaravanRestitutionActions(cultivator, world);
    const handoff = recovery.find(({ restitutionMove }) => restitutionMove === 'return');
    const discovery = cultivator.hp >= cultivator.maxHp * .75 ? recovery.find(({ restitutionMove }) => restitutionMove === 'discover') : undefined;
    const action = handoff ?? discovery;
    if (action) return { ...action, chosenAction: action.action, innerMonologue: handoff ?
      '当面按封记交回原主保管，不重结原先买卖。' : '此地确有可寻封存遗货；找到后仍不擅取归己。' };
  }

  const opportunities = availableEncounters(cultivator, world);
  const encounter = opportunities[0];
  // On designated months, pursue a compatible interaction before generic small talk.
  if (encounter && world.tick % 3 === 1 && world.tick > 1) {
    return {
      chosenAction: encounter.action, targetCultivatorId: encounter.targetId,
      innerMonologue: '此地相逢正好，且与道友开诚布公谈一谈。',
    };
  }

  if (!cultivator.guardAssignment && world.tick >= 4 && world.tick % 4 === 0) {
    const seasonChoices = availableCompetitionActions(cultivator, world);
    const wantsWithdrawal = cultivator.hp < cultivator.maxHp * .66 && cultivator.personality === '苟道';
    const wantsRegistration = !competitionActorOptedOut(world, cultivator.id) && world.month <= 5 && cultivator.hp > cultivator.maxHp * .75 &&
      (cultivator.personality === '刚正' || cultivator.personality === '狂傲' || cultivator.personality === '逍遥');
    const move = seasonChoices.find(({ seasonMove }) => (seasonMove === 'withdraw' && wantsWithdrawal) ||
      (seasonMove === 'join' && wantsRegistration));
    if (move) return { ...move, chosenAction: 'RANK_SEASON', innerMonologue: '按己愿选择是否公开参评，不混入私事。' };
  }

  if (!cultivator.guardAssignment && world.tick >= 12 && world.tick % 9 === 5) {
    const choices = availableSanctuaryActions(cultivator, world);
    const action = choices.find(({ sanctuaryMove }) => sanctuaryMove === 'repair') ??
      choices.find(({ sanctuaryMove }) => sanctuaryMove === 'found');
    if (action) return { ...action, chosenAction: 'SANCTUARY', innerMonologue: '此处救济须凭实拨库银与查验护盾。' };
  }

  const mayProposeResearch = world.tick >= 18 && world.tick % 8 === 3;
  if (mayProposeResearch || world.research.projects.some((item) => item.sectId === cultivator.sectId && item.status === 'open')) {
    const options = availableResearchActions(cultivator, world);
    const research = options.find(({ researchMove }) => researchMove === 'withdraw') ??
      (cultivator.guardAssignment ? undefined : options.find(({ researchMove }) => researchMove === 'work') ??
        options.find(({ researchMove }) => researchMove === 'join') ??
        (mayProposeResearch ? options.find(({ researchMove }) => researchMove === 'propose') : undefined));
    if (research) return { ...research, chosenAction: 'RESEARCH', innerMonologue: '共研要用自己的实物和本月研习，先按章核证。' };
  }

  const mayOfferCredit = world.tick >= 26 && world.tick % 8 === 5;
  if (!cultivator.guardAssignment && world.sects.some(({ leaderId }) => leaderId === cultivator.id) &&
      (mayOfferCredit || world.credit.loans.some((loan) => loan.status === 'offered' || loan.status === 'active'))) {
    const options = availableSectCreditActions(cultivator, world);
    const move = options.find(({ creditMove }) => creditMove === 'repay') ??
      options.find(({ creditMove }) => creditMove === 'accept') ??
      (mayOfferCredit ? options.find(({ creditMove }) => creditMove === 'offer') : undefined);
    if (move) return { ...move, chosenAction: 'SECT_CREDIT', innerMonologue: '按实有宗库借还，不得将另项托管当作余额。' };
  }

  if (!cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .75) {
    const warning = utilityRouteWarning(cultivator, world);
    if (warning) return warning;
  }

  if (world.tick >= 30 && world.tick % 10 === 7 && !cultivator.guardAssignment &&
    (cultivator.personality === '逍遥' || cultivator.personality === '刚正')) {
    const vow = availablePilgrimageActions(cultivator, world).find(({ pilgrimageMove }) => pilgrimageMove === 'propose');
    if (vow) return { ...vow, chosenAction: 'PILGRIMAGE', innerMonologue: '请道友自择去留，只走我们都知晓的山路。' };
  }

  if (!cultivator.guardAssignment && world.tick >= 4 && world.tick % 3 !== 0 &&
      world.chronicleErrata.sources.some(({ locationId }) => locationId === cultivator.locationId)) {
    const retelling = pickChronicleReading(world, cultivator, availableChronicleErrataActions(cultivator, world));
    if (retelling) return { ...retelling, chosenAction: 'CHRONICLE_ERRATA', innerMonologue: '异闻只记一人之言，勘误须核对原始凭据。' };
  }

  if (world.tick >= 14 && world.tick % 6 === 2 && (cultivator.personality === '逍遥' || cultivator.personality === '刚正')) {
    const options = availableHabitatActions(cultivator, world);
    const care = options.find(({ habitatMove }) => habitatMove === 'release') ?? options.find(({ habitatMove }) => habitatMove === 'restore');
    if (care) return { ...care, chosenAction: 'HABITAT', innerMonologue: '按本地承载量恢复栖地，实物和兽籍都须有据。' };
  }

  const relaySect = world.sects.find((sect) => sect.id === cultivator.sectId && sect.headquartersId === cultivator.locationId &&
    sect.facilities.qi_array > 0);
  const mayOfferFormation = world.tick >= 20 && world.tick % 6 === 4 && relaySect?.leaderId === cultivator.id;
  if (relaySect && (mayOfferFormation || world.formations.links.some((link) =>
    (link.sectAId === relaySect.id || link.sectBId === relaySect.id) &&
    (link.status === 'offered' || link.status === 'active' || link.status === 'broken')))) {
    const options = availableFormationActions(cultivator, world, mayOfferFormation);
    const move = options.find(({ formationMove }) => formationMove === 'accept') ??
      (world.tick % 4 === 0 && relaySect.spiritStones >= 100 ? options.find(({ formationMove }) => formationMove === 'repair') : undefined) ??
      (world.tick % 5 === 4 && cultivator.qiProgress >= 55 ? options.find(({ formationMove }) => formationMove === 'dispatch') : undefined) ??
      (mayOfferFormation ? options.find(({ formationMove }) => formationMove === 'offer') : undefined);
    if (move) return { ...move, chosenAction: 'FORMATION_NETWORK', innerMonologue: '阵网只按实有灵气流转，守常规额，不自行超载。' };
  }

  const mayInviteGuardian = world.tick >= 24 && world.tick % 10 === 6 &&
    (cultivator.personality === '刚正' || cultivator.personality === '逍遥');
  if (mayInviteGuardian) {
    const move = availableGuardianActions(cultivator, world).find(({ guardianMove }) => guardianMove === 'offer');
    if (move) return { ...move, chosenAction: 'HOUSEHOLD_GUARDIAN', innerMonologue: '监护须两人自愿，不能据姓氏推断血亲或改变宗籍。' };
  }

  if (world.tick >= 24 && world.tick % 12 === 7 && (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const choices = availableCourierActions(cultivator, world);
    const letter = choices.find(({ courierMove, targetDispatchSourceId }) => courierMove === 'send' && !!targetDispatchSourceId) ??
      choices.find(({ courierMove, dispatchCue }) => courierMove === 'send' && dispatchCue === 'request_audience');
    if (letter) return { ...letter, chosenAction: 'SEALED_COURIER', innerMonologue: '按确定地址请可信使本人选择接不接，不追索收信人行踪。' };
  }

  const suitedToShift = cultivator.hp >= cultivator.maxHp * .8 && cultivator.personality !== '嗜血';
  const respondToShift = shiftChoices.find(({ shortShiftMove }) => shortShiftMove === (suitedToShift ? 'accept' : 'decline'));
  if (respondToShift) return { ...respondToShift, chosenAction: 'SHORT_SHIFT', innerMonologue: suitedToShift
    ? '我有余力值一班，按正式列出的条款自行应允。' : '此时不宜受聘，由我自行谢绝。' };
  if (cultivator.sectRank === '掌门' && world.tick >= 36 &&
      (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 31 === 7 &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥') &&
      Object.hasOwn(world.fieldObservatories.byActor, cultivator.id)) {
    const invitation = availableShortShiftActions(cultivator, world).find(({ shortShiftMove }) => shortShiftMove === 'offer');
    if (invitation) return { ...invitation, chosenAction: 'SHORT_SHIFT', innerMonologue: '只为已有实测的观象点请在场道友短聘，须本人同意。' };
  }

  if (cultivator.sectRank === '掌门' && world.tick >= 36 &&
      (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 29 === 11 &&
      world.cultivators.some((guard) => guard.alive && guard.sectId === cultivator.sectId &&
        guard.guardAssignment && guard.locationId === guard.guardAssignment.locationId)) {
    const offer = availableBoundaryReliefActions(cultivator, world).find(({ boundaryReliefMove }) => boundaryReliefMove === 'offer');
    if (offer) return { ...offer, chosenAction: offer.action, innerMonologue: '只请现有候任同门自行应允；守位实到才能移交。' };
  }

  if (world.tick >= 36 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 31 === 9 &&
      cultivator.techniqueMastery >= 55 && cultivator.technique.id &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const lesson = availableApprenticeCohortActions(cultivator, world).find(({ cohortMove }) => cohortMove === 'offer');
    if (lesson) return { ...lesson, chosenAction: lesson.action, innerMonologue: '以在场实习同本功法的修士邀一小班；各人自行应允。' };
  }

  if (willingTransfer && world.tick >= 24 && (world.tick+cultivator.id.charCodeAt(cultivator.id.length-1)) % 23 === 8) {
    const transfer = availableMentorTransferActions(cultivator,world);
    const offer = transfer.find(({mentorTransferMove})=>mentorTransferMove==='offer');
    if (offer) return toMentorTransferDecision(offer,'旧约已由本人结束，我只提出续学，由弟子自行决定。');
    const end = transfer.find(({mentorTransferMove})=>mentorTransferMove==='end');
    const former = end && world.cultivators.find(({id})=>id===end.targetOldMentorId);
    if (end && former && (!former.alive || former.sectId !== cultivator.sectId || former.service?.status === 'retired'))
      return toMentorTransferDecision(end,'旧师已不能按原约授业，我愿收束旧约；所学仍在。');
  }

  if (world.tick>=26&&(world.tick+cultivator.id.charCodeAt(cultivator.id.length-1))%31===3&&
      (cultivator.personality==='刚正'||cultivator.personality==='逍遥')&&
      world.households.members.some(({recruitedId,status})=>recruitedId===cultivator.id&&status==='recruited')) {
    const offer = availableSeasonalHousingActions(cultivator,world).find(({housingMove})=>housingMove==='offer');
    if (offer) return toHousingDecision(offer,'家户确有季节空房，只问这位相识道友是否愿借住。');
  }
  if (world.householdNames.entries.some(({ status }) => status === 'proposed')) {
    const village = world.settlements.villages.find(({ locationId }) => locationId === cultivator.locationId);
    if (village && world.householdNames.entries.some(({ status, settlementId, actorId }) =>
      status === 'proposed' && settlementId === village.id && actorId !== cultivator.id)) {
      const verification = availableHouseholdNameActions(cultivator, world).find(({ nameMove }) => nameMove === 'verify');
      if (verification) return { ...verification, chosenAction: verification.action,
        innerMonologue: '只核实眼前本人自愿登记的称名，不据同名猜身份或亲缘。' };
    }
  }
  if (world.tick >= 36 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 31 === 12 &&
      cultivator.id.startsWith('recruit-') && cultivator.hp >= cultivator.maxHp * .75 &&
      (cultivator.personality === '苟道' || cultivator.personality === '刚正' || cultivator.personality === '逍遥') &&
      !world.householdNames.entries.some(({ actorId, status }) => actorId === cultivator.id &&
        (status === 'proposed' || status === 'verified'))) {
    const offer = availableHouseholdNameActions(cultivator, world).find(({ nameMove }) => nameMove === 'offer');
    if (offer) return { ...offer, chosenAction: offer.action, innerMonologue: '愿自择一个本地称名，请真正在场的人复核。' };
  }

  const mayProposeSupply = world.tick >= 24 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 13 === 2;
  if (mayProposeSupply && willingVillageSupport &&
      world.settlements.villages.some(({ locationId }) => locationId === cultivator.locationId)) {
    const offers = availableVillageSupplyActions(cultivator, world).filter(({ villageSupplyMove }) => villageSupplyMove === 'offer');
    if (offers.length === 1) return {
      chosenAction: 'VILLAGE_SUPPLY', villageSupplyMove: 'offer', targetSettlementId: offers[0].targetSettlementId,
      innerMonologue: '只请已知邻村自己核实余缺；对方签前并无扣款或发货。',
    };
  }

  if (world.tick >= 36 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 37 === 14 &&
      cultivator.hp >= cultivator.maxHp * .75 &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const gifts = availableVillageGranaryActions(cultivator, world);
    const localBook = gifts.length ? projectVillageGranary(world, cultivator) : undefined;
    const giftRole = cultivator.id.charCodeAt(cultivator.id.length - 1) % 4;
    // Occasionally stock one resource, using only the on-site book, so genuinely complementary villages can emerge.
    const targeted = localBook && (localBook.roots > 0 && localBook.stones <= 4 ? 'donate_roots'
      : localBook.stones > 0 && localBook.roots <= 1 ? 'donate_stones'
      : localBook.roots === 0 && localBook.stones === 0 && giftRole === 0 ? 'donate_roots'
      : localBook.roots === 0 && localBook.stones === 0 && giftRole === 2 ? 'donate_stones' : undefined);
    const donation = gifts.find(({ granaryMove }) => granaryMove === targeted) ??
      gifts.find(({ granaryMove }) => granaryMove === 'donate') ??
      gifts.find(({ granaryMove }) => granaryMove === 'donate_roots') ??
      gifts.find(({ granaryMove }) => granaryMove === 'donate_stones');
    if (donation) return { chosenAction: donation.action, granaryMove: donation.granaryMove,
      targetSettlementId: donation.targetSettlementId, innerMonologue: '只把实际已有且义仓尚有空位的物资当面捐入。' };
  }

  if (civicAtVillage && world.tick >= 24 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 11 === 4 &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const deeds = availableCivicMemorialActions(cultivator, world).filter(({ civicMemorialMove }) => civicMemorialMove === 'propose');
    if (deeds.length === 1) return { chosenAction: 'CIVIC_MEMORIAL', civicMemorialMove: 'propose',
      targetCivicDeedId: deeds[0].targetCivicDeedId, innerMonologue: '只提请核验这份实事，待另有在场人亲自核实再记。' };
  }

  const fairInterest = !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .75 &&
    world.settlements.villages.some(({ locationId }) => locationId === cultivator.locationId);
  if (fairInterest) {
    const fair = availableVillageFairActions(cultivator, world);
    const booths = fair.filter(({ villageFairMove }) => villageFairMove === 'reserve');
    if (booths.length === 1) return { chosenAction: 'VILLAGE_FAIR', villageFairMove: 'reserve',
      targetVillageFairId: booths[0].targetVillageFairId, targetMarketOrderId: booths[0].targetMarketOrderId,
      innerMonologue: '用自己已经挂实货的单占一处，只付现场的摊费。' };
    if (booths.length === 0 && world.tick >= 16 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 17 === 5 &&
        (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
      const announcements = fair.filter(({ villageFairMove }) => villageFairMove === 'announce');
      if (announcements.length === 1) return { chosenAction: 'VILLAGE_FAIR', villageFairMove: 'announce',
        targetSettlementId: announcements[0].targetSettlementId,
        innerMonologue: '我在这里依实发出集期，只留现有摊位，不许人凭空备货。' };
    }
  }

  if (willingStipend && leadingAtStipendSite && world.tick >= 18 &&
      (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 11 === 7 &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const offers = availableSectStipendActions(cultivator, world).filter(({ stipendMove }) => stipendMove === 'offer');
    if (offers.length === 1) return { chosenAction: 'SECT_STIPEND', stipendMove: 'offer',
      targetInfirmaryCaseId: offers[0].targetInfirmaryCaseId, innerMonologue: '只依既有旧勤记录提请俸养，由对方本人选择。' };
  }

  if (wantSeedReserve) {
    const reserves = seeds.filter(({ seedMove }) => seedMove === 'reserve');
    if (reserves.length === 1) return { chosenAction: 'SEED_CULTURE', seedMove: 'reserve',
      targetLocationId: reserves[0].targetLocationId, innerMonologue: '从本人已有的翡翠灵叶中留种，单独计作种料。' };
  }

  if (willingFollowup && world.infirmaries.cases.some(({ patientId, status }) =>
      patientId === cultivator.id && status === 'treated')) {
    const followup = availableCareFollowupActions(cultivator, world).filter(({ careFollowupMove }) => careFollowupMove === 'schedule');
    if (followup.length === 1) return { chosenAction: 'CARE_FOLLOWUP', careFollowupMove: 'schedule',
      targetInfirmaryCaseId: followup[0].targetInfirmaryCaseId,
      innerMonologue: '按本人真实出诊回执预约复诊；并未占用本轮急诊。' };
  }

  if (pairStation === 'center' || pairStation === 'edge') {
    const station = pairStation === 'edge' ? 'edge' : undefined;
    const fund = availableObservatoryFundingActions(cultivator, world).find(({ observatoryStation }) => observatoryStation === station);
    if (fund) return { ...fund, chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '只为自己实地可及的测位备仪，不代人约定读数。' };
  }

  // Irreversible disposal is optional and never interrupts a scheduled duty.
  // Keep a usable alternative and leave even slightly repairable or distinctive gear alone.
  if (world.tick >= 16 && world.tick % 13 === 3 && !cultivator.guardAssignment &&
      cultivator.hp >= cultivator.maxHp * .75 && cultivator.artifacts.length > 1) {
    const equipped = equippedArtifact(cultivator);
    if (equipped) {
      const brokenBackups = new Set(cultivator.artifacts.flatMap((item, index) => item !== equipped &&
        (item.tier === undefined || item.tier === '法器') && durabilityOf(item) === 0 &&
        !item.boundTo && !item.soul && !item.relicSetId && !item.relicFragmentIds
        ? [artifactId(cultivator, item, index)] : []));
      if (brokenBackups.size) {
        const choices = availableArtifactSalvageActions(cultivator, world)
          .filter(({ targetArtifactId }) => brokenBackups.has(targetArtifactId));
        // Do not guess which of several expendable pieces the owner would part with.
        if (choices.length === 1) return {
          chosenAction: 'SALVAGE_ARTIFACT', targetArtifactId: choices[0].targetArtifactId, targetLocationId: choices[0].targetLocationId,
          innerMonologue: '尚有趁手兵刃，这件断尽的旧法器可在炉前拆解，能留多少全凭实物。',
        };
      }
    }
  }

  // Cold-start actors keep the original seeded fallback below (including its RNG order).
  if(world.danxiaMedicine.commitments.length||world.danxiaShortages.cases.some(row=>row.status==='open')){
    const menu=availableDanxiaMedicineActions(cultivator,world);
    const pending=menu.find(row=>row.danxiaMedicineMove==='receive')??menu.find(row=>row.danxiaMedicineMove==='recover')??
      menu.find(row=>row.danxiaMedicineMove==='brew')??menu.find(row=>row.danxiaMedicineMove==='accept');
    const initial=cultivator.personality==='刚正'||cultivator.personality==='逍遥'?
      menu.find(row=>row.danxiaMedicineMove==='offer_ship')??menu.find(row=>row.danxiaMedicineMove==='retain'):
      menu.find(row=>row.danxiaMedicineMove==='retain');
    const chosen=pending??initial;
    if(chosen)return {...chosen,chosenAction:chosen.action,innerMonologue:'只按实际持药、同意和位置处理；药到手也不表示已施治。'};
  }
  if(world.danxiaReviews.reviews.length){
    const options=availableDanxiaReviewActions(cultivator,world);
    const reply=cultivator.personality==='阴险'?
      options.find(row=>row.danxiaReviewMove==='decline'):options.find(row=>row.danxiaReviewMove==='accept');
    const request=options.find(row=>row.danxiaReviewMove==='propose_renew')??options.find(row=>row.danxiaReviewMove==='propose_switch');
    const refusal=options.find(row=>row.danxiaReviewMove==='refuse'&&world.danxiaReviews.reviews.some(review=>
      review.id===row.targetDanxiaReviewId&&review.source.outcome==='unfulfilled'));
    const chosen=reply??request??(cultivator.personality==='刚正'?refusal:undefined);
    if(chosen)return {...chosen,chosenAction:chosen.action,innerMonologue:'先查上次实际交付，再独自决定是否签新约。'};
  }
  if(activeAvatar(world)!==cultivator){
    const revisit=availableBattlefieldRevisits(world,cultivator,world.tick);
    const choice=revisit.find(row=>row.battlefieldRevisitMove==='seek')??revisit[0];
    const exact=choice&&exactBattlefieldRevisitDecision(battlefieldRevisitCommand(choice),revisit);
    if(exact)return exact;
  }
  const ordinary=utilityRankedOrdinaryDecision(cultivator,world);
  // Self-care can refine an independently chosen quiet month, never preempt work or urgent healing.
  if(ordinary?.chosenAction==='REST'&&activeAvatar(world)!==cultivator){
    const aftermath=activeHeartDemonAftermath(world,cultivator);
    if(aftermath&&world.tick>=aftermath.resolvedTick+3){
      const recovery=availableHeartDemonRecovery(world,cultivator);
      const settle=recovery&&exactHeartDemonRecoveryDecision(heartDemonRecoveryCommand(recovery),recovery);
      if(settle)return settle;
    }
  }
  if(ordinary)return ordinary;

  // 5. Socialize; trust in fellowship makes seeking a partner more attractive.
  const fellowship = cultivator.reflections.some(
    (entry) => entry.kind === 'belief' && entry.theme === 'community' && entry.intensity >= 6
  );
  if (coLocatedOthers.length > 0 && rng() < (fellowship ? 0.5 : 0.35)) {
    const naturalTarget=coLocatedOthers[Math.floor(rng()*coLocatedOthers.length)];
    const affected=voluntaryHeartDemonChoiceEffect(world,cultivator);
    // The fallback has its own real in-place peers. Do not treat a missing ranked shortlist as a refusal.
    const preferred=affected?preferredHeartDemonSocialTarget(world,cultivator,coLocatedOthers.map(other=>other.id)):undefined;
    const target=coLocatedOthers.find(other=>other.id===preferred)??naturalTarget;
    return {
      innerMonologue: `与【${target.name}】同处【${currentLocation?.name ?? '此地'}】，不若论道一番，互通有无。`,
      chosenAction: 'SOCIALIZE',
      targetCultivatorId: target.id,
      spokenLine: personaLine(cultivator, 'social_open'),
    };
  }

  // 6. Explore a richer spirit vein or secret realm occasionally
  const cultivationVow = cultivator.reflections.some(
    (entry) => entry.kind === 'obsession' && entry.theme === 'cultivation' && entry.intensity >= 6
  );
  if (rng() < (cultivationVow ? 0.12 : 0.28)) {
    const otherLocations = knownMapLocations(world, cultivator).filter(
      (l) => l.id !== cultivator.locationId
    );
    const leadId = knownRumorLead(cultivator, world);
    const resonance = currentLocation && cultivationMultiplier(cultivator, currentLocation) < 0.95
      ? otherLocations.slice().sort((a, b) => compareCultivationSites(cultivator, a, b))[0]
      : undefined;
    const dest =
      world.locations.find((item) => item.id === leadId) ?? resonance ??
      otherLocations[Math.floor(rng() * otherLocations.length)] ??
      currentLocation;
    if (!leadId && !resonance && world.locations.some((item) => !otherLocations.includes(item) && item.id !== cultivator.locationId) && rng() < 0.18) {
      return { chosenAction: 'EXPLORE', innerMonologue: '尚有未踏过的山野，不妨循陌路一探。' };
    }
    if (dest) {
      return {
        innerMonologue: leadId ? `传闻【${dest.name}】藏有机缘，真假未定，且亲自去查证。` : `久居一处难寻大机缘，听闻【${dest.name}】灵气充沛，不若御剑前往一探究竟。`,
        chosenAction: 'EXPLORE',
        targetLocationId: dest.id,
        spokenLine: `御剑乘风去，直指${dest.name}！`,
      };
    }
  }

  // 7. Default: Cultivate at current location
  return {
    innerMonologue: `【${currentLocation?.name ?? '洞府'}】灵气浓郁（${currentLocation?.spiritQi ?? 50}），正是潜心运转周天、锤炼修为的好时机。`,
    chosenAction: 'CULTIVATE',
  };
}

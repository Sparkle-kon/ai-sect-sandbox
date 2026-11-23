// Extracted from the native decision flow; evaluation order belongs to the enclosing Utility pipeline.
import { WorldState, Cultivator, LLMDecisionPayload } from '../../types/world';
import { dramaticBondReadVenue, matchesDramaticBondFact } from '../dramaticBondTerms';
import { type CultivationClanOption, availableCultivationClanActions } from '../cultivationClanEngine';
import { activeAvatar } from '../avatarEngine';
import { firstActorRelationships } from '../encounterEngine';
import { exactCultivationClanDecision, cultivationClanCommand } from '../cultivationClanCognition';
import { type ImmortalAuctionOption, availableImmortalAuctionActions, eligibleAuctionAmbush } from '../immortalAuctionEngine';
import { IMMORTAL_AUCTION_SITE, immortalAuctionOpening } from '../immortalAuctionTerms';
import { equippedArtifact } from '../artifactEngine';
import { exactImmortalAuctionDecision, immortalAuctionCommand } from '../immortalAuctionCognition';
import { activeCeasefireBetween } from '../ceasefireEngine';
import { sanctuaryCanShield, activeSanctuaryPass, availableSanctuaryActions } from '../sanctuaryEngine';
import { strikeMultiplier } from '../elementalEngine';
import { petCombatBonus } from '../spiritBeastEngine';
import { availableDaoPathActions } from '../daoPathEngine';
import { isTribulationActive, tribulationTarget, recommendedTribulationStance } from '../tribulationEngine';
import { forbiddenDuelForParticipant } from '../forbiddenArtEngine';
import { activeRoguelikeEncounter } from '../roguelikeEncounterEngine';
import { activeDestinyTraitOffer } from '../destinyTraitEngine';
import { activeSiegeForActor } from '../diplomacyEngine';
import { activeOccasionForActor } from '../occasionEngine';
import { activeDungeonForActor, availableDungeonMoves } from '../expeditionDungeonEngine';
import { activeRelocationForActor } from '../relocationEngine';
import { activeEscortForActor } from '../escortEngine';
import { activeCourierForActor, courierActedThisTick, availableCourierHandoffActions } from '../sealedCourierEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from '../danxiaMedicineTerms';
import { activePilgrimageForActor } from '../pilgrimageEngine';
import { boundaryReliefCheckpoint } from '../boundaryReliefCheckpoint';
import { disasterShelterCheckpoint } from '../disasterShelterCheckpoint';
import { expeditionRescueCheckpoint } from '../expeditionRescueCheckpoint';
import { sparringLocksActor } from '../sparringEngine';
import { mayAuthorTechnique } from '../techniqueEngine';
import { availableHeavenlyAlchemyActions } from '../heavenlyAlchemyEngine';
import { HEAVENLY_ALCHEMY_RECIPES } from '../heavenlyAlchemyTerms';
import { HEAVENLY_QUALITIES } from '../../types/heavenlyAlchemy';
import { autonomousExpeditionRescueOptions, voluntaryHeartDemonChoiceEffect } from '../heartDemonChoicePolicy';
import { availableOathActions } from '../oathEngine';
import { terrainTileAt, knownMapLocations } from '../terrainEngine';
import { weatherTravelFriction } from '../weatherEngine';
import { availableAlchemy } from '../alchemyEngine';
import { activeHeartDemon, isHeartDemonGuided, recommendHeartDemonChoice } from '../heartDemonEngine';
import { ascensionDutyActive } from '../ascensionPresence';
import { ascensionQuietWait } from '../ascensionCognition';
import { utilityMarketFreightDecision } from '../marketFreightCognition';
import { utilityDisasterShelterDecision } from '../disasterShelterCognition';
import { availableInfirmaryActions } from '../infirmaryEngine';
import { availableObservatoryActions, OBSERVATORY_COST, availableObservatoryFundingActions } from '../fieldObservatoryEngine';
import { availableShortShiftActions } from '../shortShiftEngine';
import { availableApprenticeCohortActions } from '../apprenticeCohortEngine';
import { availableMentorTransferActions } from '../mentorTransferEngine';
import { availableSectEconomyActions } from '../sectEconomyEngine';
import { heldFurnaceReservation } from '../furnaceReservationEngine';
import { effectiveWorkshopDeadline, effectiveWorkshopQuantity } from '../workshopCapacityTerms';
import { availableWorkshopActions } from '../workshopEngine';
import { availableSettlementActions } from '../settlementEngine';
import { hasOrdinaryIntentHistory, rankOrdinaryIntents, preferredOrdinarySocialIntent } from '../ordinaryIntentEngine';
import { availableRouteWarningActions } from '../routeWarningEngine';
import { availableToolLoanActions } from '../toolLoanEngine';
import { type UpperPassageOption, availableUpperPassageActions } from '../upperPassageEngine';
import { UPPER_PASSAGE_PATH } from '../upperPassageTerms';
import { type NorthGateRenewalOption, availableNorthGateRenewalActions } from '../northGateRenewalEngine';
import { availableUpperArrayFieldActions } from '../upperArrayFieldActions';
import { availableFrontierActions } from '../frontierActions';
import { utilityAscensionDecision, utilityExpeditionRescueDecision } from './decisionFactsEarly';
import { toMentorTransferDecision } from './decisionCommands';

export function sharedClanHistory(world: WorldState, actor: Cultivator, counterpartId: string, executionTick: number): boolean {
  const candidates = world.dramaticBonds?.facts.filter(row => (row.kind === 'practice' || row.kind === 'encounter') &&
    row.tick < executionTick && row.tick <= world.tick && row.siteId === actor.locationId && row.actorIds.includes(actor.id) && row.actorIds.includes(counterpartId));
  if (!candidates?.some(row => row.kind === 'practice')) return false;
  const dates = new Set<number>();
  let practiced = false;
  for (const fact of candidates) {
    if (candidates.filter(row => row.sourceEventId === fact.sourceEventId).length !== 1 || !dramaticBondReadVenue(world, fact)) continue;
    const retained = world.events.filter(event => event.id === fact.sourceEventId);
    if (retained.length > 1 || retained.length === 1 && !matchesDramaticBondFact(fact, retained[0])) continue;
    dates.add(fact.tick);
    practiced ||= fact.kind === 'practice';
    if (practiced && dates.size >= 2) return true;
  }
  return false;
}

/** Native eligibility is necessary but not a personality's agreement. Each body decides from present proof. */
export function availableAutonomousCultivationClanActions(actor: Cultivator, world: WorldState,
  executionTick = world.tick): readonly CultivationClanOption[] {
  if (!world.dramaticBonds?.facts.some(row => row.kind === 'practice' && row.actorIds.includes(actor.id)) ||
      activeAvatar(world) === actor || actor.guardAssignment || actor.hp < actor.maxHp * .8 ||
      actor.qiProgress >= 92 || daoPathTurnLocked(actor, world)) return [];
  const ownThreshold = actor.personality === '痴情' ? 72 : actor.personality === '刚正' ? 83 :
    actor.personality === '逍遥' ? 86 : actor.personality === '苟道' ? 92 : undefined;
  if (ownThreshold === undefined) return [];
  const native = availableCultivationClanActions(actor, world, executionTick);
  if (!native.length) return [];
  const edges = firstActorRelationships(world.relationships, actor.id);
  return native.filter(option => {
    if (option.clanMove === 'propose' && executionTick % 12 !== 0) return false;
    const pairing = option.clanMove === 'propose' ? undefined :
      world.cultivationClans?.unions.find(row => row.id === option.targetCultivationUnionId);
    const otherId = option.clanMove === 'propose' ? option.targetCultivatorId : pairing?.parents.find(id => id !== actor.id);
    if (!otherId || !sharedClanHistory(world, actor, otherId, executionTick)) return false;
    const edge = edges.get(otherId);
    if (!edge || edge.type === '血仇') return false;
    if (option.clanMove === 'refuse' || option.clanMove === 'family_refuse') return true;
    const family = option.clanMove === 'family_offer' || option.clanMove === 'family_accept';
    return edge.affinity >= ownThreshold + (family && actor.personality !== '痴情' ? 5 : 0);
  });
}

export function utilityCultivationClanDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const menu = availableAutonomousCultivationClanActions(actor, world);
  const order = ['family_accept', 'ceremony', 'accept', 'family_offer', 'ceremony_offer', 'propose', 'family_refuse', 'refuse'] as const;
  for (const move of order) {
    const option = menu.find(row => row.clanMove === move);
    if (option) return exactCultivationClanDecision(cultivationClanCommand(option), menu);
  }
  return undefined;
}

export const waitForOwnClanChoice = (): LLMDecisionPayload =>
  ({ chosenAction: 'REST', innerMonologue: '未作本月新的约定，在本人实到处稍候。' });

export function availableAutonomousImmortalAuctionActions(actor: Cultivator, world: WorldState,
  executionTick = world.tick): readonly ImmortalAuctionOption[] {
  if (actor.locationId !== IMMORTAL_AUCTION_SITE ||
      !immortalAuctionOpening(executionTick) && !world.immortalAuction?.lots.some(lot => !lot.terminal) ||
      activeAvatar(world) === actor || actor.guardAssignment ||
      actor.hp < actor.maxHp * .75 || actor.qiProgress >= 85 || daoPathTurnLocked(actor, world)) return [];
  const native = availableImmortalAuctionActions(actor, world, executionTick);
  if (!native.length) return [];
  const equipped = equippedArtifact(actor);
  return native.filter(option => {
    if (option.auctionMove === 'withdraw') return false; // Existing consignors may take the explicit player option.
    if (option.auctionMove === 'consign_artifact') {
      const item = actor.artifacts.find(row => row.id === option.targetAuctionArtifactId);
      return actor.artifacts.length >= 3 && item !== undefined && item !== equipped &&
        item.spiritRoot !== actor.spiritRoot && item.spiritRoot !== '天灵根';
    }
    if (option.auctionMove === 'consign_pill') return actor.pills[option.targetAuctionPillId] >= 2;
    if (option.auctionBidStones * 2 > actor.spiritStones) return false;
    const lot = world.immortalAuction?.lots.find(row => row.id === option.targetAuctionLotId);
    if (!lot) return false;
    if (lot.asset.kind === 'pill') {
      const pill = lot.asset.pillId;
      return actor.pills[pill] === 0 && (pill !== 'foundation' || actor.realm === '练气' || actor.realm === '筑基');
    }
    const tiers = ['法器', '灵器', '法宝', '通天灵宝'];
    const compatible = lot.asset.spiritRoot === actor.spiritRoot || lot.asset.spiritRoot === '天灵根';
    return (compatible || option.auctionBidStones * 3 <= actor.spiritStones) &&
      (!equipped || tiers.indexOf(lot.asset.tier) > tiers.indexOf(equipped.tier ?? '法器'));
  });
}

export function utilityImmortalAuctionDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const menu = availableAutonomousImmortalAuctionActions(actor, world);
  const choice = menu.filter(row => row.auctionMove === 'bid').sort((a, b) => a.auctionBidStones - b.auctionBidStones)[0] ?? menu[0];
  return choice ? exactImmortalAuctionDecision(immortalAuctionCommand(choice), menu) : undefined;
}

/** A preference is not a new combat action or permission to travel; native DUEL still resolves everything. */
export function currentAuctionAmbushOffer(actor: Cultivator, world: WorldState) {
  const offer = eligibleAuctionAmbush(world, actor);
  if (!offer || activeAvatar(world) === actor || actor.guardAssignment || actor.hp < actor.maxHp * .75 ||
      daoPathTurnLocked(actor, world)) return undefined;
  const buyer = world.cultivators.find(row => row.id === offer.targetCultivatorId);
  if (!buyer || activeCeasefireBetween(world, actor.sectId, buyer.sectId) || sanctuaryCanShield(world, actor, buyer) ||
      actor.combatPower * strikeMultiplier(actor, buyer) * petCombatBonus(world, actor) <
      buyer.combatPower * strikeMultiplier(buyer, actor) * petCombatBonus(world, buyer) * .85) return undefined;
  return offer;
}

export type DaoPathOption = ReturnType<typeof availableDaoPathActions>[number];
export const daoPathFields = ['chosenAction', 'daoPathMove', 'targetDaoPathId'] as const;
export const daoPathCommand = ({ daoPathMove, targetDaoPathId }: DaoPathOption) =>
  ({ chosenAction: 'DAO_PATH' as const, daoPathMove, targetDaoPathId });
export const daoPathSame = (a: ReturnType<typeof daoPathCommand>, b: Partial<LLMDecisionPayload>) =>
  a.chosenAction === b.chosenAction && a.daoPathMove === b.daoPathMove && a.targetDaoPathId === b.targetDaoPathId;
export const daoPathDecision = (option: DaoPathOption): LLMDecisionPayload => ({
  ...daoPathCommand(option), innerMonologue: {
    choose: '在亲到的地方定下自己的道途。',
    practice: '以实在的资粮勤修本门，不空称领悟。',
    ready: '先备一式，惟有后来确实交手才会显效。',
    cancel: '撤下预备的一式，不假称交手。',
  }[option.daoPathMove],
});

/** Provider JSON names exactly one native lane option, not outcomes, a new target, or prose. */
export function exactDaoPathDecision(input: unknown, options: readonly DaoPathOption[],
  allowInternalThought = false): LLMDecisionPayload | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Partial<LLMDecisionPayload>;
  if (record.chosenAction !== 'DAO_PATH' || !daoPathFields.every(key => Object.hasOwn(record, key)) ||
      Object.keys(record).some(key => key !== 'chosenAction' && key !== 'daoPathMove' && key !== 'targetDaoPathId' &&
        !(allowInternalThought && key === 'innerMonologue'))) return undefined;
  const option = options.find(row => daoPathSame(daoPathCommand(row), record));
  return option ? daoPathDecision(option) : undefined;
}

/** Existing movements and mandatory native/offline commitments always take the actor's month. */
export function daoPathTurnLocked(actor: Cultivator, world: WorldState): boolean {
  return !actor.alive || actor.hp <= 0 || actor.positionPlane !== undefined || !world.cultivators.includes(actor) ||
    isTribulationActive(actor) || Boolean(forbiddenDuelForParticipant(world, actor) || activeRoguelikeEncounter(world, actor) ||
      activeDestinyTraitOffer(world, actor) || activeSiegeForActor(world, actor) || activeOccasionForActor(world, actor) ||
      activeDungeonForActor(world, actor) || activeRelocationForActor(world, actor) || activeEscortForActor(world, actor) ||
      activeCourierForActor(world, actor) || courierActedThisTick(world, actor) ||
      activeDanxiaMedicineEscort(world, actor) || danxiaMedicineActedThisTick(world, actor) ||
      activePilgrimageForActor(world, actor) || boundaryReliefCheckpoint(world, actor) ||
      disasterShelterCheckpoint(world, actor) || expeditionRescueCheckpoint(world, actor) ||
      sparringLocksActor(world, actor) || requiredBeforeOrdinaryDecision(actor, world));
}

export function daoPathEligiblePreference(actor: Cultivator, world: WorldState, pathId: DaoPathOption['targetDaoPathId']): boolean {
  if (pathId === 'sword') return actor.spiritRoot === '金' || actor.spiritRoot === '雷';
  if (pathId === 'alchemy') return actor.spiritRoot === '火' && world.sects.some(sect =>
    sect.id === actor.sectId && sect.headquartersId === actor.locationId && sect.facilities.alchemy_hall >= 2);
  if (pathId === 'formation') return (actor.spiritRoot === '土' || actor.spiritRoot === '水') && world.sects.some(sect =>
    sect.id === actor.sectId && sect.headquartersId === actor.locationId && sect.facilities.qi_array > 0);
  if (pathId === 'shadow') return actor.spiritRoot === '暗' && (actor.personality === '诡诈' || actor.personality === '阴险');
  return pathId === 'body' && actor.spiritRoot === '木' && actor.personality === '刚正';
}

export function availableAutonomousDaoPathActions(actor: Cultivator, world: WorldState,
  executionTick = world.tick): readonly DaoPathOption[] {
  // No new hobby during a wound, imminent breakthrough, assigned watch, or a player's attached turn.
  if ((!actor.daoPath && (executionTick < 12 || executionTick % 12 !== 0 || actor.techniqueMastery < 75 ||
        actor.spiritStones < 180 || mayAuthorTechnique(actor))) ||
      (actor.daoPath && executionTick % 6 !== 0) || actor.hp < actor.maxHp * .85 || actor.qiProgress >= 85 ||
      actor.guardAssignment || activeAvatar(world) === actor || daoPathTurnLocked(actor, world)) return [];
  const native = availableDaoPathActions(actor, world, executionTick);
  const edges = native.some(row => row.daoPathMove === 'ready') ? firstActorRelationships(world.relationships, actor.id) : undefined;
  const hostileHere = edges && world.cultivators.some(other =>
    other !== actor && other.alive && other.hp > 0 && other.positionPlane === undefined && other.locationId === actor.locationId &&
    (edges.get(other.id)?.affinity ?? 0) <= -50 && !activeCeasefireBetween(world, actor.sectId, other.sectId) &&
    !sanctuaryCanShield(world, actor, other));
  return native.filter(row => row.daoPathMove === 'practice' || row.daoPathMove === 'ready' && hostileHere ||
    row.daoPathMove === 'choose' && daoPathEligiblePreference(actor, world, row.targetDaoPathId));
}

export function utilityDaoPathDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const options = availableAutonomousDaoPathActions(actor, world);
  const pick = options.find(row => row.daoPathMove === 'ready') ?? options[0];
  return pick ? daoPathDecision(pick) : undefined;
}

export type HeavenlyOption = ReturnType<typeof availableHeavenlyAlchemyActions>[number];
export const heavenlyAction = (row: HeavenlyOption) => ({
  chosenAction: 'HEAVENLY_ALCHEMY' as const,
  targetHeavenlyRecipeId: row.targetHeavenlyRecipeId,
  ...(row.heavenlyAlchemyMove === 'brew'
    ? { heavenlyAlchemyMove: row.heavenlyAlchemyMove, heavenlyAlchemyHeat: row.heavenlyAlchemyHeat }
    : { heavenlyAlchemyMove: row.heavenlyAlchemyMove, heavenlyAlchemyQuality: row.heavenlyAlchemyQuality }),
});
export const sameHeavenlyAction = (a: Pick<LLMDecisionPayload, 'chosenAction' | 'targetHeavenlyRecipeId' | 'heavenlyAlchemyMove' |
  'heavenlyAlchemyHeat' | 'heavenlyAlchemyQuality'>, b: typeof a) => a.chosenAction === b.chosenAction &&
  a.targetHeavenlyRecipeId === b.targetHeavenlyRecipeId && a.heavenlyAlchemyMove === b.heavenlyAlchemyMove &&
  a.heavenlyAlchemyHeat === b.heavenlyAlchemyHeat && a.heavenlyAlchemyQuality === b.heavenlyAlchemyQuality;
export const heavenlyDecision = (row: HeavenlyOption): LLMDecisionPayload => ({
  ...heavenlyAction(row), innerMonologue: row.heavenlyAlchemyMove === 'brew'
    ? '依实际炉位和本人灵材择定炉火，成色不由口说。' : '只炼化本人实际待用的原丹。',
});

/** No forecast, numerical effect, actor or model-authored prose is part of this command. */
export function exactHeavenlyAlchemyDecision(input: unknown, options: readonly HeavenlyOption[],
  allowAuthoredThought = false): LLMDecisionPayload | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const data = input as Partial<LLMDecisionPayload>;
  if (data.chosenAction !== 'HEAVENLY_ALCHEMY' || (data.heavenlyAlchemyMove !== 'brew' && data.heavenlyAlchemyMove !== 'take')) return undefined;
  const keys = ['chosenAction', 'heavenlyAlchemyMove', 'targetHeavenlyRecipeId',
    data.heavenlyAlchemyMove === 'brew' ? 'heavenlyAlchemyHeat' : 'heavenlyAlchemyQuality'];
  if (keys.some(key => !Object.hasOwn(data, key)) ||
      Object.keys(data).some(key => !keys.includes(key) && !(allowAuthoredThought && key === 'innerMonologue'))) return undefined;
  const selected = options.find(row => sameHeavenlyAction(heavenlyAction(row), data as LLMDecisionPayload));
  return selected ? heavenlyDecision(selected) : undefined;
}

export function availableAutonomousHeavenlyAlchemyActions(actor: Cultivator, world: WorldState, executionTick = world.tick): readonly HeavenlyOption[] {
  const hasOwnDose = actor.heavenlyAlchemy?.attempts.some(row => row.quality && !row.use);
  const confident = executionTick % 5 === 0 && actor.techniqueMastery >= 65 && actor.spiritStones >= 240 &&
    (actor.spiritRoot === '火' || actor.heavenlyAlchemy?.attempts.some(row => row.quality));
  if ((!hasOwnDose && !confident) || actor.guardAssignment || actor.positionPlane !== undefined || actor.qiProgress >= 92 ||
      actor.hp < actor.maxHp * .45 || actor.pillToxicity >= 45 || activeAvatar(world) === actor ||
      activeOccasionForActor(world, actor) || activeSiegeForActor(world, actor) || activePilgrimageForActor(world, actor) ||
      boundaryReliefCheckpoint(world, actor) || disasterShelterCheckpoint(world, actor) ||
      requiredBeforeOrdinaryDecision(actor, world)) return [];
  const native = availableHeavenlyAlchemyActions(actor, world, executionTick);
  const take = native.filter(row => row.heavenlyAlchemyMove === 'take' &&
    (row.targetHeavenlyRecipeId === 'nine_turn_golden' ? actor.hp < actor.maxHp * .75 && actor.qiProgress < 74 :
      actor.qiProgress >= 78 && !!tribulationTarget(actor)));
  if (take.length) return take;
  if (!confident || hasOwnDose || actor.hp < actor.maxHp * .8 || mayAuthorTechnique(actor)) return [];
  return native.filter(option => {
    if (option.heavenlyAlchemyMove !== 'brew') return false;
    const recipe = HEAVENLY_ALCHEMY_RECIPES[option.targetHeavenlyRecipeId];
    return actor.spiritStones >= recipe.stones * 2 &&
      Object.entries(recipe.herbs).every(([herb, amount]) => actor.herbs[herb as keyof typeof actor.herbs] >= amount * 2);
  });
}

export function utilityHeavenlyAlchemyDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const options = availableAutonomousHeavenlyAlchemyActions(actor, world, world.tick);
  const selected = [...options].filter(row => row.heavenlyAlchemyMove === 'take').sort((a, b) =>
    HEAVENLY_QUALITIES.indexOf(b.heavenlyAlchemyQuality!) - HEAVENLY_QUALITIES.indexOf(a.heavenlyAlchemyQuality!))[0] ??
    options.find(option => option.heavenlyAlchemyMove === 'brew' && option.heavenlyAlchemyHeat === 'calm');
  return selected ? heavenlyDecision(selected) : undefined;
}

export type DungeonOption = ReturnType<typeof availableDungeonMoves>[number];
export const dungeonFields = ['chosenAction', 'targetOccasionId', 'targetDungeonRoomId', 'dungeonMove'] as const;
export const dungeonAction = (row: DungeonOption) => ({
  chosenAction: 'EXPEDITION_DUNGEON' as const,
  targetOccasionId: row.targetOccasionId, targetDungeonRoomId: row.targetDungeonRoomId, dungeonMove: row.dungeonMove,
});
export const dungeonDecision = (row: DungeonOption): LLMDecisionPayload => ({
  ...dungeonAction(row), innerMonologue: '只按实际所在的秘境房间行事。',
});
export const sameDungeon = (a: Pick<LLMDecisionPayload, typeof dungeonFields[number]>, b: typeof a) =>
  dungeonFields.every(field => a[field] === b[field]);

/** Exactly the supplied native option, never a caller's prose or asserted effect. */
export function exactDungeonDecision(input: unknown, native: readonly DungeonOption[], allowAuthoredThought = false): LLMDecisionPayload | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      dungeonFields.some(field => !Object.hasOwn(input, field)) ||
      Object.keys(input).some(field => !(dungeonFields as readonly string[]).includes(field) &&
        !(allowAuthoredThought && field === 'innerMonologue'))) return undefined;
  const compared = input as LLMDecisionPayload;
  const matched = native.find(option => sameDungeon(dungeonAction(option), compared));
  return matched ? dungeonDecision(matched) : undefined;
}

export function dungeonDecisionOccasion(actor: Cultivator, world: WorldState, executionTick = world.tick) {
  const member = activeDungeonForActor(world, actor);
  if (member) return world.occasions.filter(row => row.id === member.id).length === 1 ? member : undefined;
  // Once a real explorer explicitly opens a chamber, an independently admitted peer may join.
  // Without that existing native group, abstention preserves the old expedition path exactly.
  const occasion = activeOccasionForActor(world, actor);
  return occasion?.dungeon && occasion.dungeon.closedTick === undefined && occasion.dungeon.room === 'garden' &&
    availableDungeonMoves(world, actor, executionTick).some(option => option.targetOccasionId === occasion.id &&
      option.dungeonMove === 'enter') ? occasion : undefined;
}

export function availableDungeonModelOptions(actor: Cultivator, world: WorldState, executionTick: number): readonly DungeonOption[] {
  if (executionTick !== world.tick + 1) return [];
  const occasion = dungeonDecisionOccasion(actor, world, executionTick);
  if (!occasion || activeAvatar(world) === actor || autonomousExpeditionRescueOptions(actor,world,executionTick).length) return [];
  return availableDungeonMoves(world, actor, executionTick).filter(option => option.targetOccasionId === occasion.id);
}

export function utilityDungeonDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const occasion = dungeonDecisionOccasion(actor, world);
  if (!occasion) return undefined;
  const native = availableDungeonMoves(world, actor).filter(option => option.targetOccasionId === occasion.id);
  const dangerous = actor.hp < actor.maxHp * .45;
  const urgent = occasion.expiresTick <= world.tick + 1;
  const recovered = occasion.dungeon?.steps.some(row => row.move === 'claim');
  const retreat = native.find(row => row.dungeonMove === 'retreat');
  const claim = native.find(row => row.dungeonMove === 'claim');
  const option = (dangerous ? retreat : undefined) ?? claim ?? (urgent || recovered ? retreat : undefined) ??
    native.find(row => row.dungeonMove !== 'retreat');
  return option && !(option.dungeonMove === 'enter' && (dangerous || urgent)) ? dungeonDecision(option) : undefined;
}

/** Exact last allowed turn of a funded, already accepted agreement, not an invitation. */
export function dueOrdinaryOath(actor:Cultivator,world:WorldState):LLMDecisionPayload|undefined{
  if(!world.oaths.contracts.some(row=>row.providerId===actor.id&&row.status==='active'&&
      row.settledTick===undefined&&row.deadlineTick===world.tick+1))return undefined;
  const option=availableOathActions(actor,world,false).find(choice=>choice.action==='FULFILL_OATH'&&
    world.oaths.contracts.some(row=>row.id===choice.targetOathId&&row.providerId===actor.id&&
      row.status==='active'&&row.deadlineTick===world.tick+1));
  return option?{...option,chosenAction:option.action,innerMonologue:'此为己方已正式签定的最后履约机会，只按在场与实物结算。'}:undefined;
}

export function urgentOrdinaryRefuge(actor:Cultivator,world:WorldState):LLMDecisionPayload|undefined{
  if(actor.guardAssignment||!world.mapHazards.length)return undefined;
  const location=world.locations.find(row=>row.id===actor.locationId);
  const tile=location&&terrainTileAt(world,location.x,location.y);
  if(!location||!tile||!world.mapHazards.some(row=>row.tileId===tile.id&&row.createdTick<=world.tick&&
      row.expiresTick>world.tick&&row.kind!=='meteor'))return undefined;
  const refuge=knownMapLocations(world,actor).filter(site=>site.id!==actor.locationId&&
    terrainTileAt(world,site.x,site.y)?.id!==tile.id)
    .sort((a,b)=>Math.hypot(a.x-location.x,a.y-location.y)*(1+weatherTravelFriction(world,location,a))-
      Math.hypot(b.x-location.x,b.y-location.y)*(1+weatherTravelFriction(world,location,b)))[0];
  return refuge?{chosenAction:'EXPLORE',targetLocationId:refuge.id,innerMonologue:'此处异象未散，不宜久留，先避往已知落脚地。'}:undefined;
}

export function urgentOrdinaryRecovery(actor:Cultivator,world:WorldState,alchemy?:ReturnType<typeof availableAlchemy>):LLMDecisionPayload|undefined{
  if(actor.hp>=actor.maxHp*.45)return undefined;
  if(!actor.guardAssignment&&world.sanctuary.charters.some(({status})=>status==='active')){
    const held=activeSanctuaryPass(world,actor);
    const charter=held&&world.sanctuary.charters.find(({id})=>id===held.charterId);
    if(charter&&charter.shieldHp>0&&charter.siteId!==actor.locationId&&knownMapLocations(world,actor).some(({id})=>id===charter.siteId))
      return {chosenAction:'EXPLORE',targetLocationId:charter.siteId,innerMonologue:'依所领敕令亲自前往已知避难所。'};
    const pass=availableSanctuaryActions(actor,world).find(({sanctuaryMove})=>sanctuaryMove==='take_pass');
    if(pass)return {...pass,chosenAction:'SANCTUARY',innerMonologue:'暂避斗法，按规领一张限期敕令。'};
  }
  const healing=(alchemy??availableAlchemy(actor,world)).find(option=>option.action==='USE_PILL'&&option.targetPillId==='golden');
  if(healing&&actor.pillToxicity<45)return {...healing,chosenAction:healing.action,innerMonologue:'伤势不可久拖，先炼化金丹。'};
  return {chosenAction:'REST',innerMonologue:`气血亏空（HP ${actor.hp}/${actor.maxHp}），此时不宜强行动手，当务之急是吐纳调息恢复伤势。`,
    spokenLine:'且慢动手，待某调息片刻！'};
}

export const holdsCivicAppendAvatar=(actor:Cultivator,world:WorldState,tick:number)=>
  world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>tick;

export function usesHeartDemonTheatre(actor: Cultivator): boolean {
  const trial = actor.tribulation;
  return trial?.stage === 'heart_demon' && (trial.heartTheatreArmed === true || trial.heartDemon !== undefined);
}

export function utilityHeartDemonDecision(world: WorldState, actor: Cultivator): LLMDecisionPayload | undefined {
  if (!usesHeartDemonTheatre(actor)) return undefined;
  const frame = activeHeartDemon(world, actor);
  if (!frame || frame.queued || isHeartDemonGuided(world, actor, frame)) {
    // A waiting player or queued order has no Utility choice. The native resolver owns that branch.
    return { chosenAction: 'FACE_TRIBULATION', innerMonologue: '道心未定，只守眼下这一关。' };
  }
  return { chosenAction: 'FACE_TRIBULATION', targetHeartTrialId: actor.tribulation!.id,
    heartDemonChoice: recommendHeartDemonChoice(world, actor, frame), innerMonologue: '幻象不可作实，只依此心抉择。' };
}

/**
 * Narrow live execution guard for a provider-chosen ordinary fallback only.
 * It does not run the full Utility tree or consume RNG, and must never override an actual sanctioned avatar order.
 */
export function requiredBeforeOrdinaryDecision(actor:Cultivator,world:WorldState,skipVoluntaryRescue=false):LLMDecisionPayload|undefined{
  if(actor.positionPlane!==undefined)return undefined;
  if(ascensionDutyActive(world,actor))return utilityAscensionDecision(actor,world)??ascensionQuietWait();
  if(!actor.alive||actor.hp<=0||!world.cultivators.includes(actor)||activeRelocationForActor(world,actor)||
      activeEscortForActor(world,actor)||activeCourierForActor(world,actor)||courierActedThisTick(world,actor)||
      activePilgrimageForActor(world,actor)||boundaryReliefCheckpoint(world,actor))return undefined;
  if(isTribulationActive(actor)){
    const heart = utilityHeartDemonDecision(world, actor);
    if (heart) return heart;
    const tribulationStance=recommendedTribulationStance(actor);
    return {chosenAction:'FACE_TRIBULATION',tribulationStance,innerMonologue:'雷劫已实际临身，先应付眼下的关口。'};
  }
  const rescue=utilityExpeditionRescueDecision(actor,world);
  if(rescue&&!(skipVoluntaryRescue&&rescue.chosenAction==='EXPEDITION_RESCUE'&&rescue.rescueMove==='accept'))return rescue;
  const freight=utilityMarketFreightDecision(actor,world);
  if(freight)return freight;
  const shelter=utilityDisasterShelterDecision(actor,world,false);
  if(shelter)return shelter;
  const refuge=urgentOrdinaryRefuge(actor,world);
  if(refuge)return refuge;

  const clinic=world.sects.find(row=>row.id===actor.sectId&&row.headquartersId===actor.locationId&&row.facilities.alchemy_hall>0);
  if(clinic&&actor.hp<=actor.maxHp*.70&&world.infirmaries.cases.some(row=>row.patientId===actor.id&&row.status==='waiting')){
    const own=availableInfirmaryActions(actor,world);
    const priority=own.find(row=>row.infirmaryMove==='accept_handoff')??own.find(row=>row.infirmaryMove==='accept');
    if(priority)return {chosenAction:'INFIRMARY',infirmaryMove:priority.infirmaryMove,targetInfirmaryCaseId:priority.targetInfirmaryCaseId,
      innerMonologue:'当值人、实物和空床均已核验，先处理本人已在等候的救治。'};
  }

  const immediate=urgentOrdinaryRecovery(actor,world);
  if(immediate)return immediate;

  const fundedMeasure=Object.hasOwn(world.fieldObservatories.byActor,actor.id)?
    availableObservatoryActions(actor,world).find(row=>row.observatoryMove==='measure'):undefined;
  if(fundedMeasure)return {...fundedMeasure,chosenAction:fundedMeasure.action,innerMonologue:'本人的实测已出资并到期，先照约履行。'};
  if(world.shortShifts.shifts.some(row=>row.workerId===actor.id&&row.status==='active'&&row.shiftTick===world.tick)){
    const shift=availableShortShiftActions(actor,world).find(row=>row.shortShiftMove==='work');
    if(shift)return {...shift,chosenAction:shift.action,innerMonologue:'按已应允的短聘实到。'};
  }
  if(world.apprenticeCohorts.cohorts.some(row=>row.status==='offered'&&row.lessonTick===world.tick&&
    (row.mentorId===actor.id||row.seats.some(seat=>seat.studentId===actor.id&&seat.status==='accepted')))){
    const lesson=availableApprenticeCohortActions(actor,world).find(row=>row.cohortMove==='teach'||row.cohortMove==='attend');
    if(lesson)return {...lesson,chosenAction:lesson.action,innerMonologue:'已签定本期同堂，先照约实到。'};
  }
  if(world.mentorTransfers.transfers.some(row=>row.status==='accepted'&&row.periodTick===world.tick&&
    (row.studentId===actor.id||row.newMentorId===actor.id))){
    const lesson=availableMentorTransferActions(actor,world).find(row=>row.mentorTransferMove==='teach'||row.mentorTransferMove==='attend');
    if(lesson)return toMentorTransferDecision(lesson,'已签定本期续学，先照约实到。');
  }
  const oath=dueOrdinaryOath(actor,world);
  if(oath)return oath;
  if(actor.guardAssignment){
    const duty=availableSectEconomyActions(actor,world).find(row=>row.action==='GUARD_DUTY');
    if(duty&&(actor.locationId!==actor.guardAssignment.locationId||world.tick%2===0))
      return {...duty,chosenAction:duty.action,innerMonologue:'驻守之约已生效，先履行本轮岗哨。'};
  }
  const held=heldFurnaceReservation(world,actor);
  const urgentOrder=world.workshops.orders.find(order=>order.status==='active'&&order.makerId===actor.id&&
    order.siteId===actor.locationId&&(order.id===held?.workshopOrderId||
      (effectiveWorkshopDeadline(order)??Infinity)-world.tick<=effectiveWorkshopQuantity(order)*2-order.work.length));
  if(urgentOrder){
    const work=preferredWorkshopWork(availableWorkshopActions(actor,world,false),urgentOrder.id);
    if(work)return {...work,chosenAction:work.action,innerMonologue:'已经收托并到实际工期，实地完成本轮可做工序。'};
  }
  if(!actor.guardAssignment&&world.settlements.villages.some(row=>row.locationId===actor.locationId&&
    row.lastDisasterTick!==undefined&&world.tick-row.lastDisasterTick<=2&&row.lastDisasterTick<=world.tick)){
    const relief=availableSettlementActions(actor,world).find(row=>row.action==='DELIVER_RELIEF');
    if(relief)return {...relief,chosenAction:relief.action,innerMonologue:'眼下真有近灾，也有本人实物，先依法救急。'};
  }
  return undefined;

}

/** Ranked ordinary actions only after this actor has actual prior ordinary evidence. */
export function utilityRankedOrdinaryDecision(actor:Cultivator,world:WorldState):LLMDecisionPayload|undefined{
  if(!hasOrdinaryIntentHistory(world,actor))return undefined;
  const ranked=rankOrdinaryIntents(world,actor);
  const baseline=ranked[0];
  const intent=baseline?.action==='SOCIALIZE'&&voluntaryHeartDemonChoiceEffect(world,actor)?
    preferredOrdinarySocialIntent(world,actor,world.tick,ranked)??baseline:baseline;
  if(!intent)return undefined;
  const innerMonologue='余事不急，按在场、实物、已知线索和自己近来所做的事权衡。';
  if(intent.action==='SOCIALIZE')return {chosenAction:intent.action,targetCultivatorId:intent.targetCultivatorId,innerMonologue};
  if(intent.action==='EXPLORE')return {chosenAction:intent.action,targetLocationId:intent.targetLocationId,innerMonologue};
  if(intent.action==='GATHER_HERBS')return {chosenAction:intent.action,targetHerbId:intent.targetHerbId,innerMonologue};
  return {chosenAction:intent.action,innerMonologue};
}

/**
 * Deterministic / Utility AI heuristic decision engine.
 * Used when LLM mode is disabled or as a reliable fallback.
 */
export function utilityRouteWarning(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  if (!world.routeWarnings.observations.length) return undefined;
  const options = availableRouteWarningActions(actor, world);
  const proof = options.find(({ routeWarningMove }) => routeWarningMove === 'corroborate') ??
    options.find(({ routeWarningMove }) => routeWarningMove === 'post');
  if (!proof) return undefined;
  return { chosenAction: 'ROUTE_WARNING', routeWarningMove: proof.routeWarningMove,
    targetRouteWarningId: proof.targetRouteWarningId, targetRouteObservationId: proof.targetRouteObservationId,
    innerMonologue: proof.routeWarningMove === 'corroborate'
      ? '各以一次确实走过的见闻核实，旧险未必仍在。'
      : '只写这趟路上确证的一段，后来者还须自行观察。' };
}

export function preferredWorkshopWork(options: ReturnType<typeof availableWorkshopActions>, orderId?: string) {
  const duties = options.filter(({ workshopMove, targetWorkshopId }) =>
    workshopMove === 'work' && (orderId === undefined || orderId === targetWorkshopId));
  const assisted = duties.filter(({ targetToolLoanId }) => targetToolLoanId !== undefined);
  return assisted.length === 1 ? assisted[0] : duties.find(({ targetToolLoanId }) => targetToolLoanId === undefined);
}

export function chooseLinkedToolConsent(actor: Cultivator, world: WorldState, work: ReturnType<typeof preferredWorkshopWork>): LLMDecisionPayload | undefined {
  if (!work?.targetWorkshopId || work.targetToolLoanId !== undefined || !world.toolLoans.loans.length ||
      actor.hp < actor.maxHp * .75 || actor.guardAssignment) return undefined;
  const order = world.workshops.orders.find(({ id }) => id === work.targetWorkshopId);
  if (!order || order.work.length % 2 !== 1) return undefined; // Never defer an unrelated job or its blank stage.
  const candidates = availableToolLoanActions(actor, world).filter((option) =>
    option.toolLoanMove === 'accept' && world.toolLoans.loans.some((loan) =>
      loan.id === option.targetToolLoanId && loan.workshopId === order.id));
  if (candidates.length !== 1 || !preferredWorkshopWork(availableWorkshopActions(actor, world, false, world.tick + 1), order.id)) return undefined;
  return { chosenAction: 'TOOL_LOAN', toolLoanMove: 'accept', targetToolLoanId: candidates[0].targetToolLoanId,
    innerMonologue: '这件委制尚有下一轮的工位许可，我愿先应允这份同单借具。' };
}

export const PAIRED_OBSERVATORY_INTERVAL = 23;
export const PAIRED_OBSERVATORY_DAY = 7;
/** Shared scarce observation day without reading another observer's measurement.
 * Only one center and one edge station can be volunteered at a public site on this day. */
export function pairedObservatoryStation(actor: Cultivator, world: WorldState): 'center' | 'edge' | 'wait' | undefined {
  if (world.tick < 29 || world.tick % PAIRED_OBSERVATORY_INTERVAL !== PAIRED_OBSERVATORY_DAY) return undefined;
  const participant = (person: Cultivator) => person.alive && person.hp >= person.maxHp * .75 && !person.guardAssignment &&
    person.locationId === actor.locationId && person.spiritStones >= OBSERVATORY_COST && (person.personality === '刚正' || person.personality === '逍遥' || person.personality === '苟道');
  const site = world.locations.find(({ id }) => id === actor.locationId);
  if (!site || (site.type !== 'market' && site.type !== 'sect_hq')) return undefined;
  let center: string | undefined;
  let edge: string | undefined;
  let opened = 0;
  for (const [actorId, { runs }] of Object.entries(world.fieldObservatories.byActor)) {
    // Only the dated actual reservation consumes the pair's quota. Compare no readings from these runs.
    const today = runs.find(({ locationId, openedTick }) => locationId === site.id && openedTick === world.tick);
    if (!today) continue;
    opened++;
    if (today.station?.kind === 'edge') edge = actorId; else center = actorId;
  }
  if (opened >= 2) return 'wait';
  const candidates = world.cultivators.filter(participant).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if (!center) center = candidates.find((person) => person.id !== edge &&
    availableObservatoryFundingActions(person, world).some(({ observatoryStation }) => observatoryStation === undefined))?.id;
  if (!edge) edge = candidates.find((person) => person.id !== center &&
    availableObservatoryFundingActions(person, world).some(({ observatoryStation }) => observatoryStation === 'edge'))?.id;
  if (!center || !edge) return opened ? 'wait' : undefined;
  return actor.id === center ? 'center' : actor.id === edge ? 'edge' : 'wait';
}

export function utilityCourierHandoffOffer(actor: Cultivator, world: WorldState, tick = world.tick): LLMDecisionPayload | undefined {
  const option = availableCourierHandoffActions(actor, world, tick).find(({ courierHandoffMove }) => courierHandoffMove === 'offer');
  return option ? { chosenAction: 'COURIER_HANDOFF', courierHandoffMove: 'offer', targetDispatchId: option.targetDispatchId,
    targetCourierId: option.targetCourierId, innerMonologue: '原封不动；只在实到的驿站问这位同行是否愿意接递。' } : undefined;
}

export function holdsUpperPassageBody(world:WorldState,actor:Cultivator):boolean {
  return world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>world.tick;
}
export const upperPassageRest=():LLMDecisionPayload=>({chosenAction:'REST',innerMonologue:'只在实到的界路停步，不在旧址另作事务。'});
export function upperPassageDecision(option:UpperPassageOption,innerMonologue:string):LLMDecisionPayload{
  return {chosenAction:option.action,upperPassageMove:option.upperPassageMove,
    targetUpperPassageNodeId:option.targetUpperPassageNodeId,innerMonologue};
}
export function availableUpperPassageProviderActions(actor:Cultivator,world:WorldState,executionTick:number){
  if(holdsUpperPassageBody(world,actor)||
    (actor.positionPlane===undefined&&actor.locationId!==UPPER_PASSAGE_PATH[0]))return [];
  return availableUpperPassageActions(actor,world,executionTick);
}
export function decodeUpperPassage(parsed:Partial<LLMDecisionPayload>,choices:readonly UpperPassageOption[],
  allowRest:boolean):LLMDecisionPayload|undefined{
  if(!parsed||typeof parsed!=='object')return undefined;
  if(parsed.chosenAction==='REST'&&allowRest&&Object.keys(parsed).every(field=>field==='chosenAction'||field==='innerMonologue'))
    return upperPassageRest();
  if(parsed.chosenAction!=='UPPER_PASSAGE'||Object.keys(parsed).some(field=>
    !['chosenAction','innerMonologue','upperPassageMove','targetUpperPassageNodeId'].includes(field)))return undefined;
  const selected=choices.find(row=>row.upperPassageMove===parsed.upperPassageMove&&
    row.targetUpperPassageNodeId===parsed.targetUpperPassageNodeId);
  if(!selected)return undefined;
  const line=(typeof parsed.innerMonologue==='string'&&parsed.innerMonologue.trim().slice(0,160))||
    '沿本人所在的实址与当轮许可行事，不猜界外。';
  return upperPassageDecision(selected,line);
}

export function northGateRenewalDecision(option:NorthGateRenewalOption,innerMonologue:string):LLMDecisionPayload{
  return {chosenAction:option.action,northGateRenewalMove:option.northGateRenewalMove,
    targetNorthGateRenewalId:option.targetNorthGateRenewalId,innerMonologue};
}
export function availableNorthGateRenewalProviderActions(actor:Cultivator,world:WorldState,tick:number):NorthGateRenewalOption[]{
  if(actor.positionPlane!==undefined||actor.locationId!==UPPER_PASSAGE_PATH[0]||
    (world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>tick))return [];
  return availableNorthGateRenewalActions(actor,world,tick);
}
/** Utility does not invent signatures or assume every local will intervene. Only an inclined sponsor may honor already-given consent. */
export function utilityNorthGateRenewalDecision(actor:Cultivator,world:WorldState):LLMDecisionPayload|undefined{
  if(actor.personality!=='刚正')return undefined;
  const exact=availableNorthGateRenewalProviderActions(actor,world,world.tick).find(option=>option.northGateRenewalMove==='accord');
  return exact?northGateRenewalDecision(exact,'乡席已亲自署明，只办当世合议可负担的阵事。'):undefined;
}
export function decodeNorthGateRenewal(parsed:Partial<LLMDecisionPayload>,choices:readonly NorthGateRenewalOption[]):LLMDecisionPayload|undefined{
  if(parsed.chosenAction!=='NORTH_GATE_RENEWAL'||Object.keys(parsed).some(field=>
    !['chosenAction','innerMonologue','northGateRenewalMove','targetNorthGateRenewalId'].includes(field)))return undefined;
  const selected=choices.find(row=>row.northGateRenewalMove===parsed.northGateRenewalMove&&
    row.targetNorthGateRenewalId===parsed.targetNorthGateRenewalId);
  if(!selected)return undefined;
  const line=(typeof parsed.innerMonologue==='string'&&parsed.innerMonologue.trim().slice(0,160))||
    '只以本月实在的身份与资粮作答，不替旁人落笔。';
  return northGateRenewalDecision(selected,line);
}

export function availableUpperArrayFieldProviderActions(actor:Cultivator,world:WorldState,tick=world.tick){
  return holdsUpperPassageBody(world,actor)?[]:availableUpperArrayFieldActions(actor,world,tick);
}

export function availableFrontierProviderActions(actor:Cultivator,world:WorldState,tick=world.tick){
  return holdsUpperPassageBody(world,actor)?[]:availableFrontierActions(actor,world,tick);
}

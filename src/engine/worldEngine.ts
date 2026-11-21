import { advanceSectCredit, resolveSectCreditAction } from './sectCreditEngine';
import { advanceSanctuaries, interceptSanctuaryDuel, resolveSanctuaryAction } from './sanctuaryEngine';
import { advanceResearch, resolveResearchAction } from './researchEngine';
import { advanceCeasefires, availableCeasefireActions, recordCeasefireHostility, resolveCeasefireAction } from './ceasefireEngine';
import { activeEscortForActor, resolveEscortAction } from './escortEngine';
import { advanceCompetitionSeasons, recordBreakthroughCompetition, recordReliefCompetition, resolveCompetitionAction } from './competitionEngine';
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
import { consumeAvatarOrder, maintainPlayerAvatar } from './avatarEngine';
import { archiveChronicleEvents } from './novelGenerator';
import { settleChronicleOffline } from './chronicleRuntime';
import { settleAnnualCouncilOffline } from './councilRuntime';
import {
  REALM_BASE_POWER,
  REALM_LIFESPAN,
  REALM_ORDER,
} from '../data/initialWorld';
import {
  Cultivator,
  LLMDecisionPayload,
  RelationType,
  WorldEvent,
  WorldState,
} from '../types/world';
import { computeHeuristicDecision, utilityCeasefireDecision } from './llmBrain';
import { maintainMemories, recordMemory } from './memoryEngine';
import { synthesizeReflections } from './reflectionEngine';
import { fabricateRumor, knownRumorLead, spreadRumors, witnessEvent } from './rumorEngine';
import { expireScheme, pursueScheme } from './schemeEngine';
import { scriptedDialogue } from './dialogueEngine';
import { resolveEncounter } from './encounterEngine';
import { cultivationMultiplier, strikeMultiplier } from './elementalEngine';
import { authorTechnique, dropInheritance, gainMastery, masteryMultiplier, studyTechnique } from './techniqueEngine';
import { maintainAlchemy, resolveAlchemy } from './alchemyEngine';
import { lootStorageRing, resolveArtifactAction, wearArtifact } from './artifactEngine';
import { interfereTribulation, isTribulationActive, recommendedTribulationStance, resolveTribulation, tribulationTarget, triggerTribulation } from './tribulationEngine';
import { maintainSectPolitics, resolveLeadershipAction, rewardContribution } from './sectPoliticsEngine';
import { maintainSectEconomy, mitigateSectArray, resolveSectEconomyAction, sectQiBonus } from './sectEconomyEngine';
import { activeSiegeForActor, advanceDiplomacy, resolveDiplomacyAction } from './diplomacyEngine';
import { activeOccasionForActor, advanceOccasions, joinOccasion } from './occasionEngine';
import { advanceBounties, pursueBounty, recordTransgression } from './bountyEngine';
import { knownMapLocations, noteTerrainVisit } from './terrainEngine';
import { deriveMapPresentation } from './mapMotionEngine';
import { advanceMapHazards } from './mapBrushEngine';
import { advanceSpiritBeasts, petCombatBonus, tameSpiritBeast } from './spiritBeastEngine';

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
  if (actor.tribulation && isTribulationActive(actor)) {
    actor.tribulation.stage = 'failed';
    actor.tribulation.resolvedTick = tick;
    actor.tribulation.lastOutcome = '应劫者已先行陨落，本次天劫中断。';
  }
}

function recordAuxiliaryActionEvent(world: WorldState, event: WorldEvent, emit?: (value: WorldEvent) => void): void {
  if (emit) { emit(event); return; }
  witnessEvent(world, event);
  archiveChronicleEvents(world, [event]);
  world.events = [event, ...world.events].slice(0, 120);
}

export function applyCultivatorBrainDecision(
  world: WorldState,
  cultivator: Cultivator,
  decision: LLMDecisionPayload,
  rng: () => number = worldRandom(world),
  authorizedBountyTargetId?: string,
  emit?: (event: WorldEvent) => void,
): WorldEvent | null {
  if (!cultivator.alive) return null;
  if (isTribulationActive(cultivator)) {
    const forced = decision.chosenAction !== 'FACE_TRIBULATION';
    const stance = !forced && decision.tribulationStance ? decision.tribulationStance : recommendedTribulationStance(cultivator);
    cultivator.currentAction = 'FACE_TRIBULATION';
    cultivator.innerMonologue = forced ? '天劫未止，无暇旁顾，先守住雷心。' : decision.innerMonologue;
    return resolveTribulation(world, cultivator, stance, rng);
  }
  cultivator.innerMonologue = decision.innerMonologue;
  cultivator.currentAction = decision.chosenAction;

  const location = world.locations.find((l) => l.id === cultivator.locationId);
  const qiFactor = (location?.spiritQi ?? 50) / 50;

  switch (decision.chosenAction) {
    case 'TAME_BEAST':
      return tameSpiritBeast(world, cultivator, decision, rng);
    case 'PURSUE_BOUNTY': {
      return pursueBounty(world, cultivator, decision, (target) => {
        const result = applyCultivatorBrainDecision(world, cultivator, {
          chosenAction: 'DUEL', innerMonologue: decision.innerMonologue, targetCultivatorId: target.id,
        }, rng, target.id, emit);
        cultivator.currentAction = 'PURSUE_BOUNTY';
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
        }, rng, undefined, emit);
        cultivator.currentAction = 'PURSUE_SCHEME';
        return result;
      }, (target, delta) => adjustRelationship(world, cultivator.id, target.id, delta, '竞争'), rng);
    }
    case 'TRADE':
    case 'DUAL_CULTIVATE':
    case 'SECT_DIPLOMACY':
      return resolveEncounter(decision.chosenAction, world, cultivator, decision,
        (target, amount) => adjustRelationship(world, cultivator.id, target.id, amount,
          cultivator.sectId === target.sectId ? '同门' : '竞争'));
    case 'CULTIVATE': {
      const gain = Math.round((8 + rng() * 10) * qiFactor * cultivationMultiplier(cultivator, location) * masteryMultiplier(cultivator, 'cultivation') * mentorshipTechniqueMultiplier(world, cultivator) * sectQiBonus(world, cultivator));
      cultivator.qiProgress = clamp(cultivator.qiProgress + gain, 0, 100);
      gainMastery(cultivator, 3);
      cultivator.hp = clamp(
        cultivator.hp + Math.round(cultivator.maxHp * 0.08),
        1,
        cultivator.maxHp
      );
      return null;
    }

    case 'REST': {
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
      const unknown = world.locations.filter((place) => place.id !== cultivator.locationId && !known.includes(place));
      const candidates = unknown.length ? unknown : world.locations.filter((place) => place.id !== cultivator.locationId);
      const dest = decision.targetLocationId
        ? known.find((place) => place.id === decision.targetLocationId) ??
          (knownRumorLead(cultivator, world) === decision.targetLocationId ? world.locations.find((site) => site.id === decision.targetLocationId) : undefined)
        : candidates[Math.floor(rng() * candidates.length)];
      if (dest && dest.id !== cultivator.locationId) {
        const strain = location ? Math.round(weatherTravelFriction(world, location, dest) * 12) : 0;
        if (strain > 0) {
          const spent = Math.min(cultivator.qiProgress, strain);
          cultivator.qiProgress -= spent;
          if (spent >= 3) recordMemory(cultivator, world.tick,
            `灵潮扰动御剑行路，抵至【${dest.name}】时额外消耗${spent}点灵气。`, 4, 'cultivation', -1);
        }
        cultivator.locationId = dest.id;
        noteTerrainVisit(world, cultivator);
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
      if (tribulationTarget(cultivator)) return triggerTribulation(world, cultivator);
      if (cultivator.realmStage >= 9 && cultivator.realm === REALM_ORDER.at(-1)) return null;
      const successChance =
        0.55 + (cultivator.karma / 500) + (cultivator.qiProgress >= 95 ? 0.2 : 0);
      if (rng() <= successChance) {
        cultivator.qiProgress = 0;
        let majorRealmUp = false;
        if (cultivator.realmStage < 9) {
          cultivator.realmStage += 1;
        } else {
          const currentIdx = REALM_ORDER.indexOf(cultivator.realm);
          if (currentIdx < REALM_ORDER.length - 1) {
            cultivator.realm = REALM_ORDER[currentIdx + 1];
            cultivator.realmStage = 1;
            majorRealmUp = true;
          }
        }
        const basePower = REALM_BASE_POWER[cultivator.realm];
        cultivator.maxHp = Math.round(
          basePower * (1 + cultivator.realmStage * 0.08)
        );
        cultivator.hp = cultivator.maxHp;
        cultivator.combatPower = Math.round(
          basePower * (1 + cultivator.realmStage * 0.1) +
            cultivator.artifacts.length * 45
        );
        cultivator.lifespan = REALM_LIFESPAN[cultivator.realm];

        const msg = majorRealmUp
          ? `渡过天劫，成功破境踏入【${cultivator.realm}期】！寿元与战力暴涨！`
          : `突破瓶颈，修为精进至【${cultivator.realm}${cultivator.realmStage}层】！`;

        recordMemory(cultivator, world.tick, msg, majorRealmUp ? 10 : 7, 'cultivation', majorRealmUp ? 5 : 3);
        return {
          id: `evt-${world.tick}-${cultivator.id}-break`,
          tick: world.tick,
          year: world.year,
          month: world.month,
          title: majorRealmUp
            ? `天地异象：${cultivator.name}晋升${cultivator.realm}期！`
            : `${cultivator.name}突破至${cultivator.realm}${cultivator.realmStage}层`,
          description: `在【${location?.name ?? '灵山'}】，${cultivator.name}${msg}`,
          category: 'breakthrough',
          actorIds: [cultivator.id],
          locationId: cultivator.locationId,
        };
      } else {
        // Tribulation backlash
        const backlashDamage = Math.round(cultivator.maxHp * 0.28);
        cultivator.hp = clamp(cultivator.hp - backlashDamage, 10, cultivator.maxHp);
        cultivator.qiProgress = 45;
        recordMemory(
          cultivator,
          world.tick,
          `冲击更高境界时心魔丛生，惨遭反噬受损 ${backlashDamage} 点气血！`,
          8,
          'cultivation', -4
        );
        return {
          id: `evt-${world.tick}-${cultivator.id}-fail`,
          tick: world.tick,
          year: world.year,
          month: world.month,
          title: `${cultivator.name}破境遭天劫反噬`,
          description: `${cultivator.name}强行冲关失败，雷劫加身吐血重伤，气息萎靡。`,
          category: 'heavenly',
          actorIds: [cultivator.id],
          locationId: cultivator.locationId,
        };
      }
    }

    case 'SOCIALIZE': {
      const target = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && c.locationId === cultivator.locationId && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) &&
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
        description: `${cultivator.name}与${target.name}于【${location?.name ?? '灵山'}】畅谈天地法则，${decision.spokenLine ? `言道：“${decision.spokenLine}”` : '相谈甚欢。'}`,
        category: 'diplomacy',
        actorIds: [cultivator.id, target.id],
        locationId: cultivator.locationId,
      };
    }

    case 'SCHEMING': {
      const target = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && c.locationId === cultivator.locationId && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) &&
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

    case 'DUEL': {
      const defender = world.cultivators.find((c) =>
        c.alive && c.id !== cultivator.id && c.locationId === cultivator.locationId && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) &&
        (decision.targetCultivatorId === undefined || c.id === decision.targetCultivatorId)
      );
      if (!defender) return null;
      const ward = interceptSanctuaryDuel(world, cultivator, defender);
      if (ward?.blocked) return ward.event;
      if (ward) recordAuxiliaryActionEvent(world, ward.event, emit);
      const finishDuel = (proof: WorldEvent): WorldEvent => {
        const breach = recordCeasefireHostility(world, cultivator, defender, proof);
        if (breach) recordAuxiliaryActionEvent(world, breach, emit);
        return proof;
      };

      const attackerScore = cultivator.combatPower * (0.85 + rng() * 0.3) * strikeMultiplier(cultivator, defender) * masteryMultiplier(cultivator) * petCombatBonus(world, cultivator);
      const defenderScore = defender.combatPower * (0.85 + rng() * 0.3) * strikeMultiplier(defender, cultivator) * masteryMultiplier(defender) * petCombatBonus(world, defender);
      const winner = attackerScore >= defenderScore ? cultivator : defender;
      const loser = winner.id === cultivator.id ? defender : cultivator;

      const dmgToLoser = Math.round(loser.maxHp * (0.35 + rng() * 0.35) * strikeMultiplier(winner, loser));
      const dmgToWinner = Math.round(winner.maxHp * (0.1 + rng() * 0.15) * strikeMultiplier(loser, winner));
      const sufferedByLoser = mitigateSectArray(world, loser, winner, dmgToLoser);
      const sufferedByWinner = mitigateSectArray(world, winner, loser, dmgToWinner);
      const loserBeforeHp = loser.hp;
      const winnerBeforeHp = winner.hp;
      loser.hp = Math.max(0, loser.hp - sufferedByLoser);
      winner.hp = Math.max(1, winner.hp - sufferedByWinner);
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
          dialogue: scriptedDialogue('combat', cultivator, defender, `${winner.name}胜出，${loser.name}当场陨落。`, decision.spokenLine),
          locationId: cultivator.locationId,
        };
        const fragments = transferLootedRelics(world, winner, loser, lethalEvent);
        if (fragments) lethalEvent.description += `另有${fragments}枚古器碎片循实账随战利品转移。`;
        return finishDuel(lethalEvent);
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
      return finishDuel({
        id: `evt-${world.tick}-${cultivator.id}-duel`,
        tick: world.tick,
        year: world.year,
        month: world.month,
        title: `惊天斗法：${cultivator.name}激战${defender.name}`,
        description: `${cultivator.name}于【${location?.name ?? '秘境'}】向${defender.name}悍然出手！一番激斗后，${winner.name}占据上风，${loser.name}受创（-${loserBeforeHp - loser.hp} HP）化作血光遁走。`,
        category: 'combat',
        actorIds: [cultivator.id, defender.id],
        duelWinnerId: winner.id,
        damage,
        dialogue: scriptedDialogue('combat', cultivator, defender, `${winner.name}占得上风，${loser.name}负伤离去。`, decision.spokenLine),
        locationId: cultivator.locationId,
      });
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
    captureTrace?: boolean;
    capturePresentation?: boolean;
    replayDraws?: Readonly<Record<string, number>>;
    onActor?: (actorId: string, candidates: DecisionTraceCandidate[], applied: boolean) => void;
  }
): WorldState {
  const nextState: WorldState = structuredClone(prevState);
  const rng = injectedRandom ?? worldRandom(nextState);
  nextState.tick += 1;
  if (nextState.month >= 12) {
    nextState.year += 1;
    nextState.month = 1;
  } else {
    nextState.month += 1;
  }

  maintainPlayerAvatar(nextState);
  maintainMentorship(nextState);
  const avatarOrder = consumeAvatarOrder(nextState);
  maintainAlchemy(nextState);
  maintainSectEconomy(nextState);
  const newEvents: WorldEvent[] = [...advanceSanctuaries(nextState), ...advanceCeasefires(nextState), ...advanceCompetitionSeasons(nextState), ...advanceMapHazards(nextState), ...advanceRelocations(nextState), ...advanceSettlements(nextState), ...advanceSpiritBeasts(nextState, rng)];
  for (const event of newEvents) witnessEvent(nextState, event);

  for (const cultivator of [...nextState.cultivators]) {
    if (!cultivator.alive) continue;

    // Age increment every 12 months
    if (nextState.month === 1) {
      cultivator.age += 1;
      if (cultivator.age >= cultivator.lifespan) {
        cultivator.alive = false;
        cultivator.hp = 0;
        closeInterruptedTrial(cultivator, nextState.tick);
        dropInheritance(cultivator, nextState);
        const death: WorldEvent = {
          id: `evt-${nextState.tick}-${cultivator.id}-oldage`,
          tick: nextState.tick,
          year: nextState.year,
          month: nextState.month,
          title: `寿元耗尽：${cultivator.name}坐化陨落`,
          description: `${cultivator.name}未能突破更高境界，大限将至，于洞府中安然坐化。`,
          category: 'death',
          actorIds: [cultivator.id],
          locationId: cultivator.locationId,
        };
        newEvents.push(death);
        witnessEvent(nextState, death);
        continue;
      }
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

    const provided = (avatarOrder?.actorId === cultivator.id ? avatarOrder.decision : undefined) ??
      precomputedDecisions?.[cultivator.id];
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

    if (activeOccasionForActor(nextState, cultivator)) {
      cultivator.currentAction = 'JOIN_OCCASION';
      cultivator.innerMonologue = '已入大会或秘境名册，眼下须静候下一轮。';
      continue;
    }

    let decisionDraws = 0;
    if (provided && traceOptions?.replayDraws) {
      const replayedDraws = traceOptions.replayDraws[cultivator.id] ?? 0;
      for (let draw = 0; draw < Math.min(64, replayedDraws); draw++) rng();
    }
    const decision = provided ?? fieldNegotiation ?? computeHeuristicDecision(cultivator, nextState, () => { decisionDraws++; return rng(); });

    const captureTrace = traceOptions?.captureTrace !== false;
    const candidates = captureTrace || traceOptions?.onActor ? legalTraceCandidates(nextState, cultivator) : [];
    if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, decision, decisionDraws);
    const previousLocation = cultivator.locationId;
    const previousRealm = cultivator.realm;
    const evt = applyCultivatorBrainDecision(nextState, cultivator, decision, rng, undefined, (event) => {
      newEvents.push(event);
      witnessEvent(nextState, event);
    });
    const validEffect = decision.chosenAction === cultivator.currentAction && (evt !== null ||
      decision.chosenAction === 'REST' || decision.chosenAction === 'CULTIVATE' ||
      (decision.chosenAction === 'EXPLORE' && previousLocation !== cultivator.locationId));
    if (recordDecisionEffect && precomputedDecisions?.[cultivator.id]) recordDecisionEffect(cultivator.id, validEffect);
    traceOptions?.onActor?.(cultivator.id, candidates, validEffect);
    if (captureTrace) recordDecisionTrace(nextState, cultivator.id, candidates, decision,
      avatarOrder?.actorId === cultivator.id ? 'avatar' : traceOptions?.modelActors?.has(cultivator.id) ? 'model' : 'utility', validEffect);
    creditSectService(nextState, cultivator, evt);
    if (evt) {
      if (cultivator.realm !== previousRealm) recordBreakthroughCompetition(nextState, cultivator, previousRealm, evt);
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
      witnessEvent(nextState, evt);
    }
  }

  for (const cultivator of nextState.cultivators) {
    expireScheme(cultivator, nextState.tick);
    if (!cultivator.alive) {
      closeInterruptedTrial(cultivator, nextState.tick);
      continue;
    }
    const yearly = nextState.month === 1;
    maintainMemories(cultivator, nextState.tick, yearly);
    if (yearly) cultivator.reflections = synthesizeReflections(cultivator, nextState.tick);
  }

  for (const event of [...advanceDiplomacy(nextState, rng), ...advanceOccasions(nextState, rng), ...advanceOaths(nextState), ...advanceMarkets(nextState), ...advanceWitnesses(nextState), ...maintainSectPolitics(nextState), ...advanceBounties(nextState), ...advanceResearch(nextState), ...advanceEstates(nextState), ...advanceDoctrines(nextState), ...advanceSectCredit(nextState), ...advanceSanctuaries(nextState)]) {
    newEvents.push(event);
    witnessEvent(nextState, event);
  }
  for (const actor of nextState.cultivators) if (actor.alive) noteTerrainVisit(nextState, actor);
  maintainPlayerAvatar(nextState);
  spreadRumors(nextState);
  reconcileRelicCustody(nextState);
  advanceReincarnation(nextState);
  recordNewDeathsForReincarnation(prevState, nextState, newEvents);
  archiveChronicleEvents(nextState, newEvents);
  nextState.events = [...newEvents, ...nextState.events].slice(0, 120);
  if (councilMode === 'utility') {
    settleAnnualCouncilOffline(nextState);
    settleChronicleOffline(nextState);
  }
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
  const nextState: WorldState = structuredClone(prevState);

  switch (cmd.type) {
    case 'SPAWN_TREASURE': {
      const loc =
        nextState.locations.find((l) => l.id === cmd.targetLocationId) ??
        nextState.locations[0];
      loc.spiritQi = clamp(loc.spiritQi + 20, 10, 150);

      const luckyOnes = nextState.cultivators.filter(
        (c) => c.alive && c.locationId === loc.id && !activeRelocationForActor(nextState, c) && !activeEscortForActor(nextState, c)
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
        cmd.targetCultivatorId ? nextState.cultivators.find((c) => c.alive && c.id === cmd.targetCultivatorId) :
        nextState.cultivators.find((c) => c.alive);
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
        if (!c.alive) continue;
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
        actorIds: nextState.cultivators.filter((c) => c.alive).map((c) => c.id),
      });
      break;
    }

    case 'WHISPER_MIND': {
      const target =
        nextState.cultivators.find((c) => c.id === cmd.targetCultivatorId) ??
        nextState.cultivators.find((c) => c.alive);
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
    nextState.events = nextState.events.slice(0, 120);
    nextState.mapPresentation = deriveMapPresentation(prevState, nextState, [head]);
  }
  return nextState;
}

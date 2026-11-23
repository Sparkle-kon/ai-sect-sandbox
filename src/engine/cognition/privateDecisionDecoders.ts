import type { LLMDecisionPayload, Cultivator } from '../../types/world';
import { availableCourierHandoffActions } from '../sealedCourierEngine';
import type { RoguelikeEncounterChoice } from '../../types/roguelikeEncounter';
import type { DestinyTraitOffer } from '../../types/destinyTrait';
import { HEART_DEMON_CHOICES } from '../../types/heartDemon';
import type { ForbiddenArtChoice } from '../../types/forbiddenArt';
import type { GrandSiegeHeroMove } from '../../types/grandSiege';
import { isTribulationActive } from '../tribulationEngine';
export function decodeCourierHandoff(parsed: Partial<LLMDecisionPayload>, choices: ReturnType<typeof availableCourierHandoffActions>): LLMDecisionPayload | undefined {
  if (!parsed || parsed.chosenAction !== 'COURIER_HANDOFF') return undefined;
  const option = choices.find((item) => item.courierHandoffMove === parsed.courierHandoffMove &&
    item.targetDispatchId === parsed.targetDispatchId && item.targetCourierId === parsed.targetCourierId);
  if (!option || Object.keys(parsed).some((key) =>
      !['chosenAction', 'innerMonologue', 'courierHandoffMove', 'targetDispatchId',
        ...(option.courierHandoffMove === 'offer' ? ['targetCourierId'] : [])].includes(key))) return undefined;
  const innerMonologue = typeof parsed.innerMonologue === 'string' ? parsed.innerMonologue.trim().slice(0,160) : '';
  return option.courierHandoffMove === 'offer'
    ? { chosenAction:'COURIER_HANDOFF', courierHandoffMove:'offer', targetDispatchId:option.targetDispatchId,
      targetCourierId:option.targetCourierId, innerMonologue:innerMonologue || '信封不动；只问本人。' }
    : { chosenAction:'COURIER_HANDOFF', courierHandoffMove:option.courierHandoffMove, targetDispatchId:option.targetDispatchId,
      innerMonologue:innerMonologue || '只按亲到驿站的选项办理。' };
}

const encounterDecisionFields = ['chosenAction', 'targetRoguelikeEncounterId', 'roguelikeEncounterChoice'] as const;

export function decodeRoguelikeEncounterDecision(parsed: Partial<LLMDecisionPayload>, exactId: string,
  allowed: readonly RoguelikeEncounterChoice[]): LLMDecisionPayload | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).length !== encounterDecisionFields.length ||
      !encounterDecisionFields.every(key => Object.hasOwn(parsed, key)) ||
      parsed.chosenAction !== 'ROGUELIKE_ENCOUNTER' || parsed.targetRoguelikeEncounterId !== exactId) return undefined;
  const choice = allowed.find(id => id === parsed.roguelikeEncounterChoice);
  if (!choice) return undefined;
  return { chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: exactId, roguelikeEncounterChoice: choice,
    innerMonologue: '亲到才有此机缘，眼下只依已见的抉择行事。' };
}

const destinyDecisionFields = ['chosenAction', 'targetDestinyOfferId', 'destinyTraitChoice'] as const;

export function decodeDestinyTraitDecision(parsed: Partial<LLMDecisionPayload>, offer: Pick<DestinyTraitOffer, 'id'> & { options: readonly DestinyTraitOffer['options'][number][] }): LLMDecisionPayload | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).length !== destinyDecisionFields.length ||
      !destinyDecisionFields.every(key => Object.hasOwn(parsed, key)) ||
      parsed.chosenAction !== 'AWAKEN_DESTINY' || parsed.targetDestinyOfferId !== offer.id) return undefined;
  const destinyTraitChoice = offer.options.find(id => id === parsed.destinyTraitChoice);
  if (!destinyTraitChoice) return undefined;
  return { chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: offer.id, destinyTraitChoice,
    innerMonologue: '诸般天命已现，且取一途践行。' };
}

const heartDemonDecisionFields = ['chosenAction', 'targetHeartTrialId', 'heartDemonChoice'] as const;

export function decodeHeartDemonDecision(parsed: Partial<LLMDecisionPayload>, exactTrialId: string): LLMDecisionPayload | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).length !== heartDemonDecisionFields.length ||
      !heartDemonDecisionFields.every(key => Object.hasOwn(parsed, key)) ||
      parsed.chosenAction !== 'FACE_TRIBULATION' || parsed.targetHeartTrialId !== exactTrialId) return undefined;
  const heartDemonChoice = HEART_DEMON_CHOICES.find(choice => choice === parsed.heartDemonChoice);
  if (!heartDemonChoice) return undefined;
  return { chosenAction: 'FACE_TRIBULATION', targetHeartTrialId: exactTrialId, heartDemonChoice,
    innerMonologue: '只择眼下的一条路，不把幻象错认成真的。' };
}

const forbiddenArtDecisionFields = ['chosenAction', 'targetForbiddenDuelId', 'forbiddenArtChoice'] as const;

export function decodeForbiddenArtDecision(parsed: Partial<LLMDecisionPayload>, id: string,
  choices: readonly ForbiddenArtChoice[]): LLMDecisionPayload | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).length !== forbiddenArtDecisionFields.length ||
      !forbiddenArtDecisionFields.every(key => Object.hasOwn(parsed, key)) ||
      parsed.chosenAction !== 'FORBIDDEN_ART' || parsed.targetForbiddenDuelId !== id) return undefined;
  const forbiddenArtChoice = choices.find(choice => choice === parsed.forbiddenArtChoice);
  if (!forbiddenArtChoice) return undefined;
  return { chosenAction: 'FORBIDDEN_ART', targetForbiddenDuelId: id, forbiddenArtChoice,
    innerMonologue: '胜负未定，只从眼前确可一试的路里选。' };
}

const grandSiegeDecisionFields = ['chosenAction', 'targetGrandSiegeId', 'grandSiegeHeroMove'] as const;

export function decodeGrandSiegeHeroDecision(parsed: Partial<LLMDecisionPayload>, id: string,
  moves: readonly GrandSiegeHeroMove[]): LLMDecisionPayload | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).length !== grandSiegeDecisionFields.length ||
      !grandSiegeDecisionFields.every(key => Object.hasOwn(parsed, key)) ||
      parsed.chosenAction !== 'GRAND_SIEGE_HERO' || parsed.targetGrandSiegeId !== id) return undefined;
  const grandSiegeHeroMove = moves.find(move => move === parsed.grandSiegeHeroMove);
  if (!grandSiegeHeroMove) return undefined;
  return { chosenAction: 'GRAND_SIEGE_HERO', targetGrandSiegeId: id, grandSiegeHeroMove,
    innerMonologue: '只在实际阵前择定一法，能否护住仍须战场亲见。' };
}

/** Legacy lightning posture facts are a whitelist, never a serialization of a guided heart scene. */
export function nativeTribulationPromptView(actor: Cultivator) {
  const trial = actor.tribulation;
  if (!trial || !isTribulationActive(actor)) return null;
  const { targetRealm, startedTick, stage, nextWave, totalWaves, pressure, interruptions, lastActedTick } = trial;
  return { targetRealm, startedTick, stage, nextWave, totalWaves, pressure, interruptions, lastActedTick };
}

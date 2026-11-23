import type { MentorTransferOption } from '../mentorTransferEngine';
import type { LLMDecisionPayload, Cultivator, WorldState } from '../../types/world';
import type { SeasonalHousingOption } from '../seasonalHousingEngine';
import type { WorkshopReleaseOption } from '../workshopEngine';
import { activeAvatar } from '../avatarEngine';
import { availableGrandSiegeHeroActions } from '../grandSiegeTheatreEngine';

/** An eligible attached defender reserves this battlefield's extra hero choice. */
export function grandSiegeHeroReservedForPlayer(world: WorldState, id: string): boolean {
  const owner = activeAvatar(world);
  return !!owner && availableGrandSiegeHeroActions(owner, world).some(option => option.targetGrandSiegeId === id);
}
export function toMentorTransferDecision({action,...targets}:MentorTransferOption,innerMonologue:string):LLMDecisionPayload {
  return {chosenAction:action,...targets,innerMonologue};
}

export function toHousingDecision({action,...targets}:SeasonalHousingOption,innerMonologue:string):LLMDecisionPayload {
  return {chosenAction:action,...targets,innerMonologue};
}


export function workshopReleaseDecision(option: WorkshopReleaseOption, innerMonologue: string): LLMDecisionPayload {
  const { action: chosenAction, ...targets } = option;
  return { chosenAction, ...targets, innerMonologue };
}


export function possessedForWorkshopRelease(actor: Cultivator, world: WorldState, executionTick: number): boolean {
  return world.playerAvatar.possessedId === actor.id && (world.playerAvatar.possessionUntilTick ?? 0) > executionTick;
}

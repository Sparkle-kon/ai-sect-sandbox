import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import { availableWorkshopEstateActions, type WorkshopEstateOption } from './workshopEngine';

const possessed = (actor: Cultivator, world: WorldState, tick: number) =>
  world.playerAvatar.possessedId === actor.id && (world.playerAvatar.possessionUntilTick ?? 0) > tick;

export function workshopEstateProviderOptions(actor: Cultivator, world: WorldState, tick: number): WorkshopEstateOption[] {
  return possessed(actor, world, tick) ? [] : availableWorkshopEstateActions(actor, world, tick);
}

const reflections = {
  offer: '遗产已经依法裁定。只请原掌炉人续好这件已经起过坯的器物。',
  accept: '是那一件留在原坊的首坯。我亲自应下，不重新收料或起坯。',
  decline: '我不接续此约。余料仍照原遗产账退还，不过第二遍工钱。',
} as const;

function decision(option: WorkshopEstateOption, innerMonologue: string): LLMDecisionPayload {
  return { chosenAction: option.action, targetWorkshopId: option.targetWorkshopId,
    workshopEstateMove: option.workshopEstateMove, innerMonologue };
}

export function decodeWorkshopEstateDecision(parsed: Partial<LLMDecisionPayload>, actor: Cultivator,
  options: readonly WorkshopEstateOption[]): LLMDecisionPayload | undefined {
  if (parsed.chosenAction !== 'WORKSHOP_ESTATE' || Object.keys(parsed).some((field) =>
    !['chosenAction', 'innerMonologue', 'workshopEstateMove', 'targetWorkshopId'].includes(field))) return undefined;
  const exact = options.find((option) => option.workshopEstateMove === parsed.workshopEstateMove &&
    option.targetWorkshopId === parsed.targetWorkshopId);
  if (!exact) return undefined;
  return decision(exact, (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
    actor.innerMonologue || reflections[exact.workshopEstateMove]);
}

/** Only exact native options can embody an NPC's consent; possession always defers to the player. */
export function utilityWorkshopEstateDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  if (actor.guardAssignment || possessed(actor, world, world.tick) ||
      !world.workshops.orders.some((row) => row.status === 'probate_hold')) return undefined;
  const options = availableWorkshopEstateActions(actor, world, world.tick);
  const answer = actor.personality === '嗜血' ? 'decline' : 'accept';
  const reply = options.filter((option) => option.workshopEstateMove === answer);
  if (reply.length === 1) return decision(reply[0], reflections[answer]);
  const proposal = options.filter((option) => option.workshopEstateMove === 'offer');
  if (reply.length === 0 && proposal.length === 1 && actor.hp >= .65 * actor.maxHp)
    return decision(proposal[0], reflections.offer);
  return undefined;
}

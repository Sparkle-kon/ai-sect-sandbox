import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import type { WaypostMealOption } from '../types/waypostMeal';
import { availableWaypostMealActions } from './waypostMealEngine';

const playerHasBody = (world: WorldState, actor: Cultivator, tick: number) =>
  world.playerAvatar.possessedId === actor.id && (world.playerAvatar.possessionUntilTick ?? 0) > tick;

export function waypostMealProviderOptions(actor: Cultivator, world: WorldState, tick: number): WaypostMealOption[] {
  return playerHasBody(world, actor, tick) ? [] : availableWaypostMealActions(actor, world, tick);
}

export function waypostMealTargets(option: WaypostMealOption) {
  return option.waypostMealMove === 'offer'
    ? { waypostMealMove: option.waypostMealMove, targetCultivatorId: option.targetCultivatorId }
    : { waypostMealMove: option.waypostMealMove, targetWaypostMealId: option.targetWaypostMealId };
}

const intentions = {
  offer: '另一队也确已走到这块山石旁，且封一叶茶相请，等对方亲自答应。',
  accept: '确实同在前一月停留的关口，歇一刻分茶，只照各自气血记下。',
  decline: '今日不便在关口饮茶，请原封退回这片叶子。',
  withdraw: '行程各自要紧，只取回尚未分饮的茶叶。',
} as const;

export function decodeWaypostMealDecision(parsed: Partial<LLMDecisionPayload>, actor: Cultivator,
  options: readonly WaypostMealOption[]): LLMDecisionPayload | undefined {
  if (parsed.chosenAction !== 'WAYPOST_MEAL') return undefined;
  const exact = options.find((option) => option.waypostMealMove === parsed.waypostMealMove &&
    (option.waypostMealMove === 'offer'
      ? option.targetCultivatorId === parsed.targetCultivatorId : option.targetWaypostMealId === parsed.targetWaypostMealId));
  if (!exact) return undefined;
  const target = exact.waypostMealMove === 'offer' ? 'targetCultivatorId' : 'targetWaypostMealId';
  if (Object.keys(parsed).some((key) => !['chosenAction', 'innerMonologue', 'waypostMealMove', target].includes(key))) return undefined;
  const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
    actor.innerMonologue || intentions[exact.waypostMealMove];
  return { chosenAction: exact.action, ...waypostMealTargets(exact), innerMonologue };
}

export function utilityWaypostMealDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  if (actor.guardAssignment || playerHasBody(world, actor, world.tick)) return undefined;
  const options = availableWaypostMealActions(actor, world);
  const desired = actor.personality === '嗜血' ? 'decline' : 'accept';
  const answers = options.filter(({ waypostMealMove }) => waypostMealMove === desired);
  const proposals = options.filter(({ waypostMealMove }) => waypostMealMove === 'offer');
  const choice = answers.length === 1 ? answers[0] : !answers.length && proposals.length === 1 &&
    (actor.personality === '刚正' || actor.personality === '逍遥') && actor.hp <= actor.maxHp * .75
    ? proposals[0] : undefined;
  return choice && { chosenAction: choice.action, ...waypostMealTargets(choice),
    innerMonologue: intentions[choice.waypostMealMove] };
}

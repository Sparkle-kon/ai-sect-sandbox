import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import type { CraftTrainingOption } from '../types/craftTraining';
import { availableCraftTrainingActions } from './craftTrainingEngine';

const possessed = (actor: Cultivator, world: WorldState, tick: number) =>
  world.playerAvatar.possessedId === actor.id && (world.playerAvatar.possessionUntilTick ?? 0) > tick;

export function craftTrainingProviderOptions(actor: Cultivator, world: WorldState, tick: number): CraftTrainingOption[] {
  return possessed(actor, world, tick) ? [] : availableCraftTrainingActions(actor, world, tick);
}

export function craftTrainingTargets(option: CraftTrainingOption) {
  return option.craftTrainingMove === 'offer' ? {
    craftTrainingMove: option.craftTrainingMove, targetCultivatorId: option.targetCultivatorId,
    targetCraftTraineeId: option.targetCraftTraineeId,
  } : { craftTrainingMove: option.craftTrainingMove, targetCraftTrainingId: option.targetCraftTrainingId };
}

const voice = {
  offer: '便请两位分别应约，只在炉边合练一件，不先写下任何功劳。',
  join: '我本人愿接这道工序，到了实炉再做。',
  decline: '今日无意合练，本人谢绝，不冒认他人的工序。',
  blank: '轮到我打首坯，只据原约与实际炉位落锤。',
  finish: '接的是前人已经打好的那一件坯，我只署最后这一道。',
  withdraw: '我不续这份合练，只退原账里还剩的工料。',
} as const;

export function decodeCraftTrainingDecision(parsed: Partial<LLMDecisionPayload>, actor: Cultivator,
  options: readonly CraftTrainingOption[]): LLMDecisionPayload | undefined {
  if (parsed.chosenAction !== 'CRAFT_TRAINING') return undefined;
  const exact = options.find((option) => option.craftTrainingMove === parsed.craftTrainingMove &&
    (option.craftTrainingMove === 'offer'
      ? option.targetCultivatorId === parsed.targetCultivatorId && option.targetCraftTraineeId === parsed.targetCraftTraineeId
      : option.targetCraftTrainingId === parsed.targetCraftTrainingId));
  if (!exact) return undefined;
  const targets = exact.craftTrainingMove === 'offer' ? ['targetCultivatorId', 'targetCraftTraineeId'] : ['targetCraftTrainingId'];
  if (Object.keys(parsed).some((key) => !['chosenAction', 'innerMonologue', 'craftTrainingMove', ...targets].includes(key))) {
    return undefined;
  }
  const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
    actor.innerMonologue || voice[exact.craftTrainingMove];
  return { chosenAction: exact.action, ...craftTrainingTargets(exact), innerMonologue };
}

export function utilityCraftTrainingDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  if (!world.craftTraining || actor.guardAssignment || possessed(actor, world, world.tick)) return undefined;
  const options = availableCraftTrainingActions(actor, world);
  const consent = actor.personality === '嗜血' || actor.hp < actor.maxHp * .55 ? 'decline' : 'join';
  for (const move of ['finish', 'blank', consent] as const) {
    const eligible = options.filter(({ craftTrainingMove }) => craftTrainingMove === move);
    if (eligible.length === 1) {
      return { chosenAction: eligible[0].action, ...craftTrainingTargets(eligible[0]), innerMonologue: voice[move] };
    }
  }
  return undefined;
}

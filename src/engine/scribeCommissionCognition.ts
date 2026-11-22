import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import { availableScribeCommissionActions, type ScribeCommissionOption } from './scribeCommissionEngine';

const possessed = (actor: Cultivator, world: WorldState, tick: number) =>
  world.playerAvatar.possessedId === actor.id && (world.playerAvatar.possessionUntilTick ?? 0) > tick;

export function scribeCommissionProviderOptions(actor: Cultivator, world: WorldState, tick: number): ScribeCommissionOption[] {
  return possessed(actor, world, tick) ? [] : availableScribeCommissionActions(actor, world, tick);
}

export function scribeCommissionTargets(option: ScribeCommissionOption) {
  return option.scribeCommissionMove === 'offer'
    ? { scribeCommissionMove: option.scribeCommissionMove, targetCultivatorId: option.targetCultivatorId,
      targetChronicleSourceId: option.targetChronicleSourceId }
    : { scribeCommissionMove: option.scribeCommissionMove, targetScribeCommissionId: option.targetScribeCommissionId };
}

export function decodeScribeCommissionDecision(parsed: Partial<LLMDecisionPayload>, actor: Cultivator,
  options: readonly ScribeCommissionOption[]): LLMDecisionPayload | undefined {
  if (parsed.chosenAction !== 'SCRIBE_COMMISSION') return undefined;
  const exact = options.find((option) => option.scribeCommissionMove === parsed.scribeCommissionMove &&
    (option.scribeCommissionMove === 'offer'
      ? option.targetCultivatorId === parsed.targetCultivatorId && option.targetChronicleSourceId === parsed.targetChronicleSourceId
      : option.targetScribeCommissionId === parsed.targetScribeCommissionId));
  if (!exact) return undefined;
  const fields = exact.scribeCommissionMove === 'offer'
    ? ['targetCultivatorId', 'targetChronicleSourceId'] : ['targetScribeCommissionId'];
  if (Object.keys(parsed).some((key) => !['chosenAction', 'innerMonologue', 'scribeCommissionMove', ...fields].includes(key))) {
    return undefined;
  }
  const innerMonologue = (typeof parsed.innerMonologue === 'string' && parsed.innerMonologue.trim().slice(0, 160)) ||
    actor.innerMonologue || '只照当地实据与本人书约行事。';
  return { chosenAction: 'SCRIBE_COMMISSION', ...scribeCommissionTargets(exact), innerMonologue };
}

const reflections = {
  accept: '既是原址亲请，愿按实据核写，不以异闻代史实。',
  decline: '这封书约不敢应下，不收对方的钱。',
  verify: '亲看原据，把相争的两种说法照录，不擅定输赢。',
  deliver: '原据仍在，卷子已核，今日当面交稿。',
} as const;

/** Respond to existing contracts first. The offline steward never commissions a patron's work on their behalf. */
export function utilityScribeCommissionDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  if (!world.scribeCommissions?.commissions.length || actor.guardAssignment || possessed(actor, world, world.tick)) return undefined;
  const opts = availableScribeCommissionActions(actor, world, world.tick);
  for (const move of ['deliver', 'verify', actor.personality === '嗜血' ? 'decline' : 'accept'] as const) {
    const choices = opts.filter((option) => option.scribeCommissionMove === move);
    if (choices.length === 1) {
      return { chosenAction: 'SCRIBE_COMMISSION', ...scribeCommissionTargets(choices[0]), innerMonologue: reflections[move] };
    }
  }
  return undefined;
}

import type { LLMDecisionPayload } from '../types/world';
import type { CultivationClanOption } from './cultivationClanEngine';

export const CLAN_PRIVATE_COMMAND_KEYS = ['clanMove', 'targetCultivationUnionId'] as const;
const independentThought = {
  propose: '只提出本人愿约，请对方亲自决定。',
  accept: '只代自己应允；不替另一方作决定。',
  refuse: '由本人亲自谢绝，仍按实况行事。',
  ceremony_offer: '单请对方另行决定是否同赴大典。',
  ceremony: '确愿本人赴这份仪约，仍以实到和双方的许可为准。',
  family_offer: '只提出一份另立的家愿，不能代另一方应承。',
  family_accept: '在这个确切家约上只签本人之愿。',
  family_refuse: '本人不应这份家约，此选择不会改写以往的约定。',
} as const;

export function cultivationClanCommand(option: CultivationClanOption) {
  const chosenAction = 'CULTIVATION_CLAN' as const;
  return option.clanMove === 'propose'
    ? { chosenAction, clanMove: option.clanMove, targetCultivatorId: option.targetCultivatorId }
    : { chosenAction, clanMove: option.clanMove, targetCultivationUnionId: option.targetCultivationUnionId };
}

/** Exactly one own mechanical choice; no joined consent, intimate narration, lineage, or derived effect. */
export function exactCultivationClanDecision(input: unknown, options: readonly CultivationClanOption[],
  allowInternalThought = false): LLMDecisionPayload | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Partial<LLMDecisionPayload>;
  if (record.chosenAction !== 'CULTIVATION_CLAN' || !Object.hasOwn(record, 'chosenAction') || !Object.hasOwn(record, 'clanMove')) return undefined;
  const propose = record.clanMove === 'propose';
  const target = propose ? 'targetCultivatorId' : 'targetCultivationUnionId';
  if (!Object.hasOwn(record, target) || typeof record[target] !== 'string' ||
      Object.keys(record).some(key => key !== 'chosenAction' && key !== 'clanMove' && key !== target &&
        !(allowInternalThought && key === 'innerMonologue'))) return undefined;
  const option = options.find(row => row.clanMove === record.clanMove &&
    (row.clanMove === 'propose' ? row.targetCultivatorId === record.targetCultivatorId :
      row.targetCultivationUnionId === record.targetCultivationUnionId));
  return option ? { ...cultivationClanCommand(option), innerMonologue: independentThought[option.clanMove] } : undefined;
}

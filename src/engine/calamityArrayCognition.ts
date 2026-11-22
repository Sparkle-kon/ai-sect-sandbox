import type { LLMDecisionPayload } from '../types/world';
import type { CalamityArrayOption } from './calamityArray';

const COMMAND_KEYS = ['chosenAction', 'calamityArrayStance', 'targetCalamityHazardId', 'targetLocationId'] as const;

export function calamityArrayCommand({ calamityArrayStance, targetCalamityHazardId, targetLocationId }: CalamityArrayOption) {
  return { chosenAction: 'CALAMITY_ARRAY', calamityArrayStance, targetCalamityHazardId, targetLocationId } as const;
}

export function exactCalamityArrayDecision(raw: unknown, choices: readonly CalamityArrayOption[], internal = false): LLMDecisionPayload | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(key => !COMMAND_KEYS.some(field => field === key) &&
    !(internal && key === 'innerMonologue' && typeof input[key] === 'string'))) return undefined;
  if (!COMMAND_KEYS.every(key => Object.hasOwn(input, key))) return undefined;
  const match = choices.find(option => {
    const command = calamityArrayCommand(option);
    return COMMAND_KEYS.every(key => input[key] === command[key]);
  });
  if (!match) return undefined;
  return { ...calamityArrayCommand(match), innerMonologue: '先守住眼前这一阵。' };
}

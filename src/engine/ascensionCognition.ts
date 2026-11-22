import type { LLMDecisionPayload } from '../types/world';
import type { AscensionOption } from './ascensionEngine';

export const ASCENSION_PRIVATE_COMMAND_KEYS = ['ascensionMove', 'targetAscensionTrialId'] as const;
const authored = {
  start: '只在实已圆满的这一步亲叩天关。',
  guard: '收敛真气，抵住当月这一重劫雷。',
  advance: '以实际尚有的真气，独迎此月这一重劫雷。',
  retreat: '认清此刻气血，只退眼前天关，不冒报飞升。',
} as const;

export function ascensionCommand(option: AscensionOption) {
  const chosenAction = 'ASCENSION' as const;
  return option.ascensionMove === 'start'
    ? { chosenAction, ascensionMove: option.ascensionMove }
    : { chosenAction, ascensionMove: option.ascensionMove, targetAscensionTrialId: option.targetAscensionTrialId };
}

export function exactAscensionDecision(input: unknown, options: readonly AscensionOption[], allowInternalThought = false): LLMDecisionPayload | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const data = input as Partial<LLMDecisionPayload>;
  if (data.chosenAction !== 'ASCENSION' || !Object.hasOwn(data, 'chosenAction') || !Object.hasOwn(data, 'ascensionMove')) return undefined;
  const ongoing = data.ascensionMove !== 'start';
  if (ongoing && (!Object.hasOwn(data, 'targetAscensionTrialId') || typeof data.targetAscensionTrialId !== 'string') ||
      Object.keys(data).some(key => key !== 'chosenAction' && key !== 'ascensionMove' &&
        !(ongoing && key === 'targetAscensionTrialId') && !(allowInternalThought && key === 'innerMonologue'))) return undefined;
  const option = options.find(row => row.ascensionMove === data.ascensionMove && row.targetAscensionTrialId === data.targetAscensionTrialId);
  return option ? { ...ascensionCommand(option), innerMonologue: authored[option.ascensionMove] } : undefined;
}

export const ascensionQuietWait = (): LLMDecisionPayload =>
  ({ chosenAction: 'REST', innerMonologue: '只留在眼下真实的一处；不代人答应、移步或报成。' });

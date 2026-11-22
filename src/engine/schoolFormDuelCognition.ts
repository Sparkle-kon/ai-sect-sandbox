import type { SchoolFormDuelChoice } from '../types/schoolFormDuel';
import type { LLMDecisionPayload } from '../types/world';

export function schoolFormCommand(contactId: string, schoolFormChoice: SchoolFormDuelChoice) {
  return { chosenAction: 'SCHOOL_FORM_DUEL', targetSchoolFormContactId: contactId, schoolFormChoice } as const;
}

export function exactSchoolFormDecision(raw: unknown, contactId: string,
  choices: readonly SchoolFormDuelChoice[], internal = false): LLMDecisionPayload | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const fields = ['chosenAction','targetSchoolFormContactId','schoolFormChoice'];
  if (fields.some(key => !Object.hasOwn(data,key)) || Object.keys(data).some(key =>
    !fields.includes(key) && !(internal && key === 'innerMonologue' && typeof data[key] === 'string'))) return undefined;
  const choice = choices.find(candidate => candidate === data.schoolFormChoice);
  if (data.chosenAction !== 'SCHOOL_FORM_DUEL' || data.targetSchoolFormContactId !== contactId || !choice) return undefined;
  return { ...schoolFormCommand(contactId,choice), innerMonologue: '这一剑是出是收，仍是我此刻自己的决定。' };
}

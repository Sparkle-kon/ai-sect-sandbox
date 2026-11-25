import type { LLMDecisionPayload } from '../types/world';
import type { FurnaceEmergencyOption } from '../types/furnaceEmergency';

const thought: Record<FurnaceEmergencyOption['furnaceEmergencyMove'], string> = {
  brace: '护住还能带走的炉边物件，不开炉，不冒充已修。',
  retreat: '先沿认得的近路离险，不替旁人作主。',
  request_rescue: '我只能开口相求，他来不来仍由他自己定。',
  accept_rescue: '是我自己应下。等一同走出险地，再说平安。',
};

export function furnaceEmergencyCommand(option: FurnaceEmergencyOption) {
  return { chosenAction: 'FURNACE_EMERGENCY', furnaceEmergencyMove: option.furnaceEmergencyMove,
    targetFurnaceEmergencyId: option.targetFurnaceEmergencyId,
    ...(option.targetLocationId === undefined ? {} : { targetLocationId: option.targetLocationId }) } as const;
}

export function exactFurnaceEmergencyDecision(raw: unknown, options: readonly FurnaceEmergencyOption[],
  internal = false): LLMDecisionPayload | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const field = raw as Record<string, unknown>;
  const option = options.find(candidate => {
    const command = furnaceEmergencyCommand(candidate);
    return Object.entries(command).every(([key,value]) => Object.hasOwn(field,key) && field[key] === value) &&
      Object.keys(field).every(key => Object.hasOwn(command,key) ||
        internal && key === 'innerMonologue' && typeof field[key] === 'string');
  });
  return option ? { ...furnaceEmergencyCommand(option), innerMonologue: thought[option.furnaceEmergencyMove] } : undefined;
}

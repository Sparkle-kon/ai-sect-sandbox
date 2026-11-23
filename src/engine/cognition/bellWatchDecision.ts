import type { BellWatchMove, BellWatchOption } from '../../types/bellWatch';
import type { LLMDecisionPayload } from '../../types/world';

const thought: Record<BellWatchMove, string> = {
  inspect: '我亲自查楼。没见到的人，还是不知这边的情形。',
  reroute: '改走我认得的山路。走到跟前开口，才算把话带到。',
};

export function bellWatchCommand(option: BellWatchOption): BellWatchOption {
  return {chosenAction:'BELL_WATCH',bellWatchMove:option.bellWatchMove,targetBellWatchId:option.targetBellWatchId};
}

export function exactBellWatchDecision(raw: unknown, options: readonly BellWatchOption[], internal = false): LLMDecisionPayload | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const fields = raw as Record<string, unknown>;
  const result = options.find(option => {
    const command = bellWatchCommand(option);
    return Object.entries(command).every(([key,value]) => Object.hasOwn(fields,key) && fields[key] === value) &&
      Object.keys(fields).every(key => Object.hasOwn(command,key) ||
        internal && key === 'innerMonologue' && typeof fields[key] === 'string');
  });
  return result ? {...bellWatchCommand(result),innerMonologue:thought[result.bellWatchMove]} : undefined;
}

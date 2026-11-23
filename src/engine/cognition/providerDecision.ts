import type { Cultivator, LLMConfig, LLMDecisionPayload, WorldState } from '../../types/world';
import { collectDecisionFacts } from './collectDecisionFacts';
import type { CognitiveRequestOptions } from './cognitiveContext';
import { quoteNativeDecision } from './nativeDecisionGate';
import { renderOrdinaryDecisionPrompt } from './ordinaryDecisionPrompt';
import { decodeOrdinaryDecision } from './ordinaryDecisionReply';
import { requestDecisionPrompt } from './requestDecisionPrompt';

/** A provider-only lane. Missing/invalid/unsent results never synthesize a Utility decision here. */
export async function requestCultivatorLLMDecision(
  cultivator: Cultivator,
  world: WorldState,
  config: LLMConfig,
  requestTick: number,
  options: CognitiveRequestOptions = {},
): Promise<LLMDecisionPayload | undefined> {
  if (options.signal?.aborted || !config.enabled || !config.apiKey.trim() || cultivator.positionPlane === 'immortal') return undefined;
  const snapshot = { cultivator, world, requestTick };
  const gate = quoteNativeDecision(snapshot, config, options);
  if (gate.handled) return gate.decision;
  const facts = collectDecisionFacts(snapshot, gate.quotes);
  const prompt = renderOrdinaryDecisionPrompt(snapshot, gate.quotes, facts);
  return requestDecisionPrompt(config, requestTick, options, prompt,
    parsed => decodeOrdinaryDecision(snapshot, gate.quotes, facts, parsed));
}

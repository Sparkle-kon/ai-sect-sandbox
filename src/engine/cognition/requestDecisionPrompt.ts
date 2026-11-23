import type { LLMConfig, LLMDecisionPayload } from '../../types/world';
import type { CognitiveRequestOptions } from './cognitiveContext';
import { llmScheduler } from '../llmScheduler';
import { privatePersonaText } from '../wildPersonaEngine';

export function llmDecisionEndpoint(config: Pick<LLMConfig, 'apiBaseUrl'>): string {
  return `${config.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
}

// Provenance follows the accepted runtime object, never a property supplied by an external JSON reply.
const providerPersonaDecisions = new WeakSet<LLMDecisionPayload>();
export function isProviderPersonaDecision(decision: unknown): boolean {
  return typeof decision === 'object' && decision !== null && providerPersonaDecisions.has(decision as LLMDecisionPayload);
}

export async function requestDecisionPrompt(config: LLMConfig, requestTick: number,
  options: CognitiveRequestOptions, prompt: string,
  decode: (parsed: Partial<LLMDecisionPayload>) => LLMDecisionPayload | undefined, maxTokens = 450): Promise<LLMDecisionPayload | undefined> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const deadline = setTimeout(abort, 8000);
  try {
    const result = await llmScheduler.requestJson<LLMDecisionPayload>('decision', llmDecisionEndpoint(config), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              '你是一个修仙沙盒模拟器的NPC认知内核，严格只输出符合Schema的JSON对象。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    }, { tick: requestTick, model: config.model || 'gpt-4o-mini', onStart: options.onStart, decode: (value) => {
          const data = value as { choices?: Array<{ message?: { content?: string } }> };
          const rawText = data.choices?.[0]?.message?.content?.trim() ?? '';
          const cleaned = rawText
            .replace(/^```json\s*/i, '')
            .replace(/```$/i, '')
            .trim();
          const parsed = JSON.parse(cleaned) as Partial<LLMDecisionPayload>;

          return decode(parsed);
    } });
    if (result.status !== 'ok' || controller.signal.aborted) return undefined;
    const decision = { ...result.data, innerMonologue: privatePersonaText(result.data.innerMonologue) ?? '先按眼前所见行事。' };
    providerPersonaDecisions.add(decision);
    return decision;
  } catch {
    return undefined;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', abort);
  }
}

import type { RingAudienceSession, RingAudienceStance, RingAudienceTurn } from '../types/ringAudience';
import type { LLMConfig, WorldState } from '../types/world';
import { llmScheduler } from './llmScheduler';
import { isFreshRingAudienceExchange, revoiceRingAudienceTurn } from './ringAudienceEngine';
import { RING_AUDIENCE_MAX_TURNS, ringAudienceMessage } from './ringAudienceTerms';

const VOICE_TIMEOUT_MS = 4000;
const styles = {
  steady: [
    { styleId: 'plain', reply: '我还想照旧路走一阵。' },
    { styleId: 'imagery', reply: '风吹过了山门，我脚下这块石头还没挪。' },
  ],
  wavering: [
    { styleId: 'plain', reply: '我不妨把原先的念头再看一遍。' },
    { styleId: 'imagery', reply: '这话在心中激起一点涟漪。待水静了，再议不迟。' },
  ],
  accepts: [
    { styleId: 'plain', reply: '这番道理，我听进去了。' },
    { styleId: 'imagery', reply: '雾里原有一条路，我如今看得分明了。' },
  ],
  rebels: [
    { styleId: 'plain', reply: '我不肯因这番话改道。' },
    { styleId: 'imagery', reply: '前面那扇门，我不打算推开。' },
  ],
} as const satisfies Readonly<Record<RingAudienceStance, readonly { styleId: string; reply: string }[]>>;

function recentTurn(previous: WorldState, native: WorldState, id: string, index: number):
    { session: RingAudienceSession; turn: RingAudienceTurn } | undefined {
  if (!isFreshRingAudienceExchange(previous, native) || previous.tick !== native.tick ||
      !Number.isSafeInteger(index) || index < 1 || index > RING_AUDIENCE_MAX_TURNS) return undefined;
  const old = previous.playerAvatar.audience?.sessions.filter(row => row.id === id);
  const fresh = native.playerAvatar.audience?.sessions.filter(row => row.id === id);
  if (old?.length !== 1 || fresh?.length !== 1) return undefined;
  const [before] = old, [session] = fresh;
  const turn = session.turns.at(-1);
  if (before.status !== 'open' || before.targetId !== session.targetId || before.role !== session.role ||
      before.aim !== session.aim || before.openedTick !== session.openedTick || before.turns.length !== index - 1 ||
      session.turns.length !== index || turn?.index !== index || turn.tick !== native.tick || turn.source !== 'utility' ||
      ringAudienceMessage(turn.message) !== turn.message) return undefined;
  return { session, turn };
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function readStyle(data: unknown, sessionId: string, turnIndex: number, menu: readonly { styleId: string; reply: string }[]) {
  const choices = record(data)?.choices;
  if (!Array.isArray(choices) || choices.length !== 1) return undefined;
  const content = record(record(choices[0])?.message)?.content;
  if (typeof content !== 'string' || content.length > 400) return undefined;
  const answer = record(JSON.parse(content));
  if (!answer || Object.keys(answer).length !== 3 || !['sessionId', 'turnIndex', 'styleId'].every(key => Object.hasOwn(answer, key)) ||
      answer.sessionId !== sessionId || answer.turnIndex !== turnIndex) return undefined;
  return menu.find(({ styleId }) => styleId === answer.styleId)?.reply;
}

const requestedTurns = new WeakSet<RingAudienceTurn>();

/**
 * Optional presentation over a committed native exchange. The caller can publish native first,
 * then use this version only while its exact world/config/branch is still current.
 */
export async function resolveRingAudienceVoice(previous: WorldState, native: WorldState, sessionId: string,
  turnIndex: number, config: LLMConfig, { signal }: { signal?: AbortSignal } = {}): Promise<WorldState> {
  if (!config.enabled || !config.apiKey.trim() || signal?.aborted) return native;
  const exact = recentTurn(previous, native, sessionId, turnIndex);
  if (!exact || requestedTurns.has(exact.turn)) return native;
  const { session, turn } = exact;
  const menu = styles[turn.stance];
  if (!menu) return native;
  requestedTurns.add(turn);
  const { tone, stance } = turn;
  const model = config.model || 'gpt-4o-mini';
  const controller = new AbortController();
  let stop!: () => void;
  const stopped = new Promise<undefined>(resolve => { stop = () => resolve(undefined); });
  const abort = () => { controller.abort(); stop(); };
  const bound = setTimeout(abort, VOICE_TIMEOUT_MS);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const request = llmScheduler.requestJson('avatar', `${config.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
      signal: controller.signal,
      body: JSON.stringify({
        model, temperature: .25, max_tokens: 110, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '为虚构修仙游戏中的本轮密谈挑选一句已核定的角色用语。按已有事实选择直白或比喻风格，不自拟台词，不修改结果。只根据本地判断的语气和候选句选择，玩家的原话不供参考。只输出 JSON，原样填 sessionId、turnIndex 和所选的 styleId，不得增添字段。' },
          { role: 'user', content: JSON.stringify({ sessionId, turnIndex, tone, styles: menu }) },
        ],
      }),
    }, { tick: native.tick, model, decode: data => readStyle(data, sessionId, turnIndex, menu) });
    const result = await Promise.race([request, stopped]);
    if (controller.signal.aborted || result?.status !== 'ok') return native;
    const still = recentTurn(previous, native, sessionId, turnIndex);
    if (still?.turn !== turn || turn.stance !== stance || turn.tone !== tone) return native;
    return revoiceRingAudienceTurn(native, {
      sessionId, targetId: session.targetId, role: session.role, expectedTurn: turnIndex,
    }, result.data);
  } catch {
    return native;
  } finally {
    clearTimeout(bound);
    signal?.removeEventListener('abort', abort);
  }
}

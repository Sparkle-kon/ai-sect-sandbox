import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llmScheduler } from '../src/engine/llmScheduler';
import { resolveRingAudienceVoice } from '../src/engine/ringAudienceDialogue';
import { sealRingAudience } from '../src/engine/ringAudienceEngine';
import type { LLMConfig } from '../src/types/world';
import { actualAcceptedAudience, audienceActor, audienceCursor, audienceRow } from './ringAudienceNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'mock', model: 'mock' };
const reply = (chosen: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(chosen) } }] }));

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => vi.unstubAllGlobals());

describe('optional Cognitive style for a real private ring audience', () => {
  it('sends only a native tone category and authored style choices, changing no native fact or cost', async () => {
    const { opened, world: native, row, exchangeWorlds } = actualAcceptedAudience();
    const nativeTurn = row.turns.at(-1)!;
    expect(nativeTurn.index).toBeGreaterThan(1);
    const previous = exchangeWorlds.length > 1 ? exchangeWorlds.at(-2)! : opened;
    const chosen = { sessionId: row.id, turnIndex: nativeTurn.index, styleId: 'imagery' };
    const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(chosen));
    vi.stubGlobal('fetch', transport);
    const offline = await resolveRingAudienceVoice(previous, native, row.id, nativeTurn.index, { ...config, enabled: false });
    expect(offline).toBe(native);
    expect(transport).not.toHaveBeenCalled();

    const voiced = await resolveRingAudienceVoice(previous, native, row.id, nativeTurn.index, config);
    expect(voiced).not.toBe(native);
    const finalTurn = audienceRow(voiced).turns.at(-1)!;
    expect(finalTurn).toMatchObject({ source: 'llm', index: nativeTurn.index, tick: native.tick, stance: 'accepts' });
    expect(finalTurn.reply).not.toBe(nativeTurn.reply);
    expect(finalTurn.reply.endsWith(nativeTurn.reply)).toBe(true);
    expect(finalTurn.reply).toContain('此刻尚未去做');
    expect(transport).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(transport.mock.calls[0][1]?.body)) as { messages: { role: string; content: string }[] };
    const prompt = request.messages.find(({ role }) => role === 'user')!.content;
    const packet = JSON.parse(prompt) as { sessionId: string; turnIndex: number; tone: string; styles: { styleId: string; reply: string }[] };
    expect(Object.keys(packet).sort()).toEqual(['sessionId', 'styles', 'tone', 'turnIndex']);
    expect(packet).toMatchObject({ sessionId: row.id, turnIndex: nativeTurn.index, tone: nativeTurn.tone });
    expect(packet.styles).toHaveLength(2);
    expect(finalTurn.reply.startsWith(packet.styles.find(style => style.styleId === chosen.styleId)!.reply)).toBe(true);
    for (const unauthorized of [nativeTurn.message, ...row.turns.slice(0,-1).flatMap(turn => [turn.message, turn.reply]),
      audienceActor(native).secretGoal, nativeTurn.reply, '"essence"', '"before"', '"after"', '"openingSectId"', '"targetId"']) {
      expect(prompt).not.toContain(unauthorized);
    }

    const onlyProse = structuredClone(native);
    const amended = audienceRow(onlyProse).turns.at(-1)!;
    amended.reply = finalTurn.reply;
    amended.source = finalTurn.source;
    expect(voiced).toEqual(onlyProse);
    expect(audienceRow(native).turns.at(-1)?.source).toBe('utility');
    expect((await resolveRingAudienceVoice(previous, native, row.id, nativeTurn.index, config))).toBe(native);
    expect(transport).toHaveBeenCalledTimes(1);
    for (const branch of [native, voiced]) {
      const sealed = sealRingAudience(branch, audienceCursor(audienceRow(branch)));
      expect(audienceRow(sealed).status).toBe('sealed');
      expect(audienceRow(sealed).execution).toBeUndefined();
      expect(sealed.playerAvatar.essence).toBe(native.playerAvatar.essence);
    }
  });
});

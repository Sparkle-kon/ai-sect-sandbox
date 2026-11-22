import { describe, expect, it, vi } from 'vitest';
import { isRingAudienceFrameCurrent } from '../src/components/useRingAudienceControls';
import { createInitialWorld } from '../src/data/initialWorld';
import { llmScheduler } from '../src/engine/llmScheduler';
import { resolveRingAudienceVoice } from '../src/engine/ringAudienceDialogue';
import {
  availableRingAudienceAims, closeRingAudience, exchangeRingAudience, openRingAudience, projectRingAudience, sealRingAudience,
} from '../src/engine/ringAudienceEngine';
import { createTimeline, forkTimeline, readTimelineHead } from '../src/engine/timelineEngine';
import type { RingAudienceRole } from '../src/types/ringAudience';
import type { LLMConfig, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'http://127.0.0.1:1/v1', apiKey: 'mock-only', model: 'fake' };
const calm = '可否先商量？我愿听听你的顾虑。';
const secret = '这句话只在古戒中说，不得带往外界。';
const envelope = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
const snapshot = (world: WorldState) => JSON.stringify(world);
const session = (world: WorldState) => world.playerAvatar.audience!.sessions.at(-1)!;
const cursor = (world: WorldState) => {
  const row = session(world);
  return { sessionId: row.id, targetId: row.targetId, role: row.role, expectedTurn: row.turns.length };
};

function opened(base = createInitialWorld(2031)) {
  const role: RingAudienceRole = 'ring';
  const target = base.cultivators.find(row => availableRingAudienceAims(base, row.id, role).includes('leave_sect'));
  expect(target).toBeDefined();
  const world = openRingAudience(base, { role, targetId: target!.id, aim: 'leave_sect' });
  expect(world).not.toBe(base);
  return world;
}

describe('audience identity before resource, consent or transcript writes', () => {
  it('rejects a wrong target, mode, session or turn cursor; one exact current exchange can settle only once', () => {
    const open = opened();
    const original = snapshot(open), start = cursor(open);
    for (const bad of [
      { ...start, targetId: open.cultivators.find(row => row.id !== start.targetId)!.id },
      { ...start, role: 'heaven' as const },
      { ...start, sessionId: 'not-a-real-session' },
      { ...start, expectedTurn: start.expectedTurn + 1 },
    ]) {
      expect(exchangeRingAudience(open, { ...bad, message: calm })).toBe(open);
      expect(closeRingAudience(open, bad)).toBe(open);
      expect(sealRingAudience(open, bad)).toBe(open);
    }
    expect(snapshot(open)).toBe(original);

    const valid = exchangeRingAudience(open, { ...start, message: calm });
    expect(valid).not.toBe(open);
    expect(session(valid).turns).toHaveLength(1);
    expect(valid.playerAvatar.essence).toBe(open.playerAvatar.essence - session(valid).turns[0].cost);
    const after = snapshot(valid);
    expect(exchangeRingAudience(valid, { ...start, message: calm })).toBe(valid);
    expect(snapshot(valid)).toBe(after);
  });

  it('does not write against a dead target, realm absence, expired month or below-cost essence', () => {
    const open = opened();
    for (const change of [
      (world: WorldState) => {
        const target = world.cultivators.find(row => row.id === session(world).targetId)!;
        target.hp = 0;
        target.alive = false;
      },
      (world: WorldState) => {
        world.cultivators.find(row => row.id === session(world).targetId)!.positionPlane = 'frontier';
      },
      (world: WorldState) => { world.tick += 1; },
      (world: WorldState) => { world.playerAvatar.essence = 0; },
    ]) {
      const copy = structuredClone(open);
      change(copy);
      const before = snapshot(copy);
      expect(exchangeRingAudience(copy, { ...cursor(copy), message: calm })).toBe(copy);
      expect(sealRingAudience(copy, cursor(copy))).toBe(copy);
      expect(snapshot(copy)).toBe(before);
    }
  });

  it('does not make private pressure a public event, pledge or consummated action', () => {
    const open = opened();
    const targetId = session(open).targetId;
    const turn = exchangeRingAudience(open, { ...cursor(open), message: '立刻离宗，否则我必杀了你！' });
    expect(turn).not.toBe(open);
    expect(session(turn).turns).toHaveLength(1);
    expect(session(turn).turns[0].tone).toBe('pressure');
    expect(session(turn).wavering).toBeLessThan(session(open).wavering);
    expect(sealRingAudience(turn, cursor(turn))).toBe(turn);
    expect(turn.events).toEqual(open.events);
    expect(turn.chronicleArchive).toEqual(open.chronicleArchive);
    expect(turn.playerAvatar.pendingOrder).toEqual(open.playerAvatar.pendingOrder);
    expect(turn.cultivators.find(row => row.id === targetId)?.sectId).toBe(session(open).openingSectId);
  });
});

describe('the exact read-only UI frame owns any asynchronous audience write', () => {
  it('requires the same world, timeline pointer, revision and provider config rather than same public tick', () => {
    const open = opened();
    const timeline = createTimeline(open);
    const sibling = forkTimeline(timeline, open.tick, {
      type: 'WHISPER_MIND', targetCultivatorId: session(open).targetId, whisperText: '支线同一轮。',
    });
    const expected = { world: open, history: timeline, revision: 4, config };
    expect(isRingAudienceFrameCurrent(expected, { ...expected, blocked: false })).toBe(true);
    for (const actual of [
      { ...expected, world: structuredClone(open), blocked: false },
      { ...expected, history: sibling, blocked: false },
      { ...expected, revision: 5, blocked: false },
      { ...expected, config: { ...config }, blocked: false },
      { ...expected, blocked: true },
    ]) expect(isRingAudienceFrameCurrent(expected, actual)).toBe(false);
  });

  it('does not provide the private turn to the wrong target or reader mode; projected rows are copies', () => {
    const first = opened();
    const after = exchangeRingAudience(first, { ...cursor(first), message: secret });
    const id = session(after).targetId;
    const other = after.cultivators.find(row => row.id !== id)!.id;
    expect(projectRingAudience(after, 'heaven', id)).toBeUndefined();
    expect(projectRingAudience(after, 'ring', other)).toBeUndefined();
    const projected = projectRingAudience(after, 'ring', id)!;
    expect(projected.turns[0].message).toBe(secret);
    projected.turns[0].message = '屏幕上的副本被改。';
    expect(session(after).turns[0].message).toBe(secret);
    expect(JSON.stringify(after.events)).not.toContain(secret);
    expect(JSON.stringify(after.chronicleArchive)).not.toContain(secret);
  });
});

describe('optional audience voice is literal only and cannot settle state after a stale turn', () => {
  it('sends only a native tone category, never the private utterance, rejecting a sibling cursor, forged action/cost and raw reply', async () => {
    const beforeOpen = opened();
    const past = '前一轮仍留在古戒里的话。';
    const hiddenGoal = 'NPC不曾说出的真实打算。';
    beforeOpen.cultivators.find(row => row.id === session(beforeOpen).targetId)!.secretGoal = hiddenGoal;
    const before = exchangeRingAudience(beforeOpen, { ...cursor(beforeOpen), message: past });
    const { id } = session(before);
    const corrupt: Array<(styleId: string) => unknown> = [
      styleId => ({ sessionId: 'other-session', turnIndex: 2, styleId }),
      styleId => ({ sessionId: id, turnIndex: 1, styleId }),
      styleId => ({ sessionId: id, turnIndex: 2, styleId, action: 'leave_sect', cost: 0, stance: 'accepts' }),
      () => ({ sessionId: id, turnIndex: 2, reply: '自造台词。' }),
      () => ({ sessionId: id, turnIndex: 2, styleId: 'not-in-menu' }),
    ];
    for (const mutate of corrupt) {
      const after = exchangeRingAudience(before, { ...cursor(before), message: secret });
      expect(after).not.toBe(before);
      expect(session(after).turns).toHaveLength(2);
      const resultBefore = snapshot(after);
      let wire = '';
      let sent: Record<string, unknown> | undefined;
      const request = vi.spyOn(llmScheduler, 'requestJson').mockImplementation(async (_kind, _url, init, options) => {
        wire = String(init?.body);
        const body = JSON.parse(wire) as { messages: Array<{ role: string; content: string }> };
        const input = JSON.parse(body.messages.find(row => row.role === 'user')!.content) as { styles: { styleId: string }[] };
        sent = input;
        const decoded = options.decode?.(envelope(mutate(input.styles[0].styleId)));
        return decoded === undefined ? { status: 'invalid_json' } : { status: 'ok', data: decoded };
      });
      try {
        expect(await resolveRingAudienceVoice(before, after, id, 2, config)).toBe(after);
        expect(request).toHaveBeenCalledTimes(1);
        expect(Object.keys(sent!).sort()).toEqual(['sessionId', 'styles', 'tone', 'turnIndex']);
        expect(sent?.tone).toBe(after.playerAvatar.audience?.sessions.at(-1)?.turns.at(-1)?.tone);
        expect(JSON.stringify(sent)).not.toContain(secret);
        expect(wire).not.toContain(past);
        expect(wire).not.toContain(hiddenGoal);
        expect(snapshot(after)).toBe(resultBefore);
        expect(after.playerAvatar.pendingOrder).toEqual(before.playerAvatar.pendingOrder);
        expect(after.events).toEqual(before.events);
      } finally { request.mockRestore(); }
    }
  });

  it('rejects an unrecognized prior sibling despite exact matching counters or a delayed command after abort', async () => {
    const origin = createInitialWorld(2031);
    const targetId = session(opened(origin)).targetId;
    const fork = forkTimeline(createTimeline(origin), origin.tick, {
      type: 'WHISPER_MIND', targetCultivatorId: targetId, whisperText: '这是另一支线的私念。',
    });
    const before = opened(readTimelineHead(fork, 'main')!);
    const sibling = opened(readTimelineHead(fork)!);
    expect(cursor(sibling)).toEqual(cursor(before));
    const native = exchangeRingAudience(before, { ...cursor(before), message: calm });

    const fail = vi.spyOn(llmScheduler, 'requestJson').mockRejectedValue(new Error('wrong branch must not call'));
    try {
      expect(await resolveRingAudienceVoice(sibling, native, session(native).id, 1, config)).toBe(native);
      expect(fail).not.toHaveBeenCalled();
    } finally { fail.mockRestore(); }

    const abort = new AbortController();
    let allowReturn: (() => void) | undefined;
    const release = new Promise<void>(resolve => { allowReturn = resolve; });
    const request = vi.spyOn(llmScheduler, 'requestJson').mockImplementation(async (_kind, _url, init, options) => {
      await release;
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const input = JSON.parse(body.messages.find(row => row.role === 'user')!.content) as { styles: { styleId: string }[] };
      const decoded = options.decode?.(envelope({ sessionId: session(native).id, turnIndex: 1, styleId: input.styles[0].styleId }));
      return decoded === undefined ? { status: 'invalid_json' } : { status: 'ok', data: decoded };
    });
    try {
      const delayed = resolveRingAudienceVoice(before, native, session(native).id, 1, config, { signal: abort.signal });
      expect(request).toHaveBeenCalledTimes(1);
      abort.abort();
      allowReturn!();
      expect(await delayed).toBe(native);
      expect(session(native).turns[0].source).toBe('utility');
      expect(sibling.playerAvatar.audience?.sessions[0].turns).toEqual([]);
    } finally { request.mockRestore(); }
  });
});

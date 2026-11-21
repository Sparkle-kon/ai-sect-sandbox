import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectChronicleReading } from '../src/engine/novelGenerator';
import { settleChronicleOnline } from '../src/engine/chronicleRuntime';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'example-for-test', model: 'fixture-model' };
const decisions = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(world.cultivators.map(({ id }) =>
  [id, { chosenAction: 'REST', innerMonologue: '静修' } satisfies LLMDecisionPayload]));
const envelope = (report: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) } }] }));

function monthTwelve() {
  let world = createInitialWorld();
  for (let month = 2; month <= 12; month++) world = advanceWorldTick(world, decisions(world), () => 0.9);
  return world;
}
afterEach(() => vi.unstubAllGlobals());

describe('public chronicle engine integration', () => {
  it('seals a full interval on rollover and includes late public actions, but not private whispers', () => {
    let world = monthTwelve();
    expect(world.chronicleArchive.chapters).toEqual([]);
    world = executeGodIntervention(world, { type: 'SPAWN_TREASURE', targetLocationId: 'loc-taixu' });
    const treasure = world.events[0];
    world = executeGodIntervention(world, { type: 'WHISPER_MIND', targetCultivatorId: 'npc-1', whisperText: '藏于丹房的密信' });
    const runtime = advanceWorldTick(world, decisions(world), () => 0.9);
    const chapter = runtime.chronicleArchive.chapters[0];
    expect(chapter.title).toMatch(/^第1章：/u);
    expect([chapter.startTick, chapter.endTick]).toEqual([1, 12]);
    expect(chapter.anchors.map(({ id }) => id)).toContain(treasure.id);
    expect(chapter.anchors.map(({ id }) => id)).toContain('evt-init-1');
    expect(chapter.body).not.toContain('藏于丹房的密信');
  });

  it('sends one bounded public request in JSON mode, preserving archive facts and stable trace', async () => {
    const world = executeGodIntervention(monthTwelve(), { type: 'WHISPER_MIND', targetCultivatorId: 'npc-1', whisperText: '不能外送的隐私' });
    const deferred = advanceWorldTick(world, decisions(world), () => 0.9, 'deferred');
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const modelRequest = JSON.parse(String(init.body));
      expect(modelRequest.messages[1].content).not.toContain('不能外送的隐私');
      expect(modelRequest.messages[0].content).toContain('不用纪元、年表、逐轮或纪年标题');
      expect(modelRequest.messages[0].content).toContain('对白由应用照录公开原文');
      const data = JSON.parse(modelRequest.messages[1].content) as { anchors: Array<{ id: string }> };
      return envelope({ title: '风自山门起', body: '风声掠过山门，史官循案核对这一年的所见。', anchorIds: data.anchors.map(({ id }) => id) });
    });
    vi.stubGlobal('fetch', fetchMock);
    await settleChronicleOnline(deferred, config);
    const book = deferred.chronicleArchive.chapters[0];
    expect(book.title).toBe('第1章：风自山门起');
    expect(book.source).toBe('llm');
    expect(book.body).toContain('公开史料索引');
    expect(projectChronicleReading(book).sections.map(({ paragraph }) => paragraph).join('')).not.toContain('史官循案');
    await settleChronicleOnline(deferred, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the factual offline scenes if an optional draft uses eras or adds dialogue', async () => {
    const both = [
      { title: '第三纪元：风起', body: '故事从山门写起。' },
      { title: '风起山门', body: '那人忽然说道：「这是一句未曾发生的话。」' },
    ];
    for (const draft of both) {
      const due = monthTwelve();
      const deferred = advanceWorldTick(due, decisions(due), () => 0.9, 'deferred');
      const mock = vi.fn(async (_url: string, init: RequestInit) => {
        const payload = JSON.parse(String(init.body));
        const facts = JSON.parse(payload.messages[1].content) as { anchors: Array<{ id: string }> };
        return envelope({ ...draft, anchorIds: facts.anchors.map(({ id }) => id) });
      });
      vi.stubGlobal('fetch', mock);
      await settleChronicleOnline(deferred, config);
      const chapter = deferred.chronicleArchive.chapters[0];
      expect(chapter.source).toBe('utility');
      expect(chapter.body).not.toContain('一句未曾发生的话');
      expect(chapter.title).not.toContain('纪元');
      expect(mock).toHaveBeenCalledTimes(1);
    }
  });

  it('falls back on malformed or reordered anchor trace', async () => {
    const world = monthTwelve();
    const deferred = advanceWorldTick(world, decisions(world), () => 0.9, 'deferred');
    const wrong = vi.fn(async () => envelope({ title: '伪史', body: '虚构内容', anchorIds: ['not-an-anchor'] }));
    vi.stubGlobal('fetch', wrong);
    await settleChronicleOnline(deferred, config);
    expect(deferred.chronicleArchive.chapters[0].source).toBe('utility');
    expect(deferred.chronicleArchive.chapters[0].body).not.toContain('虚构内容');
  });
});

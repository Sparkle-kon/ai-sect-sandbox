import { describe, expect, it, vi } from 'vitest';
import { applyDialogueLanguage, enrichTickDialogues } from '../src/engine/dialogueEngine';
import { llmScheduler } from '../src/engine/llmScheduler';
import { executeGodIntervention } from '../src/engine/worldEngine';
import { availableChronicleChapter, resolveChronicleChapter } from '../src/engine/novelGenerator';
import { createPublicDialogueResolver } from '../src/engine/publicDialogueProvenance';
import type { LLMConfig, WorldState } from '../src/types/world';
import { actualCommonBond, actualDefenderWinsLethally, actualPublicBondDuel, bondActor, firstId, nearId, secondId } from './dramaticBondNativeFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'http://127.0.0.1:1', apiKey: 'mock-only', model: 'mock' };
const actorSecret = '不许出站：此间只在个人识海回响。';
const sourceSecret = '不许出站：这条只记在秘境原卷。';

type Choice = { slot: number; speakerId: string; optionId: string };
type Offered = { id: string; kind: string; slots: {
  slot: number; speakerId: string; speakerName: string; options: { id: string; text: string }[];
}[] };

let actual: ReturnType<typeof actualDefenderWinsLethally> | undefined;
function fixture() {
  actual ??= actualDefenderWinsLethally(actualCommonBond().clash);
  const world = structuredClone(actual.world);
  const death = world.events.find(row => row.id === actual!.death.id)!;
  const plan = availableChronicleChapter(world, true);
  expect(plan).toBeDefined();
  const chapter = resolveChronicleChapter(world, plan!);
  expect(chapter?.anchors.some(row => row.id === death.id && row.dialogue)).toBe(true);
  expect(death.duelWinnerId).toBe(secondId);
  expect(death.dialogue?.turns).toHaveLength(4);
  return { world, death, chapter: chapter! };
}

const mustEvent = (world: WorldState, id: string) => world.events.find(row => row.id === id)!;
const providerReply = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
const choices = (event: Offered): Choice[] => event.slots.map(({ slot, speakerId, options }) =>
  ({ slot, speakerId, optionId: options[0].id }));

describe('native lethal farewell keeps its original public provenance', () => {
  it('changes only the two openings across known versions, leaving the actual fallen speaker and victor closing literal', () => {
    const { world, death, chapter } = fixture();
    const base = death.dialogue!.turns.map(row => ({ ...row }));
    expect(base[2].speakerId).toBe(firstId); // The challenger fell; second actor is the victor.
    expect(base[3].text).toContain(bondActor(world, secondId).name);

    const next = applyDialogueLanguage(world.events, [death.id], { exchanges: [{
      id: death.id, lines: ['休把前言问剑。', '这一式只问眼前。'],
    }] });
    const current = mustEvent({ ...world, events: next }, death.id);
    expect(current.dialogue?.turns.slice(2)).toEqual(base.slice(2));
    expect(death.dialogue?.turns).toEqual(base);
    const proof = createPublicDialogueResolver({ ...world, events: next });
    expect(proof.event(death.id)).toMatchObject({ status: 'verified', source: 'llm', alternateVersion: true,
      turns: [{ speakerId: firstId }, { speakerId: secondId }, base[2], base[3]] });
    expect(proof.chapter(chapter.id, death.id)).toMatchObject({ status: 'fragment', source: 'utility', alternateVersion: true,
      turns: base });

    const threeLines = applyDialogueLanguage(world.events, [death.id], { exchanges: [{
      id: death.id, lines: ['休把前言问剑。', '这一式只问眼前。', '伪造死前的话。'],
    }] });
    expect(threeLines).toBe(world.events);
  });

  it('withholds all words when the archived or later variant replaces the actual farewell, speaker or outcome', () => {
    const { world, death, chapter } = fixture();
    const mutationCases: Array<(copy: WorldState) => void> = [
      copy => {
        const raw = mustEvent(copy, death.id);
        raw.dialogue!.source = 'llm';
        raw.dialogue!.turns[2].text = '此句并非原来实录。';
      },
      copy => {
        const raw = mustEvent(copy, death.id);
        raw.dialogue!.source = 'llm';
        raw.dialogue!.turns[2].speakerId = secondId;
        raw.dialogue!.turns[2].speakerName = bondActor(copy, secondId).name;
      },
      copy => {
        const raw = mustEvent(copy, death.id);
        raw.dialogue!.source = 'llm';
        raw.dialogue!.turns[3].text = '此段捏造最后胜负。';
      },
      copy => {
        const archive = copy.chronicleArchive.chapters.find(row => row.id === chapter.id)!;
        archive.anchors.find(row => row.id === death.id)!.dialogue!.turns[2].text = '此为被改写的档案。';
      },
    ];
    for (const mutate of mutationCases) {
      const copy = structuredClone(world);
      mutate(copy);
      const proof = createPublicDialogueResolver(copy);
      expect(proof.event(death.id)).toEqual({ eventId: death.id, tick: death.tick, surface: 'event', status: 'conflict' });
      expect(proof.chapter(chapter.id, death.id)).toEqual({ eventId: death.id, tick: death.tick, surface: 'chapter', status: 'conflict' });
    }

    const clipped = structuredClone(world);
    clipped.events = clipped.events.filter(row => row.id !== death.id);
    const proof = createPublicDialogueResolver(clipped);
    expect(proof.event(death.id)).toBeUndefined();
    expect(proof.chapter(chapter.id, death.id)).toMatchObject({
      status: 'fragment', source: 'utility', turns: death.dialogue!.turns,
    });
  });
});

describe('sealed public figurative-choice request', () => {
  it('sends only the existing native public opening slots; archived farewell, closing and private scope stay local', async () => {
    const { world, death } = fixture();
    const privateActor = bondActor(world, firstId);
    privateActor.secretGoal = actorSecret;
    privateActor.innerMonologue = actorSecret;
    let offered: Offered[] = [], outbound = '';
    const request = vi.spyOn(llmScheduler, 'requestJson').mockImplementation(async (_kind, _url, init, options) => {
      outbound = String(init?.body);
      const input = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
      offered = JSON.parse(input.messages.find(row => row.role === 'user')!.content) as Offered[];
      const result = options.decode?.(providerReply({ exchanges: offered.map(row => ({ id: row.id,
        choices: row.slots.map(({ slot, speakerId, options: candidates }, index) => ({ slot, speakerId,
          optionId: candidates.find(option => option.text !== death.dialogue!.turns[index].text)!.id })) })) }));
      return result === undefined ? { status: 'invalid_json' } : { status: 'ok', data: result };
    });
    try {
      const next = await enrichTickDialogues(world, config);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toBe('dialogue');
      for (const text of [actorSecret, death.dialogue!.turns[2].text, death.dialogue!.turns[3].text, death.description])
        expect(outbound).not.toContain(text);
      expect(offered.map(row => row.id)).toEqual([death.id]);
      expect(Object.keys(offered[0]).sort()).toEqual(['id', 'kind', 'slots']);
      expect(offered[0].slots.map(({ slot, speakerId }) => [slot, speakerId])).toEqual([[1, firstId], [2, secondId]]);
      expect(mustEvent(next, death.id).dialogue?.source).toBe('llm');
      expect(mustEvent(next, death.id).dialogue?.turns.slice(2)).toEqual(death.dialogue?.turns.slice(2));
    } finally {
      request.mockRestore();
    }
  });

  it('does not contact the provider for an actual hidden-venue death or private native source', async () => {
    const request = vi.spyOn(llmScheduler, 'requestJson').mockRejectedValue(new Error('test has no provider'));
    try {
      const { world, death } = fixture();
      const sameSourceInPrivate = { ...death, witnessScope: 'participants' as const, description: sourceSecret };
      const privateWorld = { ...world, events: [sameSourceInPrivate] };
      expect(await enrichTickDialogues(privateWorld, config)).toBe(privateWorld);

      const { clash } = actualCommonBond();
      for (const site of ['loc-secret-1', 'loc-blood']) {
        let base = structuredClone(clash);
        for (const id of [firstId, secondId]) bondActor(base, id).locationId = site;
        for (let step = 0; step < 2; step++) base = executeGodIntervention(base,
          { type:'TRIBULATION_STRIKE', targetCultivatorId:firstId });
        const hidden = actualPublicBondDuel(base);
        const hiddenDeath = mustEvent(hidden, `evt-${hidden.tick}-${firstId}-kill`);
        expect(hiddenDeath).toMatchObject({ category: 'death', locationId: site, duelWinnerId: secondId });
        expect(await enrichTickDialogues(hidden, config)).toBe(hidden);
      }
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
    }
  });

  it('rejects provider attempts to add farewell, role swap, unlisted option or raw author text', async () => {
    const { world, death } = fixture();
    const variants: Array<(exchange: Offered) => unknown> = [
      exchange => ({ id: exchange.id, choices: [...choices(exchange), { slot: 3, speakerId: firstId, optionId: 'forged-farewell' }] }),
      exchange => ({ id: exchange.id, choices: choices(exchange).map((choice, index) => index === 0 ?
        { ...choice, speakerId: nearId } : choice) }),
      exchange => ({ id: exchange.id, choices: choices(exchange).map((choice, index) => index === 0 ?
        { ...choice, optionId: 'not-in-offer' } : choice) }),
      exchange => ({ id: exchange.id, choices: choices(exchange), farewell: '自造绝笔。' }),
      exchange => ({ id: exchange.id, lines: ['试图跳过密封选项。', '试图重写开头。'] }),
    ];
    for (const mutate of variants) {
      const request = vi.spyOn(llmScheduler, 'requestJson').mockImplementation(async (_kind, _url, init, options) => {
        const input = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
        const offered = JSON.parse(input.messages.find(row => row.role === 'user')!.content) as Offered[];
        const exchange = offered.find(row => row.id === death.id)!;
        const result = options.decode?.(providerReply({ exchanges: [mutate(exchange)] }));
        return result === undefined ? { status: 'invalid_json' } : { status: 'ok', data: result };
      });
      try {
        expect(await enrichTickDialogues(world, config)).toBe(world);
        expect(request).toHaveBeenCalledTimes(1);
      } finally {
        request.mockRestore();
      }
    }
  });
});

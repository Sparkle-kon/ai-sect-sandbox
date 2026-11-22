import { describe, expect, it } from 'vitest';
import { createChronicleBookSourceResolver } from '../src/components/chronicleBookSources';
import { createInitialWorld } from '../src/data/initialWorld';
import { publicChronicleChapters } from '../src/engine/coldHistoryEngine';
import { publicChronicleExcerpt } from '../src/engine/chroniclePublicProse';
import { projectChronicleReading } from '../src/engine/novelGenerator';
import { createPublicDialogueResolver } from '../src/engine/publicDialogueProvenance';
import { createTimeline, forkTimeline, readTimelineHead } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ChronicleChapter, WorldState } from '../src/types/world';
import { dialogueProofBase, playPublicDialogueProof, publicDialogueProofFixture } from './fixtures/publicDialogueFixture';

const previousId = 'chapter-1-12', currentId = 'chapter-13-24';
const openingSource = 'evt-12-elder-tianji-1-social';
let at25: WorldState | undefined;
const native = () => {
  if (!at25) {
    let world = createInitialWorld(1);
    while (world.tick < 25) world = advanceWorldTick(world);
    at25 = world;
  }
  const world = structuredClone(at25);
  return {
    world,
    current: world.chronicleArchive.chapters.find(row => row.id === currentId)!,
    previous: world.chronicleArchive.chapters.find(row => row.id === previousId)!,
  };
};
const ready = (world: WorldState, current: ChronicleChapter) => ({
  world, current, reading: projectChronicleReading(current, undefined, true, world),
  readable: (row: ChronicleChapter) => row, resolveDialogue: createPublicDialogueResolver(world).chapter,
});

describe('exact book footnote sources', () => {
  it('opens the actual routed previous scene, not a later source with the same title or a same-chapter note', () => {
    const { world, current, previous } = native();
    const original = previous.anchors.find(row => row.id === openingSource)!;
    const later = current.anchors[0];
    world.events.unshift({ ...later, id: 'other-later-public-source', title: original.title, description: '后来的同名异事。' });
    const input = ready(world, current);
    expect(input.reading.continuity?.opening).toMatchObject({ chapterId: previousId, eventId: openingSource });
    const before = JSON.stringify(world);
    const sources = createChronicleBookSourceResolver(input);
    expect(sources([openingSource], previousId)).toMatchObject([{
      chapterNumber: 1, tick: original.tick, year: original.year, month: original.month,
      title: '蒋观星与苏清寒坐而论道', detail: publicChronicleExcerpt(original.description),
    }]);
    expect(sources([openingSource])).toEqual([]);
    expect(sources(['other-later-public-source'], previousId)).toEqual([]);
    expect(sources([openingSource], currentId)).toEqual([]);
    expect(sources([later.id])).toMatchObject([{ tick: later.tick, title: publicChronicleExcerpt(later.title) }]);
    expect(sources([later.id])[0]).not.toHaveProperty('chapterNumber');
    expect(JSON.stringify(world)).toBe(before);
  });

  it('rejects later, hidden or ambiguous copies of the real prior source, even with a held opening claim', () => {
    const original = native();
    const reading = ready(original.world, original.current).reading;
    const anchor = original.previous.anchors.find(row => row.id === openingSource)!;
    for (const mode of ['later', 'private', 'shelf', 'readable'] as const) {
      const { world, current, previous } = native();
      if (mode === 'later') world.events.unshift({ ...anchor, tick: current.startTick, title: anchor.title, description: '不得取用的异文。' });
      if (mode === 'private') world.events.unshift({ ...anchor, witnessScope: 'participants' });
      if (mode === 'shelf') world.coldHistory = {
        ...world.coldHistory, chapters: [...world.coldHistory.chapters, structuredClone(previous)],
      };
      const input = ready(world, current);
      const readable = (row: ChronicleChapter) => mode === 'readable' && row.id === previousId
        ? { ...row, anchors: row.anchors.filter(item => item.id !== openingSource) } : row;
      expect(createChronicleBookSourceResolver({ ...input, reading, readable })([openingSource], previousId), mode).toEqual([]);
    }
  });

  it('uses real cold chapter anchors after live and source-ring pruning, but does not reconstruct a missing volume', () => {
    let { world } = native();
    while (world.tick < 97) world = advanceWorldTick(world);
    const previous = world.coldHistory.chapters.find(row => row.id === previousId);
    expect(previous).toBeDefined();
    const current = publicChronicleChapters(world).find(row => row.id === currentId)!;
    expect([...world.events, ...world.chronicleArchive.anchors].some(row => row.id === openingSource)).toBe(false);
    const input = ready(world, current);
    const source = createChronicleBookSourceResolver(input)([openingSource], previousId);
    expect(source).toMatchObject([{ chapterNumber: 1, tick: 12, title: '蒋观星与苏清寒坐而论道' }]);
    expect(source[0].dialogue).toBeUndefined();
    world.coldHistory = { ...world.coldHistory, chapters: world.coldHistory.chapters.filter(row => row.id !== previousId) };
    expect(createChronicleBookSourceResolver(input)([openingSource], previousId)).toEqual([]);
  });

  it('requires every exact same-chapter section and anchor in a group, without trusting edited prose or duplicate IDs', () => {
    const { world, current } = native();
    const input = ready(world, current);
    const first = input.reading.sections[0], second = input.reading.sections[1], third = input.reading.sections[2];
    const sources = createChronicleBookSourceResolver(input);
    expect(sources([second.eventId, first.eventId])).toEqual([...sources([second.eventId]), ...sources([first.eventId])]);
    expect(sources([third.eventId])).toHaveLength(1);
    expect(sources([first.eventId, first.eventId])).toEqual([]);
    expect(sources([first.eventId, 'not-a-filed-source'])).toEqual([]);
    const readAltered = { ...input.reading, sections: [{ ...first, paragraph: '未经核定的新稿。' }, ...input.reading.sections.slice(1)] };
    expect(createChronicleBookSourceResolver({ ...input, reading: readAltered })([first.eventId, second.eventId])).toEqual([]);
    expect(createChronicleBookSourceResolver({ ...input, reading: { ...input.reading, sections: [...input.reading.sections, first] } })([first.eventId])).toEqual([]);
    const altered = { ...current, anchors: current.anchors.map(row => row.id === first.eventId ? { ...row, description: '别支改稿。' } : row) };
    expect(createChronicleBookSourceResolver(ready(world, altered))([first.eventId])).toEqual([]);
  });

  it('does not retain authority when the frame gets a same-tick replacement source', () => {
    const {world, chapter, event} = publicDialogueProofFixture();
    const resolve = createChronicleBookSourceResolver(ready(world, chapter));
    expect(resolve([event.id])).toHaveLength(1);
    const index = world.events.findIndex(row => row.id === event.id);
    world.events[index] = { ...world.events[index], witnessScope: 'participants' };
    expect(resolve([event.id])).toEqual([]);
  });

  it('uses only independently scoped attributable dialogue and keeps conflict status free of words', () => {
    const { world, chapter, event } = publicDialogueProofFixture();
    chapter.body = '未经核定的原稿私语。';
    const input = ready(world, chapter);
    const genuine = input.resolveDialogue(chapter.id, event.id);
    expect(genuine?.status).toBe('verified');
    const pretend = genuine && 'turns' in genuine ? {
      ...genuine, turns: genuine.turns.map(turn => ({ ...turn, text: '回调伪造的词。' })),
    } : undefined;
    const rows = createChronicleBookSourceResolver({ ...input, resolveDialogue: () => pretend })([event.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].dialogue).toEqual(genuine);
    expect(JSON.stringify(rows)).not.toMatch(/回调伪造|未公开想法|未经核定的原稿私语/);
    expect(createChronicleBookSourceResolver({ ...input, resolveDialogue: () => input.resolveDialogue(chapter.id, 'another-id') })([event.id])[0].dialogue).toBeUndefined();
    world.events.find(row => row.id === event.id)!.dialogue!.turns[0].text = '冲突的新词也不得泄露。';
    const conflict = createChronicleBookSourceResolver(ready(world, chapter))([event.id]);
    expect(conflict[0].dialogue).toEqual({ eventId: event.id, tick: event.tick, surface: 'chapter', status: 'conflict' });
    expect(JSON.stringify(conflict)).not.toContain('冲突的新词');
  });

  it('refuses another actual branch with the same native event and chapter IDs', () => {
    const base = dialogueProofBase();
    const timeline = forkTimeline(createTimeline(base.world), base.world.tick, {
      type: 'WHISPER_MIND', targetCultivatorId: base.secondId, whisperText: '未公开支线不得泄露。',
    });
    const main = playPublicDialogueProof(readTimelineHead(timeline, 'main')!, base.actorId, base.firstId);
    const fork = playPublicDialogueProof(readTimelineHead(timeline)!, base.actorId, base.secondId);
    expect(main.event.id).toBe(fork.event.id);
    expect(main.chapter.id).toBe(fork.chapter.id);
    expect(createChronicleBookSourceResolver(ready(main.world, main.chapter))([main.event.id])).toHaveLength(1);
    expect(createChronicleBookSourceResolver(ready(fork.world, fork.chapter))([fork.event.id])).toHaveLength(1);
    expect(createChronicleBookSourceResolver(ready(fork.world, main.chapter))([main.event.id])).toEqual([]);
  });
});

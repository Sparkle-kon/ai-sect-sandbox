import { describe, expect, it } from 'vitest';
import { COLD_HISTORY_MIN_HOT_CHAPTERS, publicChronicleChapters } from '../src/engine/coldHistoryEngine';
import { createInitialWorld } from '../src/data/initialWorld';
import { archiveChronicleEvents, availableChronicleChapter, createChronicleArchive, projectChronicleReading, resolveChronicleChapter } from '../src/engine/novelGenerator';
import { projectChronicleLead } from '../src/engine/chronicleLead';
import type { WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.chronicleArchive = createChronicleArchive();
  const actor = world.cultivators[0];
  const fact = (id: string, tick = world.tick, title = id): WorldEvent => ({
    id, tick, year: world.year, month: world.month, title, description: `${title}之事见于当月史牍。`,
    category: 'heavenly', actorIds: [actor.id], locationId: actor.locationId,
  });
  return { world, actor, fact };
}

describe('public literary chronicle archive', () => {
  it('preserves early facts across the 120-event UI trim and constructs a deterministic typed chapter', () => {
    const { world, actor, fact } = fixture();
    actor.innerMonologue = '不得采入的内心独语';
    const original = { ...fact('first-public', 1, '山门初启'), category: 'breakthrough' as const };
    archiveChronicleEvents(world, [original]);
    const later = Array.from({ length: 160 }, (_, index) => fact(`later-${index}`, 12));
    world.tick = 12;
    archiveChronicleEvents(world, later);
    world.events = later.slice(0, 120);
    expect(world.events.some(({ id }) => id === original.id)).toBe(false);
    const plan = availableChronicleChapter(world)!;
    expect(plan.anchors.some(({ id }) => id === original.id)).toBe(true);
    expect(plan.anchors.length).toBeLessThanOrEqual(18);
    const copy = structuredClone(world);
    const result = resolveChronicleChapter(world, plan)!;
    expect(result).toEqual(resolveChronicleChapter(copy, plan));
    expect(result.body).toContain('山门初启');
    expect(result.body).not.toContain(actor.innerMonologue);
    expect(result.biographies[0]).toMatchObject({ actorId: actor.id, anchorIds: expect.arrayContaining([original.id]) });
    expect(resolveChronicleChapter(world, plan)).toBeNull();
    expect(availableChronicleChapter(world, true)).toBeUndefined();
  });

  it('excludes participant-only details and retains bounded public dialogue with stable validated speaker IDs', () => {
    const { world, actor, fact } = fixture();
    const talk = { kind: 'trade' as const, source: 'utility' as const, turns: [
      { speakerId: actor.id, speakerName: actor.name, text: '愿以灵草相换。' },
      { speakerId: 'stranger', speakerName: '无籍者', text: '不应被采入' },
    ] };
    archiveChronicleEvents(world, [
      { ...fact('sealed', 1, '密议'), witnessScope: 'participants', dialogue: talk },
      { ...fact('open', 1, '坊市问价'), dialogue: talk },
      fact('open', 1, '重复记录'),
    ]);
    const plan = availableChronicleChapter(world, true)!;
    expect(plan.anchors).toHaveLength(1);
    expect(plan.anchors[0].dialogue?.turns).toEqual([talk.turns[0]]);
    const chapter = resolveChronicleChapter(world, plan)!;
    expect(chapter.body).toContain('愿以灵草相换');
    expect(JSON.stringify(chapter)).not.toMatch(/密议|不应被采入|重复记录/);
  });

  it('does not adopt stale or modified plans and keeps a factual index with bounded literary prose', () => {
    const { world, fact } = fixture();
    archiveChronicleEvents(world, [fact('known', 1, '灵脉涌动')]);
    expect(availableChronicleChapter(world)).toBeUndefined();
    const initial = availableChronicleChapter(world, true)!;
    world.tick++;
    expect(resolveChronicleChapter(world, initial)).toBeNull();
    archiveChronicleEvents(world, [fact('new', 2, '兽潮退却')]);
    const plan = availableChronicleChapter(world, true)!;
    expect(resolveChronicleChapter(world, { ...plan, anchors: [] })).toBeNull();
    const chapter = resolveChronicleChapter(world, plan, { title: '第999章：星河录', body: '辞'.repeat(4000) })!;
    expect(chapter.source).toBe('llm');
    expect(chapter.title).toBe('第1章：星河录');
    expect(chapter.body).toContain('公开史料索引');
    expect(chapter.body).toContain('第1轮 · 灵脉涌动');
    expect(chapter.anchors.map(({ id }) => id)).toEqual(['known', 'new']);
    expect(chapter.body.length).toBeLessThan(3000);
  });

  it('reads a proved action of the emergent lead first in the headline without losing other events or rewriting saved text', () => {
    const { world, actor, fact } = fixture();
    const peer = world.cultivators[1];
    world.tick = 8;
    const reports: WorldEvent[] = [
      { ...fact('confirmed-peer-fate', 3, `寿元耗尽：${peer.name}坐化陨落`), category: 'death', actorIds: [peer.id],
        description: `${peer.name}未能突破更高境界，大限将至，于洞府中安然坐化。` },
      { ...fact('leader-progress', 4, `${actor.name}突破至元婴5层`), category: 'breakthrough',
        description: `在【太虚剑峰】，${actor.name}突破瓶颈，修为精进至【元婴5层】！` },
      { ...fact('leader-pavilion', 5, `${actor.name}抄经归阁`), category: 'diplomacy',
        description: `${actor.name}将实有抄本存入本宗藏经阁。` },
      { ...fact('leader-mercies', 6, `${actor.name}救济坊村`), category: 'diplomacy',
        description: `${actor.name}把实有灵草交给坊村。` },
      { ...fact('private-proof', 6, '密议不外送'), category: 'intrigue', witnessScope: 'participants' },
    ];
    archiveChronicleEvents(world, reports);
    const plan = availableChronicleChapter(world, true)!;
    const lead = projectChronicleLead(world, plan.anchors, plan.endTick);
    expect(lead?.actorId).toBe(actor.id);
    expect(plan.title).toBe(`第1章：${actor.name}踏上元婴5层`);
    const actual = resolveChronicleChapter(world, plan)!;
    expect(actual.body).toContain('瓶颈终于松开了');
    expect(actual.body).not.toMatch(/纪元|编年|史牍记曰|密议不外送/);
    const legacy = { ...actual, title: '第1章：第1至8轮 · 山河行纪', body: '旧有稿本原样留存。' };
    const before = JSON.stringify(legacy);
    const reading = projectChronicleReading(legacy, lead);
    expect(reading.title).toBe(plan.title);
    expect(reading.sections.map(({ eventId }) => eventId)).toEqual(reports.slice(0, -1).map(({ id }) => id));
    expect(JSON.stringify(legacy)).toBe(before);
    const unrelatedLead = { ...lead!, eventIds: ['missing', 'confirmed-peer-fate'] };
    expect(projectChronicleReading(actual, unrelatedLead).title).toBe(`第1章：${peer.name}在洞府坐化`);
  });

  it('does not include a privately superseded live fact even if an older public anchor was retained', () => {
    const { world, fact } = fixture();
    const laterPrivate = fact('later-private', 1, '原本缓存的公开字样');
    archiveChronicleEvents(world, [laterPrivate, fact('still-public', 1, '坊市交割已毕')]);
    world.events = [{ ...laterPrivate, witnessScope: 'participants' }];
    const plan = availableChronicleChapter(world, true)!;
    expect(plan.anchors.map(({ id }) => id)).toEqual(['still-public']);
    expect(resolveChronicleChapter(world, plan)!.body).not.toContain(laterPrivate.title);
  });

  it('keeps separate nonoverlapping chapters and bounds long-running collection', () => {
    const { world, fact } = fixture();
    for (let tick = 1; tick <= 312; tick++) {
      world.tick = tick;
      archiveChronicleEvents(world, [fact(`fact-${tick}`)]);
      const plan = availableChronicleChapter(world);
      if (plan) resolveChronicleChapter(world, plan);
    }
    const { anchors, chapters: recent } = world.chronicleArchive;
    const chapters = publicChronicleChapters(world);
    expect(anchors).toHaveLength(48);
    expect(recent).toHaveLength(COLD_HISTORY_MIN_HOT_CHAPTERS);
    expect(world.coldHistory.chapters).toHaveLength(20);
    expect(world.coldHistory.droppedChapters).toBe(0);
    expect(chapters).toHaveLength(26);
    expect(chapters.every((chapter, i) => i === 0 || chapter.endTick < chapters[i - 1].startTick)).toBe(true);
    expect(chapters[0].endTick).toBe(312);
    expect(chapters[0].chapterNumber).toBe(26);
    expect(chapters.at(-1)?.chapterNumber).toBe(1);
  });
});

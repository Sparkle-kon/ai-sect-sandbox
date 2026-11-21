import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ChronicleAnchor, ChronicleChapter, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 16;
  const [reader, writerA, writerB, editor, neverPublished] = world.cultivators;
  writerA.name = '传本甲作者';
  writerB.name = '传本乙作者';
  editor.name = '古卷真实勘误者';
  neverPublished.name = '斗法另一当事人';
  const hub = world.locations.find(({ id }) => id === 'loc-market')!;
  hub.name = '衡文坊市';
  reader.locationId = writerA.locationId = writerB.locationId = editor.locationId = hub.id;
  const anchor: ChronicleAnchor = {
    id: 'evt-battle-public', tick: 12, year: 1001, month: 12, title: '正文所引',
    description: '正文所引的公开事件', actorIds: [neverPublished.id, writerA.id, writerB.id], category: 'combat', locationId: hub.id,
  };
  const reliefAnchor: ChronicleAnchor = {
    ...anchor, id: 'evt-relief-public', tick: 11, title: '未收入章的赈济', category: 'diplomacy', actorIds: [writerA.id],
  };
  const recorded: WorldEvent = { ...anchor, duelWinnerId: neverPublished.id, actorIds: [neverPublished.id, writerA.id] };
  world.events = [recorded, { ...reliefAnchor }];
  const chapter: ChronicleChapter = {
    id: 'recorded-chapter', chapterNumber: 1, startTick: 1, endTick: 12,
    title: '第一章：原卷不改', body: '小说正文有另一说，只可当作文学讲述。', anchors: [anchor], biographies: [], source: 'llm',
  };
  world.chronicleArchive.chapters = [chapter];
  const duelId = anchor.id;
  const reliefId = reliefAnchor.id;
  world.chronicleErrata = {
    sources: [
      { sourceEventId: duelId, tick: 12, locationId: hub.id, kind: 'duel', participantIds: [writerA.id, neverPublished.id], winnerId: neverPublished.id },
      { sourceEventId: reliefId, tick: 11, locationId: hub.id, kind: 'relief', actorId: writerA.id,
        settlementId: world.settlements.villages[0].id, stones: 12, herbs: 2 },
    ],
    retellings: [
      { id: 'first-public-account', sourceEventId: duelId, authorId: writerA.id, tick: 13, reading: { kind: 'duel', winnerId: writerA.id } },
      { id: 'second-public-account', sourceEventId: duelId, authorId: writerB.id, tick: 14, reading: { kind: 'duel', winnerId: neverPublished.id } },
      { id: 'third-public-account', sourceEventId: reliefId, authorId: writerB.id, tick: 14, reading: { kind: 'relief', delivery: 'unfunded' } },
    ],
    corrections: [], nextId: 5,
  };
  const html = () => renderToStaticMarkup(<ChronicleLibraryPanel world={world} cultivator={reader} />);
  return { world, reader, writerA, writerB, editor, neverPublished, chapter, duelId, reliefId, hub, html };
}

describe('public retellings and separately appended errata in the library', () => {
  it('keeps chapter and uncollected retellings discoverable, presents conflicting accounts as unverified', () => {
    const { html } = fixture();
    const markup = html();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">异闻与勘误/);
    expect(markup).toContain('与当前章节引用同一史料');
    expect(markup).toContain('未引用于当前章，仍可查阅');
    expect(markup).toContain('传本相互冲突，尚无勘误定论');
    expect(markup).toContain('未核实传本 · 传本甲作者 · Tick #13 · 斗法获胜者：传本甲作者');
    expect(markup).toContain('未核实传本 · 传本乙作者 · Tick #14 · 斗法获胜者：斗法另一当事人');
    expect(markup).toContain('未实际拨付赈灾物资');
    expect(markup).not.toContain('核定：');
    expect(markup).not.toContain('古卷真实勘误者');
  });

  it('renders a time-bounded added correction without altering original prose, source or claims', () => {
    const { world, chapter, editor, neverPublished, duelId, html } = fixture();
    const original = JSON.stringify(world.chronicleArchive);
    world.chronicleErrata.corrections.push({
      id: 'independent-erratum', sourceEventId: duelId, editorId: editor.id, tick: 17,
      reading: { kind: 'duel', winnerId: neverPublished.id }, contestedRetellingIds: ['first-public-account', 'second-public-account'],
    });
    expect(html()).not.toContain('核定：');
    world.tick = 17;
    expect(html()).toContain('原传本存在冲突，已另附勘误');
    expect(html()).toContain('据公开史料附录勘误 · 古卷真实勘误者 · Tick #17');
    expect(html()).toContain('核定：斗法获胜者：斗法另一当事人。对照 2 则传本。');
    // The original remains reviewable but is not the canonical-first story.
    expect(html()).toContain('原存档稿');
    expect(html()).not.toContain(chapter.body);
    expect(world.chronicleArchive.chapters[0].body).toBe(chapter.body);
    expect(html()).toContain('未核实传本 · 传本甲作者');
    expect(JSON.stringify(world.chronicleArchive)).toBe(original);
  });

  it('can precede the first chapter but does not render private, nonlocal, or homepage dossiers', () => {
    const { world, reader, duelId, html } = fixture();
    world.chronicleArchive.chapters = [];
    expect(html()).toContain('尚无现成章节引证，仍可查阅');
    const privateDuplicate = { ...world.events.find(({ id }) => id === duelId)!, witnessScope: 'participants' as const, title: '参与者秘密来源' };
    world.events.push(privateDuplicate);
    const privateHtml = html();
    expect(privateHtml).not.toContain('参与者秘密来源');
    expect(privateHtml).not.toContain('传本甲作者');
    reader.locationId = world.locations.find(({ id }) => id === 'loc-market-east')!.id;
    expect(html()).toContain('此时此地暂无可查');
    expect(html()).not.toContain('传本乙作者');
    expect(renderToStaticMarkup(<App />)).not.toContain('异闻与勘误');
  });
});

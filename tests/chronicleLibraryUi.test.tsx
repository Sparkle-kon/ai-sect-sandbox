import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChronicleLibraryPanel, ChapterBiographies } from '../src/components/ChronicleLibraryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ChronicleChapter } from '../src/types/world';

const fixture = () => {
  const world = createInitialWorld();
  world.tick = 24;
  const [subject, unrelated] = world.cultivators;
  subject.innerMonologue = '不能公开的内心独白';
  world.events = [{
    id: 'secret', tick: 20, year: 1, month: 8, title: '伏案密谋', description: '未见天日的誓词',
    category: 'intrigue', actorIds: [subject.id], witnessScope: 'participants',
  }];
  const chapter: ChronicleChapter = {
    id: 'chapter-2', chapterNumber: 2, title: '第二章：雨过青崖', startTick: 19, endTick: 24, source: 'llm',
    body: '青崖过雨。\n\n<风>归人未归。',
    anchors: [
      { id: 'public', tick: 21, year: 1, month: 9, title: '公开立誓', description: '两宗在坊市公开立誓。', category: 'diplomacy', actorIds: [subject.id] },
      { id: 'other-public', tick: 22, year: 1, month: 10, title: '他人渡关', description: '别人在公开场合成功渡关。', category: 'breakthrough', actorIds: [unrelated.id] },
    ],
    biographies: [{ actorId: subject.id, name: '存档中的姓名', realm: '筑基', sectName: '存档宗门', anchorIds: ['secret', 'public', 'other-public'] }],
  };
  world.chronicleArchive = {
    anchors: [],
    chapters: [
      { ...chapter, id: 'chapter-1', chapterNumber: 1, title: '第一章：松下访友', endTick: 18, startTick: 1, body: '此为旧章。', source: 'utility', anchors: [], biographies: [] },
      chapter,
    ],
  };
  return { world, chapter };
};

describe('public chronicle library', () => {
  it('selects the latest chapter and leads with scenes, not archive dates or old model prose', () => {
    const { world } = fixture();
    const html = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    expect(html).toContain('aria-label="藏书阁"');
    expect(html).toContain('叙事视角：仅公开史料');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('故事正文');
    expect(html).toContain('人物小传');
    expect(html).toContain('value="chapter-2" selected=""');
    expect(html).toContain('第1章：山河一页');
    expect(html).toContain('第2章：他人渡关');
    expect(html).not.toContain('此为旧章。');
    expect(html).toContain('记载时段：Tick #19 至 #24');
    expect(html).toContain('原存档稿');
    expect(html).not.toContain('青崖过雨。');
    expect(html).toContain('本章公开史料 · 2 条');
    expect(html).toContain('两宗在坊市公开立誓。');
    expect(html.indexOf('两宗在坊市公开立誓。')).toBeLessThan(html.indexOf('记载时段：Tick #19 至 #24'));
    expect(html).not.toContain('伏案密谋');
    expect(html).not.toContain('未见天日的誓词');
    expect(html).not.toContain('不能公开的内心独白');
  });

  it('suppresses excluded private-origin and contradictory ID anchors in both scene and proof without mutating archive', () => {
    const { world, chapter } = fixture();
    chapter.anchors.push({ ...chapter.anchors[0], id: 'evt-sealed-dispatch-redacted', title: '封缄绝不公开', description: '不可见的内容' });
    world.events.push({ ...chapter.anchors[0], title: '冲突公开标题甲' }, { ...chapter.anchors[0], title: '冲突公开标题乙' });
    const before = JSON.stringify(chapter);
    const html = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    expect(html).toContain('本章公开史料 · 1 条');
    expect(html).toContain('别人在公开场合成功渡关。');
    expect(html).not.toMatch(/封缄绝不公开|不可见的内容|冲突公开标题|公开立誓|原存档稿/);
    expect(JSON.stringify(chapter)).toBe(before);
  });

  it('reads quiet passages as prose without an event heading and keeps the original proof shelf', () => {
    const { world } = fixture();
    const html = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    const prose = html.split('data-chronicle-prose')[1]?.split('本章公开史料')[0] ?? '';
    expect(prose).toContain('data-chronicle-beat="opening"');
    expect(prose).toContain('两宗在坊市公开立誓。');
    expect(prose).not.toMatch(/<h5[^>]*>公开立誓/);
    expect(html).toContain('本章公开史料 · 2 条');
  });

  it('does not read an archived anchor that contradicts another retained copy', () => {
    const { world, chapter } = fixture();
    world.chronicleArchive.anchors = [{ ...chapter.anchors[0], title: '旧卷异文' }];
    const html = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    expect(html).toContain('本章公开史料 · 1 条');
    expect(html).not.toMatch(/旧卷异文|公开立誓|原存档稿/);
  });

  it('uses saved biography identity and only that person’s public anchors from this chapter', () => {
    const { chapter, world } = fixture();
    const html = renderToStaticMarkup(<ChapterBiographies chapter={chapter} />);
    expect(html).toContain('存档中的姓名');
    expect(html).toContain('筑基 · 存档宗门');
    expect(html).toContain('Tick #21 · 公开立誓');
    expect(html).not.toContain('他人渡关');
    expect(html).not.toContain(world.cultivators[0].name);
    expect(html).not.toContain('伏案密谋');
    expect(html).not.toContain('secret');
  });

  it('provides an explicit empty state and does not substitute live events', () => {
    const { world } = fixture();
    world.chronicleArchive.chapters = [];
    const html = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    expect(html).toContain('尚无已编成的章节');
    expect(html).not.toContain('伏案密谋');
    expect(html).not.toContain('<select');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { coldChroniclePage } from '../src/components/ColdChronicleShelf';
import { WorldStoragePanel } from '../src/components/WorldStoragePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { encodeWorldSave, worldSaveByteCount } from '../src/engine/storageEngine';
import type { ChronicleChapter } from '../src/types/world';

function chapter(chapterNumber: number, title: string): ChronicleChapter {
  const endTick = chapterNumber * 2;
  return { id: `chronicle-${chapterNumber}`, chapterNumber, startTick: endTick - 1, endTick, title,
    body: `正文阅览：${title}`, source: 'utility', anchors: [], biographies: [] };
}

describe('branch-local deep chronicle shelf and independent file byte inspection', () => {
  it('keeps archival pages bounded, does not inject their titles/bodies into recent picker, and uses viewed tick', () => {
    const world = createInitialWorld();
    world.tick = 50;
    world.chronicleArchive.chapters = [chapter(20, '近期甲章'), chapter(19, '近期乙章')];
    world.coldHistory = {
      chapters: [chapter(31, '尚未发生'), ...Array.from({ length: 13 }, (_, i) => chapter(i + 1, `冷架分卷-${i + 1}`))],
      droppedChapters: 2,
    };
    const first = coldChroniclePage(world, 0);
    const second = coldChroniclePage(world, 2000);
    expect([first.rows.length, second.rows.length]).toEqual([8, 5]);
    const reachable = [...first.rows, ...second.rows].map(({ title }) => title);
    expect(new Set(reachable).size).toBe(13);
    expect(reachable).not.toContain('尚未发生');
    expect(reachable).not.toContain('近期甲章');
    const html = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    expect(html).toContain('近期章目');
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">远纪档案 · 13 章/);
    expect(html).toContain('保留范围外已淘汰 2 章');
    expect(html).toContain('归档章目不是可回到的模拟快照');
    expect(html).not.toContain('冷架分卷-');
    expect(html).not.toContain('尚未发生');
    expect(renderToStaticMarkup(<App />)).not.toContain('远纪档案');
  });

  it('uses branch-specific retained world only, never sharing another branch shelf entries', () => {
    const main = createInitialWorld();
    const fork = structuredClone(main);
    main.tick = fork.tick = 18;
    main.coldHistory = { chapters: [chapter(3, '原支所见')], droppedChapters: 0 };
    fork.coldHistory = { chapters: [chapter(3, '分支独有')], droppedChapters: 0 };
    expect(coldChroniclePage(main, 0).rows.map(({ title }) => title)).toEqual(['原支所见']);
    expect(coldChroniclePage(fork, 0).rows.map(({ title }) => title)).toEqual(['分支独有']);
    const empty = createInitialWorld();
    expect(renderToStaticMarkup(<ChronicleLibraryPanel world={empty} />)).not.toContain('远纪档案');
  });

  it('exposes on-demand UTF-8 export size independently of heap and initial rendering', () => {
    const world = createInitialWorld();
    const storeMarkup = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false}
      onNewWorld={() => false} onRestore={() => false} />);
    expect(storeMarkup).toContain('测量当前存档大小');
    expect(storeMarkup).toContain('UTF-8 字节数，不下载文件，也不是浏览器内存占用');
    expect(storeMarkup).not.toContain('当前存档大小暂不可测');
    const payload = encodeWorldSave(world);
    expect(worldSaveByteCount(world)).toBe(new TextEncoder().encode(payload).byteLength);
    expect(worldSaveByteCount(world)).toBeGreaterThan(payload.length); // Chinese UTF-8 data.
  });
});

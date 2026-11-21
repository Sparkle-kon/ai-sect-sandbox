import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ArchiveOptimizationReview, canDownloadPreparedSave, sameStorageReview, SaveCapacityResult, WorldStoragePanel } from '../src/components/WorldStoragePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import * as capacity from '../src/engine/saveCapacityEngine';
import { encodeWorldSave, WORLD_SAVE_MAX_BYTES } from '../src/engine/storageEngine';
import { createTimeline } from '../src/engine/timelineEngine';

const none = () => false;
const close = () => undefined;

describe('manual JSON preflight and move-only archive review', () => {
  it('mounts only the initial actions and neither computes nor exposes download/archive confirmation before click', () => {
    const world = createInitialWorld(83171);
    const timeline = createTimeline(world);
    const measure = vi.spyOn(capacity, 'measureSaveCapacity');
    const prepare = vi.spyOn(capacity, 'prepareArchiveOptimization');
    const archive = vi.fn(async () => true);
    const html = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false} timeline={timeline}
      onRestore={none} onNewWorld={none} onArchiveNarrative={archive} />);
    expect(html.match(/预检当前世界 JSON/g)).toHaveLength(1);
    expect(html.match(/预览旧章归档/g)).toHaveLength(1);
    expect(html).not.toMatch(/下载已预检 JSON|确认仅迁移旧章|当前 JSON 预检结果/);
    expect(html).toContain('UTF-8 字节数，不下载文件，也不是浏览器内存占用');
    expect(measure).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
    const readOnly = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false} readOnly timeline={timeline}
      onRestore={none} onNewWorld={none} onArchiveNarrative={archive} />);
    expect(readOnly).toContain('预检当前世界 JSON');
    expect(readOnly).not.toContain('预览旧章归档');
    measure.mockRestore();
    prepare.mockRestore();
  });

  it('reports exact UTF-8 bytes and references separately; only allows the file size limit on valid review', () => {
    const world = createInitialWorld(83172);
    const timeline = createTimeline(world);
    const report = capacity.measureSaveCapacity(world, timeline);
    const onDownload = vi.fn();
    const raw = encodeWorldSave(world);
    const size = new TextEncoder().encode(raw).byteLength;
    const markup = renderToStaticMarkup(<SaveCapacityResult report={report} onDownload={onDownload} />);
    expect(report.jsonBytes).toBe(size);
    expect(size).toBeGreaterThan(raw.length);
    expect(markup).toContain(size.toLocaleString('zh-CN'));
    expect(markup).toContain('时间线仅计引用：1 条分支 · 1 条快照引用，指向 1 个不同快照');
    expect(markup).toContain('不是内存测量');
    expect(markup).toContain('下载已预检 JSON');
    expect(onDownload).not.toHaveBeenCalled();
    expect(canDownloadPreparedSave({ ...report, jsonBytes: WORLD_SAVE_MAX_BYTES })).toBe(true);
    expect(canDownloadPreparedSave({ ...report, jsonBytes: WORLD_SAVE_MAX_BYTES + 1 })).toBe(false);
    const over = renderToStaticMarkup(<SaveCapacityResult report={{ ...report, withinLimit: false, jsonBytes: WORLD_SAVE_MAX_BYTES + 1 }} onDownload={onDownload} />);
    expect(over).toContain('超过单个 JSON 文件上限，不提供下载');
    expect(over).not.toContain('下载已预检 JSON');
    const absent = renderToStaticMarkup(<SaveCapacityResult report={{ ...report, withinLimit: null, jsonBytes: null }} onDownload={onDownload} />);
    expect(absent).toContain('无法完成预检，不提供下载');
    expect(absent).not.toContain('下载已预检 JSON');
  });

  it('requires exact active world, lineage/version and timeline identity, including matching tick clones', () => {
    const world = createInitialWorld(83173);
    const timeline = createTimeline(world);
    const stamp = { world, version: 6, branchId: 'native-a', timelineId: 'lineage-a' };
    const preflight = { result: capacity.measureSaveCapacity(world, timeline), stamp, timeline };
    expect(sameStorageReview(preflight, { ...stamp }, timeline)).toBe(true);
    for (const newStamp of [
      { ...stamp, world: structuredClone(world) }, { ...stamp, version: 7 },
      { ...stamp, branchId: 'native-b' }, { ...stamp, timelineId: 'lineage-b' },
    ]) expect(sameStorageReview(preflight, newStamp, timeline)).toBe(false);
    expect(sameStorageReview(preflight, stamp, { ...timeline })).toBe(false);
  });

  it('renders an exact move-only review even with unchanged file bytes; omits confirm when no move is sealed', () => {
    const world = createInitialWorld(83174);
    const base = { ...world.events[0], category: 'heavenly' as const };
    world.tick = 160;
    const chapters = Array.from({ length: 7 }, (_, index) => {
      const tick = 12 * (index + 1);
      return { id: `private-chapter-${index}`, chapterNumber: index + 1, startTick: tick - 11, endTick: tick,
        source: 'utility' as const, title: '山行旧事', body: '实录原稿。', biographies: [],
        anchors: [{ ...base, id: `private-anchor-${index}`, tick }] };
    }).reverse();
    world.chronicleArchive.chapters = chapters.slice(0, 6);
    world.coldHistory = { chapters: chapters.slice(6), droppedChapters: 0 };
    const old = JSON.stringify(world);
    const plan = capacity.prepareArchiveOptimization(world);
    expect(plan).toMatchObject({ movedCount: 2, hotBefore: 6, hotAfter: 4, coldBefore: 1, coldAfter: 3 });
    expect(plan.beforeBytes).toBe(plan.afterBytes);
    expect(JSON.stringify(world)).toBe(old);
    const onApply = vi.fn();
    const markup = renderToStaticMarkup(<ArchiveOptimizationReview plan={plan} onApply={onApply} onCancel={close} />);
    expect(markup).toContain('近期章目 6 → 4 章 · 远纪档案 1 → 3 章');
    expect(markup).toContain('导出大小不变');
    expect(markup).toContain('确认仅迁移旧章');
    expect(markup).toContain('不会删除章节、人物或原始凭据，也不会载入或重置世界');
    expect(markup).not.toMatch(/private-chapter-|private-anchor-|实录原稿/);
    expect(onApply).not.toHaveBeenCalled();
    const noMoves = capacity.prepareArchiveOptimization(createInitialWorld(83175));
    const unavailable = renderToStaticMarkup(<ArchiveOptimizationReview plan={noMoves} onApply={onApply} onCancel={close} />);
    expect(unavailable).toContain('此时没有可移动的章节');
    expect(unavailable).not.toContain('确认仅迁移旧章');
  });
});

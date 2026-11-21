import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { describeConfirmation, importWorldFile, parseWorldSeed, sameSaveSlotRevision, sameStorageContext, SavePointRows, stageWorldCreation, WorldStoragePanel } from '../src/components/WorldStoragePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { encodeWorldSave, WORLD_SAVE_MAX_BYTES } from '../src/engine/storageEngine';
import type { SaveSlotInspection, SaveSlotSummary } from '../src/engine/storageEngine';
import { WORLDGEN_PROFILES } from '../src/engine/worldgenProfiles';

describe('world storage UI boundary', () => {
  it('renders local slots, explicit import/export and seed controls without touching browser storage', () => {
    const world = createInitialWorld(981);
    const unexpected = () => { throw new Error('SSR must not touch browser storage'); };
    const markup = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false}
      store={{ list: unexpected, inspect: unexpected, loadSelected: unexpected, capabilities: unexpected, save: unexpected, delete: unexpected }}
      onRestore={unexpected} onNewWorld={unexpected} />);
    expect(markup).toContain('当前世界：种子 981 · Tick #1');
    expect(markup).toContain('value="981"');
    expect(markup).toContain('本机存档槽（0/12）');
    expect(markup).toContain('value="slot-12"');
    expect(markup).toContain('刷新存档槽');
    expect(markup).toContain('核验此槽');
    expect(markup).toContain('请先核验此槽，再选择要读取的存档副本');
    expect(markup).not.toContain('读取恢复点');
    expect(markup).toContain('删除存档');
    expect(markup).toContain('导出当前世界 JSON');
    expect(markup).toContain('accept=".json,application/json"');
    expect(markup).toContain('最大 8 MiB');
    expect(markup).toContain('私密游戏对话');
    expect(markup).toContain('不会导出应用中的模型服务凭证或配置');
    expect(markup).toContain('按种子创建世界');
    expect(markup).toContain('世界生成谱系');
    expect(markup).toContain('value="classic" selected=""');
    expect(markup).toContain('value="spirit-bloom"');
    expect(markup).toContain('value="fractured-frontier"');
    expect(markup).toContain(`创世记录 · ${WORLDGEN_PROFILES.classic.label}`);
    expect(markup).not.toContain('确认执行');
  });

  it('only parses bounded decimal seeds and detects changed confirmations', () => {
    expect(parseWorldSeed(' 0 ')).toBe(0);
    expect(parseWorldSeed('4294967295')).toBe(0xffffffff);
    for (const invalid of ['', '-1', '4294967296', '1.25', '1e3', '0x10', 'Infinity']) {
      expect(parseWorldSeed(invalid)).toBeUndefined();
    }
    const reviewed = { id: 'slot-1', label: '已复核', tick: 10, year: 2, month: 2, seed: 5,
      savedAt: 1000 } satisfies SaveSlotSummary;
    expect(sameSaveSlotRevision(reviewed, { ...reviewed })).toBe(true);
    expect(sameSaveSlotRevision(reviewed, { ...reviewed, label: '后来改名' })).toBe(false);
    expect(sameSaveSlotRevision(reviewed, { ...reviewed, savedAt: 1001 })).toBe(false);
    expect(sameSaveSlotRevision(reviewed, undefined)).toBe(false);
    const newSlot = { ...reviewed, profileId: 'spirit-bloom' } as const;
    expect(sameSaveSlotRevision(newSlot, { ...newSlot })).toBe(true);
    expect(sameSaveSlotRevision(newSlot, reviewed)).toBe(false);
    expect(sameSaveSlotRevision(newSlot, { ...newSlot, profileId: 'classic' })).toBe(false);
  });

  it('keeps a corrupt current copy distinct from one verified recovery point and its exact identity', () => {
    const summary = { id: 'slot-1', label: '上次合法修订', tick: 10, year: 2, month: 2, seed: 5, savedAt: 1000 } satisfies SaveSlotSummary;
    const selection = { slotId: 'slot-1', headRevision: 'head-a', point: 'previous', revision: 'prior-a', formatVersion: 1,
      sourceBranch: { branchId: 'branch-a', label: '归档分支', timelineId: 'timeline-a' }, seal: 'opaque-not-rendered' } as const;
    const review = { id: 'slot-1', headRevision: 'head-a', currentDamaged: true, previousDamaged: false,
      previous: { summary, selection } } satisfies SaveSlotInspection;
    const load = vi.fn();
    const exporter = vi.fn();
    const html = renderToStaticMarkup(<SavePointRows review={review} recoverySupported readOnly onLoad={load} onExport={exporter} />);
    expect(html).toContain('当前版 · 完整性校验失败');
    expect(html).toContain('恢复点 · 已校验');
    expect(html).toContain('来源分支：归档分支');
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>读取恢复点/);
    expect(html).toContain('导出恢复点 JSON');
    expect(html).not.toMatch(/opaque-not-rendered|读取当前版/);
    expect(load).not.toHaveBeenCalled();
    expect(exporter).not.toHaveBeenCalled();
    expect(describeConfirmation({ kind: 'delete', review })).toContain('当前版和恢复点（含已损坏的副本）');
    expect(describeConfirmation({ kind: 'restore', info: review.previous })).toContain('不会自动更改槽内副本');
    expect(describeConfirmation({ kind: 'restore', info: review.previous })).toContain('恢复点 · 归档分支');
  });

  it('invalidates exact authority on branch, generation, timeline or world changes', () => {
    const world = createInitialWorld(12);
    const a = { world, version: 4, branchId: 'A', timelineId: 't1' };
    expect(sameStorageContext(a, { ...a })).toBe(true);
    expect(sameStorageContext(a, { ...a, world: structuredClone(world) })).toBe(false);
    expect(sameStorageContext(a, { ...a, version: 5 })).toBe(false);
    expect(sameStorageContext(a, { ...a, branchId: 'B' })).toBe(false);
    expect(sameStorageContext(a, { ...a, timelineId: 't2' })).toBe(false);
  });

  it('stages the exact seed, profile, and reviewed world, rejecting unrecognized profiles', () => {
    const world = createInitialWorld(1);
    const draft = stageWorldCreation('4294967295', 'fractured-frontier', world);
    expect(draft).toMatchObject({ kind: 'new', seed: 0xffffffff, profileId: 'fractured-frontier' });
    expect(draft?.expected).toBe(world);
    expect(stageWorldCreation('7', 'constructor', world)).toBeUndefined();
    expect(stageWorldCreation('-2', 'classic', world)).toBeUndefined();
  });

  it('distinguishes recorded birth evidence from a changed live map and never invents a legacy certificate', () => {
    const world = createInitialWorld(85, 'spirit-bloom');
    const original = world.worldgen!;
    const preview = () => renderToStaticMarkup(<WorldStoragePanel world={world} busy={false}
      onRestore={() => false} onNewWorld={() => false} />);
    world.tick = 17;
    world.locations[0].spiritQi = 0;
    expect(preview()).toContain('当前世界：种子 85 · Tick #17');
    expect(preview()).toContain(`出生种子 85 · Tick #${original.birthTick} · 生成器 v${original.algorithm}`);
    expect(preview()).toContain(`记录 ${original.resources.length} 位初始修士`);
    expect(preview()).toContain('后来的灵脉改动、灾害、迁徙和资源消耗不在这份检核中');
    expect(preview()).toContain('value="spirit-bloom" selected=""');
    delete world.worldgen;
    expect(preview()).toContain('旧档未记录谱系');
    expect(preview()).toContain('不能用现在的地形或资源倒推出初生通达性');
    expect(preview()).not.toContain('出生种子');
    expect(preview()).toContain('value="classic" selected=""');
  });

  it('rejects an oversized file before reading and stages only a decoded snapshot', async () => {
    const text = vi.fn().mockResolvedValue('private must not be opened');
    await expect(importWorldFile({ size: WORLD_SAVE_MAX_BYTES + 1, text })).rejects.toThrow('8 MiB');
    expect(text).not.toHaveBeenCalled();
    await expect(importWorldFile({ size: 1, text: async () => '{' })).rejects.toThrow();
    const world = createInitialWorld(41);
    const encoded = encodeWorldSave(world);
    const decoded = await importWorldFile({ size: new TextEncoder().encode(encoded).length, text: async () => encoded });
    expect(decoded.tick).toBe(world.tick);
    expect(decoded.random).toEqual(world.random);
    expect(decoded).not.toBe(world);
  });
});

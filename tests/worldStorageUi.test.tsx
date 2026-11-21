import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { importWorldFile, parseWorldSeed, sameSaveSlotRevision, WorldStoragePanel } from '../src/components/WorldStoragePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { encodeWorldSave, WORLD_SAVE_MAX_BYTES } from '../src/engine/storageEngine';
import type { SaveSlotSummary } from '../src/engine/storageEngine';

describe('world storage UI boundary', () => {
  it('renders local slots, explicit import/export and seed controls without touching browser storage', () => {
    const world = createInitialWorld(981);
    const unexpected = () => { throw new Error('SSR must not touch browser storage'); };
    const markup = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false}
      store={{ list: unexpected, load: unexpected, save: unexpected, delete: unexpected }}
      onRestore={unexpected} onNewWorld={unexpected} />);
    expect(markup).toContain('当前世界：种子 981 · Tick #1');
    expect(markup).toContain('value="981"');
    expect(markup).toContain('本机存档槽（0/12）');
    expect(markup).toContain('value="slot-12"');
    expect(markup).toContain('刷新存档槽');
    expect(markup).toContain('读取存档');
    expect(markup).toContain('删除存档');
    expect(markup).toContain('导出当前世界 JSON');
    expect(markup).toContain('accept=".json,application/json"');
    expect(markup).toContain('最大 8 MiB');
    expect(markup).toContain('私密游戏对话');
    expect(markup).toContain('不会导出应用中的模型服务凭证或配置');
    expect(markup).toContain('按种子创建世界');
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

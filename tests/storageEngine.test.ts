import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { createMemorySaveBackend, createSaveStore, decodeWorldSave, encodeWorldSave, WORLD_SAVE_MAX_BYTES } from '../src/engine/storageEngine';

afterEach(() => { vi.unstubAllGlobals(); });

describe('validated, versioned world saves', () => {
  it('round-trips a full independent snapshot including seeded random state, and validates evolved worlds', () => {
    let world = createInitialWorld(0xffffffff);
    world.locations[0].spiritQi = 150;
    expect(decodeWorldSave(encodeWorldSave(world))).toEqual(JSON.parse(JSON.stringify(world)));
    for (let i = 0; i < 75; i++) {
      world = advanceWorldTick(world);
      if (i % 5 === 0 || i === 74) {
        const saved = decodeWorldSave(encodeWorldSave(world));
        expect(saved).toEqual(JSON.parse(JSON.stringify(world)));
        expect(saved).not.toBe(world);
      }
    }
  });

  it('rejects wrong versions, corrupt payload, unknown credentials and malformed live references', () => {
    const clean = JSON.parse(encodeWorldSave(createInitialWorld()));
    expect(() => decodeWorldSave('{')).toThrow(expect.objectContaining({ code: 'json' }));
    expect(() => decodeWorldSave(JSON.stringify({ ...clean, version: 99 }))).toThrow(expect.objectContaining({ code: 'version' }));
    expect(() => decodeWorldSave(JSON.stringify({ ...clean, config: { apiKey: 'hidden' } }))).toThrow(expect.objectContaining({ code: 'invalid_world' }));
    expect(() => decodeWorldSave(JSON.stringify({ ...clean, world: { ...clean.world, apiKey: 'hidden' } }))).toThrow(expect.objectContaining({ code: 'invalid_world' }));
    const cleanJson = JSON.stringify(clean);
    for (const mutate of [
      (data: typeof clean) => { data.world.cultivators[0].locationId = 'missing'; },
      (data: typeof clean) => { data.world.cultivators[0].hp = -1; },
      (data: typeof clean) => { data.world.random.state = 0x100000000; },
      (data: typeof clean) => { data.world.locations[1].id = data.world.locations[0].id; },
      (data: typeof clean) => { data.world.terrain.tiles[0].col = 4; },
      (data: typeof clean) => { data.world.playerAvatar.transcript.push({ reply: 'incomplete fake record' }); },
    ]) {
      const corrupt = JSON.parse(cleanJson);
      mutate(corrupt);
      expect(() => decodeWorldSave(JSON.stringify(corrupt))).toThrow(expect.objectContaining({ code: 'invalid_world' }));
    }
    expect(() => decodeWorldSave('山'.repeat(Math.floor(WORLD_SAVE_MAX_BYTES / 3) + 1))).toThrow(expect.objectContaining({ code: 'size' }));
  });

  it('lists and replaces independent slots, captures call-time state, and increments same-clock revisions', async () => {
    const store = createSaveStore(createMemorySaveBackend(), () => 1_000);
    const world = createInitialWorld(37);
    const pending = store.save('slot-1', '  初遇山门 ', world);
    world.tick = 2;
    expect(await pending).toMatchObject({ label: '初遇山门', seed: 37, tick: 1, savedAt: 1_000 });
    expect((await store.load('slot-1')).tick).toBe(1);
    expect(await store.save('slot-1', '复写', world)).toMatchObject({ tick: 2, savedAt: 1_001 });
    expect(await store.save('slot-2', '次卷', world)).toMatchObject({ tick: 2 });
    expect((await store.list()).map(({ id }) => id)).toEqual(['slot-1', 'slot-2']);
    expect(await store.delete('slot-2')).toBe(true);
    expect(await store.delete('slot-2')).toBe(false);
    await expect(store.load('slot-2')).rejects.toMatchObject({ code: 'not_found' });
    await expect(store.save('bad:path', '次卷', world)).rejects.toMatchObject({ code: 'invalid_slot' });
  });

  it('limits slot count, propagates storage failures, and keeps the previous save', async () => {
    const backend = createMemorySaveBackend();
    const store = createSaveStore(backend);
    const world = createInitialWorld();
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.save(`slot-${i}`, '有效', world)));
    await expect(store.save('some-other', '满载', world)).rejects.toMatchObject({ code: 'slot_limit' });
    const faulty = createSaveStore({ ...backend, put: async () => { throw new Error('quota details'); } });
    await expect(faulty.save('slot-0', '写入失败', world)).rejects.toMatchObject({ code: 'storage' });
    expect((await store.list()).find(({id}) => id === 'slot-0')?.label).toBe('有效');
  });

  it('uses LocalStorage only when IndexedDB is unavailable and preserves slots across new stores', async () => {
    const rows = new Map<string, string>();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
      get length() { return rows.size; }, key: (i: number) => [...rows.keys()][i] ?? null,
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => rows.set(key, value), removeItem: (key: string) => rows.delete(key),
    });
    const world = createInitialWorld(65);
    await createSaveStore().save('slot-1', '入门', world);
    await expect(createSaveStore().load('slot-1')).resolves.toMatchObject({ random: { seed: 65 } });
    const key = [...rows.keys()][0];
    rows.set(key, 'not-json');
    await expect(createSaveStore().load('slot-1')).rejects.toMatchObject({ code: 'storage' });
  });
});

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
    const original = await store.inspect('slot-1');
    expect(await store.save('slot-1', '复写', world, original.headRevision)).toMatchObject({ tick: 2, savedAt: 1_001 });
    expect(await store.save('slot-2', '次卷', world)).toMatchObject({ tick: 2 });
    expect((await store.list()).map(({ id }) => id)).toEqual(['slot-1', 'slot-2']);
    const slot2 = await store.inspect('slot-2');
    expect(await store.delete('slot-2', slot2.headRevision!)).toBe(true);
    await expect(store.delete('slot-2', slot2.headRevision!)).rejects.toMatchObject({ code: 'slot_conflict' });
    const slot1 = await store.inspect('slot-1');
    expect(slot1.current?.selection.revision).not.toBe(slot1.previous?.selection.revision);
    expect(slot1.previous?.selection.revision).toBe(original.headRevision);
    expect(await store.loadSelected(slot1.previous!.selection)).toMatchObject({ tick: 1 });
    await expect(store.load('slot-2')).rejects.toMatchObject({ code: 'not_found' });
    await expect(store.save('bad:path', '次卷', world)).rejects.toMatchObject({ code: 'invalid_slot' });
  });

  it('limits slot count, propagates storage failures, and keeps the previous save', async () => {
    const backend = createMemorySaveBackend();
    const store = createSaveStore(backend);
    const world = createInitialWorld();
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.save(`slot-${i}`, '有效', world)));
    await expect(store.save('some-other', '满载', world)).rejects.toMatchObject({ code: 'slot_limit' });
    const original = await store.inspect('slot-0');
    const faulty = createSaveStore({ ...backend, commit: async () => { throw new Error('quota details'); } });
    await expect(faulty.save('slot-0', '写入失败', world, original.headRevision)).rejects.toMatchObject({ code: 'storage' });
    expect((await store.list()).find(({id}) => id === 'slot-0')?.label).toBe('有效');
  });

  it('exposes existing LocalStorage only when IndexedDB is unavailable and refuses unguardable writes', async () => {
    const rows = new Map<string, string>();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
      get length() { return rows.size; }, key: (i: number) => [...rows.keys()][i] ?? null,
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => rows.set(key, value), removeItem: (key: string) => rows.delete(key),
    });
    const world = createInitialWorld(65);
    rows.set('ai-sect-sandbox:saves:v1:slot-1', JSON.stringify({
      summary: { id: 'slot-1', label: '入门', tick: world.tick, year: world.year, month: world.month, savedAt: 1, seed: 65 },
      content: encodeWorldSave(world),
    }));
    const stored = createSaveStore();
    await expect(stored.capabilities()).resolves.toMatchObject({ backend: 'localstorage', writable: false, recovery: false, crossTab: false });
    const slot = await stored.inspect('slot-1');
    expect(slot.current?.selection.sourceBranch).toBeUndefined();
    await expect(stored.loadSelected(slot.current!.selection)).resolves.toMatchObject({ random: { seed: 65 } });
    await expect(stored.save('slot-1', '入门', world, slot.headRevision)).rejects.toMatchObject({ code: 'storage_read_only' });
    await expect(stored.delete('slot-1', slot.headRevision!)).rejects.toMatchObject({ code: 'storage_read_only' });
    expect(rows.size).toBe(1);
    const key = [...rows.keys()][0];
    rows.set(key, 'not-json');
    await expect(createSaveStore().load('slot-1')).rejects.toMatchObject({ code: 'integrity' });
  });

  it.each(['overwrite', 'delete', 'empty'] as const)('rejects %s when a competing store commits after preflight', async (kind) => {
    const backend = createMemorySaveBackend();
    const first = createSaveStore(backend, () => 10);
    const competing = createSaveStore(backend, () => 10);
    const id = 'shared-slot';
    if (kind !== 'empty') await first.save(id, 'original', createInitialWorld(10));
    const original = await first.inspect(id);
    const delayed = createSaveStore({
      ...backend, commit: async change => {
        await competing.save(id,'competing',createInitialWorld(20),original.headRevision);
        await backend.commit(change);
      },
    });
    const stale = kind === 'delete' ? delayed.delete(id,original.headRevision!) :
      delayed.save(id,'stale',createInitialWorld(30),original.headRevision);
    await expect(stale).rejects.toMatchObject({ code: 'slot_conflict' });
    const remaining = await first.inspect(id);
    expect(remaining.current?.summary.seed).toBe(20);
    expect(remaining.previous?.summary.seed).toBe(kind === 'empty' ? undefined : 10);
  });

  it('uses a new durable identity after delete and exact recreation at the very same time', async () => {
    const backend = createMemorySaveBackend();
    const store = createSaveStore(backend, () => 10);
    const id = 'aba';
    const world = createInitialWorld(10);
    const source = { branchId: 'main', timelineId: 'same-session' };
    const before = await store.save(id,'same label',world,null,source);
    const approved = await store.inspect(id);
    await store.delete(id,approved.headRevision!);
    expect(await store.save(id,'same label',world,null,source)).toEqual(before);
    await expect(store.delete(id,approved.headRevision!)).rejects.toMatchObject({ code: 'slot_conflict' });
    await expect(store.loadSelected(approved.current!.selection)).rejects.toMatchObject({ code: 'slot_conflict' });
  });

  it('rejects a selected backup if a new save lands during the asynchronous integrity check', async () => {
    const backend = createMemorySaveBackend(), writer = createSaveStore(backend);
    const id = 'late-read';
    await writer.save(id,'first',createInitialWorld(1));
    await writer.save(id,'current',createInitialWorld(2),(await writer.inspect(id)).headRevision);
    const inspected = await writer.inspect(id);
    let reads = 0;
    const reader = createSaveStore({ ...backend, read: async key => {
      if (++reads === 2) await writer.save(id,'latest',createInitialWorld(3),inspected.headRevision);
      return backend.read(key);
    } });
    await expect(reader.loadSelected(inspected.previous!.selection)).rejects.toMatchObject({ code: 'slot_conflict' });
    expect((await writer.inspect(id)).previous?.summary.seed).toBe(2);
  });

  it('recovers the independently intact choice without substituting for a corrupt or foreign point', async () => {
    const backend = createMemorySaveBackend(), writer = createSaveStore(backend);
    const id = 'checks';
    const first = createInitialWorld(1), second = createInitialWorld(2);
    await writer.save(id,'older',first,null,{ branchId:'branch-1',label:'旧支线',timelineId:'a' });
    await writer.save(id,'current',second,(await writer.inspect(id)).headRevision,{ branchId:'main', timelineId:'b' });
    await writer.save('elsewhere','foreign',createInitialWorld(15));
    const inspected = await writer.inspect(id);
    const foreign = (await backend.read('elsewhere')).current;
    const tamperedWorld = { ...second, locations: second.locations.map((site,index) => index === 0 ? { ...site, spiritQi: site.spiritQi === 150 ? 149 : 150 } : site) };
    const rewrite = (raw: unknown, change: object) => ({ ...(raw as object), ...change });
    const corruptCurrent = createSaveStore({
      ...backend, read: async key => {
        const raw = await backend.read(key);
        return { ...raw, current: rewrite(raw.current,{ content:encodeWorldSave(tamperedWorld) }) };
      },
    });
    const visible = await corruptCurrent.inspect(id);
    expect(visible).toMatchObject({ currentDamaged:true, previousDamaged:false, headRevision:inspected.headRevision });
    expect(visible.current).toBeUndefined();
    await expect(corruptCurrent.loadSelected(inspected.current!.selection)).rejects.toMatchObject({ code:'integrity' });
    await expect(corruptCurrent.loadSelected(visible.previous!.selection)).resolves.toEqual(JSON.parse(encodeWorldSave(first)).world);
    await expect(corruptCurrent.save(id,'accidental replacement',second,inspected.headRevision)).rejects.toMatchObject({ code:'integrity' });

    const corruptPrevious = createSaveStore({ ...backend, read: async key => ({ ...(await backend.read(key)), previous:foreign }) });
    expect(await corruptPrevious.inspect(id)).toMatchObject({ previousDamaged:true, currentDamaged:false });
    await expect(corruptPrevious.loadSelected(inspected.previous!.selection)).rejects.toMatchObject({ code:'integrity' });
    await expect(writer.loadSelected({ ...inspected.previous!.selection, sourceBranch:{ branchId:'main' } }))
      .rejects.toMatchObject({ code:'slot_conflict' });
    await expect(writer.loadSelected({ ...inspected.previous!.selection, formatVersion: 2 as 1 }))
      .rejects.toMatchObject({ code:'integrity' });
  });

  it('promotes raw v1 legacy bytes to a checked previous record without inventing branch or profile metadata', async () => {
    const base = createMemorySaveBackend();
    const world = createInitialWorld(9,'spirit-bloom');
    const content = encodeWorldSave(world);
    const summary = { id:'v1', label:'旧格式', savedAt:5, tick:world.tick, year:world.year, month:world.month, seed:9 };
    let raw: Awaited<ReturnType<typeof base.read>> = { current:{ summary,content },index:summary,previous:undefined };
    const store = createSaveStore({ ...base, read: async () => structuredClone(raw), commit: async change => {
      if (change.kind !== 'write') throw new Error('unexpected delete');
      raw = { current:change.current, previous:change.previous, index:{ ...change.current.summary,revision:change.current.journal.revision } };
    } });
    const legacy = await store.inspect('v1');
    expect(legacy.current?.selection.sourceBranch).toBeUndefined();
    expect(legacy.headRevision).toMatch(/^legacy:/);
    await store.save('v1','new format metadata',createInitialWorld(10),legacy.headRevision,{branchId:'main'});
    const inspected = await store.inspect('v1');
    expect(inspected.previous?.selection).toMatchObject({ revision:legacy.headRevision,formatVersion:1 });
    expect(inspected.previous?.selection.sourceBranch).toBeUndefined();
    expect(inspected.previous?.summary.profileId).toBeUndefined();
    expect(raw.previous).toMatchObject({ content });
    expect((await store.loadSelected(inspected.previous!.selection)).worldgen?.profileId).toBe('spirit-bloom');
  });
});

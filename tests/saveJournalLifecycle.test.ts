import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createMemorySaveBackend, createSaveStore, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '固定回放。' };
function progress(from: WorldState, tick: number): WorldState {
  let world = from;
  while (world.tick < tick) {
    world = advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, rest])), () => .99);
  }
  return world;
}

describe('explicit journal restore and unchanged canonical replay', () => {
  it('loads only a reviewed recovery point, reproduces later progress, and refuses a stale choice without modifying either copy', async () => {
    const backend = createMemorySaveBackend();
    const firstTab = createSaveStore(backend, () => 30);
    const secondTab = createSaveStore(backend, () => 30);
    const start = createInitialWorld(15009);
    const twelve = progress(start, 12);
    const sixteen = progress(twelve, 16);
    const origin = { branchId: 'main', label: '原始时间线', timelineId: 'fixture-generation-a' };
    const branch = { branchId: 'branch-1', label: '另选时间线', timelineId: 'fixture-generation-a' };
    await firstTab.save('slot-1', '十二月副本', twelve, null, origin);
    const reviewed = await secondTab.inspect('slot-1');
    expect(reviewed.current?.summary.tick).toBe(12);
    expect(reviewed.previous).toBeUndefined();
    await firstTab.save('slot-1', '继续到十六', sixteen, reviewed.headRevision, branch);

    const inspected = await secondTab.inspect('slot-1');
    expect(inspected.current?.selection.sourceBranch).toEqual(branch);
    expect(inspected.previous?.selection.sourceBranch).toEqual(origin);
    const oldPoint = inspected.previous!.selection;
    const chosen = await secondTab.loadSelected(oldPoint);
    expect(chosen.tick).toBe(12);
    expect(encodeWorldSave(progress(chosen, 16))).toBe(encodeWorldSave(sixteen));
    expect((await firstTab.inspect('slot-1')).current?.summary.tick).toBe(16);
    expect(start.tick).toBe(1);
    await expect(secondTab.loadSelected({ ...oldPoint, sourceBranch: branch })).rejects.toBeDefined();

    const eighteen = progress(sixteen, 18);
    await firstTab.save('slot-1', '继续到十八', eighteen, inspected.headRevision, branch);
    const fresh = await secondTab.inspect('slot-1');
    await expect(secondTab.loadSelected(oldPoint)).rejects.toMatchObject({ code: 'slot_conflict' });
    expect((await secondTab.inspect('slot-1'))).toEqual(fresh);
    expect(fresh.current?.summary.tick).toBe(18);
    expect(fresh.previous?.summary.tick).toBe(16);
  });
});

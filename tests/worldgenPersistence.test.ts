import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildWorldAnalytics } from '../src/engine/analyticsEngine';
import { createMemorySaveBackend, createSaveStore, decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { createTimeline, recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';

const testSeed = 37;

describe('world origin preservation and isolation', () => {
  it('preserves provenance through intervention, simulation, and reload instead of recertifying current resources', () => {
    const initial = createInitialWorld(testSeed, 'spirit-bloom');
    const changed = executeGodIntervention(initial, { type: 'SPAWN_TREASURE', targetLocationId: initial.locations[0].id });
    expect(changed.interventionSequence).toBe(initial.interventionSequence + 1);
    expect(changed.locations[0].spiritQi).toBeGreaterThan(initial.locations[0].spiritQi);
    const next = advanceWorldTick(changed, {}, () => .99);
    expect(next.worldgen).toBeDefined();
    expect(next.worldgen).toEqual(initial.worldgen);
    expect(decodeWorldSave(encodeWorldSave(next)).worldgen).toEqual(initial.worldgen);

    const tampered = structuredClone(next);
    tampered.worldgen!.seed++;
    expect(() => encodeWorldSave(tampered)).toThrow(/worldgen.references/);
    tampered.worldgen!.seed = testSeed;
    tampered.worldgen!.resources.push({ ...tampered.worldgen!.resources[0] });
    expect(() => encodeWorldSave(tampered)).toThrow(/worldgen.resources.actorId/);
  });

  it('keeps same-seed profiles out of each other’s branches and analytics cohorts', () => {
    const lush = createInitialWorld(testSeed, 'spirit-bloom');
    const scarce = createInitialWorld(testSeed, 'fractured-frontier');
    const later = advanceWorldTick(lush, {}, () => .99);
    const earlier = createTimeline(lush);
    expect(sameGeneratedWorld(lush, scarce)).toBe(false);
    expect(recordTimelineWorld(earlier, scarce)).toBe(earlier);
    expect(recordTimelineWorld(earlier, later)).not.toBe(earlier);
    const analytics = buildWorldAnalytics(later, [{ tick: 1, world: scarce }]);
    expect(analytics.coverage.snapshotCount).toBe(1);
    expect(buildWorldAnalytics(later, [{ tick: 1, world: lush }]).coverage.snapshotCount).toBe(2);
  });

  it('records profile in a save slot and keeps a legacy classic snapshot readable without inventing a certificate', async () => {
    const classic = createInitialWorld(testSeed);
    const { worldgen: _birth, ...legacyData } = classic;
    const legacy = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacyData }));
    const frontier = createInitialWorld(testSeed, 'fractured-frontier');
    expect(legacy.worldgen).toBeUndefined();
    expect(sameGeneratedWorld(legacy, classic)).toBe(true);
    const store = createSaveStore(createMemorySaveBackend(), () => 7);
    await store.save('old', '旧档', legacy);
    await store.save('new', '新档', frontier);
    expect(await store.list()).toMatchObject([{ id: 'new', seed: testSeed, profileId: 'fractured-frontier' }, { id: 'old', seed: testSeed }]);
    expect((await store.load('old')).worldgen).toBeUndefined();
    expect((await store.load('new')).worldgen).toEqual(frontier.worldgen);
  });
});

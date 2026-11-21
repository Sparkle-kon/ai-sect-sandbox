import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyAnnotation, bookmarkableEvent, visibleMapAnnotations } from '../src/engine/annotationsEngine';
import { queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld, selectTimelineBranch } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';

const edit = (world: WorldState, actorId: string, command: Parameters<typeof applyAnnotation>[2]) => {
  const result = applyAnnotation(world, actorId, command);
  if (!result.ok) throw new Error(`fixture annotation rejected: ${result.code}`);
  return result.world;
};
afterEach(() => vi.unstubAllGlobals());

describe('timeline-scoped personal annotations', () => {
  it('updates a single head snapshot and forks only the annotations already present at the historical point', () => {
    const world = createInitialWorld(32);
    const actor = world.cultivators[0];
    const initialSite = world.locations.find(({ id }) => id === actor.locationId)!;
    const original = createTimeline(world);
    const bookmark = edit(world, actor.id, { kind: 'add_bookmark', eventId: world.events[0].id });
    const annotated = edit(bookmark, actor.id, { kind: 'add_note', target: { kind: 'site', locationId: initialSite.id }, text: '分支前批注' });
    expect(annotated.tick).toBe(world.tick);
    expect(annotated.random).toEqual(world.random);
    expect(annotated.interventionSequence).toBe(world.interventionSequence);
    expect(world.annotations.notes).toEqual([]);
    const first = recordTimelineWorld(original, annotated, original.activeBranchId);
    expect(first.branches[0].snapshots).toHaveLength(1);
    const tickTwo = advanceWorldTick(annotated);
    const later = edit(tickTwo, actor.id, { kind: 'edit_note', noteId: annotated.annotations.notes[0].id, text: '主线未来私注' });
    const second = recordTimelineWorld(first, later);
    const branch = forkTimeline(second, 1, { type: 'SPAWN_TREASURE', targetLocationId: initialSite.id }, '批注分支');
    const branchHead = readTimelineHead(branch)!;
    expect(branchHead.annotations.notes.map(({ text }) => text)).toEqual(['分支前批注']);
    expect(branchHead.annotations.bookmarks).toEqual(annotated.annotations.bookmarks);
    expect(readTimelineSnapshot(second, 1)?.annotations.notes[0].text).toBe('分支前批注');
    expect(readTimelineHead(selectTimelineBranch(branch, 'main'))?.annotations.notes[0].text).toBe('主线未来私注');
    expect(recordTimelineWorld(branch, later, 'main')).toBe(branch);
    expect(decodeWorldSave(encodeWorldSave(branchHead)).annotations).toEqual(branchHead.annotations);
  });

  it('keeps local map note text out of the model request, and old saves receive no fabricated notes', async () => {
    const world = createInitialWorld(32);
    const actor = world.cultivators[0];
    const localText = 'PRIVATE-ANNOTATION-SENTINEL';
    const updated = edit(world, actor.id, { kind: 'add_note', target: { kind: 'site', locationId: actor.locationId }, text: localText });
    const model = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain(localText);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ chosenAction: 'REST', innerMonologue: '静息' }) } }] }));
    });
    vi.stubGlobal('fetch', model);
    const source = vi.fn();
    const target = updated.cultivators.find(({ id }) => id === actor.id)!;
    await queryCultivatorLLMDecision(target, updated, { enabled: true, apiBaseUrl: 'https://provider.invalid/v1',
      apiKey: 'fixture-only', model: 'fixture' }, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toHaveBeenCalledTimes(1);
    const { annotations: empty, ...legacy } = world;
    const loaded = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(loaded.annotations).toEqual(empty);
  });

  it('round-trips a note about a removed site while pinning only the genuinely known historical tile', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    const site = world.locations.find(({ id }) => id === actor.locationId)!;
    const temporary = { ...structuredClone(site), id: 'fixture-closed-pavilions', name: '曾经开放的山居' };
    world.locations.push(temporary);
    const annotated = edit(world, actor.id, { kind: 'add_note', target: { kind: 'site', locationId: temporary.id }, text: '记录关闭以前' });
    annotated.locations = annotated.locations.filter(({ id }) => id !== temporary.id);
    const restored = decodeWorldSave(encodeWorldSave(annotated));
    const pins = visibleMapAnnotations(restored, actor.id);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ historical: true, note: { text: '记录关闭以前',
      target: { kind: 'site', locationId: temporary.id, siteName: temporary.name } } });
    expect(restored.locations.some(({ id }) => id === temporary.id)).toBe(false);
  });

  it('rejects a recorded private event even when its public anchor is available', () => {
    const world = createInitialWorld();
    const event = world.events[0];
    expect(bookmarkableEvent(world, event.id)).toBeDefined();
    const actor = world.cultivators[0];
    const added = edit(world, actor.id, { kind: 'add_bookmark', eventId: event.id });
    const corrupted = structuredClone(added);
    corrupted.events[0].witnessScope = 'participants';
    expect(bookmarkableEvent(corrupted, event.id)).toBeUndefined();
    expect(() => encodeWorldSave(corrupted)).toThrow(/annotations.bookmarks.references/);
  });
});

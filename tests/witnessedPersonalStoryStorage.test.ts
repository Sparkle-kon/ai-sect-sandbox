import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWitnessedPersonalStory, projectWitnessedPersonalStory, WITNESSED_PERSONAL_STORY_TICKS } from '../src/engine/witnessedPersonalStory';
import type { WorldState } from '../src/types/world';
import { playWitnessedPersonalScene, witnessedPersonalStoryFixture } from './fixtures/witnessedPersonalStoryFixture';

function change(raw: string, edit: (world: WorldState) => void) {
  const parsed: { world: WorldState } = JSON.parse(raw);
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('the personal reading ledger stores exact firsthand references only', () => {
  it('migrates an old world without manufacturing evidence from its existing public rumors', () => {
    const old: { world: Partial<WorldState> } = JSON.parse(encodeWorldSave(createInitialWorld(9)));
    delete old.world.witnessedPersonalStory;
    expect(decodeWorldSave(JSON.stringify(old)).witnessedPersonalStory).toEqual({ scenes: [] });
    const f = witnessedPersonalStoryFixture();
    const scene = playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    const decoded = decodeWorldSave(encodeWorldSave(scene.world));
    expect(projectWitnessedPersonalStory(decoded,f.observerId)?.scenes.map(({ eventId }) => eventId)).toEqual([scene.event.id]);
    expect(projectWitnessedPersonalStory(decoded,f.remoteId)?.scenes).toEqual([]);
    const proof = decoded.witnessedPersonalStory.scenes.find(({ eventId }) => eventId === scene.event.id);
    expect(proof).toBeDefined();
    expect(Object.keys(proof!).sort()).toEqual(['actorIds','eventId','kind','month','siteId','tick','witnessIds','year']);
  });

  it('rejects fabricated witnesses, swapped original roles, moved site and private same-ID records', () => {
    const f = witnessedPersonalStoryFixture();const scene = playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    const raw = encodeWorldSave(scene.world);
    expect(change(raw,(s)=>{s.witnessedPersonalStory.scenes[0].witnessIds.push('unregistered-witness');}))
      .toThrow('witnessedPersonalStory.scenes.source');
    expect(change(raw,(s)=>{s.witnessedPersonalStory.scenes[0].actorIds.reverse();}))
      .toThrow('witnessedPersonalStory.scenes.native');
    expect(change(raw,(s)=>{s.witnessedPersonalStory.scenes[0].siteId = f.otherSiteId;}))
      .toThrow('witnessedPersonalStory.scenes.native');
    expect(change(raw,(s)=>{s.events.find(({ id }) => id === scene.event.id)!.witnessScope = 'participants';}))
      .toThrow('witnessedPersonalStory.scenes.native');
  });

  it('loads a forward-seek save without exposing its expired witnesses and prunes them on advance', () => {
    const f = witnessedPersonalStoryFixture(), scene = playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    scene.world.tick += WITNESSED_PERSONAL_STORY_TICKS + 1;
    const decoded = decodeWorldSave(encodeWorldSave(scene.world));
    expect(decoded.events.some(({ id }) => id === scene.event.id)).toBe(true);
    expect(decoded.witnessedPersonalStory.scenes.some(({ eventId }) => eventId === scene.event.id)).toBe(true);
    expect(projectWitnessedPersonalStory(decoded,f.observerId)?.scenes).toEqual([]);
    advanceWitnessedPersonalStory(decoded);
    expect(decoded.witnessedPersonalStory.scenes).toEqual([]);
  });

  it('never reconstructs a displaced source from its witness-only index', () => {
    const f = witnessedPersonalStoryFixture(), scene = playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    scene.world.events = scene.world.events.filter(({ id }) => id !== scene.event.id);
    const decoded = decodeWorldSave(encodeWorldSave(scene.world));
    expect(decoded.witnessedPersonalStory.scenes.some(({ eventId }) => eventId === scene.event.id)).toBe(true);
    expect(projectWitnessedPersonalStory(decoded,f.observerId)?.scenes).toEqual([]);
  });
});
